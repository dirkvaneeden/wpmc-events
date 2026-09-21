'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { RaceEvent } from '@/lib/types';
import { getSignedDocumentUrl, uploadEntryDocument } from '@/lib/storage';

interface EntryRow {
  id: string;
  race_number: string;
  sponsor: string | null;
  fee_amount: number;
  status: string;
  pay_reference: string | null;
  msa_license_url: string | null;
  drivers: { full_name: string; email: string } | null;
  vehicles: { make: string; model: string; year: number } | null;
  race_classes: { name: string } | null;
  entryFee: { description: string | null } | null;
  payments: {
    amount_paid: number;
    payment_reference: string | null;
    is_verified: boolean;
    created_at: string;
    pop_file_url: string | null;
  }[];
}

export default function AdminPaymentsPage() {
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [eventId, setEventId] = useState('');
  const [entries, setEntries] = useState<EntryRow[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(false);

  const [captureId, setCaptureId] = useState<string | null>(null);
  const [amountPaid, setAmountPaid] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [capturing, setCapturing] = useState(false);

  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  useEffect(() => {
    loadEvents();
  }, []);

  async function loadEvents() {
    setLoadingEvents(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('status', true)
      .order('event_date', { ascending: true });

    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load events: ${error.message}` });
    } else {
      setEvents(data ?? []);
    }
    setLoadingEvents(false);
  }

  async function loadEntries(selectedEventId: string) {
    setLoadingEntries(true);
    const { data, error } = await supabase
      .from('event_entries')
        .select(
        `
        id, race_number, sponsor, fee_amount, status, pay_reference, msa_license_url,
        drivers(full_name, email),
        vehicles(make, model, year),
        race_classes(name),
        entryFee(description),
        payments(amount_paid, payment_reference, is_verified, created_at, pop_file_url)
        `
        )
      .eq('event_id', selectedEventId)
      .order('race_number', { ascending: true });

    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load entries: ${error.message}` });
      setEntries([]);
    } else {
      setEntries((data as unknown as EntryRow[]) ?? []);
    }
    setLoadingEntries(false);
  }

  function handleEventChange(id: string) {
    setEventId(id);
    setMessage(null);
    if (id) loadEntries(id);
    else setEntries([]);
  }

  function totalPaid(entry: EntryRow) {
    return entry.payments.reduce((sum, p) => sum + p.amount_paid, 0);
  }

  const [popFile, setPopFile] = useState<File | null>(null);

        function openCapture(entry: EntryRow) {
        setCaptureId(entry.id);
        setAmountPaid(entry.fee_amount.toString());
        setPaymentReference(entry.pay_reference ?? '');
        setPopFile(null);
        }

        function closeCapture() {
        setCaptureId(null);
        setAmountPaid('');
        setPaymentReference('');
        setPopFile(null);
}

    async function handleViewDocument(path: string | null) {
        if (!path) return;
        const tab = window.open('', '_blank');
        const url = await getSignedDocumentUrl(path);
        if (url && tab) {
            tab.location.href = url;
        } else {
            tab?.close();
            setMessage({ type: 'negative', text: "Couldn't generate a link for that document." });
        }
        }

  async function handleCapturePayment(entry: EntryRow) {
    const amount = Number(amountPaid);
    if (!amount || amount <= 0) {
      setMessage({ type: 'negative', text: 'Please enter a valid payment amount.' });
      return;
    }

    setCapturing(true);
    setMessage(null);
    let popFileUrl: string | null = null;
        if (popFile) {
        try {
            popFileUrl = await uploadEntryDocument(popFile, 'pop', entry.id);
        } catch (err) {
            setCapturing(false);
            setMessage({
            type: 'negative',
            text: `Couldn't upload POP file: ${err instanceof Error ? err.message : 'unknown error'}`,
            });
            return;
        }
    }

    const { error: paymentError } = await supabase.from('payments').insert({
      entry_id: entry.id,
      amount_paid: amount,
      payment_reference: paymentReference.trim() || null,
      pop_file_url: popFileUrl,
      is_verified: true,
    });

    if (paymentError) {
      setCapturing(false);
      setMessage({ type: 'negative', text: `Couldn't save payment: ${paymentError.message}` });
      return;
    }

    // NOTE: assumes 'PAID' exists on entry_status_enum — adjust if your actual value differs
    const { error: statusError } = await supabase
      .from('event_entries')
      .update({ status: 'PAID' })
      .eq('id', entry.id);

    if (statusError) {
      setCapturing(false);
      setMessage({
        type: 'negative',
        text: `Payment saved, but couldn't update entry status: ${statusError.message}`,
      });
      closeCapture();
      if (eventId) loadEntries(eventId);
      return;
    }

    let emailNote = '';
    if (entry.drivers?.email) {
      try {
        const res = await fetch('/api/send-payment-confirmation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: entry.drivers.email,
            driverName: entry.drivers.full_name,
            raceNumber: entry.race_number,
            eventName: events.find((e) => e.id === eventId)?.name ?? '',
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
          const json = await res.json();
          emailNote = ` (confirmation email failed: ${json.error})`;
        }
      } catch (err) {
        emailNote = ` (confirmation email failed: ${err instanceof Error ? err.message : 'unknown error'})`;
      }
    }

    setCapturing(false);
    setMessage({ type: 'positive', text: `Payment captured for #${entry.race_number}.${emailNote}` });
    closeCapture();
    loadEntries(eventId);
  }

  return (
    <div className="min-h-screen">
      <div className="fiori-shell">Race Track Admin</div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Payments</div>
        <h1 className="text-2xl font-semibold mb-6">Event Payments</h1>

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

        <div className="mb-6 max-w-md">
          <label className="fiori-label">Select Active Event</label>
          <select
            className="fiori-input"
            value={eventId}
            onChange={(e) => handleEventChange(e.target.value)}
            disabled={loadingEvents}
          >
            <option value="">{loadingEvents ? 'Loading…' : '— Select an event —'}</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.name}
              </option>
            ))}
          </select>
        </div>

        {eventId && (
          <table className="fiori-table">
            <thead>
              <tr>
                <th>Race #</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Class</th>
                <th>Fee</th>
                <th style={{ textAlign: 'right' }}>Paid</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
                <th>Documents</th>
              </tr>
            </thead>
            <tbody>
              {loadingEntries && (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--fiori-text-subtle)] py-6">
                    Loading…
                  </td>
                </tr>
              )}
              {!loadingEntries && entries.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center text-[var(--fiori-text-subtle)] py-6">
                    No entries for this event yet.
                  </td>
                </tr>
              )}
              {entries.map((entry) => {
                const paid = totalPaid(entry);
                const isPaid = entry.status === 'PAID';
                const isCapturing = captureId === entry.id;

                return (
                  <tr key={entry.id} style={isCapturing ? { background: '#f5f9ff' } : undefined}>
                    <td>#{entry.race_number}</td>
                    <td>
                      {entry.drivers?.full_name ?? '—'}
                      <div className="text-xs text-[var(--fiori-text-subtle)]">{entry.drivers?.email}</div>
                    </td>
                    <td>
                      {entry.vehicles
                        ? `${entry.vehicles.year} ${entry.vehicles.make} ${entry.vehicles.model}`
                        : '—'}
                    </td>
                    <td>{entry.race_classes?.name ?? '—'}</td>
                    <td>R{entry.fee_amount.toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>R{paid.toFixed(2)}</td>
                    <td>
                      <span
                        className="fiori-status-dot"
                        style={{ background: isPaid ? 'var(--fiori-positive)' : '#8a8d8f' }}
                      />
                      {entry.status}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {isPaid ? (
                        <span className="text-xs text-[var(--fiori-text-subtle)]">
                          Paid {entry.payments[entry.payments.length - 1]?.payment_reference ?? ''}
                        </span>
                      ) : isCapturing ? (
                        <div className="flex flex-col gap-2 items-end">
                          <input
                            className="fiori-input"
                            style={{ width: 140 }}
                            type="number"
                            step="0.01"
                            value={amountPaid}
                            onChange={(e) => setAmountPaid(e.target.value)}
                            placeholder="Amount paid"
                          />
                          <input
                            className="fiori-input"
                            style={{ width: 140 }}
                            value={paymentReference}
                            onChange={(e) => setPaymentReference(e.target.value)}
                            placeholder="POP reference"
                          />
                          <input
                            className="fiori-input"
                            style={{ width: 180 }}
                            type="file"
                            accept="application/pdf,image/*"
                            onChange={(e) => setPopFile(e.target.files?.[0] ?? null)}
                          />
                          <div className="flex gap-2">
                            <button className="fiori-btn fiori-btn-ghost" onClick={closeCapture} disabled={capturing}>
                              Cancel
                            </button>
                            <button
                              className="fiori-btn fiori-btn-emphasized"
                              onClick={() => handleCapturePayment(entry)}
                              disabled={capturing}
                            >
                              {capturing ? 'Saving…' : 'Confirm'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button className="fiori-btn fiori-btn-emphasized" onClick={() => openCapture(entry)}>
                          Capture Payment
                        </button>
                      )}
                    </td>
                    <td>
                        {entry.msa_license_url ? (
                            <button className="fiori-btn fiori-btn-ghost" onClick={() => handleViewDocument(entry.msa_license_url)}>
                            Licence
                            </button>
                        ) : (
                            <span className="text-xs text-[var(--fiori-text-subtle)]">No licence</span>
                        )}
                        {entry.payments[entry.payments.length - 1]?.pop_file_url && (
                            <button
                            className="fiori-btn fiori-btn-ghost ml-2"
                            onClick={() => handleViewDocument(entry.payments[entry.payments.length - 1].pop_file_url)}
                            >
                            POP
                            </button>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}