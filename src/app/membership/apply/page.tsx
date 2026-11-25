'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { MembershipPrice } from '@/lib/types';
import { formatRand } from '@/lib/membershipPricing';
import FileField from '@/components/FileField';
import {
  ApplicationPayload,
  BANK_DETAILS,
  FREE_ENTRY_NOTE,
  MAX_POP_BYTES,
  MAX_QTY,
  MINOR_WAIVER_TEXT,
  PARTNER_CATEGORY_KEYS,
  PARTNER_NOTE,
  PARTNER_ROWS,
  POPIA_POINTS,
  SECTIONS,
  WAIVER_PARAGRAPHS,
  WAIVER_TITLE,
} from '@/lib/membershipForm';

type Msg = { type: 'positive' | 'negative'; text: string } | null;
type PartnerRow = { role: string; name: string; id_no: string; email: string; cell: string };

const emptyPartners: PartnerRow[] = PARTNER_ROWS.map((role) => ({ role, name: '', id_no: '', email: '', cell: '' }));

export default function MembershipApplyPage() {
  const [year, setYear] = useState<number | null>(null);
  const [prices, setPrices] = useState<MembershipPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [type, setType] = useState<'new' | 'renew'>('new');
  const [surname, setSurname] = useState('');
  const [firstName, setFirstName] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [email, setEmail] = useState('');
  const [mobile, setMobile] = useState('');
  const [telHome, setTelHome] = useState('');
  const [telWork, setTelWork] = useState('');
  const [fax, setFax] = useState('');
  const [employer, setEmployer] = useState('');
  const [occupation, setOccupation] = useState('');
  const [postalAddress, setPostalAddress] = useState('');
  const [physicalAddress, setPhysicalAddress] = useState('');

  const [selected, setSelected] = useState<Record<string, number>>({}); // category_key -> qty
  const [loungeKey, setLoungeKey] = useState<string>('');
  const [partners, setPartners] = useState<PartnerRow[]>(emptyPartners);
  const [sections, setSections] = useState<string[]>([]);

  const [consentEmail, setConsentEmail] = useState(false);
  const [consentMobile, setConsentMobile] = useState(false);
  const [consentNewsletter, setConsentNewsletter] = useState(false);

  const [waiverAccepted, setWaiverAccepted] = useState(false);
  const [waiverName, setWaiverName] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [isMinor, setIsMinor] = useState(false);
  const [guardianName, setGuardianName] = useState('');

  const [pop, setPop] = useState<File | null>(null);
  const [website, setWebsite] = useState(''); // honeypot

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Msg>(null);
  const [done, setDone] = useState<{ reference: string; total: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: yearRows, error: yErr } = await supabase
        .from('membership_years')
        .select('year')
        .order('year', { ascending: false });
      if (yErr || !yearRows?.length) {
        setLoadError('Membership prices are not available right now. Please try again later.');
        setLoading(false);
        return;
      }
      const thisYear = new Date().getFullYear();
      const y = yearRows.some((r) => r.year === thisYear) ? thisYear : yearRows[0].year;
      const { data, error } = await supabase
        .from('membership_prices')
        .select('*')
        .eq('year', y)
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (error || !data) {
        setLoadError('Membership prices are not available right now. Please try again later.');
      } else {
        setYear(y);
        setPrices(data as MembershipPrice[]);
      }
      setLoading(false);
    })();
  }, []);

  const membershipPrices = useMemo(() => prices.filter((p) => p.price_group === 'membership'), [prices]);
  const loungePrices = useMemo(() => prices.filter((p) => p.price_group === 'lounge'), [prices]);

  const total = useMemo(() => {
    let sum = 0;
    for (const p of membershipPrices) {
      const qty = selected[p.category_key];
      if (qty) sum += Number(p.price) * qty;
    }
    const lounge = loungePrices.find((p) => p.category_key === loungeKey);
    if (lounge) sum += Number(lounge.price);
    return Math.round(sum * 100) / 100;
  }, [membershipPrices, loungePrices, selected, loungeKey]);

  const needsPartner = Object.keys(selected).some((k) => PARTNER_CATEGORY_KEYS.includes(k));

  function toggleCategory(key: string) {
    setSelected((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = 1;
      return next;
    });
  }

  function setQty(key: string, qty: number) {
    setSelected((prev) => ({ ...prev, [key]: qty }));
  }

  function toggleSection(s: string) {
    setSections((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));
  }

  function updatePartner(i: number, field: keyof PartnerRow, value: string) {
    setPartners((prev) => prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  function validate(): string | null {
    if (!surname.trim()) return 'Enter your surname.';
    if (!firstName.trim()) return 'Enter your name.';
    if (!idNumber.trim()) return 'Enter your ID number.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'Enter a valid email address.';
    if (!mobile.trim()) return 'Enter your mobile number.';
    if (!postalAddress.trim()) return 'Enter your postal address.';
    if (Object.keys(selected).length === 0) return 'Choose at least one membership category.';
    if (needsPartner && !partners[0].name.trim()) return 'Enter your partner details.';
    if (!emergencyName.trim() || !emergencyPhone.trim()) return 'Enter an emergency contact name and number.';
    if (isMinor && !guardianName.trim()) return 'Enter the parent or guardian name.';
    if (!waiverAccepted) return 'Accept the waiver and indemnity to continue.';
    if (!waiverName.trim()) return 'Type your full name to sign the waiver.';
    if (pop && pop.size > MAX_POP_BYTES) return 'The proof of payment must be smaller than 4 MB.';
    return null;
  }

  async function handleSubmit() {
    const problem = validate();
    if (problem) {
      setMessage({ type: 'negative', text: problem });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setSubmitting(true);
    setMessage(null);

    const payload: ApplicationPayload = {
      application_type: type,
      surname,
      first_name: firstName,
      id_number: idNumber,
      email,
      mobile,
      tel_home: telHome,
      tel_work: telWork,
      fax,
      employer,
      occupation,
      postal_address: postalAddress,
      physical_address: physicalAddress,
      categories: Object.entries(selected).map(([key, qty]) => ({ key, qty })),
      lounge_key: loungeKey || null,
      partners: partners.filter((p) => p.name.trim()),
      sections,
      consent_email: consentEmail,
      consent_mobile: consentMobile,
      consent_newsletter: consentNewsletter,
      waiver_accepted: waiverAccepted,
      waiver_name: waiverName,
      emergency_name: emergencyName,
      emergency_phone: emergencyPhone,
      is_minor: isMinor,
      guardian_name: guardianName,
      website,
    };

    const fd = new FormData();
    fd.append('payload', JSON.stringify(payload));
    if (pop) fd.append('pop', pop);

    try {
      const res = await fetch('/api/membership/apply', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'negative', text: json.error ?? 'Your application could not be submitted.' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        setDone({ reference: json.reference, total: json.total });
        window.scrollTo({ top: 0 });
      }
    } catch (err) {
      setMessage({ type: 'negative', text: err instanceof Error ? err.message : 'Unknown error.' });
    }
    setSubmitting(false);
  }

  const shell = <div className="fiori-shell">Western Province Motor Club: Membership</div>;

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col">
        {shell}
        <div className="p-8 text-[var(--fiori-text-subtle)]">Loading…</div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen flex flex-col">
        {shell}
        <div className="p-8" style={{ color: 'var(--fiori-negative)' }}>
          {loadError}
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex flex-col">
        {shell}
        <div className="flex-1 flex items-center justify-center px-6 py-10">
          <div className="fiori-panel w-full max-w-lg rounded-sm p-8">
            <h1 className="text-xl font-semibold mb-2">Application received</h1>
            <p className="text-sm mb-4">
              Thank you, {firstName}. Your reference is <strong>{done.reference}</strong>. We have sent a confirmation
              to {email.trim()}.
            </p>
            <div className="rounded-sm border p-4 mb-4" style={{ borderColor: 'var(--fiori-border)' }}>
              <div className="text-xs text-[var(--fiori-text-subtle)]">Total due</div>
              <div className="text-2xl font-semibold">{formatRand(done.total)}</div>
            </div>
            {pop ? (
              <p className="text-sm mb-4">We have your proof of payment and will check it shortly.</p>
            ) : (
              <div className="text-sm mb-4">
                <p className="mb-2">
                  Please pay by EFT using reference <strong>{`${surname.trim()} ${done.reference}`}</strong> and send
                  your proof of payment to the club.
                </p>
                <div className="text-[var(--fiori-text-subtle)]">
                  {BANK_DETAILS.bank}, {BANK_DETAILS.branchName}
                  <br />
                  Account no. {BANK_DETAILS.accountNo}, branch code {BANK_DETAILS.branchCode}
                </div>
              </div>
            )}
            <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
              Once your payment is confirmed and your membership is approved, we will email you your membership number.
            </p>
            <Link href="/" className="fiori-btn fiori-btn-emphasized inline-flex items-center">
              Back to home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const field = (label: string, value: string, set: (v: string) => void, opts?: { required?: boolean; type?: string }) => (
    <div>
      <label className="fiori-label">
        {label}
        {opts?.required && ' *'}
      </label>
      <input className="fiori-input" type={opts?.type ?? 'text'} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col">
      {shell}

      <div className="max-w-3xl w-full mx-auto px-6 py-8">
        <Link href="/" className="text-xs text-[var(--fiori-action)] hover:underline">
          Back to home
        </Link>
        <h1 className="text-2xl font-semibold mt-2 mb-1">Membership application {year}</h1>
        <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
          January to December {year}. Fields marked * are required.
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

        {/* Honeypot, hidden from people */}
        <div style={{ position: 'absolute', left: '-9999px' }} aria-hidden="true">
          <label>
            Website
            <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
          </label>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <div className="flex gap-6 mb-1">
            {(['new', 'renew'] as const).map((t) => (
              <label key={t} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" name="type" checked={type === t} onChange={() => setType(t)} />
                {t === 'new' ? 'New membership' : 'Renewal'}
              </label>
            ))}
          </div>
          {type === 'renew' && (
            <p className="text-xs text-[var(--fiori-text-subtle)] mt-2">
              Use the same email address you used before. The club checks your membership against it.
            </p>
          )}
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4">Main member information</h2>
          <div className="grid grid-cols-2 gap-4">
            {field('Surname', surname, setSurname, { required: true })}
            {field('Name', firstName, setFirstName, { required: true })}
            {field('ID number', idNumber, setIdNumber, { required: true })}
            {field('Email', email, setEmail, { required: true, type: 'email' })}
            {field('Mobile no.', mobile, setMobile, { required: true })}
            {field('Tel (home)', telHome, setTelHome)}
            {field('Tel (work)', telWork, setTelWork)}
            {field('Fax', fax, setFax)}
            {field('Employer', employer, setEmployer)}
            {field('Occupation', occupation, setOccupation)}
            <div>
              <label className="fiori-label">Postal address *</label>
              <textarea
                className="fiori-input"
                rows={3}
                value={postalAddress}
                onChange={(e) => setPostalAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="fiori-label">Physical address</label>
              <textarea
                className="fiori-input"
                rows={3}
                value={physicalAddress}
                onChange={(e) => setPhysicalAddress(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-1">Membership category *</h2>
          <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">Tick every category that applies.</p>
          <div className="border rounded-sm" style={{ borderColor: 'var(--fiori-border)' }}>
            {membershipPrices.map((p, i) => {
              const qty = selected[p.category_key];
              const maxQty = MAX_QTY[p.category_key] ?? 1;
              return (
                <div
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid var(--fiori-border)' }}
                >
                  <input
                    type="checkbox"
                    id={`cat-${p.category_key}`}
                    checked={!!qty}
                    onChange={() => toggleCategory(p.category_key)}
                  />
                  <label htmlFor={`cat-${p.category_key}`} className="flex-1 text-sm cursor-pointer">
                    {p.label}
                    {p.note && <span className="block text-xs text-[var(--fiori-text-subtle)]">{p.note}</span>}
                  </label>
                  {qty && maxQty > 1 && (
                    <select
                      className="fiori-input"
                      style={{ width: 70 }}
                      value={qty}
                      onChange={(e) => setQty(p.category_key, Number(e.target.value))}
                      aria-label={`Number of ${p.label}`}
                    >
                      {Array.from({ length: maxQty }, (_, n) => n + 1).map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  )}
                  <span className="text-sm whitespace-nowrap">{formatRand(Number(p.price))}</span>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[var(--fiori-text-subtle)] mt-3">{PARTNER_NOTE}</p>
          <p className="text-xs text-[var(--fiori-text-subtle)] mt-2">{FREE_ENTRY_NOTE}</p>
        </div>

        {loungePrices.length > 0 && (
          <div className="fiori-panel rounded-sm p-6 mb-6">
            <h2 className="text-sm font-semibold mb-1">Additional: access to the Pheiffer Lounge area for 16 events</h2>
            <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">Optional. This is charged on top of the membership fee.</p>
            <div className="border rounded-sm" style={{ borderColor: 'var(--fiori-border)' }}>
              <label
                className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer"
              >
                <input type="radio" name="lounge" checked={loungeKey === ''} onChange={() => setLoungeKey('')} />
                <span className="flex-1">No lounge access</span>
              </label>
              {loungePrices.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer"
                  style={{ borderTop: '1px solid var(--fiori-border)' }}
                >
                  <input
                    type="radio"
                    name="lounge"
                    checked={loungeKey === p.category_key}
                    onChange={() => setLoungeKey(p.category_key)}
                  />
                  <span className="flex-1">{p.label}</span>
                  <span className="whitespace-nowrap">{formatRand(Number(p.price))}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-1">Partner and junior members</h2>
          <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
            {needsPartner ? 'Your partner details are required for the category you chose.' : 'Fill in only if they apply.'}
          </p>
          <div className="grid gap-3">
            {partners.map((row, i) => (
              <div key={i} className="grid grid-cols-4 gap-2 items-center">
                <div className="col-span-4 text-xs font-semibold">
                  {row.role}
                  {i === 0 && needsPartner && ' *'}
                </div>
                <input
                  className="fiori-input"
                  placeholder="Name and surname"
                  value={row.name}
                  onChange={(e) => updatePartner(i, 'name', e.target.value)}
                />
                <input
                  className="fiori-input"
                  placeholder="ID no."
                  value={row.id_no}
                  onChange={(e) => updatePartner(i, 'id_no', e.target.value)}
                />
                <input
                  className="fiori-input"
                  placeholder="Email"
                  value={row.email}
                  onChange={(e) => updatePartner(i, 'email', e.target.value)}
                />
                <input
                  className="fiori-input"
                  placeholder="Cellphone no."
                  value={row.cell}
                  onChange={(e) => updatePartner(i, 'cell', e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4">Sections you are interested in</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {SECTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={sections.includes(s)} onChange={() => toggleSection(s)} />
                {s}
              </label>
            ))}
          </div>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-3">Protection of Personal Information Act (POPIA)</h2>
          <ul className="text-xs text-[var(--fiori-text-subtle)] mb-4 list-disc pl-5 grid gap-1">
            {POPIA_POINTS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p className="text-sm mb-2">I authorise the WPMC to use the method(s) below for electronic communication:</p>
          <div className="grid gap-2">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={consentEmail} onChange={(e) => setConsentEmail(e.target.checked)} />
              Email address
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={consentMobile} onChange={(e) => setConsentMobile(e.target.checked)} />
              Mobile number (SMS)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={consentNewsletter}
                onChange={(e) => setConsentNewsletter(e.target.checked)}
              />
              I consent to receive the WPMC newsletter
            </label>
          </div>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-3">{WAIVER_TITLE}</h2>
          <div
            className="text-xs rounded-sm border p-3 mb-4 grid gap-2"
            style={{ borderColor: 'var(--fiori-border)', maxHeight: 220, overflowY: 'auto', background: '#fff' }}
            tabIndex={0}
          >
            {WAIVER_PARAGRAPHS.map((t, i) => (
              <p key={i}>{t}</p>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            {field('Emergency contact name', emergencyName, setEmergencyName, { required: true })}
            {field('Emergency contact number', emergencyPhone, setEmergencyPhone, { required: true })}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
            <input type="checkbox" checked={isMinor} onChange={(e) => setIsMinor(e.target.checked)} />
            This application is for a minor (under 18 and never married)
          </label>
          {isMinor && (
            <div className="mb-4">
              <p className="text-xs text-[var(--fiori-text-subtle)] mb-2">{MINOR_WAIVER_TEXT}</p>
              {field('Parent, guardian or curator full name', guardianName, setGuardianName, { required: true })}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm cursor-pointer mb-4 mt-2">
            <input
              type="checkbox"
              className="mt-1"
              checked={waiverAccepted}
              onChange={(e) => setWaiverAccepted(e.target.checked)}
            />
            <span>
              I have read the waiver and indemnity above, understand it and accept it.
              {isMinor && ' I do so as parent, guardian or curator, and on behalf of the minor.'}
            </span>
          </label>
          <div className="max-w-sm">{field('Type your full name to sign', waiverName, setWaiverName, { required: true })}</div>
          <p className="text-xs text-[var(--fiori-text-subtle)] mt-2">
            The date and time you submit this form are recorded as your signature date.
          </p>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-2">Payment</h2>
          <div className="rounded-sm p-4 mb-4" style={{ background: 'var(--fiori-bg)', border: '1px solid var(--fiori-border)' }}>
            <div className="text-xs text-[var(--fiori-text-subtle)]">Total due</div>
            <div className="text-2xl font-semibold">{formatRand(total)}</div>
          </div>
          <p className="text-sm mb-1">Pay by EFT:</p>
          <p className="text-sm text-[var(--fiori-text-subtle)] mb-4">
            {BANK_DETAILS.bank}, {BANK_DETAILS.branchName}. Account no. {BANK_DETAILS.accountNo}. Branch code{' '}
            {BANK_DETAILS.branchCode}.
          </p>
          <FileField label="Proof of payment (optional, PDF or image, up to 4 MB)" file={pop} onChange={setPop} />
          <p className="text-xs text-[var(--fiori-text-subtle)] mt-2">
            You can submit now and send your proof of payment to the club later.
          </p>
        </div>

        <button className="fiori-btn fiori-btn-emphasized" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Submitting…' : 'Submit application'}
        </button>
      </div>
    </div>
  );
}
