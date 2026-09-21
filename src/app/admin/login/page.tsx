'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { resolveAdminForSession } from '@/lib/adminAuth';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setMessage({ type: 'negative', text: 'Please enter your email and password.' });
      return;
    }
    setBusy(true);
    setMessage(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });

    if (error || !data.session) {
      setBusy(false);
      setMessage({ type: 'negative', text: error?.message ?? 'Login failed.' });
      return;
    }

    const admin = await resolveAdminForSession(data.session.user.id);
    setBusy(false);

    if (!admin) {
      await supabase.auth.signOut();
      setMessage({ type: 'negative', text: 'This account does not have admin access.' });
      return;
    }

    router.replace('/admin');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fiori-shell">Race Track Admin</div>
      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="fiori-panel w-full max-w-md rounded-sm p-8">
          <h1 className="text-xl font-semibold mb-6">Admin Log In</h1>

          {message && (
            <div
              className="mb-4 px-4 py-2 text-sm rounded-sm border"
              style={{
                color: message.type === 'positive' ? 'var(--fiori-positive)' : 'var(--fiori-negative)',
                borderColor: message.type === 'positive' ? 'var(--fiori-positive)' : 'var(--fiori-negative)',
                background: message.type === 'positive' ? '#f1faf4' : '#fdf1f1',
              }}
            >
              {message.text}
            </div>
          )}

          <div className="mb-4">
            <label className="fiori-label">Email</label>
            <input
              className="fiori-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label className="fiori-label">Password</label>
            <input
              className="fiori-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            />
          </div>

          <button className="fiori-btn fiori-btn-emphasized w-full" onClick={handleLogin} disabled={busy}>
            {busy ? 'Signing in…' : 'Log In'}
          </button>
        </div>
      </div>
    </div>
  );
}