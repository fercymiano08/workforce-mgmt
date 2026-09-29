import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, Users, Clock, Calendar, FileText,
  CalendarDays, BarChart3, FileBarChart, Settings,
  LogOut, AlertTriangle, Fingerprint, CalendarClock, FileClock,
  Brain, SlidersHorizontal, ScrollText, User, MoreHorizontal
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useRole } from '../../context/RoleContext';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useInsights } from '../../context/InsightsContext';

/*
  The bottom bar a phone actually wants.

  The sidebar is a fine desktop pattern but a poor one on a phone: it is a hidden drawer, so every
  module costs an extra tap to open and another to close, and the first useful thing most people
  want - attendance, or their own schedule - is buried in the middle of a long list. A fixed bar keeps
  the four or five things done most often one tap away and always in the same place, and it puts the
  thumb where the thumb already is.

  Five destinations plus More. More is a sheet rather than a link because the full module list is long
  and nobody wants it in the tab bar. The sheet reuses the sidebar's own grouping and icons, so the
  two never drift apart.
*/

// Tabs are chosen per role: the same four that sit highest in that role's sidebar, or are simply the
// things that role does every day.
const adminTabs = [
  { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/attendance', labelKey: 'nav.attendance', icon: Clock },
  { path: '/leave', labelKey: 'nav.leave', icon: Calendar },
  { path: '/employees', labelKey: 'nav.employees', icon: Users },
];

const employeeTabs = [
  { path: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard },
  { path: '/my-attendance', labelKey: 'nav.myAttendance', icon: Fingerprint },
  { path: '/my-schedule', labelKey: 'nav.mySchedule', icon: CalendarClock },
  { path: '/leave', labelKey: 'nav.leave', icon: Calendar },
];

const adminSheetGroups = [
  {
    label: 'nav.group.main',
    items: [
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
      { path: '/ai-decision-support', key: 'nav.aiDecisionSupport', icon: Brain, badgeName: 'ai' },
      { path: '/reports', key: 'nav.reports', icon: FileBarChart },
    ],
  },
  {
    label: 'nav.group.system',
    items: [
      { path: '/audit-logs', key: 'nav.auditLogs', icon: ScrollText },
      { path: '/kiosk-setup', key: 'nav.kioskSetup', icon: SlidersHorizontal },
      { path: '/settings', key: 'nav.settings', icon: Settings },
    ],
  },
];

const employeeSheetItems = [
  { path: '/my-attendance', key: 'nav.myAttendance', icon: Fingerprint },
  { path: '/my-schedule', key: 'nav.mySchedule', icon: CalendarClock },
  { path: '/leave', key: 'nav.leave', icon: Calendar },
  { path: '/my-timesheet', key: 'nav.timesheets', icon: FileClock },
  { path: '/my-profile', key: 'nav.myProfile', icon: User },
  { path: '/settings', key: 'nav.settings', icon: Settings },
];

export default function MobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentRole } = useRole();
  const { logout } = useAuth();
  const { t } = useLanguage();
  const { unresolvedCount } = useInsights();

  const [sheetOpen, setSheetOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isAdmin = currentRole === 'admin';
  const tabs = isAdmin ? adminTabs : employeeTabs;

  const isActive = (path) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path));

  // A tab is only highlighted when that exact screen is on top. On the long tail of pages the bar has
  // no tab lit, which is honest - the "More" sheet is where those live.
  const sheetOwnsCurrent = isAdmin
    ? adminSheetGroups.some((g) => g.items.some((i) => isActive(i.path)))
    : employeeSheetItems.some((i) => isActive(i.path));

  const handleSignOut = async () => {
    setConfirmOpen(false);
    setSheetOpen(false);
    await logout();
    navigate('/login', { replace: true });
  };

  const tabClass = (active) =>
    clsx(
      'flex-1 flex flex-col items-center justify-center gap-1 min-w-0 py-1.5 rounded-xl transition-colors',
      'min-h-[56px]',
      active ? 'text-blue-600' : 'text-gray-400 active:bg-gray-100'
    );

  const sheetItemClass = (active) =>
    clsx(
      'flex items-center gap-3 px-3.5 h-[48px] rounded-xl text-[14px] font-medium transition-colors w-full text-left',
      active ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'
    );

  return (
    <>
      {/* pb-[env(safe-area-inset-bottom)] keeps the bar clear of the home indicator on iPhones and
          Android gesture bars, which sit over the bottom of the viewport. */}
      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 px-2 pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] shadow-[0_-2px_12px_rgba(15,23,42,0.06)]"
        aria-label={t('nav.more')}
      >
        <div className="flex items-stretch gap-0.5">
          {tabs.map((tab) => {
            const active = isActive(tab.path);
            return (
              <NavLink key={tab.path} to={tab.path} className={tabClass(active)} aria-current={active ? 'page' : undefined}>
                {({ isFocus }) => (
                  <>
                    <tab.icon className={clsx('w-[22px] h-[22px]', active && 'stroke-[2.4]')} strokeWidth={isFocus ? 2.4 : 2} />
                    <span className="text-[10px] font-semibold leading-none truncate w-full text-center px-0.5">
                      {t(tab.labelKey)}
                    </span>
                  </>
                )}
              </NavLink>
            );
          })}

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={tabClass(sheetOwnsCurrent && !tabs.some((t2) => isActive(t2.path)))}
            aria-label={t('nav.more')}
            aria-expanded={sheetOpen}
          >
            {unresolvedCount > 0 ? (
              <span className="relative inline-flex">
                <MoreHorizontal className="w-[22px] h-[22px]" strokeWidth={2} />
                <span className="absolute -top-0.5 -right-1.5 min-w-[15px] h-[15px] px-1 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {unresolvedCount > 99 ? '99+' : unresolvedCount}
                </span>
              </span>
            ) : (
              <MoreHorizontal className="w-[22px] h-[22px]" strokeWidth={2} />
            )}
            <span className="text-[10px] font-semibold leading-none">{t('nav.more')}</span>
          </button>
        </div>
      </nav>

      {/* Everything that did not earn a permanent tab. Drawn from the bottom so it sits under the
          thumb, and a full-height list would mean scrolling to reach Settings on a phone. */}
      <Modal isOpen={sheetOpen} onClose={() => setSheetOpen(false)} title={t('nav.more')} size="sm">
        <div className="-mx-1 space-y-5 max-h-[65vh] overflow-y-auto">
          {isAdmin ? (
            adminSheetGroups.map((group) => (
              <div key={group.label}>
                <p className="px-3.5 mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">
                  {t(group.label)}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = isActive(item.path);
                    return (
                      <NavLink
                        key={item.path}
                        to={item.path}
                        onClick={() => setSheetOpen(false)}
                        className={sheetItemClass(active)}
                      >
                        <item.icon className={clsx('w-[19px] h-[19px] flex-shrink-0', active ? 'text-blue-600' : 'text-gray-400')} />
                        <span className="truncate">{t(item.key)}</span>
                        {item.badgeName && unresolvedCount > 0 && (
                          <span className="ml-auto min-w-[20px] h-[20px] px-1.5 inline-flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold">
                            {unresolvedCount > 99 ? '99+' : unresolvedCount}
                          </span>
                        )}
                      </NavLink>
                    );
                  })}
                </div>
              </div>
            ))
          ) : (
            <div className="space-y-0.5">
              {employeeSheetItems.map((item) => {
                const active = isActive(item.path);
                return (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    onClick={() => setSheetOpen(false)}
                    className={sheetItemClass(active)}
                  >
                    <item.icon className={clsx('w-[19px] h-[19px] flex-shrink-0', active ? 'text-blue-600' : 'text-gray-400')} />
                    <span className="truncate">{t(item.key)}</span>
                  </NavLink>
                );
              })}
            </div>
          )}

          <div className="pt-1 border-t border-gray-100">
            <button type="button" onClick={() => setConfirmOpen(true)} className={sheetItemClass(false)}>
              <LogOut className="w-[19px] h-[19px] flex-shrink-0 text-red-500" />
              <span className="text-red-600">{t('nav.signOut')}</span>
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={t('nav.signOut')} size="sm">
        <div className="flex items-start gap-3">
          <span className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-[18px] h-[18px]" />
          </span>
          <p className="text-sm text-gray-600 pt-1.5">{t('nav.signOutConfirm')}</p>
        </div>
        <div className="flex gap-2 justify-end mt-5">
          <Button variant="outline" size="sm" onClick={() => setConfirmOpen(false)}>{t('common.cancel')}</Button>
          <Button variant="danger" size="sm" onClick={handleSignOut}>{t('nav.signOut')}</Button>
        </div>
      </Modal>
    </>
  );
}
