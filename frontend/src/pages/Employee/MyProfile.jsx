import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  User, Camera, Save, Smartphone, MapPin, Phone, Briefcase, IdCard, CalendarDays,
  ScanFace, CheckCircle2, AlertCircle, ChevronRight, Trash2, Heart, GraduationCap, Sparkles,
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Input from '../../components/ui/Input';
import PhoneInput from '../../components/ui/PhoneInput';
import Avatar from '../../components/ui/Avatar';
import { leaveService, profileService } from '../../services/api';
import { formatDate } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';

// Must match the server's rule (EmployeeController::updateMyProfile): digits with an optional
// + ( ) - or spaces, 7-20 characters. Checked here first so people get instant feedback.
const PHONE_PATTERN = /^[0-9+()\-\s]{7,20}$/;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const balanceStyle = {
  Vacation: { bar: 'bg-blue-500', track: 'bg-blue-100', text: 'text-blue-600' },
  Sick: { bar: 'bg-red-500', track: 'bg-red-100', text: 'text-red-600' },
  Emergency: { bar: 'bg-amber-500', track: 'bg-amber-100', text: 'text-amber-600' },
  Special: { bar: 'bg-purple-500', track: 'bg-purple-100', text: 'text-purple-600' },
  Funeral: { bar: 'bg-indigo-500', track: 'bg-indigo-100', text: 'text-indigo-600' },
  Unpaid: { bar: 'bg-teal-500', track: 'bg-teal-100', text: 'text-teal-600' },
};
const fallbackBalanceStyle = { bar: 'bg-gray-500', track: 'bg-gray-100', text: 'text-gray-600' };

const statusVariant = { Active: 'success', Inactive: 'default', 'On Leave': 'warning', Terminated: 'danger' };

function tenure(hireDate) {
  if (!hireDate) return null;
  const start = new Date(hireDate);
  if (Number.isNaN(start.getTime())) return null;
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return null;
  if (months < 1) return 'Less than a month';
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const parts = [];
  if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
  if (rest) parts.push(`${rest} month${rest === 1 ? '' : 's'}`);
  return parts.join(', ');
}

