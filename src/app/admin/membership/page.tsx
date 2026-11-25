'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { MembershipPrice, MembershipPriceHistory, MembershipYear } from '@/lib/types';
import {
  RoundingMode,
  REVIEW_MONTHS,
  roundingLabels,
  reducedPrice,
  reviewDueDate,
  isReviewDue,
  formatRand,
  formatDate,
  formatDateTime,
  formatMemberNo,
  parseMemberNo,
} from '@/lib/membershipPricing';

type Msg = { type: 'positive' | 'negative'; text: string } | null;

const reasonLabels: Record<MembershipPriceHistory['reason'], string> = {
  created: 'Created',
  manual: 'Manual change',
  proposal_accepted: 'Reduction accepted',
  proposal_rejected: 'Reduction rejected',
  copied: 'Copied from previous year',
};

export default function AdminMembershipPricesPage() {
  const [years, setYears] = useState<MembershipYear[]>([]);
  const [year, setYear] = useState<number | null>(null);
  const [prices, setPrices] = useState<MembershipPrice[]>([]);
  const [history, setHistory] = useState<MembershipPriceHistory[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Msg>(null);

  // reduction proposal controls
  const [pct, setPct] = useState('25');
  const [rounding, setRounding] = useState<RoundingMode>('decimals');

  // inline price edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  // copy to next year
  const [showCopy, setShowCopy] = useState(false);
  const [copyYear, setCopyYear] = useState('');
  const [copyPct, setCopyPct] = useState('0');
  const [copyRounding, setCopyRounding] = useState<RoundingMode>('decimals');

  // member numbers
  const [lastNoInput, setLastNoInput] = useState('');

  const yearRow = useMemo(() => years.find((y) => y.year === year) ?? null, [years, year]);

  useEffect(() => {
    loadYears();
  }, []);

  useEffect(() => {
    if (year !== null) {
      loadPrices(year);
      if (showHistory) loadHistory(year);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  // Pick up the saved settings whenever the selected year (or its row) changes
  useEffect(() => {
    if (yearRow) {
      setPct(String(yearRow.reduction_pct));
      setRounding(yearRow.rounding_mode);
      setLastNoInput(yearRow.last_member_no > 0 ? formatMemberNo(yearRow.year, yearRow.last_member_no) : '');
    }
  }, [yearRow]);

  async function loadYears(selectYear?: number) {
    const { data, error } = await supabase.from('membership_years').select('*').order('year', { ascending: false });
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load price lists: ${error.message}` });
      setLoading(false);
      return;
    }
    const list = (data ?? []) as MembershipYear[];
    setYears(list);
    if (list.length > 0) {
      const thisYear = new Date().getFullYear();
      setYear(
        selectYear ?? (year && list.some((y) => y.year === year) ? year : (list.find((y) => y.year === thisYear) ?? list[0]).year)
      );
    }
    setLoading(false);
  }

  async function loadPrices(y: number) {
    const { data, error } = await supabase
      .from('membership_prices')
      .select('*')
      .eq('year', y)
      .order('sort_order', { ascending: true });
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load prices: ${error.message}` });
      return;
    }
    setPrices((data ?? []) as MembershipPrice[]);
  }

  async function loadHistory(y: number) {
    const { data, error } = await supabase
      .from('membership_price_history')
      .select('*')
      .eq('year', y)
      .order('changed_at', { ascending: false })
      .limit(200);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't load history: ${error.message}` });
      return;
    }
    setHistory((data ?? []) as MembershipPriceHistory[]);
  }

  async function refresh() {
    if (year === null) return;
    await loadPrices(year);
    if (showHistory) await loadHistory(year);
  }

  const pctNumber = Number(pct);
  const pctValid = pct.trim() !== '' && !Number.isNaN(pctNumber) && pctNumber > 0 && pctNumber < 100;

  const duePrices = useMemo(() => prices.filter((p) => p.active && isReviewDue(p.price_updated_at)), [prices]);

  // ----- Manual price edit -----
  function startEdit(p: MembershipPrice) {
    setEditingId(p.id);
    setEditValue(String(p.price));
    setMessage(null);
  }

  async function saveEdit(p: MembershipPrice) {
    const value = Number(editValue.replace(',', '.'));
    if (editValue.trim() === '' || Number.isNaN(value) || value < 0) {
      setMessage({ type: 'negative', text: 'Enter a valid price.' });
      return;
    }
    const newPrice = Math.round(value * 100) / 100;
    if (newPrice === Number(p.price)) {
      setEditingId(null);
      return;
    }
    setBusy(true);
    const { error } = await supabase.from('membership_prices').update({ price: newPrice }).eq('id', p.id);
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't save the price: ${error.message}` });
      return;
    }
    setEditingId(null);
    setMessage({ type: 'positive', text: `${p.label} is now ${formatRand(newPrice)}.` });
    refresh();
  }

  // ----- Reduction proposals -----
  async function acceptOne(p: MembershipPrice) {
    if (!pctValid) {
      setMessage({ type: 'negative', text: 'Enter a reduction between 0 and 100.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('apply_price_reduction', {
      p_price_id: p.id,
      p_pct: pctNumber,
      p_rounding: rounding,
    });
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't apply the reduction: ${error.message}` });
      return;
    }
    setMessage({ type: 'positive', text: `${p.label} reduced by ${pctNumber}%.` });
    refresh();
  }

  async function rejectOne(p: MembershipPrice) {
    setBusy(true);
    const { error } = await supabase.rpc('reject_price_reduction', { p_price_id: p.id });
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't reject the reduction: ${error.message}` });
      return;
    }
    setMessage({
      type: 'positive',
      text: `Reduction rejected for ${p.label}. It will be proposed again in ${REVIEW_MONTHS} months.`,
    });
    refresh();
  }

  async function acceptAll() {
    if (!pctValid) {
      setMessage({ type: 'negative', text: 'Enter a reduction between 0 and 100.' });
      return;
    }
    setBusy(true);
    for (const p of duePrices) {
      const { error } = await supabase.rpc('apply_price_reduction', {
        p_price_id: p.id,
        p_pct: pctNumber,
        p_rounding: rounding,
      });
      if (error) {
        setBusy(false);
        setMessage({ type: 'negative', text: `Stopped at ${p.label}: ${error.message}` });
        refresh();
        return;
      }
    }
    setBusy(false);
    setMessage({ type: 'positive', text: `${duePrices.length} prices reduced by ${pctNumber}%.` });
    refresh();
  }

  async function rejectAll() {
    setBusy(true);
    for (const p of duePrices) {
      const { error } = await supabase.rpc('reject_price_reduction', { p_price_id: p.id });
      if (error) {
        setBusy(false);
        setMessage({ type: 'negative', text: `Stopped at ${p.label}: ${error.message}` });
        refresh();
        return;
      }
    }
    setBusy(false);
    setMessage({
      type: 'positive',
      text: `${duePrices.length} reductions rejected. They will be proposed again in ${REVIEW_MONTHS} months.`,
    });
    refresh();
  }

  // ----- Year settings (reduction % and default rounding) -----
  async function saveSettings() {
    if (year === null) return;
    if (!pctValid) {
      setMessage({ type: 'negative', text: 'Enter a reduction between 0 and 100.' });
      return;
    }
    setBusy(true);
    const { error } = await supabase
      .from('membership_years')
      .update({ reduction_pct: pctNumber, rounding_mode: rounding })
      .eq('year', year);
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't save the settings: ${error.message}` });
      return;
    }
    setMessage({ type: 'positive', text: `Saved ${pctNumber}% as the default for ${year}.` });
    loadYears(year);
  }

  // ----- Member number starting value -----
  async function saveLastNo() {
    if (year === null) return;
    const parsed = parseMemberNo(lastNoInput);
    if (!parsed) {
      setMessage({ type: 'negative', text: 'Use the format 26/52310 (two-digit year, slash, five digits).' });
      return;
    }
    if (parsed.prefix !== year % 100) {
      setMessage({ type: 'negative', text: `The number must start with ${String(year % 100).padStart(2, '0')}/ for ${year}.` });
      return;
    }
    if (yearRow && parsed.seq < yearRow.last_member_no) {
      const ok = window.confirm(
        `This is lower than the last number used (${formatMemberNo(year, yearRow.last_member_no)}). Duplicate numbers are blocked when approving, but continue?`
      );
      if (!ok) return;
    }
    setBusy(true);
    const { error } = await supabase.from('membership_years').update({ last_member_no: parsed.seq }).eq('year', year);
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't save the number: ${error.message}` });
      return;
    }
    setMessage({
      type: 'positive',
      text: `The next membership number will be ${formatMemberNo(year, parsed.seq + 1)}.`,
    });
    loadYears(year);
  }

  // ----- Copy to a new year -----
  function openCopy() {
    const next = (years[0]?.year ?? new Date().getFullYear()) + 1;
    setCopyYear(String(next));
    setCopyPct('0');
    setCopyRounding('decimals');
    setShowCopy(true);
    setMessage(null);
  }

  async function doCopy() {
    if (year === null) return;
    const to = Number(copyYear);
    const inc = Number(copyPct);
    if (!Number.isInteger(to) || to < 2000 || to > 2100) {
      setMessage({ type: 'negative', text: 'Enter a valid year.' });
      return;
    }
    if (years.some((y) => y.year === to)) {
      setMessage({ type: 'negative', text: `A ${to} price list already exists.` });
      return;
    }
    if (copyPct.trim() === '' || Number.isNaN(inc) || inc < -100) {
      setMessage({ type: 'negative', text: 'Enter a valid percentage increase (0 for no change).' });
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('copy_price_list', {
      p_from: year,
      p_to: to,
      p_pct: inc,
      p_rounding: copyRounding,
    });
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't copy the price list: ${error.message}` });
      return;
    }
    setShowCopy(false);
    setMessage({ type: 'positive', text: `${to} price list created from ${year} with a ${inc}% change.` });
    loadYears(to);
  }

  async function toggleHistory() {
    const next = !showHistory;
    setShowHistory(next);
    if (next && year !== null) loadHistory(year);
  }

  function renderRows(group: 'membership' | 'lounge') {
    return prices
      .filter((p) => p.price_group === group)
      .map((p) => {
        const due = p.active && isReviewDue(p.price_updated_at);
        const editing = editingId === p.id;
        return (
          <tr key={p.id}>
            <td>
              {p.label}
              {p.note && <div className="text-xs text-[var(--fiori-text-subtle)]">{p.note}</div>}
            </td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {editing ? (
                <input
                  className="fiori-input"
                  style={{ width: 110, textAlign: 'right' }}
                  value={editValue}
                  inputMode="decimal"
                  autoFocus
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveEdit(p);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
              ) : (
                formatRand(Number(p.price))
              )}
            </td>
            <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(p.price_updated_at)}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              {due ? (
                <span style={{ color: 'var(--fiori-negative)' }}>Due now</span>
              ) : (
                formatDate(reviewDueDate(p.price_updated_at).toISOString())
              )}
            </td>
            <td>
              {due && !editing && (
                <span>
                  <strong>{pctValid ? formatRand(reducedPrice(Number(p.price), pctNumber, rounding)) : '–'}</strong>{' '}
                  <button
                    className="fiori-btn fiori-btn-ghost"
                    disabled={busy || !pctValid}
                    onClick={() => acceptOne(p)}
                  >
                    Accept
                  </button>{' '}
                  <button className="fiori-btn fiori-btn-ghost" disabled={busy} onClick={() => rejectOne(p)}>
                    Reject
                  </button>
                </span>
              )}
            </td>
            <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              {editing ? (
                <>
                  <button className="fiori-btn fiori-btn-emphasized" disabled={busy} onClick={() => saveEdit(p)}>
                    Save
                  </button>{' '}
                  <button className="fiori-btn fiori-btn-ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button className="fiori-btn fiori-btn-ghost" disabled={busy} onClick={() => startEdit(p)}>
                  Edit
                </button>
              )}
            </td>
          </tr>
        );
      });
  }

  const messageBox = message && (
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
  );

  if (loading) {
    return <div className="max-w-7xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>;
  }

  if (years.length === 0 || year === null) {
    return (
      <div className="max-w-7xl mx-auto px-6 py-8">
        {messageBox}
        <p className="text-[var(--fiori-text-subtle)]">No membership price list found. Run the membership migration first.</p>
      </div>
    );
  }

  const nextNo = yearRow ? formatMemberNo(year, yearRow.last_member_no + 1) : '';

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">Admin / Membership</div>
      <h1 className="text-2xl font-semibold mb-1">Membership Prices</h1>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
        These prices feed the online membership application. Prices are reviewed every {REVIEW_MONTHS} months, and any
        price can be changed at any time.
      </p>

      {messageBox}

      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div>
          <label className="fiori-label">Price list year</label>
          <select className="fiori-input" value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {years.map((y) => (
              <option key={y.year} value={y.year}>
                {y.year}
              </option>
            ))}
          </select>
        </div>
        <button className="fiori-btn fiori-btn-ghost" onClick={openCopy} disabled={busy}>
          Copy to a new year…
        </button>
      </div>

      {showCopy && (
        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4">Copy the {year} price list</h2>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="fiori-label">New year</label>
              <input className="fiori-input" value={copyYear} onChange={(e) => setCopyYear(e.target.value)} />
            </div>
            <div>
              <label className="fiori-label">Price increase %</label>
              <input
                className="fiori-input"
                value={copyPct}
                inputMode="decimal"
                onChange={(e) => setCopyPct(e.target.value)}
              />
            </div>
            <div>
              <label className="fiori-label">Rounding</label>
              <select
                className="fiori-input"
                value={copyRounding}
                onChange={(e) => setCopyRounding(e.target.value as RoundingMode)}
              >
                {(Object.keys(roundingLabels) as RoundingMode[]).map((m) => (
                  <option key={m} value={m}>
                    {roundingLabels[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
            Example: {formatRand(1310)} with a {Number(copyPct) || 0}% increase becomes{' '}
            {formatRand(
              reducedPrice(1310, -(Number(copyPct) || 0), copyRounding)
            )}
            . You can edit any price afterwards.
          </p>
          <button className="fiori-btn fiori-btn-emphasized" onClick={doCopy} disabled={busy}>
            {busy ? 'Copying…' : 'Create price list'}
          </button>{' '}
          <button className="fiori-btn fiori-btn-ghost" onClick={() => setShowCopy(false)}>
            Cancel
          </button>
        </div>
      )}

      {/* Quarterly reduction proposal */}
      {duePrices.length > 0 && (
        <div
          className="mb-6 p-4 rounded-sm border"
          style={{ borderColor: '#e9730c', background: '#fef7f1' }}
        >
          <div className="font-semibold mb-1">
            {duePrices.length} {duePrices.length === 1 ? 'price is' : 'prices are'} {REVIEW_MONTHS} months old or older
          </div>
          <p className="text-sm mb-3">
            A reduction is proposed. Accept applies it, reject keeps the price and asks again in {REVIEW_MONTHS} months.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="fiori-label">Reduction %</label>
              <input
                className="fiori-input"
                style={{ width: 90 }}
                value={pct}
                inputMode="decimal"
                onChange={(e) => setPct(e.target.value)}
              />
            </div>
            <div>
              <label className="fiori-label">Rounding</label>
              <select
                className="fiori-input"
                value={rounding}
                onChange={(e) => setRounding(e.target.value as RoundingMode)}
              >
                {(Object.keys(roundingLabels) as RoundingMode[]).map((m) => (
                  <option key={m} value={m}>
                    {roundingLabels[m]}
                  </option>
                ))}
              </select>
            </div>
            <button className="fiori-btn fiori-btn-emphasized" disabled={busy || !pctValid} onClick={acceptAll}>
              Accept all
            </button>
            <button className="fiori-btn fiori-btn-ghost" disabled={busy} onClick={rejectAll}>
              Reject all
            </button>
          </div>
        </div>
      )}

      <table className="fiori-table">
        <thead>
          <tr>
            <th>Category</th>
            <th style={{ textAlign: 'right' }}>Price</th>
            <th>Last updated</th>
            <th>Next review</th>
            <th>Proposed ({pctValid ? `-${pctNumber}%` : '–'})</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={6} className="font-semibold bg-[var(--fiori-bg)]">
              Membership categories
            </td>
          </tr>
          {renderRows('membership')}
          <tr>
            <td colSpan={6} className="font-semibold bg-[var(--fiori-bg)]">
              Additional: Pheiffer Lounge (16 events)
            </td>
          </tr>
          {renderRows('lounge')}
        </tbody>
      </table>

      <div className="grid grid-cols-2 gap-6 mt-8">
        <div className="fiori-panel rounded-sm p-6">
          <h2 className="text-sm font-semibold mb-4">Reduction settings for {year}</h2>
          <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
            The default percentage and rounding used for the quarterly proposal. You can still change them each time
            above.
          </p>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div>
              <label className="fiori-label">Reduction %</label>
              <input className="fiori-input" value={pct} inputMode="decimal" onChange={(e) => setPct(e.target.value)} />
            </div>
            <div>
              <label className="fiori-label">Rounding</label>
              <select
                className="fiori-input"
                value={rounding}
                onChange={(e) => setRounding(e.target.value as RoundingMode)}
              >
                {(Object.keys(roundingLabels) as RoundingMode[]).map((m) => (
                  <option key={m} value={m}>
                    {roundingLabels[m]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button className="fiori-btn fiori-btn-emphasized" disabled={busy} onClick={saveSettings}>
            Save defaults
          </button>
        </div>

        <div className="fiori-panel rounded-sm p-6">
          <h2 className="text-sm font-semibold mb-4">Membership numbers for {year}</h2>
          <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
            Enter the last number already used. The next approval will propose the one after it.
          </p>
          <div className="mb-2">
            <label className="fiori-label">Last number used</label>
            <input
              className="fiori-input"
              value={lastNoInput}
              placeholder={`${String(year % 100).padStart(2, '0')}/00000`}
              onChange={(e) => setLastNoInput(e.target.value)}
            />
          </div>
          <p className="text-sm mb-4">
            Next number: <strong>{nextNo}</strong>
          </p>
          <button className="fiori-btn fiori-btn-emphasized" disabled={busy} onClick={saveLastNo}>
            Save starting number
          </button>
        </div>
      </div>

      <div className="mt-8">
        <button className="fiori-btn fiori-btn-ghost" onClick={toggleHistory}>
          {showHistory ? 'Hide price history' : 'Show price history'}
        </button>
        {showHistory && (
          <table className="fiori-table mt-4">
            <thead>
              <tr>
                <th>When</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Old</th>
                <th style={{ textAlign: 'right' }}>New</th>
                <th>Reason</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-[var(--fiori-text-subtle)] py-6">
                    No changes recorded yet.
                  </td>
                </tr>
              )}
              {history.map((h) => (
                <Fragment key={h.id}>
                  <tr>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDateTime(h.changed_at)}</td>
                    <td>{h.label}</td>
                    <td style={{ textAlign: 'right' }}>{h.old_price === null ? '–' : formatRand(Number(h.old_price))}</td>
                    <td style={{ textAlign: 'right' }}>{formatRand(Number(h.new_price))}</td>
                    <td>{reasonLabels[h.reason]}</td>
                    <td>{h.changed_by ?? ''}</td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
