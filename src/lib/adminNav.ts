export interface AdminNavItem {
  href: string;
  label: string;
  exact?: boolean;
}

// Single source of truth for the admin menu.
export const adminNavItems: AdminNavItem[] = [
  { href: '/admin', label: 'Dashboard', exact: true },
  { href: '/admin/events', label: 'Events' },
  { href: '/admin/entry-lists', label: 'Entry Lists' },
  { href: '/admin/users', label: 'Admin Users' },
];