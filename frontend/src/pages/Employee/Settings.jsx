import { useRef, useState } from 'react';
import {
  Settings as SettingsIcon, User, Palette, Shield,
  Save, Camera, Smartphone,
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Avatar from '../../components/ui/Avatar';
import { SkeletonCard } from '../../components/ui/LoadingSkeleton';
import { AccountSection, AppearanceSection } from '../../components/settings/SharedSections';
import { profileService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLanguage } from '../../context/LanguageContext';
import useApiData from '../../hooks/useApiData';

const NAV_ITEMS = [
  { id: 'profile', key: 'settings.profile', icon: User },
  { id: 'account', key: 'settings.account', icon: Shield },
  { id: 'appearance', key: 'settings.appearance', icon: Palette },
];

function MyProfileSection() {
  const { toast } = useToast();
  const fileInputRef = useRef(null);
  const { data: employee, loading, refresh } = useApiData(() => profileService.get(), []);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const active = form || employee;

  const startEditing = () => {
    if (!employee) return;
    setForm({
      phone: employee.phone || '',
      address: employee.address || '',
      emergencyContact: employee.emergencyContact || '',
      emergencyPhone: employee.emergencyPhone || '',
      avatar: employee.avatar || '',
    });
  };

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...(prev || {}), [field]: value }));
  };

  const handleAvatarChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const scale = Math.min(size / img.width, size / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        setForm((prev) => ({ ...(prev || {}), avatar: canvas.toDataURL('image/jpeg', 0.85) }));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    if (!form) return;
    setSaving(true);
    try {
      await profileService.update(form);
      toast.success('Profile updated', 'Your profile has been saved.');
      setForm(null);
      refresh();
    } catch {
      toast.error('Error', 'Failed to save your profile.');
    } finally {
      setSaving(false);
    }
  };

  if (loading || !employee) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={4} />
      </div>
    );
  }

  const fullName = `${employee.firstName} ${employee.lastName}`.trim();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Profile Photo</CardTitle>
            <CardDescription>This is shown wherever your profile appears, including to HR</CardDescription>
          </div>
        </CardHeader>

        <div className="flex items-center gap-6">
          <Avatar src={active?.avatar} firstName={employee.firstName} lastName={employee.lastName} size="2xl" />
          <div className="flex flex-col gap-2">
            <Button variant="outline" size="sm" icon={Camera} onClick={() => { if (!form) startEditing(); fileInputRef.current?.click(); }}>
              Change Photo
            </Button>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            {active?.avatar && (
              <Button variant="ghost" size="sm" onClick={() => { if (!form) startEditing(); handleChange('avatar', ''); }}>
                Remove Photo
              </Button>
            )}
            <p className="text-xs text-gray-500">JPG, PNG or GIF. Max size 2MB.</p>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Employment Information</CardTitle>
            <CardDescription>Managed by HR - contact HR Manager to change these details</CardDescription>
          </div>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {[
            ['Full Name', fullName],
            ['Employee ID', employee.id],
            ['Department', employee.department],
            ['Position', employee.position],
            ['Employment Type', employee.employmentType],
            ['Email', employee.email],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">{label}</label>
              <div className="px-3.5 py-2.5 text-sm rounded-xl border border-gray-100 bg-gray-50 text-gray-700">
                {value || '—'}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Contact Information</CardTitle>
            <CardDescription>Yours to keep up to date</CardDescription>
          </div>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input
            label="Phone"
            icon={Smartphone}
            value={form ? form.phone : (employee.phone || '')}
            onFocus={startEditing}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder="+63 9XX XXX XXXX"
          />
          <Input
            label="Address"
            value={form ? form.address : (employee.address || '')}
            onFocus={startEditing}
            onChange={(e) => handleChange('address', e.target.value)}
            placeholder="Street, Barangay, City"
          />
          <Input
            label="Emergency Contact Name"
            value={form ? form.emergencyContact : (employee.emergencyContact || '')}
            onFocus={startEditing}
            onChange={(e) => handleChange('emergencyContact', e.target.value)}
            placeholder="Name of the person to contact"
          />
          <Input
            label="Emergency Contact Number"
            value={form ? form.emergencyPhone : (employee.emergencyPhone || '')}
            onFocus={startEditing}
            onChange={(e) => handleChange('emergencyPhone', e.target.value)}
            placeholder="+63 9XX XXX XXXX"
          />
        </div>

        <div className="flex justify-end gap-3 mt-6">
          {form && (
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          )}
          <Button icon={Save} loading={saving} disabled={!form} onClick={handleSave}>Save Changes</Button>
        </div>
      </Card>
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('profile');
  const { t } = useLanguage();

  const renderSection = () => {
    switch (activeTab) {
      case 'account':
        return <AccountSection />;
      case 'appearance':
        return <AppearanceSection />;
      case 'profile':
      default:
        return <MyProfileSection />;
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
            <p className="text-[14px] text-gray-500 mt-1">Your profile and account</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
          <Card padding={false}>
            <nav className="p-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                    activeTab === item.id
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <item.icon className={`w-4.5 h-4.5 ${activeTab === item.id ? 'text-blue-600' : 'text-gray-400'}`} />
                  {t(item.key)}
                </button>
              ))}
            </nav>
          </Card>
        </div>

        <div className="flex-1 min-w-0">
          <div key={activeTab}>
            {renderSection()}
          </div>
        </div>
      </div>
    </div>
  );
}
