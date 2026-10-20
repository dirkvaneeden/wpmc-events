'use client';

import { Fragment, useEffect, useMemo, useState, ReactNode } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { RaceEvent } from '@/lib/types';
import { getSignedDocumentUrl, uploadEntryDocument } from '@/lib/storage';
import { getPaymentState, paymentStateMeta, PaymentStateKey } from '@/lib/paymentState';

interface PaymentRow {
  id: string;
  amount_paid: number;
  payment_reference: string | null;
  pop_file_url: string | null;
  created_at: string;
}

interface EntryRow {
  id: string;
  race_number: string;
  sponsor: string | null;
  is_late_entry: boolean;
  fee_amount: number;
  gcr_accepted: boolean;
  status: string;
  pay_reference: string | null;
  created_at: string;
  msa_license_url: string | null;
  pop_url_driver: string | null;
  drivers: {
    full_name: string;
    email: string;
    mobile: string;
    msa_licence_no: string;
    wpmc_member_no: string | null;
    emergency_contact: string;
    emergency_tel: string;
  } | null;
  vehicles: {
    make: string;
    model: string;
    year: number;
    engine_make: string;
    capacity: string;
    cylinders: number;
  } | null;
  race_classes: { name: string; no_documents_required: boolean } | null;
  race_subclasses: { name: string } | null;
  entryFee: { description: string | null; fee: number | null } | null;
  payments: PaymentRow[];
}

const money = (n: number) => `R${n.toFixed(2)}`;

const sumPaid = (e: EntryRow) => e.payments.reduce((s, p) => s + p.amount_paid, 0);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-2">
      <div className="fiori-label">{label}</div>
      <div className="text-sm">{children || '—'}</div>
    </div>
  );
}

