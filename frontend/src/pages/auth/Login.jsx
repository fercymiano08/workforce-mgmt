import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { Mail, AlertCircle, ShieldCheck, ArrowLeft } from 'lucide-react';
import BrandLogo from '../../components/ui/BrandLogo';
import PasswordInput from '../../components/ui/PasswordInput';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';

export default function Login() {
  const { login, verifyTwoFactor, cancelTwoFactor, pendingTwoFactor } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lockout, setLockout] = useState(0);
  // The second step: a six digit code, one box per digit so it can be pasted or typed either way.
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const otpRef = useRef(null);
  // Why they are here, when they were signed out (read once, then forgotten)
  const [notice] = useState(() => {
    try {
      const reason = window.sessionStorage.getItem('workforce_logout_reason');
      window.sessionStorage.removeItem('workforce_logout_reason');
      if (reason === 'idle') return 'You were signed out after 3 minutes of inactivity. Please sign in again.';
      if (reason === 'expired') return 'Your session has ended. Please sign in again.';
    } catch { /* ignore */ }
    return '';
  });

  useEffect(() => {
    if (lockout <= 0) return;
    const t = setInterval(() => setLockout((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [lockout]);

  const from = location.state?.from?.pathname;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim() || !password) {
      setError('Please enter both email and password.');
      return;
    }

    setLoading(true);
    try {
      const result = await login(email, password);
      if (!result.success) {
        // The password was right and this account also needs a code. The auth context is already
        // holding the account, which is what swaps this form for the code step below - so there is
        // nothing to do here but let the render follow.
        if (result.requiresTwoFactor) return;
        if (result.lockout) {
          setLockout(result.retryAfter || 60);
          setError(result.message || 'Too many login attempts. Please try again later.');
        } else {
          setError(result.message || 'Invalid email or password. Please try again.');
        }
        return;
      }
      toast.success('Welcome back!', `Signed in as ${result.user.firstName} ${result.user.lastName}`);
      navigate(from || '/', { replace: true });
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // No effect needed to reset the boxes or move focus: the inputs only mount when the code step
  // appears, and every path back into the password step (leaving, or a rejected code) clears them
  // explicitly. autoFocus on the first box then brings the keyboard up on a phone by itself.

  // Typing or pasting the code moves through the boxes by itself, and Backspace steps back - the
  // behaviour a phone keyboard user expects, and the thing that makes pasting a code from an email
  // work at all instead of dumping all six digits into the first box.
  const setOtpDigit = (index, raw) => {
    const digits = raw.replace(/\D/g, '');
    if (!digits) {
      setOtp((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    // A pasted code lands entirely in one box, so spread it across from wherever it started.
    setOtp((prev) => {
      const next = [...prev];
      for (let i = 0; i < digits.length && index + i < 6; i += 1) next[index + i] = digits[i];
      return next;
    });
    otpRef.current?.querySelectorAll('input')[Math.min(index + digits.length, 5)]?.focus();
  };

  const onOtpKeyDown = (index, e) => {
    const inputs = otpRef.current?.querySelectorAll('input');
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputs?.[index - 1]?.focus();
    }
    if (e.key === 'ArrowLeft' && index > 0) inputs?.[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < 5) inputs?.[index + 1]?.focus();
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length !== 6) {
      setError('Please enter all six digits of the code.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await verifyTwoFactor(code);
      if (!result.success) {
        if (result.lockout) {
          setLockout(result.retryAfter || 60);
          setError(result.message || 'Too many attempts. Please sign in again in a moment.');
        } else {
          setError(result.message || 'That code is not right. Please try again.');
          // Clear the boxes so the next attempt is not a correction of the last one, and put the
          // cursor back at the start.
          setOtp(['', '', '', '', '', '']);
          otpRef.current?.querySelector('input')?.focus();
        }
        return;
      }
      toast.success('Welcome back!', `Signed in as ${result.user.firstName} ${result.user.lastName}`);
      navigate(from || '/', { replace: true });
    } catch {
      setError('Unable to reach the server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const backToPassword = () => {
    cancelTwoFactor();
    setOtp(['', '', '', '', '', '']);
    setError('');
  };

  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
      {/* Left branding panel */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[40%] bg-[#0B1F3A] relative overflow-hidden flex-col justify-between p-12">
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 60%, white 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative flex items-center gap-3">
          <BrandLogo variant="large" />
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight uppercase text-red-500">ARCHON NELL</h1>
            <p className="text-blue-300 text-xs font-medium uppercase tracking-[0.25em]">INCORPORATED</p>
          </div>
        </div>

        <div className="relative">
          <h2 className="text-white text-3xl font-bold leading-tight tracking-tight mb-4">
            Manage your workforce,<br />all in one place.
          </h2>
          <p className="text-slate-400 text-[15px] leading-relaxed max-w-md">
            Track attendance, schedules, leave, and timesheets for your whole team &mdash; or check
            your own, if that's all you need.
          </p>
        </div>

        <p className="relative text-slate-500 text-xs">&copy; {new Date().getFullYear()} ARCHON NELL INCORPORATED. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile-only logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <BrandLogo variant="icon" />
            <div>
              <h1 className="font-bold text-[15px] leading-tight tracking-tight uppercase text-red-500">ARCHON NELL</h1>
              <p className="text-blue-400 text-[11px] font-medium uppercase tracking-[0.25em]">INCORPORATED</p>
            </div>
          </div>

          {pendingTwoFactor ? (
            <>
              <div className="flex items-center gap-3 mb-5">
                <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Check your email</h2>
                  <p className="text-sm text-gray-500 mt-0.5">Your password was accepted</p>
                </div>
              </div>

              <p className="text-sm text-gray-600 mb-6">
                We sent a six digit sign-in code to <span className="font-semibold text-gray-900 break-all">{pendingTwoFactor.email}</span>.
              </p>

              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleVerify}>
                <label className="block text-[13px] font-medium text-gray-700 mb-2">Sign-in code</label>
                <div ref={otpRef} className="flex gap-2 mb-2">
                  {otp.map((digit, i) => (
                    <input
                      key={i}
                      type="text"
                      inputMode="numeric"
                      autoComplete={i === 0 ? 'one-time-code' : 'off'}
                      maxLength={6}
                      autoFocus={i === 0}
                      value={digit}
                      onChange={(e) => setOtpDigit(i, e.target.value)}
                      onKeyDown={(e) => onOtpKeyDown(i, e)}
                      aria-label={`Digit ${i + 1} of 6`}
                      className="w-full min-w-0 h-14 text-center text-xl font-bold text-gray-900 bg-white border border-gray-200 rounded-xl focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors"
                    />
                  ))}
                </div>
                <p className="text-xs text-gray-400 mb-5">Paste the code from the email, or type it out.</p>

                <Button type="submit" className="w-full" size="lg" loading={loading} disabled={lockout > 0}>
                  {lockout > 0 ? `Try again in ${lockout}s` : 'Verify and sign in'}
                </Button>
              </form>

              <button
                type="button"
                onClick={backToPassword}
                className="mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-gray-500 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Use a different account
              </button>
            </>
          ) : (
          <>
          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Welcome back</h2>
          <p className="text-sm text-gray-500 mt-1.5 mb-8">Sign in to your account to continue</p>

          {notice && !error && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-100 text-amber-800 text-sm rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{notice}</span>
            </div>
          )}
          {error && (
            <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              icon={Mail}
              placeholder="you@workforcepro.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[13px] font-medium text-gray-700">Password</label>
                <Link to="/forgot-password" className="text-[13px] font-medium text-blue-600 hover:text-blue-700">
                  Forgot password?
                </Link>
              </div>
<PasswordInput
          name="password"
          value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
              />
            </div>

            <Button type="submit" className="w-full mt-2" size="lg" loading={loading} disabled={lockout > 0}>
              {lockout > 0 ? `Try again in ${lockout}s` : 'Sign In'}
            </Button>
          </form>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
