import { useState } from 'react';
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

export default function ForgotPassword() {
  const [step, setStep] = useState('request'); // request | verify | done
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequest = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('Please enter your email address.'); return; }
    setLoading(true);
    try {
      await authService.forgotPassword(email.trim());
      setStep('verify');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError('');
    if (otp.trim().length !== 6) { setError('Please enter the 6-digit code.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      await authService.resetPassword({ email: email.trim(), otp: otp.trim(), password, passwordConfirmation: confirmPassword });
      setStep('done');
    } catch (err) {
      const msg = err?.response?.data?.errors?.otp?.[0]
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
            {step === 'request' ? 'Forgot your password?' : step === 'verify' ? 'Enter your code' : 'Password reset'}
          </h2>
          <p className="text-slate-400 text-[15px] leading-relaxed max-w-md">
            {step === 'request'
              ? 'Enter the email on your account and we\'ll send you a 6-digit code to reset your password.'
              : step === 'verify'
              ? 'Check your email for the code, then create a new password below.'
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
              <p className="text-sm text-gray-500 mt-1.5 mb-8">Enter your email and we'll send a 6-digit reset code.</p>
              <form onSubmit={handleRequest} className="space-y-4">
                <Input label="Email" type="email" icon={Mail} placeholder="you@workforcepro.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
                <Button type="submit" className="w-full mt-2" size="lg" loading={loading}>Send Reset Code</Button>
              </form>
            </>
          )}

          {/* Step 2: enter OTP + new password */}
          {step === 'verify' && (
            <>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Check your email</h2>
              <p className="text-sm text-gray-500 mt-1.5 mb-8">
                A 6-digit code was sent to <span className="font-medium text-gray-700">{email}</span>. It expires in 10 minutes.
              </p>
              <form onSubmit={handleReset} className="space-y-4">
                <Input label="Reset Code" placeholder="000000" value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} className="text-center text-lg tracking-[0.35em] font-mono" required autoFocus />
                <PasswordField label="New Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
                <PasswordField label="Confirm New Password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
                <Button type="submit" className="w-full mt-2" size="lg" loading={loading}>Reset Password</Button>
              </form>
              <button type="button" onClick={() => { setError(''); setStep('request'); setOtp(''); }} className="mt-4 w-full text-center text-sm text-gray-500 hover:text-gray-700 font-medium">
                Use a different email
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
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">Your password has been updated. Redirecting you to sign in&hellip;</p>
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
