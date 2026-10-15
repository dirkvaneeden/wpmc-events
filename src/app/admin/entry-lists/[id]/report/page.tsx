'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { RaceEvent } from '@/lib/types';
import { REPORT_SELECT, ReportEntry, groupByClass, reportFileName, vehicleText } from '@/lib/classReport';
import { getPaymentState, paymentStateMeta } from '@/lib/paymentState';

export default function ClassReportPage() {
  const { id } = useParams<{ id: string }>();

  const [event, setEvent] = useState<RaceEvent | null>(null);
  const [entries, setEntries] = useState<ReportEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);
    const [eventRes, entriesRes] = await Promise.all([
      supabase.from('events').select('*').eq('id', id).maybeSingle(),
      supabase.from('event_entries').select(REPORT_SELECT).eq('event_id', id),
    ]);

    if (!eventRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setEvent(eventRes.data);

    if (entriesRes.error) {
      setError(`Couldn't load entries: ${entriesRes.error.message}`);
    } else {
      setEntries((entriesRes.data ?? []) as unknown as ReportEntry[]);
    }
    setLoading(false);
  }

  async function handleDownload() {
    if (!event) return;
    setDownloading(true);
    setError(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(`/api/admin/class-report?eventId=${encodeURIComponent(event.id)}`, {
        headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
      });

      if (!res.ok) {
        const json: { error?: string } = await res.json().catch(() => ({}));
        throw new Error(json.error ?? `Download failed (error ${res.status}).`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = reportFileName(event.name, event.event_date);
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed.');
    }

    setDownloading(false);
  }

  const groups = useMemo(() => groupByClass(entries), [entries]);

  if (loading) {
    return <div className="max-w-6xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>;
  }

  if (notFound || !event) {
    return (
      <div className="max-w-6xl mx-auto px-6 py-8">
        Event not found.{' '}
        <Link href="/admin/entry-lists" className="text-[var(--fiori-action)] hover:underline">
          Back to Entry Lists
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">
        <Link href="/admin/entry-lists" className="text-[var(--fiori-action)] hover:underline">
          Entry Lists
        </Link>{' '}
        /{' '}
        <Link href={`/admin/entry-lists/${event.id}`} className="text-[var(--fiori-action)] hover:underline">
          {event.name}
        </Link>{' '}
        / Class report
      </div>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold mb-1">Class report</h1>
          <div className="text-sm text-[var(--fiori-text-subtle)]">
            {event.name} · {new Date(event.event_date).toLocaleDateString()} · {entries.length}{' '}
            {entries.length === 1 ? 'entry' : 'entries'} in {groups.length} {groups.length === 1 ? 'class' : 'classes'}
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/admin/entry-lists/${event.id}`}
            className="fiori-btn fiori-btn-ghost inline-flex items-center"
          >
            ← Entry list
          </Link>
          <button
            className="fiori-btn fiori-btn-emphasized"
            onClick={handleDownload}
            disabled={downloading || entries.length === 0}
          >
            {downloading ? 'Preparing…' : 'Download Excel'}
          </button>
        </div>
      </div>

      {error && (
        <div
          className="mb-4 px-4 py-2 text-sm rounded-sm border"
          style={{ color: 'var(--fiori-negative)', borderColor: 'var(--fiori-negative)', background: '#fdf1f1' }}
        >
          {error}
        </div>
      )}

      {groups.length === 0 && (
        <div className="fiori-panel rounded-sm p-6 text-[var(--fiori-text-subtle)]">
          No entries for this event yet.
        </div>
      )}

      {groups.map((g) => (
        <section key={g.className} className="mb-8">
          <div className="flex items-baseline justify-between mb-2">
            <h2 className="text-lg font-semibold">{g.className}</h2>
            <div className="text-sm text-[var(--fiori-text-subtle)]">
              {g.entries.length} {g.entries.length === 1 ? 'entry' : 'entries'} · {g.paid} paid · {g.popReceived} POP
              received · {g.awaiting} awaiting POP
            </div>
          </div>

          <table className="fiori-table">
            <thead>
              <tr>
                <th style={{ width: 110 }}>Race #</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Sponsor</th>
                <th>Fee rate</th>
                <th>Payment</th>
              </tr>
            </thead>
            <tbody>
              {g.entries.map((e) => {
                const meta = paymentStateMeta[getPaymentState(e.status, e.pop_url_driver)];
                return (
                  <tr key={e.id}>
                    <td>
                      <span className="font-semibold">#{e.race_number}</span>
                      {e.is_late_entry && (
                        <span
                          className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm"
                          style={{ background: '#fdf1f1', color: 'var(--fiori-negative)' }}
                        >
                          LATE
                        </span>
                      )}
                    </td>
                    <td>{e.drivers?.full_name ?? '—'}</td>
                    <td>{vehicleText(e.vehicles) || '—'}</td>
                    <td>{e.sponsor || '—'}</td>
                    <td>{e.entryFee?.description ?? '—'}</td>
                    <td>
                      <span className="fiori-status-dot" style={{ background: meta.color }} />
                      {meta.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}