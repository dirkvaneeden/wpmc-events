'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { MembershipPrice } from '@/lib/types';
import { formatRand } from '@/lib/membershipPricing';
import FileField from '@/components/FileField';
import {
  ADD_ON_CATEGORY_KEYS,
  ApplicationPayload,
  BANK_DETAILS,
  DRAFT_DAYS,
  FREE_ENTRY_NOTE,
  MAX_MEMBERS,
  MAX_POP_BYTES,
  MemberRowPayload,
  MINOR_WAIVER_TEXT,
  PARTNER_CATEGORY_KEYS,
  PARTNER_NOTE,
  POPIA_POINTS,
  RELATIONSHIPS,
  RelationshipKey,
  SECTIONS,
  WAIVER_PARAGRAPHS,
  WAIVER_TITLE,
} from '@/lib/membershipForm';

type Msg = { type: 'positive' | 'negative'; text: string } | null;
type MemberRow = MemberRowPayload & { uid: string };

type FormState = Omit<ApplicationPayload, 'members' | 'website'> & { members: MemberRow[] };

const emptyForm: FormState = {
  application_type: 'new',
  surname: '',
  first_name: '',
  id_number: '',
  email: '',
  mobile: '',
  tel_home: '',
  tel_work: '',
  fax: '',
  employer: '',
  occupation: '',
  postal_address: '',
  physical_address: '',
  main_category: '',
  replacement_book: false,
  lounge_key: null,
  members: [],
  sections: [],
  consent_email: false,
  consent_mobile: false,
  consent_newsletter: false,
  waiver_accepted: false,
  waiver_name: '',
  emergency_name: '',
  emergency_phone: '',
  is_minor: false,
  guardian_name: '',
};

let uidCounter = 0;
const newUid = () => `m${Date.now()}-${uidCounter++}`;

const blankMember = (relationship: RelationshipKey): MemberRow => ({
  uid: newUid(),
  relationship,
  name: '',
  id_no: '',
  email: '',
  cell: '',
  waiver_accepted: false,
  waiver_name: '',
});

