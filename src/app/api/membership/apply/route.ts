import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import {
  ADD_ON_CATEGORY_KEYS,
  ApplicationPayload,
  BANK_DETAILS,
  MAX_MEMBERS,
  PARTNER_CATEGORY_KEYS,
  RELATIONSHIPS,
  SECTIONS,
} from '@/lib/membershipForm';
import { formatRand } from '@/lib/membershipPricing';
import {
  emailRe,
  esc,
  escapeLike,
  pickYear,
  popProblem,
  removePop,
  serviceClient,
  uploadPop,
} from '@/lib/membershipServer';

export const runtime = 'nodejs';

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const db = serviceClient();
  if (!db) return fail('The server is not configured.', 500);

  let newPath: string | null = null; // a proof of payment uploaded by THIS request

  try {
    const form = await req.formData();
    const raw = form.get('payload');
    if (typeof raw !== 'string' || raw.length > 200_000) return fail('Missing or oversized application data.');

    let p: ApplicationPayload;
    try {
      p = JSON.parse(raw) as ApplicationPayload;
    } catch {
      return fail('Application data could not be read.');
    }

    // Spam trap: real people leave this empty
    if (p.website) return NextResponse.json({ reference: 'OK', total: 0 });

    // ----- Draft being submitted (optional) -----
    const tokenIn = form.get('token');
    const token = typeof tokenIn === 'string' && UUID_RE.test(tokenIn) ? tokenIn : null;
    let draft: { id: string; year: number; pop_url: string | null; draft_expires_at: string | null } | null = null;
    if (token) {
      const { data } = await db
        .from('membership_applications')
        .select('id, year, status, pop_url, draft_expires_at')
        .eq('resume_token', token)
        .maybeSingle();
      if (!data || data.status !== 'draft') {
        return fail('This saved application is no longer available. Please start a new application.', 410);
      }
      if (data.draft_expires_at && new Date(data.draft_expires_at) < new Date()) {
        return fail('This saved application has expired. Please start a new application.', 410);
      }
      draft = data;
    }

    // ----- Validate -----
    const email = (p.email ?? '').trim().toLowerCase();
    const required: [string, string][] = [
      ['surname', 'Surname'],
      ['first_name', 'Name'],
      ['id_number', 'ID number'],
      ['mobile', 'Mobile number'],
      ['postal_address', 'Postal address'],
      ['emergency_name', 'Emergency contact name'],
      ['emergency_phone', 'Emergency contact number'],
    ];
    for (const [key, label] of required) {
      if (!String((p as unknown as Record<string, unknown>)[key] ?? '').trim()) return fail(`${label} is required.`);
    }
    if (!emailRe.test(email)) return fail('Enter a valid email address.');
    if (p.application_type !== 'new' && p.application_type !== 'renew') return fail('Choose New or Renewal.');
    if (!p.waiver_accepted || !String(p.waiver_name ?? '').trim()) {
      return fail('Accept the waiver and indemnity and type your full name.');
    }
    if (p.is_minor && !String(p.guardian_name ?? '').trim()) {
      return fail('Enter the parent or guardian name for a minor.');
    }
    if (!p.main_category) return fail('Choose your membership category.');

    // ----- Proof of payment is mandatory -----
    const pop = form.get('pop');
    if (pop instanceof File && pop.size > 0) {
      const problem = popProblem(pop);
      if (problem) return fail(problem);
    } else if (!draft?.pop_url) {
      return fail('Attach your proof of payment to submit your application. You can save it and come back later.');
    }

    // ----- Year and prices (always from the database, never from the browser) -----
    const year = draft ? draft.year : await pickYear(db);
    if (!year) return fail('Membership prices are not available right now.', 500);

    const { data: priceRows, error: priceErr } = await db
      .from('membership_prices')
      .select('id, category_key, label, price, price_group')
      .eq('year', year)
      .eq('active', true);
    if (priceErr || !priceRows) return fail('Membership prices are not available right now.', 500);
    const byKey = new Map(priceRows.map((r) => [r.category_key as string, r]));

    const main = byKey.get(p.main_category);
    if (!main || main.price_group !== 'membership' || ADD_ON_CATEGORY_KEYS.includes(p.main_category)) {
      return fail('The selected membership category is not available.');
    }
    let membershipTotal = Number(main.price);
    const labelParts: string[] = [String(main.label)];

    if (p.replacement_book) {
      const book = byKey.get('replacement_book');
      if (!book) return fail('The replacement book is not available.');
      membershipTotal += Number(book.price);
      labelParts.push(String(book.label));
    }

    let lounge: { id: string; label: string; price: number } | null = null;
    if (p.lounge_key) {
      const row = byKey.get(p.lounge_key);
      if (!row || row.price_group !== 'lounge') return fail('The selected lounge option is not available.');
      lounge = { id: row.id as string, label: String(row.label), price: Number(row.price) };
    }

    // ----- Partner and junior members -----
    const submitted = Array.isArray(p.members) ? p.members : [];
    if (submitted.length > MAX_MEMBERS) return fail(`You can add up to ${MAX_MEMBERS} members.`);

    const hasPartnerCategory = PARTNER_CATEGORY_KEYS.includes(p.main_category);
    const nowIso = new Date().toISOString();
    let membersTotal = 0;
    let partnerCount = 0;
    const members: Record<string, unknown>[] = [];

    for (const [i, m] of submitted.entries()) {
      const rel = RELATIONSHIPS.find((r) => r.key === m.relationship);
      if (!rel) return fail(`Member ${i + 1}: choose a relationship.`);
      const name = String(m.name ?? '').trim().slice(0, 120);
      const idNo = String(m.id_no ?? '').trim().slice(0, 40);
      if (!name) return fail(`Member ${i + 1}: enter a name and surname.`);
      if (!idNo) return fail(`${name}: enter an ID number.`);
      if (!m.waiver_accepted || !String(m.waiver_name ?? '').trim()) {
        return fail(`${name}: accept the waiver and indemnity and type a full name to sign.`);
      }

      let cost = 0;
      let roleLabel: string = rel.label;
      if (rel.priceKey === null) {
        partnerCount += 1;
      } else {
        const row = byKey.get(rel.priceKey);
        if (!row) return fail(`${rel.label} is not available right now.`);
        cost = Number(row.price);
        roleLabel = String(row.label);
      }
      membersTotal += cost;

      members.push({
        relationship: rel.key,
        role: roleLabel,
        name,
        id_no: idNo,
        email: String(m.email ?? '').trim().slice(0, 120),
        cell: String(m.cell ?? '').trim().slice(0, 40),
        cost,
        minor: rel.minor,
        waiver_accepted: true,
        waiver_name: String(m.waiver_name).trim().slice(0, 150),
        waiver_accepted_at: nowIso,
      });
    }

    if (partnerCount > 1) return fail('Only one partner can be added.');
    if (partnerCount === 1 && !hasPartnerCategory) {
      return fail('To add a partner, choose a Member + Partner, Pensioner + Partner or Country + Partner category.');
    }
    if (partnerCount === 0 && hasPartnerCategory) {
      return fail('Enter your partner details for the category you selected.');
    }

    const total = Math.round((membershipTotal + membersTotal + (lounge?.price ?? 0)) * 100) / 100;

    const sections = (Array.isArray(p.sections) ? p.sections : []).filter((s) =>
      (SECTIONS as readonly string[]).includes(s)
    );

    // ----- Upload the proof of payment (after validation, so nothing is orphaned) -----
    if (pop instanceof File && pop.size > 0) {
      const up = await uploadPop(db, pop);
      if ('error' in up) return fail(up.error, 500);
      newPath = up.path;
    }
    const popPath = newPath ?? draft?.pop_url ?? null;

    // ----- Renewal matching, by email only -----
    const { data: existing } = await db
      .from('membership_applications')
      .select('member_no')
      .ilike('email', escapeLike(email))
      .eq('status', 'approved')
      .not('member_no', 'is', null)
      .order('approved_at', { ascending: false })
      .limit(1);
    const matched = !!existing?.length;

    let flagged = false;
    let flagReason: string | null = null;
    if (p.application_type === 'renew' && !matched) {
      flagged = true;
      flagReason = 'Renewal, but this email is not among approved members. Check the member records.';
    } else if (p.application_type === 'new' && matched) {
      flagged = true;
      flagReason = `Marked as new, but this email already belongs to member ${existing![0].member_no}.`;
    }

    // ----- Save -----
    const t = (v: unknown, max = 200) => {
      const s = String(v ?? '').trim().slice(0, max);
      return s || null;
    };

    const row = {
      year,
      application_type: p.application_type,
      status: 'submitted',
      surname: t(p.surname, 100),
      first_name: t(p.first_name, 100),
      id_number: t(p.id_number, 40),
      email,
      mobile: t(p.mobile, 40),
      tel_home: t(p.tel_home, 40),
      tel_work: t(p.tel_work, 40),
      fax: t(p.fax, 40),
      employer: t(p.employer),
      occupation: t(p.occupation),
      postal_address: t(p.postal_address, 400),
      physical_address: t(p.physical_address, 400),
      category_id: main.id as string,
      category_label: labelParts.join(', '),
      category_price: membershipTotal,
      lounge_id: lounge?.id ?? null,
      lounge_label: lounge?.label ?? null,
      lounge_price: lounge?.price ?? null,
      total_due: total,
      partners: members,
      sections,
      consent_email: !!p.consent_email,
      consent_mobile: !!p.consent_mobile,
      consent_newsletter: !!p.consent_newsletter,
      waiver_accepted: true,
      waiver_name: t(p.waiver_name, 150),
      waiver_accepted_at: nowIso,
      emergency_name: t(p.emergency_name, 100),
      emergency_phone: t(p.emergency_phone, 40),
      guardian_name: p.is_minor ? t(p.guardian_name, 150) : null,
      pop_url: popPath,
      renew_matched: p.application_type === 'renew' ? matched : null,
      flagged,
      flag_reason: flagReason,
    };

    let appId: string;
    if (draft) {
      const { error } = await db
        .from('membership_applications')
        .update({
          ...row,
          created_at: nowIso, // shows as received when it was submitted
          resume_token: null,
          draft_payload: null,
          draft_saved_at: null,
          draft_expires_at: null,
        })
        .eq('id', draft.id)
        .eq('status', 'draft');
      if (error) {
        if (newPath) await removePop(db, newPath);
        return fail(`Your application could not be saved: ${error.message}`, 500);
      }
      appId = draft.id;
      if (newPath && draft.pop_url) await removePop(db, draft.pop_url);
    } else {
      const { data: inserted, error } = await db.from('membership_applications').insert(row).select('id').single();
      if (error || !inserted) {
        if (newPath) await removePop(db, newPath);
        return fail(`Your application could not be saved: ${error?.message ?? 'unknown error'}`, 500);
      }
      appId = inserted.id as string;
    }

    newPath = null; // saved: the file is now referenced by the application

    const reference = String(appId).slice(0, 8).toUpperCase();
    const fullName = `${p.first_name.trim()} ${p.surname.trim()}`;

    // ----- Emails (a failure here never loses the application) -----
    const from = process.env.EMAIL_FROM ?? 'Western Province Motor Club <mailer@wpmconline.co.za>';
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const memberLines = members
        .map(
          (m) =>
            `<tr><td style="padding:2px 12px 2px 0;">${esc(m.name)}</td><td style="padding:2px 12px 2px 0;color:#6a6d70;">${esc(
              m.role
            )}</td><td style="text-align:right;">${Number(m.cost) > 0 ? esc(formatRand(Number(m.cost))) : 'Included'}</td></tr>`
        )
        .join('');

      const summaryRows = [
        ['Application', p.application_type === 'renew' ? 'Renewal' : 'New membership'],
        ['Year', String(year)],
        ['Category', labelParts.join(', ')],
        ...(lounge ? [['Pheiffer Lounge', lounge.label]] : []),
      ]
        .map(([k, v]) => `<tr><td style="padding:4px 0;color:#6a6d70;">${esc(k)}:</td><td>${esc(v)}</td></tr>`)
        .join('');

      const applicantHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:#354a5f;color:#fff;padding:20px;">
            <div style="font-size:18px;font-weight:bold;">Western Province Motor Club</div>
            <div style="font-size:13px;opacity:0.85;">Membership application received</div>
          </div>
          <div style="padding:24px;border:1px solid #d9d9d9;border-top:none;">
            <p>Dear ${esc(fullName)},</p>
            <p>Thank you for applying. We have received your application and proof of payment, reference <strong>${esc(
              reference
            )}</strong>.</p>
            <div style="background:#f7f7f7;border:1px solid #d9d9d9;padding:16px;margin:20px 0;">
              <table style="width:100%;font-size:14px;">${summaryRows}</table>
              ${
                members.length
                  ? `<div style="font-size:12px;color:#6a6d70;margin-top:10px;">Partner and junior members</div><table style="width:100%;font-size:14px;">${memberLines}</table>`
                  : ''
              }
            </div>
            <div style="background:#f1f6fb;border:1px solid #c5d8ea;padding:16px;margin:20px 0;text-align:center;">
              <div style="font-size:12px;color:#346187;font-weight:bold;">TOTAL DUE</div>
              <div style="font-size:26px;font-weight:bold;margin:4px 0;">${esc(formatRand(total))}</div>
            </div>
            <p style="font-size:13px;color:#6a6d70;">If you have not paid yet, pay by EFT to ${esc(BANK_DETAILS.bank)}, ${esc(
              BANK_DETAILS.branchName
            )}, account ${esc(BANK_DETAILS.accountNo)}, branch code ${esc(BANK_DETAILS.branchCode)}, reference ${esc(
              `${p.surname.trim()} ${reference}`
            )}.</p>
            <p style="font-size:13px;color:#6a6d70;">Once your payment is confirmed and your membership is approved, we will email you your membership number.</p>
          </div>
        </div>`;

      const clubTo = (process.env.MEMBERSHIP_TO ?? process.env.DIGEST_TO ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const clubHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px;">
          <p><strong>New membership application ${esc(reference)}</strong></p>
          <p>${esc(fullName)} (${esc(email)}) applied for ${esc(labelParts.join(', '))}${
            lounge ? ` plus ${esc(lounge.label)}` : ''
          }${members.length ? `, with ${members.length} partner or junior member${members.length > 1 ? 's' : ''}` : ''}. Total ${esc(
            formatRand(total)
          )}. Proof of payment attached.</p>
          ${flagged ? `<p style="color:#bb0000;"><strong>Flagged:</strong> ${esc(flagReason)}</p>` : ''}
          <p style="color:#6a6d70;font-size:13px;">Review it in the admin area under Membership Applications.</p>
        </div>`;

      try {
        await resend.emails.send({
          from,
          to: email,
          subject: `Membership application received (${reference})`,
          html: applicantHtml,
        });
      } catch (e) {
        console.error('Applicant email failed', e);
      }
      if (clubTo.length > 0) {
        try {
          await resend.emails.send({
            from,
            to: clubTo,
            subject: `New membership application ${reference}${flagged ? ' (flagged)' : ''}`,
            html: clubHtml,
          });
        } catch (e) {
          console.error('Club email failed', e);
        }
      }
    }

    return NextResponse.json({ reference, total });
  } catch (err) {
    if (newPath) await removePop(db, newPath);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
