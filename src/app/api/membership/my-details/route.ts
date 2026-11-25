import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

// Returns the logged-in user's own membership details. The email always comes from
// their verified login, never from the request, so nobody can look up someone else.
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) return NextResponse.json({ found: false }, { status: 401 });

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await callerClient.auth.getUser();
    if (!user?.email) return NextResponse.json({ found: false }, { status: 401 });

    const db = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await db
      .from('membership_applications')
      .select(
        'year, member_no, first_name, surname, mobile, tel_home, tel_work, postal_address, emergency_name, emergency_phone, consent_email, consent_mobile'
      )
      .ilike('email', escapeLike(user.email))
      .eq('status', 'approved')
      .not('member_no', 'is', null)
      .order('approved_at', { ascending: false })
      .limit(1);

    if (error || !data?.length) return NextResponse.json({ found: false });

    const a = data[0];
    const address = (a.postal_address ?? '').trim();
    const code = /(\d{4})\s*$/.exec(address)?.[1] ?? '';

    return NextResponse.json({
      found: true,
      details: {
        member_no: a.member_no,
        year: a.year,
        full_name: `${a.first_name} ${a.surname}`.trim(),
        mobile: a.mobile ?? '',
        tel_home: a.tel_home ?? '',
        tel_work: a.tel_work ?? '',
        postal_address: address,
        postal_code: code,
        emergency_contact: a.emergency_name ?? '',
        emergency_tel: a.emergency_phone ?? '',
        popia_email_opt_in: !!a.consent_email,
        popia_sms_opt_in: !!a.consent_mobile,
      },
    });
  } catch {
    return NextResponse.json({ found: false }, { status: 500 });
  }
}
