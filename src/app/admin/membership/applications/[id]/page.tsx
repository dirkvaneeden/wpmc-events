'use client';

import { ReactNode, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { ApplicationRow, MEMBERSHIP_BUCKET, appRef, statusMeta } from '@/lib/membershipApplications';
import { formatDateTime, formatRand } from '@/lib/membershipPricing';

type Msg = { type: 'positive' | 'negative'; text: string } | null;

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-[var(--fiori-text-subtle)]">{label}</div>
      <div className="text-sm whitespace-pre-line">{children || '–'}</div>
    </div>
  );
}

export default function AdminMembershipApplicationPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [app, setApp] = useState<ApplicationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Msg>(null);
  const [memberNo, setMemberNo] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    const { data, error } = await supabase.from('membership_applications').select('*').eq('id', id).maybeSingle();
    if (error || !data) {
      setMessage({ type: 'negative', text: error ? `Couldn't load the application: ${error.message}` : 'Application not found.' });
      setLoading(false);
      return;
    }
    const row = data as ApplicationRow;
    setApp(row);
    setNotes(row.admin_notes ?? '');
    setLoading(false);

    // Offer the next number once payment is confirmed
    if (row.status === 'payment_confirmed') {
      const { data: proposed, error: pErr } = await supabase.rpc('propose_member_no', { p_year: row.year });
      if (pErr) setMessage({ type: 'negative', text: `Couldn't propose a member number: ${pErr.message}` });
      else setMemberNo((prev) => prev || String(proposed));
    }
  }

  async function adminEmail(): Promise<string> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    return session?.user.email ?? 'admin';
  }

  async function viewProof() {
    if (!app?.pop_url) return;
    const { data, error } = await supabase.storage.from(MEMBERSHIP_BUCKET).createSignedUrl(app.pop_url, 300);
    if (error || !data) {
      setMessage({ type: 'negative', text: `Couldn't open the proof of payment: ${error?.message ?? 'not found'}` });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener');
  }

  async function confirmPayment() {
    if (!app) return;
    setBusy(true);
    setMessage(null);
    const { error } = await supabase
      .from('membership_applications')
      .update({
        status: 'payment_confirmed',
        payment_confirmed_at: new Date().toISOString(),
        payment_confirmed_by: await adminEmail(),
      })
      .eq('id', app.id);
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't confirm the payment: ${error.message}` });
      return;
    }
    setMessage({ type: 'positive', text: 'Payment confirmed. You can now approve the membership.' });
    load();
  }

  async function undoPayment() {
    if (!app) return;
    setBusy(true);
    const { error } = await supabase
      .from('membership_applications')
      .update({ status: 'submitted', payment_confirmed_at: null, payment_confirmed_by: null })
      .eq('id', app.id);
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't undo the confirmation: ${error.message}` });
      return;
    }
    setMemberNo('');
    setMessage({ type: 'positive', text: 'Payment confirmation removed.' });
    load();
  }

  async function sendApprovalEmail(): Promise<boolean> {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setMessage({ type: 'negative', text: 'Your session expired. Please log in again.' });
      return false;
    }
    try {
      const res = await fetch('/api/admin/send-membership-approval', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ applicationId: id }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'negative', text: `Approved, but the email was not sent: ${json.error ?? 'unknown error'}` });
        return false;
      }
      return true;
    } catch (err) {
      setMessage({
        type: 'negative',
        text: `Approved, but the email was not sent: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
      return false;
    }
  }

  async function approve() {
    if (!app) return;
    const number = memberNo.trim();
    if (!/^\d{2}\/\d{5}$/.test(number)) {
      setMessage({ type: 'negative', text: 'Use the format 26/52311 (two-digit year, slash, five digits).' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.rpc('approve_membership', { p_app_id: app.id, p_member_no: number });
    if (error) {
      setBusy(false);
      setMessage({ type: 'negative', text: `Couldn't approve: ${error.message}` });
      return;
    }
    const sent = await sendApprovalEmail();
    setBusy(false);
    if (sent) setMessage({ type: 'positive', text: `Approved as ${number}. The member has been emailed.` });
    load();
  }

  async function resendEmail() {
    setBusy(true);
    setMessage(null);
    const sent = await sendApprovalEmail();
    setBusy(false);
    if (sent) setMessage({ type: 'positive', text: `Approval email sent to ${app?.email}.` });
  }

  async function reject() {
    if (!app) return;
    if (!window.confirm('Reject this application? The applicant is not emailed.')) return;
    setBusy(true);
    const { error } = await supabase.from('membership_applications').update({ status: 'rejected' }).eq('id', app.id);
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't reject: ${error.message}` });
      return;
    }
    setMessage({ type: 'positive', text: 'Application rejected.' });
    load();
  }

  async function reopen() {
    if (!app) return;
    setBusy(true);
    const { error } = await supabase
      .from('membership_applications')
      .update({ status: app.payment_confirmed_at ? 'payment_confirmed' : 'submitted' })
      .eq('id', app.id);
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't reopen: ${error.message}` });
      return;
    }
    setMessage({ type: 'positive', text: 'Application reopened.' });
    load();
  }

  async function saveNotes() {
    if (!app) return;
    setBusy(true);
    const { error } = await supabase
      .from('membership_applications')
      .update({ admin_notes: notes.trim() || null })
      .eq('id', app.id);
    setBusy(false);
    if (error) {
      setMessage({ type: 'negative', text: `Couldn't save the notes: ${error.message}` });
      return;
    }
    setMessage({ type: 'positive', text: 'Notes saved.' });
  }

  if (loading) return <div className="max-w-5xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>;

  if (!app) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p style={{ color: 'var(--fiori-negative)' }}>{message?.text ?? 'Application not found.'}</p>
        <Link href="/admin/membership/applications" className="text-[var(--fiori-action)] hover:underline text-sm">
          Back to applications
        </Link>
      </div>
    );
  }

  const meta = statusMeta[app.status];

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">
        <Link href="/admin/membership/applications" className="hover:underline">
          Admin / Membership / Applications
        </Link>{' '}
        / {appRef(app.id)}
      </div>
      <div className="flex items-center justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold">
          {`${app.first_name} ${app.surname}`.trim() || app.email}
        </h1>
        <span className="text-sm whitespace-nowrap">
          <span className="fiori-status-dot" style={{ background: meta.color }} />
          {meta.label}
        </span>
      </div>
      <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
        {app.application_type === 'renew' ? 'Renewal' : 'New membership'} {app.year}. Received{' '}
        {formatDateTime(app.created_at)}. Reference {appRef(app.id)}.
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

      {app.flagged && (
        <div
          className="mb-4 px-4 py-3 text-sm rounded-sm border"
          style={{ borderColor: '#e9730c', background: '#fef7f1' }}
        >
          <strong>Flagged:</strong> {app.flag_reason}
        </div>
      )}

      {app.status === 'draft' && (
        <div className="mb-4 px-4 py-3 text-sm rounded-sm border" style={{ borderColor: 'var(--fiori-border)', background: '#f5f7fa' }}>
          This is a saved draft. The applicant has not submitted it yet, so it cannot be approved. It appears as a
          normal application once they attach a proof of payment and submit.
        </div>
      )}

      {/* Actions */}
      <div className="fiori-panel rounded-sm p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Payment and approval</h2>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <Info label="Total due">{formatRand(Number(app.total_due))}</Info>
          <Info label="Proof of payment">
            {app.pop_url ? (
              <button type="button" className="fiori-btn fiori-btn-ghost" onClick={viewProof}>
                View proof of payment
              </button>
            ) : (
              'None attached'
            )}
          </Info>
          <Info label="Payment confirmed">
            {app.payment_confirmed_at ? `${formatDateTime(app.payment_confirmed_at)} by ${app.payment_confirmed_by ?? ''}` : ''}
          </Info>
        </div>

        {app.status === 'submitted' && (
          <div className="flex flex-wrap gap-2">
            <button className="fiori-btn fiori-btn-emphasized" disabled={busy} onClick={confirmPayment}>
              Confirm payment received
            </button>
            <button className="fiori-btn fiori-btn-ghost" style={{ color: 'var(--fiori-negative)' }} disabled={busy} onClick={reject}>
              Reject application
            </button>
          </div>
        )}

        {app.status === 'payment_confirmed' && (
          <div>
            <div className="max-w-xs mb-3">
              <label className="fiori-label">Membership number</label>
              <input className="fiori-input" value={memberNo} onChange={(e) => setMemberNo(e.target.value)} />
              <div className="text-xs text-[var(--fiori-text-subtle)] mt-1">
                Proposed from the last number used. You can overwrite it.
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="fiori-btn fiori-btn-emphasized" disabled={busy} onClick={approve}>
                {busy ? 'Approving…' : 'Approve and email member'}
              </button>
              <button className="fiori-btn fiori-btn-ghost" disabled={busy} onClick={undoPayment}>
                Undo payment confirmation
              </button>
              <button className="fiori-btn fiori-btn-ghost" style={{ color: 'var(--fiori-negative)' }} disabled={busy} onClick={reject}>
                Reject application
              </button>
            </div>
          </div>
        )}

        {app.status === 'approved' && (
          <div>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <Info label="Membership number">
                <strong>{app.member_no}</strong>
              </Info>
              <Info label="Approved">{app.approved_at ? formatDateTime(app.approved_at) : ''}</Info>
              <Info label="Approved by">{app.approved_by}</Info>
            </div>
            <button className="fiori-btn fiori-btn-ghost" disabled={busy} onClick={resendEmail}>
              Resend approval email
            </button>
          </div>
        )}

        {app.status === 'rejected' && (
          <button className="fiori-btn fiori-btn-ghost" disabled={busy} onClick={reopen}>
            Reopen application
          </button>
        )}
      </div>

      {/* Details */}
      <div className="fiori-panel rounded-sm p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Member information</h2>
        <div className="grid grid-cols-3 gap-4">
          <Info label="Surname">{app.surname}</Info>
          <Info label="Name">{app.first_name}</Info>
          <Info label="ID number">{app.id_number}</Info>
          <Info label="Email">{app.email}</Info>
          <Info label="Mobile">{app.mobile}</Info>
          <Info label="Tel (home)">{app.tel_home}</Info>
          <Info label="Tel (work)">{app.tel_work}</Info>
          <Info label="Fax">{app.fax}</Info>
          <Info label="Employer">{app.employer}</Info>
          <Info label="Occupation">{app.occupation}</Info>
          <Info label="Postal address">{app.postal_address}</Info>
          <Info label="Physical address">{app.physical_address}</Info>
        </div>
      </div>

      <div className="fiori-panel rounded-sm p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Membership</h2>
        <div className="grid grid-cols-3 gap-4">
          <Info label="Category">
            {app.category_label}
            {app.category_price !== null && ` (${formatRand(Number(app.category_price))})`}
          </Info>
          <Info label="Pheiffer Lounge">
            {app.lounge_label}
            {app.lounge_price !== null && ` (${formatRand(Number(app.lounge_price))})`}
          </Info>
          <Info label="Renewal email match">
            {app.application_type === 'renew' ? (app.renew_matched ? 'Found among approved members' : 'Not found') : 'Not applicable'}
          </Info>
        </div>

        {app.partners.length > 0 && (
          <table className="fiori-table mt-4">
            <thead>
              <tr>
                <th>Relationship</th>
                <th>Name</th>
                <th>ID no.</th>
                <th>Email</th>
                <th>Cell</th>
                <th style={{ textAlign: 'right' }}>Cost</th>
                <th>Waiver signed by</th>
              </tr>
            </thead>
            <tbody>
              {app.partners.map((p, i) => (
                <tr key={i}>
                  <td>{p.role}</td>
                  <td>{p.name}</td>
                  <td>{p.id_no}</td>
                  <td>{p.email}</td>
                  <td>{p.cell}</td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {typeof p.cost === 'number' ? (p.cost > 0 ? formatRand(p.cost) : 'Included') : ''}
                  </td>
                  <td>
                    {p.waiver_accepted ? (
                      <>
                        {p.waiver_name}
                        {p.minor ? ' (parent or guardian)' : ''}
                        {p.waiver_accepted_at && (
                          <div className="text-xs text-[var(--fiori-text-subtle)]">{formatDateTime(p.waiver_accepted_at)}</div>
                        )}
                      </>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="mt-4">
          <Info label="Sections of interest">{app.sections.length ? app.sections.join(', ') : ''}</Info>
        </div>
      </div>

      <div className="fiori-panel rounded-sm p-6 mb-6">
        <h2 className="text-sm font-semibold mb-4">Consent and waiver</h2>
        <div className="grid grid-cols-3 gap-4">
          <Info label="Email contact">{app.consent_email ? 'Yes' : 'No'}</Info>
          <Info label="Mobile contact">{app.consent_mobile ? 'Yes' : 'No'}</Info>
          <Info label="Newsletter">{app.consent_newsletter ? 'Yes' : 'No'}</Info>
          <Info label="Waiver signed by">{app.waiver_name}</Info>
          <Info label="Signed on">{app.waiver_accepted_at ? formatDateTime(app.waiver_accepted_at) : ''}</Info>
          <Info label="Parent or guardian (minor)">{app.guardian_name}</Info>
          <Info label="Emergency contact">{app.emergency_name}</Info>
          <Info label="Emergency number">{app.emergency_phone}</Info>
        </div>
      </div>

      <div className="fiori-panel rounded-sm p-6">
        <h2 className="text-sm font-semibold mb-3">Admin notes</h2>
        <textarea className="fiori-input mb-3" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <button className="fiori-btn fiori-btn-ghost" disabled={busy} onClick={saveNotes}>
          Save notes
        </button>
      </div>
    </div>
  );
}
