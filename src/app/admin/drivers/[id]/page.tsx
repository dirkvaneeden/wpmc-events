'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { Driver, Vehicle } from '@/lib/types';

interface VehicleForm {
  make: string;
  model: string;
  year: string;
  engine_make: string;
  capacity: string;
  cylinders: string;
}

const emptyForm: VehicleForm = {
  make: '',
  model: '',
  year: '',
  engine_make: '',
  capacity: '',
  cylinders: '',
};

export default function DriverDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [driver, setDriver] = useState<Driver | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [rowForm, setRowForm] = useState<VehicleForm>(emptyForm);
  const [rowSaving, setRowSaving] = useState(false);

  const [panelOpen, setPanelOpen] = useState(false);
  const [createForm, setCreateForm] = useState<VehicleForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  async function loadAll() {
    setLoading(true);
    const [driverRes, vehiclesRes] = await Promise.all([
      supabase.from('drivers').select('*').eq('id', id).single(),
      supabase.from('vehicles').select('*').eq('driver_id', id).order('created_at', { ascending: true }),
    ]);

    if (driverRes.error) {
      setMessage({ type: 'negative', text: `Couldn't load driver: ${driverRes.error.message}` });
    } else {
      setDriver(driverRes.data);
    }

    if (vehiclesRes.error) {
      setMessage({ type: 'negative', text: `Couldn't load vehicles: ${vehiclesRes.error.message}` });
    } else {
      setVehicles(vehiclesRes.data ?? []);
    }

    setLoading(false);
  }

  useEffect(() => {
    if (id) loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function toPayload(f: VehicleForm) {
    return {
      make: f.make.trim(),
      model: f.model.trim(),
      year: Number(f.year),
      engine_make: f.engine_make.trim(),
      capacity: f.capacity.trim(),
      cylinders: Number(f.cylinders),
    };
  }

  function isValid(f: VehicleForm) {
    return f.make && f.model && f.year && f.engine_make && f.capacity && f.cylinders;
  }

  // --- Create ---

  function openCreate() {
    setCreateForm(emptyForm);
    setPanelOpen(true);
  }

  async function handleCreateSave() {
    if (!isValid(createForm)) {
      setMessage({ type: 'negative', text: 'Please fill in all vehicle fields.' });
      return;
    }

    setSaving(true);
    const { error } = await supabase
      .from('vehicles')
      .insert({ ...toPayload(createForm), driver_id: id });
    setSaving(false);

    if (error) {
      setMessage({ type: 'negative', text: `Save failed: ${error.message}` });
      return;
    }

    setMessage({ type: 'positive', text: 'Vehicle added.' });
    setPanelOpen(false);
    loadAll();
  }

  // --- Edit (inline row) ---

  function openRowEdit(row: Vehicle) {
    setEditingId(row.id);
    setRowForm({
      make: row.make,
      model: row.model,
      year: row.year.toString(),
      engine_make: row.engine_make,
      capacity: row.capacity,
      cylinders: row.cylinders.toString(),
    });
  }

  function cancelRowEdit() {
    setEditingId(null);
    setRowForm(emptyForm);
  }

  async function handleRowSave(vehicleId: string) {
    if (!isValid(rowForm)) {
      setMessage({ type: 'negative', text: 'Please fill in all vehicle fields.' });
      return;
    }

    setRowSaving(true);
    const { error } = await supabase.from('vehicles').update(toPayload(rowForm)).eq('id', vehicleId);
    setRowSaving(false);

    if (error) {
      setMessage({ type: 'negative', text: `Save failed: ${error.message}` });
      return;
    }

    setMessage({ type: 'positive', text: 'Vehicle updated.' });
    cancelRowEdit();
    loadAll();
  }

  async function handleDelete(row: Vehicle) {
    if (!confirm(`Delete ${row.year} ${row.make} ${row.model}?`)) return;
    const { error } = await supabase.from('vehicles').delete().eq('id', row.id);
    if (error) {
      setMessage({ type: 'negative', text: `Delete failed: ${error.message}` });
    } else {
      setMessage({ type: 'positive', text: 'Vehicle deleted.' });
      loadAll();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen">
        <div className="fiori-shell">Race Track Admin</div>
        <div className="max-w-5xl mx-auto px-6 py-8 text-[var(--fiori-text-subtle)]">Loading…</div>
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-screen">
        <div className="fiori-shell">Race Track Admin</div>
        <div className="max-w-5xl mx-auto px-6 py-8">Driver not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="fiori-shell">Race Track Admin</div>

      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="text-xs text-[var(--fiori-text-subtle)] mb-1">
          <Link href="/drivers" className="text-[var(--fiori-action)] hover:underline">
            Drivers
          </Link>{' '}
          / {driver.full_name}
        </div>
        <h1 className="text-2xl font-semibold mb-1">{driver.full_name}</h1>
        <div className="text-sm text-[var(--fiori-text-subtle)] mb-6">
          MSA {driver.msa_licence_no} · {driver.email} · {driver.mobile}
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
          <h2 className="text-lg font-semibold">Vehicles</h2>
          <button className="fiori-btn fiori-btn-emphasized" onClick={openCreate}>
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
              const isEditing = editingId === row.id;

              if (isEditing) {
                return (
                  <tr key={row.id} style={{ background: '#f5f9ff' }}>
                    <td>
                      <input
                        className="fiori-input"
                        value={rowForm.make}
                        onChange={(e) => setRowForm({ ...rowForm, make: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        value={rowForm.model}
                        onChange={(e) => setRowForm({ ...rowForm, model: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        type="number"
                        value={rowForm.year}
                        onChange={(e) => setRowForm({ ...rowForm, year: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        value={rowForm.engine_make}
                        onChange={(e) => setRowForm({ ...rowForm, engine_make: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        value={rowForm.capacity}
                        onChange={(e) => setRowForm({ ...rowForm, capacity: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="fiori-input"
                        type="number"
                        value={rowForm.cylinders}
                        onChange={(e) => setRowForm({ ...rowForm, cylinders: e.target.value })}
                      />
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        className="fiori-btn fiori-btn-ghost mr-2"
                        onClick={cancelRowEdit}
                        disabled={rowSaving}
                      >
                        Cancel
                      </button>
                      <button
                        className="fiori-btn fiori-btn-emphasized"
                        onClick={() => handleRowSave(row.id)}
                        disabled={rowSaving}
                      >
                        {rowSaving ? 'Saving…' : 'Save'}
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
                    <button className="fiori-btn fiori-btn-ghost mr-2" onClick={() => openRowEdit(row)}>
                      Edit
                    </button>
                    <button
                      className="fiori-btn fiori-btn-ghost"
                      style={{ color: 'var(--fiori-negative)' }}
                      onClick={() => handleDelete(row)}
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

      {panelOpen && (
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
                  value={createForm.make}
                  onChange={(e) => setCreateForm({ ...createForm, make: e.target.value })}
                  placeholder="e.g. Volkswagen"
                />
              </div>
              <div className="col-span-2">
                <label className="fiori-label">Model</label>
                <input
                  className="fiori-input"
                  value={createForm.model}
                  onChange={(e) => setCreateForm({ ...createForm, model: e.target.value })}
                  placeholder="e.g. Golf"
                />
              </div>
              <div>
                <label className="fiori-label">Year</label>
                <input
                  className="fiori-input"
                  type="number"
                  value={createForm.year}
                  onChange={(e) => setCreateForm({ ...createForm, year: e.target.value })}
                />
              </div>
              <div>
                <label className="fiori-label">Cylinders</label>
                <input
                  className="fiori-input"
                  type="number"
                  value={createForm.cylinders}
                  onChange={(e) => setCreateForm({ ...createForm, cylinders: e.target.value })}
                />
              </div>
              <div>
                <label className="fiori-label">Engine Make</label>
                <input
                  className="fiori-input"
                  value={createForm.engine_make}
                  onChange={(e) => setCreateForm({ ...createForm, engine_make: e.target.value })}
                />
              </div>
              <div>
                <label className="fiori-label">Capacity</label>
                <input
                  className="fiori-input"
                  value={createForm.capacity}
                  onChange={(e) => setCreateForm({ ...createForm, capacity: e.target.value })}
                  placeholder="e.g. 1600cc"
                />
              </div>
            </div>

            <div className="flex gap-2 justify-end">
              <button className="fiori-btn fiori-btn-ghost" onClick={() => setPanelOpen(false)}>
                Cancel
              </button>
              <button className="fiori-btn fiori-btn-emphasized" onClick={handleCreateSave} disabled={saving}>
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}