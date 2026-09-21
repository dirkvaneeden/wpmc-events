'use client';

import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      <div className="fiori-shell">Race Track Driver Portal</div>

      <div className="flex-1 flex items-center justify-center px-6">
        <div className="fiori-panel w-full max-w-md rounded-sm p-10 text-center">
          <h1 className="text-2xl font-semibold mb-2">Welcome</h1>
          <p className="text-sm text-[var(--fiori-text-subtle)] mb-8">
            Are you a new driver, or already registered with us?
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/register"
              className="fiori-btn fiori-btn-emphasized w-full inline-flex items-center justify-center"
            >
              New Driver — Register
            </Link>
            <Link
              href="/login"
              className="fiori-btn fiori-btn-ghost w-full inline-flex items-center justify-center"
            >
              Existing Driver — Log In
            </Link>
          </div>
          <p className="text-xs text-center text-[var(--fiori-text-subtle)] mt-8">
            Club staff?{' '}
            <Link href="/admin/login" className="text-[var(--fiori-action)] hover:underline">
              Admin Log In
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}