'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { RaceEvent } from '@/lib/types';
import { formatEventDates } from '@/lib/eventDates';

function toDatetimeLocal(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface EditForm {
  name: string;
  event_date: string;
  end_date: string;
  late_entry_cutoff: string;
  gdrive_folder_id: string;
  status: boolean;
}

const emptyForm: EditForm = {
  name: '',
  event_date: '',
  end_date: '',
  late_entry_cutoff: '',
  gdrive_folder_id: '',
  status: false,
};

// Keeps the end date in step with the start date: blank or earlier than the start moves to the start
function withStart(form: EditForm, start: string): EditForm {
  const end = !form.end_date || form.end_date < start ? start : form.end_date;
  return { ...form, event_date: start, end_date: end };
}

function validate(f: EditForm): string | null {
  if (!f.name.trim() || !f.event_date || !f.late_entry_cutoff) {
    return 'Name, start date, and late entry cutoff are required.';
  }
  if (f.end_date && f.end_date < f.event_date) {
    return "The end date can't be before the start date.";
  }
  return null;
}

function toPayload(f: EditForm) {
  return {
    name: f.name.trim(),
    event_date: f.event_date,
    end_date: f.end_date || f.event_date,
    late_entry_cutoff: new Date(f.late_entry_cutoff).toISOString(),
    gdrive_folder_id: f.gdrive_folder_id.trim() || null,
    status: f.status,
  };
}

export default function EventsPage() {
  const router = useRouter();
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline row editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowForm, setRowForm] = useState<EditForm | null>(null);
  const [rowSaving, setRowSaving] = useState(false);

  // Create dialog
  const [panelOpen, setPanelOpen] = useState(false);
  const [createForm, setCreateForm] = useState<EditForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  async function loadEvents() {
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .order('event_date', { ascending: true });

    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load events: ${error.message}` });
    } else {
      setEvents(data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadEvents();
  }, []);

  // --- Create (dialog) ---

  function openCreate() {
    setEditingId(null);
    setRowForm(null);
    setMessage(null);
    setCreateForm(emptyForm);
    setPanelOpen(true);
  }

  async function handleCreateSave() {
    const problem = validate(createForm);
    if (problem) {
      setMessage({ type: 'negative', text: problem });
      return;
    }

    setSaving(true);
    const { data: created, error } = await supabase
      .from('events')
      .insert(toPayload(createForm))
      .select('id')
      .single();
    setSaving(false);

    if (error || !created) {
      setMessage({ type: 'negative', text: `Save failed: ${error?.message ?? 'unknown error'}` });
      return;
    }

    setMessage(null);
    setPanelOpen(false);
    // Go straight to the setup page to add classes, entry fees and bank details
    router.push(`/admin/events/${created.id}`);
  }

  // --- Edit (inline row) ---

  function openRowEdit(row: RaceEvent) {
    setMessage(null);
    setEditingId(row.id);
    setRowForm({
      name: row.name,
      event_date: row.event_date,
      end_date: row.end_date ?? row.event_date,
      late_entry_cutoff: toDatetimeLocal(row.late_entry_cutoff),
      gdrive_folder_id: row.gdrive_folder_id ?? '',
      status: row.status ?? false,
    });
  }

  function cancelRowEdit() {
    setEditingId(null);
    setRowForm(null);
  }

  async function handleRowSave(id: string) {
    if (!rowForm) return;
    const problem = validate(rowForm);
    if (problem) {
      setMessage({ type: 'negative', text: problem });
      return;
    }

    setRowSaving(true);
    const { error } = await supabase.from('events').update(toPayload(rowForm)).eq('id', id);
    setRowSaving(false);

    if (error) {
      setMessage({ type: 'negative', text: `Save failed: ${error.message}` });
      return;
    }

    setMessage({ type: 'positive', text: 'Event updated.' });
    setEditingId(null);
    setRowForm(null);
    loadEvents();
  }

  async function toggleStatus(row: RaceEvent) {
    const { error } = await supabase.from('events').update({ status: !row.status }).eq('id', row.id);

    if (error) {
      setMessage({ type: 'negative', text: `Couldn't update status: ${error.message}` });
    } else {
      setMessage({
        type: 'positive',
        text: `"${row.name}" set to ${!row.status ? 'active' : 'inactive'}.`,
      });
      loadEvents();
    }
  }

  const banner = message && (
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
  );

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Events</div>
          <h1 className="text-2xl font-semibold">Events</h1>
        </div>
        <button className="fiori-btn fiori-btn-emphasized" onClick={openCreate}>
          + Create Event
        </button>
      </div>

      {!panelOpen && banner}

      <table className="fiori-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Dates</th>
            <th>Late Entry Cutoff</th>
            <th>Drive Folder ID</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={6} className="text-center text-[var(--fiori-text-subtle)] py-6">
                Loading…
              </td>
            </tr>
          )}
          {!loading && events.length === 0 && (
            <tr>
              <td colSpan={6} className="text-center text-[var(--fiori-text-subtle)] py-6">
                No events yet. Create one to get started.
              </td>
            </tr>
          )}
          {events.map((row) => {
            const isEditing = editingId === row.id;

            if (isEditing && rowForm) {
              return (
                <tr key={row.id} style={{ background: '#eff4f9' }}>
                  <td>
                    <input
                      className="fiori-input"
                      value={rowForm.name}
                      onChange={(e) => setRowForm({ ...rowForm, name: e.target.value })}
                    />
                  </td>
                  <td>
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="fiori-label">Start</label>
                        <input
                          className="fiori-input"
                          type="date"
                          value={rowForm.event_date}
                          onChange={(e) => setRowForm(withStart(rowForm, e.target.value))}
                        />
                      </div>
                      <div>
                        <label className="fiori-label">End</label>
                        <input
                          className="fiori-input"
                          type="date"
                          min={rowForm.event_date || undefined}
                          value={rowForm.end_date}
                          onChange={(e) => setRowForm({ ...rowForm, end_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </td>
                  <td>
                    <input
                      className="fiori-input"
                      type="datetime-local"
                      value={rowForm.late_entry_cutoff}
                      onChange={(e) => setRowForm({ ...rowForm, late_entry_cutoff: e.target.value })}
                    />
                  </td>
                  <td>
                    <input
                      className="fiori-input"
                      value={rowForm.gdrive_folder_id}
                      onChange={(e) => setRowForm({ ...rowForm, gdrive_folder_id: e.target.value })}
                      placeholder="optional"
                    />
                  </td>
                  <td>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={rowForm.status}
                        onChange={(e) => setRowForm({ ...rowForm, status: e.target.checked })}
                      />
                      Active
                    </label>
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
                <td>
                  <Link href={`/admin/events/${row.id}`} className="text-[var(--fiori-action)] hover:underline">
                    {row.name}
                  </Link>
                </td>
                <td>{formatEventDates(row.event_date, row.end_date)}</td>
                <td>{new Date(row.late_entry_cutoff).toLocaleString()}</td>
                <td>{row.gdrive_folder_id || '—'}</td>
                <td>
                  <span
                    className="fiori-status-dot"
                    style={{ background: row.status ? 'var(--fiori-positive)' : '#5e696e' }}
                  />
                  {row.status ? 'Active' : 'Inactive'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <Link
                    href={`/admin/events/${row.id}`}
                    className="fiori-btn fiori-btn-ghost mr-2 inline-flex items-center"
                  >
                    Setup
                  </Link>
                  <button className="fiori-btn fiori-btn-ghost mr-2" onClick={() => openRowEdit(row)}>
                    Edit
                  </button>
                  <button className="fiori-btn fiori-btn-ghost" onClick={() => toggleStatus(row)}>
                    {row.status ? 'Set Inactive' : 'Set Active'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
          <div className="fiori-panel w-full max-w-lg rounded-sm p-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-6">Create Event</h2>

            {banner}

            <div className="mb-4">
              <label className="fiori-label">Event Name</label>
              <input
                className="fiori-input"
                value={createForm.name}
                onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                placeholder="e.g. Winter Sprint Series Rd 3"
              />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-1">
              <div>
                <label className="fiori-label">Start Date</label>
                <input
                  className="fiori-input"
                  type="date"
                  value={createForm.event_date}
                  onChange={(e) => setCreateForm(withStart(createForm, e.target.value))}
                />
              </div>
              <div>
                <label className="fiori-label">End Date</label>
                <input
                  className="fiori-input"
                  type="date"
                  min={createForm.event_date || undefined}
                  value={createForm.end_date}
                  onChange={(e) => setCreateForm({ ...createForm, end_date: e.target.value })}
                />
              </div>
            </div>
            <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
              For a one-day event, leave the end date the same as the start date.
            </p>

            <div className="mb-4">
              <label className="fiori-label">Late Entry Cutoff</label>
              <input
                className="fiori-input"
                type="datetime-local"
                value={createForm.late_entry_cutoff}
                onChange={(e) => setCreateForm({ ...createForm, late_entry_cutoff: e.target.value })}
              />
            </div>

            <div className="mb-4">
              <label className="fiori-label">Google Drive Folder ID (optional)</label>
              <input
                className="fiori-input"
                value={createForm.gdrive_folder_id}
                onChange={(e) => setCreateForm({ ...createForm, gdrive_folder_id: e.target.value })}
                placeholder="e.g. 1A2b3C4d5E6f..."
              />
            </div>

            <div className="mb-6 flex items-center gap-2">
              <input
                id="create_status"
                type="checkbox"
                checked={createForm.status}
                onChange={(e) => setCreateForm({ ...createForm, status: e.target.checked })}
              />
              <label htmlFor="create_status" className="text-sm">
                Active
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                className="fiori-btn fiori-btn-ghost"
                onClick={() => {
                  setMessage(null);
                  setPanelOpen(false);
                }}
              >
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