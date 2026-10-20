import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use the same sender address you already have set up in Resend
const FROM = 'Western Province Motor Club <entries@wpmc.co.za>';

const esc = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const authClient = createClient(supabaseUrl, anonKey);
    const { data: userData } = await authClient.auth.getUser(token);
    const user = userData?.user;
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { to, driverName, raceNumber, eventName, className, vehicleDescription, entryReference, hasPop } =
      await req.json();

    // A driver may only trigger an email to their own verified address
    if (!to || !user.email || String(to).toLowerCase() !== user.email.toLowerCase()) {
      return NextResponse.json({ error: 'Not allowed.' }, { status: 403 });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #354a5f; color: #ffffff; padding: 20px;">
          <div style="font-size: 18px; font-weight: bold;">Western Province Motor Club</div>
          <div style="font-size: 13px; opacity: 0.85;">Killarney International Raceway — Entry Received</div>
        </div>
        <div style="padding: 24px; border: 1px solid #d9d9d9; border-top: none;">
          <p>Dear ${esc(driverName)},</p>
          <p>Thank you for submitting your event registration.${hasPop ? 'Your entry and proof of payment have been received' : 'Your entry has been received'} under reference <strong>${esc(entryReference)}</strong>.</p>

          <div style="background: #f7f7f7; border: 1px solid #d9d9d9; border-radius: 2px; padding: 16px; margin: 20px 0;">
            <div style="font-weight: bold; color: #0070f2; margin-bottom: 10px;">ENTRY SUMMARY</div>
            <table style="width: 100%; font-size: 14px;">
              <tr><td style="padding: 4px 0; color: #6a6d70;">Race Number:</td><td style="font-weight: bold;">#${esc(raceNumber)}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Event:</td><td>${esc(eventName)}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Class:</td><td>${esc(className)}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Vehicle:</td><td>${esc(vehicleDescription)}</td></tr>
            </table>
          </div>

          <div style="background: #eef4ff; border: 1px solid #b9d3fb; border-radius: 2px; padding: 16px; margin: 20px 0; text-align: center;">
            <div style="font-size: 12px; color: #0070f2; font-weight: bold;">ENTRY RECEIVED</div>
            <div style="font-size: 13px; color: #6a6d70; margin-top: 6px;">Status: Under review by the club</div>
          </div>

          <p style="font-size: 13px; color: #6a6d70;">
            ${hasPop ? 'The club will review your entry and the proof of payment you attached.' : 'The club will review your entry.'} If anything further is needed, we will contact you.
          </p>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from:  'Western Province Motor Club <mailer@events.slothwp.co.za>',
      to,
      subject: `WPMC Killarney Race Entry Received - #${raceNumber} (${driverName})`,
      html,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ id: data?.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}