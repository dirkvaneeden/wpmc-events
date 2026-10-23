'use client';

import { useState, useTransition } from 'react';
import {
  importOneMember, lookupMember, previewMemberImport, runMemberImport,
  type ImportPlan, type LookupResult,
} from '@/app/admin/members-import/actions';

export function MemberImport() {
  return (
    <>
      <SingleMember />
      <BulkImport />
    </>
  );
}

/* ---------------- One member by AO number ---------------- */
function SingleMember() {
  const [number, setNumber] = useState('');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [pending, start] = useTransition();
  const m = result?.member;

  return (
    <section className="panel form-group" aria-labelledby="one-title">
      <h2 id="one-title" className="form-group__title">Add One Member</h2>
      <form className="import-lookup" onSubmit={(e) => {
        e.preventDefault();
        if (number.trim()) start(async () => setResult(await lookupMember(number)));
      }}>
        <label htmlFor="ao-number" className="sr-only">Audi Outcasts number</label>
        <input id="ao-number" className="input input--medium" placeholder="e.g. AO001" value={number}
          onChange={(e) => { setNumber(e.target.value); setResult(null); }} autoComplete="off" />
        <button type="submit" className="btn" disabled={pending || !number.trim()}>
          {pending ? 'Looking up…' : 'Look Up'}
        </button>
      </form>

      {result?.error && <div className="message-strip message-strip--error" role="alert">{result.error}</div>}
      {result?.info && <div className="message-strip message-strip--success" role="status">{result.info}</div>}

      {m && (
        <div className="import-card">
          <dl className="bank-list">
            <div><dt>Number</dt><dd><strong>{m.member_number}</strong></dd></div>
            <div><dt>Name</dt><dd>{m.name}{m.nickname ? ` (${m.nickname})` : ''}</dd></div>
            <div><dt>Email</dt><dd>{m.email}</dd></div>
            {m.phone && <div><dt>Phone</dt><dd>{m.phone}</dd></div>}
            {(m.city || m.province) && <div><dt>Area</dt><dd>{[m.city, m.province].filter(Boolean).join(', ')}</dd></div>}
            {(m.model || m.year) && <div><dt>Car</dt><dd>{[m.model, m.year].filter(Boolean).join(', ')}</dd></div>}
            <div><dt>Status</dt><dd>{m.active ? 'Active' : 'Inactive'}</dd></div>
          </dl>
          {result.exists ? (
            !result.info && <p className="hint">Already a member of the store. Nothing to import.</p>
          ) : (
            <button type="button" className="btn btn--emphasized" disabled={pending}
              onClick={() => start(async () => setResult(await importOneMember(m.member_number)))}>
              {pending ? 'Importing…' : `Import ${m.member_number}`}
            </button>
          )}
        </div>
      )}
      {result?.raw && <RawRecord raw={result.raw} />}
    </section>
  );
}

/* ---------------- All new members ---------------- */
function BulkImport() {
  const [activeOnly, setActiveOnly] = useState(true);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [pending, start] = useTransition();
  const done = plan?.imported !== undefined;

  return (
    <section className="panel form-group" aria-labelledby="bulk-title">
      <h2 id="bulk-title" className="form-group__title">Import All New Members</h2>
      <p className="hint">
        Checks every member on audioutcasts.com and adds the ones that aren’t in the store yet.
        Existing members are never changed. Preview first; nothing is saved until you click Import.
      </p>

      <div className="import-actions">
        <label className="checkbox">
          <input type="checkbox" checked={activeOnly} onChange={(e) => { setActiveOnly(e.target.checked); setPlan(null); }} />
          <span>Active members only</span>
        </label>
        <button type="button" className="btn" disabled={pending}
          onClick={() => start(async () => setPlan(await previewMemberImport(activeOnly)))}>
          {pending && !plan ? 'Checking…' : 'Preview'}
        </button>
        {plan && !plan.error && !done && plan.toAdd.length > 0 && (
          <button type="button" className="btn btn--emphasized" disabled={pending}
            onClick={() => {
              if (!window.confirm(`Add ${plan.toAdd.length} new members to the store?`)) return;
              start(async () => setPlan(await runMemberImport(activeOnly)));
            }}>
            {pending ? 'Importing…' : `Import ${plan.toAdd.length} New Members`}
          </button>
        )}
      </div>

      {plan?.error && <div className="message-strip message-strip--error" role="alert">{plan.error}</div>}

      {plan && !plan.error && (
        <>
          {done && (
            <div className="message-strip message-strip--success" role="status">
              {plan.imported === 0 ? 'No new members to add.' : `${plan.imported} new members added. They can sign in with their email address.`}
            </div>
          )}
          {!plan.complete && (
            <div className="message-strip message-strip--warning" role="alert">
              The website reports {plan.total} members but only {plan.fetched} could be fetched. The API may need a different
              page setting; the members received are listed below.
            </div>
          )}

          <dl className="import-stats">
            <div><dt>On audioutcasts.com</dt><dd>{plan.total}</dd></div>
            <div><dt>{done ? 'Added' : 'New, to add'}</dt><dd>{plan.toAdd.length}</dd></div>
            <div><dt>Already in the store</dt><dd>{plan.alreadyHere}</dd></div>
            <div><dt>Skipped</dt><dd>{plan.skipped.length}</dd></div>
          </dl>

          {plan.toAdd.length > 0 && (
            <MemberTable title={done ? 'Added' : 'Will be added'} rows={plan.toAdd} />
          )}
          {plan.skipped.length > 0 && (
            <MemberTable title="Skipped (fix these on audioutcasts.com, then import again)" rows={plan.skipped} showReason />
          )}
          {plan.rawSample && <RawRecord raw={plan.rawSample} />}
        </>
      )}
    </section>
  );
}

function MemberTable({ title, rows, showReason }: { title: string; rows: { member_number: string; name: string; email: string; reason?: string }[]; showReason?: boolean }) {
  const shown = rows.slice(0, 200);
  return (
    <div className="import-table">
      <h3 className="import-table__title">{title} ({rows.length})</h3>
      <table className="rtable">
        <thead><tr><th>Number</th><th>Name</th><th>Email</th>{showReason && <th>Reason</th>}</tr></thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={`${r.member_number}-${i}`}>
              <td className="rtable__name">{r.member_number}</td>
              <td data-label="Name">{r.name}</td>
              <td data-label="Email">{r.email || '–'}</td>
              {showReason && <td data-label="Reason">{r.reason}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > shown.length && <p className="hint">…and {rows.length - shown.length} more.</p>}
    </div>
  );
}

function RawRecord({ raw }: { raw: string }) {
  return (
    <details className="import-raw">
      <summary>Show the record exactly as audioutcasts.com sent it</summary>
      <pre>{raw}</pre>
    </details>
  );
}