export default function EventEntryListPage() {
  const { id } = useParams<{ id: string }>();

  const [event, setEvent] = useState<RaceEvent | null>(null);
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<'ALL' | PaymentStateKey>('ALL');
  const [classFilter, setClassFilter] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);
  const notify = (type: 'positive' | 'negative', text: string) => setMessage({ type, text });

  useEffect(() => {
    if (id) load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Messages float at the top right so they stay visible while working lower down the page
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 7000);
    return () => clearTimeout(timer);
  }, [message]);

  async function load(showSpinner: boolean) {
    if (showSpinner) setLoading(true);

    const [eventRes, entriesRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).maybeSingle(),
      supabase
        .from('event_entries')
        .select(
          `
          id, race_number, sponsor, is_late_entry, fee_amount, gcr_accepted, status, pay_reference,
          created_at, msa_license_url, pop_url_driver,
          drivers(full_name, email, mobile, msa_licence_no, wpmc_member_no, emergency_contact, emergency_tel),
          vehicles(make, model, year, engine_make, capacity, cylinders),
          race_classes(name, no_documents_required),
          entryFee(description, fee),
          payments(id, amount_paid, payment_reference, pop_file_url, created_at)
        `
        )
        .eq('event_id', id),
    ]);

    if (!eventRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setEvent(eventRes.data);

    if (entriesRes.error) {
      notify('negative', `Couldn't load entries: ${entriesRes.error.message}`);
    } else {
      const rows = ((entriesRes.data ?? []) as unknown as EntryRow[]).map((e) => ({
        ...e,
        payments: [...e.payments].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      }));
      rows.sort((a, b) => a.race_number.localeCompare(b.race_number, undefined, { numeric: true }));
      setEntries(rows);
    }
    setLoading(false);
  }

  async function openDocument(path: string | null) {
    if (!path) return;
    // Open the tab first, so the browser doesn't treat it as a popup
    const tab = window.open('', '_blank');
    const url = await getSignedDocumentUrl(path);
    if (url && tab) {
      tab.location.href = url;
    } else {
      tab?.close();
      notify('negative', "Couldn't generate a link for that document.");
    }
  }

  function toggleExpand(entry: EntryRow) {
    if (expandedId === entry.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(entry.id);
    setAmountPaid(entry.fee_amount.toString());
    setPaymentReference(entry.pay_reference ?? '');
    setReceiptFile(null);
  }

  async function handleRequestPayment(entry: EntryRow) {
    if (!confirm(`Send a payment request to ${entry.drivers?.email ?? 'this driver'}?`)) return;

    setRequestingId(entry.id);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch('/api/admin/send-payment-request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ entryId: entry.id }),
      });
      const json: { error?: string } = await res.json().catch(() => ({}));

      if (!res.ok) {
        notify('negative', json.error ?? `Could not send the payment request (error ${res.status}).`);
      } else {
        notify('positive', `Payment request sent to ${entry.drivers?.email}.`);
      }
    } catch (err) {
      notify('negative', err instanceof Error ? err.message : 'Could not send the payment request.');
    }
    setRequestingId(null);
  }

  async function handleCapture(entry: EntryRow) {
    const amount = Number(amountPaid);
    if (!amount || amount <= 0) {
      notify('negative', 'Please enter a valid payment amount.');
      return;
    }

    setCapturing(true);

    let receiptPath: string | null = null;
    if (receiptFile) {
      try {
        receiptPath = await uploadEntryDocument(receiptFile, 'pop', entry.id);
      } catch (err) {
        setCapturing(false);
        notify('negative', `Couldn't upload the receipt: ${err instanceof Error ? err.message : 'unknown error'}`);
        return;
      }
    }

    const { error: paymentError } = await supabase.from('payments').insert({
      entry_id: entry.id,
      amount_paid: amount,
      payment_reference: paymentReference.trim() || null,
      pop_file_url: receiptPath,
      is_verified: true,
    });

    if (paymentError) {
      setCapturing(false);
      notify('negative', `Couldn't save payment: ${paymentError.message}`);
      return;
    }

    // NOTE: assumes 'PAID' exists on entry_status_enum
    const { error: statusError } = await supabase.from('event_entries').update({ status: 'PAID' }).eq('id', entry.id);

    if (statusError) {
      setCapturing(false);
      setExpandedId(null);
      notify('negative', `Payment saved, but couldn't update the entry status: ${statusError.message}`);
      load(false);
      return;
    }

    let emailNote = '';
    if (entry.drivers?.email) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        const res = await fetch('/api/send-payment-confirmation', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token ?? ''}`,
          },
          body: JSON.stringify({
            to: entry.drivers.email,
            driverName: entry.drivers.full_name,
            raceNumber: entry.race_number,
            eventName: event?.name ?? '',
            className: entry.race_classes?.name ?? '',
            vehicleDescription: entry.vehicles
              ? `${entry.vehicles.year} ${entry.vehicles.make} ${entry.vehicles.model}`
              : '',
            amountPaid: amount,
            paymentReference: paymentReference.trim(),
            entryReference: entry.pay_reference ?? entry.id,
          }),
        });
        if (!res.ok) {
          const json: { error?: string } = await res.json().catch(() => ({}));
          emailNote = ` (confirmation email failed: ${json.error ?? `error ${res.status}`})`;
        }
      } catch (err) {
        emailNote = ` (confirmation email failed: ${err instanceof Error ? err.message : 'unknown error'})`;
      }
    }

    setCapturing(false);
    setExpandedId(null);
    notify('positive', `Payment captured for #${entry.race_number}.${emailNote}`);
    load(false);
  }

  const stats = useMemo(() => {
    let expected = 0;
    let received = 0;
    let outstanding = 0;
    const counts: Record<'ALL' | PaymentStateKey, number> = {
      ALL: entries.length,
      AWAITING_POP: 0,
      POP_RECEIVED: 0,
      PAID: 0,
      NO_PAYMENT: 0,
    };
    for (const e of entries) {
      const paid = sumPaid(e);
      expected += e.fee_amount;
      received += paid;
      outstanding += e.status === 'PAID' ? 0 : Math.max(e.fee_amount - paid, 0);
      counts[getPaymentState(e.status, e.pop_url_driver, e.fee_amount)] += 1;
    }
    return { expected, received, outstanding, counts };
  }, [entries]);

  const classNames = useMemo(
    () => Array.from(new Set(entries.map((e) => e.race_classes?.name).filter((n): n is string => !!n))).sort(),
    [entries]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (stateFilter !== 'ALL' && getPaymentState(e.status, e.pop_url_driver, e.fee_amount) !== stateFilter) return false;
      if (classFilter && e.race_classes?.name !== classFilter) return false;
      if (!q) return true;
      return (
        e.race_number.toLowerCase().includes(q) ||
        (e.drivers?.full_name ?? '').toLowerCase().includes(q) ||
        (e.drivers?.email ?? '').toLowerCase().includes(q)
      );
    });
  }, [entries, search, stateFilter, classFilter]);

  if (loading) {
    return <div className="max-w-7xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>;
  }

  if (notFound || !event) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        Event not found.{' '}
        <Link href="/admin/entry-lists" className="text-[var(--fiori-action)] hover:underline">
          Back to Entry Lists
        </Link>
      </div>
    );
  }

  const chips: { key: 'ALL' | PaymentStateKey; label: string }[] = [
    { key: 'ALL', label: 'All' },
    { key: 'AWAITING_POP', label: 'Awaiting POP' },
    { key: 'POP_RECEIVED', label: 'POP received' },
    { key: 'PAID', label: 'Paid' },
    { key: 'NO_PAYMENT', label: 'No payment due' },
  ];

  const cards = [
    { label: 'Entries', value: stats.counts.ALL.toString() },
    { label: 'Expected', value: money(stats.expected) },
    { label: 'Received', value: money(stats.received) },
    { label: 'Outstanding', value: money(stats.outstanding), alert: stats.outstanding > 0 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
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
        <Link href="/admin/entry-lists" className="text-[var(--fiori-action)] hover:underline">
          Entry Lists
        </Link>{' '}
        / {event.name}
      </div>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-semibold mb-1">{event.name}</h1>
        <Link
          href={`/admin/entry-lists/${event.id}/report`}
          className="fiori-btn fiori-btn-emphasized inline-flex items-center"
        >
          Class report
        </Link>
      </div>
      <div className="text-sm text-[var(--fiori-text-subtle)] mb-6">
        {new Date(event.event_date).toLocaleDateString()} ·{' '}
        <span
          className="fiori-status-dot"
          style={{ background: event.status ? 'var(--fiori-positive)' : '#8a8d8f' }}
        />
        {event.status ? 'Open for entries' : 'Not open for entries'}
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <div key={c.label} className="fiori-panel rounded-sm p-4">
            <div className="text-xs uppercase tracking-wide text-[var(--fiori-text-subtle)] mb-1">{c.label}</div>
            <div className="text-2xl font-semibold" style={c.alert ? { color: 'var(--fiori-negative)' } : undefined}>
              {c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {chips.map((chip) => {
          const active = stateFilter === chip.key;
          return (
            <button
              key={chip.key}
              className="fiori-btn"
              style={{
                background: active ? 'var(--fiori-action)' : '#ffffff',
                color: active ? '#ffffff' : 'var(--fiori-text)',
                border: `1px solid ${active ? 'var(--fiori-action)' : 'var(--fiori-border)'}`,
              }}
              onClick={() => setStateFilter(chip.key)}
            >
              {chip.label} ({stats.counts[chip.key]})
            </button>
          );
        })}

        <div className="flex-1" />

        <select
          className="fiori-input"
          style={{ width: 200 }}
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
        >
          <option value="">All classes</option>
          {classNames.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <input
          className="fiori-input"
          style={{ width: 260 }}
          placeholder="Search name, email or race number"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <table className="fiori-table">
        <thead>
          <tr>
            <th>Race #</th>
            <th>Driver</th>
            <th>Vehicle</th>
            <th>Class</th>
            <th>Fee rate</th>
            <th>Documents</th>
            <th>Payment</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {filtered.length === 0 && (
            <tr>
              <td colSpan={8} className="text-center text-[var(--fiori-text-subtle)] py-6">
                {entries.length === 0 ? 'No entries for this event yet.' : 'No entries match your filters.'}
              </td>
            </tr>
          )}
          {filtered.map((entry) => {
            const state = getPaymentState(entry.status, entry.pop_url_driver, entry.fee_amount);
            const meta = paymentStateMeta[state];
            const isOpen = expandedId === entry.id;
            const latestReceipt = [...entry.payments].reverse().find((p) => p.pop_file_url)?.pop_file_url ?? null;
            const paid = sumPaid(entry);

            return (
              <Fragment key={entry.id}>
                <tr style={isOpen ? { background: '#f5f9ff' } : undefined}>
                  <td>
                    <span className="font-semibold">#{entry.race_number}</span>
                    {entry.is_late_entry && (
                      <span
                        className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm"
                        style={{ background: '#fdf1f1', color: 'var(--fiori-negative)' }}
                      >
                        LATE
                      </span>
                    )}
                  </td>
                  <td>
                    {entry.drivers?.full_name ?? '—'}
                    <div className="text-xs text-[var(--fiori-text-subtle)]">{entry.drivers?.email}</div>
                  </td>
                  <td>
                    {entry.vehicles ? `${entry.vehicles.year} ${entry.vehicles.make} ${entry.vehicles.model}` : '—'}
                  </td>
                  <td>
                    {entry.race_classes?.name ?? '—'}
                    {entry.race_subclasses && (
                      <div className="text-xs text-[var(--fiori-text-subtle)]">{entry.race_subclasses.name}</div>
                    )}
                  </td>
                  <td>
                    {entry.entryFee?.description ?? '—'}
                    <div className="text-xs text-[var(--fiori-text-subtle)]">{money(entry.fee_amount)}</div>
                  </td>
                  <td>
                    <div className="flex gap-3 text-sm">
                      {entry.msa_license_url && (
                        <button
                          className="text-[var(--fiori-action)] hover:underline"
                          onClick={() => openDocument(entry.msa_license_url)}
                        >
                          Licence
                        </button>
                      )}
                      {entry.pop_url_driver && (
                        <button
                          className="text-[var(--fiori-action)] hover:underline"
                          onClick={() => openDocument(entry.pop_url_driver)}
                        >
                          POP
                        </button>
                      )}
                      {latestReceipt && (
                        <button
                          className="text-[var(--fiori-action)] hover:underline"
                          onClick={() => openDocument(latestReceipt)}
                        >
                          Receipt
                        </button>
                      )}
                      {!entry.msa_license_url && !entry.pop_url_driver && !latestReceipt && (
                        <span className="text-[var(--fiori-text-subtle)]">
                          {entry.race_classes?.no_documents_required ? 'Not required' : '—'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className="fiori-status-dot" style={{ background: meta.color }} />
                    {meta.label}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="fiori-btn fiori-btn-ghost" onClick={() => toggleExpand(entry)}>
                      {isOpen ? 'Close' : 'Details'}
                    </button>
                  </td>
                </tr>

                {isOpen && (
                  <tr key={`${entry.id}-details`} style={{ background: '#fafbfc' }}>
                    <td colSpan={8} style={{ padding: '20px 24px' }}>
                      <div className="grid grid-cols-3 gap-8 mb-4">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--fiori-text-subtle)] mb-2">
                            Driver
                          </div>
                          <Field label="Name">{entry.drivers?.full_name}</Field>
                          <Field label="Email">{entry.drivers?.email}</Field>
                          <Field label="Mobile">{entry.drivers?.mobile}</Field>
                          <Field label="MSA licence no.">{entry.drivers?.msa_licence_no}</Field>
                          <Field label="WPMC member no.">{entry.drivers?.wpmc_member_no}</Field>
                          <Field label="Emergency contact">
                            {entry.drivers ? `${entry.drivers.emergency_contact} (${entry.drivers.emergency_tel})` : ''}
                          </Field>
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--fiori-text-subtle)] mb-2">
                            Vehicle
                          </div>
                          <Field label="Make and model">
                            {entry.vehicles ? `${entry.vehicles.make} ${entry.vehicles.model}` : ''}
                          </Field>
                          <Field label="Year">{entry.vehicles?.year}</Field>
                          <Field label="Engine make">{entry.vehicles?.engine_make}</Field>
                          <Field label="Capacity">{entry.vehicles?.capacity}</Field>
                          <Field label="Cylinders">{entry.vehicles?.cylinders}</Field>
                        </div>

                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-[var(--fiori-text-subtle)] mb-2">
                            Entry
                          </div>
                          <Field label="Sub class">{entry.race_subclasses?.name}</Field>
                          <Field label="Sponsor">{entry.sponsor}</Field>
                          <Field label="Payment reference">{entry.pay_reference}</Field>
                          <Field label="Late entry">{entry.is_late_entry ? 'Yes' : 'No'}</Field>
                          <Field label="GCR accepted">
                            {entry.gcr_accepted ? 'Yes' : entry.race_classes?.no_documents_required ? 'Not required' : 'No'}
                          </Field>
                          <Field label="Submitted">{new Date(entry.created_at).toLocaleString()}</Field>
                        </div>
                      </div>

                      <div
                        className="pt-4"
                        style={{ borderTop: '1px solid var(--fiori-border)' }}
                      >
                        <div className="text-xs font-semibold uppercase tracking-wide text-[var(--fiori-text-subtle)] mb-2">
                          Payments
                        </div>

                        {entry.payments.length === 0 ? (
                          <p className="text-sm text-[var(--fiori-text-subtle)] mb-3">
                            No payments captured yet. Fee: {money(entry.fee_amount)}.
                          </p>
                        ) : (
                          <table className="text-sm mb-3">
                            <tbody>
                              {entry.payments.map((p) => (
                                <tr key={p.id}>
                                  <td className="pr-6 py-0.5">{new Date(p.created_at).toLocaleDateString()}</td>
                                  <td className="pr-6 py-0.5 font-semibold">{money(p.amount_paid)}</td>
                                  <td className="pr-6 py-0.5 text-[var(--fiori-text-subtle)]">
                                    {p.payment_reference ?? '—'}
                                  </td>
                                  <td className="py-0.5">
                                    {p.pop_file_url && (
                                      <button
                                        className="text-[var(--fiori-action)] hover:underline"
                                        onClick={() => openDocument(p.pop_file_url)}
                                      >
                                        Receipt
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              <tr>
                                <td className="pr-6 pt-1 text-[var(--fiori-text-subtle)]">Total paid</td>
                                <td className="pr-6 pt-1 font-semibold">{money(paid)}</td>
                                <td colSpan={2} className="pt-1 text-[var(--fiori-text-subtle)]">
                                  of {money(entry.fee_amount)}
                                </td>
                              </tr>
                            </tbody>
                          </table>
                        )}

                        {entry.status !== 'PAID' && entry.fee_amount > 0 && (
                          <div className="flex flex-wrap items-end gap-3">
                            <div>
                              <label className="fiori-label">Amount received (R)</label>
                              <input
                                className="fiori-input"
                                style={{ width: 150 }}
                                type="number"
                                step="0.01"
                                value={amountPaid}
                                onChange={(e) => setAmountPaid(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="fiori-label">Payment reference</label>
                              <input
                                className="fiori-input"
                                style={{ width: 240 }}
                                value={paymentReference}
                                onChange={(e) => setPaymentReference(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="fiori-label">Receipt (optional)</label>
                              <input
                                className="fiori-input"
                                style={{ width: 240 }}
                                type="file"
                                accept="application/pdf,image/*"
                                onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                              />
                            </div>
                            <button
                              className="fiori-btn fiori-btn-emphasized"
                              onClick={() => handleCapture(entry)}
                              disabled={capturing}
                            >
                              {capturing ? 'Saving…' : 'Capture Payment'}
                            </button>
                            <button
                              className="fiori-btn fiori-btn-ghost"
                              onClick={() => handleRequestPayment(entry)}
                              disabled={requestingId === entry.id}
                            >
                              {requestingId === entry.id ? 'Sending…' : 'Request Payment'}
                            </button>
                          </div>
                        )}

                        {entry.status !== 'PAID' && Number(amountPaid) > 0 && Number(amountPaid) < entry.fee_amount && (
                          <p className="text-xs mt-2" style={{ color: 'var(--fiori-negative)' }}>
                            This is less than the fee of {money(entry.fee_amount)}. Capturing it will still mark the
                            entry as Paid.
                          </p>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}