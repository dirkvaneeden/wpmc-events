import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      to,
      driverName,
      raceNumber,
      eventName,
      className,
      vehicleDescription,
      totalDue,
      entryReference,
      bank,
    } = body;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #354a5f; color: #ffffff; padding: 20px;">
          <div style="font-size: 18px; font-weight: bold;">Western Province Motor Club</div>
          <div style="font-size: 13px; opacity: 0.85;">Killarney International Raceway — Entry Confirmation</div>
        </div>
        <div style="padding: 24px; border: 1px solid #d9d9d9; border-top: none;">
          <p>Dear ${driverName},</p>
          <p>Thank you for submitting your event registration. Your entry details have been received and recorded under reference <strong>${entryReference}</strong>.</p>

          <div style="background: #f7f7f7; border: 1px solid #d9d9d9; border-radius: 2px; padding: 16px; margin: 20px 0;">
            <div style="font-weight: bold; color: #0070f2; margin-bottom: 10px;">ENTRY SUMMARY</div>
            <table style="width: 100%; font-size: 14px;">
              <tr><td style="padding: 4px 0; color: #6a6d70;">Race Number:</td><td style="font-weight: bold;">#${raceNumber}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Event:</td><td>${eventName}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Class:</td><td>${className}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Vehicle:</td><td>${vehicleDescription}</td></tr>
            </table>
          </div>

          <div style="background: #fdf1f1; border: 1px solid #f0c0c0; border-radius: 2px; padding: 16px; margin: 20px 0; text-align: center;">
            <div style="font-size: 12px; color: #bb0000; font-weight: bold;">TOTAL AMOUNT DUE</div>
            <div style="font-size: 26px; font-weight: bold; margin: 4px 0;">R ${totalDue}</div>
            <div style="font-size: 12px; color: #6a6d70;">Status: PENDING PAYMENT</div>
          </div>

          <div style="margin: 20px 0;">
            <div style="font-weight: bold; color: #0070f2; margin-bottom: 10px;">PAYMENT INSTRUCTIONS (EFT)</div>
            <p style="font-size: 13px; color: #6a6d70; margin-bottom: 8px;">Please transfer the total amount using the reference below.</p>
            <table style="width: 100%; font-size: 14px; border: 1px solid #d9d9d9;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; color: #6a6d70;">Bank:</td><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; font-weight: bold;">${bank.bank_name ?? '—'}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; color: #6a6d70;">Account Name:</td><td style="padding: 8px; border-bottom: 1px solid #d9d9d9;">${bank.acc_name ?? '—'}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; color: #6a6d70;">Account No:</td><td style="padding: 8px; border-bottom: 1px solid #d9d9d9;">${bank.acc_number ?? '—'}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #d9d9d9; color: #6a6d70;">Branch Code:</td><td style="padding: 8px; border-bottom: 1px solid #d9d9d9;">${bank.branch_code ?? '—'}</td></tr>
              <tr><td style="padding: 8px; color: #6a6d70;">Payment Reference:</td><td style="padding: 8px; font-weight: bold; color: #0070f2;">${entryReference}</td></tr>
            </table>
            <p style="font-size: 13px; color: #6a6d70; margin-top: 10px;">
              Please email your Proof of Payment (POP) to
              ${bank.pop_email ? `<a href="mailto:${bank.pop_email}">${bank.pop_email}</a>` : 'the club'}
              to confirm your grid spot.
            </p>
          </div>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Western Province Motor Club <mailer@events.slothwp.co.za>',
      to,
      subject: `WPMC Killarney Race Entry - #${raceNumber} (${driverName})`,
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