'use client';

import { Fragment, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { RaceEvent, RaceClass, RaceSubclass, EntryFee, BankDetails, EntryType } from '@/lib/types';

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
  const [subs, setSubs] = useState<RaceSubclass[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [newNoDocs, setNewNoDocs] = useState(false);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editNoDocs, setEditNoDocs] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Sub classes (one class panel is open at a time)
  const [openId, setOpenId] = useState<number | null>(null);
  const [newSubName, setNewSubName] = useState('');
  const [addingSub, setAddingSub] = useState(false);
  const [editingSubId, setEditingSubId] = useState<number | null>(null);
  const [editSubName, setEditSubName] = useState('');
  const [savingSub, setSavingSub] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('race_classes')
      .select('*')
      .eq('event_id', eventId)
      .order('name', { ascending: true });

    if (error) {
      notify('negative', `Couldn't load race classes: ${error.message}`);
      setLoading(false);
      return;
    }

    const classes: RaceClass[] = data ?? [];
    setRows(classes);

    if (classes.length === 0) {
      setSubs([]);
    } else {
      const subsRes = await supabase
        .from('race_subclasses')
        .select('*')
        .in(
          'class_id',
          classes.map((c) => c.id)
        )
        .order('name', { ascending: true });

      if (subsRes.error) notify('negative', `Couldn't load sub classes: ${subsRes.error.message}`);
      else setSubs(subsRes.data ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, reloadKey]);

  const subsFor = (classId: number) => subs.filter((s) => s.class_id === classId);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) {
      notify('negative', 'Class name is required.');
      return;
    }
    setAdding(true);
    const { error } = await supabase
      .from('race_classes')
      .insert({ name, no_documents_required: newNoDocs, event_id: eventId });
    setAdding(false);

    if (error) {
      notify(
        'negative',
        error.code === '23505' ? 'That class already exists for this event.' : `Save failed: ${error.message}`
      );
      return;
    }
    setNewName('');
    setNewNoDocs(false);
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
    const { error } = await supabase
      .from('race_classes')
      .update({ name, no_documents_required: editNoDocs })
      .eq('id', id);
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
    const count = subsFor(row.id).length;
    const extra = count > 0 ? ` and its ${count} sub class${count === 1 ? '' : 'es'}` : '';
    if (!confirm(`Delete the class "${row.name}"${extra} from this event?`)) return;

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

  function toggleOpen(id: number) {
    setOpenId((cur) => (cur === id ? null : id));
    setNewSubName('');
    setEditingSubId(null);
  }

  async function handleAddSub(classId: number) {
    const name = newSubName.trim();
    if (!name) {
      notify('negative', 'Sub class name is required.');
      return;
    }
    setAddingSub(true);
    const { error } = await supabase.from('race_subclasses').insert({ class_id: classId, name });
    setAddingSub(false);

    if (error) {
      notify(
        'negative',
        error.code === '23505' ? 'That sub class already exists for this class.' : `Save failed: ${error.message}`
      );
      return;
    }
    setNewSubName('');
    notify('positive', 'Sub class added.');
    load();
  }

  async function handleSaveSub(id: number) {
    const name = editSubName.trim();
    if (!name) {
      notify('negative', 'Sub class name is required.');
      return;
    }
    setSavingSub(true);
    const { error } = await supabase.from('race_subclasses').update({ name }).eq('id', id);
    setSavingSub(false);

    if (error) {
      notify(
        'negative',
        error.code === '23505' ? 'That sub class already exists for this class.' : `Save failed: ${error.message}`
      );
      return;
    }
    setEditingSubId(null);
    notify('positive', 'Sub class updated.');
    load();
  }

  async function handleDeleteSub(sub: RaceSubclass) {
    if (!confirm(`Delete the sub class "${sub.name}"?`)) return;
    const { error } = await supabase.from('race_subclasses').delete().eq('id', sub.id);

    if (error) {
      notify(
        'negative',
        error.code === '23503'
          ? "Drivers have already entered this sub class, so it can't be deleted."
          : `Delete failed: ${error.message}`
      );
      return;
    }
    notify('positive', 'Sub class deleted.');
    load();
  }

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-1">Race classes</h2>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-3">
        The classes drivers can enter for this event. Open a class&apos;s sub classes to add them, and drivers must then
        pick one when they enter that class. Tick &quot;No documentation required&quot; for classes where the MSA licence
        and proof of payment are optional and the GCR rules declaration is not shown.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-3 max-w-3xl">
        <input
          className="fiori-input"
          style={{ maxWidth: 280 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Formula Vee"
        />
        <label className="flex items-center gap-2 text-sm whitespace-nowrap">
          <input type="checkbox" checked={newNoDocs} onChange={(e) => setNewNoDocs(e.target.checked)} />
          No documentation required
        </label>
        <button className="fiori-btn fiori-btn-emphasized whitespace-nowrap" onClick={handleAdd} disabled={adding}>
          {adding ? 'Adding…' : '+ Add Class'}
        </button>
      </div>

      <table className="fiori-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Sub classes</th>
            <th>Documents</th>
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
                No race classes yet for this event.
              </td>
            </tr>
          )}
          {rows.map((row) => {
            if (editingId === row.id) {
              return (
                <tr key={row.id} style={{ background: '#eff4f9' }}>
                  <td>
                    <input
                      className="fiori-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(row.id)}
                      autoFocus
                    />
                  </td>
                  <td className="text-[var(--fiori-text-subtle)]">{subsFor(row.id).length || '—'}</td>
                  <td>
                    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
                      <input type="checkbox" checked={editNoDocs} onChange={(e) => setEditNoDocs(e.target.checked)} />
                      No documentation required
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
              );
            }

            const classSubs = subsFor(row.id);
            const isOpen = openId === row.id;

            return (
              <Fragment key={row.id}>
                <tr style={isOpen ? { background: '#eff4f9' } : undefined}>
                  <td>{row.name}</td>
                  <td>
                    <button
                      className="text-[var(--fiori-action)] hover:underline text-sm"
                      onClick={() => toggleOpen(row.id)}
                    >
                      {classSubs.length === 0
                        ? '+ Add sub classes'
                        : `${classSubs.length} sub class${classSubs.length === 1 ? '' : 'es'}`}{' '}
                      {isOpen ? '▴' : '▾'}
                    </button>
                    {classSubs.length > 0 && !isOpen && (
                      <div className="text-xs text-[var(--fiori-text-subtle)]">
                        {classSubs.map((s) => s.name).join(', ')}
                      </div>
                    )}
                  </td>
                  <td>
                    {row.no_documents_required ? (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-sm"
                        style={{ background: '#eff4f9', color: 'var(--fiori-action)' }}
                      >
                        Not required
                      </span>
                    ) : (
                      'Required'
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="fiori-btn fiori-btn-ghost mr-2"
                      onClick={() => {
                        setEditingId(row.id);
                        setEditName(row.name);
                        setEditNoDocs(row.no_documents_required ?? false);
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

                {isOpen && (
                  <tr style={{ background: '#fafafa' }}>
                    <td colSpan={4} style={{ padding: '16px 24px' }}>
                      <div className="text-xs font-semibold uppercase tracking-wide text-[var(--fiori-text-subtle)] mb-2">
                        Sub classes of {row.name}
                      </div>

                      {classSubs.length === 0 ? (
                        <p className="text-sm text-[var(--fiori-text-subtle)] mb-3">
                          No sub classes yet. Drivers entering this class won&apos;t be asked to pick one.
                        </p>
                      ) : (
                        <div className="mb-3">
                          {classSubs.map((s) =>
                            editingSubId === s.id ? (
                              <div key={s.id} className="flex items-center gap-2 mb-2">
                                <input
                                  className="fiori-input"
                                  style={{ width: 240 }}
                                  value={editSubName}
                                  onChange={(e) => setEditSubName(e.target.value)}
                                  onKeyDown={(e) => e.key === 'Enter' && handleSaveSub(s.id)}
                                  autoFocus
                                />
                                <button
                                  className="fiori-btn fiori-btn-ghost"
                                  onClick={() => setEditingSubId(null)}
                                  disabled={savingSub}
                                >
                                  Cancel
                                </button>
                                <button
                                  className="fiori-btn fiori-btn-emphasized"
                                  onClick={() => handleSaveSub(s.id)}
                                  disabled={savingSub}
                                >
                                  {savingSub ? 'Saving…' : 'Save'}
                                </button>
                              </div>
                            ) : (
                              <div key={s.id} className="flex items-center gap-4 py-1 text-sm">
                                <span style={{ minWidth: 220 }}>{s.name}</span>
                                <button
                                  className="text-[var(--fiori-action)] hover:underline"
                                  onClick={() => {
                                    setEditingSubId(s.id);
                                    setEditSubName(s.name);
                                  }}
                                >
                                  Edit
                                </button>
                                <button
                                  className="hover:underline"
                                  style={{ color: 'var(--fiori-negative)' }}
                                  onClick={() => handleDeleteSub(s)}
                                >
                                  Delete
                                </button>
                              </div>
                            )
                          )}
                        </div>
                      )}

                      <div className="flex gap-2 max-w-md">
                        <input
                          className="fiori-input"
                          value={newSubName}
                          onChange={(e) => setNewSubName(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddSub(row.id)}
                          placeholder="e.g. Over 2000cc"
                        />
                        <button
                          className="fiori-btn fiori-btn-emphasized whitespace-nowrap"
                          onClick={() => handleAddSub(row.id)}
                          disabled={addingSub}
                        >
                          {addingSub ? 'Adding…' : '+ Add Sub Class'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
/* ---------------- Entry types ---------------- */

const yesNo = (value: boolean) => (
  <span
    className="text-xs font-semibold px-2 py-0.5 rounded-sm"
    style={value ? { background: '#eff4f9', color: 'var(--fiori-action)' } : { background: '#f7f7f7', color: '#666666' }}
  >
    {value ? 'Yes' : 'No'}
  </span>
);

function EntryTypesSection({ eventId, reloadKey, notify }: SectionProps) {
  const [rows, setRows] = useState<EntryType[]>([]);
  const [loading, setLoading] = useState(true);

  const [newName, setNewName] = useState('');
  const [newPay, setNewPay] = useState(true);
  const [newDocs, setNewDocs] = useState(true);
  const [newBasic, setNewBasic] = useState(false);
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPay, setEditPay] = useState(true);
  const [editDocs, setEditDocs] = useState(true);
  const [editBasic, setEditBasic] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from('entry_types')
      .select('*')
      .eq('event_id', eventId)
      .order('name', { ascending: true });

    if (error) notify('negative', `Couldn't load entry types: ${error.message}`);
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
      notify('negative', 'Entry type name is required.');
      return;
    }
    setAdding(true);
    const { error } = await supabase.from('entry_types').insert({
      event_id: eventId,
      name,
      requires_payment: newPay,
      requires_documents: newDocs,
      is_basic: newBasic,
    });
    setAdding(false);

    if (error) {
      notify(
        'negative',
        error.code === '23505' ? 'That entry type already exists for this event.' : `Save failed: ${error.message}`
      );
      return;
    }
    setNewName('');
    setNewPay(true);
    setNewDocs(true);
    setNewBasic(false);
    notify('positive', 'Entry type added.');
    load();
  }

  async function handleSaveEdit(id: number) {
    const name = editName.trim();
    if (!name) {
      notify('negative', 'Entry type name is required.');
      return;
    }
    setSavingEdit(true);
    const { error } = await supabase
      .from('entry_types')
      .update({ name, requires_payment: editPay, requires_documents: editDocs, is_basic: editBasic })
      .eq('id', id);
    setSavingEdit(false);

    if (error) {
      notify(
        'negative',
        error.code === '23505' ? 'That entry type already exists for this event.' : `Save failed: ${error.message}`
      );
      return;
    }
    setEditingId(null);
    notify('positive', 'Entry type updated.');
    load();
  }

  async function handleDelete(row: EntryType) {
    if (!confirm(`Delete the entry type "${row.name}" from this event?`)) return;
    const { error } = await supabase.from('entry_types').delete().eq('id', row.id);

    if (error) {
      notify(
        'negative',
        error.code === '23503'
          ? "Entries have already been made with this type, so it can't be deleted."
          : `Delete failed: ${error.message}`
      );
      return;
    }
    notify('positive', 'Entry type deleted.');
    load();
  }

  const checkbox = (checked: boolean, onChange: (v: boolean) => void, label: string) => (
    <label className="flex items-center gap-2 text-sm whitespace-nowrap">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <section className="mb-10">
      <h2 className="text-lg font-semibold mb-1">Entry types</h2>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-1">
        Drivers choose one of these in a pop-up when they pick this event. With no entry types, drivers aren&apos;t
        asked, and the normal rules apply.
      </p>
      <ul className="text-xs text-[var(--fiori-text-subtle)] mb-3 list-disc pl-5">
        <li>
          <strong>Requires payment</strong> off: no fee rate, bank details or proof of payment, and the entry is
          recorded as R0.00.
        </li>
        <li>
          <strong>Requires documents</strong> off: the MSA licence and proof of payment are optional, and the GCR
          declaration is hidden.
        </li>
        <li>
          <strong>Basic details only</strong>: the form asks for the driver&apos;s name and vehicle only, with no MSA
          licence number or WPMC member number.
        </li>
      </ul>

      <div className="flex flex-wrap items-center gap-4 mb-3 max-w-4xl">
        <input
          className="fiori-input"
          style={{ maxWidth: 240 }}
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Basic"
        />
        {checkbox(newPay, setNewPay, 'Requires payment')}
        {checkbox(newDocs, setNewDocs, 'Requires documents')}
        {checkbox(newBasic, setNewBasic, 'Basic details only')}
        <button className="fiori-btn fiori-btn-emphasized whitespace-nowrap" onClick={handleAdd} disabled={adding}>
          {adding ? 'Adding…' : '+ Add Entry Type'}
        </button>
      </div>

      <table className="fiori-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Requires payment</th>
            <th>Requires documents</th>
            <th>Basic details only</th>
            <th style={{ textAlign: 'right' }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={5} className="text-center text-[var(--fiori-text-subtle)] py-6">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center text-[var(--fiori-text-subtle)] py-6">
                No entry types for this event. Drivers won&apos;t be asked to choose one.
              </td>
            </tr>
          )}
          {rows.map((row) =>
            editingId === row.id ? (
              <tr key={row.id} style={{ background: '#eff4f9' }}>
                <td>
                  <input
                    className="fiori-input"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(row.id)}
                    autoFocus
                  />
                </td>
                <td>{checkbox(editPay, setEditPay, 'Yes')}</td>
                <td>{checkbox(editDocs, setEditDocs, 'Yes')}</td>
                <td>{checkbox(editBasic, setEditBasic, 'Yes')}</td>
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
                <td>{yesNo(row.requires_payment)}</td>
                <td>{yesNo(row.requires_documents)}</td>
                <td>{yesNo(row.is_basic)}</td>
                <td style={{ textAlign: 'right' }}>
                  <button
                    className="fiori-btn fiori-btn-ghost mr-2"
                    onClick={() => {
                      setEditingId(row.id);
                      setEditName(row.name);
                      setEditPay(row.requires_payment);
                      setEditDocs(row.requires_documents);
                      setEditBasic(row.is_basic);
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
        'Copy entry types, race classes (with their sub classes), entry fees and bank details from that event? Anything this event already has is kept.'
      )
    )
      return;

    setCopying(true);
    try {
      const results = await Promise.all([
        supabase.from('race_classes').select('id, name, no_documents_required').eq('event_id', sourceId),
        supabase.from('entryFee').select('description, fee, is_active').eq('event_id', sourceId),
        supabase.from('bank_details').select('*').eq('event_id', sourceId).maybeSingle(),
        supabase.from('race_classes').select('id, name').eq('event_id', eventId),
        supabase.from('entryFee').select('description, fee').eq('event_id', eventId),
        supabase.from('bank_details').select('id').eq('event_id', eventId).maybeSingle(),
      ]);
      const failed = results.find((r) => r.error);
      if (failed?.error) throw failed.error;

      const [srcClasses, srcFees, srcBank, haveClasses, haveFees, haveBank] = results;

      // Entry types
      const [srcTypesRes, haveTypesRes] = await Promise.all([
        supabase
          .from('entry_types')
          .select('name, requires_payment, requires_documents, is_basic')
          .eq('event_id', sourceId),
        supabase.from('entry_types').select('name').eq('event_id', eventId),
      ]);
      if (srcTypesRes.error) throw srcTypesRes.error;
      if (haveTypesRes.error) throw haveTypesRes.error;

      const haveTypeNames = new Set((haveTypesRes.data ?? []).map((t) => t.name.toLowerCase()));
      const newTypes = (srcTypesRes.data ?? [])
        .filter((t) => !haveTypeNames.has(t.name.toLowerCase()))
        .map((t) => ({
          name: t.name,
          requires_payment: t.requires_payment,
          requires_documents: t.requires_documents,
          is_basic: t.is_basic,
          event_id: eventId,
        }));

      if (newTypes.length > 0) {
        const { error } = await supabase.from('entry_types').insert(newTypes);
        if (error) throw error;
      }

      // Classes
      const existingClassNames = new Set((haveClasses.data ?? []).map((c) => c.name.toLowerCase()));
      const newClasses = (srcClasses.data ?? [])
        .filter((c) => !existingClassNames.has(c.name.toLowerCase()))
        .map((c) => ({ name: c.name, no_documents_required: c.no_documents_required, event_id: eventId }));

      if (newClasses.length > 0) {
        const { error } = await supabase.from('race_classes').insert(newClasses);
        if (error) throw error;
      }

      // Sub classes, matched to the target event's classes by class name
      let newSubCount = 0;
      const sourceClassIds = (srcClasses.data ?? []).map((c) => c.id);
      if (sourceClassIds.length > 0) {
        const [srcSubsRes, targetClassesRes] = await Promise.all([
          supabase.from('race_subclasses').select('class_id, name').in('class_id', sourceClassIds),
          supabase.from('race_classes').select('id, name').eq('event_id', eventId),
        ]);
        if (srcSubsRes.error) throw srcSubsRes.error;
        if (targetClassesRes.error) throw targetClassesRes.error;

        const srcNameById = new Map<number, string>(
          (srcClasses.data ?? []).map((c) => [c.id, c.name.toLowerCase()] as [number, string])
        );
        const targetIdByName = new Map<string, number>(
          (targetClassesRes.data ?? []).map((c) => [c.name.toLowerCase(), c.id] as [string, number])
        );

        const targetClassIds = (targetClassesRes.data ?? []).map((c) => c.id);
        let haveSubs: { class_id: number; name: string }[] = [];
        if (targetClassIds.length > 0) {
          const { data, error } = await supabase
            .from('race_subclasses')
            .select('class_id, name')
            .in('class_id', targetClassIds);
          if (error) throw error;
          haveSubs = data ?? [];
        }

        const haveKeys = new Set(haveSubs.map((s) => `${s.class_id}|${s.name.toLowerCase()}`));
        const newSubs: { class_id: number; name: string }[] = [];
        for (const s of srcSubsRes.data ?? []) {
          const targetClassId = targetIdByName.get(srcNameById.get(s.class_id) ?? '');
          if (!targetClassId) continue;
          const key = `${targetClassId}|${s.name.toLowerCase()}`;
          if (haveKeys.has(key)) continue;
          haveKeys.add(key);
          newSubs.push({ class_id: targetClassId, name: s.name });
        }

        if (newSubs.length > 0) {
          const { error } = await supabase.from('race_subclasses').insert(newSubs);
          if (error) throw error;
        }
        newSubCount = newSubs.length;
      }

      // Entry fees
      const existingFees = new Set((haveFees.data ?? []).map((f) => `${f.description}|${f.fee}`));
      const newFees = (srcFees.data ?? [])
        .filter((f) => !existingFees.has(`${f.description}|${f.fee}`))
        .map((f) => ({ description: f.description, fee: f.fee, is_active: f.is_active, event_id: eventId }));

      if (newFees.length > 0) {
        const { error } = await supabase.from('entryFee').insert(newFees);
        if (error) throw error;
      }

      // Bank details
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
        `Copied ${newTypes.length} entry type(s), ${newClasses.length} class(es), ${newSubCount} sub class(es) and ${newFees.length} entry fee(s)${bankCopied ? ', plus the bank details' : ''}.`
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
        Saves retyping: copies entry types, race classes (with their sub classes), entry fees and bank details.
        Anything already set up here is kept.
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
      <EntryTypesSection eventId={event.id} reloadKey={reloadKey} notify={notify} />
      <ClassesSection eventId={event.id} reloadKey={reloadKey} notify={notify} />
      <FeesSection eventId={event.id} reloadKey={reloadKey} notify={notify} />
      <BankSection eventId={event.id} reloadKey={reloadKey} notify={notify} />
    </div>
  );
}