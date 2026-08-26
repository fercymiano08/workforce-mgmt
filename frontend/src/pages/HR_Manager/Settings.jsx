import { useState } from 'react';
import {
  Settings as SettingsIcon, Building, Palette, Shield,
  Save, Globe, Mail, Smartphone,
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input, { Select } from '../../components/ui/Input';
import { InfoNote, AccountSection, AppearanceSection } from '../../components/settings/SharedSections';
import { settingsService, employeeService, departmentService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { useLanguage, LANGUAGE_OPTIONS } from '../../context/LanguageContext';
import { applySystemSettings } from '../../utils/appSettings';
import useApiData from '../../hooks/useApiData';

// Two clearly separated scopes: everything under COMPANY CONFIGURATION only
// exists once for the whole organization and is managed exclusively by the
// HR Manager; MY ACCOUNT holds this user's own password and look-and-feel.
const NAV_GROUPS = [
  {
    label: 'Company Configuration',
    items: [
      { id: 'company', key: 'settings.company', icon: Building },
      { id: 'regional', key: 'settings.regional', icon: Globe },
    ],
  },
  {
    label: 'My Account',
    items: [
      { id: 'account', key: 'settings.account', icon: Shield },
      { id: 'appearance', key: 'settings.appearance', icon: Palette },
    ],
  },
];

function CompanySection({ settingsData, onSaved }) {
  const { toast } = useToast();
  const company = settingsData.company || {};
  const [form, setForm] = useState({
    name: company.name || '',
    street: company.street || '',
    city: company.city || '',
    province: company.province || '',
    zipCode: company.zipCode || '',
    country: company.country || '',
    phone: company.phone || '',
    email: company.email || '',
    website: company.website || '',
  });
  const { data: employeesData } = useApiData(() => employeeService.getAll(), []);
  const { data: departmentsData } = useApiData(() => departmentService.getAll(), []);

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await settingsService.update({ company: form });
      toast.success('Company information updated', 'Company details have been saved successfully.');
      onSaved?.();
    } catch {
      toast.error('Error', 'Failed to save company information.');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Company Details</CardTitle>
            <CardDescription>Manage your company information and contact details</CardDescription>
          </div>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Input label="Company Name" value={form.name} onChange={(e) => handleChange('name', e.target.value)} icon={Building} />
          <Input label="Phone" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} icon={Smartphone} />
          <Input label="Email" type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} icon={Mail} />
          <Input label="Website" value={form.website} onChange={(e) => handleChange('website', e.target.value)} icon={Globe} />
        </div>

        <div className="mt-5">
          <Input label="Street Address" value={form.street} onChange={(e) => handleChange('street', e.target.value)} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-5">
          <Input label="City" value={form.city} onChange={(e) => handleChange('city', e.target.value)} />
          <Input label="Province" value={form.province} onChange={(e) => handleChange('province', e.target.value)} />
          <Input label="Zip Code" value={form.zipCode} onChange={(e) => handleChange('zipCode', e.target.value)} />
        </div>

        <InfoNote>Company details are shared across the whole system - this is the only company on record.</InfoNote>

        <div className="flex justify-end mt-6">
          <Button icon={Save} onClick={handleSave}>Save Changes</Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle>Company Overview</CardTitle>
            <CardDescription>Live counts from your workforce data</CardDescription>
          </div>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Employee Count</label>
            <div className="px-3.5 py-2.5 text-sm rounded-xl border border-gray-100 bg-gray-50 text-gray-700">
              {employeesData?.length ?? 0} employees
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Departments</label>
            <div className="px-3.5 py-2.5 text-sm rounded-xl border border-gray-100 bg-gray-50 text-gray-700">
              {departmentsData?.length ?? 0} departments
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function RegionalSection({ settingsData, onSaved }) {
  const { toast } = useToast();
  const { language, setLanguage } = useLanguage();
  const system = settingsData.system || {};
  const [prefs, setPrefs] = useState({
    dateFormat: system.dateFormat || 'MM/DD/YYYY',
    timeFormat: system.timeFormat || '12h',
  });

  const handleChange = (field, value) => {
    setPrefs((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      await settingsService.update({ system: prefs });
      applySystemSettings(prefs);
      toast.success('Regional settings updated', 'These formats now apply across the app for every user.');
      onSaved?.();
    } catch {
      toast.error('Error', 'Failed to save regional settings.');
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Regional Settings</CardTitle>
            <CardDescription>Configure the language, date, and time formats used across the app</CardDescription>
          </div>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Select label="Language" value={language} onChange={(e) => setLanguage(e.target.value)}>
            {LANGUAGE_OPTIONS.map((opt) => (
              <option key={opt.code} value={opt.code}>{opt.label}</option>
            ))}
          </Select>

          <Select label="Date Format" value={prefs.dateFormat} onChange={(e) => handleChange('dateFormat', e.target.value)}>
            <option value="MM/DD/YYYY">MM/DD/YYYY</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY</option>
            <option value="YYYY-MM-DD">YYYY-MM-DD</option>
            <option value="DD MMM YYYY">DD MMM YYYY</option>
          </Select>

          <Select label="Time Format" value={prefs.timeFormat} onChange={(e) => handleChange('timeFormat', e.target.value)}>
            <option value="12h">12-hour (AM/PM)</option>
            <option value="24h">24-hour</option>
          </Select>
        </div>

        <InfoNote>
          Date and time format are company-wide - changing them here changes how every user sees dates
          and times throughout the app. Language is just for this browser.
        </InfoNote>

        <div className="flex justify-end mt-6">
          <Button icon={Save} onClick={handleSave}>Save Changes</Button>
        </div>
      </Card>
    </div>
  );
}

export default function Settings() {
  const [activeTab, setActiveTab] = useState('company');
  const [reloadKey, setReloadKey] = useState(0);
  const { t } = useLanguage();

  const { data: settingsData, loading, refresh } = useApiData(() => settingsService.get(), []);

  const handleSaved = () => {
    refresh();
    setReloadKey((k) => k + 1);
  };

  const renderSection = () => {
    const props = { settingsData: settingsData || {}, onSaved: handleSaved };
    switch (activeTab) {
      case 'regional':
        return <RegionalSection {...props} />;
      case 'account':
        return <AccountSection />;
      case 'appearance':
        return <AppearanceSection />;
      case 'company':
      default:
        return <CompanySection {...props} />;
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
            <p className="text-[14px] text-gray-500 mt-1">Company configuration for the organization - your personal account below</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0">
          <Card padding={false}>
            <nav className="p-2">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className={group.label === NAV_GROUPS[0].label ? '' : 'mt-3 pt-3 border-t border-gray-100'}>
                  <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
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
                </div>
              ))}
            </nav>
          </Card>
        </div>

        <div className="flex-1 min-w-0">
          {loading && !settingsData ? (
            <div className="space-y-6">
              {[1, 2].map((i) => (
                <Card key={i}>
                  <div className="space-y-4">
                    <div className="skeleton h-5 w-40 rounded-lg" />
                    <div className="skeleton h-4 w-64 rounded-lg" />
                    <div className="skeleton h-20 w-full rounded-xl" />
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <div key={`${reloadKey}-${activeTab}`}>
              {renderSection()}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
