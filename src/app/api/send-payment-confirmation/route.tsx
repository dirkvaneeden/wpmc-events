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
      amountPaid,
      paymentReference,
      entryReference,
    } = body;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #354a5f; color: #ffffff; padding: 20px;">
          <div style="font-size: 18px; font-weight: bold;">Western Province Motor Club</div>
          <div style="font-size: 13px; opacity: 0.85;">Killarney International Raceway — Payment Confirmation</div>
        </div>
        <div style="padding: 24px; border: 1px solid #d9d9d9; border-top: none;">
          <p>Dear ${driverName},</p>
          <p>We've received and confirmed your payment for entry reference <strong>${entryReference}</strong>. Your grid spot is now secured.</p>

          <div style="background: #f7f7f7; border: 1px solid #d9d9d9; border-radius: 2px; padding: 16px; margin: 20px 0;">
            <div style="font-weight: bold; color: #0070f2; margin-bottom: 10px;">ENTRY SUMMARY</div>
            <table style="width: 100%; font-size: 14px;">
              <tr><td style="padding: 4px 0; color: #6a6d70;">Race Number:</td><td style="font-weight: bold;">#${raceNumber}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Event:</td><td>${eventName}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Class:</td><td>${className}</td></tr>
              <tr><td style="padding: 4px 0; color: #6a6d70;">Vehicle:</td><td>${vehicleDescription}</td></tr>
            </table>
          </div>

          <div style="background: #f1faf4; border: 1px solid #b6e3c6; border-radius: 2px; padding: 16px; margin: 20px 0; text-align: center;">
            <div style="font-size: 12px; color: #107e3e; font-weight: bold;">PAYMENT RECEIVED</div>
            <div style="font-size: 26px; font-weight: bold; margin: 4px 0;">R ${Number(amountPaid).toFixed(2)}</div>
            <div style="font-size: 12px; color: #6a6d70;">Reference: ${paymentReference || '—'}</div>
            <div style="font-size: 12px; color: #6a6d70; margin-top: 4px;">Status: PAID</div>
          </div>

          <p style="font-size: 13px; color: #6a6d70;">
            If you have any questions about this entry, please contact the club directly.
          </p>
        </div>
      </div>
    `;

    const { data, error } = await resend.emails.send({
      from: 'Western Province Motor Club <onboarding@resend.dev>',
      to,
      subject: `Payment Confirmed - #${raceNumber} (${driverName})`,
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