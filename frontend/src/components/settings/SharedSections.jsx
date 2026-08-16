import { useState } from 'react';
import { Lock, Eye, EyeOff, Key, Info } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../ui/Card';
import Button from '../ui/Button';
import { authService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useTheme } from '../../context/ThemeContext';

// Settings content that is genuinely identical for Administrators and
// Employees (password + display preferences) lives here once, instead of
// being copy-pasted into both pages/HR_Manager/Settings.jsx and
// pages/Employee/Settings.jsx.

export function InfoNote({ children }) {
  return (
    <div className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50/60 border border-blue-100 px-4 py-3">
      <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
      <p className="text-xs text-blue-700">{children}</p>
    </div>
  );
}

export function AccountSection() {
  const { toast } = useToast();
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);
  const [showConfirmPass, setShowConfirmPass] = useState(false);
  const [passwords, setPasswords] = useState({ current: '', newPass: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const handlePassChange = (field, value) => {
    setPasswords((prev) => ({ ...prev, [field]: value }));
  };

  const handleSavePassword = async () => {
    if (!passwords.current || !passwords.newPass || !passwords.confirm) {
      toast.error('Missing fields', 'Please fill in all password fields.');
      return;
    }
    if (passwords.newPass !== passwords.confirm) {
      toast.error('Mismatch', 'New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await authService.changePassword({
        current_password: passwords.current,
        new_password: passwords.newPass,
        new_password_confirmation: passwords.confirm,
      });
      toast.success('Password changed', 'Your password has been updated successfully.');
      setPasswords({ current: '', newPass: '', confirm: '' });
    } catch (error) {
      const message = error.response?.data?.errors?.current_password?.[0]
        || error.response?.data?.message
        || 'Failed to change password.';
      toast.error('Password not changed', message);
    } finally {
      setSaving(false);
    }
  };

  const passwordField = (label, field, show, setShow, icon) => (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-medium text-gray-700">{label}</label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>
        <input
          type={show ? 'text' : 'password'}
          value={passwords[field]}
          onChange={(e) => handlePassChange(field, e.target.value)}
          className="w-full px-3.5 py-2.5 pl-10 pr-10 text-sm rounded-xl border border-gray-200 bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 placeholder:text-gray-400"
          placeholder={label}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>Update your password regularly to keep your account secure</CardDescription>
          </div>
        </CardHeader>

        <div className="space-y-4 max-w-md">
          {passwordField('Current Password', 'current', showCurrentPass, setShowCurrentPass, <Lock className="w-4 h-4" />)}
          {passwordField('New Password', 'newPass', showNewPass, setShowNewPass, <Key className="w-4 h-4" />)}
          {passwordField('Confirm New Password', 'confirm', showConfirmPass, setShowConfirmPass, <Key className="w-4 h-4" />)}
        </div>

        <div className="flex justify-end mt-6">
          <Button icon={Lock} loading={saving} onClick={handleSavePassword}>Update Password</Button>
        </div>
      </Card>
    </div>
  );
}

export function AppearanceSection() {
  const { fontSize, setFontSize } = useTheme();

  const fontSizes = [
    { id: 'small', label: 'Small', text: 'text-xs' },
    { id: 'medium', label: 'Medium', text: 'text-sm' },
    { id: 'large', label: 'Large', text: 'text-base' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Font Size</CardTitle>
            <CardDescription>Adjust the text size across the application</CardDescription>
          </div>
        </CardHeader>

        <div className="flex gap-3">
          {fontSizes.map((fs) => (
            <button
              key={fs.id}
              onClick={() => setFontSize(fs.id)}
              className={`flex-1 rounded-xl border-2 px-4 py-3 text-center transition-all duration-200 ${
                fontSize === fs.id
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              <span className={`font-medium ${fs.text}`}>{fs.label}</span>
            </button>
          ))}
        </div>

        <InfoNote>Applies immediately - this is a display preference for this device only, not saved to your account.</InfoNote>
      </Card>
    </div>
  );
}
