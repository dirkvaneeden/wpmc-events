import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { FREE_ENTRY_NOTE } from '@/lib/membershipForm';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    // Prove the caller is a real admin using their own session
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });

    const { data: callerAdmin } = await callerClient
      .from('admin_users')
      .select('id')
      .eq('auth_user_id', user.id)
      .maybeSingle();
    if (!callerAdmin) return NextResponse.json({ error: 'Admins only.' }, { status: 403 });

    const { applicationId } = await req.json();
    if (!applicationId) return NextResponse.json({ error: 'Missing application.' }, { status: 400 });

    const db = createClient(supabaseUrl, serviceRoleKey);
    const { data: app, error } = await db
      .from('membership_applications')
      .select('first_name, surname, email, year, member_no, category_label, lounge_label, status')
      .eq('id', applicationId)
      .maybeSingle();

    if (error || !app) return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    if (app.status !== 'approved' || !app.member_no) {
      return NextResponse.json({ error: 'The application is not approved yet.' }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: 'Email is not configured on the server.' }, { status: 500 });
    }

    const from = process.env.EMAIL_FROM ?? 'Western Province Motor Club <mailer@wpmconline.co.za>';
    const fullName = `${app.first_name} ${app.surname}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background:#354a5f;color:#fff;padding:20px;">
          <div style="font-size:18px;font-weight:bold;">Western Province Motor Club</div>
          <div style="font-size:13px;opacity:0.85;">Membership confirmed</div>
        </div>
        <div style="padding:24px;border:1px solid #d9d9d9;border-top:none;">
          <p>Dear ${esc(fullName)},</p>
          <p>Your payment has been confirmed and your ${esc(app.year)} membership of the Western Province Motor Club is approved. Welcome!</p>
          <div style="background:#f1faf4;border:1px solid #b6e3c6;padding:16px;margin:20px 0;text-align:center;">
            <div style="font-size:12px;color:#107e3e;font-weight:bold;">YOUR MEMBERSHIP NUMBER</div>
            <div style="font-size:28px;font-weight:bold;margin:4px 0;">${esc(app.member_no)}</div>
          </div>
          <div style="background:#f7f7f7;border:1px solid #d9d9d9;padding:16px;margin:20px 0;">
            <table style="width:100%;font-size:14px;">
              <tr><td style="padding:4px 0;color:#6a6d70;">Category:</td><td>${esc(app.category_label)}</td></tr>
              ${
                app.lounge_label
                  ? `<tr><td style="padding:4px 0;color:#6a6d70;">Pheiffer Lounge:</td><td>${esc(app.lounge_label)}</td></tr>`
                  : ''
              }
              <tr><td style="padding:4px 0;color:#6a6d70;">Valid:</td><td>January to December ${esc(app.year)}</td></tr>
            </table>
          </div>
          <p style="font-size:13px;color:#6a6d70;">${esc(FREE_ENTRY_NOTE)}</p>
          <p style="font-size:13px;color:#6a6d70;">Please quote your membership number when you contact the club.</p>
        </div>
      </div>`;

    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error: sendError } = await resend.emails.send({
      from,
      to: app.email,
      subject: `Welcome to the Western Province Motor Club (${app.member_no})`,
      html,
    });
    if (sendError) return NextResponse.json({ error: sendError.message }, { status: 500 });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
