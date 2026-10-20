'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { resolveAdminForSession } from '@/lib/adminAuth';
import { uploadEntryDocument } from '@/lib/storage';
import FileField from '@/components/FileField';
import { Driver, Vehicle, RaceEvent, RaceClass, RaceSubclass, EntryFee, AdminUser } from '@/lib/types';

interface NewDriverForm {
  msa_licence_no: string;
  wpmc_member_no: string;
  full_name: string;
  email: string;
  mobile: string;
  tel_home: string;
  tel_work: string;
  postal_address: string;
  postal_code: string;
  emergency_contact: string;
  emergency_tel: string;
}

const emptyNewDriver: NewDriverForm = {
  msa_licence_no: '',
  wpmc_member_no: '',
  full_name: '',
  email: '',
  mobile: '',
  tel_home: '',
  tel_work: '',
  postal_address: '',
  postal_code: '',
  emergency_contact: '',
  emergency_tel: '',
};

interface NewVehicleForm {
  make: string;
  model: string;
  year: string;
  engine_make: string;
  capacity: string;
  cylinders: string;
}

const emptyNewVehicle: NewVehicleForm = {
  make: '',
  model: '',
  year: '',
  engine_make: '',
  capacity: '',
  cylinders: '',
};

interface ExistingEntry {
  id: string;
  race_number: string;
  race_classes: { name: string } | null;
}

interface DoneInfo {
  competitor: string;
  raceNumber: string;
  paid: boolean;
  free: boolean;
  notes: string[];
  emailTo: string | null;
  emailSent: boolean;
}

type Msg = { type: 'positive' | 'negative'; text: string };

const sectionTitle = 'text-sm font-semibold uppercase tracking-wide text-[var(--fiori-text-subtle)] mb-4';

/* ---------------- The form ---------------- */

interface FormProps {
  event: RaceEvent;
  admin: AdminUser;
  classes: RaceClass[];
  subclasses: RaceSubclass[];
  fees: EntryFee[];
  onDone: (info: DoneInfo) => void;
}