function ReadOnlyField({ label, value, mono = false }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className={`px-3.5 py-2.5 text-sm rounded-xl border border-gray-100 bg-gray-50 text-gray-700 ${mono ? 'font-mono' : ''}`}>
        {value || '—'}
      </div>
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3].map((i) => (
        <Card key={i}>
          <div className="space-y-4">
            <div className="skeleton h-5 w-40 rounded-lg" />
            <div className="skeleton h-4 w-64 rounded-lg" />
            <div className="skeleton h-20 w-full rounded-xl" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/**
 * My Profile - WHO I AM: my photo, my employment details (managed by HR, read-only),
 * my personal details, my contact details (the only part I can edit), my leave
 * balances and my kiosk face-registration status. App preferences and the password
 * live in Settings, which is a separate page on purpose.
 */
export default function MyProfile() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const { data: employee, loading, error, refresh } = useApiData(() => profileService.get(), []);
  const { data: balances } = useApiData(
    () => (employee?.id ? leaveService.getBalances(employee.id) : Promise.resolve([])),
    [employee?.id]
  );

  // `form` holds ONLY the editable fields, and only once the person starts changing something.
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [photoError, setPhotoError] = useState('');
  const [saving, setSaving] = useState(false);

  const original = useMemo(() => ({
    phone: employee?.phone || '',
    address: employee?.address || '',
    emergencyContact: employee?.emergencyContact || '',
    emergencyPhone: employee?.emergencyPhone || '',
    avatar: employee?.avatar || '',
  }), [employee]);

  const values = form || original;
  const dirty = Boolean(form) && Object.keys(original).some((k) => (form[k] ?? '') !== original[k]);

  // Don't let unsaved edits vanish on an accidental tab close / reload.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setField = (field, value) => {
    setForm((prev) => ({ ...original, ...(prev || {}), [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const handlePhotoChange = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError('');
    if (!file.type.startsWith('image/')) {
      setPhotoError('Please choose an image file (JPG, PNG or GIF).');
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError('That photo is larger than 2MB. Please choose a smaller one.');
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => setPhotoError('Could not read that file. Please try again.');
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => setPhotoError('That file could not be opened as a picture.');
      img.onload = () => {
        // Shrink to a 256px square-ish picture: sharp enough for an avatar, small enough to store.
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setField('avatar', canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const validate = () => {
    const next = {};
    const phone = (values.phone || '').trim();
    const emergencyPhone = (values.emergencyPhone || '').trim();
    if (phone && !PHONE_PATTERN.test(phone)) next.phone = 'Enter a valid phone number, e.g. +63 917 555 1234';
    if (emergencyPhone && !PHONE_PATTERN.test(emergencyPhone)) next.emergencyPhone = 'Enter a valid number, e.g. +63 917 555 1234';
    if (emergencyPhone && !(values.emergencyContact || '').trim()) next.emergencyContact = 'Add the name of this emergency contact';
    if ((values.address || '').length > 255) next.address = 'Address is too long (255 characters max)';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  // Async on purpose: the shared Button locks itself until this finishes, so a slow
  // server can't turn extra clicks into repeated saves.
  const handleSave = async () => {
    if (!form || !validate()) return;
    setSaving(true);
    try {
      await profileService.update({
        phone: values.phone.trim(),
        address: values.address.trim(),
        emergencyContact: values.emergencyContact.trim(),
        emergencyPhone: values.emergencyPhone.trim(),
        avatar: values.avatar,
      });
      toast.success('Profile updated', 'Your changes have been saved.');
      setForm(null);
      setErrors({});
      refresh();
    } catch (err) {
      const data = err?.response?.data;
      const fieldErrors = {};
      if (data?.errors) {
        Object.entries(data.errors).forEach(([k, v]) => { fieldErrors[k] = Array.isArray(v) ? v[0] : v; });
        setErrors(fieldErrors);
      }
      const first = data?.errors ? Object.values(data.errors).flat()[0] : null;
      toast.error('Could not save', first || data?.message || 'The server did not respond. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setForm(null);
    setErrors({});
    setPhotoError('');
  };

  if (loading && !employee) return <ProfileSkeleton />;

  if (!employee) {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-500 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold text-gray-900">No employee profile found</p>
            <p className="text-sm text-gray-500 mt-1">{error || 'This account is not linked to an employee record. Please contact the Workforce Admin.'}</p>
          </div>
        </div>
      </Card>
    );
  }

  const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
  const service = tenure(employee.hireDate);
  const skills = Array.isArray(employee.skills) ? employee.skills : [];
  const education = Array.isArray(employee.education) ? employee.education : [];

  return (
    <div className="space-y-6 animate-fadeIn pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <User className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <p className="text-[14px] text-gray-500 mt-1">Your details, contact information and leave balances</p>
        </div>
      </div>

      {/* Identity card */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-6">
          <div className="relative shrink-0 self-start">
            <Avatar src={values.avatar} firstName={employee.firstName} lastName={employee.lastName} size="2xl" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors"
              aria-label="Change profile photo"
            >
              <Camera className="w-4 h-4" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
          </div>

          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-gray-900 truncate">{fullName}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {[employee.position, employee.department].filter(Boolean).join(' · ') || '—'}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge variant="primary" size="xs"><span className="font-mono">{employee.id}</span></Badge>
              {employee.status && <Badge variant={statusVariant[employee.status] || 'default'} dot size="xs">{employee.status}</Badge>}
              {employee.employmentType && <Badge variant="info" size="xs">{employee.employmentType}</Badge>}
            </div>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              <button type="button" onClick={() => fileInputRef.current?.click()} className="text-xs font-semibold text-blue-600 hover:text-blue-700">
                Change photo
              </button>
              {values.avatar && (
                <button type="button" onClick={() => setField('avatar', '')} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-red-600">
                  <Trash2 className="w-3 h-3" /> Remove photo
                </button>
              )}
              <span className="text-xs text-gray-400">JPG, PNG or GIF · up to 2MB</span>
            </div>
            {photoError && <p className="text-xs text-red-500 font-medium mt-2">{photoError}</p>}
          </div>

          {employee.hireDate && (
            <div className="sm:text-right shrink-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">With the company since</p>
              <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatDate(employee.hireDate)}</p>
              {service && <p className="text-xs text-gray-500 mt-0.5">{service}</p>}
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Employment - read only */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Briefcase className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <CardTitle>Employment</CardTitle>
                <CardDescription>Managed by HR - contact the Workforce Admin to change these</CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField label="Employee ID" value={employee.id} mono />
            <ReadOnlyField label="Department" value={employee.department} />
            <ReadOnlyField label="Position" value={employee.position} />
            <ReadOnlyField label="Employment type" value={employee.employmentType} />
            <ReadOnlyField label="Hire date" value={employee.hireDate ? formatDate(employee.hireDate) : ''} />
            <ReadOnlyField label="Manager" value={employee.manager} />
          </div>
        </Card>

        {/* Personal - read only */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <IdCard className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <CardTitle>Personal Details</CardTitle>
                <CardDescription>On file with HR - ask HR if something is wrong</CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <ReadOnlyField label="Full name" value={fullName} />
            <ReadOnlyField label="Email (your login)" value={employee.email} />
            <ReadOnlyField label="Date of birth" value={employee.dateOfBirth ? formatDate(employee.dateOfBirth) : ''} />
            <ReadOnlyField label="Gender" value={employee.gender} />
            <ReadOnlyField label="Blood group" value={employee.bloodGroup} />
          </div>
        </Card>
      </div>

      {/* Contact - the editable part */}
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
            <div>
              <CardTitle>Contact Information</CardTitle>
              <CardDescription>Yours to keep up to date - HR uses these in an emergency</CardDescription>
            </div>
          </div>
        </CardHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <PhoneInput
            label="Phone"
            icon={Smartphone}
            value={values.phone}
            onChange={(v) => setField('phone', v)}
            placeholder="9XX XXX XXXX"
            error={errors.phone}
          />
          <Input
            label="Address"
            icon={MapPin}
            value={values.address}
            onChange={(e) => setField('address', e.target.value)}
            placeholder="Street, Barangay, City"
            error={errors.address}
          />
          <Input
            label="Emergency contact name"
            icon={Heart}
            value={values.emergencyContact}
            onChange={(e) => setField('emergencyContact', e.target.value)}
            placeholder="Who should we call?"
            error={errors.emergencyContact}
          />
          <PhoneInput
            label="Emergency contact number"
            icon={Phone}
            value={values.emergencyPhone}
            onChange={(v) => setField('emergencyPhone', v)}
            placeholder="9XX XXX XXXX"
            error={errors.emergencyPhone}
          />
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Leave balances */}
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3 w-full">
              <div className="flex items-start gap-3">
                <CalendarDays className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <CardTitle>Leave Balances</CardTitle>
                  <CardDescription>Days remaining this year</CardDescription>
                </div>
              </div>
              <Link to="/leave" className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-600 hover:text-blue-700 shrink-0">
                Apply for leave <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </CardHeader>
          {Array.isArray(balances) && balances.length > 0 ? (
            <div className="space-y-3.5">
              {balances.map((b) => {
                const style = balanceStyle[b.type] || fallbackBalanceStyle;
                const total = Number(b.total) || 0;
                const remaining = Math.max(0, Number(b.remaining) || 0);
                const pct = total > 0 ? Math.min(100, Math.round((remaining / total) * 100)) : 0;
                return (
                  <div key={b.type}>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-gray-700">{b.type}</span>
                      <span className={`font-semibold tabular-nums ${style.text}`}>{remaining} <span className="text-gray-400 font-normal">of {total} days</span></span>
                    </div>
                    <div className={`mt-1.5 h-2 rounded-full ${style.track} overflow-hidden`}>
                      <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No leave balances to show yet.</p>
          )}
        </Card>

        {/* Face registration */}
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <ScanFace className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <CardTitle>Kiosk Face Registration</CardTitle>
                <CardDescription>Used to confirm it is really you when you clock in</CardDescription>
              </div>
            </div>
          </CardHeader>
          {employee.faceRegistered ? (
            <div className="flex items-start gap-3 rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-emerald-800">Your face is registered</p>
                <p className="text-xs text-emerald-700 mt-0.5">
                  {employee.faceRegisteredAt ? `Registered on ${formatDate(employee.faceRegisteredAt)}. ` : ''}
                  If the kiosk stops recognizing you, ask the Workforce Admin to register your face again.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
              <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">No face registered yet</p>
                <p className="text-xs text-amber-700 mt-0.5">You can't clock in at the kiosk until the Workforce Admin registers your face.</p>
              </div>
            </div>
          )}
        </Card>
      </div>

      {(skills.length > 0 || education.length > 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <CardTitle>Skills &amp; Education</CardTitle>
                <CardDescription>On file with HR</CardDescription>
              </div>
            </div>
          </CardHeader>
          <div className="space-y-4">
            {skills.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {skills.map((s, i) => <Badge key={`${s}-${i}`} variant="purple" size="xs">{typeof s === 'string' ? s : s?.name}</Badge>)}
              </div>
            )}
            {education.length > 0 && (
              <ul className="space-y-1.5">
                {education.map((e, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-gray-700">
                    <GraduationCap className="w-4 h-4 text-gray-400 shrink-0" />
                    {typeof e === 'string' ? e : [e?.degree, e?.school, e?.year].filter(Boolean).join(' · ')}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      )}

      <p className="text-xs text-gray-400 text-center">
        Looking for your password or display options? They're in <Link to="/settings" className="font-semibold text-blue-600 hover:text-blue-700">Settings</Link>.
      </p>

      {/* Unsaved-changes bar */}
      {dirty && createPortal(
        <div className="fixed bottom-4 left-1/2 lg:left-[calc(50%+130px)] -translate-x-1/2 z-40 w-[calc(100%-2rem)] max-w-xl">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-gray-900 text-white px-4 py-3 shadow-2xl">
            <p className="text-sm font-medium">You have unsaved changes</p>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="!text-gray-300 hover:!bg-white/10 hover:!text-white" onClick={handleDiscard} disabled={saving}>Discard</Button>
              <Button size="sm" icon={Save} onClick={handleSave} loading={saving}>Save changes</Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
