'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RaceClass } from '@/lib/types';

export default function RaceClassesPage() {
  const [classes, setClasses] = useState<RaceClass[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline row editing
  const [editingId, setEditingId] = useState<number | null>(null);
  const [rowName, setRowName] = useState('');
  const [rowSaving, setRowSaving] = useState(false);

  // Create modal
  const [panelOpen, setPanelOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  async function loadClasses() {
    setLoading(true);
    const { data, error } = await supabase
      .from('race_classes')
      .select('*')
      .order('name', { ascending: true });

    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load race classes: ${error.message}` });
    } else {
      setClasses(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadClasses();
  }, []);

  // --- Create ---

  function openCreate() {
    setCreateName('');
    setPanelOpen(true);
  }

  async function handleCreateSave() {
    if (!createName.trim()) {
      setMessage({ type: 'negative', text: 'Class name is required.' });
      return;
    }

    setSaving(true);
    const { error } = await supabase.from('race_classes').insert({ name: createName.trim() });
    setSaving(false);

    if (error) {
      // Postgres unique_violation
      const friendly = error.code === '23505' ? 'A race class with that name already exists.' : error.message;
      setMessage({ type: 'negative', text: `Save failed: ${friendly}` });
      return;
    }

    setMessage({ type: 'positive', text: 'Race class created.' });
    setPanelOpen(false);
    loadClasses();
  }

  // --- Edit (inline row) ---

  function openRowEdit(row: RaceClass) {
    setEditingId(row.id);
    setRowName(row.name);
  }

  function cancelRowEdit() {
    setEditingId(null);
    setRowName('');
  }

  async function handleRowSave(id: number) {
    if (!rowName.trim()) {
      setMessage({ type: 'negative', text: 'Class name is required.' });
      return;
    }

    setRowSaving(true);
    const { error } = await supabase.from('race_classes').update({ name: rowName.trim() }).eq('id', id);
    setRowSaving(false);

    if (error) {
      const friendly = error.code === '23505' ? 'A race class with that name already exists.' : error.message;
      setMessage({ type: 'negative', text: `Save failed: ${friendly}` });
      return;
    }

    setMessage({ type: 'positive', text: 'Race class updated.' });
    setEditingId(null);
    setRowName('');
    loadClasses();
  }

  // --- Delete ---

  async function handleDelete(row: RaceClass) {
    if (!confirm(`Delete race class "${row.name}"? This can't be undone.`)) return;

    const { error } = await supabase.from('race_classes').delete().eq('id', row.id);

    if (error) {
      const friendly =
        error.code === '23503'
          ? 'This class is in use by existing entries and can\'t be deleted.'
          : error.message;
      setMessage({ type: 'negative', text: `Delete failed: ${friendly}` });
    } else {
      setMessage({ type: 'positive', text: 'Race class deleted.' });
      loadClasses();
    }
  }

  return (
    <div className="min-h-screen">
      <div className="fiori-shell">Race Track Admin</div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Race Classes</div>
            <h1 className="text-2xl font-semibold">Race Classes</h1>
          </div>
          <button className="fiori-btn fiori-btn-emphasized" onClick={openCreate}>
            + Create Race Class
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
              <th>Name</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={2} className="text-center text-[var(--fiori-text-subtle)] py-6">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && classes.length === 0 && (
              <tr>
                <td colSpan={2} className="text-center text-[var(--fiori-text-subtle)] py-6">
                  No race classes yet. Create one to get started.
                </td>
              </tr>
            )}
            {classes.map((row) => {
              const isEditing = editingId === row.id;

              if (isEditing) {
                return (
                  <tr key={row.id} style={{ background: '#f5f9ff' }}>
                    <td>
                      <input
                        className="fiori-input"
                        value={rowName}
                        onChange={(e) => setRowName(e.target.value)}
                        autoFocus
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="fiori-btn fiori-btn-ghost mr-2"
                        onClick={cancelRowEdit}
                        disabled={rowSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className="fiori-btn fiori-btn-emphasized"
                        onClick={() => handleRowSave(row.id)}
                        disabled={rowSaving}
                      >
                        {rowSaving ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={row.id}>
                  <td>{row.name}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="fiori-btn fiori-btn-ghost mr-2" onClick={() => openRowEdit(row)}>
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
              );
            })}
          </tbody>
        </table>
      </div>

      {panelOpen && (
        <div
          className="bg-black/40 z-50"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div className="fiori-panel w-full max-w-md rounded-sm p-8">
            <h2 className="text-lg font-semibold mb-6">Create Race Class</h2>

            <div className="mb-6">
              <label className="fiori-label">Class Name</label>
              <input
                className="fiori-input"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                placeholder="e.g. Formula Vee"
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleCreateSave()}
              />
            </div>

            <div className="flex gap-2 justify-end">
              <button className="fiori-btn fiori-btn-ghost" onClick={() => setPanelOpen(false)}>
                Cancel
              </button>
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleCreateSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}