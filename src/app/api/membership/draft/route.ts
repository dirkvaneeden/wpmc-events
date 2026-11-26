import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { ApplicationPayload, DRAFT_DAYS } from '@/lib/membershipForm';
import {
  emailRe,
  esc,
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

// Save (create or update) a draft application. Only an email address is required.
export async function POST(req: NextRequest) {
  const db = serviceClient();
  if (!db) return fail('The server is not configured.', 500);

  let newPath: string | null = null;
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
    if (p.website) return NextResponse.json({ token: 'x', emailed: false });

    const email = String(p.email ?? '').trim().toLowerCase();
    if (!emailRe.test(email)) return fail('Enter a valid email address so we can send you the link.');

    const tokenIn = form.get('token');
    const token = typeof tokenIn === 'string' && UUID_RE.test(tokenIn) ? tokenIn : null;

    const now = new Date();
    const expires = new Date(now.getTime() + DRAFT_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // Optional proof of payment can be uploaded with a draft too
    const pop = form.get('pop');
    if (pop instanceof File && pop.size > 0) {
      const problem = popProblem(pop);
      if (problem) return fail(problem);
      const up = await uploadPop(db, pop);
      if ('error' in up) return fail(up.error, 500);
      newPath = up.path;
    }

    // The payload is stored as the draft; never keep the honeypot field
    const stored = { ...p, email, website: '' };
    const base = {
      application_type: p.application_type === 'renew' ? 'renew' : 'new',
      surname: String(p.surname ?? '').trim().slice(0, 100),
      first_name: String(p.first_name ?? '').trim().slice(0, 100),
      email,
      draft_payload: stored,
      draft_saved_at: now.toISOString(),
      draft_expires_at: expires,
    };

    let resumeToken: string;
    let emailed = false;

    if (token) {
      const { data: draft } = await db
        .from('membership_applications')
        .select('id, status, pop_url, draft_saved_at, draft_expires_at')
        .eq('resume_token', token)
        .maybeSingle();
      if (!draft || draft.status !== 'draft') {
        if (newPath) await removePop(db, newPath);
        return fail('This saved application is no longer available. Please start a new application.', 410);
      }
      if (draft.draft_expires_at && new Date(draft.draft_expires_at) < now) {
        if (newPath) await removePop(db, newPath);
        return fail('This saved application has expired. Please start a new application.', 410);
      }
      const update: Record<string, unknown> = { ...base };
      if (newPath) update.pop_url = newPath;
      const { error } = await db.from('membership_applications').update(update).eq('id', draft.id);
      if (error) {
        if (newPath) await removePop(db, newPath);
        return fail(`Your application could not be saved: ${error.message}`, 500);
      }
      if (newPath) await removePop(db, draft.pop_url);
      resumeToken = token;
      // Re-send the link only if the last save was a while ago
      const last = draft.draft_saved_at ? new Date(draft.draft_saved_at).getTime() : 0;
      emailed = now.getTime() - last > 2 * 60 * 1000;
    } else {
      // Limit how many drafts one email can start in an hour (stops email bombing)
      const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from('membership_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'draft')
        .ilike('email', email.replace(/[\\%_]/g, (m) => `\\${m}`))
        .gte('created_at', since);
      if ((count ?? 0) >= 5) {
        if (newPath) await removePop(db, newPath);
        return fail('Too many saved applications for this email address. Please try again later.', 429);
      }

      const year = await pickYear(db);
      if (!year) {
        if (newPath) await removePop(db, newPath);
        return fail('Membership is not available right now.', 500);
      }
      resumeToken = crypto.randomUUID();
      const { error } = await db.from('membership_applications').insert({
        ...base,
        year,
        status: 'draft',
        total_due: 0,
        resume_token: resumeToken,
        pop_url: newPath,
      });
      if (error) {
        if (newPath) await removePop(db, newPath);
        return fail(`Your application could not be saved: ${error.message}`, 500);
      }
      emailed = true;
    }

    if (emailed && process.env.RESEND_API_KEY) {
      const link = `${req.nextUrl.origin}/membership/apply?draft=${resumeToken}`;
      const from = process.env.EMAIL_FROM ?? 'Western Province Motor Club <mailer@wpmconline.co.za>';
      const name = String(p.first_name ?? '').trim();
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background:#354a5f;color:#fff;padding:20px;">
            <div style="font-size:18px;font-weight:bold;">Western Province Motor Club</div>
            <div style="font-size:13px;opacity:0.85;">Your membership application is saved</div>
          </div>
          <div style="padding:24px;border:1px solid #d9d9d9;border-top:none;">
            <p>${name ? `Dear ${esc(name)},` : 'Hello,'}</p>
            <p>Your membership application has been saved but <strong>not yet submitted</strong>. Use the link below to come back, attach your proof of payment, and submit it.</p>
            <p style="margin:24px 0;"><a href="${esc(link)}" style="background:#346187;color:#fff;padding:10px 18px;text-decoration:none;border-radius:2px;">Continue my application</a></p>
            <p style="font-size:13px;color:#6a6d70;">The link works for ${DRAFT_DAYS} days. Anyone with this link can open your saved application, so please do not forward it.</p>
          </div>
        </div>`;
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ from, to: email, subject: 'Your WPMC membership application is saved', html });
      } catch (e) {
        console.error('Draft email failed', e);
        emailed = false;
      }
    }

    return NextResponse.json({ token: resumeToken, emailed, popSaved: !!newPath });
  } catch (err) {
    if (newPath) await removePop(db, newPath);
    return fail(err instanceof Error ? err.message : 'Unknown error', 500);
  }
}

// Load a draft by its private token so the form can be refilled.
export async function GET(req: NextRequest) {
  const db = serviceClient();
  if (!db) return fail('The server is not configured.', 500);

  const token = req.nextUrl.searchParams.get('token') ?? '';
  if (!UUID_RE.test(token)) return fail('This link is not valid.', 404);

  const { data: draft } = await db
    .from('membership_applications')
    .select('status, year, draft_payload, pop_url, draft_expires_at')
    .eq('resume_token', token)
    .maybeSingle();

  if (!draft) return fail('This saved application could not be found.', 404);
  if (draft.status !== 'draft') return fail('This application has already been submitted.', 410);
  if (draft.draft_expires_at && new Date(draft.draft_expires_at) < new Date()) {
    return fail('This saved application has expired. Please start a new application.', 410);
  }

  return NextResponse.json({ payload: draft.draft_payload, hasPop: !!draft.pop_url, year: draft.year });
}
