'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { resolveDriverForSession } from '@/lib/driverAuth';
import { Driver, Vehicle, RaceEvent, RaceClass, RaceSubclass, EntryFee, BankDetails, EntryType } from '@/lib/types';
import { uploadEntryDocument } from '@/lib/storage';
import FileField from '@/components/FileField';

function StepBar({ current }: { current: number }) {
  const steps = ['Event & Driver Details', 'Vehicle & Race Class', 'Review & Payment', 'Confirmation'];
  return (
    <div className="flex items-center gap-3 mb-8 flex-wrap">
      {steps.map((label, idx) => {
        const n = idx + 1;
        const isCurrent = n === current;
        return (
          <div key={label} className="flex items-center gap-3">
            <div
              className="px-3 py-1.5 text-xs font-semibold rounded-sm border"
              style={{
                background: isCurrent ? 'var(--fiori-action)' : '#ffffff',
                color: isCurrent ? '#ffffff' : 'var(--fiori-text-subtle)',
                borderColor: isCurrent ? 'var(--fiori-action)' : 'var(--fiori-border)',
              }}
            >
              {n}. {label}
            </div>
            {n < steps.length && <span className="text-[var(--fiori-text-subtle)]">→</span>}
          </div>
        );
      })}
    </div>
  );
}

function describeType(t: EntryType) {
  const parts = [
    t.requires_payment ? 'Entry fee payable' : 'No payment required',
    t.requires_documents ? 'Documents required' : 'No documents required',
  ];
  if (t.is_basic) parts.push('Basic details only');
  return parts.join(' · ');
}

interface ClassListRow {
  race_number: string;
  driver_name: string;
  vehicle: string;
  subclass_name: string | null;
  is_you: boolean;
  confirmed: boolean;
}

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

