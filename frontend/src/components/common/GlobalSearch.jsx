import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Users, User, CalendarCheck, CalendarDays, Clock, ClipboardList,
  BarChart3, FileBarChart, ShieldCheck, Settings, Bell, ScanFace, UserPlus,
  CornerDownLeft, Loader2, FileText,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import {
  employeeService, attendanceService, leaveService, shiftService, timesheetService,
} from '../../services/api';

// The bar at the top of every screen was a dead input: it accepted text and nothing ever read it.
// It is a command palette now. It answers two different questions depending on who is signed in -
// for an administrator "where is employee X / that attendance record", for an employee "where is my
// leave request / my shift on the 24th" - and every result lands on a real module already filtered
// to the term, so the search bar leads somewhere instead of just looking busy.

// Module shortcuts. Each role only ever sees the screens it can actually open, so searching can
// never offer a link that bounces straight back to the dashboard.
const ADMIN_PAGES = [
  { key: 'employees', labelKey: 'nav.employees', path: '/employees', icon: Users, terms: 'employees employee staff members directory team' },
  { key: 'attendance', labelKey: 'nav.attendance', path: '/attendance', icon: CalendarCheck, terms: 'attendance records clock in out times present late absent overtime' },
  { key: 'shifts', labelKey: 'nav.shifts', path: '/shifts', icon: Clock, terms: 'shifts schedule scheduling roster' },
  { key: 'timesheets', labelKey: 'nav.timesheets', path: '/timesheets', icon: ClipboardList, terms: 'timesheets timesheet hours payroll week' },
  { key: 'leave', labelKey: 'nav.leave', path: '/leave', icon: CalendarDays, terms: 'leave leaves requests vacation sick approval' },
  { key: 'analytics', labelKey: 'nav.analytics', path: '/analytics', icon: BarChart3, terms: 'analytics charts statistics trends dashboard' },
  { key: 'reports', labelKey: 'nav.reports', path: '/reports', icon: FileBarChart, terms: 'reports report export pdf csv' },
  { key: 'ai', labelKey: 'nav.aiDecisionSupport', path: '/ai-decision-support', icon: FileText, terms: 'ai insights decisions support' },
  { key: 'audit', labelKey: 'nav.auditLogs', path: '/audit-logs', icon: ShieldCheck, terms: 'audit logs activity trail security' },
  { key: 'registration', labelKey: 'nav.employeeRegistration', path: '/employee-registration', icon: UserPlus, terms: 'registration register new employee onboarding' },
  { key: 'kiosk', labelKey: 'nav.kioskSetup', path: '/kiosk-setup', icon: ScanFace, terms: 'kiosk terminal tablet face setup' },
  { key: 'settings', labelKey: 'nav.settings', path: '/settings', icon: Settings, terms: 'settings preferences password profile account' },
  { key: 'notifications', labelKey: 'nav.notifications', path: '/notifications', icon: Bell, terms: 'notifications alerts inbox' },
];

const EMPLOYEE_PAGES = [
  { key: 'my-attendance', labelKey: 'nav.myAttendance', path: '/my-attendance', icon: CalendarCheck, terms: 'my attendance records clock in out times present late absent' },
  { key: 'my-schedule', labelKey: 'nav.mySchedule', path: '/my-schedule', icon: Clock, terms: 'my shift shifts schedule scheduling roster' },
  { key: 'leave', labelKey: 'nav.leave', path: '/leave', icon: CalendarDays, terms: 'my leave leaves requests vacation sick approval' },
  { key: 'my-timesheet', labelKey: 'nav.timesheets', path: '/my-timesheet', icon: ClipboardList, terms: 'my timesheet hours payroll week' },
  { key: 'my-profile', labelKey: 'nav.myProfile', path: '/my-profile', icon: User, terms: 'my profile personal information details' },
  { key: 'notifications', labelKey: 'nav.notifications', path: '/notifications', icon: Bell, terms: 'notifications alerts inbox' },
  { key: 'settings', labelKey: 'nav.settings', path: '/settings', icon: Settings, terms: 'settings preferences password account' },
];

const norm = (value) => String(value ?? '').toLowerCase();
const has = (term, ...fields) => fields.some((f) => norm(f).includes(term));

// A date in the search results should read the way a person writes it, but still match the raw key
// so pasting "2026-09-24" works as well as typing "sep 24".
const longDate = (key) => {
  if (!key) return '';
  const [y, m, d] = String(key).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(key);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
  });
};

const PER_GROUP = 5;

