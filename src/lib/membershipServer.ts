// Server-only helpers shared by the membership API routes.
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { MAX_POP_BYTES } from '@/lib/membershipForm';

export const MEMBERSHIP_BUCKET = 'membership-documents';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (m) => `\\${m}`);
}

export const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// The current calendar year if it has a price list, otherwise the latest one.
export async function pickYear(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db.from('membership_years').select('year').order('year', { ascending: false });
  if (error || !data?.length) return null;
  const thisYear = new Date().getFullYear();
  return data.some((y) => y.year === thisYear) ? thisYear : data[0].year;
}

export function popProblem(file: File): string | null {
  if (file.size > MAX_POP_BYTES) return 'The proof of payment must be smaller than 4 MB.';
  const okType = file.type === 'application/pdf' || file.type.startsWith('image/');
  if (!okType) return 'The proof of payment must be a PDF or an image.';
  return null;
}

// Uploads a proof of payment to the private bucket and returns its storage path.
export async function uploadPop(
  db: SupabaseClient,
  file: File
): Promise<{ path: string } | { error: string }> {
  const ext = (file.name.split('.').pop() ?? 'bin').replace(/[^a-zA-Z0-9]/g, '').slice(0, 8) || 'bin';
  const path = `pop/${crypto.randomUUID()}.${ext}`;
  const { error } = await db.storage
    .from(MEMBERSHIP_BUCKET)
    .upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false });
  if (error) return { error: `The proof of payment could not be uploaded: ${error.message}` };
  return { path };
}

export async function removePop(db: SupabaseClient, path: string | null | undefined) {
  if (path) await db.storage.from(MEMBERSHIP_BUCKET).remove([path]);
}
