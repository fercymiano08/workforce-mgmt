import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Briefcase, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';
import Button from '../../components/ui/Button';
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

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const email = searchParams.get('email') || '';

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const missingLink = !token || !email;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword({ email, token, password, passwordConfirmation: confirmPassword });
      setDone(true);
      setTimeout(() => navigate('/login', { replace: true }), 2000);
    } catch (err) {
      const message = err?.response?.data?.errors?.email?.[0]
        || err?.response?.data?.message
        || 'This reset link is invalid or has expired. Please request a new one.';
      setError(message);
    } finally {
      setLoading(false);
    }
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
            Choose a new<br />password.
          </h2>
          <p className="text-slate-400 text-[15px] leading-relaxed max-w-md">
            Pick something you haven't used before, at least 8 characters long.
          </p>
        </div>

        <p className="relative text-slate-500 text-xs">&copy; {new Date().getFullYear()} WorkForce Pro Management. All rights reserved.</p>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px]">
          {/* Mobile-only logo */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-gray-900 font-bold text-[15px] leading-tight tracking-tight">WorkForce</h1>
              <p className="text-gray-400 text-[11px] font-medium">Pro Management</p>
            </div>
          </div>

          {missingLink ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center mx-auto mb-5">
                <AlertCircle className="w-7 h-7 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Invalid reset link</h2>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                This link is missing its token or email. Request a new one from the forgot password page.
              </p>
            </div>
          ) : done ? (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Password reset</h2>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                Your password has been updated. Redirecting you to sign in&hellip;
              </p>
            </div>
          ) : (
            <>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Reset your password</h2>
              <p className="text-sm text-gray-500 mt-1.5 mb-8">
                Resetting the password for <span className="font-medium text-gray-700">{email}</span>
              </p>

              {error && (
                <div className="flex items-start gap-2.5 bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <PasswordField
                  label="New Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <PasswordField
                  label="Confirm New Password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <Button type="submit" className="w-full mt-2" size="lg" loading={loading}>
                  Reset Password
                </Button>
              </form>
            </>
          )}

          <Link
            to="/login"
            className="mt-8 flex items-center justify-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
