import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Bell, ChevronDown,
  LogOut, User, Settings, HelpCircle, Menu,
  Sun, Moon, AlertTriangle, WifiOff, Wifi
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import useNetworkStatus from '../../hooks/useNetworkStatus';
import Avatar from '../ui/Avatar';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import NotificationDropdown from '../common/NotificationDropdown';
import { useNotifications } from '../../context/NotificationContext';

export default function Topbar({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const { t } = useLanguage();
  const { toggleTheme, isDark } = useTheme();
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const { unreadCount } = useNotifications();
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const profileRef = useRef(null);
  const notifRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfile(false);
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSignOut = () => {
    setShowProfile(false);
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
    <header className="sticky top-0 z-30 h-16 bg-white border-b border-gray-100 flex items-center justify-between px-3 sm:px-6 shrink-0">
      {/* Left: Menu toggle + Search */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={onMenuToggle}
          className="p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 lg:hidden shrink-0"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="relative w-full max-w-md hidden sm:block">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            placeholder={t('topbar.search')}
            className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all duration-200 placeholder:text-gray-400"
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-3 shrink-0">
        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setShowNotifications((prev) => !prev)}
            className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
            title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'Notifications'}
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold ring-2 ring-white">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          <NotificationDropdown
            isOpen={showNotifications}
          />
        </div>

        {/* Light / Dark toggle */}
        <button
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="relative p-2.5 rounded-xl hover:bg-gray-100 transition-colors text-gray-500 hover:text-gray-700"
        >
          <Sun className={`w-5 h-5 transition-all duration-300 ${isDark ? 'scale-0 -rotate-90 absolute' : 'scale-100 rotate-0'}`} />
          <Moon className={`w-5 h-5 transition-all duration-300 ${isDark ? 'scale-100 rotate-0' : 'scale-0 rotate-90 absolute'}`} />
        </button>

        {/* Network Status */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-semibold transition-colors ${
            isOnline
              ? 'bg-emerald-50 text-emerald-700'
              : 'bg-red-50 text-red-600'
          }`}
          title={isOnline ? 'Internet connected' : 'No internet connection — AI features require internet'}
        >
          {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
        </div>

        {/* Divider */}
        <div className="w-px h-8 bg-gray-200 hidden md:block" />

        {/* Profile */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setShowProfile(!showProfile)}
            className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size="sm" online={isOnline} />
            <div className="text-left hidden md:block">
              <p className="text-[13px] font-semibold text-gray-900 leading-tight">{user?.firstName} {user?.lastName}</p>
              <p className="text-[11px] text-gray-500">{user?.roleLabel}</p>
            </div>
            <ChevronDown className="w-4 h-4 text-gray-400 hidden md:block" />
          </button>
          {showProfile && (
            <div className="absolute right-0 top-full mt-2 w-60 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 animate-scaleIn z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-900 text-sm">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-gray-500 mt-0.5">{user?.email}</p>
              </div>
              <div className="py-1">
                <button onClick={() => { navigate('/settings'); setShowProfile(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <User className="w-4 h-4 text-gray-400" /> {t('topbar.profile')}
                </button>
                <button onClick={() => { navigate('/settings'); setShowProfile(false); }} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <Settings className="w-4 h-4 text-gray-400" /> {t('topbar.settings')}
                </button>
                <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  <HelpCircle className="w-4 h-4 text-gray-400" /> {t('topbar.help')}
                </button>
              </div>
              <div className="border-t border-gray-100 py-1">
                <button onClick={handleSignOut} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                  <LogOut className="w-4 h-4" /> {t('topbar.signOut')}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

      <Modal isOpen={showLogoutModal} onClose={() => setShowLogoutModal(false)} title="Confirm Logout" size="sm">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <div>
            <p className="text-gray-900 font-semibold text-base">Are you sure you want to logout?</p>
            <p className="text-gray-500 text-sm mt-1">You will be redirected to the login page.</p>
          </div>
          <div className="flex items-center gap-3 mt-2 w-full">
            <Button variant="outline" className="flex-1" onClick={() => setShowLogoutModal(false)}>No, Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={confirmLogout}>Yes, Logout</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
