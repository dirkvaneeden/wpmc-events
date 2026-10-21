import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use the same sender address you already have set up in Resend
const FROM = 'Western Province Motor Club <mailer@wpmconline.co.za>';

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

interface EntryForEmail {
  id: string;
  event_id: string;
  race_number: string;
  fee_amount: number;
  pay_reference: string | null;
  drivers: { full_name: string; email: string } | null;
  vehicles: { make: string; model: string; year: number } | null;
  race_classes: { name: string } | null;
  events: { name: string } | null;
}

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    // Runs as the caller, so normal RLS applies to everything below
    const caller = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userData } = await caller.auth.getUser(token);
    if (!userData?.user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { data: admin } = await caller
      .from('admin_users')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .maybeSingle();

    if (!admin) {
      return NextResponse.json({ error: 'Only admins can send payment requests.' }, { status: 403 });
    }

    const { entryId } = await req.json();
    if (!entryId) {
      return NextResponse.json({ error: 'entryId is required.' }, { status: 400 });
    }

    const { data: entryData, error: entryError } = await caller
      .from('event_entries')
      .select(
        `id, event_id, race_number, fee_amount, pay_reference,
         drivers(full_name, email),
         vehicles(make, model, year),
         race_classes(name),
         events(name)`
      )
      .eq('id', entryId)
      .single();

    if (entryError || !entryData) {
      return NextResponse.json({ error: 'Entry not found.' }, { status: 404 });
    }

    const entry = entryData as unknown as EntryForEmail;

    if (!entry.drivers?.email) {
      return NextResponse.json({ error: 'This driver has no email address.' }, { status: 400 });
    }

      const { data: bank } = await caller
      .from('bank_details')
      .select('*')
      .eq('event_id', entry.event_id)
      .maybeSingle();

    const vehicle = entry.vehicles ? `${entry.vehicles.year} ${entry.vehicles.make} ${entry.vehicles.model}` : '—';
    const reference = entry.pay_reference ?? `#${entry.race_number} - ${entry.drivers.full_name}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #354a5f; color: #ffffff; padding: 20px;">
          <div style="font-size: 18px; font-weight: bold;">Western Province Motor Club</div>
          <div style="font-size: 13px; opacity: 0.85;">Killarney International Raceway — Payment Request</div>
        </div>
        <div style="padding: 24px; border: 1px solid #d9d9d9; border-top: none;">
          <p>Dear ${esc(entry.drivers.full_name)},</p>
          <p>We have reviewed your entry <strong>${esc(reference)}</strong> and still require payment to secure your grid spot.</p>

          <div style="background: #f7f7f7; border: 1px solid #d9d9d9; border-radius: 2px; padding: 16px; margin: 20px 0;">
            <div style="font-weight: bold; color: #0070f2; margin-bottom: 10px;">ENTRY SUMMARY</div>
            <table style="width: 100%; font-size: 14px;">
              <tr><td style="padding: 4px 0; color: #6a6d70;">Race Number:</td><td style="font-weight: bold;">#${esc(entry.race_number)}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Event:</td><td>${esc(entry.events?.name)}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Class:</td><td>${esc(entry.race_classes?.name)}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Vehicle:</td><td>${esc(vehicle)}</td></tr>
            </table>
          </div>

          <div style="background: #fdf1f1; border: 1px solid #f0c0c0; border-radius: 2px; padding: 16px; margin: 20px 0; text-align: center;">
            <div style="font-size: 12px; color: #bb0000; font-weight: bold;">AMOUNT DUE</div>
            <div style="font-size: 26px; font-weight: bold; margin: 4px 0;">R ${Number(entry.fee_amount).toFixed(2)}</div>
            <div style="font-size: 12px; color: #6a6d70;">Status: PAYMENT REQUIRED</div>
          </div>

          <div style="margin: 20px 0;">
            <div style="font-weight: bold; color: #0070f2; margin-bottom: 10px;">PAYMENT INSTRUCTIONS (EFT)</div>
            <p style="font-size: 13px; color: #6a6d70; margin-bottom: 8px;">Please transfer the amount due using the reference below.</p>
            <table style="width: 100%; font-size: 14px; border: 1px solid #d9d9d9;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; color: #6a6d70;">Bank:</td><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; font-weight: bold;">${esc(bank?.bank_name ?? '—')}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; color: #6a6d70;">Account Name:</td><td style="padding: 8px; border-bottom: 1px solid #d9d9d9;">${esc(bank?.acc_name ?? '—')}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; color: #6a6d70;">Account No:</td><td style="padding: 8px; border-bottom: 1px solid #d9d9d9;">${esc(bank?.acc_number ?? '—')}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; color: #6a6d70;">Branch Code:</td><td style="padding: 8px; border-bottom: 1px solid #d9d9d9;">${esc(bank?.branch_code ?? '—')}</td></tr>
              <tr><td style="padding: 8px; color: #6a6d70;">Payment Reference:</td><td style="padding: 8px; font-weight: bold; color: #0070f2;">${esc(reference)}</td></tr>
            </table>
            <p style="font-size: 13px; color: #6a6d70; margin-top: 10px;">
              Please email your Proof of Payment (POP) to
              ${bank?.pop_email ? `<a href="mailto:${esc(bank.pop_email)}">${esc(bank.pop_email)}</a>` : 'the club'}
              to confirm your grid spot.
            </p>
          </div>
        </div>
      </div>
    `;

    const { error: sendError } = await resend.emails.send({
      from: FROM,
      to: entry.drivers.email,
      subject: `WPMC Killarney - Payment Required - #${entry.race_number} (${entry.drivers.full_name})`,
      html,
    });

    if (sendError) {
      return NextResponse.json({ error: sendError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}