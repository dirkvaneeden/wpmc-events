'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase/server';
import { fetchAllMembers, fetchMember, mapApiMember, type MappedMember } from '@/lib/members-api';

export type ImportRow = { member_number: string; name: string; email: string; reason?: string };

export type ImportPlan = {
  error?: string;
  imported?: number;          // only after a real import
  total: number;              // members the API says it has
  fetched: number;            // members actually received
  complete: boolean;          // false = the API didn't give us every page
  toAdd: ImportRow[];
  alreadyHere: number;
  skipped: ImportRow[];       // invalid, or email already used by another member
  rawSample?: string;         // first record as the API sent it, to check the field mapping
};

const row = (m: MappedMember, reason?: string): ImportRow => ({ member_number: m.member_number, name: m.name, email: m.email, reason });

/** Works out which API members are new, without changing anything. */
async function plan(activeOnly: boolean): Promise<{ plan: ImportPlan; newMembers: MappedMember[] }> {
  const { members, total, complete } = await fetchAllMembers({ activeOnly });

  const { data: existing, error } = await supabaseAdmin().from('members').select('member_number, email');
  if (error) throw new Error(error.message);
  const numbers = new Set((existing ?? []).map((e) => e.member_number as string));
  const emails = new Set((existing ?? []).map((e) => (e.email as string).toLowerCase()));

  const newMembers: MappedMember[] = [];
  const skipped: ImportRow[] = [];
  let alreadyHere = 0;

  for (const raw of members) {
    const mapped = mapApiMember(raw);
    if (!mapped.ok) { skipped.push({ member_number: mapped.label, name: mapped.label, email: '', reason: mapped.reason }); continue; }
    const m = mapped.member;
    if (numbers.has(m.member_number)) { alreadyHere++; continue; }        // existing members are left alone
    if (emails.has(m.email)) { skipped.push(row(m, 'Email already used by another member')); continue; }
    numbers.add(m.member_number);
    emails.add(m.email);                                                  // also catches duplicates inside the API data
    newMembers.push(m);
  }

  return {
    newMembers,
    plan: {
      total, fetched: members.length, complete, alreadyHere, skipped,
      toAdd: newMembers.map((m) => row(m)),
      rawSample: members[0] ? JSON.stringify(members[0], null, 2) : undefined,
    },
  };
}

const emptyPlan: ImportPlan = { total: 0, fetched: 0, complete: true, toAdd: [], alreadyHere: 0, skipped: [] };

/** Step 1: show what would be imported. */
export async function previewMemberImport(activeOnly: boolean): Promise<ImportPlan> {
  await requireAdmin();
  try {
    return (await plan(activeOnly)).plan;
  } catch (e) {
    return { ...emptyPlan, error: (e as Error).message };
  }
}

/** Step 2: add the new members. Existing members (same AO number) are never changed. */
export async function runMemberImport(activeOnly: boolean): Promise<ImportPlan> {
  await requireAdmin();
  try {
    const { plan: p, newMembers } = await plan(activeOnly);
    if (newMembers.length) {
      const { error } = await supabaseAdmin()
        .from('members')
        .upsert(newMembers, { onConflict: 'member_number', ignoreDuplicates: true });
      if (error) return { ...p, error: `Nothing was imported: ${error.message}` };
    }
    revalidatePath('/admin/members-import');
    return { ...p, imported: newMembers.length };
  } catch (e) {
    return { ...emptyPlan, error: (e as Error).message };
  }
}

export type LookupResult = {
  error?: string;
  info?: string;
  member?: MappedMember;
  exists?: boolean;
  raw?: string;
};

/** Looks up one member by AO number on the external site. */
export async function lookupMember(number: string): Promise<LookupResult> {
  await requireAdmin();
  try {
    const raw = await fetchMember(number);
    if (!raw) return { error: `No member with number ${number.trim().toUpperCase()} on audioutcasts.com.` };
    const mapped = mapApiMember(raw);
    if (!mapped.ok) return { error: `This member can't be imported: ${mapped.reason}.`, raw: JSON.stringify(raw, null, 2) };
    const { data } = await supabaseAdmin().from('members').select('id').eq('member_number', mapped.member.member_number).maybeSingle();
    return { member: mapped.member, exists: !!data, raw: JSON.stringify(raw, null, 2) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Imports one member by AO number (only if they aren't in the store yet). */
export async function importOneMember(number: string): Promise<LookupResult> {
  await requireAdmin();
  const found = await lookupMember(number);
  if (found.error || !found.member) return found;
  if (found.exists) return { ...found, error: `${found.member.member_number} is already a member of the store.` };

  const { data: clash } = await supabaseAdmin().from('members').select('member_number').eq('email', found.member.email).maybeSingle();
  if (clash) return { ...found, error: `The email ${found.member.email} already belongs to ${clash.member_number}.` };

  const { error } = await supabaseAdmin().from('members').insert(found.member);
  if (error) return { ...found, error: `${found.member.member_number} could not be imported: ${error.message}` };

  revalidatePath('/admin/members-import');
  return { ...found, exists: true, info: `${found.member.name} (${found.member.member_number}) was added. They can now sign in with ${found.member.email}.` };
}
