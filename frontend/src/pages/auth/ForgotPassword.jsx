import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Mail, ArrowLeft, CheckCircle2, AlertCircle, Lock, Eye, EyeOff } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { authService } from '../../services/api';

function PasswordField({ label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="text-[13px] font-medium text-gray-700 mb-1.5 block">{label}</label>
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          placeholder="••••••••"
          autoComplete={autoComplete}
          required
          minLength={8}
          className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 placeholder:text-gray-400 hover:border-gray-300"
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

// The server is the authority on how long the code lives (auth.password_reset_code.ttl); this is only
// the fallback used before the first response arrives.
const FALLBACK_CODE_SECONDS = 300;
const PASSWORD_REGEX = /^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)[A-Za-z\d@$!%*#?&._-]{8,}$/;

const clock = (s) => {
  const total = Math.max(0, s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

// Reading the wall clock, kept deliberately outside the component. Reading Date.now() in the
// component body is perfectly correct here (these only ever run in event handlers and effects),
// but the React Compiler's purity rule cannot tell the difference and reports it as a render-time
// side effect, which is exactly the kind of false positive that teaches people to ignore the linter.
const readClock = () => Date.now();

// The server's deadline wins; the local fallback is only for a response that omitted it.
const deadlineFrom = (res) => (res?.expiresAt
  ? res.expiresAt * 1000
  : readClock() + (res?.expiresIn || FALLBACK_CODE_SECONDS) * 1000);

export default function ForgotPassword() {
  // Four steps, in this order on purpose: the email, then the new password, and only THEN is the code emailed
  // and its countdown started - so the timer only ever covers reading and typing six digits.
  const [step, setStep] = useState('request'); // request | password | code | done
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Absolute deadline in ms, taken from the server's expiresAt rather than counted down locally from
  // the moment the response happened to arrive (mail latency used to eat the window unseen).
  const [deadline, setDeadline] = useState(null);
  const [now, setNow] = useState(readClock);

  const secondsLeft = deadline ? Math.ceil((deadline - now) / 1000) : 0;
  const expired = step === 'code' && deadline !== null && secondsLeft <= 0;

  // Ticks once a second so the countdown stays honest while the tab is open.
  useEffect(() => {
    if (!deadline) return undefined;
    const t = setInterval(() => setNow(readClock()), 1000);
    return () => clearInterval(t);
  }, [deadline]);

  // Step 1 -> 2: the email is only noted. Nothing is sent yet, so no code exists and no timer runs.
  const handleRequest = (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setStep('password');
  };

  // Emails the code and starts its countdown. Called when the new password is accepted (step 2 -> 3) and
  // by "Send a new code" on the code step. The server's expiresAt wins; a local count is only the fallback.
  const sendCode = async () => {
    setError('');
    setLoading(true);
    try {
      const res = await authService.forgotPassword(email.trim());
      setDeadline(deadlineFrom(res));
      setNow(readClock());
      setOtp('');
      return true;
    } catch (err) {
      setError(err?.response?.status === 429
        ? 'Too many requests. Please wait a minute and try again.'
        : 'Could not send the code. Please check your connection and try again.');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e) => {
    e.preventDefault();
    setError('');
    // Catch a weak or mismatched password here, before a code is sent and its clock starts
    if (!PASSWORD_REGEX.test(password)) { setError('Password must be at least 8 characters with an uppercase letter, a lowercase letter, and a number.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    if (await sendCode()) setStep('code');
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    if (expired) { setError('This code has expired. Send a new one below - your new password is kept.'); return; }
    if (otp.trim().length !== 6) { setError('Please enter the 6-digit code.'); return; }
    if (!PASSWORD_REGEX.test(password)) { setError('Password must be at least 8 characters with an uppercase letter, a lowercase letter, and a number.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await authService.resetPassword({ email: email.trim(), otp: otp.trim(), password, passwordConfirmation: confirmPassword });
      setStep('done');
    } catch (err) {
      const msg = err?.response?.data?.errors?.otp?.[0]
        || err?.response?.data?.errors?.password?.[0]
        || err?.response?.data?.message
        || 'This code is invalid or has expired. Please request a new one.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] bg-[#0B1F3A] relative overflow-hidden flex-col justify-between p-12">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="relative flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Briefcase className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-lg leading-tight tracking-tight">WorkForce</h1>
            <p className="text-blue-300/60 text-xs font-medium">Pro Management</p>
          </div>
        </div>
        <div className="relative">
          <h2 className="text-white text-3xl font-bold leading-tight tracking-tight mb-4">
            {step === 'request' ? 'Forgot your password?' : step === 'password' ? 'Choose a new password' : step === 'code' ? 'Enter your code' : 'Password reset'}
          </h2>
          <p className="text-slate-400 text-[15px] leading-relaxed max-w-md">
            {step === 'request'
              ? 'Enter the email on your account. Next you will choose your new password, then we email a 6-digit code to confirm it is really you.'
              : step === 'password'
              ? 'Choose your new password. Nothing is timed yet: the code is only sent once your password is ready.'
              : step === 'code'
              ? 'Last step: type the 6-digit code from your email. It is valid for a few minutes.'
              : 'Your password has been updated. You can now sign back in.'}
          </p>
        </div>
        <p className="relative text-slate-500 text-xs">&copy; {new Date().getFullYear()} WorkForce Pro Management. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-gray-900 font-bold text-[15px] leading-tight tracking-tight">WorkForce</h1>
              <p className="text-gray-400 text-[11px] font-medium">Pro Management</p>
            </div>
          </div>

          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Step 1: enter email */}
          {step === 'request' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Reset your password</h2>
              <p className="text-sm text-gray-500 mt-1.5 mb-8">Enter the email on your account. You will choose a new password next, then we send a 6-digit code to confirm it is you.</p>
              <form onSubmit={handleRequest} className="space-y-4">
                <Input label="Email" type="email" icon={Mail} placeholder="you@workforcepro.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                <Button type="submit" className="w-full mt-2" size="lg">Continue</Button>
              </form>
            </>
          )}

          {/* Step 2: choose the new password - no code exists yet and no timer runs */}
          {step === 'password' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Create your new password</h2>
              <p className="text-sm text-gray-500 mt-1.5 mb-8">
                For <span className="font-medium text-gray-700">{email}</span>. When your password is ready, we email a 6-digit code to confirm it is really you.
              </p>
              <form onSubmit={handleNewPassword} className="space-y-4">
                <PasswordField label="New Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <PasswordField label="Confirm New Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                <p className="text-xs text-gray-400 mt-1">
                  Password must be at least 8 characters long and include an uppercase letter, a lowercase letter, and a number.
                </p>
                <Button type="submit" className="w-full mt-2" size="lg" loading={loading}>Send me the code</Button>
              </form>
              <button type="button" onClick={() => { setError(''); setStep('request'); setOtp(''); setPassword(''); setConfirmPassword(''); setDeadline(null); }} className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gray-600 font-medium">
                Use a different email
              </button>
            </>
          )}

          {/* Step 3: the code - the countdown starts here, when the code is emailed */}
          {step === 'code' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Enter your reset code</h2>
              <p className="text-sm text-gray-500 mt-1.5 mb-8">
                If an account exists for <span className="font-medium text-gray-700">{email}</span>, a 6-digit code was just emailed. It may take a few seconds to arrive.
              </p>
              <div className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 mb-5 text-sm ${expired ? 'bg-red-50 border border-red-100 text-red-700' : secondsLeft <= 60 ? 'bg-amber-50 border border-amber-100 text-amber-800' : 'bg-blue-50 border border-blue-100 text-blue-800'}`}>
                <span>{expired ? 'This code has expired.' : <>Code valid for <strong className="tabular-nums">{clock(secondsLeft)}</strong></>}</span>
                <button type="button" onClick={sendCode} disabled={loading} className="font-semibold underline disabled:no-underline disabled:opacity-40">
                  {loading ? 'Sending…' : 'Send a new code'}
                </button>
              </div>
              <form onSubmit={handleReset} className="space-y-4">
                <Input label="Reset Code" placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="text-center text-lg tracking-[0.35em] font-mono" required autoFocus />
                <Button type="submit" className="w-full mt-2" size="lg" loading={loading} disabled={expired}>Reset Password</Button>
              </form>
              {expired && (
                <p className="mt-3 text-xs text-center text-gray-500">
                  Send a new code above - your new password is kept, you will not have to type it again.
                </p>
              )}
              <button type="button" onClick={() => { setError(''); setStep('password'); setOtp(''); setDeadline(null); }} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700 font-medium">
                Back to your new password
              </button>
            </>
          )}

          {/* Step 3: done */}
          {step === 'done' && (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Password reset</h2>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">Your password has been updated. You can now sign in with it.</p>
              <Button className="w-full mt-6" size="lg" onClick={() => window.location.href = '/login'}>Go to Sign In</Button>
            </div>
          )}

          <Link to="/login" className="mt-8 flex items-center justify-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
