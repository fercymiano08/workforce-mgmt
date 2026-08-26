import { Link } from 'react-router-dom';
import { Briefcase, ArrowLeft } from 'lucide-react';

// This route now simply redirects users to the updated forgot-password
// flow, which uses a 6-digit OTP sent via email.
export default function ResetPassword() {
  return (
    <div className="min-h-screen flex bg-[#F8FAFC]">
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
          <h2 className="text-white text-3xl font-bold leading-tight tracking-tight mb-4">Password reset<br/>has changed.</h2>
          <p className="text-slate-400 text-[15px] leading-relaxed max-w-md">Password resets now use a 6-digit code sent to your email.</p>
        </div>
        <p className="relative text-slate-500 text-xs">&copy; {new Date().getFullYear()} WorkForce Pro Management. All rights reserved.</p>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-[400px] text-center">
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-gray-900 font-bold text-[15px] leading-tight tracking-tight">WorkForce</h1>
              <p className="text-gray-400 text-[11px] font-medium">Pro Management</p>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 tracking-tight">Password reset has changed</h2>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed max-w-sm mx-auto">
            We now use a 6-digit code sent to your email. Use the forgot password page to receive your code.
          </p>
          <Link to="/forgot-password">
            <Button className="w-full mt-6" size="lg">Go to Forgot Password</Button>
          </Link>
          <Link to="/login" className="mt-8 flex items-center justify-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" /> Back to sign in
          </Link>
        </div>
      </div>
    </div>
  );
}