export default function EnterEventPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [events, setEvents] = useState<RaceEvent[]>([]);
  const [raceClasses, setRaceClasses] = useState<RaceClass[]>([]);
  const [subclasses, setSubclasses] = useState<RaceSubclass[]>([]);
  const [entryFees, setEntryFees] = useState<EntryFee[]>([]);
  const [entryTypes, setEntryTypes] = useState<EntryType[]>([]);
  const [bank, setBank] = useState<BankDetails | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const eventRef = useRef('');

  const [step, setStep] = useState(1);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  // Step 1: event, entry type and driver details
  const [eventId, setEventId] = useState('');
  const [entryTypeId, setEntryTypeId] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerChoice, setPickerChoice] = useState('');
  const [msaNo, setMsaNo] = useState('');
  const [memberNo, setMemberNo] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  // Step 2: class, vehicle, documents
  const [classId, setClassId] = useState('');
  const [subclassId, setSubclassId] = useState('');
  const [feeId, setFeeId] = useState('');
  const [raceNumber, setRaceNumber] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [vehicleMode, setVehicleMode] = useState<'existing' | 'new'>('existing');
  const [vehicleId, setVehicleId] = useState('');
  const [newVehicle, setNewVehicle] = useState<NewVehicleForm>(emptyNewVehicle);
  const [msaLicenseFile, setMsaLicenseFile] = useState<File | null>(null);

  // Step 3: payment and declaration
  const [popFile, setPopFile] = useState<File | null>(null);
  const [gcrAccepted, setGcrAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 4: confirmation
  const [confirmation, setConfirmation] = useState<{
    entryId: string;
    payReference: string;
    totalDue: number;
    hasPop: boolean;
    emailSent: boolean;
    emailError?: string;
  } | null>(null);
  const [classList, setClassList] = useState<ClassListRow[] | null>(null);
  const [classListError, setClassListError] = useState<string | null>(null);

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadAll() {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    const driverData = await resolveDriverForSession(session.user.id, session.user.email ?? '');
    if (!driverData) {
      router.replace('/register');
      return;
    }
    setDriver(driverData);
    setMsaNo(driverData.msa_licence_no ?? '');
    setMemberNo(driverData.wpmc_member_no ?? '');

    const [vehiclesRes, eventsRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('driver_id', driverData.id).order('created_at', { ascending: true }),
      supabase.from('events').select('*').eq('status', true).order('event_date', { ascending: true }),
    ]);

    setVehicles(vehiclesRes.data ?? []);
    setEvents(eventsRes.data ?? []);
    setLoading(false);
  }

  function handleEventChange(id: string) {
    eventRef.current = id;
    setEventId(id);
    setEntryTypeId('');
    setPickerOpen(false);
    setClassId('');
    setSubclassId('');
    setFeeId('');
    setRaceClasses([]);
    setSubclasses([]);
    setEntryFees([]);
    setEntryTypes([]);
    setBank(null);
    setMessage(null);
    if (id) {
      loadEventSetup(id);
    } else {
      setSetupLoading(false);
    }
  }

  async function loadEventSetup(id: string) {
    setSetupLoading(true);
    const [classesRes, feesRes, bankRes, typesRes] = await Promise.all([
      supabase.from('race_classes').select('*').eq('event_id', id).order('name', { ascending: true }),
      supabase
        .from('entryFee')
        .select('*')
        .eq('event_id', id)
        .eq('is_active', true)
        .order('description', { ascending: true }),
      supabase.from('bank_details').select('*').eq('event_id', id).maybeSingle(),
      supabase.from('entry_types').select('*').eq('event_id', id).order('name', { ascending: true }),
    ]);

    // The driver may have picked a different event while this was loading
    if (eventRef.current !== id) return;

    const classes: RaceClass[] = classesRes.data ?? [];
    let subs: RaceSubclass[] = [];
    if (classes.length > 0) {
      const subsRes = await supabase
        .from('race_subclasses')
        .select('*')
        .in(
          'class_id',
          classes.map((c) => c.id)
        )
        .order('name', { ascending: true });
      if (eventRef.current !== id) return;
      subs = subsRes.data ?? [];
    }

    const types: EntryType[] = typesRes.data ?? [];

    setRaceClasses(classes);
    setSubclasses(subs);
    setEntryFees(feesRes.data ?? []);
    setBank(bankRes.data ?? null);
    setEntryTypes(types);
    setSetupLoading(false);

    if (types.length === 1) {
      // Nothing to choose between, so apply it without asking
      setEntryTypeId(types[0].id.toString());
    } else if (types.length > 1) {
      setPickerChoice('');
      setPickerOpen(true);
    }
  }

  async function loadClassList(entryId: string) {
    setClassList(null);
    setClassListError(null);

    const { data, error } = await supabase.rpc('class_entry_list', { p_entry_id: entryId });
    if (error) {
      setClassListError(error.message);
      return;
    }

    const rows = ((data ?? []) as ClassListRow[])
      .slice()
      .sort(
        (a, b) =>
          (a.subclass_name ?? '').localeCompare(b.subclass_name ?? '') ||
          a.race_number.localeCompare(b.race_number, undefined, { numeric: true })
      );
    setClassList(rows);
  }

  const selectedEvent = events.find((e) => e.id === eventId);
  const selectedType = entryTypes.find((t) => t.id.toString() === entryTypeId);
  const isBasic = selectedType?.is_basic ?? false;
  const paymentRequired = selectedType?.requires_payment ?? true;

  const selectedClass = raceClasses.find((c) => c.id.toString() === classId);
  const classSubclasses = subclasses.filter((s) => s.class_id.toString() === classId);
  const selectedSubclass = classSubclasses.find((s) => s.id.toString() === subclassId);
  const selectedFee = paymentRequired ? entryFees.find((f) => f.id.toString() === feeId) : undefined;
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

  // Documents are required unless the entry type or the chosen class says otherwise
  const docsRequired = (selectedType?.requires_documents ?? true) && !selectedClass?.no_documents_required;
  const feeAmount = paymentRequired ? (selectedFee?.fee ?? 0) : 0;
  const isFree = feeAmount <= 0;
  // A free entry has nothing to pay, so no proof of payment is needed
  const popRequired = docsRequired && !isFree;

  const detailsReady = !!eventId && !setupLoading && (entryTypes.length === 0 || !!entryTypeId);

  function isNewVehicleValid() {
    return (
      newVehicle.make &&
      newVehicle.model &&
      newVehicle.year &&
      newVehicle.engine_make &&
      newVehicle.capacity &&
      newVehicle.cylinders
    );
  }

  function vehicleDescription() {
    if (vehicleMode === 'existing' && selectedVehicle) {
      return `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`;
    }
    if (vehicleMode === 'new' && isNewVehicleValid()) {
      return `${newVehicle.year} ${newVehicle.make} ${newVehicle.model}`;
    }
    return '';
  }

  async function handleNextFromStep1() {
    if (!driver) return;

    if (!eventId) {
      setMessage({ type: 'negative', text: 'Please select an event.' });
      return;
    }
    if (entryTypes.length > 0 && !entryTypeId) {
      setPickerChoice('');
      setPickerOpen(true);
      return;
    }
    if (raceClasses.length === 0 || (paymentRequired && entryFees.length === 0)) {
      setMessage({
        type: 'negative',
        text: "This event hasn't been fully set up yet (it needs race classes and, for paid entries, entry fees). Please contact the club.",
      });
      return;
    }

    // Full entries need the licence and member numbers. They are saved to the profile.
    if (!isBasic) {
      const msa = msaNo.trim();
      const member = memberNo.trim();
      if (!msa || !member) {
        setMessage({ type: 'negative', text: 'Please enter your MSA licence number and WPMC member number.' });
        return;
      }

      if (msa !== (driver.msa_licence_no ?? '') || member !== (driver.wpmc_member_no ?? '')) {
        setSavingProfile(true);
        const { data, error } = await supabase
          .from('drivers')
          .update({ msa_licence_no: msa, wpmc_member_no: member })
          .eq('id', driver.id)
          .select()
          .single();
        setSavingProfile(false);

        if (error || !data) {
          setMessage({
            type: 'negative',
            text:
              error?.code === '23505'
                ? 'That MSA licence number is already registered to another driver.'
                : `Couldn't save your details: ${error?.message ?? 'unknown error'}`,
          });
          return;
        }
        setDriver(data as Driver);
      }
    }

    setMessage(null);
    setStep(2);
  }

  function handleNextFromStep2() {
    if (!classId || !raceNumber.trim() || (paymentRequired && !feeId)) {
      setMessage({ type: 'negative', text: 'Please complete all required fields.' });
      return;
    }
    if (classSubclasses.length > 0 && !subclassId) {
      setMessage({ type: 'negative', text: 'Please select a sub class.' });
      return;
    }
    if (vehicleMode === 'existing' && !vehicleId) {
      setMessage({ type: 'negative', text: 'Please select a vehicle, or choose to add a new one.' });
      return;
    }
    if (vehicleMode === 'new' && !isNewVehicleValid()) {
      setMessage({ type: 'negative', text: 'Please complete all vehicle fields.' });
      return;
    }
    if (docsRequired && !msaLicenseFile) {
      setMessage({ type: 'negative', text: 'Please attach your MSA licence.' });
      return;
    }
    setMessage(null);
    setStep(3);
  }

  async function handleSubmit() {
    if (!driver || !selectedEvent || !selectedClass) return;
    if (paymentRequired && !selectedFee) return;

    if (docsRequired && !gcrAccepted) {
      setMessage({ type: 'negative', text: 'You must accept the GCR rules to submit your entry.' });
      return;
    }
    // A proof of payment only applies to entry types that take payment
    const popToUpload = paymentRequired ? popFile : null;
    if (popRequired && !popToUpload) {
      setMessage({ type: 'negative', text: 'Please attach your proof of payment before submitting.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    // Resolve vehicle id, creating it first if it's a new one
    let resolvedVehicleId = vehicleId;
    if (vehicleMode === 'new') {
      const { data: createdVehicle, error: vehicleError } = await supabase
        .from('vehicles')
        .insert({
          driver_id: driver.id,
          make: newVehicle.make.trim(),
          model: newVehicle.model.trim(),
          year: Number(newVehicle.year),
          engine_make: newVehicle.engine_make.trim(),
          capacity: newVehicle.capacity.trim(),
          cylinders: Number(newVehicle.cylinders),
        })
        .select()
        .single();

      if (vehicleError || !createdVehicle) {
        setSubmitting(false);
        setMessage({ type: 'negative', text: `Couldn't save vehicle: ${vehicleError?.message}` });
        return;
      }
      resolvedVehicleId = createdVehicle.id;
    }

    let msaLicenseUrl: string | null = null;
    if (msaLicenseFile) {
      try {
        msaLicenseUrl = await uploadEntryDocument(msaLicenseFile, 'msa-licenses', driver.id);
      } catch (err) {
        setSubmitting(false);
        setMessage({
          type: 'negative',
          text: `Couldn't upload MSA licence: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
        return;
      }
    }

    let popUrl: string | null = null;
    if (popToUpload) {
      try {
        popUrl = await uploadEntryDocument(popToUpload, 'pop-driver', driver.id);
      } catch (err) {
        setSubmitting(false);
        setMessage({
          type: 'negative',
          text: `Couldn't upload proof of payment: ${err instanceof Error ? err.message : 'unknown error'}`,
        });
        return;
      }
    }

    const isLate = new Date() > new Date(selectedEvent.late_entry_cutoff);
    const payReference = `#${raceNumber.trim()} - ${driver.full_name}`;

    const { data: entry, error: entryError } = await supabase
      .from('event_entries')
      .insert({
        event_id: selectedEvent.id,
        driver_id: driver.id,
        vehicle_id: resolvedVehicleId,
        class_id: selectedClass.id,
        race_number: raceNumber.trim(),
        sponsor: sponsor.trim() || null,
        is_late_entry: isLate,
        fee_amount: feeAmount,
        gcr_accepted: docsRequired && gcrAccepted,
        entry_fee_id: selectedFee ? selectedFee.id : null,
        entry_type_id: selectedType ? selectedType.id : null,
        pay_reference: payReference,
        msa_license_url: msaLicenseUrl,
        pop_url_driver: popUrl,
        subclass_id: classSubclasses.length > 0 ? Number(subclassId) : null,
      })
      .select()
      .single();

    if (entryError || !entry) {
      setSubmitting(false);
      setMessage({ type: 'negative', text: `Couldn't submit entry: ${entryError?.message}` });
      return;
    }

    let emailSent = false;
    let emailError: string | undefined;
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch('/api/send-entry-confirmation', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          to: driver.email,
          driverName: driver.full_name,
          raceNumber: raceNumber.trim(),
          eventName: selectedEvent.name,
          className: selectedSubclass ? `${selectedClass.name} — ${selectedSubclass.name}` : selectedClass.name,
          vehicleDescription: vehicleDescription(),
          entryReference: payReference,
          hasPop: !!popToUpload,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        emailError = json.error ?? 'Email failed to send.';
      } else {
        emailSent = true;
      }
    } catch (err) {
      emailError = err instanceof Error ? err.message : 'Email failed to send.';
    }

    setSubmitting(false);
    setConfirmation({
      entryId: entry.id,
      payReference,
      totalDue: feeAmount,
      hasPop: !!popToUpload,
      emailSent,
      emailError,
    });
    setStep(4);
    loadClassList(entry.id);
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="fiori-shell">Race Track Driver Portal</div>
        <div className="max-w-4xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>
      </div>
    );
  }

  if (!driver) return null;

  return (
    <div className="min-h-screen">
      <div className="fiori-shell">Race Track Driver Portal</div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">
          <Link href="/my/profile" className="text-[var(--fiori-action)] hover:underline">
            My Profile
          </Link>{' '}
          / Event Entry
        </div>
        <h1 className="text-2xl font-semibold mb-6">WPMC Killarney Race Entry Form</h1>

        <StepBar current={step} />

        {message && (
          <div
            className="mb-6 px-4 py-2 text-sm rounded-sm border"
            style={{
              color: message.type === 'positive' ? 'var(--fiori-positive)' : 'var(--fiori-negative)',
              borderColor: message.type === 'positive' ? 'var(--fiori-positive)' : 'var(--fiori-negative)',
              background: message.type === 'positive' ? '#f1faf4' : '#fdf1f1',
            }}
          >
            {message.text}
          </div>
        )}

        {step === 1 && (
          <div className="fiori-panel rounded-sm p-8">
            <h2 className="text-lg font-semibold mb-6">1. Event & Driver Details</h2>

            <div className="mb-6">
              <label className="fiori-label">Select Event *</label>
              <select className="fiori-input" value={eventId} onChange={(e) => handleEventChange(e.target.value)}>
                <option value="">— Select —</option>
                {events.map((ev) => (
                  <option key={ev.id} value={ev.id}>
                    {ev.name}
                  </option>
                ))}
              </select>

              {eventId && setupLoading && (
                <p className="text-sm text-[var(--fiori-text-subtle)] mt-2">Loading event details…</p>
              )}

              {selectedType && (
                <div className="mt-3 flex items-center gap-3 text-sm">
                  <span className="text-[var(--fiori-text-subtle)]">Entry type:</span>
                  <span className="font-semibold">{selectedType.name}</span>
                  {entryTypes.length > 1 && (
                    <button
                      className="text-[var(--fiori-action)] hover:underline"
                      onClick={() => {
                        setPickerChoice(entryTypeId);
                        setPickerOpen(true);
                      }}
                    >
                      Change
                    </button>
                  )}
                </div>
              )}

              {eventId && !setupLoading && raceClasses.length === 0 && (
                <p className="text-sm mt-2" style={{ color: 'var(--fiori-negative)' }}>
                  This event hasn&apos;t been fully set up yet (no race classes). Please contact the club.
                </p>
              )}
            </div>

            {detailsReady ? (
              <>
                <div className="mb-2 text-sm font-semibold">Your details</div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <div className="fiori-label">Full Name</div>
                    <div className="text-sm">{driver.full_name}</div>
                  </div>
                  {!isBasic && (
                    <>
                      <div>
                        <div className="fiori-label">Email</div>
                        <div className="text-sm">{driver.email}</div>
                      </div>
                      <div>
                        <div className="fiori-label">Mobile</div>
                        <div className="text-sm">{driver.mobile}</div>
                      </div>
                    </>
                  )}
                </div>

                {!isBasic ? (
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="fiori-label">MSA Licence No. *</label>
                      <input className="fiori-input" value={msaNo} onChange={(e) => setMsaNo(e.target.value)} />
                    </div>
                    <div>
                      <label className="fiori-label">WPMC Member No. *</label>
                      <input className="fiori-input" value={memberNo} onChange={(e) => setMemberNo(e.target.value)} />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-[var(--fiori-text-subtle)] mb-4">
                    This is a basic entry, so only your name and vehicle details are needed.
                  </p>
                )}

                <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
                  Not right?{' '}
                  <Link href="/my/profile" className="text-[var(--fiori-action)] hover:underline">
                    Update your profile
                  </Link>{' '}
                  before continuing.
                </p>
              </>
            ) : (
              !eventId && (
                <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
                  Select the event you want to enter to continue.
                </p>
              )
            )}

            <div className="flex justify-end">
              <button
                className="fiori-btn fiori-btn-emphasized"
                onClick={handleNextFromStep1}
                disabled={!detailsReady || savingProfile}
              >
                {savingProfile ? 'Saving…' : 'Next: Vehicle & Race Class →'}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="fiori-panel rounded-sm p-8">
            <h2 className="text-lg font-semibold mb-1">2. Vehicle & Race Class</h2>
            <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
              {selectedEvent?.name}
              {selectedType ? ` · ${selectedType.name}` : ''}
            </p>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className={classSubclasses.length > 0 ? '' : 'col-span-2'}>
                <label className="fiori-label">Race Class *</label>
                <select
                  className="fiori-input"
                  value={classId}
                  onChange={(e) => {
                    setClassId(e.target.value);
                    setSubclassId('');
                  }}
                >
                  <option value="">— Select —</option>
                  {raceClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {classSubclasses.length > 0 && (
                <div>
                  <label className="fiori-label">Sub Class *</label>
                  <select className="fiori-input" value={subclassId} onChange={(e) => setSubclassId(e.target.value)}>
                    <option value="">— Select —</option>
                    {classSubclasses.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {paymentRequired && (
                <div className="col-span-2">
                  <label className="fiori-label">Entry Category Fee Rate *</label>
                  <select className="fiori-input" value={feeId} onChange={(e) => setFeeId(e.target.value)}>
                    <option value="">— Select —</option>
                    {entryFees.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.description} (R{(f.fee ?? 0).toFixed(2)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

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

            <div className="mb-2 text-sm font-semibold">Vehicle</div>
            <div className="flex gap-6 mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={vehicleMode === 'existing'}
                  onChange={() => setVehicleMode('existing')}
                />
                Use a saved vehicle
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="radio" checked={vehicleMode === 'new'} onChange={() => setVehicleMode('new')} />
                Add a new vehicle
              </label>
            </div>

            {vehicleMode === 'existing' && (
              <div className="mb-8">
                {vehicles.length === 0 ? (
                  <p className="text-sm text-[var(--fiori-text-subtle)]">
                    You don&apos;t have any saved vehicles yet — choose &quot;Add a new vehicle&quot; above.
                  </p>
                ) : (
                  <select className="fiori-input" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                    <option value="">— Select —</option>
                    {vehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.year} {v.make} {v.model} ({v.capacity})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {vehicleMode === 'new' && (
              <div className="grid grid-cols-3 gap-4 mb-8">
                <div>
                  <label className="fiori-label">Vehicle Make *</label>
                  <input
                    className="fiori-input"
                    value={newVehicle.make}
                    onChange={(e) => setNewVehicle({ ...newVehicle, make: e.target.value })}
                  />
                </div>
                <div>
                  <label className="fiori-label">Type / Model *</label>
                  <input
                    className="fiori-input"
                    value={newVehicle.model}
                    onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                  />
                </div>
                <div>
                  <label className="fiori-label">Year *</label>
                  <input
                    className="fiori-input"
                    type="number"
                    value={newVehicle.year}
                    onChange={(e) => setNewVehicle({ ...newVehicle, year: e.target.value })}
                  />
                </div>
                <div>
                  <label className="fiori-label">Engine Make *</label>
                  <input
                    className="fiori-input"
                    value={newVehicle.engine_make}
                    onChange={(e) => setNewVehicle({ ...newVehicle, engine_make: e.target.value })}
                  />
                </div>
                <div>
                  <label className="fiori-label">Capacity (CC) *</label>
                  <input
                    className="fiori-input"
                    value={newVehicle.capacity}
                    onChange={(e) => setNewVehicle({ ...newVehicle, capacity: e.target.value })}
                    placeholder="e.g. 2500cc"
                  />
                </div>
                <div>
                  <label className="fiori-label">No. of Cylinders *</label>
                  <input
                    className="fiori-input"
                    type="number"
                    value={newVehicle.cylinders}
                    onChange={(e) => setNewVehicle({ ...newVehicle, cylinders: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="mb-2 text-sm font-semibold">Documents</div>
            {!docsRequired && (
              <p className="text-xs text-[var(--fiori-text-subtle)] mb-3">
                No documents or rules declaration are required for this entry. You can still attach documents if you
                have them.
              </p>
            )}
            <div className="mb-8">
              <FileField
                label={`MSA Race Licence (PDF or photo)${docsRequired ? ' *' : ' (optional)'}`}
                file={msaLicenseFile}
                onChange={setMsaLicenseFile}
              />
            </div>

            <div className="flex justify-between">
              <button className="fiori-btn fiori-btn-ghost" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleNextFromStep2}>
                Next: Review →
              </button>
            </div>
          </div>
        )}

        {step === 3 && selectedEvent && selectedClass && (selectedFee || !paymentRequired) && (
          <div className="fiori-panel rounded-sm p-8">
            <h2 className="text-lg font-semibold mb-6">
              {docsRequired ? '3. Review, Payment & Declaration' : '3. Review & Payment'}
            </h2>

            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <div className="fiori-label">Event</div>
                {selectedEvent.name}
              </div>
              <div>
                <div className="fiori-label">Entry type</div>
                {selectedType?.name ?? 'Standard entry'}
              </div>
              <div>
                <div className="fiori-label">Class</div>
                {selectedClass.name}
                {selectedSubclass ? ` — ${selectedSubclass.name}` : ''}
              </div>
              <div>
                <div className="fiori-label">Race Number</div>
                {raceNumber}
              </div>
              <div>
                <div className="fiori-label">Sponsor</div>
                {sponsor || '—'}
              </div>
              <div>
                <div className="fiori-label">Vehicle</div>
                {vehicleDescription()}
              </div>
            </div>

            <div className="mb-2 text-sm font-semibold">Payment</div>
            <div className="mb-4 rounded-sm border p-4" style={{ background: 'var(--fiori-bg)' }}>
              <div className="text-sm font-semibold text-[var(--fiori-action)] mb-3">
                Total entry fee: R{feeAmount.toFixed(2)}
              </div>

              {isFree ? (
                <p className="text-sm text-[var(--fiori-text-subtle)]">No payment is required for this entry.</p>
              ) : (
                <>
                  {bank ? (
                    <table className="text-sm mb-3">
                      <tbody>
                        <tr>
                          <td className="pr-6 py-0.5 text-[var(--fiori-text-subtle)]">Bank</td>
                          <td>{bank.bank_name ?? '—'}</td>
                        </tr>
                        <tr>
                          <td className="pr-6 py-0.5 text-[var(--fiori-text-subtle)]">Account name</td>
                          <td>{bank.acc_name ?? '—'}</td>
                        </tr>
                        <tr>
                          <td className="pr-6 py-0.5 text-[var(--fiori-text-subtle)]">Account no.</td>
                          <td>{bank.acc_number ?? '—'}</td>
                        </tr>
                        <tr>
                          <td className="pr-6 py-0.5 text-[var(--fiori-text-subtle)]">Branch code</td>
                          <td>{bank.branch_code ?? '—'}</td>
                        </tr>
                        <tr>
                          <td className="pr-6 py-0.5 text-[var(--fiori-text-subtle)]">Payment reference</td>
                          <td className="font-semibold">
                            #{raceNumber.trim()} - {driver.full_name}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-sm text-[var(--fiori-text-subtle)] mb-3">
                      Banking details are not available yet. Please contact the club.
                    </p>
                  )}

                  <p className="text-xs text-[var(--fiori-text-subtle)]">
                    Pay the total above using this reference, then attach your proof of payment below. Your entry is
                    only VALID once payment has been received and cleared by WPMC.
                  </p>
                </>
              )}
            </div>

            {paymentRequired && (
              <div className="mb-6">
                <FileField
                  label={`Proof of Payment (PDF or photo)${popRequired ? ' *' : ' (optional)'}`}
                  file={popFile}
                  onChange={setPopFile}
                />
              </div>
            )}

            {docsRequired && (
              <>
                <div
                  className="mb-4 px-4 py-3 text-sm rounded-sm border"
                  style={{ background: '#fdf9ec', borderColor: '#f0d98a' }}
                >
                  <strong style={{ color: '#9a6b00' }}>MSA Rules Declaration:</strong> I / We have read and
                  understood GCR&apos;s 93, 94, 97, 113, 121 and 122 of the MSA Handbook and signify my/our agreement
                  to abide by these Rules by submitting this digital entry form.
                </div>

                <label className="flex items-center gap-2 text-sm mb-6">
                  <input type="checkbox" checked={gcrAccepted} onChange={(e) => setGcrAccepted(e.target.checked)} />
                  I accept the GCR rules and declare all details are accurate.
                </label>
              </>
            )}

            <div className="flex justify-between">
              <button className="fiori-btn fiori-btn-ghost" onClick={() => setStep(2)} disabled={submitting}>
                ← Back
              </button>
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleSubmit} disabled={submitting}>
                {submitting ? 'Submitting…' : 'Submit Entry'}
              </button>
            </div>
          </div>
        )}

        {step === 4 && confirmation && (
          <div className="fiori-panel rounded-sm p-8 text-center">
            <div className="text-4xl mb-3" style={{ color: 'var(--fiori-positive)' }}>
              ✓
            </div>
            <h2 className="text-xl font-semibold mb-2">Entry Submitted Successfully!</h2>
            <p className="text-sm mb-1">
              Your Entry Reference ID:{' '}
              <span className="font-mono" style={{ background: '#eff4f9', padding: '2px 6px', borderRadius: 2 }}>
                {confirmation.entryId}
              </span>
            </p>
            <p className="text-sm text-[var(--fiori-text-subtle)] mb-4">
              {confirmation.hasPop ? 'Your entry and proof of payment have been received' : 'Your entry has been received'}{' '}
              and will be reviewed by the club. Your entry reference is <strong>{confirmation.payReference}</strong>.
              If anything further is needed, we will contact you.
            </p>

            {confirmation.emailSent ? (
              <p className="text-sm" style={{ color: 'var(--fiori-positive)' }}>
                A confirmation email has been sent to {driver.email}.
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--fiori-negative)' }}>
                Your entry was saved, but the confirmation email couldn&apos;t be sent
                {confirmation.emailError ? `: ${confirmation.emailError}` : '.'}
              </p>
            )}

            <div className="mt-8 text-left">
              <div className="text-sm font-semibold mb-1">
                Entries in your class{selectedClass ? `: ${selectedClass.name}` : ''}
                {classList && (
                  <span className="font-normal text-[var(--fiori-text-subtle)]">
                    {' '}
                    · {classList.filter((r) => r.confirmed).length} confirmed
                  </span>
                )}
              </div>
              <p className="text-xs text-[var(--fiori-text-subtle)] mb-3">
                Everyone who has entered your class. Entries marked Pending haven&apos;t been confirmed by the club
                yet.
              </p>

              {classListError ? (
                <p className="text-sm" style={{ color: 'var(--fiori-negative)' }}>
                  Couldn&apos;t load the class list: {classListError}
                </p>
              ) : classList === null ? (
                <p className="text-sm text-[var(--fiori-text-subtle)]">Loading…</p>
              ) : (
                <table className="fiori-table">
                  <thead>
                    <tr>
                      <th style={{ width: 170 }}>Race #</th>
                      <th>Driver</th>
                      <th>Vehicle</th>
                      {classList.some((r) => r.subclass_name) && <th>Sub class</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {classList.map((r, i) => (
                      <tr key={`${r.race_number}-${i}`} style={r.is_you ? { background: '#eff4f9' } : undefined}>
                        <td>
                          <span className="font-semibold">#{r.race_number}</span>
                          {r.is_you && (
                            <span
                              className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm"
                              style={{ background: '#ffffff', color: 'var(--fiori-action)' }}
                            >
                              YOU
                            </span>
                          )}
                          {!r.confirmed && (
                            <span
                              className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-sm"
                              style={{ background: '#fdf1f1', color: '#e78c07' }}
                            >
                              PENDING
                            </span>
                          )}
                        </td>
                        <td>{r.driver_name}</td>
                        <td>{r.vehicle || '—'}</td>
                        {classList.some((x) => x.subclass_name) && <td>{r.subclass_name ?? '—'}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="mt-6">
              <Link href="/my/profile" className="fiori-btn fiori-btn-ghost inline-flex items-center justify-center">
                Back to My Profile
              </Link>
            </div>
          </div>
        )}
      </div>

      {pickerOpen && (
        <div
          className="bg-black/40 z-50"
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div className="fiori-panel w-full max-w-lg rounded-sm p-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-1">What type of entry are you making?</h2>
            <p className="text-sm text-[var(--fiori-text-subtle)] mb-5">{selectedEvent?.name}</p>

            <div className="flex flex-col gap-3 mb-6">
              {entryTypes.map((t) => {
                const chosen = pickerChoice === t.id.toString();
                return (
                  <label
                    key={t.id}
                    className="flex items-start gap-3 rounded-sm border p-3 cursor-pointer"
                    style={{
                      borderColor: chosen ? 'var(--fiori-action)' : 'var(--fiori-border)',
                      background: chosen ? '#eff4f9' : '#ffffff',
                    }}
                  >
                    <input
                      type="radio"
                      name="entry-type"
                      className="mt-1"
                      checked={chosen}
                      onChange={() => setPickerChoice(t.id.toString())}
                    />
                    <div>
                      <div className="text-sm font-semibold">{t.name}</div>
                      <div className="text-xs text-[var(--fiori-text-subtle)]">{describeType(t)}</div>
                    </div>
                  </label>
                );
              })}
            </div>

            <div className="flex justify-end gap-2">
              <button
                className="fiori-btn fiori-btn-ghost"
                onClick={() => {
                  // Cancelling the first choice also clears the event, so the form never sits half-way
                  if (entryTypeId) setPickerOpen(false);
                  else handleEventChange('');
                }}
              >
                Cancel
              </button>
              <button
                className="fiori-btn fiori-btn-emphasized"
                disabled={!pickerChoice}
                onClick={() => {
                  setEntryTypeId(pickerChoice);
                  setPickerOpen(false);
                }}
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}