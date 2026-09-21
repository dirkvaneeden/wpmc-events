'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';

type Step = 'email' | 'otp';

export default function LoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'positive' | 'negative'; text: string } | null>(null);

  async function handleSendCode() {
    if (!email.trim()) {
      setMessage({ type: 'negative', text: 'Please enter your email address.' });
      return;
    }
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: false },
    });
    setBusy(false);

    if (error) {
      setMessage({
        type: 'negative',
        text:
          error.message.toLowerCase().includes('not found') ||
          error.message.toLowerCase().includes('signups not allowed')
            ? "We couldn't find a driver registered with that email. Try registering as a new driver instead."
            : error.message,
      });
      return;
    }
    setMessage({ type: 'positive', text: `Verification code sent to ${email.trim()}.` });
    setStep('otp');
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

    const { data: driver } = await supabase
      .from('drivers')
      .select('id')
      .eq('auth_user_id', data.session.user.id)
      .maybeSingle();

    if (driver) {
      router.replace('/my/profile');
    } else {
      router.replace('/register');
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="fiori-shell">Race Track Driver Portal</div>

      <div className="flex-1 flex items-center justify-center px-6 py-10">
        <div className="fiori-panel w-full max-w-md rounded-sm p-8">
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
              <h1 className="text-xl font-semibold mb-2">Driver Log In</h1>
              <p className="text-sm text-[var(--fiori-text-subtle)] mb-6">
                Enter your registered email address and we&apos;ll send you a verification code.
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
              <button
                className="fiori-btn fiori-btn-emphasized w-full mb-3"
                onClick={handleSendCode}
                disabled={busy}
              >
                {busy ? 'Sending…' : 'Send Verification Code'}
              </button>
              <p className="text-sm text-center text-[var(--fiori-text-subtle)]">
                New driver?{' '}
                <Link href="/register" className="text-[var(--fiori-action)] hover:underline">
                  Register here
                </Link>
              </p>
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
                {busy ? 'Verifying…' : 'Verify & Log In'}
              </button>
              <button className="fiori-btn fiori-btn-ghost w-full" onClick={handleSendCode} disabled={busy}>
                Resend Code
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}