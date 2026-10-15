'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { RaceEvent, RaceClass, EntryFee, BankDetails } from '@/lib/types';

type Notify = (type: 'positive' | 'negative', text: string) => void;

interface SectionProps {
  eventId: string;
  reloadKey: number;
  notify: Notify;
}

function parseFee(value: string): number | null {
  if (value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/* ---------------- Race classes ---------------- */

function ClassesSection({ eventId, reloadKey, notify }: SectionProps) {
  const [rows, setRows] = useState<RaceClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('race_classes')
      .select('*')
      .eq('event_id', eventId)
      .order('name', { ascending: true });

    if (error) notify('negative', `Couldn't load race classes: ${error.message}`);
    else setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, reloadKey]);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      notify('negative', 'Class name is required.');
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('race_classes').insert({ name, event_id: eventId });
    setAdding(false);

    if (error) {
      notify(
        'negative',
        error.code === '23505' ? 'That class already exists for this event.' : `Save failed: ${error.message}`
      );
      return;
    }
    setNewName('');
    notify('positive', 'Race class added.');
    load();
  }

  async function handleSaveEdit(id: number) {
    const name = editName.trim();
    if (!name) {
      notify('negative', 'Class name is required.');
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase.from('race_classes').update({ name }).eq('id', id);
    setSavingEdit(false);

    if (error) {
      notify(
        'negative',
        error.code === '23505' ? 'That class already exists for this event.' : `Save failed: ${error.message}`
      );
      return;
    }
    setEditingId(null);
    notify('positive', 'Race class updated.');
    load();
  }

  async function handleDelete(row: RaceClass) {
    if (!confirm(`Delete the class "${row.name}" from this event?`)) return;
    const { error } = await supabase.from('race_classes').delete().eq('id', row.id);

    if (error) {
      notify(
        'negative',
        error.code === '23503'
          ? "Drivers have already entered this class, so it can't be deleted."
          : `Delete failed: ${error.message}`
      );
      return;
    }
    notify('positive', 'Race class deleted.');
    load();
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-1">Race classes</h2>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-3">The classes drivers can enter for this event.</p>

      <div className="flex gap-2 mb-3 max-w-md">
        <input
          className="fiori-input"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Formula Vee"
        />
        <button className="fiori-btn fiori-btn-emphasized whitespace-nowrap" onClick={handleAdd} disabled={adding}>
          {adding ? 'Adding…' : '+ Add Class'}
        </button>
      </div>

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
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={2} className="text-center text-[var(--fiori-text-subtle)] py-6">
                No race classes yet for this event.
              </td>
            </tr>
          )}
          {rows.map((row) =>
            editingId === row.id ? (
              <tr key={row.id} style={{ background: '#f5f9ff' }}>
                <td>
                  <input
                    className="fiori-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(row.id)}
                    autoFocus
                  />
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="fiori-btn fiori-btn-ghost mr-2"
                    onClick={() => setEditingId(null)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                  <button
                    className="fiori-btn fiori-btn-emphasized"
                    onClick={() => handleSaveEdit(row.id)}
                    disabled={savingEdit}
                  >
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={row.id}>
                <td>{row.name}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="fiori-btn fiori-btn-ghost mr-2"
                    onClick={() => {
                      setEditingId(row.id);
                      setEditName(row.name);
                    }}
                  >
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
            )
          )}
        </tbody>
      </table>
    </section>
  );
}

/* ---------------- Entry fees ---------------- */

