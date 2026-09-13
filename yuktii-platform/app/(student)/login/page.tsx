'use client';

import { useState, useRef, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Step =
  | 'login'
  | 'signup-contact'
  | 'signup-otp'
  | 'signup-password'
  | 'forgot-contact'
  | 'forgot-otp'
  | 'forgot-password'
  | 'success';

function isEmailLike(s: string) {
  return s.includes('@');
}

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const ref0 = useRef<HTMLInputElement>(null);
  const ref1 = useRef<HTMLInputElement>(null);
  const ref2 = useRef<HTMLInputElement>(null);
  const ref3 = useRef<HTMLInputElement>(null);
  const ref4 = useRef<HTMLInputElement>(null);
  const ref5 = useRef<HTMLInputElement>(null);
  const refs = [ref0, ref1, ref2, ref3, ref4, ref5];

  const digits = Array.from({ length: 6 }, (_, i) => value[i] ?? '');

  function handleChange(i: number, raw: string) {
    const ch = raw.replace(/\D/g, '');
    if (!ch && raw !== '') return;
    const next = [...digits];
    if (ch) {
      next[i] = ch[0];
      onChange(next.join(''));
      if (i < 5) refs[i + 1].current?.focus();
    } else {
      next[i] = '';
      onChange(next.join(''));
    }
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (digits[i]) {
        const next = [...digits];
        next[i] = '';
        onChange(next.join(''));
      } else if (i > 0) {
        refs[i - 1].current?.focus();
        const next = [...digits];
        next[i - 1] = '';
        onChange(next.join(''));
      }
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs[i - 1].current?.focus();
    } else if (e.key === 'ArrowRight' && i < 5) {
      refs[i + 1].current?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const next = Array.from({ length: 6 }, (_, i) => text[i] ?? '');
    onChange(next.join(''));
    refs[Math.min(text.length, 5)].current?.focus();
  }

  return (
    <div className="flex gap-3 justify-center" onPaste={handlePaste}>
      {([0, 1, 2, 3, 4, 5] as const).map((i) => (
        <input
          key={i}
          ref={refs[i]}
          id={`otp-${i}`}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i]}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          className="w-12 h-14 text-center text-2xl font-bold rounded-lg border-2
                     border-line bg-white text-ink focus:outline-none
                     focus:border-marigold transition-all duration-150 shadow-sm"
        />
      ))}
    </div>
  );
}

function useCountdown(seconds: number) {
  const [remaining, setRemaining] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const start = useCallback(() => {
    setRemaining(seconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setRemaining((s) => {
        if (s <= 1) { clearInterval(timer.current!); return 0; }
        return s - 1;
      });
    }, 1000);
  }, [seconds]);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  return { remaining, start };
}

function Field({
  id, label, type = 'text', value, onChange, placeholder, required, autoFocus, hint,
}: {
  id: string; label: string; type?: string; value: string;
  onChange: (v: string) => void; placeholder?: string;
  required?: boolean; autoFocus?: boolean; hint?: string;
}) {
  const [show, setShow] = useState(false);
  const isPass = type === 'password';
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium text-ink/70">{label}</label>
      <div className="relative">
        <input
          id={id}
          type={isPass ? (show ? 'text' : 'password') : type}
          required={required}
          autoFocus={autoFocus}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2.5 rounded-md border border-line bg-white/70 text-ink
                     placeholder-ink/30 focus:outline-none focus:ring-2 focus:ring-marigold/40
                     focus:border-marigold transition-all duration-150 min-h-[44px] text-sm"
        />
        {isPass && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            tabIndex={-1}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/40 hover:text-ink/70 transition-colors"
          >
            {show ? (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 4.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>
        )}
      </div>
      {hint && <p className="text-xs text-ink/50">{hint}</p>}
    </div>
  );
}

function Btn({ children, loading, disabled, type = 'submit', onClick }: {
  children: React.ReactNode; loading?: boolean; disabled?: boolean;
  type?: 'submit' | 'button'; onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={loading || disabled}
      onClick={onClick}
      className="w-full bg-ink text-paper py-3 rounded-md text-sm font-medium
                 hover:bg-ink/90 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed
                 transition-all duration-150 min-h-[44px] flex items-center justify-center gap-2"
    >
      {loading && (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
        </svg>
      )}
      {children}
    </button>
  );
}

