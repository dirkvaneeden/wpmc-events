'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { resolveAdminForSession } from '@/lib/adminAuth';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function checkAccess() {
    if (pathname === '/admin/login') {
      setChecked(true);
      setAllowed(true);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.replace('/admin/login');
      return;
    }

    const admin = await resolveAdminForSession(session.user.id);

    if (!admin) {
      router.replace('/admin/login');
      return;
    }

    setChecked(true);
    setAllowed(true);
  }

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--fiori-text-subtle)]">
        Checking access…
      </div>
    );
  }

  if (!allowed) return null;

  return <>{children}</>;
}