function FeesSection({ eventId, reloadKey, notify }: SectionProps) {
  const [rows, setRows] = useState<EntryFee[]>([]);
  const [loading, setLoading] = useState(true);

  const [newDescription, setNewDescription] = useState('');
  const [newFee, setNewFee] = useState('');
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDescription, setEditDescription] = useState('');
  const [editFee, setEditFee] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('entryFee')
      .select('*')
      .eq('event_id', eventId)
      .order('description', { ascending: true });

    if (error) notify('negative', `Couldn't load entry fees: ${error.message}`);
    else setRows(data ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, reloadKey]);

  async function handleAdd() {
    const fee = parseFee(newFee);
    if (!newDescription.trim() || fee === null) {
      notify('negative', 'Enter a description and a valid fee.');
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from('entryFee')
      .insert({ description: newDescription.trim(), fee, is_active: true, event_id: eventId });
    setAdding(false);

    if (error) {
      notify('negative', `Save failed: ${error.message}`);
      return;
    }
    setNewDescription('');
    setNewFee('');
    notify('positive', 'Entry fee added.');
    load();
  }

  async function handleSaveEdit(id: number) {
    const fee = parseFee(editFee);
    if (!editDescription.trim() || fee === null) {
      notify('negative', 'Enter a description and a valid fee.');
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from('entryFee')
      .update({ description: editDescription.trim(), fee, is_active: editActive })
      .eq('id', id);
    setSavingEdit(false);

    if (error) {
      notify('negative', `Save failed: ${error.message}`);
      return;
    }
    setEditingId(null);
    notify('positive', 'Entry fee updated.');
    load();
  }

  async function handleDelete(row: EntryFee) {
    if (!confirm(`Delete the entry fee "${row.description}" from this event?`)) return;
    const { error } = await supabase.from('entryFee').delete().eq('id', row.id);

    if (error) {
      notify(
        'negative',
        error.code === '23503'
          ? 'Drivers have already entered using this fee, so it can\'t be deleted. Set it to inactive instead.'
          : `Delete failed: ${error.message}`
      );
      return;
    }
    notify('positive', 'Entry fee deleted.');
    load();
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-1">Entry fees</h2>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-3">
        The fee rates drivers can choose from. Only active rates are shown to drivers.
      </p>

      <div className="flex gap-2 mb-3 max-w-2xl">
        <input
          className="fiori-input"
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          placeholder="e.g. Standard Entry"
        />
        <input
          className="fiori-input"
          style={{ maxWidth: 140 }}
          type="number"
          step="0.01"
          min="0"
          value={newFee}
          onChange={(e) => setNewFee(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="Fee (R)"
        />
        <button className="fiori-btn fiori-btn-emphasized whitespace-nowrap" onClick={handleAdd} disabled={adding}>
          {adding ? 'Adding…' : '+ Add Fee'}
        </button>
      </div>

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
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={4} className="text-center text-[var(--fiori-text-subtle)] py-6">
                No entry fees yet for this event.
              </td>
            </tr>
          )}
          {rows.map((row) =>
            editingId === row.id ? (
              <tr key={row.id} style={{ background: '#f5f9ff' }}>
                <td>
                  <input
                    className="fiori-input"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    autoFocus
                  />
                </td>
                <td>
                  <input
                    className="fiori-input"
                    type="number"
                    step="0.01"
                    min="0"
                    value={editFee}
                    onChange={(e) => setEditFee(e.target.value)}
                    style={{ textAlign: 'right' }}
                  />
                </td>
                <td>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                    Active
                  </label>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="fiori-btn fiori-btn-ghost mr-2"
                    onClick={() => setEditingId(null)}
                    disabled={savingEdit}
                  >
                    Cancel
                  </button>
                  <button
                    className="fiori-btn fiori-btn-emphasized"
                    onClick={() => handleSaveEdit(row.id)}
                    disabled={savingEdit}
                  >
                    {savingEdit ? 'Saving…' : 'Save'}
                  </button>
                </td>
              </tr>
            ) : (
              <tr key={row.id}>
                <td>{row.description || '—'}</td>
                <td style={{ textAlign: 'right' }}>R{(row.fee ?? 0).toFixed(2)}</td>
                <td>
                  <span
                    className="fiori-status-dot"
                    style={{ background: row.is_active ? 'var(--fiori-positive)' : '#8a8d8f' }}
                  />
                  {row.is_active ? 'Active' : 'Inactive'}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="fiori-btn fiori-btn-ghost mr-2"
                    onClick={() => {
                      setEditingId(row.id);
                      setEditDescription(row.description ?? '');
                      setEditFee((row.fee ?? 0).toString());
                      setEditActive(row.is_active ?? true);
                    }}
                  >
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
            )
          )}
        </tbody>
      </table>
    </section>
  );
}

/* ---------------- Bank details ---------------- */

interface BankForm {
  bank_name: string;
  acc_name: string;
  acc_number: string;
  branch_code: string;
  pop_email: string;
}

const emptyBank: BankForm = { bank_name: '', acc_name: '', acc_number: '', branch_code: '', pop_email: '' };

function BankSection({ eventId, reloadKey, notify }: SectionProps) {
  const [record, setRecord] = useState<BankDetails | null>(null);
  const [form, setForm] = useState<BankForm>(emptyBank);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('bank_details').select('*').eq('event_id', eventId).maybeSingle();

    if (error) {
      notify('negative', `Couldn't load bank details: ${error.message}`);
    } else if (data) {
      setRecord(data);
      setForm({
        bank_name: data.bank_name ?? '',
        acc_name: data.acc_name ?? '',
        acc_number: data.acc_number ?? '',
        branch_code: data.branch_code ?? '',
        pop_email: data.pop_email ?? '',
      });
    } else {
      setRecord(null);
      setForm(emptyBank);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, reloadKey]);

  function update<K extends keyof BankForm>(key: K, value: BankForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const payload = {
      bank_name: form.bank_name.trim() || null,
      acc_name: form.acc_name.trim() || null,
      acc_number: form.acc_number.trim() || null,
      branch_code: form.branch_code.trim() || null,
      pop_email: form.pop_email.trim() || null,
    };

    const { error } = record
      ? await supabase.from('bank_details').update(payload).eq('id', record.id)
      : await supabase.from('bank_details').insert({ ...payload, event_id: eventId });
    setSaving(false);

    if (error) {
      notify('negative', `Save failed: ${error.message}`);
      return;
    }
    notify('positive', record ? 'Bank details updated.' : 'Bank details saved.');
    load();
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-1">Bank details</h2>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-3">
        Shown to drivers when they pay for this event, and used in payment request emails.
      </p>

      {loading ? (
        <p className="text-[var(--fiori-text-subtle)]">Loading…</p>
      ) : (
        <div className="fiori-panel rounded-sm p-6">
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label className="fiori-label">Bank Name</label>
              <input
                className="fiori-input"
                value={form.bank_name}
                onChange={(e) => update('bank_name', e.target.value)}
                placeholder="e.g. First National Bank (FNB)"
              />
            </div>
            <div>
              <label className="fiori-label">Account Name</label>
              <input
                className="fiori-input"
                value={form.acc_name}
                onChange={(e) => update('acc_name', e.target.value)}
              />
            </div>
            <div>
              <label className="fiori-label">Account Number</label>
              <input
                className="fiori-input"
                value={form.acc_number}
                onChange={(e) => update('acc_number', e.target.value)}
              />
            </div>
            <div>
              <label className="fiori-label">Branch Code</label>
              <input
                className="fiori-input"
                value={form.branch_code}
                onChange={(e) => update('branch_code', e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <label className="fiori-label">Proof of Payment Email</label>
              <input
                className="fiori-input"
                type="email"
                value={form.pop_email}
                onChange={(e) => update('pop_email', e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button className="fiori-btn fiori-btn-emphasized" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : record ? 'Update Bank Details' : 'Save Bank Details'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ---------------- Copy from another event ---------------- */

function CopyPanel({ eventId, onCopied, notify }: { eventId: string; onCopied: () => void; notify: Notify }) {
  const [others, setOthers] = useState<Pick<RaceEvent, 'id' | 'name' | 'event_date'>[]>([]);
  const [sourceId, setSourceId] = useState('');
  const [copying, setCopying] = useState(false);

  useEffect(() => {
    async function loadOthers() {
      const { data } = await supabase
        .from('events')
        .select('id, name, event_date')
        .neq('id', eventId)
        .order('event_date', { ascending: false });
      setOthers(data ?? []);
    }
    loadOthers();
  }, [eventId]);

  async function handleCopy() {
    if (!sourceId) return;
    if (
      !confirm(
        'Copy race classes, entry fees and bank details from that event? Anything this event already has is kept.'
      )
    )
      return;

    setCopying(true);
    try {
      const results = await Promise.all([
        supabase.from('race_classes').select('name').eq('event_id', sourceId),
        supabase.from('entryFee').select('description, fee, is_active').eq('event_id', sourceId),
        supabase.from('bank_details').select('*').eq('event_id', sourceId).maybeSingle(),
        supabase.from('race_classes').select('name').eq('event_id', eventId),
        supabase.from('entryFee').select('description, fee').eq('event_id', eventId),
        supabase.from('bank_details').select('id').eq('event_id', eventId).maybeSingle(),
      ]);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;

      const [srcClasses, srcFees, srcBank, haveClasses, haveFees, haveBank] = results;

      const existingClassNames = new Set((haveClasses.data ?? []).map((c) => c.name.toLowerCase()));
      const newClasses = (srcClasses.data ?? [])
        .filter((c) => !existingClassNames.has(c.name.toLowerCase()))
        .map((c) => ({ name: c.name, event_id: eventId }));

      const existingFees = new Set((haveFees.data ?? []).map((f) => `${f.description}|${f.fee}`));
      const newFees = (srcFees.data ?? [])
        .filter((f) => !existingFees.has(`${f.description}|${f.fee}`))
        .map((f) => ({ description: f.description, fee: f.fee, is_active: f.is_active, event_id: eventId }));

      if (newClasses.length > 0) {
        const { error } = await supabase.from('race_classes').insert(newClasses);
        if (error) throw error;
      }
      if (newFees.length > 0) {
        const { error } = await supabase.from('entryFee').insert(newFees);
        if (error) throw error;
      }

      let bankCopied = false;
      if (srcBank.data && !haveBank.data) {
        const b = srcBank.data;
        const { error } = await supabase.from('bank_details').insert({
          bank_name: b.bank_name,
          acc_name: b.acc_name,
          acc_number: b.acc_number,
          branch_code: b.branch_code,
          pop_email: b.pop_email,
          event_id: eventId,
        });
        if (error) throw error;
        bankCopied = true;
      }

      notify(
        'positive',
        `Copied ${newClasses.length} class(es) and ${newFees.length} entry fee(s)${bankCopied ? ', plus the bank details' : ''}.`
      );
      setSourceId('');
      onCopied();
    } catch (err) {
      notify('negative', `Copy failed: ${(err as { message?: string }).message ?? 'unknown error'}`);
    }
    setCopying(false);
  }

  return (
    <div className="fiori-panel rounded-sm p-4 mb-8">
      <div className="text-sm font-semibold mb-1">Copy setup from another event</div>
      <p className="text-xs text-[var(--fiori-text-subtle)] mb-3">
        Saves retyping: copies race classes, entry fees and bank details. Anything already set up here is kept.
      </p>
      <div className="flex gap-2 max-w-xl">
        <select className="fiori-input" value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
          <option value="">{others.length === 0 ? 'No other events' : '— Select an event —'}</option>
          {others.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.name} ({new Date(ev.event_date).toLocaleDateString()})
            </option>
          ))}
        </select>
        <button
          className="fiori-btn fiori-btn-ghost whitespace-nowrap"
          onClick={handleCopy}
          disabled={!sourceId || copying}
        >
          {copying ? 'Copying…' : 'Copy'}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Page ---------------- */

export default function EventSetupPage() {
  const { id } = useParams<{ id: string }>();
  const [event, setEvent] = useState<RaceEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  const notify: Notify = (type, text) => setMessage({ type, text });

  useEffect(() => {
    async function loadEvent() {
      setLoading(true);
      const { data } = await supabase.from('events').select('*').eq('id', id).maybeSingle();
      setEvent(data ?? null);
      setLoading(false);
    }
    if (id) loadEvent();
  }, [id]);

  // Messages float at the top right so they stay visible while working lower down the page
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 6000);
    return () => clearTimeout(timer);
  }, [message]);

  if (loading) {
    return <div className="max-w-5xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>;
  }

  if (!event) {
    return <div className="max-w-5xl mx-auto px-6 py-8">Event not found.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {message && (
        <div
          className="fixed right-6 top-16 z-50 max-w-sm px-4 py-2 text-sm rounded-sm border shadow-md"
          style={{
            color: message.type === 'positive' ? 'var(--fiori-positive)' : 'var(--fiori-negative)',
            borderColor: message.type === 'positive' ? 'var(--fiori-positive)' : 'var(--fiori-negative)',
            background: message.type === 'positive' ? '#f1faf4' : '#fdf1f1',
          }}
        >
          {message.text}
        </div>
      )}

      <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">
        <Link href="/admin/events" className="text-[var(--fiori-action)] hover:underline">
          Events
        </Link>{' '}
        / {event.name}
      </div>
      <h1 className="text-2xl font-semibold mb-1">{event.name}</h1>
      <div className="text-sm text-[var(--fiori-text-subtle)] mb-1">
        {new Date(event.event_date).toLocaleDateString()} · Late entries after{' '}
        {new Date(event.late_entry_cutoff).toLocaleString()} ·{' '}
        <span
          className="fiori-status-dot"
          style={{ background: event.status ? 'var(--fiori-positive)' : '#8a8d8f' }}
        />
        {event.status ? 'Active' : 'Inactive'}
      </div>
      <p className="text-xs text-[var(--fiori-text-subtle)] mb-6">
        To change the name, date or cutoff, or to open or close the event, use the{' '}
        <Link href="/admin/events" className="text-[var(--fiori-action)] hover:underline">
          Events list
        </Link>
        .
      </p>

      <CopyPanel eventId={event.id} onCopied={() => setReloadKey((k) => k + 1)} notify={notify} />
      <ClassesSection eventId={event.id} reloadKey={reloadKey} notify={notify} />
      <FeesSection eventId={event.id} reloadKey={reloadKey} notify={notify} />
      <BankSection eventId={event.id} reloadKey={reloadKey} notify={notify} />
    </div>
  );
}