import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import { authService } from '../../services/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      // Always succeeds (even for unknown emails) so this can't be used to
      // enumerate accounts. With MAIL_MAILER=log, the reset link lands in
      // backend/storage/logs/laravel.log rather than a real inbox.
      await authService.forgotPassword(email.trim());
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
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
            Forgot your password?<br />No worries.
          </h2>
          <p className="text-slate-400 text-[15px] leading-relaxed max-w-md">
            Enter the email on your account and we'll send you a link to get back in.
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

          {!sent ? (
            <>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Reset your password</h2>
              <p className="text-sm text-gray-500 mt-1.5 mb-8">
                Enter your email address and we'll send you instructions to reset your password.
              </p>

              {error && (
                <div className="bg-red-50 border border-red-100 text-red-700 text-sm rounded-xl px-4 py-3 mb-5">
                  {error}
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
                <Button type="submit" className="w-full mt-2" size="lg" loading={loading}>
                  Send Reset Link
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-7 h-7 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Check your email</h2>
              <p className="text-sm text-gray-500 mt-2 leading-relaxed">
                If an account exists for <span className="font-medium text-gray-700">{email}</span>,
                you'll receive password reset instructions shortly.
              </p>
            </div>
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
