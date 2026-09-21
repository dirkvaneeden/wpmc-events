import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    // Scoped to the caller's own session — normal RLS applies, proving they're a real admin
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
    } = await callerClient.auth.getUser();

    if (!callerUser) {
      return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
    }

    const { data: callerAdmin } = await callerClient
      .from('admin_users')
      .select('id')
      .eq('auth_user_id', callerUser.id)
      .maybeSingle();

    if (!callerAdmin) {
      return NextResponse.json({ error: 'Only existing admins can create new admin accounts.' }, { status: 403 });
    }

    const { email, password, fullName } = await req.json();
    if (!email || !password || !fullName) {
      return NextResponse.json({ error: 'Email, password and full name are required.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
    }

    // Elevated client — only used after the admin check above passes
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (createError || !created.user) {
      return NextResponse.json({ error: createError?.message ?? 'Could not create user.' }, { status: 500 });
    }

    const { error: insertError } = await adminClient.from('admin_users').insert({
      auth_user_id: created.user.id,
      full_name: fullName,
      email,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}