'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { resolveDriverForSession } from '@/lib/driverAuth';


type Step = 'checking' | 'email' | 'otp' | 'details';

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

const emptyForm: DriverForm = {
  msa_licence_no: '',
  wpmc_member_no: '',
  full_name: '',
  mobile: '',
  tel_home: '',
  tel_work: '',
  postal_address: '',
  postal_code: '',
  emergency_contact: '',
  emergency_tel: '',
  popia_email_opt_in: false,
  popia_sms_opt_in: false,
};

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('checking');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [form, setForm] = useState<DriverForm>(emptyForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  useEffect(() => {
    checkExistingSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkExistingSession() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      setStep('email');
      return;
    }

    setEmail(session.user.email ?? '');
    const { data: existingDriver } = await supabase
      .from('drivers')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .maybeSingle();

    if (existingDriver) {
      router.replace('/my/profile');
    } else {
      setStep('details');
    }
  }

  function update<K extends keyof DriverForm>(key: K, value: DriverForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSendCode() {
    if (!email.trim()) {
      setMessage({ type: 'negative', text: 'Please enter your email address.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true },
    });
    setBusy(false);

    if (error) {
      setMessage({ type: 'negative', text: error.message });
      return;
    }
    setMessage({ type: 'positive', text: `Verification code sent to ${email.trim()}.` });
    setStep('otp');
  }

    async function handleUseDifferentEmail() {
    await supabase.auth.signOut();
    setEmail('');
    setCode('');
    setForm(emptyForm);
    setMessage(null);
    setStep('email');
  }

  async function handleVerifyCode() {
    if (!code.trim()) {
      setMessage({ type: 'negative', text: 'Please enter the code from your email.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    });
    setBusy(false);

    if (error || !data.session) {
      setMessage({ type: 'negative', text: error?.message ?? 'Invalid or expired code.' });
      return;
    }

    const { data: existingDriver } = await supabase
      .from('drivers')
      .select('id')
      .eq('auth_user_id', data.session.user.id)
      .maybeSingle();

    if (existingDriver) {
      router.replace('/my/profile');
    } else {
      setStep('details');
    }
  }

  async function handleSaveDetails() {
    const required: (keyof DriverForm)[] = [
      'msa_licence_no',
      'full_name',
      'mobile',
      'postal_address',
      'postal_code',
      'emergency_contact',
      'emergency_tel',
    ];
    const missing = required.find((k) => !form[k]);
    if (missing) {
      setMessage({ type: 'negative', text: 'Please fill in all required fields.' });
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setMessage({ type: 'negative', text: 'Your session expired. Please start again.' });
      setStep('email');
      return;
    }

    setBusy(true);
    const { error } = await supabase.from('drivers').insert({
      auth_user_id: session.user.id,
      msa_licence_no: form.msa_licence_no.trim(),
      wpmc_member_no: form.wpmc_member_no.trim() || null,
      full_name: form.full_name.trim(),
      email: session.user.email,
      mobile: form.mobile.trim(),
      tel_home: form.tel_home.trim() || null,
      tel_work: form.tel_work.trim() || null,
      postal_address: form.postal_address.trim(),
      postal_code: form.postal_code.trim(),
      emergency_contact: form.emergency_contact.trim(),
      emergency_tel: form.emergency_tel.trim(),
      popia_email_opt_in: form.popia_email_opt_in,
      popia_sms_opt_in: form.popia_sms_opt_in,
    });
    setBusy(false);

    if (error) {
      const friendly =
        error.code === '23505' ? 'A driver with that MSA licence number already exists.' : error.message;
      setMessage({ type: 'negative', text: `Save failed: ${friendly}` });
      return;
    }

    router.replace('/my/profile');
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fiori-shell">Race Track Driver Portal</div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className={`fiori-panel w-full rounded-sm p-8 ${step === 'details' ? 'max-w-2xl' : 'max-w-md'}`}>
          {step === 'checking' && <p className="text-[var(--fiori-text-subtle)]">Checking…</p>}

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

          {step === 'email' && (
            <>
              <h1 className="text-xl font-semibold mb-2">Register as a New Driver</h1>
              <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
                Enter your email address and we&apos;ll send you a verification code.
              </p>
              <div className="mb-6">
                <label className="fiori-label">Email</label>
                <input
                  className="fiori-input"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  onKeyDown={(e) => e.key === 'Enter' && handleSendCode()}
                  autoFocus
                />
              </div>
              <button className="fiori-btn fiori-btn-emphasized w-full" onClick={handleSendCode} disabled={busy}>
                {busy ? 'Sending…' : 'Send Verification Code'}
              </button>
            </>
          )}

          {step === 'otp' && (
            <>
              <h1 className="text-xl font-semibold mb-2">Enter Verification Code</h1>
              <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
                We sent a code to <strong>{email}</strong>. Enter it below.
              </p>
              <div className="mb-6">
                <label className="fiori-label">Verification Code</label>
                <input
                  className="fiori-input"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                  autoFocus
                />
              </div>
              <button
                className="fiori-btn fiori-btn-emphasized w-full mb-3"
                onClick={handleVerifyCode}
                disabled={busy}
              >
                {busy ? 'Verifying…' : 'Verify'}
              </button>
              <button className="fiori-btn fiori-btn-ghost w-full" onClick={handleSendCode} disabled={busy}>
                Resend Code
              </button>
            </>
          )}

          {step === 'details' && (
            <>
              <h1 className="text-xl font-semibold mb-1">Complete Your Profile</h1>
              <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
                Email verified — {email}.{' '}
                <button onClick={handleUseDifferentEmail} className="text-[var(--fiori-action)] hover:underline">
                  Not you?
                </button>{' '}
                Now tell us about you.
              </p>

              <div className="mb-2 text-xs font-semibold text-[var(--fiori-text-subtle)] uppercase tracking-wide">
                Licence details
              </div>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                  <label className="fiori-label">MSA Licence No.</label>
                  <input
                    className="fiori-input"
                    value={form.msa_licence_no}
                    onChange={(e) => update('msa_licence_no', e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">WPMC Member No.</label>
                  <input
                    className="fiori-input"
                    value={form.wpmc_member_no}
                    onChange={(e) => update('wpmc_member_no', e.target.value)}
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
                    value={form.full_name}
                    onChange={(e) => update('full_name', e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">Mobile</label>
                  <input
                    className="fiori-input"
                    value={form.mobile}
                    onChange={(e) => update('mobile', e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">Home Tel (optional)</label>
                  <input
                    className="fiori-input"
                    value={form.tel_home}
                    onChange={(e) => update('tel_home', e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">Work Tel (optional)</label>
                  <input
                    className="fiori-input"
                    value={form.tel_work}
                    onChange={(e) => update('tel_work', e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <label className="fiori-label">Postal Address</label>
                  <textarea
                    className="fiori-input"
                    rows={2}
                    value={form.postal_address}
                    onChange={(e) => update('postal_address', e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">Postal Code</label>
                  <input
                    className="fiori-input"
                    value={form.postal_code}
                    onChange={(e) => update('postal_code', e.target.value)}
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
                    value={form.emergency_contact}
                    onChange={(e) => update('emergency_contact', e.target.value)}
                  />
                </div>
                <div>
                  <label className="fiori-label">Contact Tel</label>
                  <input
                    className="fiori-input"
                    value={form.emergency_tel}
                    onChange={(e) => update('emergency_tel', e.target.value)}
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
                    checked={form.popia_email_opt_in}
                    onChange={(e) => update('popia_email_opt_in', e.target.checked)}
                  />
                  Email opt-in
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.popia_sms_opt_in}
                    onChange={(e) => update('popia_sms_opt_in', e.target.checked)}
                  />
                  SMS opt-in
                </label>
              </div>

              <button
                className="fiori-btn fiori-btn-emphasized w-full"
                onClick={handleSaveDetails}
                disabled={busy}
              >
                {busy ? 'Saving…' : 'Complete Registration'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}