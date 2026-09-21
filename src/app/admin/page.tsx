'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const sections = [
  { href: '/admin/entry-fees', title: 'Entry Fees', desc: 'Create and manage entry fee rates.' },
  { href: '/admin/events', title: 'Events', desc: 'Create events and set them active or inactive.' },
  { href: '/admin/race-classes', title: 'Race Classes', desc: 'Maintain the list of race classes.' },
  { href: '/admin/drivers', title: 'Drivers', desc: 'View and manage registered drivers and their vehicles.' },
  { href: '/admin/payments', title: 'Payments', desc: 'Review entries per event and capture payments.' },
  { href: '/admin/bank-details', title: 'Bank Details', desc: 'Update the banking details shown on entry confirmations.' },
  { href: '/admin/users', title: 'Admin Users', desc: 'Create and view admin accounts.' },
];

export default function AdminDashboardPage() {
  const router = useRouter();

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/admin/login');
  }

  return (
    <div className="min-h-screen">
      <div className="fiori-shell flex items-center justify-between">
        <span>Race Track Admin</span>
        <button
          className="fiori-btn fiori-btn-ghost"
          style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.4)' }}
          onClick={handleLogout}
        >
          Log Out
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold mb-6">Admin Dashboard</h1>

        <div className="grid grid-cols-3 gap-4">
          {sections.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              className="fiori-panel rounded-sm p-5 hover:shadow-md transition-shadow"
              style={{ display: 'block' }}
            >
              <div className="text-base font-semibold mb-1">{s.title}</div>
              <div className="text-sm text-[var(--fiori-text-subtle)]">{s.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}