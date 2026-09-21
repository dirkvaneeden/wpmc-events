'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { resolveDriverForSession } from '@/lib/driverAuth';
import { Driver, Vehicle, RaceEvent, RaceClass, EntryFee, BankDetails } from '@/lib/types';
import { uploadEntryDocument } from '@/lib/storage';


function StepBar({ current }: { current: number }) {
  const steps = ['Driver / Rider Details', 'Vehicle & Race Class', 'Review & Legal Declaration', 'Confirmation'];
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
  const [entryFees, setEntryFees] = useState<EntryFee[]>([]);

  const [step, setStep] = useState(1);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  // Step 2 form state
  const [eventId, setEventId] = useState('');
  const [classId, setClassId] = useState('');
  const [raceNumber, setRaceNumber] = useState('');
  const [sponsor, setSponsor] = useState('');
  const [feeId, setFeeId] = useState('');
  const [vehicleMode, setVehicleMode] = useState<'existing' | 'new'>('existing');
  const [vehicleId, setVehicleId] = useState('');
  const [newVehicle, setNewVehicle] = useState<NewVehicleForm>(emptyNewVehicle);
  const [msaLicenseFile, setMsaLicenseFile] = useState<File | null>(null);

  // Step 3 / submit state
  const [gcrAccepted, setGcrAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 4 confirmation state
  const [confirmation, setConfirmation] = useState<{
    entryId: string;
    payReference: string;
    totalDue: number;
    emailSent: boolean;
    emailError?: string;
  } | null>(null);

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

    const [vehiclesRes, eventsRes, classesRes, feesRes] = await Promise.all([
      supabase.from('vehicles').select('*').eq('driver_id', driverData.id).order('created_at', { ascending: true }),
      supabase.from('events').select('*').eq('status', true).order('event_date', { ascending: true }),
      supabase.from('race_classes').select('*').order('name', { ascending: true }),
      supabase.from('entryFee').select('*').eq('is_active', true).order('description', { ascending: true }),
    ]);

    setVehicles(vehiclesRes.data ?? []);
    setEvents(eventsRes.data ?? []);
    setRaceClasses(classesRes.data ?? []);
    setEntryFees(feesRes.data ?? []);
    setLoading(false);
  }

  const selectedEvent = events.find((e) => e.id === eventId);
  const selectedClass = raceClasses.find((c) => c.id.toString() === classId);
  const selectedFee = entryFees.find((f) => f.id.toString() === feeId);
  const selectedVehicle = vehicles.find((v) => v.id === vehicleId);

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

  function handleNextFromStep2() {
    if (!eventId || !classId || !raceNumber.trim() || !feeId) {
      setMessage({ type: 'negative', text: 'Please complete all required fields.' });
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
    setMessage(null);
    setStep(3);
  }

  async function handleSubmit() {
    if (!driver || !selectedEvent || !selectedClass || !selectedFee) return;
    if (!gcrAccepted) {
      setMessage({ type: 'negative', text: 'You must accept the GCR rules to submit your entry.' });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    // Resolve vehicle id — create it first if it's a new one
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
        fee_amount: selectedFee.fee ?? 0,
        gcr_accepted: true,
        entry_fee_id: selectedFee.id,
        pay_reference: payReference,
        msa_license_url: msaLicenseUrl,
      })
      .select()
      .single();

    if (entryError || !entry) {
      setSubmitting(false);
      setMessage({ type: 'negative', text: `Couldn't submit entry: ${entryError?.message}` });
      return;
    }

    const { data: bank } = await supabase.from('bank_details').select('*').limit(1).maybeSingle<BankDetails>();

    let emailSent = false;
    let emailError: string | undefined;
    try {
      const res = await fetch('/api/send-entry-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: driver.email,
          driverName: driver.full_name,
          raceNumber: raceNumber.trim(),
          eventName: selectedEvent.name,
          className: selectedClass.name,
          vehicleDescription: vehicleDescription(),
          totalDue: (selectedFee.fee ?? 0).toFixed(2),
          entryReference: payReference,
          bank: bank ?? {},
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
      totalDue: selectedFee.fee ?? 0,
      emailSent,
      emailError,
    });
    setStep(4);
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
            <h2 className="text-lg font-semibold mb-6">1. Driver / Rider Details</h2>
            <div className="grid grid-cols-2 gap-4 mb-8">
              <div>
                <div className="fiori-label">Full Name</div>
                <div className="text-sm">{driver.full_name}</div>
              </div>
              <div>
                <div className="fiori-label">MSA Licence No.</div>
                <div className="text-sm">{driver.msa_licence_no}</div>
              </div>
              <div>
                <div className="fiori-label">Email</div>
                <div className="text-sm">{driver.email}</div>
              </div>
              <div>
                <div className="fiori-label">Mobile</div>
                <div className="text-sm">{driver.mobile}</div>
              </div>
            </div>
            <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
              Not right?{' '}
              <Link href="/my/profile" className="text-[var(--fiori-action)] hover:underline">
                Update your profile
              </Link>{' '}
              before continuing.
            </p>
            <div className="flex justify-end">
              <button className="fiori-btn fiori-btn-emphasized" onClick={() => setStep(2)}>
                Next: Vehicle & Race Class →
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="fiori-panel rounded-sm p-8">
            <h2 className="text-lg font-semibold mb-6">2. Event & Vehicle Details</h2>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="fiori-label">Select Event *</label>
                <select className="fiori-input" value={eventId} onChange={(e) => setEventId(e.target.value)}>
                  <option value="">— Select —</option>
                  {events.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="fiori-label">Race Class *</label>
                <select className="fiori-input" value={classId} onChange={(e) => setClassId(e.target.value)}>
                  <option value="">— Select —</option>
                  {raceClasses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
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
            <div className="mb-8">
              <label className="fiori-label">MSA Race Licence (PDF or photo)</label>
              <input
                className="fiori-input"
                type="file"
                accept="application/pdf,image/*"
                onChange={(e) => setMsaLicenseFile(e.target.files?.[0] ?? null)}
              />
              {msaLicenseFile && (
                <div className="text-xs text-[var(--fiori-text-subtle)] mt-1">Selected: {msaLicenseFile.name}</div>
              )}
            </div>

            <div className="flex justify-between">
              <button className="fiori-btn fiori-btn-ghost" onClick={() => setStep(1)}>
                ← Back
              </button>
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleNextFromStep2}>
                Next: Review & GCR →
              </button>
            
            </div>
          </div>
        )}

        {step === 3 && selectedEvent && selectedClass && selectedFee && (
          <div className="fiori-panel rounded-sm p-8">
            <h2 className="text-lg font-semibold mb-6">3. Review & Legal Declaration</h2>

            <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
              <div>
                <div className="fiori-label">Event</div>
                {selectedEvent.name}
              </div>
              <div>
                <div className="fiori-label">Class</div>
                {selectedClass.name}
              </div>
              <div>
                <div className="fiori-label">Race Number</div>
                {raceNumber}
              </div>
              <div>
                <div className="fiori-label">Sponsor</div>
                {sponsor || '—'}
              </div>
              <div className="col-span-2">
                <div className="fiori-label">Vehicle</div>
                {vehicleDescription()}
              </div>
            </div>

            <div
              className="mb-4 px-4 py-3 text-sm rounded-sm border"
              style={{ background: '#fdf9ec', borderColor: '#f0d98a' }}
            >
              <strong style={{ color: '#9a6b00' }}>MSA Rules Declaration:</strong> I / We have read and understood
              GCR&apos;s 93, 94, 97, 113, 121 and 122 of the MSA Handbook and signify my/our agreement to abide by
              these Rules by submitting this digital entry form.
            </div>

            <label className="flex items-center gap-2 text-sm mb-6">
              <input type="checkbox" checked={gcrAccepted} onChange={(e) => setGcrAccepted(e.target.checked)} />
              I accept the GCR rules and declare all details are accurate.
            </label>

            <div className="mb-6 px-4 py-3 rounded-sm border" style={{ background: 'var(--fiori-bg)' }}>
              <div className="text-sm font-semibold text-[var(--fiori-action)]">
                Total Entry Fee Calculated: R{(selectedFee.fee ?? 0).toFixed(2)}
              </div>
              <div className="text-xs text-[var(--fiori-text-subtle)]">
                Note: Entry is only VALID once payment has been received and cleared by WPMC.
              </div>
            </div>

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
              <span className="font-mono" style={{ background: '#eef4ff', padding: '2px 6px', borderRadius: 2 }}>
                {confirmation.entryId}
              </span>
            </p>
            <p className="text-sm text-[var(--fiori-text-subtle)] mb-4">
              Your entry status is currently <strong>PENDING PAYMENT</strong>. Please proceed to payment to
              finalize your event registration, using reference{' '}
              <strong>{confirmation.payReference}</strong>.
            </p>

            {confirmation.emailSent ? (
              <p className="text-sm" style={{ color: 'var(--fiori-positive)' }}>
                A confirmation email with payment instructions has been sent to {driver.email}.
              </p>
            ) : (
              <p className="text-sm" style={{ color: 'var(--fiori-negative)' }}>
                Your entry was saved, but the confirmation email couldn&apos;t be sent
                {confirmation.emailError ? `: ${confirmation.emailError}` : '.'}
              </p>
            )}

            <div className="mt-6">
              <Link href="/my/profile" className="fiori-btn fiori-btn-ghost inline-flex items-center justify-center">
                Back to My Profile
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}