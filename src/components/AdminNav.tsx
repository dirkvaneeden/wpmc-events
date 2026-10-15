'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { adminNavItems, AdminNavItem } from '@/lib/adminNav';

export default function AdminNav({ adminName }: { adminName?: string }) {
  const pathname = usePathname();
  const router = useRouter();

  function isActive(item: AdminNavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(`${item.href}/`);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/admin/login');
  }

  return (
    <header className="fiori-shell sticky top-0 z-40" style={{ gap: '1.5rem' }}>
      <span className="whitespace-nowrap">Race Track Admin</span>

      <nav className="flex-1 flex items-stretch h-full overflow-x-auto">
        {adminNavItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`inline-flex items-center px-3 text-sm whitespace-nowrap border-b-[3px] transition-colors ${
              isActive(item)
                ? 'border-white font-semibold'
                : 'border-transparent opacity-80 hover:opacity-100 hover:bg-white/10'
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-3 whitespace-nowrap">
        {adminName && <span className="text-xs opacity-80">{adminName}</span>}
        <button className="fiori-shell-btn" onClick={handleLogout}>
          Log Out
        </button>
      </div>
    </header>
  );
}