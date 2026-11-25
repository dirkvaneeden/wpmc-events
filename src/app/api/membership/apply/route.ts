import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import {
  ApplicationPayload,
  BANK_DETAILS,
  MAX_POP_BYTES,
  MAX_QTY,
  PARTNER_CATEGORY_KEYS,
  SECTIONS,
} from '@/lib/membershipForm';
import { formatRand } from '@/lib/membershipPricing';

export const runtime = 'nodejs';

const BUCKET = 'membership-documents';

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) return fail('The server is not configured.', 500);

  let uploadedPath: string | null = null;
  const db = createClient(supabaseUrl, serviceKey);

  try {
    const form = await req.formData();
    const raw = form.get('payload');
    if (typeof raw !== 'string') return fail('Missing application data.');

    let p: ApplicationPayload;
    try {
      p = JSON.parse(raw) as ApplicationPayload;
    } catch {
      return fail('Application data could not be read.');
    }

    // Spam trap: real people leave this empty
    if (p.website) return NextResponse.json({ reference: 'OK', total: 0 });

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
    if (!Array.isArray(p.categories) || p.categories.length === 0) {
      return fail('Choose at least one membership category.');
    }

    // ----- Year and prices (always taken from the database, never from the browser) -----
    const { data: yearRows, error: yearErr } = await db
      .from('membership_years')
      .select('year')
      .order('year', { ascending: false });
    if (yearErr || !yearRows?.length) return fail('Membership prices are not available right now.', 500);
    const thisYear = new Date().getFullYear();
    const year = yearRows.some((y) => y.year === thisYear) ? thisYear : yearRows[0].year;

    const { data: priceRows, error: priceErr } = await db
      .from('membership_prices')
      .select('id, category_key, label, price, price_group')
      .eq('year', year)
      .eq('active', true);
    if (priceErr || !priceRows) return fail('Membership prices are not available right now.', 500);
    const byKey = new Map(priceRows.map((r) => [r.category_key as string, r]));

    let membershipTotal = 0;
    const labelParts: string[] = [];
    let firstCategoryId: string | null = null;
    let needsPartner = false;
    const seen = new Set<string>();
    for (const c of p.categories) {
      const row = byKey.get(c.key);
      if (!row || row.price_group !== 'membership') return fail('One of the selected categories is not available.');
      if (seen.has(c.key)) return fail('A category was selected twice.');
      seen.add(c.key);
      const maxQty = MAX_QTY[c.key] ?? 1;
      const qty = Math.floor(Number(c.qty));
      if (!qty || qty < 1 || qty > maxQty) return fail('Invalid quantity for a category.');
      membershipTotal += Number(row.price) * qty;
      labelParts.push(qty > 1 ? `${row.label} x${qty}` : String(row.label));
      if (!firstCategoryId) firstCategoryId = row.id as string;
      if (PARTNER_CATEGORY_KEYS.includes(c.key)) needsPartner = true;
    }

    let lounge: { id: string; label: string; price: number } | null = null;
    if (p.lounge_key) {
      const row = byKey.get(p.lounge_key);
      if (!row || row.price_group !== 'lounge') return fail('The selected lounge option is not available.');
      lounge = { id: row.id as string, label: String(row.label), price: Number(row.price) };
    }
    const total = Math.round((membershipTotal + (lounge?.price ?? 0)) * 100) / 100;

    // Partner and junior members
    const partners = (Array.isArray(p.partners) ? p.partners : [])
      .map((x) => ({
        role: String(x.role ?? '').slice(0, 40),
        name: String(x.name ?? '').trim().slice(0, 120),
        id_no: String(x.id_no ?? '').trim().slice(0, 40),
        email: String(x.email ?? '').trim().slice(0, 120),
        cell: String(x.cell ?? '').trim().slice(0, 40),
      }))
      .filter((x) => x.name);
    if (needsPartner && !partners.some((x) => x.role === 'Partner')) {
      return fail('Enter your partner details for the category you selected.');
    }

    const sections = (Array.isArray(p.sections) ? p.sections : []).filter((s) =>
      (SECTIONS as readonly string[]).includes(s)
    );

    // ----- Proof of payment (optional) -----
    const pop = form.get('pop');
    if (pop instanceof File && pop.size > 0) {
      if (pop.size > MAX_POP_BYTES) return fail('The proof of payment must be smaller than 4 MB.');
      const okType = pop.type === 'application/pdf' || pop.type.startsWith('image/');
      if (!okType) return fail('The proof of payment must be a PDF or an image.');
      const ext = (pop.name.split('.').pop() ?? 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin';
      uploadedPath = `pop/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await db.storage
        .from(BUCKET)
        .upload(uploadedPath, Buffer.from(await pop.arrayBuffer()), { contentType: pop.type, upsert: false });
      if (upErr) {
        uploadedPath = null;
        return fail(`The proof of payment could not be uploaded: ${upErr.message}`, 500);
      }
    }

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

    const { data: inserted, error: insErr } = await db
      .from('membership_applications')
      .insert({
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
        category_id: firstCategoryId,
        category_label: labelParts.join(', '),
        category_price: membershipTotal,
        lounge_id: lounge?.id ?? null,
        lounge_label: lounge?.label ?? null,
        lounge_price: lounge?.price ?? null,
        total_due: total,
        partners,
        sections,
        consent_email: !!p.consent_email,
        consent_mobile: !!p.consent_mobile,
        consent_newsletter: !!p.consent_newsletter,
        waiver_accepted: true,
        waiver_name: t(p.waiver_name, 150),
        waiver_accepted_at: new Date().toISOString(),
        emergency_name: t(p.emergency_name, 100),
        emergency_phone: t(p.emergency_phone, 40),
        guardian_name: p.is_minor ? t(p.guardian_name, 150) : null,
        pop_url: uploadedPath,
        renew_matched: p.application_type === 'renew' ? matched : null,
        flagged,
        flag_reason: flagReason,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      if (uploadedPath) await db.storage.from(BUCKET).remove([uploadedPath]);
      return fail(`Your application could not be saved: ${insErr?.message ?? 'unknown error'}`, 500);
    }

    const reference = String(inserted.id).slice(0, 8).toUpperCase();
    const fullName = `${p.first_name.trim()} ${p.surname.trim()}`;

    // ----- Emails (a failure here never loses the application) -----
    const from = process.env.EMAIL_FROM ?? 'Western Province Motor Club <mailer@wpmconline.co.za>';
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const summaryRows = [
        ['Application', p.application_type === 'renew' ? 'Renewal' : 'New membership'],
        ['Year', String(year)],
        ['Category', labelParts.join(', ')],
        ...(lounge ? [['Pheiffer Lounge', lounge.label]] : []),
      ]
        .map(
          ([k, v]) =>
            `<tr><td style="padding:4px 0;color:#6a6d70;">${esc(k)}:</td><td>${esc(v)}</td></tr>`
        )
        .join('');

      const applicantHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:#354a5f;color:#fff;padding:20px;">
            <div style="font-size:18px;font-weight:bold;">Western Province Motor Club</div>
            <div style="font-size:13px;opacity:0.85;">Membership application received</div>
          </div>
          <div style="padding:24px;border:1px solid #d9d9d9;border-top:none;">
            <p>Dear ${esc(fullName)},</p>
            <p>Thank you for applying. We have received your application, reference <strong>${esc(reference)}</strong>.</p>
            <div style="background:#f7f7f7;border:1px solid #d9d9d9;padding:16px;margin:20px 0;">
              <table style="width:100%;font-size:14px;">${summaryRows}</table>
            </div>
            <div style="background:#f1f6fb;border:1px solid #c5d8ea;padding:16px;margin:20px 0;text-align:center;">
              <div style="font-size:12px;color:#346187;font-weight:bold;">TOTAL DUE</div>
              <div style="font-size:26px;font-weight:bold;margin:4px 0;">${esc(formatRand(total))}</div>
            </div>
            ${
              uploadedPath
                ? '<p>We have your proof of payment and will check it shortly.</p>'
                : `<p>Please pay by EFT and send your proof of payment to the club, using reference <strong>${esc(
                    `${p.surname.trim()} ${reference}`
                  )}</strong>.</p>
            <table style="font-size:14px;">
              <tr><td style="padding:2px 12px 2px 0;color:#6a6d70;">Bank:</td><td>${esc(BANK_DETAILS.bank)}, ${esc(BANK_DETAILS.branchName)}</td></tr>
              <tr><td style="padding:2px 12px 2px 0;color:#6a6d70;">Account no.:</td><td>${esc(BANK_DETAILS.accountNo)}</td></tr>
              <tr><td style="padding:2px 12px 2px 0;color:#6a6d70;">Branch code:</td><td>${esc(BANK_DETAILS.branchCode)}</td></tr>
            </table>`
            }
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
          }. Total ${esc(formatRand(total))}. ${uploadedPath ? 'Proof of payment attached.' : 'No proof of payment yet.'}</p>
          ${flagged ? `<p style="color:#bb0000;"><strong>Flagged:</strong> ${esc(flagReason)}</p>` : ''}
          <p style="color:#6a6d70;font-size:13px;">Review it in the admin area under Membership.</p>
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
    if (uploadedPath) await db.storage.from(BUCKET).remove([uploadedPath]);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
