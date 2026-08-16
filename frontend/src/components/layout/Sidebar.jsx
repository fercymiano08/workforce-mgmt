import { useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, Clock, Calendar, FileText,
  CalendarDays, BarChart3, FileBarChart, Settings,
  LogOut, AlertTriangle, Fingerprint, CalendarClock, FileClock,
  Brain, SlidersHorizontal, Bell
} from 'lucide-react';
import clsx from 'clsx';
import Avatar from '../ui/Avatar';
import BrandLogo from '../ui/BrandLogo';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';

const adminMenuGroups = [
  {
    label: 'nav.group.main',
    items: [
      { path: '/', key: 'nav.dashboard', icon: LayoutDashboard },
      { path: '/employees', key: 'nav.employees', icon: Users },
    ],
  },
  {
    label: 'nav.group.attendance',
    items: [
      { path: '/attendance', key: 'nav.attendance', icon: Clock },
      { path: '/shifts', key: 'nav.shifts', icon: CalendarDays },
      { path: '/timesheets', key: 'nav.timesheets', icon: FileText },
    ],
  },
  {
    label: 'nav.group.leave',
    items: [
      { path: '/leave', key: 'nav.leave', icon: Calendar },
    ],
  },
  {
    label: 'nav.group.analytics',
    items: [
      { path: '/analytics', key: 'nav.analytics', icon: BarChart3 },
      { path: '/ai-decision-support', key: 'nav.aiDecisionSupport', icon: Brain },
      { path: '/reports', key: 'nav.reports', icon: FileBarChart },
    ],
  },
  {
    label: 'nav.group.system',
    items: [
      { path: '/kiosk-setup', key: 'nav.kioskSetup', icon: SlidersHorizontal },
      { path: '/notifications', key: 'nav.notifications', icon: Bell },
      { path: '/settings', key: 'nav.settings', icon: Settings },
    ],
  },
];

const employeeMenuItems = [
  { path: '/', key: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/my-attendance', key: 'nav.myAttendance', icon: Fingerprint },
  { path: '/my-schedule', key: 'nav.mySchedule', icon: CalendarClock },
  { path: '/leave', key: 'nav.leave', icon: Calendar },
  { path: '/my-timesheet', key: 'nav.timesheets', icon: FileClock },
  { path: '/notifications', key: 'nav.notifications', icon: Bell },
  { path: '/settings', key: 'nav.settings', icon: Settings },
];

export default function Sidebar({ isOpen, onClose }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentRole } = useRole();
  const { user, logout } = useAuth();
  const { t } = useLanguage();

  const [showLogoutModal, setShowLogoutModal] = useState(false);

  const renderNavItem = (item) => {
    const isActive = location.pathname === item.path ||
      (item.path !== '/' && location.pathname.startsWith(item.path));
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onClose}
        className={clsx(
          'flex items-center gap-3 px-3.5 h-[44px] rounded-xl text-[13.5px] font-medium transition-all duration-200 group',
          isActive
            ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white shadow-lg shadow-blue-600/30'
            : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
        )}
      >
        <item.icon className={clsx(
          'w-[18px] h-[18px] flex-shrink-0 transition-colors duration-200',
          isActive ? 'text-white' : 'text-slate-500 group-hover:text-slate-300'
        )} />
        <span className="truncate">{t(item.key)}</span>
      </NavLink>
    );
  };

  const handleSignOut = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    setShowLogoutModal(false);
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      <aside
        className={clsx(
          'fixed left-0 top-0 bottom-0 w-[260px] bg-[#0B1F3A] flex flex-col z-50 transition-transform duration-300 ease-in-out',
          'lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="px-6 h-[72px] flex items-center gap-3 flex-shrink-0">
          <BrandLogo variant="icon" />
          <div>
            <h1 className="font-bold text-lg leading-tight tracking-tight uppercase text-red-500">ARCHON NELL</h1>
            <p className="text-blue-300 text-[11px] font-medium uppercase tracking-[0.25em]">INCORPORATED</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-3 overflow-y-auto">
          {currentRole === 'Employee' ? (
            <div className="space-y-1">
              {employeeMenuItems.map(renderNavItem)}
            </div>
          ) : (
            <div className="space-y-1">
              {adminMenuGroups.map((group) => (
                <div key={group.label}>
                  <div className="px-3.5 pt-5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.15em] text-slate-500">
                    {t(group.label)}
                  </div>
                  <div className="space-y-1">
                    {group.items.map(renderNavItem)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </nav>

        {/* User Profile - Fixed at bottom */}
        <div className="px-4 py-4 flex-shrink-0 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition-colors cursor-pointer">
            <Avatar firstName={user?.firstName} lastName={user?.lastName} size="sm" online />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-medium text-white truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-[11px] text-slate-500 truncate">{user?.roleLabel || currentRole}</p>
            </div>
            <button
              onClick={handleSignOut}
              title="Sign out"
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-white/[0.06] transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

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
