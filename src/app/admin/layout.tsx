'use client';

import { useEffect, useState, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { resolveAdminForSession } from '@/lib/adminAuth';
import AdminNav from '@/components/AdminNav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  const [adminName, setAdminName] = useState('');

  useEffect(() => {
    checkAccess();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  async function checkAccess() {
    if (pathname === '/admin/login') {
      setAllowed(false);
      setAdminName('');
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setAllowed(false);
      router.replace('/admin/login');
      return;
    }

    const admin = await resolveAdminForSession(session.user.id);

    if (!admin) {
      setAllowed(false);
      router.replace('/admin/login');
      return;
    }

    // A forced password change comes before everything else
    if (admin.must_change_password && pathname !== '/admin/change-password') {
      setAllowed(false);
      router.replace('/admin/change-password');
      return;
    }

    setAdminName(admin.full_name);
    setAllowed(true);
  }

  // The login page renders on its own, without the menu bar
  if (pathname === '/admin/login') return <>{children}</>;

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center text-[var(--fiori-text-subtle)]">
        Checking access…
      </div>
    );
  }

  // The password screen has no menu, so there is nowhere else to go until it's done
  if (pathname === '/admin/change-password') return <>{children}</>;

  return (
    <>
      <AdminNav adminName={adminName} />
      {children}
    </>
  );
}