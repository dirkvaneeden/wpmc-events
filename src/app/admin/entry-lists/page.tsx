'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { getPaymentState } from '@/lib/paymentState';

interface EventRow {
  id: string;
  name: string;
  event_date: string;
  status: boolean | null;
}

interface EntryLite {
  event_id: string;
  status: string;
  pop_url_driver: string | null;
  fee_amount: number;
}

interface Counts {
  total: number;
  awaiting: number;
  received: number;
  paid: number;
  noPayment: number;
}

const emptyCounts: Counts = { total: 0, awaiting: 0, received: 0, paid: 0, noPayment: 0 };

type Kind = 'OPEN' | 'PLANNED' | 'PAST';
type Filter = 'ALL' | Kind;

const kindMeta: Record<Kind, { label: string; color: string }> = {
  OPEN: { label: 'Open for entries', color: 'var(--fiori-positive)' },
  PLANNED: { label: 'Planned', color: '#427cac' },
  PAST: { label: 'Past', color: '#5e696e' },
};

const kindOrder: Record<Kind, number> = { OPEN: 0, PLANNED: 1, PAST: 2 };

function kindOf(ev: EventRow, todayStr: string): Kind {
  if (ev.event_date < todayStr) return 'PAST';
  return ev.status ? 'OPEN' : 'PLANNED';
}

async function fetchEntries(): Promise<EntryLite[]> {
  const pageSize = 1000;
  const all: EntryLite[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('event_entries')
      .select('event_id, status, pop_url_driver, fee_amount')
      .order('id')
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as EntryLite[];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

export default function EntryListsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string, Counts>>({});
  const [filter, setFilter] = useState<Filter>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const { data, error: eventsError } = await supabase.from('events').select('id, name, event_date, status');
      if (eventsError) throw eventsError;

      const entries = await fetchEntries();
      const byEvent: Record<string, Counts> = {};
      for (const e of entries) {
        const c = (byEvent[e.event_id] ??= { ...emptyCounts });
        c.total += 1;
        const state = getPaymentState(e.status, e.pop_url_driver, e.fee_amount);
        if (state === 'PAID') c.paid += 1;
        else if (state === 'POP_RECEIVED') c.received += 1;
        else if (state === 'NO_PAYMENT') c.noPayment += 1;
        else c.awaiting += 1;
      }

      setEvents((data ?? []) as EventRow[]);
      setCounts(byEvent);
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not load entry lists.');
    }
    setLoading(false);
  }

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

  const rows = events
    .map((ev) => ({ ev, kind: kindOf(ev, todayStr) }))
    .filter((r) => filter === 'ALL' || r.kind === filter)
    .sort((a, b) => {
      if (a.kind !== b.kind) return kindOrder[a.kind] - kindOrder[b.kind];
      // upcoming events soonest first, past events most recent first
      return a.kind === 'PAST'
        ? b.ev.event_date.localeCompare(a.ev.event_date)
        : a.ev.event_date.localeCompare(b.ev.event_date);
    });

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Entry Lists</div>
      <h1 className="text-2xl font-semibold mb-1">Entry Lists</h1>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
        Choose an event to see who has entered, review documents and manage payments.
      </p>

      {error && (
        <div
          className="mb-4 px-4 py-2 text-sm rounded-sm border"
          style={{ color: 'var(--fiori-negative)', borderColor: 'var(--fiori-negative)', background: '#fdf1f1' }}
        >
          {error}
        </div>
      )}

      <div className="mb-4 max-w-xs">
        <select className="fiori-input" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
          <option value="ALL">All events</option>
          <option value="OPEN">Open for entries</option>
          <option value="PLANNED">Planned</option>
          <option value="PAST">Past</option>
        </select>
      </div>

      <table className="fiori-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Date</th>
            <th>Status</th>
            <th style={{ textAlign: 'right' }}>Entries</th>
            <th style={{ textAlign: 'right' }}>Awaiting POP</th>
            <th style={{ textAlign: 'right' }}>POP received</th>
            <th style={{ textAlign: 'right' }}>Paid</th>
            <th style={{ textAlign: 'right' }}>No payment due</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={9} className="text-center text-[var(--fiori-text-subtle)] py-6">
                Loading…
              </td>
            </tr>
          )}
          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={9} className="text-center text-[var(--fiori-text-subtle)] py-6">
                No events found.
              </td>
            </tr>
          )}
          {rows.map(({ ev, kind }) => {
            const c = counts[ev.id] ?? emptyCounts;
            return (
              <tr key={ev.id}>
                <td>
                  <Link href={`/admin/entry-lists/${ev.id}`} className="text-[var(--fiori-action)] hover:underline">
                    {ev.name}
                  </Link>
                </td>
                <td>{new Date(ev.event_date).toLocaleDateString()}</td>
                <td>
                  <span className="fiori-status-dot" style={{ background: kindMeta[kind].color }} />
                  {kindMeta[kind].label}
                </td>
                <td style={{ textAlign: 'right' }}>{c.total}</td>
                <td style={{ textAlign: 'right' }}>{c.awaiting}</td>
                <td style={{ textAlign: 'right' }}>{c.received}</td>
                <td style={{ textAlign: 'right' }}>{c.paid}</td>
                <td style={{ textAlign: 'right' }}>{c.noPayment}</td>
                <td style={{ textAlign: 'right' }}>
                  <Link
                    href={`/admin/entry-lists/${ev.id}/report`}
                    className="fiori-btn fiori-btn-ghost inline-flex items-center mr-2"
                  >
                    Class report
                  </Link>
                  <Link
                    href={`/admin/entry-lists/${ev.id}`}
                    className="fiori-btn fiori-btn-ghost inline-flex items-center"
                  >
                    View entries
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}