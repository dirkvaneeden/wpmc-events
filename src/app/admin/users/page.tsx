'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { AdminUser } from '@/lib/types';

export default function AdminUsersPage() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);

  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('admin_users').select('*').order('created_at', { ascending: true });
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load admin users: ${error.message}` });
    } else {
      setAdmins(data ?? []);
    }
    setLoading(false);
  }

  async function handleCreate() {
    if (!fullName.trim() || !email.trim() || !password) {
      setMessage({ type: 'negative', text: 'Please fill in all fields.' });
      return;
    }
    if (password.length < 8) {
      setMessage({ type: 'negative', text: 'Password must be at least 8 characters.' });
      return;
    }

    setCreating(true);
    setMessage(null);

    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setCreating(false);
      setMessage({ type: 'negative', text: 'Your session expired. Please log in again.' });
      return;
    }

    try {
      const res = await fetch('/api/admin/create-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ fullName: fullName.trim(), email: email.trim(), password }),
      });
      const json = await res.json();

      if (!res.ok) {
        setMessage({ type: 'negative', text: json.error ?? 'Could not create admin.' });
      } else {
        setMessage({ type: 'positive', text: `Admin account created for ${email.trim()}.` });
        setFullName('');
        setEmail('');
        setPassword('');
        load();
      }
    } catch (err) {
      setMessage({ type: 'negative', text: err instanceof Error ? err.message : 'Unknown error.' });
    }
    setCreating(false);
  }

  return (
    <div className="min-h-screen">
      <div className="fiori-shell">Race Track Admin</div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Admin Users</div>
        <h1 className="text-2xl font-semibold mb-6">Admin Users</h1>

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

        <div className="fiori-panel rounded-sm p-6 mb-8">
          <h2 className="text-sm font-semibold mb-4">Create New Admin</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="fiori-label">Full Name</label>
              <input className="fiori-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div>
              <label className="fiori-label">Email</label>
              <input className="fiori-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="fiori-label">Temporary Password</label>
              <input
                className="fiori-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
              />
            </div>
          </div>
          <button className="fiori-btn fiori-btn-emphasized" onClick={handleCreate} disabled={creating}>
            {creating ? 'Creating…' : '+ Create Admin'}
          </button>
        </div>

        <table className="fiori-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>Email</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={3} className="text-center text-[var(--fiori-text-subtle)] py-6">
                  Loading…
                </td>
              </tr>
            )}
            {!loading &&
              admins.map((a) => (
                <tr key={a.id}>
                  <td>{a.full_name}</td>
                  <td>{a.email}</td>
                  <td>{new Date(a.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}