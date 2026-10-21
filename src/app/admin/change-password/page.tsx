'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { resolveAdminForSession } from '@/lib/adminAuth';
import { AdminUser } from '@/lib/types';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) setAdmin(await resolveAdminForSession(session.user.id));
    }
    load();
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/admin/login');
  }

  async function handleSave() {
    setMessage(null);

    if (!admin) {
      setMessage({ type: 'negative', text: "Couldn't confirm your admin account. Log out and log in again." });
      return;
    }
    if (password.length < 12) {
      setMessage({ type: 'negative', text: 'Use at least 12 characters.' });
      return;
    }
    if (password !== confirm) {
      setMessage({ type: 'negative', text: 'The two passwords do not match.' });
      return;
    }

    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setBusy(false);
      setMessage({ type: 'negative', text: error.message });
      return;
    }

    const { error: flagError } = await supabase
      .from('admin_users')
      .update({ must_change_password: false })
      .eq('id', admin.id);

    // Signs out any other device or browser that is still logged in as this admin
    await supabase.auth.signOut({ scope: 'others' });
    setBusy(false);

    if (flagError) {
      setMessage({
        type: 'negative',
        text: `Your password was changed, but we couldn't clear the reminder (${flagError.message}). Try again.`,
      });
      return;
    }

    router.replace('/admin');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fiori-shell flex items-center justify-between">
        <span>Race Track Admin</span>
        <button className="fiori-shell-btn" onClick={handleLogout}>
          Log Out
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="fiori-panel w-full max-w-md rounded-sm p-8">
          <h1 className="text-xl font-semibold mb-2">Choose a new password</h1>
          <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
            {admin?.must_change_password
              ? 'You must set a new password before you can continue.'
              : 'Set a new password for your admin account.'}
          </p>

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
            <label className="fiori-label">New password (at least 12 characters)</label>
            <input
              className="fiori-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <div className="mb-6">
            <label className="fiori-label">Confirm new password</label>
            <input
              className="fiori-input"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          <button className="fiori-btn fiori-btn-emphasized w-full" onClick={handleSave} disabled={busy}>
            {busy ? 'Saving…' : 'Save new password'}
          </button>
        </div>
      </div>
    </div>
  );
}