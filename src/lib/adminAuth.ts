import { supabase } from '@/lib/supabase';
import { AdminUser } from '@/lib/types';

export async function resolveAdminForSession(userId: string): Promise<AdminUser | null> {
  const { data } = await supabase.from('admin_users').select('*').eq('auth_user_id', userId).maybeSingle();
  return data ?? null;
}