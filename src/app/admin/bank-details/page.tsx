'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { BankDetails } from '@/lib/types';

interface FormState {
  bank_name: string;
  acc_name: string;
  acc_number: string;
  branch_code: string;
  pop_email: string;
}

const emptyForm: FormState = {
  bank_name: '',
  acc_name: '',
  acc_number: '',
  branch_code: '',
  pop_email: '',
};

export default function BankDetailsPage() {
  const [record, setRecord] = useState<BankDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from('bank_details').select('*').limit(1).maybeSingle();

    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load bank details: ${error.message}` });
    } else if (data) {
      setRecord(data);
      setForm({
        bank_name: data.bank_name ?? '',
        acc_name: data.acc_name ?? '',
        acc_number: data.acc_number ?? '',
        branch_code: data.branch_code ?? '',
        pop_email: data.pop_email ?? '',
      });
    }
    setLoading(false);
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);

    const payload = {
      bank_name: form.bank_name.trim() || null,
      acc_name: form.acc_name.trim() || null,
      acc_number: form.acc_number.trim() || null,
      branch_code: form.branch_code.trim() || null,
      pop_email: form.pop_email.trim() || null,
    };

    const { error } = record
      ? await supabase.from('bank_details').update(payload).eq('id', record.id)
      : await supabase.from('bank_details').insert(payload);

    setSaving(false);

    if (error) {
      setMessage({ type: 'negative', text: `Save failed: ${error.message}` });
      return;
    }

    setMessage({ type: 'positive', text: record ? 'Bank details updated.' : 'Bank details created.' });
    load();
  }

  return (
    <div className="min-h-screen">
      <div className="fiori-shell">Race Track Admin</div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Bank Details</div>
        <h1 className="text-2xl font-semibold mb-6">Bank Details</h1>
        <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
          These details appear on entry confirmation emails as EFT payment instructions.
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

        {loading ? (
          <p className="text-[var(--fiori-text-subtle)]">Loading…</p>
        ) : (
          <div className="fiori-panel rounded-sm p-8">
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
                  placeholder="e.g. Western Province Motor Club"
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
                  placeholder="e.g. entries@wpmc.co.za"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : record ? 'Update Bank Details' : 'Create Bank Details'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}