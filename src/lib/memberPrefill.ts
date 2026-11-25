import { supabase } from '@/lib/supabase';

export interface MemberPrefill {
  member_no: string;
  year: number;
  full_name: string;
  mobile: string;
  tel_home: string;
  tel_work: string;
  postal_address: string;
  postal_code: string;
  emergency_contact: string;
  emergency_tel: string;
  popia_email_opt_in: boolean;
  popia_sms_opt_in: boolean;
}

/**
 * Looks up the logged-in driver's approved WPMC membership, matched by the
 * email on their login. Returns null when there is no session or no membership.
 */
export async function fetchMemberPrefill(): Promise<MemberPrefill | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const res = await fetch('/api/membership/my-details', {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (!res.ok) return null;
    const json = await res.json();
    return json.found ? (json.details as MemberPrefill) : null;
  } catch {
    return null;
  }
}