export default function GlobalSearch() {
  const { t } = useLanguage();
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();

  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  // Which term the data request has settled for, and whether it worked. Deriving the loading and
  // failed flags from this keeps them correct per keystroke without setting state inside an effect.
  const [settled, setSettled] = useState({ term: null, ok: null });
  const [data, setData] = useState(null);
  const [active, setActive] = useState(0);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const loadRef = useRef(null);
  const requestRef = useRef(0);

  const pages = isAdmin ? ADMIN_PAGES : EMPLOYEE_PAGES;
  const employeeId = user?.id;

  // Debounce so a fast typist does not fire a request per keystroke.
  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 250);
    return () => clearTimeout(id);
  }, [term]);

  // The records behind the results are fetched once per session and reused, so the second search
  // is instant and does not hammer the API.
  const ensureData = useCallback(() => {
    if (loadRef.current) return loadRef.current;
    const load = async () => {
      if (isAdmin) {
        return { employees: await employeeService.getAll() };
      }
      if (!employeeId) return { employees: [] };
      // An employee only ever searches their own rows, so these are the by-employee endpoints.
      // Promise.allSettled: one failing endpoint must not blank out the whole palette.
      const [attendance, leaves, schedules, timesheets] = await Promise.allSettled([
        attendanceService.getByEmployeeId(employeeId),
        leaveService.getByEmployeeId(employeeId),
        shiftService.getScheduleByEmployeeId(employeeId),
        timesheetService.getByEmployeeId(employeeId),
      ]);
      const value = (result) => (result.status === 'fulfilled' && Array.isArray(result.value) ? result.value : []);
      return {
        attendance: value(attendance),
        leaves: value(leaves),
        schedules: value(schedules),
        timesheets: value(timesheets),
      };
    };
    loadRef.current = load().catch(() => null);
    return loadRef.current;
  }, [isAdmin, employeeId]);

  useEffect(() => {
    if (debounced.length < 2) return undefined;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    ensureData().then((loaded) => {
      // Ignore anything that came back after a newer keystroke.
      if (requestRef.current !== requestId) return;
      setData(loaded);
      setSettled({ term: debounced, ok: loaded !== null });
    });
    return undefined;
  }, [debounced, ensureData]);

  const loading = debounced.length >= 2 && settled.term !== debounced;
  const failed = debounced.length >= 2 && settled.term === debounced && settled.ok === false;

  const groups = useMemo(() => {
    if (debounced.length < 2) return [];
    const q = norm(debounced);

    const pageHits = pages
      .filter((p) => has(q, p.key.replace(/-/g, ' '), p.terms, p.path))
      .slice(0, PER_GROUP)
      .map((p) => ({
        id: `page:${p.key}`,
        group: t('search.goTo'),
        icon: p.icon,
        title: t(p.labelKey),
        subtitle: p.path,
        to: p.path,
      }));

    const people = [];
    const records = [];

    if (isAdmin && data?.employees) {
      data.employees
        .filter((e) => has(q, e.firstName, e.lastName, e.email, e.department, e.position, e.status,
          `${e.firstName} ${e.lastName}`))
        .slice(0, PER_GROUP)
        .forEach((e) => people.push({
          id: `emp:${e.id}`,
          group: t('search.people'),
          icon: User,
          title: `${e.firstName} ${e.lastName}`,
          subtitle: [e.position, e.department, e.email].filter(Boolean).join(' · '),
          to: `/employees?search=${encodeURIComponent(`${e.firstName} ${e.lastName}`)}`,
        }));
    }

    if (!isAdmin && data) {
      (data.attendance || []).filter((a) => has(q, a.date, longDate(a.date), a.status, a.clockIn, a.clockOut))
        .slice(0, PER_GROUP)
        .forEach((a) => records.push({
          id: `att:${a.id}`,
          group: t('search.myAttendance'),
          icon: CalendarCheck,
          title: longDate(a.date),
          subtitle: [a.status, a.clockIn && a.clockOut ? `${a.clockIn} – ${a.clockOut}` : null].filter(Boolean).join(' · '),
          to: `/my-attendance?search=${encodeURIComponent(a.date)}`,
        }));

      (data.leaves || []).filter((l) => has(q, l.type, l.leaveType, l.status, l.startDate, l.endDate, longDate(l.startDate)))
        .slice(0, PER_GROUP)
        .forEach((l) => records.push({
          id: `leave:${l.id}`,
          group: t('search.myLeaves'),
          icon: CalendarDays,
          title: l.type || l.leaveType || t('nav.leave'),
          subtitle: [l.status, l.startDate && l.endDate ? `${l.startDate} – ${l.endDate}` : null].filter(Boolean).join(' · '),
          to: `/leave?search=${encodeURIComponent(l.type || l.leaveType || '')}`,
        }));

      (data.schedules || []).filter((s) => has(q, s.shiftName, s.shift?.name, s.date, longDate(s.date), s.status, s.day))
        .slice(0, PER_GROUP)
        .forEach((s) => records.push({
          id: `shift:${s.id}`,
          group: t('search.myShifts'),
          icon: Clock,
          title: s.shiftName || s.shift?.name || t('nav.my-schedule'),
          subtitle: [longDate(s.date), s.startTime && s.endTime ? `${s.startTime} – ${s.endTime}` : null].filter(Boolean).join(' · '),
          to: `/my-schedule?search=${encodeURIComponent(s.shiftName || s.shift?.name || '')}`,
        }));

      (data.timesheets || []).filter((ts) => has(q, ts.weekStart, ts.weekEnd, ts.status, longDate(ts.weekStart)))
        .slice(0, PER_GROUP)
        .forEach((ts) => records.push({
          id: `ts:${ts.id}`,
          group: t('search.myTimesheets'),
          icon: ClipboardList,
          title: longDate(ts.weekStart),
          subtitle: [ts.status, ts.totalHours ? `${ts.totalHours}h` : null].filter(Boolean).join(' · '),
          to: `/my-timesheet?search=${encodeURIComponent(String(ts.weekStart))}`,
        }));
    }

    // People and records first: a named person or a specific date is what someone typing in this box
    // almost always wants, and a page shortcut is the fallback when nothing matches.
    const ordered = [people, records, pageHits].filter((g) => g.length);
    return ordered;
  }, [debounced, isAdmin, data, pages, t]);

  const flat = useMemo(() => groups.flat(), [groups]);

  // A new term means a new result list, so the highlight goes back to the first row. Adjusting state
  // during render is React's documented way to react to a changed input, and unlike an effect it
  // cannot paint a frame with the old highlight pointing at the wrong row.
  const [activeFor, setActiveFor] = useState(debounced);
  if (activeFor !== debounced) {
    setActiveFor(debounced);
    setActive(0);
  }

  useEffect(() => {
    const onClickAway = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  // Ctrl/Cmd+K focuses the box from anywhere, the way a search box is expected to behave.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const go = useCallback((to) => {
    setOpen(false);
    setTerm('');
    setDebounced('');
    navigate(to);
  }, [navigate]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!flat.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % flat.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + flat.length) % flat.length);
    } else if (e.key === 'Enter' && flat[active]) {
      e.preventDefault();
      go(flat[active].to);
    }
  };

  const showPanel = open && term.trim().length >= 2;
  const tooShort = open && term.trim().length === 1;

  return (
    <div ref={rootRef} className="relative w-full max-w-md">
      <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        ref={inputRef}
        type="text"
        value={term}
        onChange={(e) => { setTerm(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={t('topbar.search')}
        aria-label={t('topbar.search')}
        role="combobox"
        aria-expanded={showPanel}
        className="w-full pl-10 pr-24 py-2.5 text-sm rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all duration-200 placeholder:text-gray-400"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 hidden lg:flex items-center gap-0.5 text-[10px] font-semibold text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5 pointer-events-none">
        {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Ctrl K'}
      </span>

      {showPanel && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden animate-scaleIn">
          {tooShort && (
            <p className="px-4 py-3 text-xs text-gray-400">{t('search.typeMore')}</p>
          )}

          {showPanel && !tooShort && loading && !flat.length && (
            <p className="px-4 py-3 text-xs text-gray-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('search.searching')}
            </p>
          )}

          {showPanel && !tooShort && !loading && failed && (
            <p className="px-4 py-3 text-xs text-gray-400">{t('search.unavailable')}</p>
          )}

          {showPanel && !tooShort && !loading && !failed && !flat.length && (
            <p className="px-4 py-3 text-xs text-gray-400">{t('search.noResults')}</p>
          )}

          {flat.map((item, index) => {
            const Icon = item.icon;
            const showHeading = index === 0 || flat[index - 1].group !== item.group;
            return (
              <div key={item.id}>
                {showHeading && (
                  <p className="px-4 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                    {item.group}
                  </p>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item.to)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                    index === active ? 'bg-blue-50/70' : 'hover:bg-gray-50'
                  }`}
                >
                  <span className="w-8 h-8 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 truncate">{item.title}</span>
                    {item.subtitle && (
                      <span className="block text-[11px] text-gray-500 truncate">{item.subtitle}</span>
                    )}
                  </span>
                  {index === active && <CornerDownLeft className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
                </button>
              </div>
            );
          })}

          {flat.length > 0 && (
            <p className="px-4 py-2.5 border-t border-gray-100 text-[10px] text-gray-400 flex items-center gap-3">
              <span>&uarr;&darr; {t('search.navigate')}</span>
              <span>&crarr; {t('search.open')}</span>
              <span>esc {t('search.close')}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
