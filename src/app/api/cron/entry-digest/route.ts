import { NextRequest, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { timingSafeEqual } from 'node:crypto';
import { getPaymentState, paymentStateMeta, PaymentStateKey } from '@/lib/paymentState';
import { formatEventDates, todayString } from '@/lib/eventDates';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// The job runs daily. A digest goes out when about 3 days have passed since the last one
// (70 hours, so a daily run at the same time each day never slips to the 4th day).
const DIGEST_EVERY_MS = 70 * 60 * 60 * 1000;
const FIRST_LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_LISTED_PER_EVENT = 40;

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const money = (n: number) => `R${n.toFixed(2)}`;

interface OpenEvent {
  id: string;
  name: string;
  event_date: string;
  end_date: string;
}

interface EntryRow {
  event_id: string;
  race_number: string;
  created_at: string;
  fee_amount: number;
  status: string;
  pop_url_driver: string | null;
  is_late_entry: boolean;
  drivers: { full_name: string } | null;
  race_classes: { name: string } | null;
  race_subclasses: { name: string } | null;
  admin_users: { full_name: string } | null;
  payments: { amount_paid: number }[];
}

function authorised(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET;
  const provided = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!expected || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function fetchEntries(db: SupabaseClient, eventIds: string[]): Promise<EntryRow[]> {
  const all: EntryRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from('event_entries')
      .select(
        `event_id, race_number, created_at, fee_amount, status, pop_url_driver, is_late_entry,
         drivers(full_name), race_classes(name), race_subclasses(name), admin_users(full_name),
         payments(amount_paid)`
      )
      .in('event_id', eventIds)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + 999);

    if (error) throw error;
    const page = (data ?? []) as unknown as EntryRow[];
    all.push(...page);
    if (page.length < 1000) break;
  }
  return all;
}

