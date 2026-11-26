'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { ApplicationRow, ApplicationStatus, appRef, statusMeta } from '@/lib/membershipApplications';
import { formatDate, formatRand } from '@/lib/membershipPricing';
import { downloadApplicationsXlsx } from '@/lib/membershipExport';

type Filter = 'ACTION' | 'ALL' | ApplicationStatus;

export default function AdminMembershipApplicationsPage() {
  const [rows, setRows] = useState<ApplicationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('ACTION');
  const [year, setYear] = useState<'ALL' | number>('ALL');
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error: err } = await supabase
        .from('membership_applications')
        .select('*')
        .order('created_at', { ascending: false });
      if (err) setError(`Couldn't load applications: ${err.message}`);
      else setRows((data ?? []) as ApplicationRow[]);
      setLoading(false);
    })();
  }, []);

  const years = useMemo(() => Array.from(new Set(rows.map((r) => r.year))).sort((a, b) => b - a), [rows]);

  const counts = useMemo(
    () => ({
      submitted: rows.filter((r) => r.status === 'submitted').length,
      confirmed: rows.filter((r) => r.status === 'payment_confirmed').length,
      flagged: rows.filter((r) => r.flagged && (r.status === 'submitted' || r.status === 'payment_confirmed')).length,
    }),
    [rows]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (year !== 'ALL' && r.year !== year) return false;
      if (filter === 'ACTION' && !(r.status === 'submitted' || r.status === 'payment_confirmed')) return false;
      if (filter === 'ALL' && r.status === 'draft') return false;
      if (filter !== 'ACTION' && filter !== 'ALL' && r.status !== filter) return false;
      if (q) {
        const hay = `${r.first_name} ${r.surname} ${r.email} ${r.member_no ?? ''} ${appRef(r.id)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, year, search]);

  async function handleExport() {
    setExporting(true);
    try {
      await downloadApplicationsXlsx(visible);
    } catch (err) {
      setError(`Couldn't create the Excel file: ${err instanceof Error ? err.message : 'unknown error'}`);
    }
    setExporting(false);
  }

  const tile = (label: string, value: number, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="fiori-panel rounded-sm px-4 py-3 text-left"
      style={{ minWidth: 190, cursor: 'pointer' }}
    >
      <div className="text-xs text-[var(--fiori-text-subtle)]">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </button>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Membership / Applications</div>
      <h1 className="text-2xl font-semibold mb-1">Membership Applications</h1>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
        Check the proof of payment, confirm payment, then approve to issue the membership number.
      </p>

      {error && (
        <div
          className="mb-4 px-4 py-2 text-sm rounded-sm border"
          style={{ color: 'var(--fiori-negative)', borderColor: 'var(--fiori-negative)', background: '#fdf1f1' }}
        >
          {error}
        </div>
      )}

      <div className="flex flex-wrap gap-4 mb-6">
        {tile('Awaiting payment check', counts.submitted, () => setFilter('submitted'))}
        {tile('Payment confirmed, to approve', counts.confirmed, () => setFilter('payment_confirmed'))}
        {tile('Flagged for attention', counts.flagged, () => setFilter('ACTION'))}
      </div>

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="fiori-label">Show</label>
          <select className="fiori-input" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
            <option value="ACTION">Needs action</option>
            <option value="ALL">All applications</option>
            <option value="submitted">Awaiting payment check</option>
            <option value="payment_confirmed">Payment confirmed</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="draft">Drafts (not submitted)</option>
          </select>
        </div>
        <div>
          <label className="fiori-label">Year</label>
          <select
            className="fiori-input"
            value={year}
            onChange={(e) => setYear(e.target.value === 'ALL' ? 'ALL' : Number(e.target.value))}
          >
            <option value="ALL">All years</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1" style={{ minWidth: 220, maxWidth: 360 }}>
          <label className="fiori-label">Search</label>
          <input
            className="fiori-input"
            placeholder="Name, email, member no. or reference"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          type="button"
          className="fiori-btn fiori-btn-ghost"
          onClick={handleExport}
          disabled={exporting || visible.length === 0}
          title="Downloads the applications currently shown, with a second sheet for dependants"
        >
          {exporting ? 'Preparing…' : `Download Excel (${visible.length})`}
        </button>
      </div>

      <table className="fiori-table">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Received</th>
            <th>Applicant</th>
            <th>Type</th>
            <th>Category</th>
            <th style={{ textAlign: 'right' }}>Total</th>
            <th>Proof</th>
            <th>Status</th>
            <th>Member no.</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {loading && (
            <tr>
              <td colSpan={10} className="text-center text-[var(--fiori-text-subtle)] py-6">
                Loading…
              </td>
            </tr>
          )}
          {!loading && visible.length === 0 && (
            <tr>
              <td colSpan={10} className="text-center text-[var(--fiori-text-subtle)] py-6">
                No applications match.
              </td>
            </tr>
          )}
          {visible.map((r) => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{appRef(r.id)}</td>
              <td style={{ whiteSpace: 'nowrap' }}>{formatDate(r.created_at)}</td>
              <td>
                <Link
                  href={`/admin/membership/applications/${r.id}`}
                  className="text-[var(--fiori-action)] hover:underline"
                >
                  {`${r.first_name} ${r.surname}`.trim() || r.email}
                </Link>
                <div className="text-xs text-[var(--fiori-text-subtle)]">{r.email}</div>
              </td>
              <td>{r.application_type === 'renew' ? 'Renewal' : 'New'}</td>
              <td>{r.category_label}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{formatRand(Number(r.total_due))}</td>
              <td>{r.pop_url ? 'Attached' : 'None'}</td>
              <td style={{ whiteSpace: 'nowrap' }}>
                <span className="fiori-status-dot" style={{ background: statusMeta[r.status].color }} />
                {statusMeta[r.status].label}
                {r.flagged && (r.status === 'submitted' || r.status === 'payment_confirmed') && (
                  <span style={{ color: 'var(--fiori-negative)' }}> (flagged)</span>
                )}
              </td>
              <td style={{ whiteSpace: 'nowrap' }}>{r.member_no ?? ''}</td>
              <td style={{ textAlign: 'right' }}>
                <Link
                  href={`/admin/membership/applications/${r.id}`}
                  className="fiori-btn fiori-btn-ghost inline-flex items-center"
                >
                  Open
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