function EntryForm({ event, admin, classes, subclasses, fees, onDone }: FormProps) {
  // Competitor
  const [mode, setMode] = useState<'existing' | 'new'>('existing');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Driver[]>([]);
  const [searching, setSearching] = useState(false);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [newDriver, setNewDriver] = useState<NewDriverForm>(emptyNewDriver);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [existingEntries, setExistingEntries] = useState<ExistingEntry[]>([]);
  const searchSeq = useRef(0);

  // Entry
  const [classId, setClassId] = useState('');
  const [subclassId, setSubclassId] = useState('');
  const [feeId, setFeeId] = useState('');
  const [raceNumber, setRaceNumber] = useState('');
  const [sponsor, setSponsor] = useState('');

  // Vehicle
  const [vehicleMode, setVehicleMode] = useState<'existing' | 'new'>('existing');
  const [vehicleId, setVehicleId] = useState('');
  const [newVehicle, setNewVehicle] = useState<NewVehicleForm>(emptyNewVehicle);

  // Documents and declaration
  const [msaFile, setMsaFile] = useState<File | null>(null);
  const [popFile, setPopFile] = useState<File | null>(null);
  const [gcrReceived, setGcrReceived] = useState(false);

  // Payment and email
  const [payNow, setPayNow] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payRef, setPayRef] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [sendEmail, setSendEmail] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<Msg | null>(null);

  const selectedClass = classes.find((c) => c.id.toString() === classId);
  const classSubs = subclasses.filter((s) => s.class_id.toString() === classId);
  const selectedSub = classSubs.find((s) => s.id.toString() === subclassId);
  const selectedFee = fees.find((f) => f.id.toString() === feeId);
  const feeAmount = selectedFee?.fee ?? 0;
  const isFree = !!selectedFee && feeAmount <= 0;
  const gcrNeeded = !!selectedClass && !selectedClass.no_documents_required;
  const vehMode = mode === 'new' ? 'new' : vehicleMode;
  const competitorEmail = mode === 'existing' ? (driver?.email ?? '') : newDriver.email.trim().toLowerCase();

  // Default the payment amount to the chosen fee
  useEffect(() => {
    setPayAmount(selectedFee ? (selectedFee.fee ?? 0).toString() : '');
  }, [selectedFee]);

  // Competitor search
  useEffect(() => {
    if (mode !== 'existing' || driver) return;

    const q = search.trim().replace(/[,()*%\\]/g, ' ').trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    const seq = ++searchSeq.current;
    setSearching(true);

    const timer = setTimeout(async () => {
      const pattern = `*${q}*`;
      const { data, error } = await supabase
        .from('drivers')
        .select('*')
        .or(
          `full_name.ilike.${pattern},email.ilike.${pattern},msa_licence_no.ilike.${pattern},mobile.ilike.${pattern}`
        )
        .order('full_name', { ascending: true })
        .limit(8);

      if (seq !== searchSeq.current) return;
      setSearching(false);
      if (error) {
        setMessage({ type: 'negative', text: `Search failed: ${error.message}` });
        setResults([]);
      } else {
        setResults(data ?? []);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [search, mode, driver]);

  async function selectDriver(d: Driver) {
    setDriver(d);
    setResults([]);
    setSearch('');
    setVehicleId('');
    setMessage(null);

    const [vehRes, entRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('driver_id', d.id).order('created_at', { ascending: true }),
      supabase
        .from('event_entries')
        .select('id, race_number, race_classes(name)')
        .eq('driver_id', d.id)
        .eq('event_id', event.id),
    ]);

    const veh: Vehicle[] = vehRes.data ?? [];
    setVehicles(veh);
    setVehicleMode(veh.length === 0 ? 'new' : 'existing');
    setExistingEntries((entRes.data ?? []) as unknown as ExistingEntry[]);
  }

  function clearDriver() {
    setDriver(null);
    setVehicles([]);
    setVehicleId('');
    setVehicleMode('existing');
    setExistingEntries([]);
  }

  function switchMode(next: 'existing' | 'new') {
    setMode(next);
    setMessage(null);
    if (next === 'new') clearDriver();
  }

  function validate(): string | null {
    if (mode === 'existing' && !driver) return 'Select a competitor, or switch to New competitor.';

    if (mode === 'new') {
      const required: (keyof NewDriverForm)[] = [
        'msa_licence_no',
        'full_name',
        'email',
        'mobile',
        'postal_address',
        'postal_code',
        'emergency_contact',
        'emergency_tel',
      ];
      if (required.some((k) => !newDriver[k].trim())) return 'Please complete all required competitor fields.';
      if (!/^\S+@\S+\.\S+$/.test(newDriver.email.trim())) return 'Enter a valid email address.';
    }

    if (!classId) return 'Select a race class.';
    if (classSubs.length > 0 && !subclassId) return 'Select a sub class.';
    if (!feeId) return 'Select an entry fee rate.';
    if (!raceNumber.trim()) return 'Enter the race number.';

    if (vehMode === 'existing' && !vehicleId) return 'Select a vehicle, or add a new one.';
    if (vehMode === 'new') {
      if (Object.values(newVehicle).some((v) => !v.trim())) return 'Please complete all vehicle fields.';
    }

    if (gcrNeeded && !gcrReceived) return 'Confirm that the signed GCR declaration has been received.';

    if (payNow && !isFree) {
      const amount = Number(payAmount);
      if (!amount || amount <= 0) return 'Enter a valid payment amount.';
    }
    return null;
  }

  async function handleSubmit() {
    setMessage(null);
    const problem = validate();
    if (problem || !selectedClass || !selectedFee) {
      setMessage({ type: 'negative', text: problem ?? 'Please complete the form.' });
      return;
    }

    setSubmitting(true);

    // 1. Competitor
    let d = driver;
    if (mode === 'new') {
      const nd = newDriver;
      const { data: created, error } = await supabase
        .from('drivers')
        .insert({
          msa_licence_no: nd.msa_licence_no.trim(),
          wpmc_member_no: nd.wpmc_member_no.trim() || null,
          full_name: nd.full_name.trim(),
          email: nd.email.trim().toLowerCase(),
          mobile: nd.mobile.trim(),
          tel_home: nd.tel_home.trim() || null,
          tel_work: nd.tel_work.trim() || null,
          postal_address: nd.postal_address.trim(),
          postal_code: nd.postal_code.trim(),
          emergency_contact: nd.emergency_contact.trim(),
          emergency_tel: nd.emergency_tel.trim(),
          popia_email_opt_in: false,
          popia_sms_opt_in: false,
        })
        .select()
        .single();

      if (error || !created) {
        setSubmitting(false);
        const friendly =
          error?.code === '23505'
            ? error.message.includes('email')
              ? 'A competitor with that email already exists. Search for them instead.'
              : 'A competitor with that MSA licence number already exists. Search for them instead.'
            : (error?.message ?? 'Could not create the competitor.');
        setMessage({ type: 'negative', text: friendly });
        return;
      }

      d = created as Driver;
      // From here on treat them as an existing competitor, so a retry never creates a duplicate
      setDriver(d);
      setMode('existing');
      setVehicles([]);
      setVehicleMode('new');
    }

    if (!d) {
      setSubmitting(false);
      return;
    }

    // 2. Vehicle
    let finalVehicleId = vehicleId;
    let vehicleText = '';
    if (vehMode === 'new') {
      const { data: createdVehicle, error } = await supabase
        .from('vehicles')
        .insert({
          driver_id: d.id,
          make: newVehicle.make.trim(),
          model: newVehicle.model.trim(),
          year: Number(newVehicle.year),
          engine_make: newVehicle.engine_make.trim(),
          capacity: newVehicle.capacity.trim(),
          cylinders: Number(newVehicle.cylinders),
        })
        .select()
        .single();

      if (error || !createdVehicle) {
        setSubmitting(false);
        setMessage({ type: 'negative', text: `Couldn't save the vehicle: ${error?.message ?? 'unknown error'}` });
        return;
      }

      finalVehicleId = createdVehicle.id;
      vehicleText = `${createdVehicle.year} ${createdVehicle.make} ${createdVehicle.model}`;
      setVehicles((v) => [...v, createdVehicle as Vehicle]);
      setVehicleMode('existing');
      setVehicleId(createdVehicle.id);
    } else {
      const v = vehicles.find((x) => x.id === vehicleId);
      vehicleText = v ? `${v.year} ${v.make} ${v.model}` : '';
    }

    // 3. Documents
    let msaPath: string | null = null;
    let popPath: string | null = null;
    try {
      if (msaFile) msaPath = await uploadEntryDocument(msaFile, 'msa-licenses', d.id);
      if (popFile) popPath = await uploadEntryDocument(popFile, 'pop-driver', d.id);
    } catch (err) {
      setSubmitting(false);
      setMessage({
        type: 'negative',
        text: `Couldn't upload a document: ${err instanceof Error ? err.message : 'unknown error'}`,
      });
      return;
    }

    // 4. The entry
    const isLate = new Date() > new Date(event.late_entry_cutoff);
    const entryRef = `#${raceNumber.trim()} - ${d.full_name}`;

    const { data: entry, error: entryError } = await supabase
      .from('event_entries')
      .insert({
        event_id: event.id,
        driver_id: d.id,
        vehicle_id: finalVehicleId,
        class_id: selectedClass.id,
        subclass_id: classSubs.length > 0 ? Number(subclassId) : null,
        race_number: raceNumber.trim(),
        sponsor: sponsor.trim() || null,
        is_late_entry: isLate,
        fee_amount: feeAmount,
        gcr_accepted: gcrNeeded && gcrReceived,
        entry_fee_id: selectedFee.id,
        pay_reference: entryRef,
        msa_license_url: msaPath,
        pop_url_driver: popPath,
        captured_by: admin.id,
      })
      .select()
      .single();

    if (entryError || !entry) {
      setSubmitting(false);
      setMessage({ type: 'negative', text: `Couldn't save the entry: ${entryError?.message ?? 'unknown error'}` });
      return;
    }

    // The entry now exists. Anything below that fails is reported, but never repeats the entry.
    const notes: string[] = [];

    // 5. Payment received now
    let paidNow = false;
    const reference = payRef.trim() || entryRef;
    if (payNow && !isFree) {
      let receiptPath: string | null = null;
      let receiptFailed = false;
      try {
        if (receiptFile) receiptPath = await uploadEntryDocument(receiptFile, 'pop', entry.id);
      } catch (err) {
        receiptFailed = true;
        notes.push(
          `The payment was not recorded because the receipt couldn't be uploaded (${
            err instanceof Error ? err.message : 'unknown error'
          }). Capture it from the entry list.`
        );
      }

      if (!receiptFailed) {
        const { error: payError } = await supabase.from('payments').insert({
          entry_id: entry.id,
          amount_paid: Number(payAmount),
          payment_reference: reference,
          pop_file_url: receiptPath,
          is_verified: true,
        });

        if (payError) {
          notes.push(`The payment was not recorded (${payError.message}). Capture it from the entry list.`);
        } else {
          const { error: statusError } = await supabase
            .from('event_entries')
            .update({ status: 'PAID' })
            .eq('id', entry.id);
          if (statusError) {
            notes.push(
              `The payment was saved, but the entry couldn't be marked Paid (${statusError.message}). Check it in the entry list.`
            );
          } else {
            paidNow = true;
          }
        }
      }
    }

    // 6. Email
    let emailSent = false;
    if (sendEmail && d.email) {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const headers = {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        };
        const className = selectedSub ? `${selectedClass.name} — ${selectedSub.name}` : selectedClass.name;

        const res = paidNow
          ? await fetch('/api/send-payment-confirmation', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                to: d.email,
                driverName: d.full_name,
                raceNumber: raceNumber.trim(),
                eventName: event.name,
                className,
                vehicleDescription: vehicleText,
                amountPaid: Number(payAmount),
                paymentReference: reference,
                entryReference: entryRef,
              }),
            })
          : await fetch('/api/admin/send-captured-entry-email', {
              method: 'POST',
              headers,
              body: JSON.stringify({ entryId: entry.id }),
            });

        if (res.ok) {
          emailSent = true;
        } else {
          const json: { error?: string } = await res.json().catch(() => ({}));
          notes.push(`The confirmation email wasn't sent (${json.error ?? `error ${res.status}`}).`);
        }
      } catch (err) {
        notes.push(
          `The confirmation email wasn't sent (${err instanceof Error ? err.message : 'unknown error'}).`
        );
      }
    }

    setSubmitting(false);
    onDone({
      competitor: d.full_name,
      raceNumber: raceNumber.trim(),
      paid: paidNow,
      free: isFree,
      notes,
      emailTo: sendEmail && d.email ? d.email : null,
      emailSent,
    });
  }

  const setND = <K extends keyof NewDriverForm>(key: K, value: string) =>
    setNewDriver((f) => ({ ...f, [key]: value }));
  const setNV = <K extends keyof NewVehicleForm>(key: K, value: string) =>
    setNewVehicle((f) => ({ ...f, [key]: value }));

  const modeButton = (key: 'existing' | 'new', label: string) => (
    <button
      type="button"
      className="fiori-btn"
      style={{
        background: mode === key ? 'var(--fiori-action)' : '#ffffff',
        color: mode === key ? '#ffffff' : 'var(--fiori-text)',
        border: `1px solid ${mode === key ? 'var(--fiori-action)' : 'var(--fiori-border)'}`,
      }}
      onClick={() => switchMode(key)}
    >
      {label}
    </button>
  );

  return (
    <div>
      {/* Competitor */}
      <div className="fiori-panel rounded-sm p-6 mb-6">
        <div className={sectionTitle}>1. Competitor</div>

        <div className="flex gap-2 mb-4">
          {modeButton('existing', 'Existing competitor')}
          {modeButton('new', 'New competitor')}
        </div>

        {mode === 'existing' && !driver && (
          <div>
            <input
              className="fiori-input"
              style={{ maxWidth: 420 }}
              placeholder="Search by name, licence number, email or mobile"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />

            {searching && <p className="text-sm text-[var(--fiori-text-subtle)] mt-2">Searching…</p>}

            {results.length > 0 && (
              <div className="mt-2 border rounded-sm" style={{ borderColor: 'var(--fiori-border)', maxWidth: 620 }}>
                {results.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    className="block w-full text-left px-3 py-2 hover:bg-[var(--belize-light-base)] border-b last:border-b-0"
                    style={{ borderColor: '#e5e5e5' }}
                    onClick={() => selectDriver(r)}
                  >
                    <div className="text-sm font-semibold">{r.full_name}</div>
                    <div className="text-xs text-[var(--fiori-text-subtle)]">
                      MSA {r.msa_licence_no} · {r.email} · {r.mobile}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {!searching && search.trim().length >= 2 && results.length === 0 && (
              <p className="text-sm text-[var(--fiori-text-subtle)] mt-2">
                No competitors found. Try another search, or switch to New competitor.
              </p>
            )}
          </div>
        )}

        {mode === 'existing' && driver && (
          <div>
            <div
              className="flex items-center gap-4 rounded-sm border px-4 py-3"
              style={{ borderColor: 'var(--fiori-border)', background: '#ffffff', maxWidth: 620 }}
            >
              <div className="flex-1">
                <div className="text-sm font-semibold">{driver.full_name}</div>
                <div className="text-xs text-[var(--fiori-text-subtle)]">
                  MSA {driver.msa_licence_no} · {driver.email} · {driver.mobile}
                </div>
              </div>
              <button type="button" className="fiori-btn fiori-btn-ghost" onClick={clearDriver}>
                Change
              </button>
            </div>

            {existingEntries.length > 0 && (
              <div
                className="mt-3 px-4 py-2 text-sm rounded-sm border"
                style={{ background: '#fdf9ec', borderColor: '#f0d98a', maxWidth: 620 }}
              >
                This competitor already has {existingEntries.length}{' '}
                {existingEntries.length === 1 ? 'entry' : 'entries'} in this event:{' '}
                {existingEntries.map((e) => `#${e.race_number} (${e.race_classes?.name ?? '—'})`).join(', ')}. Check
                this isn&apos;t a duplicate.
              </div>
            )}
          </div>
        )}

        {mode === 'new' && (
          <div>
            <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
              Use the email address the competitor will log in with. Their entry, vehicle and history are linked to
              their account when they first log in with that address. Email and SMS opt-ins are left off, and the
              competitor can change them on their profile.
            </p>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="fiori-label">MSA Licence No. *</label>
                <input
                  className="fiori-input"
                  value={newDriver.msa_licence_no}
                  onChange={(e) => setND('msa_licence_no', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">WPMC Member No.</label>
                <input
                  className="fiori-input"
                  value={newDriver.wpmc_member_no}
                  onChange={(e) => setND('wpmc_member_no', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="fiori-label">Full Name *</label>
                <input
                  className="fiori-input"
                  value={newDriver.full_name}
                  onChange={(e) => setND('full_name', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Email *</label>
                <input
                  className="fiori-input"
                  type="email"
                  value={newDriver.email}
                  onChange={(e) => setND('email', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Mobile *</label>
                <input
                  className="fiori-input"
                  value={newDriver.mobile}
                  onChange={(e) => setND('mobile', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Home Tel</label>
                <input
                  className="fiori-input"
                  value={newDriver.tel_home}
                  onChange={(e) => setND('tel_home', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Work Tel</label>
                <input
                  className="fiori-input"
                  value={newDriver.tel_work}
                  onChange={(e) => setND('tel_work', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="fiori-label">Postal Address *</label>
                <textarea
                  className="fiori-input"
                  rows={2}
                  value={newDriver.postal_address}
                  onChange={(e) => setND('postal_address', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Postal Code *</label>
                <input
                  className="fiori-input"
                  value={newDriver.postal_code}
                  onChange={(e) => setND('postal_code', e.target.value)}
                />
              </div>
              <div />
              <div>
                <label className="fiori-label">Emergency Contact *</label>
                <input
                  className="fiori-input"
                  value={newDriver.emergency_contact}
                  onChange={(e) => setND('emergency_contact', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Emergency Tel *</label>
                <input
                  className="fiori-input"
                  value={newDriver.emergency_tel}
                  onChange={(e) => setND('emergency_tel', e.target.value)}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Entry details */}
      <div className="fiori-panel rounded-sm p-6 mb-6">
        <div className={sectionTitle}>2. Entry details</div>
        <div className="grid grid-cols-2 gap-4">
          <div className={classSubs.length > 0 ? '' : 'col-span-2'}>
            <label className="fiori-label">Race Class *</label>
            <select
              className="fiori-input"
              value={classId}
              onChange={(e) => {
                setClassId(e.target.value);
                setSubclassId('');
                setGcrReceived(false);
              }}
            >
              <option value="">— Select —</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {classSubs.length > 0 && (
            <div>
              <label className="fiori-label">Sub Class *</label>
              <select className="fiori-input" value={subclassId} onChange={(e) => setSubclassId(e.target.value)}>
                <option value="">— Select —</option>
                {classSubs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="col-span-2">
            <label className="fiori-label">Entry Category Fee Rate *</label>
            <select className="fiori-input" value={feeId} onChange={(e) => setFeeId(e.target.value)}>
              <option value="">— Select —</option>
              {fees.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.description} (R{(f.fee ?? 0).toFixed(2)})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="fiori-label">Race Number *</label>
            <input
              className="fiori-input"
              value={raceNumber}
              onChange={(e) => setRaceNumber(e.target.value)}
              placeholder="e.g. 70010"
            />
          </div>
          <div>
            <label className="fiori-label">Sponsor (optional)</label>
            <input className="fiori-input" value={sponsor} onChange={(e) => setSponsor(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Vehicle */}
      <div className="fiori-panel rounded-sm p-6 mb-6">
        <div className={sectionTitle}>3. Vehicle</div>

        {mode === 'existing' && !driver && (
          <p className="text-sm text-[var(--fiori-text-subtle)]">Select a competitor first.</p>
        )}

        {(mode === 'new' || driver) && (
          <>
            {mode === 'existing' && driver && vehicles.length > 0 && (
              <div className="flex gap-6 mb-4">
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={vehMode === 'existing'} onChange={() => setVehicleMode('existing')} />
                  Use a saved vehicle
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input type="radio" checked={vehMode === 'new'} onChange={() => setVehicleMode('new')} />
                  Add a new vehicle
                </label>
              </div>
            )}

            {mode === 'existing' && driver && vehicles.length === 0 && (
              <p className="text-sm text-[var(--fiori-text-subtle)] mb-4">
                This competitor has no saved vehicles. Add one below.
              </p>
            )}

            {vehMode === 'existing' && (
              <select className="fiori-input" style={{ maxWidth: 420 }} value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">— Select —</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.year} {v.make} {v.model} ({v.capacity})
                  </option>
                ))}
              </select>
            )}

            {vehMode === 'new' && (
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="fiori-label">Vehicle Make *</label>
                  <input className="fiori-input" value={newVehicle.make} onChange={(e) => setNV('make', e.target.value)} />
                </div>
                <div>
                  <label className="fiori-label">Type / Model *</label>
                  <input className="fiori-input" value={newVehicle.model} onChange={(e) => setNV('model', e.target.value)} />
                </div>
                <div>
                  <label className="fiori-label">Year *</label>
                  <input
                    className="fiori-input"
                    type="number"
                    value={newVehicle.year}
                    onChange={(e) => setNV('year', e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">Engine Make *</label>
                  <input
                    className="fiori-input"
                    value={newVehicle.engine_make}
                    onChange={(e) => setNV('engine_make', e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">Capacity (CC) *</label>
                  <input
                    className="fiori-input"
                    value={newVehicle.capacity}
                    onChange={(e) => setNV('capacity', e.target.value)}
                    placeholder="e.g. 2500cc"
                  />
                </div>
                <div>
                  <label className="fiori-label">No. of Cylinders *</label>
                  <input
                    className="fiori-input"
                    type="number"
                    value={newVehicle.cylinders}
                    onChange={(e) => setNV('cylinders', e.target.value)}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Documents and declaration */}
      <div className="fiori-panel rounded-sm p-6 mb-6">
        <div className={sectionTitle}>4. Documents and declaration</div>
        <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
          Both uploads are optional here. Attach them if you have them to hand.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <FileField label="MSA Race Licence (PDF or photo)" file={msaFile} onChange={setMsaFile} />
          <FileField label="Competitor's Proof of Payment (PDF or photo)" file={popFile} onChange={setPopFile} />
        </div>

        {gcrNeeded && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={gcrReceived} onChange={(e) => setGcrReceived(e.target.checked)} />
            Signed GCR declaration received from the competitor *
          </label>
        )}
        {selectedClass && !gcrNeeded && (
          <p className="text-xs text-[var(--fiori-text-subtle)]">
            No documentation or GCR declaration is required for this class.
          </p>
        )}
      </div>

      {/* Payment */}
      <div className="fiori-panel rounded-sm p-6 mb-6">
        <div className={sectionTitle}>5. Payment</div>

        {!selectedFee && <p className="text-sm text-[var(--fiori-text-subtle)]">Select a fee rate first.</p>}

        {isFree && <p className="text-sm text-[var(--fiori-text-subtle)]">No payment is due for this entry.</p>}

        {selectedFee && !isFree && (
          <div>
            <div className="text-sm mb-3">
              Entry fee: <strong>R{feeAmount.toFixed(2)}</strong>
            </div>

            <label className="flex items-center gap-2 text-sm mb-3">
              <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
              Payment received now
            </label>

            {payNow && (
              <div className="grid grid-cols-2 gap-4 mt-3">
                <div>
                  <label className="fiori-label">Amount received (R) *</label>
                  <input
                    className="fiori-input"
                    type="number"
                    step="0.01"
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">Payment reference</label>
                  <input
                    className="fiori-input"
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder={raceNumber.trim() ? `#${raceNumber.trim()} - ${driver?.full_name ?? newDriver.full_name}` : ''}
                  />
                </div>
                <div className="col-span-2">
                  <FileField label="Receipt (optional)" file={receiptFile} onChange={setReceiptFile} />
                </div>
                {Number(payAmount) > 0 && Number(payAmount) < feeAmount && (
                  <p className="col-span-2 text-xs" style={{ color: 'var(--fiori-negative)' }}>
                    This is less than the fee of R{feeAmount.toFixed(2)}. Capturing it will still mark the entry as
                    Paid.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Email and submit */}
      <div className="fiori-panel rounded-sm p-6 mb-6">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} />
          Send a confirmation email to {competitorEmail || 'the competitor'}
        </label>
      </div>

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

      <div className="flex justify-end gap-2">
        <Link href={`/admin/entry-lists/${event.id}`} className="fiori-btn fiori-btn-ghost inline-flex items-center">
          Cancel
        </Link>
        <button className="fiori-btn fiori-btn-emphasized" onClick={handleSubmit} disabled={submitting}>
          {submitting ? 'Capturing…' : 'Capture entry'}
        </button>
      </div>
    </div>
  );
}

/* ---------------- The page ---------------- */

export default function AddEntryPage() {
  const { id } = useParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [event, setEvent] = useState<RaceEvent | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [classes, setClasses] = useState<RaceClass[]>([]);
  const [subclasses, setSubclasses] = useState<RaceSubclass[]>([]);
  const [fees, setFees] = useState<EntryFee[]>([]);

  const [done, setDone] = useState<DoneInfo | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function load() {
    setLoading(true);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    setAdmin(session ? await resolveAdminForSession(session.user.id) : null);

    const eventRes = await supabase.from('events').select('*').eq('id', id).maybeSingle();
    if (!eventRes.data) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setEvent(eventRes.data);

    const [classesRes, feesRes] = await Promise.all([
      supabase.from('race_classes').select('*').eq('event_id', id).order('name', { ascending: true }),
      supabase
        .from('entryFee')
        .select('*')
        .eq('event_id', id)
        .eq('is_active', true)
        .order('description', { ascending: true }),
    ]);

    const cls: RaceClass[] = classesRes.data ?? [];
    setClasses(cls);
    setFees(feesRes.data ?? []);

    if (cls.length > 0) {
      const subsRes = await supabase
        .from('race_subclasses')
        .select('*')
        .in(
          'class_id',
          cls.map((c) => c.id)
        )
        .order('name', { ascending: true });
      setSubclasses(subsRes.data ?? []);
    }
    setLoading(false);
  }

  if (loading) {
    return <div className="max-w-4xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>;
  }

  if (notFound || !event) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        Event not found.{' '}
        <Link href="/admin/entry-lists" className="text-[var(--fiori-action)] hover:underline">
          Back to Entry Lists
        </Link>
      </div>
    );
  }

  const notSetUp = classes.length === 0 || fees.length === 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">
        <Link href="/admin/entry-lists" className="text-[var(--fiori-action)] hover:underline">
          Entry Lists
        </Link>{' '}
        /{' '}
        <Link href={`/admin/entry-lists/${event.id}`} className="text-[var(--fiori-action)] hover:underline">
          {event.name}
        </Link>{' '}
        / Add entry
      </div>
      <h1 className="text-2xl font-semibold mb-1">Add entry on behalf of a competitor</h1>
      <div className="text-sm text-[var(--fiori-text-subtle)] mb-6">
        {event.name} · {new Date(event.event_date).toLocaleDateString()}
        {new Date() > new Date(event.late_entry_cutoff) && (
          <span
            className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm"
            style={{ background: '#fdf1f1', color: 'var(--fiori-negative)' }}
          >
            LATE ENTRY
          </span>
        )}
      </div>

      {!admin && (
        <div className="fiori-panel rounded-sm p-6" style={{ color: 'var(--fiori-negative)' }}>
          Couldn&apos;t confirm your admin account. Log out and log in again.
        </div>
      )}

      {admin && notSetUp && (
        <div className="fiori-panel rounded-sm p-6">
          This event hasn&apos;t been fully set up yet (it needs at least one race class and one active entry fee).{' '}
          <Link href={`/admin/events/${event.id}`} className="text-[var(--fiori-action)] hover:underline">
            Open the event setup
          </Link>
        </div>
      )}

      {admin && !notSetUp && done && (
        <div className="fiori-panel rounded-sm p-8 text-center">
          <div className="text-4xl mb-3" style={{ color: 'var(--fiori-positive)' }}>
            ✓
          </div>
          <h2 className="text-xl font-semibold mb-2">Entry captured</h2>
          <p className="text-sm mb-1">
            #{done.raceNumber} — {done.competitor}
          </p>
          <p className="text-sm text-[var(--fiori-text-subtle)] mb-4">
            {done.paid
              ? 'Payment recorded. The entry is marked Paid.'
              : done.free
                ? 'No payment is due for this entry.'
                : 'The entry is pending payment.'}
          </p>

          {done.emailTo && done.emailSent && (
            <p className="text-sm mb-2" style={{ color: 'var(--fiori-positive)' }}>
              A confirmation email was sent to {done.emailTo}.
            </p>
          )}
          {done.notes.map((n, i) => (
            <p key={i} className="text-sm mb-2" style={{ color: 'var(--fiori-negative)' }}>
              {n}
            </p>
          ))}

          <div className="mt-6 flex justify-center gap-2">
            <button
              className="fiori-btn fiori-btn-emphasized"
              onClick={() => {
                setDone(null);
                setFormKey((k) => k + 1);
              }}
            >
              Add another entry
            </button>
            <Link
              href={`/admin/entry-lists/${event.id}`}
              className="fiori-btn fiori-btn-ghost inline-flex items-center"
            >
              Back to the entry list
            </Link>
          </div>
        </div>
      )}

      {admin && !notSetUp && !done && (
        <EntryForm
          key={formKey}
          event={event}
          admin={admin}
          classes={classes}
          subclasses={subclasses}
          fees={fees}
          onDone={setDone}
        />
      )}
    </div>
  );
}