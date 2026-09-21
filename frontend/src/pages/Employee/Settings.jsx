import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings as SettingsIcon, Palette, Shield, User, ChevronRight } from 'lucide-react';
import Card from '../../components/ui/Card';
import { AccountSection, AppearanceSection } from '../../components/settings/SharedSections';
import { useLanguage } from '../../context/LanguageContext';

// Settings = HOW THE APP BEHAVES for me (password, display). "Who I am" - photo, details,
// contact information - lives on its own page, My Profile.
const NAV_ITEMS = [
  { id: 'account', key: 'settings.account', icon: Shield },
  { id: 'appearance', key: 'settings.appearance', icon: Palette },
];

export default function Settings() {
  const [activeTab, setActiveTab] = useState('account');
  const { t } = useLanguage();

  const renderSection = () => (activeTab === 'appearance' ? <AppearanceSection /> : <AccountSection />);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <SettingsIcon className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('settings.title')}</h1>
            <p className="text-[14px] text-gray-500 mt-1">Your password and how the app looks</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-64 shrink-0 space-y-4">
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

          <Link
            to="/my-profile"
            className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-white p-3.5 shadow-sm hover:border-blue-200 hover:bg-blue-50/40 transition-colors"
          >
            <span className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
              <User className="w-4.5 h-4.5 text-blue-600" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-900">My Profile</span>
              <span className="block text-xs text-gray-500">Photo, details and contact info</span>
            </span>
            <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
          </Link>
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