function buildEventHtml(ev: OpenEvent, entries: EntryRow[], since: Date) {
  const counts: Record<PaymentStateKey, number> = { PAID: 0, POP_RECEIVED: 0, AWAITING_POP: 0, NO_PAYMENT: 0 };
  let outstanding = 0;

  for (const e of entries) {
    counts[getPaymentState(e.status, e.pop_url_driver, e.fee_amount)] += 1;
    if (e.status !== 'PAID') {
      const paid = e.payments.reduce((sum, p) => sum + p.amount_paid, 0);
      outstanding += Math.max(e.fee_amount - paid, 0);
    }
  }

  const fresh = entries.filter((e) => new Date(e.created_at) > since).reverse(); // newest first
  const listed = fresh.slice(0, MAX_LISTED_PER_EVENT);

  const rows = listed
    .map((e) => {
      const state = paymentStateMeta[getPaymentState(e.status, e.pop_url_driver, e.fee_amount)].label;
      const cls = e.race_subclasses
        ? `${e.race_classes?.name ?? ''} — ${e.race_subclasses.name}`
        : (e.race_classes?.name ?? '');
      const tags = [e.is_late_entry ? 'LATE' : '', e.admin_users ? 'ADMIN' : ''].filter(Boolean).join(' · ');
      return `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;font-weight:bold;">#${esc(e.race_number)}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;">${esc(e.drivers?.full_name ?? '—')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;">${esc(cls || '—')}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #e5e5e5;">${esc(state)}${tags ? ` <span style="color:#666;font-size:11px;">(${esc(tags)})</span>` : ''}</td>
      </tr>`;
    })
    .join('');

  const more =
    fresh.length > listed.length
      ? `<p style="font-size:12px;color:#666;margin:6px 0 0;">…and ${fresh.length - listed.length} more. See the entry list for all of them.</p>`
      : '';

  const html = `
    <div style="margin:0 0 24px;">
      <div style="font-size:16px;font-weight:bold;color:#333;">${esc(ev.name)}</div>
      <div style="font-size:12px;color:#666;margin-bottom:8px;">${esc(formatEventDates(ev.event_date, ev.end_date))}</div>
      <div style="font-size:13px;color:#333;margin-bottom:10px;">
        <strong>${entries.length}</strong> entries in total ·
        ${counts.PAID} paid · ${counts.POP_RECEIVED} POP received · ${counts.AWAITING_POP} awaiting POP ·
        ${counts.NO_PAYMENT} no payment due ·
        outstanding <strong>${money(outstanding)}</strong>
      </div>
      ${
        fresh.length === 0
          ? '<div style="font-size:13px;color:#666;">No new entries since the last digest.</div>'
          : `<div style="font-size:13px;font-weight:bold;color:#346187;margin-bottom:4px;">${fresh.length} new ${fresh.length === 1 ? 'entry' : 'entries'}</div>
             <table style="width:100%;border-collapse:collapse;font-size:13px;">
               <tr style="background:#eff4f9;color:#666;text-align:left;">
                 <th style="padding:6px 8px;">Race #</th><th style="padding:6px 8px;">Driver</th>
                 <th style="padding:6px 8px;">Class</th><th style="padding:6px 8px;">Payment</th>
               </tr>
               ${rows}
             </table>${more}`
      }
    </div>`;

  return { html, newCount: fresh.length };
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ error: 'Unauthorised.' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Supabase settings are missing.' }, { status: 500 });
  }

  // ?force=1 sends a digest straight away, which is useful for testing
  const force = req.nextUrl.searchParams.get('force') === '1';

  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  let openCount = 0;
  let newCount = 0;

  async function writeLog(sent: boolean, error: string | null) {
    // Also counts as a database write, so every run is real activity
    await db.from('digest_log').insert({ sent, open_events: openCount, new_entries: newCount, error });
  }

  try {
    const now = new Date();

    const { data: last, error: lastError } = await db
      .from('digest_log')
      .select('run_at')
      .eq('sent', true)
      .order('run_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastError) throw lastError;

    const lastAt = last ? new Date(last.run_at) : null;
    const due = force || !lastAt || now.getTime() - lastAt.getTime() >= DIGEST_EVERY_MS;

    const { data: eventsData, error: eventsError } = await db
      .from('events')
      .select('id, name, event_date, end_date')
      .eq('status', true)
      .gte('end_date', todayString())
      .order('event_date', { ascending: true });
    if (eventsError) throw eventsError;

    const openEvents = (eventsData ?? []) as OpenEvent[];
    openCount = openEvents.length;

    if (!due) {
      await writeLog(false, null);
      return NextResponse.json({ sent: false, reason: 'Not due yet.', openEvents: openCount });
    }

    const since = lastAt ?? new Date(now.getTime() - FIRST_LOOKBACK_MS);
    const entries = openEvents.length > 0 ? await fetchEntries(db, openEvents.map((e) => e.id)) : [];

    let body = '';
    for (const ev of openEvents) {
      const built = buildEventHtml(
        ev,
        entries.filter((e) => e.event_id === ev.id),
        since
      );
      newCount += built.newCount;
      body += built.html;
    }
    if (openEvents.length === 0) {
      body = '<p style="font-size:14px;color:#333;">No events are open for entries right now.</p>';
    }

    const recipients = (process.env.DIGEST_TO ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const from = process.env.EMAIL_FROM;
    if (recipients.length === 0 || !from) {
      throw new Error('DIGEST_TO and EMAIL_FROM must both be set.');
    }

    const sinceText = since.toISOString().slice(0, 10);
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <div style="background:#3f5161;color:#ffffff;padding:20px;">
          <div style="font-size:18px;font-weight:bold;">Western Province Motor Club</div>
          <div style="font-size:13px;opacity:0.85;">Entry digest</div>
        </div>
        <div style="padding:24px;border:1px solid #d9d9d9;border-top:none;">
          <p style="font-size:14px;color:#333;margin-top:0;">
            <strong>${newCount}</strong> new ${newCount === 1 ? 'entry' : 'entries'} since ${esc(sinceText)}
            across <strong>${openCount}</strong> open ${openCount === 1 ? 'event' : 'events'}.
          </p>
          ${body}
        </div>
      </div>`;

    // Built here, not at the top of the file, so a missing key can never break the build
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from,
      to: recipients,
      subject: `WPMC entries: ${newCount} new since ${sinceText}`,
      html,
    });
    if (sendError) throw new Error(sendError.message);

    await writeLog(true, null);
    return NextResponse.json({ sent: true, newEntries: newCount, openEvents: openCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Unknown error';
    await writeLog(false, message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}