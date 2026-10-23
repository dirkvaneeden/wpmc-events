import Link from 'next/link';
import { supabaseAdmin } from '@/lib/supabase/server';
import { MemberImport } from '@/components/MemberImport';

export const dynamic = 'force-dynamic';

export default async function MembersImportPage() {
  const { count } = await supabaseAdmin().from('members').select('id', { count: 'exact', head: true });
  const configured = Boolean(process.env.MEMBERS_API_KEY);

  return (
    <>
      <div className="page-header">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/" className="breadcrumbs__link">Store</Link>
        </nav>
        <h1 className="page-header__title">Import Members</h1>
        <p className="page-header__subtitle">
          Adds new members from audioutcasts.com. {count ?? 0} members in the store now.
        </p>
      </div>
      <div className="page-body">
        {!configured && (
          <div className="message-strip message-strip--error" role="alert">
            MEMBERS_API_KEY is not set. Add it to .env.local (and to Vercel’s environment variables), then restart.
          </div>
        )}
        <MemberImport />
      </div>
    </>
  );
}
