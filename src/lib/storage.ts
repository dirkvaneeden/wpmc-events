import { supabase } from '@/lib/supabase';

const BUCKET = 'entry-documents';

/** Uploads a file into a folder within the private entry-documents bucket, returns the storage path (not a public URL). */
export async function uploadEntryDocument(file: File, folder: string, ownerId: string): Promise<string> {
  const ext = file.name.split('.').pop();
  const path = `${folder}/${ownerId}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) throw error;
  return path;
}

/** Generates a short-lived signed URL so an admin can view/download a private document. */
export async function getSignedDocumentUrl(path: string, expiresInSeconds = 300): Promise<string | null> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error || !data) return null;
  return data.signedUrl;
}