function Err({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="text-sm text-red-600 flex items-start gap-1.5">
      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
      {msg}
    </p>
  );
}

function Ok({ msg }: { msg: string | null }) {
  if (!msg) return null;
  return (
    <p className="text-sm text-teal flex items-start gap-1.5">
      <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
      {msg}
    </p>
  );
}

function SentNote({ contact }: { contact: string }) {
  return (
    <div className="rounded-md bg-teal/10 border border-teal/30 px-3 py-2.5 text-xs text-ink/70 flex gap-2 items-start">
      <svg className="w-4 h-4 text-teal mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
        <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
      </svg>
      <span>
        OTP sent to <strong>{contact}</strong>. Check your inbox (and spam folder).
      </span>
    </div>
  );
}

function Back({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="inline-flex items-center gap-1 text-sm text-ink/50 hover:text-ink transition-colors mb-4">
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Back
    </button>
  );
}

function Steps({ total, current }: { total: number; current: number }) {
  return (
    <div className="flex gap-1.5 mb-5">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className={`h-1 rounded-full transition-all duration-300
          ${i === current ? 'w-6 bg-marigold' : i < current ? 'w-3 bg-marigold/40' : 'w-3 bg-line'}`} />
      ))}
    </div>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get('mode');
  const domainParam = searchParams.get('domain');
  const durationParam = searchParams.get('duration');
  const returnToParam = searchParams.get('returnTo');

  const [step, setStep] = useState<Step>(initialMode === 'signup' ? 'signup-contact' : 'login');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Login
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPw, setLoginPw] = useState('');

  // Signup
  const [suName, setSuName] = useState('');
  const [suEmail, setSuEmail] = useState('');
  const [suPhone, setSuPhone] = useState('');
  const [suCollege, setSuCollege] = useState('');
  const [suDegree, setSuDegree] = useState('');
  const [suDegreeOther, setSuDegreeOther] = useState('');
  const [suOtp, setSuOtp] = useState('');
  const [suPw, setSuPw] = useState('');
  const [suConfirm, setSuConfirm] = useState('');

  // Forgot
  const [fgContact, setFgContact] = useState('');
  const [fgOtp, setFgOtp] = useState('');
  const [fgPw, setFgPw] = useState('');
  const [fgConfirm, setFgConfirm] = useState('');

  const { remaining: suTimer, start: startSuTimer } = useCountdown(60);
  const { remaining: fgTimer, start: startFgTimer } = useCountdown(60);

  function go(s: Step) { setErr(null); setOk(null); setStep(s); }
  function fail(msg: string) { setErr(msg); setLoading(false); }

  async function handleAutoEnrollAndRedirect(role?: string) {
    if (role === 'ADMIN') {
      window.location.href = '/admin';
      return;
    }
    // If the user was redirected here from a protected page, return them there first.
    if (returnToParam) {
      window.location.href = decodeURIComponent(returnToParam);
      return;
    }
    // Auto-enroll flow: if domain+duration params are present, enroll and go to track.
    if (domainParam && durationParam) {
      try {
        const res = await fetch('/api/enrollments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ domainSlug: domainParam, duration: Number(durationParam) }),
        });
        const data = await res.json();
        if (res.ok && data.enrollmentId) {
          window.location.href = `/dashboard/track/${data.enrollmentId}`;
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }
    window.location.href = '/dashboard';
  }

  async function apiPost(url: string, body: Record<string, string>) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  }

  async function sendOtp(contact: string, type: 'signup' | 'forgot', via: 'email' | 'phone') {
    setLoading(true); setErr(null); setOk(null);
    try {
      await apiPost('/api/auth/otp/send', { contact, type, via });
      setOk(`OTP sent to your ${via === 'email' ? 'email' : 'phone'}. Check your inbox.`);
      return true;
    } catch (e: any) { setErr(e.message); return false; }
    finally { setLoading(false); }
  }

  async function verifyOtpApi(contact: string, otp: string, type: 'signup' | 'forgot') {
    setLoading(true); setErr(null); setOk(null);
    try {
      await apiPost('/api/auth/otp/verify', { contact, otp, type });
      return true;
    } catch (e: any) { setErr(e.message); return false; }
    finally { setLoading(false); }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault(); setErr(null); setLoading(true);
    try {
      const data = await apiPost('/api/auth/login', { email: loginEmail, password: loginPw });
      await handleAutoEnrollAndRedirect(data.role);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function handleSignupContact(e: React.FormEvent) {
    e.preventDefault();
    if (!suName.trim()) return fail('Full name is required');
    if (!suEmail.trim()) return fail('Email address is required');
    // Phone: required, 10-digit Indian mobile
    const phoneDigits = suPhone.replace(/\D/g, '');
    if (!phoneDigits) return fail('Phone number is required');
    if (!/^[6-9]\d{9}$/.test(phoneDigits)) return fail('Enter a valid 10-digit Indian mobile number (starts with 6-9)');
    // Degree program: required
    if (!suDegree) return fail('Please select your degree program');
    if (suDegree === 'Other' && !suDegreeOther.trim()) return fail('Please specify your degree program');
    const ok = await sendOtp(suEmail, 'signup', 'email');
    if (ok) { startSuTimer(); go('signup-otp'); }
  }

  async function handleSignupOtp(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = suOtp.replace(/\s/g, '');
    if (cleaned.length < 6) return fail('Please enter all 6 digits');
    const verified = await verifyOtpApi(suEmail, cleaned, 'signup');
    if (verified) go('signup-password');
  }

  async function handleSignupPassword(e: React.FormEvent) {
    e.preventDefault();
    if (suPw !== suConfirm) return fail('Passwords do not match');
    if (suPw.length < 8) return fail('Password must be at least 8 characters');
    setErr(null); setLoading(true);
    try {
      const data = await apiPost('/api/auth/signup', {
        name: suName, email: suEmail,
        phone: suPhone.replace(/\D/g, ''),  // store digits only
        college: suCollege,
        degreeProgram: suDegree,
        degreeProgramOther: suDegreeOther,
        password: suPw,
      });
      go('success');
      setTimeout(() => handleAutoEnrollAndRedirect(data.role), 1800);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function handleForgotContact(e: React.FormEvent) {
    e.preventDefault();
    if (!fgContact.trim()) return fail('Enter your email or phone number');
    const via = isEmailLike(fgContact) ? 'email' : 'phone';
    const sent = await sendOtp(fgContact.trim(), 'forgot', via);
    if (sent) { startFgTimer(); go('forgot-otp'); }
  }

  async function handleForgotOtp(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = fgOtp.replace(/\s/g, '');
    if (cleaned.length < 6) return fail('Please enter all 6 digits');
    const verified = await verifyOtpApi(fgContact.trim(), cleaned, 'forgot');
    if (verified) go('forgot-password');
  }

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    if (fgPw !== fgConfirm) return fail('Passwords do not match');
    if (fgPw.length < 8) return fail('Password must be at least 8 characters');
    setErr(null); setLoading(true);
    try {
      await apiPost('/api/auth/reset-password', { contact: fgContact.trim(), newPassword: fgPw });
      setOk('Password reset successfully! Redirecting to login…');
      setStep('success');
      setTimeout(() => go('login'), 2000);
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  }

  async function resendSignup() {
    const sent = await sendOtp(suEmail, 'signup', 'email');
    if (sent) { startSuTimer(); setSuOtp(''); }
  }

  async function resendForgot() {
    const via = isEmailLike(fgContact) ? 'email' : 'phone';
    const sent = await sendOtp(fgContact.trim(), 'forgot', via);
    if (sent) { startFgTimer(); setFgOtp(''); }
  }

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      {step === 'login' && (
        <form onSubmit={handleLogin} className="space-y-5" id="login-form">
          <div className="mb-2">
            <h1 className="font-display text-3xl font-semibold">Log in</h1>
            <p className="text-sm text-ink/60 mt-1">
              Student or admin — enter your credentials below.
            </p>
          </div>

          <Field id="login-email" label="Email" type="email" value={loginEmail}
            onChange={setLoginEmail} placeholder="you@example.com" required autoFocus />
          <Field id="login-password" label="Password" type="password" value={loginPw}
            onChange={setLoginPw} placeholder="••••••••" required />

          <div className="flex justify-end">
            <button type="button" onClick={() => go('forgot-contact')}
              className="text-sm text-marigold-dark hover:underline">
              Forgot password?
            </button>
          </div>

          <Err msg={err} />
          <Btn loading={loading}>Log in</Btn>

          <p className="text-center text-sm text-ink/50">
            No account yet?{' '}
            <button type="button" onClick={() => go('signup-contact')}
              className="text-marigold-dark font-medium hover:underline">
              Create one
            </button>
          </p>
        </form>
      )}

      {step === 'signup-contact' && (
        <form onSubmit={handleSignupContact} className="space-y-4" id="signup-contact-form">
          <Back onClick={() => go('login')} />
          <Steps total={3} current={0} />
          <div className="mb-2">
            <h1 className="font-display text-3xl font-semibold">Create account</h1>
            <p className="text-sm text-ink/60 mt-1">
              We'll send a 6-digit OTP to your email to verify it.
            </p>
          </div>

          <Field id="su-name" label="Full name" value={suName} onChange={setSuName}
            placeholder="Riya Sharma" required autoFocus />
          <Field id="su-email" label="Email address" type="email" value={suEmail}
            onChange={setSuEmail} placeholder="you@example.com" required />
          <Field id="su-phone" label="Phone number" type="tel" value={suPhone} onChange={setSuPhone}
            placeholder="9876543210" required
            hint="10-digit Indian mobile number (used for password recovery)" />
          <Field id="su-college" label="College / Institution" value={suCollege}
            onChange={setSuCollege} placeholder="IIT Delhi" hint="Optional" />

          {/* Degree Program */}
          <div className="space-y-1">
            <label htmlFor="su-degree" className="block text-sm font-medium text-ink/70">
              Degree program <span className="text-red-500">*</span>
            </label>
            <select
              id="su-degree"
              required
              value={suDegree}
              onChange={(e) => { setSuDegree(e.target.value); setSuDegreeOther(''); }}
              className="w-full px-3 py-2.5 rounded-md border border-line bg-white/70 text-ink
                         focus:outline-none focus:ring-2 focus:ring-marigold/40 focus:border-marigold
                         transition-all duration-150 min-h-[44px] text-sm"
            >
              <option value="">Select your degree…</option>
              <option value="BSc">BSc</option>
              <option value="MSc">MSc</option>
              <option value="BE/B.Tech">BE / B.Tech</option>
              <option value="ME/M.Tech">ME / M.Tech</option>
              <option value="BCA/MCA">BCA / MCA</option>
              <option value="Other">Other</option>
            </select>
          </div>
          {suDegree === 'Other' && (
            <Field id="su-degree-other" label="Specify your degree" value={suDegreeOther}
              onChange={setSuDegreeOther} placeholder="e.g. Diploma in CS, BBA" required />
          )}

          <Err msg={err} />
          <Btn loading={loading}>Send OTP to Email</Btn>

          <p className="text-center text-sm text-ink/50">
            Already have an account?{' '}
            <button type="button" onClick={() => go('login')}
              className="text-marigold-dark font-medium hover:underline">Log in</button>
          </p>
        </form>
      )}

      {step === 'signup-otp' && (
        <form onSubmit={handleSignupOtp} className="space-y-5" id="signup-otp-form">
          <Back onClick={() => go('signup-contact')} />
          <Steps total={3} current={1} />
          <div className="mb-2">
            <h1 className="font-display text-3xl font-semibold">Verify email</h1>
            <p className="text-sm text-ink/60 mt-1">
              Enter the 6-digit code sent to{' '}
              <strong className="text-ink">{suEmail}</strong>
            </p>
          </div>

          <SentNote contact={suEmail} />
          <OtpInput value={suOtp} onChange={setSuOtp} />

          <div className="text-center text-sm text-ink/50">
            {suTimer > 0 ? (
              <span>Resend in <span className="text-marigold-dark font-medium">{suTimer}s</span></span>
            ) : (
              <button type="button" onClick={resendSignup} disabled={loading}
                className="text-marigold-dark font-medium hover:underline disabled:opacity-50">
                Resend OTP
              </button>
            )}
          </div>

          <Err msg={err} />
          <Ok msg={ok} />
          <Btn loading={loading} disabled={suOtp.replace(/\s/g, '').length < 6}>
            Verify OTP
          </Btn>
        </form>
      )}

      {step === 'signup-password' && (
        <form onSubmit={handleSignupPassword} className="space-y-4" id="signup-password-form">
          <Back onClick={() => go('signup-otp')} />
          <Steps total={3} current={2} />
          <div className="mb-2">
            <h1 className="font-display text-3xl font-semibold">Set password</h1>
            <p className="text-sm text-ink/60 mt-1">Choose a strong password — at least 8 characters.</p>
          </div>

          <Field id="su-pw" label="Password" type="password" value={suPw} onChange={setSuPw}
            placeholder="At least 8 characters" required autoFocus />
          <Field id="su-confirm" label="Confirm password" type="password" value={suConfirm}
            onChange={setSuConfirm} placeholder="Repeat your password" required />

          <Err msg={err} />
          <Btn loading={loading}>Create Account</Btn>
        </form>
      )}

      {step === 'forgot-contact' && (
        <form onSubmit={handleForgotContact} className="space-y-5" id="forgot-contact-form">
          <Back onClick={() => go('login')} />
          <Steps total={3} current={0} />
          <div className="mb-2">
            <h1 className="font-display text-3xl font-semibold">Reset password</h1>
            <p className="text-sm text-ink/60 mt-1">
              Enter your registered email <em>or</em> phone number.
            </p>
          </div>

          <div className="space-y-1">
            <label htmlFor="fg-contact" className="block text-sm font-medium text-ink/70">
              Email or phone number
            </label>
            <input
              id="fg-contact"
              type="text"
              required
              autoFocus
              value={fgContact}
              placeholder="you@example.com or +91 98765 43210"
              onChange={(e) => setFgContact(e.target.value)}
              className="w-full px-3 py-2.5 rounded-md border border-line bg-white/70 text-ink
                         placeholder-ink/30 focus:outline-none focus:ring-2 focus:ring-marigold/40
                         focus:border-marigold transition-all duration-150 min-h-[44px] text-sm"
            />
            <p className="text-xs text-ink/50">
              If you entered a phone number during signup, you can recover via SMS.
            </p>
          </div>

          <Err msg={err} />
          <Btn loading={loading}>Send OTP</Btn>
        </form>
      )}

      {step === 'forgot-otp' && (
        <form onSubmit={handleForgotOtp} className="space-y-5" id="forgot-otp-form">
          <Back onClick={() => go('forgot-contact')} />
          <Steps total={3} current={1} />
          <div className="mb-2">
            <h1 className="font-display text-3xl font-semibold">Enter OTP</h1>
            <p className="text-sm text-ink/60 mt-1">
              6-digit code sent to{' '}
              <strong className="text-ink">{fgContact}</strong>
            </p>
          </div>

          <SentNote contact={fgContact} />
          <OtpInput value={fgOtp} onChange={setFgOtp} />

          <div className="text-center text-sm text-ink/50">
            {fgTimer > 0 ? (
              <span>Resend in <span className="text-marigold-dark font-medium">{fgTimer}s</span></span>
            ) : (
              <button type="button" onClick={resendForgot} disabled={loading}
                className="text-marigold-dark font-medium hover:underline disabled:opacity-50">
                Resend OTP
              </button>
            )}
          </div>

          <Err msg={err} />
          <Ok msg={ok} />
          <Btn loading={loading} disabled={fgOtp.replace(/\s/g, '').length < 6}>
            Verify OTP
          </Btn>
        </form>
      )}

      {step === 'forgot-password' && (
        <form onSubmit={handleForgotPassword} className="space-y-4" id="forgot-password-form">
          <Back onClick={() => go('forgot-otp')} />
          <Steps total={3} current={2} />
          <div className="mb-2">
            <h1 className="font-display text-3xl font-semibold">New password</h1>
            <p className="text-sm text-ink/60 mt-1">Choose a new password for your account.</p>
          </div>

          <Field id="fg-pw" label="New password" type="password" value={fgPw} onChange={setFgPw}
            placeholder="At least 8 characters" required autoFocus />
          <Field id="fg-confirm" label="Confirm new password" type="password" value={fgConfirm}
            onChange={setFgConfirm} placeholder="Repeat your password" required />

          <Err msg={err} />
          <Btn loading={loading}>Reset Password</Btn>
        </form>
      )}

      {step === 'success' && (
        <div className="text-center py-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal/10 border border-teal/30 mx-auto">
            <svg className="w-8 h-8 text-teal" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="font-display text-2xl font-semibold text-ink">
            {fgContact ? 'Password reset!' : 'Account created!'}
          </h2>
          <p className="text-sm text-ink/60">
            {ok || 'Redirecting you now…'}
          </p>
        </div>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-center py-16">Loading...</div>}>
      <LoginContent />
    </Suspense>
  );
}
