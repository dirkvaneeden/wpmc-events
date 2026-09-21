'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Driver } from '@/lib/types';

interface DriverForm {
  msa_licence_no: string;
  wpmc_member_no: string;
  full_name: string;
  email: string;
  mobile: string;
  tel_home: string;
  tel_work: string;
  postal_address: string;
  postal_code: string;
  emergency_contact: string;
  emergency_tel: string;
  popia_email_opt_in: boolean;
  popia_sms_opt_in: boolean;
}

const emptyForm: DriverForm = {
  msa_licence_no: '',
  wpmc_member_no: '',
  full_name: '',
  email: '',
  mobile: '',
  tel_home: '',
  tel_work: '',
  postal_address: '',
  postal_code: '',
  emergency_contact: '',
  emergency_tel: '',
  popia_email_opt_in: false,
  popia_sms_opt_in: false,
};

type DriverWithCount = Driver & { vehicles: { count: number }[] };

export default function DriversPage() {
  const [drivers, setDrivers] = useState<DriverWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [form, setForm] = useState<DriverForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  async function loadDrivers() {
    setLoading(true);
    const { data, error } = await supabase
      .from('drivers')
      .select('*, vehicles(count)')
      .order('full_name', { ascending: true });

    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load drivers: ${error.message}` });
    } else {
      setDrivers((data as DriverWithCount[]) ?? []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadDrivers();
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setPanelOpen(true);
  }

  function openEdit(row: Driver) {
    setEditing(row);
    setForm({
      msa_licence_no: row.msa_licence_no,
      wpmc_member_no: row.wpmc_member_no ?? '',
      full_name: row.full_name,
      email: row.email,
      mobile: row.mobile,
      tel_home: row.tel_home ?? '',
      tel_work: row.tel_work ?? '',
      postal_address: row.postal_address,
      postal_code: row.postal_code,
      emergency_contact: row.emergency_contact,
      emergency_tel: row.emergency_tel,
      popia_email_opt_in: row.popia_email_opt_in ?? false,
      popia_sms_opt_in: row.popia_sms_opt_in ?? false,
    });
    setPanelOpen(true);
  }

  function update<K extends keyof DriverForm>(key: K, value: DriverForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    const required: (keyof DriverForm)[] = [
      'msa_licence_no',
      'full_name',
      'email',
      'mobile',
      'postal_address',
      'postal_code',
      'emergency_contact',
      'emergency_tel',
    ];
    const missing = required.find((k) => !form[k]);
    if (missing) {
      setMessage({ type: 'negative', text: 'Please fill in all required fields.' });
      return;
    }

    setSaving(true);
    const payload = {
      msa_licence_no: form.msa_licence_no.trim(),
      wpmc_member_no: form.wpmc_member_no.trim() || null,
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      mobile: form.mobile.trim(),
      tel_home: form.tel_home.trim() || null,
      tel_work: form.tel_work.trim() || null,
      postal_address: form.postal_address.trim(),
      postal_code: form.postal_code.trim(),
      emergency_contact: form.emergency_contact.trim(),
      emergency_tel: form.emergency_tel.trim(),
      popia_email_opt_in: form.popia_email_opt_in,
      popia_sms_opt_in: form.popia_sms_opt_in,
    };

    const { error } = editing
      ? await supabase.from('drivers').update(payload).eq('id', editing.id)
      : await supabase.from('drivers').insert(payload);

    setSaving(false);

    if (error) {
      const friendly =
        error.code === '23505'
          ? error.message.includes('email')
            ? 'A driver with that email already exists.'
            : 'A driver with that MSA licence number already exists.'
          : error.message;
      setMessage({ type: 'negative', text: `Save failed: ${friendly}` });
      return;
    }

    setMessage({ type: 'positive', text: editing ? 'Driver updated.' : 'Driver created.' });
    setPanelOpen(false);
    loadDrivers();
  }

  async function handleDelete(row: Driver) {
    if (!confirm(`Delete driver "${row.full_name}"? This also deletes their vehicles.`)) return;
    const { error } = await supabase.from('drivers').delete().eq('id', row.id);
    if (error) {
      setMessage({ type: 'negative', text: `Delete failed: ${error.message}` });
    } else {
      setMessage({ type: 'positive', text: 'Driver deleted.' });
      loadDrivers();
    }
  }

  const filtered = drivers.filter((d) => {
    const q = search.toLowerCase();
    return (
      d.full_name.toLowerCase().includes(q) ||
      d.email.toLowerCase().includes(q) ||
      d.msa_licence_no.toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen">
      <div className="fiori-shell">Race Track Admin</div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Drivers</div>
            <h1 className="text-2xl font-semibold">Drivers</h1>
          </div>
          <button className="fiori-btn fiori-btn-emphasized" onClick={openCreate}>
            + Create Driver
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

        <div className="mb-4">
          <input
            className="fiori-input max-w-xs"
            placeholder="Search by name, email or licence no."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <table className="fiori-table">
          <thead>
            <tr>
              <th>Full Name</th>
              <th>MSA Licence No.</th>
              <th>Email</th>
              <th>Mobile</th>
              <th style={{ textAlign: 'right' }}>Vehicles</th>
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
            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center text-[var(--fiori-text-subtle)] py-6">
                  {drivers.length === 0 ? 'No drivers yet. Create one to get started.' : 'No matches.'}
                </td>
              </tr>
            )}
            {filtered.map((row) => (
              <tr key={row.id}>
                <td>
                  <Link href={`/admin/drivers/${row.id}`} className="text-[var(--fiori-action)] hover:underline">{row.full_name}
                  </Link>
                </td>
                <td>{row.msa_licence_no}</td>
                <td>{row.email}</td>
                <td>{row.mobile}</td>
                <td style={{ textAlign: 'right' }}>{row.vehicles?.[0]?.count ?? 0}</td>
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
          <div className="fiori-panel w-full max-w-2xl rounded-sm p-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-6">{editing ? 'Edit Driver' : 'Create Driver'}</h2>

            <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
              Licence details
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="fiori-label">MSA Licence No.</label>
                <input
                  className="fiori-input"
                  value={form.msa_licence_no}
                  onChange={(e) => update('msa_licence_no', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">WPMC Member No.</label>
                <input
                  className="fiori-input"
                  value={form.wpmc_member_no}
                  onChange={(e) => update('wpmc_member_no', e.target.value)}
                />
              </div>
            </div>

            <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
              Personal details
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="col-span-2">
                <label className="fiori-label">Full Name</label>
                <input
                  className="fiori-input"
                  value={form.full_name}
                  onChange={(e) => update('full_name', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Email</label>
                <input
                  className="fiori-input"
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Mobile</label>
                <input
                  className="fiori-input"
                  value={form.mobile}
                  onChange={(e) => update('mobile', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Home Tel (optional)</label>
                <input
                  className="fiori-input"
                  value={form.tel_home}
                  onChange={(e) => update('tel_home', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Work Tel (optional)</label>
                <input
                  className="fiori-input"
                  value={form.tel_work}
                  onChange={(e) => update('tel_work', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="fiori-label">Postal Address</label>
                <textarea
                  className="fiori-input"
                  rows={2}
                  value={form.postal_address}
                  onChange={(e) => update('postal_address', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Postal Code</label>
                <input
                  className="fiori-input"
                  value={form.postal_code}
                  onChange={(e) => update('postal_code', e.target.value)}
                />
              </div>
            </div>

            <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
              Emergency contact
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="fiori-label">Contact Name</label>
                <input
                  className="fiori-input"
                  value={form.emergency_contact}
                  onChange={(e) => update('emergency_contact', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Contact Tel</label>
                <input
                  className="fiori-input"
                  value={form.emergency_tel}
                  onChange={(e) => update('emergency_tel', e.target.value)}
                />
              </div>
            </div>

            <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
              Communication preferences (POPIA)
            </div>
            <div className="flex gap-6 mb-8">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.popia_email_opt_in}
                  onChange={(e) => update('popia_email_opt_in', e.target.checked)}
                />
                Email opt-in
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.popia_sms_opt_in}
                  onChange={(e) => update('popia_sms_opt_in', e.target.checked)}
                />
                SMS opt-in
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