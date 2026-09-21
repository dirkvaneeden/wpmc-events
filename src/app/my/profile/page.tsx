'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Driver, Vehicle } from '@/lib/types';
import Link from 'next/link';

interface DriverForm {
  msa_licence_no: string;
  wpmc_member_no: string;
  full_name: string;
  mobile: string;
  tel_home: string;
  tel_work: string;
  postal_address: string;
  postal_code: string;
  emergency_contact: string;
  emergency_tel: string;
  popia_email_opt_in: boolean;
  popia_sms_opt_in: boolean;
}

interface VehicleForm {
  make: string;
  model: string;
  year: string;
  engine_make: string;
  capacity: string;
  cylinders: string;
}

const emptyVehicleForm: VehicleForm = {
  make: '',
  model: '',
  year: '',
  engine_make: '',
  capacity: '',
  cylinders: '',
};

export default function MyProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);

  const [editingProfile, setEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState<DriverForm | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleRowForm, setVehicleRowForm] = useState<VehicleForm>(emptyVehicleForm);
  const [vehicleRowSaving, setVehicleRowSaving] = useState(false);

  const [addVehicleOpen, setAddVehicleOpen] = useState(false);
  const [newVehicleForm, setNewVehicleForm] = useState<VehicleForm>(emptyVehicleForm);
  const [addingVehicle, setAddingVehicle] = useState(false);

  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  useEffect(() => {
    loadMyData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadMyData() {
    setLoading(true);
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      router.replace('/login');
      return;
    }

    const { data: driverData, error: driverError } = await supabase
      .from('drivers')
      .select('*')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (driverError || !driverData) {
      router.replace('/register');
      return;
    }

    setDriver(driverData);

    const { data: vehiclesData } = await supabase
      .from('vehicles')
      .select('*')
      .eq('driver_id', driverData.id)
      .order('created_at', { ascending: true });

    setVehicles(vehiclesData ?? []);
    setLoading(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace('/');
  }

  function openEditProfile() {
    if (!driver) return;
    setProfileForm({
      msa_licence_no: driver.msa_licence_no,
      wpmc_member_no: driver.wpmc_member_no ?? '',
      full_name: driver.full_name,
      mobile: driver.mobile,
      tel_home: driver.tel_home ?? '',
      tel_work: driver.tel_work ?? '',
      postal_address: driver.postal_address,
      postal_code: driver.postal_code,
      emergency_contact: driver.emergency_contact,
      emergency_tel: driver.emergency_tel,
      popia_email_opt_in: driver.popia_email_opt_in ?? false,
      popia_sms_opt_in: driver.popia_sms_opt_in ?? false,
    });
    setEditingProfile(true);
  }

  function updateProfile<K extends keyof DriverForm>(key: K, value: DriverForm[K]) {
    setProfileForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function handleSaveProfile() {
    if (!driver || !profileForm) return;

    setSavingProfile(true);
    const { error } = await supabase
      .from('drivers')
      .update({
        msa_licence_no: profileForm.msa_licence_no.trim(),
        wpmc_member_no: profileForm.wpmc_member_no.trim() || null,
        full_name: profileForm.full_name.trim(),
        mobile: profileForm.mobile.trim(),
        tel_home: profileForm.tel_home.trim() || null,
        tel_work: profileForm.tel_work.trim() || null,
        postal_address: profileForm.postal_address.trim(),
        postal_code: profileForm.postal_code.trim(),
        emergency_contact: profileForm.emergency_contact.trim(),
        emergency_tel: profileForm.emergency_tel.trim(),
        popia_email_opt_in: profileForm.popia_email_opt_in,
        popia_sms_opt_in: profileForm.popia_sms_opt_in,
      })
      .eq('id', driver.id);

    setSavingProfile(false);

    if (error) {
      setMessage({ type: 'negative', text: `Save failed: ${error.message}` });
      return;
    }

    setMessage({ type: 'positive', text: 'Profile updated.' });
    setEditingProfile(false);
    loadMyData();
  }

  function toVehiclePayload(f: VehicleForm) {
    return {
      make: f.make.trim(),
      model: f.model.trim(),
      year: Number(f.year),
      engine_make: f.engine_make.trim(),
      capacity: f.capacity.trim(),
      cylinders: Number(f.cylinders),
    };
  }

  function isVehicleValid(f: VehicleForm) {
    return f.make && f.model && f.year && f.engine_make && f.capacity && f.cylinders;
  }

  function openAddVehicle() {
    setNewVehicleForm(emptyVehicleForm);
    setAddVehicleOpen(true);
  }

  async function handleAddVehicle() {
    if (!driver) return;
    if (!isVehicleValid(newVehicleForm)) {
      setMessage({ type: 'negative', text: 'Please fill in all vehicle fields.' });
      return;
    }

    setAddingVehicle(true);
    const { error } = await supabase
      .from('vehicles')
      .insert({ ...toVehiclePayload(newVehicleForm), driver_id: driver.id });
    setAddingVehicle(false);

    if (error) {
      setMessage({ type: 'negative', text: `Save failed: ${error.message}` });
      return;
    }

    setMessage({ type: 'positive', text: 'Vehicle added.' });
    setAddVehicleOpen(false);
    loadMyData();
  }

  function openEditVehicle(row: Vehicle) {
    setEditingVehicleId(row.id);
    setVehicleRowForm({
      make: row.make,
      model: row.model,
      year: row.year.toString(),
      engine_make: row.engine_make,
      capacity: row.capacity,
      cylinders: row.cylinders.toString(),
    });
  }

  function cancelEditVehicle() {
    setEditingVehicleId(null);
    setVehicleRowForm(emptyVehicleForm);
  }

  async function handleSaveVehicle(vehicleId: string) {
    if (!isVehicleValid(vehicleRowForm)) {
      setMessage({ type: 'negative', text: 'Please fill in all vehicle fields.' });
      return;
    }

    setVehicleRowSaving(true);
    const { error } = await supabase.from('vehicles').update(toVehiclePayload(vehicleRowForm)).eq('id', vehicleId);
    setVehicleRowSaving(false);

    if (error) {
      setMessage({ type: 'negative', text: `Save failed: ${error.message}` });
      return;
    }

    setMessage({ type: 'positive', text: 'Vehicle updated.' });
    cancelEditVehicle();
    loadMyData();
  }

  async function handleDeleteVehicle(row: Vehicle) {
    if (!confirm(`Delete ${row.year} ${row.make} ${row.model}?`)) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', row.id);
    if (error) {
      setMessage({ type: 'negative', text: `Delete failed: ${error.message}` });
    } else {
      setMessage({ type: 'positive', text: 'Vehicle deleted.' });
      loadMyData();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="fiori-shell">Race Track Driver Portal</div>
        <div className="max-w-5xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>
      </div>
    );
  }

  if (!driver) return null;

  return (
    <div className="min-h-screen">
      <div className="fiori-shell flex items-center justify-between">
        <span>Race Track Driver Portal</span>
        <button
          className="fiori-btn fiori-btn-ghost"
          style={{ color: '#ffffff', borderColor: 'rgba(255,255,255,0.4)' }}
          onClick={handleLogout}
        >
          Log Out
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">My Profile</div>
            <h1 className="text-2xl font-semibold">{driver.full_name}</h1>
            <div className="text-sm text-[var(--fiori-text-subtle)]">
              MSA {driver.msa_licence_no} · {driver.email} · {driver.mobile}
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href="/enter-event"
              className="fiori-btn fiori-btn-emphasized inline-flex items-center justify-center"
            >
              + Enter an Event
            </Link>
            <button className="fiori-btn fiori-btn-ghost" onClick={openEditProfile}>
              Edit Profile
            </button>
          </div>
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

        <div className="flex items-end justify-between mb-4">
          <h2 className="text-lg font-semibold">My Vehicles</h2>
          <button className="fiori-btn fiori-btn-emphasized" onClick={openAddVehicle}>
            + Add Vehicle
          </button>
        </div>

        <table className="fiori-table">
          <thead>
            <tr>
              <th>Make</th>
              <th>Model</th>
              <th>Year</th>
              <th>Engine Make</th>
              <th>Capacity</th>
              <th>Cylinders</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-[var(--fiori-text-subtle)] py-6">
                  No vehicles yet. Add one to get started.
                </td>
              </tr>
            )}
            {vehicles.map((row) => {
              const isEditing = editingVehicleId === row.id;

              if (isEditing) {
                return (
                  <tr key={row.id} style={{ background: '#f5f9ff' }}>
                    <td>
                      <input
                        className="fiori-input"
                        value={vehicleRowForm.make}
                        onChange={(e) => setVehicleRowForm({ ...vehicleRowForm, make: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        value={vehicleRowForm.model}
                        onChange={(e) => setVehicleRowForm({ ...vehicleRowForm, model: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        type="number"
                        value={vehicleRowForm.year}
                        onChange={(e) => setVehicleRowForm({ ...vehicleRowForm, year: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        value={vehicleRowForm.engine_make}
                        onChange={(e) => setVehicleRowForm({ ...vehicleRowForm, engine_make: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        value={vehicleRowForm.capacity}
                        onChange={(e) => setVehicleRowForm({ ...vehicleRowForm, capacity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        type="number"
                        value={vehicleRowForm.cylinders}
                        onChange={(e) => setVehicleRowForm({ ...vehicleRowForm, cylinders: e.target.value })}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="fiori-btn fiori-btn-ghost mr-2"
                        onClick={cancelEditVehicle}
                        disabled={vehicleRowSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className="fiori-btn fiori-btn-emphasized"
                        onClick={() => handleSaveVehicle(row.id)}
                        disabled={vehicleRowSaving}
                      >
                        {vehicleRowSaving ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              }

              return (
                <tr key={row.id}>
                  <td>{row.make}</td>
                  <td>{row.model}</td>
                  <td>{row.year}</td>
                  <td>{row.engine_make}</td>
                  <td>{row.capacity}</td>
                  <td>{row.cylinders}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="fiori-btn fiori-btn-ghost mr-2" onClick={() => openEditVehicle(row)}>
                      Edit
                    </button>
                    <button
                      className="fiori-btn fiori-btn-ghost"
                      style={{ color: 'var(--fiori-negative)' }}
                      onClick={() => handleDeleteVehicle(row)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editingProfile && profileForm && (
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
          <div className="fiori-panel w-full max-w-2xl rounded-sm p-8 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-6">Edit Profile</h2>

            <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
              Licence details
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="fiori-label">MSA Licence No.</label>
                <input
                  className="fiori-input"
                  value={profileForm.msa_licence_no}
                  onChange={(e) => updateProfile('msa_licence_no', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">WPMC Member No.</label>
                <input
                  className="fiori-input"
                  value={profileForm.wpmc_member_no}
                  onChange={(e) => updateProfile('wpmc_member_no', e.target.value)}
                />
              </div>
            </div>

            <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
              Personal details
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="col-span-2">
                <label className="fiori-label">Full Name</label>
                <input
                  className="fiori-input"
                  value={profileForm.full_name}
                  onChange={(e) => updateProfile('full_name', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Email</label>
                <input
                  className="fiori-input"
                  value={driver.email}
                  disabled
                  style={{ background: '#f0f0f0', color: 'var(--fiori-text-subtle)' }}
                />
              </div>
              <div>
                <label className="fiori-label">Mobile</label>
                <input
                  className="fiori-input"
                  value={profileForm.mobile}
                  onChange={(e) => updateProfile('mobile', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Home Tel (optional)</label>
                <input
                  className="fiori-input"
                  value={profileForm.tel_home}
                  onChange={(e) => updateProfile('tel_home', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Work Tel (optional)</label>
                <input
                  className="fiori-input"
                  value={profileForm.tel_work}
                  onChange={(e) => updateProfile('tel_work', e.target.value)}
                />
              </div>
              <div className="col-span-2">
                <label className="fiori-label">Postal Address</label>
                <textarea
                  className="fiori-input"
                  rows={2}
                  value={profileForm.postal_address}
                  onChange={(e) => updateProfile('postal_address', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Postal Code</label>
                <input
                  className="fiori-input"
                  value={profileForm.postal_code}
                  onChange={(e) => updateProfile('postal_code', e.target.value)}
                />
              </div>
            </div>

            <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
              Emergency contact
            </div>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label className="fiori-label">Contact Name</label>
                <input
                  className="fiori-input"
                  value={profileForm.emergency_contact}
                  onChange={(e) => updateProfile('emergency_contact', e.target.value)}
                />
              </div>
              <div>
                <label className="fiori-label">Contact Tel</label>
                <input
                  className="fiori-input"
                  value={profileForm.emergency_tel}
                  onChange={(e) => updateProfile('emergency_tel', e.target.value)}
                />
              </div>
            </div>

            <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
              Communication preferences (POPIA)
            </div>
            <div className="flex gap-6 mb-8">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm.popia_email_opt_in}
                  onChange={(e) => updateProfile('popia_email_opt_in', e.target.checked)}
                />
                Email opt-in
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={profileForm.popia_sms_opt_in}
                  onChange={(e) => updateProfile('popia_sms_opt_in', e.target.checked)}
                />
                SMS opt-in
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="fiori-btn fiori-btn-ghost" onClick={() => setEditingProfile(false)}>
                Cancel
              </button>
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addVehicleOpen && (
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
          <div className="fiori-panel w-full max-w-lg rounded-sm p-8">
            <h2 className="text-lg font-semibold mb-6">Add Vehicle</h2>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <div className="col-span-2">
                <label className="fiori-label">Make</label>
                <input
                  className="fiori-input"
                  value={newVehicleForm.make}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, make: e.target.value })}
                  placeholder="e.g. Volkswagen"
                />
              </div>
              <div className="col-span-2">
                <label className="fiori-label">Model</label>
                <input
                  className="fiori-input"
                  value={newVehicleForm.model}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, model: e.target.value })}
                  placeholder="e.g. Golf"
                />
              </div>
              <div>
                <label className="fiori-label">Year</label>
                <input
                  className="fiori-input"
                  type="number"
                  value={newVehicleForm.year}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, year: e.target.value })}
                />
              </div>
              <div>
                <label className="fiori-label">Cylinders</label>
                <input
                  className="fiori-input"
                  type="number"
                  value={newVehicleForm.cylinders}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, cylinders: e.target.value })}
                />
              </div>
              <div>
                <label className="fiori-label">Engine Make</label>
                <input
                  className="fiori-input"
                  value={newVehicleForm.engine_make}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, engine_make: e.target.value })}
                />
              </div>
              <div>
                <label className="fiori-label">Capacity</label>
                <input
                  className="fiori-input"
                  value={newVehicleForm.capacity}
                  onChange={(e) => setNewVehicleForm({ ...newVehicleForm, capacity: e.target.value })}
                  placeholder="e.g. 1600cc"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="fiori-btn fiori-btn-ghost" onClick={() => setAddVehicleOpen(false)}>
                Cancel
              </button>
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleAddVehicle} disabled={addingVehicle}>
                {addingVehicle ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}