export default function MembershipApplyPage() {
  const [year, setYear] = useState<number | null>(null);
  const [prices, setPrices] = useState<MembershipPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [f, setF] = useState<FormState>(emptyForm);
  const [pop, setPop] = useState<File | null>(null);
  const [hasServerPop, setHasServerPop] = useState(false);
  const [website, setWebsite] = useState(''); // honeypot
  const [draftToken, setDraftToken] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<Msg>(null);
  const [done, setDone] = useState<{ reference: string; total: number } | null>(null);

  function upd<K extends keyof FormState>(key: K, value: FormState[K]) {
    setF((prev) => ({ ...prev, [key]: value }));
  }

  // ----- Load prices, then restore a saved draft if the link has one -----
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

      const token = new URLSearchParams(window.location.search).get('draft');
      let draftYear: number | null = null;
      let draftPayload: Partial<ApplicationPayload> | null = null;
      let draftHasPop = false;
      if (token) {
        try {
          const res = await fetch(`/api/membership/draft?token=${encodeURIComponent(token)}`);
          const json = await res.json();
          if (res.ok && json.payload) {
            draftPayload = json.payload as Partial<ApplicationPayload>;
            draftHasPop = !!json.hasPop;
            draftYear = typeof json.year === 'number' ? json.year : null;
            setDraftToken(token);
          } else {
            setMessage({ type: 'negative', text: json.error ?? 'This saved application could not be opened.' });
          }
        } catch {
          setMessage({ type: 'negative', text: 'This saved application could not be opened.' });
        }
      }

      const y = yearRows.some((r) => r.year === thisYear) ? thisYear : yearRows[0].year;
      // A saved draft keeps the year it was started in, so its prices match what the server charges
      const useYear = draftYear ?? y;

      const { data, error } = await supabase
        .from('membership_prices')
        .select('*')
        .eq('year', useYear)
        .eq('active', true)
        .order('sort_order', { ascending: true });
      if (error || !data) {
        setLoadError('Membership prices are not available right now. Please try again later.');
      } else {
        setYear(useYear);
        setPrices(data as MembershipPrice[]);
        if (draftPayload) {
          const dp = draftPayload;
          setF({
            ...emptyForm,
            ...dp,
            members: (dp.members ?? []).map((m) => ({ ...m, uid: newUid() })),
          } as FormState);
          setHasServerPop(draftHasPop);
          setMessage({
            type: 'positive',
            text: 'Welcome back. Your saved application is loaded. Check it, attach your proof of payment, and submit.',
          });
        }
      }
      setLoading(false);
    })();
  }, []);

  const byKey = useMemo(() => new Map(prices.map((p) => [p.category_key, p])), [prices]);
  const mainChoices = useMemo(
    () => prices.filter((p) => p.price_group === 'membership' && !ADD_ON_CATEGORY_KEYS.includes(p.category_key)),
    [prices]
  );
  const replacementBook = byKey.get('replacement_book');
  const loungePrices = useMemo(() => prices.filter((p) => p.price_group === 'lounge'), [prices]);

  const hasPartnerCategory = PARTNER_CATEGORY_KEYS.includes(f.main_category);

  function relCost(rel: RelationshipKey): number | null {
    const def = RELATIONSHIPS.find((r) => r.key === rel);
    if (!def || def.priceKey === null) return null; // included
    const row = byKey.get(def.priceKey);
    return row ? Number(row.price) : 0;
  }

  const lines = useMemo(() => {
    const out: { label: string; amount: number }[] = [];
    const main = byKey.get(f.main_category);
    if (main) out.push({ label: `Main member: ${main.label}`, amount: Number(main.price) });
    if (f.replacement_book && replacementBook) {
      out.push({ label: replacementBook.label, amount: Number(replacementBook.price) });
    }
    for (const m of f.members) {
      const def = RELATIONSHIPS.find((r) => r.key === m.relationship);
      const cost = relCost(m.relationship);
      if (cost !== null && cost > 0) {
        out.push({ label: `${def?.label}${m.name.trim() ? `: ${m.name.trim()}` : ''}`, amount: cost });
      }
    }
    const lounge = loungePrices.find((p) => p.category_key === f.lounge_key);
    if (lounge) out.push({ label: lounge.label, amount: Number(lounge.price) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byKey, f.main_category, f.replacement_book, f.members, f.lounge_key, loungePrices, replacementBook]);

  const total = Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100;

  // ----- Members table -----
  function addMember() {
    if (f.members.length >= MAX_MEMBERS) {
      setMessage({ type: 'negative', text: `You can add up to ${MAX_MEMBERS} members.` });
      return;
    }
    const partnerAllowed = hasPartnerCategory && !f.members.some((m) => m.relationship === 'partner');
    upd('members', [...f.members, blankMember(partnerAllowed ? 'partner' : 'student_u25')]);
  }

  function updateMember(uid: string, patch: Partial<MemberRowPayload>) {
    upd(
      'members',
      f.members.map((m) => (m.uid === uid ? { ...m, ...patch } : m))
    );
  }

  function removeMember(uid: string) {
    upd(
      'members',
      f.members.filter((m) => m.uid !== uid)
    );
  }

  function toggleSection(s: string) {
    upd('sections', f.sections.includes(s) ? f.sections.filter((x) => x !== s) : [...f.sections, s]);
  }

  // ----- Validation, save and submit -----
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim());

  function validate(): string | null {
    if (!f.surname.trim()) return 'Enter your surname.';
    if (!f.first_name.trim()) return 'Enter your name.';
    if (!f.id_number.trim()) return 'Enter your ID number.';
    if (!emailOk) return 'Enter a valid email address.';
    if (!f.mobile.trim()) return 'Enter your mobile number.';
    if (!f.postal_address.trim()) return 'Enter your postal address.';
    if (!f.main_category) return 'Choose your membership category.';

    const partners = f.members.filter((m) => m.relationship === 'partner').length;
    if (partners > 1) return 'Only one partner can be added.';
    if (partners === 1 && !hasPartnerCategory) {
      return 'To add a partner, choose a Member + Partner, Pensioner + Partner or Country + Partner category.';
    }
    if (partners === 0 && hasPartnerCategory) return 'Add your partner in the partner and junior members table.';
    for (const [i, m] of f.members.entries()) {
      const who = m.name.trim() || `Member ${i + 1}`;
      if (!m.name.trim()) return `Member ${i + 1}: enter a name and surname.`;
      if (!m.id_no.trim()) return `${who}: enter an ID number.`;
      if (!m.waiver_accepted) return `${who}: accept the waiver and indemnity.`;
      if (!m.waiver_name.trim()) return `${who}: type a full name to sign the waiver.`;
    }

    if (!f.emergency_name.trim() || !f.emergency_phone.trim()) return 'Enter an emergency contact name and number.';
    if (f.is_minor && !f.guardian_name.trim()) return 'Enter the parent or guardian name.';
    if (!f.waiver_accepted) return 'Accept the waiver and indemnity to continue.';
    if (!f.waiver_name.trim()) return 'Type your full name to sign the waiver.';
    if (!pop && !hasServerPop) return 'Attach your proof of payment to submit. You can save and come back later.';
    if (pop && pop.size > MAX_POP_BYTES) return 'The proof of payment must be smaller than 4 MB.';
    return null;
  }

  function buildPayload(): ApplicationPayload {
    return {
      ...f,
      members: f.members.map((m) => {
        const { uid, ...rest } = m;
        void uid;
        return rest;
      }),
      website,
    };
  }

  async function handleSave() {
    if (!emailOk) {
      setMessage({ type: 'negative', text: 'Enter a valid email address first. We send the link there.' });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (pop && pop.size > MAX_POP_BYTES) {
      setMessage({ type: 'negative', text: 'The proof of payment must be smaller than 4 MB.' });
      return;
    }
    setSaving(true);
    setMessage(null);

    const fd = new FormData();
    fd.append('payload', JSON.stringify(buildPayload()));
    if (draftToken) fd.append('token', draftToken);
    if (pop) fd.append('pop', pop);

    try {
      const res = await fetch('/api/membership/draft', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'negative', text: json.error ?? 'Your application could not be saved.' });
      } else {
        setDraftToken(json.token);
        if (json.popSaved) {
          setHasServerPop(true);
          setPop(null);
        }
        window.history.replaceState(null, '', `/membership/apply?draft=${json.token}`);
        setMessage({
          type: 'positive',
          text: json.emailed
            ? `Saved. We emailed a private link to ${f.email.trim()}. It works for ${DRAFT_DAYS} days. Use it to come back, attach your proof of payment, and submit.`
            : 'Saved. The link we emailed you earlier still works.',
        });
      }
    } catch (err) {
      setMessage({ type: 'negative', text: err instanceof Error ? err.message : 'Unknown error.' });
    }
    setSaving(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
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

    const fd = new FormData();
    fd.append('payload', JSON.stringify(buildPayload()));
    if (draftToken) fd.append('token', draftToken);
    if (pop) fd.append('pop', pop);

    try {
      const res = await fetch('/api/membership/apply', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ type: 'negative', text: json.error ?? 'Your application could not be submitted.' });
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else {
        window.history.replaceState(null, '', '/membership/apply');
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
              Thank you, {f.first_name}. Your reference is <strong>{done.reference}</strong>. We have sent a
              confirmation to {f.email.trim()}.
            </p>
            <div className="rounded-sm border p-4 mb-4" style={{ borderColor: 'var(--fiori-border)' }}>
              <div className="text-xs text-[var(--fiori-text-subtle)]">Total due</div>
              <div className="text-2xl font-semibold">{formatRand(done.total)}</div>
            </div>
            <p className="text-sm mb-4">We have your proof of payment and will check it shortly.</p>
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

  const field = (
    label: string,
    value: string,
    set: (v: string) => void,
    opts?: { required?: boolean; type?: string }
  ) => (
    <div>
      <label className="fiori-label">
        {label}
        {opts?.required && ' *'}
      </label>
      <input className="fiori-input" type={opts?.type ?? 'text'} value={value} onChange={(e) => set(e.target.value)} />
    </div>
  );

  const busy = submitting || saving;

  return (
    <div className="min-h-screen flex flex-col">
      {shell}

      <div className="max-w-3xl w-full mx-auto px-6 py-8">
        <Link href="/" className="text-xs text-[var(--fiori-action)] hover:underline">
          Back to home
        </Link>
        <h1 className="text-2xl font-semibold mt-2 mb-1">Membership application {year}</h1>
        <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
          January to December {year}. Fields marked * are required. You can save your progress at any time and come
          back with the link we email you.
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
                <input type="radio" name="type" checked={f.application_type === t} onChange={() => upd('application_type', t)} />
                {t === 'new' ? 'New membership' : 'Renewal'}
              </label>
            ))}
          </div>
          {f.application_type === 'renew' && (
            <p className="text-xs text-[var(--fiori-text-subtle)] mt-2">
              Use the same email address you used before. The club checks your membership against it.
            </p>
          )}
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4">Main member information</h2>
          <div className="grid grid-cols-2 gap-4">
            {field('Surname', f.surname, (v) => upd('surname', v), { required: true })}
            {field('Name', f.first_name, (v) => upd('first_name', v), { required: true })}
            {field('ID number', f.id_number, (v) => upd('id_number', v), { required: true })}
            {field('Email', f.email, (v) => upd('email', v), { required: true, type: 'email' })}
            {field('Mobile no.', f.mobile, (v) => upd('mobile', v), { required: true })}
            {field('Tel (home)', f.tel_home, (v) => upd('tel_home', v))}
            {field('Tel (work)', f.tel_work, (v) => upd('tel_work', v))}
            {field('Fax', f.fax, (v) => upd('fax', v))}
            {field('Employer', f.employer, (v) => upd('employer', v))}
            {field('Occupation', f.occupation, (v) => upd('occupation', v))}
            <div>
              <label className="fiori-label">Postal address *</label>
              <textarea className="fiori-input" rows={3} value={f.postal_address} onChange={(e) => upd('postal_address', e.target.value)} />
            </div>
            <div>
              <label className="fiori-label">Physical address</label>
              <textarea className="fiori-input" rows={3} value={f.physical_address} onChange={(e) => upd('physical_address', e.target.value)} />
            </div>
          </div>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-1">Membership category *</h2>
          <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
            Choose the category for the main member. Adding a partner? Choose a category with Partner in its name, and
            add the partner and any children in the table further down.
          </p>
          <div className="border rounded-sm" style={{ borderColor: 'var(--fiori-border)' }}>
            {mainChoices.map((p, i) => (
              <label
                key={p.id}
                className="flex items-center gap-3 px-3 py-2 cursor-pointer"
                style={{ borderTop: i === 0 ? 'none' : '1px solid var(--fiori-border)' }}
              >
                <input
                  type="radio"
                  name="main_category"
                  checked={f.main_category === p.category_key}
                  onChange={() => upd('main_category', p.category_key)}
                />
                <span className="flex-1 text-sm">
                  {p.label}
                  {p.note && <span className="block text-xs text-[var(--fiori-text-subtle)]">{p.note}</span>}
                </span>
                <span className="text-sm whitespace-nowrap">{formatRand(Number(p.price))}</span>
              </label>
            ))}
          </div>
          {replacementBook && (
            <label className="flex items-center gap-3 mt-3 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={f.replacement_book}
                onChange={(e) => upd('replacement_book', e.target.checked)}
              />
              <span className="flex-1">{replacementBook.label} (optional)</span>
              <span className="whitespace-nowrap">{formatRand(Number(replacementBook.price))}</span>
            </label>
          )}
          <p className="text-xs text-[var(--fiori-text-subtle)] mt-3">{PARTNER_NOTE}</p>
          <p className="text-xs text-[var(--fiori-text-subtle)] mt-2">{FREE_ENTRY_NOTE}</p>
        </div>

        {loungePrices.length > 0 && (
          <div className="fiori-panel rounded-sm p-6 mb-6">
            <h2 className="text-sm font-semibold mb-1">Additional: access to the Pheiffer Lounge area for 16 events</h2>
            <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">Optional. This is charged on top of the membership fee.</p>
            <div className="border rounded-sm" style={{ borderColor: 'var(--fiori-border)' }}>
              <label className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer">
                <input type="radio" name="lounge" checked={f.lounge_key === null} onChange={() => upd('lounge_key', null)} />
                <span className="flex-1">No lounge access</span>
              </label>
              {loungePrices.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer"
                  style={{ borderTop: '1px solid var(--fiori-border)' }}
                >
                  <input type="radio" name="lounge" checked={f.lounge_key === p.category_key} onChange={() => upd('lounge_key', p.category_key)} />
                  <span className="flex-1">{p.label}</span>
                  <span className="whitespace-nowrap">{formatRand(Number(p.price))}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-4">Sections you are interested in</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            {SECTIONS.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={f.sections.includes(s)} onChange={() => toggleSection(s)} />
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
              <input type="checkbox" checked={f.consent_email} onChange={(e) => upd('consent_email', e.target.checked)} />
              Email address
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={f.consent_mobile} onChange={(e) => upd('consent_mobile', e.target.checked)} />
              Mobile number (SMS)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={f.consent_newsletter} onChange={(e) => upd('consent_newsletter', e.target.checked)} />
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
            {field('Emergency contact name', f.emergency_name, (v) => upd('emergency_name', v), { required: true })}
            {field('Emergency contact number', f.emergency_phone, (v) => upd('emergency_phone', v), { required: true })}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer mb-2">
            <input type="checkbox" checked={f.is_minor} onChange={(e) => upd('is_minor', e.target.checked)} />
            This application is for a minor (under 18 and never married)
          </label>
          {f.is_minor && (
            <div className="mb-4">
              <p className="text-xs text-[var(--fiori-text-subtle)] mb-2">{MINOR_WAIVER_TEXT}</p>
              {field('Parent, guardian or curator full name', f.guardian_name, (v) => upd('guardian_name', v), { required: true })}
            </div>
          )}

          <label className="flex items-start gap-2 text-sm cursor-pointer mb-4 mt-2">
            <input type="checkbox" className="mt-1" checked={f.waiver_accepted} onChange={(e) => upd('waiver_accepted', e.target.checked)} />
            <span>
              I have read the waiver and indemnity above, understand it and accept it.
              {f.is_minor && ' I do so as parent, guardian or curator, and on behalf of the minor.'}
            </span>
          </label>
          <div className="max-w-sm">{field('Type your full name to sign', f.waiver_name, (v) => upd('waiver_name', v), { required: true })}</div>
          <p className="text-xs text-[var(--fiori-text-subtle)] mt-2">
            The date and time you submit this form are recorded as your signature date.
          </p>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-1">Partner and junior members</h2>
          <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
            Add each person who is joining with you. Each person accepts the same waiver and indemnity above. For
            anyone under 18, the parent or guardian types their own full name.
          </p>

          {f.members.length === 0 && (
            <p className="text-sm text-[var(--fiori-text-subtle)] mb-4">
              {hasPartnerCategory
                ? 'Your category includes a partner. Add your partner below.'
                : 'No one added yet. Use the button below to add a partner, student or child.'}
            </p>
          )}

          <div className="grid gap-4 mb-4">
            {f.members.map((m, i) => {
              const def = RELATIONSHIPS.find((r) => r.key === m.relationship);
              const cost = relCost(m.relationship);
              const partnerTaken = f.members.some((x) => x.uid !== m.uid && x.relationship === 'partner');
              return (
                <div
                  key={m.uid}
                  className="rounded-sm border p-4 grid gap-3"
                  style={{ borderColor: 'var(--fiori-border)', background: '#fff' }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-semibold">Member {i + 1}</div>
                    <button
                      type="button"
                      className="fiori-btn fiori-btn-ghost"
                      style={{ color: 'var(--fiori-negative)' }}
                      onClick={() => removeMember(m.uid)}
                    >
                      Remove
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="fiori-label">Relationship *</label>
                      <select
                        className="fiori-input"
                        value={m.relationship}
                        onChange={(e) => updateMember(m.uid, { relationship: e.target.value as RelationshipKey })}
                      >
                        {RELATIONSHIPS.map((r) => {
                          const c = relCost(r.key);
                          const disabled = r.key === 'partner' && (!hasPartnerCategory || partnerTaken);
                          return (
                            <option key={r.key} value={r.key} disabled={disabled}>
                              {r.label}
                              {c === null ? ' (included in your category)' : ` (${formatRand(c)})`}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                    <div>
                      <label className="fiori-label">Cost</label>
                      <div className="fiori-input" style={{ background: 'var(--fiori-bg)' }}>
                        {cost === null ? 'Included' : formatRand(cost)}
                      </div>
                    </div>
                    <div>
                      <label className="fiori-label">Name and surname *</label>
                      <input className="fiori-input" value={m.name} onChange={(e) => updateMember(m.uid, { name: e.target.value })} />
                    </div>
                    <div>
                      <label className="fiori-label">ID no. *</label>
                      <input className="fiori-input" value={m.id_no} onChange={(e) => updateMember(m.uid, { id_no: e.target.value })} />
                    </div>
                    <div>
                      <label className="fiori-label">Email</label>
                      <input className="fiori-input" value={m.email} onChange={(e) => updateMember(m.uid, { email: e.target.value })} />
                    </div>
                    <div>
                      <label className="fiori-label">Cellphone no.</label>
                      <input className="fiori-input" value={m.cell} onChange={(e) => updateMember(m.uid, { cell: e.target.value })} />
                    </div>
                  </div>

                  <div className="border-t pt-3" style={{ borderColor: 'var(--fiori-border)' }}>
                    <label className="flex items-start gap-2 text-sm cursor-pointer mb-3">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={m.waiver_accepted}
                        onChange={(e) => updateMember(m.uid, { waiver_accepted: e.target.checked })}
                      />
                      <span>
                        {def?.minor
                          ? 'I am the parent, guardian or curator. I have read the waiver and indemnity and accept it on behalf of this person.'
                          : 'I have read the waiver and indemnity and accept it.'}
                      </span>
                    </label>
                    <div className="max-w-sm">
                      <label className="fiori-label">
                        {def?.minor ? 'Parent or guardian full name to sign *' : 'Type full name to sign *'}
                      </label>
                      <input
                        className="fiori-input"
                        value={m.waiver_name}
                        onChange={(e) => updateMember(m.uid, { waiver_name: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between gap-3">
            <button type="button" className="fiori-btn fiori-btn-ghost" onClick={addMember}>
              + Add member
            </button>
            <span className="text-xs text-[var(--fiori-text-subtle)]">
              {f.members.length} added (up to {MAX_MEMBERS})
            </span>
          </div>
        </div>

        <div className="fiori-panel rounded-sm p-6 mb-6">
          <h2 className="text-sm font-semibold mb-3">Payment</h2>
          <div className="rounded-sm p-4 mb-4" style={{ background: 'var(--fiori-bg)', border: '1px solid var(--fiori-border)' }}>
            {lines.length === 0 && <div className="text-sm text-[var(--fiori-text-subtle)]">Choose a category to see the total.</div>}
            {lines.map((l, i) => (
              <div key={i} className="flex justify-between text-sm py-0.5">
                <span>{l.label}</span>
                <span>{formatRand(l.amount)}</span>
              </div>
            ))}
            <div className="flex justify-between font-semibold pt-2 mt-2 border-t" style={{ borderColor: 'var(--fiori-border)' }}>
              <span>Total due</span>
              <span>{formatRand(total)}</span>
            </div>
          </div>
          <p className="text-sm mb-1">Pay by EFT:</p>
          <p className="text-sm text-[var(--fiori-text-subtle)] mb-4">
            {BANK_DETAILS.bank}, {BANK_DETAILS.branchName}. Account no. {BANK_DETAILS.accountNo}. Branch code{' '}
            {BANK_DETAILS.branchCode}.
          </p>

          {hasServerPop && !pop && (
            <p className="text-sm mb-3" style={{ color: 'var(--fiori-positive)' }}>
              Your proof of payment is saved with this application. You can replace it below.
            </p>
          )}
          <FileField
            label={hasServerPop && !pop ? 'Replace proof of payment' : 'Proof of payment * (PDF or image, up to 4 MB)'}
            file={pop}
            onChange={setPop}
          />
          {!hasServerPop && !pop && (
            <p className="text-xs mt-2" style={{ color: 'var(--fiori-negative)' }}>
              A proof of payment is required to submit. Not paid yet? Save your application and come back with the
              link we email you.
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-3 items-center">
          <button
            className="fiori-btn fiori-btn-emphasized"
            onClick={handleSubmit}
            disabled={busy || (!pop && !hasServerPop)}
          >
            {submitting ? 'Submitting…' : 'Submit application'}
          </button>
          <button className="fiori-btn fiori-btn-ghost" onClick={handleSave} disabled={busy}>
            {saving ? 'Saving…' : 'Save and finish later'}
          </button>
        </div>
        <p className="text-xs text-[var(--fiori-text-subtle)] mt-3">
          Saving sends a private link to your email address so you can come back to attach your proof of payment.
        </p>
      </div>
    </div>
  );
}
