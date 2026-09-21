import { supabase } from '@/lib/supabase';
import { Driver } from '@/lib/types';

/**
 * Finds the driver record for a logged-in auth session.
 * First tries matching by auth_user_id (the normal case).
 * If not found, falls back to an existing unlinked record with
 * the same email (e.g. one created earlier via the admin screen)
 * and links it to this auth account so future logins go straight through.
 */
export async function resolveDriverForSession(userId: string, userEmail: string): Promise<Driver | null> {
  const { data: byAuthId } = await supabase
    .from('drivers')
    .select('*')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (byAuthId) return byAuthId;

  const { data: byEmail } = await supabase
    .from('drivers')
    .select('*')
    .eq('email', userEmail)
    .is('auth_user_id', null)
    .maybeSingle();

  if (!byEmail) return null;

  const { data: linked, error } = await supabase
    .from('drivers')
    .update({ auth_user_id: userId })
    .eq('id', byEmail.id)
    .select()
    .single();

  return error ? byEmail : linked;
}