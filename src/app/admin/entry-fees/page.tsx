'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { EntryFee } from '@/lib/types';

export default function EntryFeesPage() {
  const [fees, setFees] = useState<EntryFee[]>([]);
  const [loading, setLoading] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<EntryFee | null>(null);
  const [form, setForm] = useState({ description: '', fee: '', is_active: true });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  async function loadFees() {
    setLoading(true);
    const { data, error } = await supabase
      .from('entryFee')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load entry fees: ${error.message}` });
    } else {
      setFees(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadFees();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm({ description: '', fee: '', is_active: true });
    setPanelOpen(true);
  }

  function openEdit(row: EntryFee) {
    setEditing(row);
    setForm({
      description: row.description ?? '',
      fee: row.fee?.toString() ?? '',
      is_active: row.is_active ?? true,
    });
    setPanelOpen(true);
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      description: form.description,
      fee: form.fee === '' ? 0 : Number(form.fee),
      is_active: form.is_active,
    };

    const { error } = editing
      ? await supabase.from('entryFee').update(payload).eq('id', editing.id)
      : await supabase.from('entryFee').insert(payload);

    setSaving(false);

    if (error) {
      setMessage({ type: 'negative', text: `Save failed: ${error.message}` });
      return;
    }

    setMessage({ type: 'positive', text: editing ? 'Entry fee updated.' : 'Entry fee created.' });
    setPanelOpen(false);
    loadFees();
  }

  async function handleDelete(row: EntryFee) {
    if (!confirm(`Delete "${row.description}"?`)) return;
    const { error } = await supabase.from('entryFee').delete().eq('id', row.id);
    if (error) {
      setMessage({ type: 'negative', text: `Delete failed: ${error.message}` });
    } else {
      setMessage({ type: 'positive', text: 'Entry fee deleted.' });
      loadFees();
    }
  }

  return (
    <div className="min-h-screen">
      <div className="fiori-shell">Race Track Admin</div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Entry Fees</div>
            <h1 className="text-2xl font-semibold">Entry Fees</h1>
          </div>
          <button className="fiori-btn fiori-btn-emphasized" onClick={openCreate}>
            + Create Entry Fee
          </button>
        </div>

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

        <table className="fiori-table">
          <thead>
            <tr>
              <th>Description</th>
              <th style={{ textAlign: 'right' }}>Fee</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={4} className="text-center text-[var(--fiori-text-subtle)] py-6">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && fees.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-[var(--fiori-text-subtle)] py-6">
                  No entry fees yet. Create one to get started.
                </td>
              </tr>
            )}
            {fees.map((row) => (
              <tr key={row.id}>
                <td>{row.description || '—'}</td>
                <td style={{ textAlign: 'right' }}>
                  {row.fee !== null ? `R ${row.fee.toFixed(2)}` : '—'}
                </td>
                <td>
                  <span
                    className="fiori-status-dot"
                    style={{ background: row.is_active ? 'var(--fiori-positive)' : '#8a8d8f' }}
                  />
                  {row.is_active ? 'Active' : 'Inactive'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button className="fiori-btn fiori-btn-ghost mr-2" onClick={() => openEdit(row)}>
                    Edit
                  </button>
                  <button
                    className="fiori-btn fiori-btn-ghost"
                    style={{ color: 'var(--fiori-negative)' }}
                    onClick={() => handleDelete(row)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {panelOpen && (
        <div className="fixed inset-0 bg-black/20 flex justify-end z-50">
          <div className="fiori-panel w-full max-w-md h-full p-6 overflow-y-auto">
            <h2 className="text-lg font-semibold mb-6">
              {editing ? 'Edit Entry Fee' : 'Create Entry Fee'}
            </h2>

            <div className="mb-4">
              <label className="fiori-label">Description</label>
              <input
                className="fiori-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="e.g. Standard Class Entry"
              />
            </div>

            <div className="mb-4">
              <label className="fiori-label">Fee (ZAR)</label>
              <input
                className="fiori-input"
                type="number"
                step="0.01"
                value={form.fee}
                onChange={(e) => setForm({ ...form, fee: e.target.value })}
                placeholder="0.00"
              />
            </div>

            <div className="mb-6 flex items-center gap-2">
              <input
                id="is_active"
                type="checkbox"
                checked={form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
              />
              <label htmlFor="is_active" className="text-sm">
                Active
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="fiori-btn fiori-btn-ghost" onClick={() => setPanelOpen(false)}>
                Cancel
              </button>
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}