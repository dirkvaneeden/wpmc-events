'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface EventRow {
  id: string;
  name: string;
  event_date: string;
  status: boolean | null;
}

interface EntryAgg {
  event_id: string;
  status: string;
  fee_amount: number;
  payments: { amount_paid: number }[];
}

interface EventStats {
  entries: number;
  paid: number;
  expected: number;
  received: number;
  outstanding: number;
}

const emptyStats: EventStats = { entries: 0, paid: 0, expected: 0, received: 0, outstanding: 0 };

const money = (n: number) => `R${n.toFixed(2)}`;

async function fetchEntriesForEvents(eventIds: string[]): Promise<EntryAgg[]> {
  if (eventIds.length === 0) return [];
  const pageSize = 1000;
  const all: EntryAgg[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from('event_entries')
      .select('event_id, status, fee_amount, payments(amount_paid)')
      .in('event_id', eventIds)
      .order('id')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const page = (data as unknown as EntryAgg[]) ?? [];
    all.push(...page);
    if (page.length < pageSize) break;
  }
  return all;
}

function EventTable({
  title,
  rows,
  stats,
  emptyText,
}: {
  title: string;
  rows: EventRow[];
  stats: Record<string, EventStats>;
  emptyText: string;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold mb-3">{title}</h2>
      <table className="fiori-table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Date</th>
            <th style={{ textAlign: 'right' }}>Entries</th>
            <th style={{ textAlign: 'right' }}>Entries paid</th>
            <th style={{ textAlign: 'right' }}>Expected</th>
            <th style={{ textAlign: 'right' }}>Received</th>
            <th style={{ textAlign: 'right' }}>Outstanding</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-[var(--fiori-text-subtle)] py-6">
                {emptyText}
              </td>
            </tr>
          )}
          {rows.map((ev) => {
            const s = stats[ev.id] ?? emptyStats;
            return (
              <tr key={ev.id}>
                <td>{ev.name}</td>
                <td>{new Date(ev.event_date).toLocaleDateString()}</td>
                <td style={{ textAlign: 'right' }}>{s.entries}</td>
                <td style={{ textAlign: 'right' }}>
                  {s.paid} of {s.entries}
                </td>
                <td style={{ textAlign: 'right' }}>{money(s.expected)}</td>
                <td style={{ textAlign: 'right' }}>{money(s.received)}</td>
                <td
                  style={{
                    textAlign: 'right',
                    color: s.outstanding > 0 ? 'var(--fiori-negative)' : undefined,
                  }}
                >
                  {money(s.outstanding)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [current, setCurrent] = useState<EventRow[]>([]);
  const [planned, setPlanned] = useState<EventRow[]>([]);
  const [past, setPast] = useState<EventRow[]>([]);
  const [stats, setStats] = useState<Record<string, EventStats>>({});

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const { data, error: eventsError } = await supabase
        .from('events')
        .select('id, name, event_date, status')
        .order('event_date', { ascending: true });
      if (eventsError) throw eventsError;

      const events = (data ?? []) as EventRow[];
      const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

      const currentEvents = events.filter((e) => e.status && e.event_date >= todayStr);
      const plannedEvents = events.filter((e) => !e.status && e.event_date >= todayStr);
      const pastEvents = events
        .filter((e) => e.event_date < todayStr)
        .sort((a, b) => b.event_date.localeCompare(a.event_date))
        .slice(0, 5);

      const ids = [...currentEvents, ...plannedEvents, ...pastEvents].map((e) => e.id);
      const entries = await fetchEntriesForEvents(ids);

      const byEvent: Record<string, EventStats> = {};
      for (const entry of entries) {
        const s = (byEvent[entry.event_id] ??= { ...emptyStats });
        const paidAmount = entry.payments.reduce((sum, p) => sum + p.amount_paid, 0);
        s.entries += 1;
        if (entry.status === 'PAID') s.paid += 1;
        s.expected += entry.fee_amount;
        s.received += paidAmount;
        s.outstanding += entry.status === 'PAID' ? 0 : Math.max(entry.fee_amount - paidAmount, 0);
      }

      setCurrent(currentEvents);
      setPlanned(plannedEvents);
      setPast(pastEvents);
      setStats(byEvent);
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Could not load dashboard data.');
    }

    setLoading(false);
  }

  const openEntries = current.reduce((sum, e) => sum + (stats[e.id]?.entries ?? 0), 0);
  const openOutstanding = current.reduce((sum, e) => sum + (stats[e.id]?.outstanding ?? 0), 0);

  const cards = [
    { label: 'Open for entries', value: current.length.toString() },
    { label: 'Planned events', value: planned.length.toString() },
    { label: 'Entries in open events', value: openEntries.toString() },
    { label: 'Outstanding (open events)', value: money(openOutstanding) },
  ];

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-semibold mb-1">Dashboard</h1>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">Overview of events, entries and payments.</p>

      {error && (
        <div
          className="mb-4 px-4 py-2 text-sm rounded-sm border"
          style={{ color: 'var(--fiori-negative)', borderColor: 'var(--fiori-negative)', background: '#fdf1f1' }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p className="text-[var(--fiori-text-subtle)]">Loading…</p>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            {cards.map((c) => (
              <div key={c.label} className="fiori-panel rounded-sm p-5">
                <div className="text-xs uppercase tracking-wide text-[var(--fiori-text-subtle)] mb-2">{c.label}</div>
                <div className="text-3xl font-semibold">{c.value}</div>
              </div>
            ))}
          </div>

          <EventTable
            title="Open for entries"
            rows={current}
            stats={stats}
            emptyText="No events are open for entries right now."
          />
          <EventTable
            title="Planned events"
            rows={planned}
            stats={stats}
            emptyText="No planned events."
          />
          <EventTable title="Last 5 events" rows={past} stats={stats} emptyText="No past events yet." />
        </>
      )}
    </div>
  );
}