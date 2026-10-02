import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Users, User, CalendarCheck, CalendarDays, Clock, ClipboardList, BarChart3, FileBarChart,
  ShieldCheck, Settings, Bell, ScanFace, UserPlus, CornerDownLeft, Loader2, FileText, X, History,
  Timer, LogOut, FileWarning, SearchX,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { searchService } from '../../services/api';

// The universal search. The bar at the top of every screen answers one question - "where is it?" - for
// whoever is signed in: an administrator finds anyone's employee record, attendance, leave, overtime,
// timesheet, shift, correction or audit entry; an employee finds only their own. The filtering happens
// on the SERVER (GET /api/search), so what a role can see is decided in one place. Every result opens
// the module that owns the record, already filtered to it.

// Module shortcuts. Each role only ever sees the screens it can actually open.
const ADMIN_PAGES = [
  { key: 'employees', labelKey: 'nav.employees', path: '/employees', icon: Users, terms: 'employees employee staff members directory team' },
  { key: 'attendance', labelKey: 'nav.attendance', path: '/attendance', icon: CalendarCheck, terms: 'attendance records clock in out times present late absent overtime corrections' },
  { key: 'shifts', labelKey: 'nav.shifts', path: '/shifts', icon: Clock, terms: 'shifts schedule scheduling roster' },
  { key: 'timesheets', labelKey: 'nav.timesheets', path: '/timesheets', icon: ClipboardList, terms: 'timesheets timesheet hours payroll week' },
  { key: 'leave', labelKey: 'nav.leave', path: '/leave', icon: CalendarDays, terms: 'leave leaves requests vacation sick approval' },
  { key: 'analytics', labelKey: 'nav.analytics', path: '/analytics', icon: BarChart3, terms: 'analytics workforce charts statistics trends dashboard' },
  { key: 'reports', labelKey: 'nav.reports', path: '/reports', icon: FileBarChart, terms: 'reports report export pdf csv' },
  { key: 'ai', labelKey: 'nav.aiDecisionSupport', path: '/ai-decision-support', icon: FileText, terms: 'ai insights decisions support' },
  { key: 'audit', labelKey: 'nav.auditLogs', path: '/audit-logs', icon: ShieldCheck, terms: 'audit logs activity trail security' },
  { key: 'registration', labelKey: 'nav.employeeRegistration', path: '/employee-registration', icon: UserPlus, terms: 'registration register new employee onboarding' },
  { key: 'kiosk', labelKey: 'nav.kioskSetup', path: '/kiosk-setup', icon: ScanFace, terms: 'kiosk terminal tablet face setup' },
  { key: 'settings', labelKey: 'nav.settings', path: '/settings', icon: Settings, terms: 'settings preferences password profile account' },
  { key: 'notifications', labelKey: 'nav.notifications', path: '/notifications', icon: Bell, terms: 'notifications alerts inbox' },
];

const EMPLOYEE_PAGES = [
  { key: 'my-attendance', labelKey: 'nav.myAttendance', path: '/my-attendance', icon: CalendarCheck, terms: 'my attendance records clock in out times present late absent corrections' },
  { key: 'my-schedule', labelKey: 'nav.mySchedule', path: '/my-schedule', icon: Clock, terms: 'my shift shifts schedule scheduling roster' },
  { key: 'leave', labelKey: 'nav.leaveEmployee', path: '/leave', icon: CalendarDays, terms: 'my leave leaves requests vacation sick approval' },
  { key: 'my-timesheet', labelKey: 'nav.timesheetsEmployee', path: '/my-timesheet', icon: ClipboardList, terms: 'my timesheet hours payroll week' },
  { key: 'my-profile', labelKey: 'nav.myProfile', path: '/my-profile', icon: User, terms: 'my profile personal information details' },
  { key: 'notifications', labelKey: 'nav.notifications', path: '/notifications', icon: Bell, terms: 'notifications alerts inbox' },
  { key: 'settings', labelKey: 'nav.settings', path: '/settings', icon: Settings, terms: 'settings preferences password account' },
];

// What each kind of record looks like in the list: its icon and the tint behind it.
const TYPE_STYLE = {
  employee: { icon: User, tint: 'bg-blue-50 text-blue-600' },
  attendance: { icon: CalendarCheck, tint: 'bg-emerald-50 text-emerald-600' },
  leave: { icon: CalendarDays, tint: 'bg-amber-50 text-amber-600' },
  overtime: { icon: Timer, tint: 'bg-purple-50 text-purple-600' },
  early: { icon: LogOut, tint: 'bg-orange-50 text-orange-600' },
  correction: { icon: FileWarning, tint: 'bg-rose-50 text-rose-600' },
  timesheet: { icon: ClipboardList, tint: 'bg-indigo-50 text-indigo-600' },
  shift: { icon: Clock, tint: 'bg-sky-50 text-sky-600' },
  notification: { icon: Bell, tint: 'bg-gray-100 text-gray-600' },
  audit: { icon: ShieldCheck, tint: 'bg-slate-100 text-slate-600' },
  page: { icon: CornerDownLeft, tint: 'bg-gray-100 text-gray-500' },
};

const badgeTone = (text) => {
  const v = String(text || '').toLowerCase();
  if (/(approved|present|active|complete|on leave|healthy|excused)/.test(v)) return 'bg-emerald-50 text-emerald-700';
  if (/(pending|submitted|late|draft|review|in progress|warning|normal)/.test(v)) return 'bg-amber-50 text-amber-700';
  if (/(reject|absent|critical|unpaid|high|failed|terminated)/.test(v)) return 'bg-red-50 text-red-700';
  if (/(cancel|withdraw|closed|inactive)/.test(v)) return 'bg-gray-100 text-gray-600';
  return 'bg-blue-50 text-blue-700';
};

const RECENT_KEY = 'workforce_recent_searches';
const readRecent = () => {
  try {
    const raw = JSON.parse(window.localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.slice(0, 5) : [];
  } catch {
    return [];
  }
};
const saveRecent = (term) => {
  try {
    const next = [term, ...readRecent().filter((r) => r.toLowerCase() !== term.toLowerCase())].slice(0, 5);
    window.localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch { /* private mode: recents are a convenience, not a requirement */ }
};

const clearRecentStorage = () => {
  try { window.localStorage.removeItem(RECENT_KEY); } catch { /* nothing to clear */ }
};
const removeRecentStorage = (term) => {
  try { window.localStorage.setItem(RECENT_KEY, JSON.stringify(readRecent().filter((r) => r !== term))); } catch { /* ignore */ }
};

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Bold the part of a result that matched what was typed, so it is obvious why a row is there.
function Highlight({ text, words }) {
  const value = String(text ?? '');
  if (!words.length) return value;
  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'ig');
  return value.split(pattern).map((part, i) => (
    i % 2 === 1
      ? <mark key={i} className="bg-transparent text-blue-600 font-semibold">{part}</mark>
      : part
  ));
}

export default function GlobalSearch() {
  const { t } = useLanguage();
  const { isAdmin } = useAuth();
  const navigate = useNavigate();

  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  // Phone-width: the bar collapses to an icon that opens a full-width search sheet.
  const [sheet, setSheet] = useState(false);
  const [state, setState] = useState({ term: null, items: [], failed: false });
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState(readRecent);

  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const requestRef = useRef(0);

  const pages = isAdmin ? ADMIN_PAGES : EMPLOYEE_PAGES;
  const words = useMemo(() => debounced.toLowerCase().split(/\s+/).filter(Boolean), [debounced]);

  useEffect(() => {
    const id = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(id);
  }, [term]);

  // One request per settled term. The server does the matching and the role filtering; a slow answer to
  // an older keystroke is ignored.
  useEffect(() => {
    if (!debounced) return undefined;
    const id = requestRef.current + 1;
    requestRef.current = id;
    searchService.query(debounced)
      .then((res) => { if (requestRef.current === id) setState({ term: debounced, items: Array.isArray(res) ? res : [], failed: false }); })
      .catch(() => { if (requestRef.current === id) setState({ term: debounced, items: [], failed: true }); });
    return undefined;
  }, [debounced]);

  const loading = !!debounced && state.term !== debounced;
  const hasTerm = term.trim().length > 0;

  const rows = useMemo(() => {
    if (!debounced) {
      // Nothing typed yet: recent searches, then a few places to jump to.
      return [
        ...recent.map((r) => ({ id: `recent:${r}`, kind: 'recent', group: 'Recent searches', title: r, recentTerm: r })),
        ...pages.slice(0, 5).map((p) => ({ id: `quick:${p.key}`, type: 'page', group: t('search.goTo'), title: t(p.labelKey), subtitle: p.path, to: p.path })),
      ];
    }
    const q = debounced.toLowerCase();
    const pageHits = pages
      .filter((p) => q.split(/\s+/).every((w) => `${p.key.replace(/-/g, ' ')} ${p.terms} ${p.path}`.toLowerCase().includes(w)))
      .slice(0, 3)
      .map((p) => ({ id: `page:${p.key}`, type: 'page', group: t('search.goTo'), title: t(p.labelKey), subtitle: p.path, to: p.path }));
    return state.term === debounced ? [...state.items, ...pageHits] : pageHits;
  }, [debounced, state, pages, recent, t]);

  const [activeFor, setActiveFor] = useState(debounced);
  if (activeFor !== debounced) {
    setActiveFor(debounced);
    setActive(0);
  }

  useEffect(() => {
    const onClickAway = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) { setOpen(false); setSheet(false); }
    };
    document.addEventListener('mousedown', onClickAway);
    return () => document.removeEventListener('mousedown', onClickAway);
  }, []);

  // Ctrl/Cmd+K, or "/" outside a text field, focuses the box from anywhere.
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(input|textarea|select)$/i.test(e.target?.tagName || '') || e.target?.isContentEditable;
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSheet(true);
        setOpen(true);
        setTimeout(() => inputRef.current?.focus(), 0);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const removeRecent = (value) => { removeRecentStorage(value); setRecent(readRecent()); };
  const clearRecent = () => { clearRecentStorage(); setRecent([]); };

  const close = useCallback(() => {
    setOpen(false);
    setSheet(false);
  }, []);

  const go = useCallback((row) => {
    if (row.kind === 'recent') {
      setTerm(row.recentTerm);
      setDebounced(row.recentTerm);
      inputRef.current?.focus();
      return;
    }
    if (term.trim()) {
      saveRecent(term.trim());
      setRecent(readRecent());
    }
    close();
    setTerm('');
    setDebounced('');
    navigate(row.to);
  }, [navigate, term, close]);

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      if (term) setTerm('');
      else { close(); inputRef.current?.blur(); }
      return;
    }
    if (!rows.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === 'Enter' && rows[active]) {
      e.preventDefault();
      go(rows[active]);
    }
  };

  const showPanel = open;
  const noMatches = !!debounced && !loading && !state.failed && state.term === debounced && rows.length === 0;

  const input = (
    <div className="relative">
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
        autoComplete="off"
        className="w-full pl-10 pr-20 py-2.5 text-sm rounded-xl bg-gray-50 border border-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 focus:bg-white transition-all duration-200 placeholder:text-gray-400"
      />
      <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
        {loading && <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
        {hasTerm ? (
          <button
            type="button"
            aria-label="Clear search"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => { setTerm(''); setDebounced(''); inputRef.current?.focus(); }}
            className="w-5 h-5 rounded-full bg-gray-200/80 hover:bg-gray-300 text-gray-500 flex items-center justify-center transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        ) : (
          <kbd className="hidden lg:inline-flex items-center text-[10px] font-medium text-gray-400 bg-white border border-gray-200 rounded-md px-1.5 py-0.5 pointer-events-none">
            /
          </kbd>
        )}
      </div>
    </div>
  );

  const panel = showPanel && (
    <div className="absolute left-0 right-0 top-full mt-2 z-50 bg-white rounded-2xl shadow-xl shadow-gray-900/10 border border-gray-100 overflow-hidden animate-scaleIn max-h-[70vh] flex flex-col">
      <div className="overflow-y-auto overscroll-contain">
        {state.failed && !!debounced && (
          <p className="px-4 py-4 text-xs text-gray-400">{t('search.unavailable')}</p>
        )}

        {noMatches && (
          <div className="px-4 py-8 text-center">
            <SearchX className="w-7 h-7 text-gray-300 mx-auto" />
            <p className="text-sm font-medium text-gray-700 mt-2">{t('search.noResults')}</p>
            <p className="text-xs text-gray-400 mt-1">Try fewer letters, a name, a date like “sep 24”, or a status like “late”.</p>
          </div>
        )}

        {loading && !rows.length && (
          <p className="px-4 py-4 text-xs text-gray-400 flex items-center gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> {t('search.searching')}
          </p>
        )}

        {rows.map((item, index) => {
          const style = item.kind === 'recent' ? { icon: History, tint: 'bg-gray-100 text-gray-500' } : (TYPE_STYLE[item.type] || TYPE_STYLE.page);
          const Icon = style.icon;
          const showHeading = index === 0 || rows[index - 1].group !== item.group;
          const count = showHeading ? rows.filter((r) => r.group === item.group).length : 0;
          return (
            <div key={item.id}>
              {showHeading && (
                <p className="px-4 pt-3 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400 flex items-center justify-between">
                  <span>{item.group}</span>
                  {item.kind === 'recent' ? (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={clearRecent}
                      className="normal-case tracking-normal text-[11px] font-semibold text-blue-600 hover:text-blue-700"
                    >
                      Clear all
                    </button>
                  ) : (
                    <span className="font-semibold text-gray-300">{count}</span>
                  )}
                </p>
              )}
              <div className={`flex items-center transition-colors ${index === active ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}>
              <button
                type="button"
                onMouseEnter={() => setActive(index)}
                onClick={() => go(item)}
                className="flex-1 min-w-0 flex items-center gap-3 pl-4 pr-2 py-2.5 text-left"
              >
                <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${style.tint}`}>
                  <Icon className="w-4 h-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900 truncate"><Highlight text={item.title} words={item.kind === 'recent' ? [] : words} /></span>
                  {item.subtitle && (
                    <span className="block text-[11px] text-gray-500 truncate"><Highlight text={item.subtitle} words={words} /></span>
                  )}
                </span>
                {item.badge && (
                  <span className={`shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full ${badgeTone(item.badge)}`}>{item.badge}</span>
                )}
                {index === active && item.kind !== 'recent' && <CornerDownLeft className="w-3.5 h-3.5 text-gray-400 shrink-0" />}
              </button>
              {item.kind === 'recent' && (
                <button
                  type="button"
                  aria-label={`Remove "${item.title}" from recent searches`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => removeRecent(item.recentTerm)}
                  className="mr-3 w-6 h-6 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-200/70 flex items-center justify-center shrink-0 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60 text-[10px] text-gray-400 flex flex-wrap items-center gap-x-3 gap-y-1 shrink-0">
        <span>&uarr;&darr; {t('search.navigate')}</span>
        <span>&crarr; {t('search.open')}</span>
        <span>esc {t('search.close')}</span>
        <span className="ml-auto hidden sm:inline">{isAdmin ? 'Searching everything in the system' : 'Searching your own records'}</span>
      </p>
    </div>
  );

  return (
    <>
      {/* Phone: just an icon, which opens the search as a sheet. */}
      <button
        type="button"
        aria-label={t('topbar.search')}
        onClick={() => { setSheet(true); setOpen(true); setTimeout(() => inputRef.current?.focus(), 50); }}
        className="sm:hidden p-2.5 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
      >
        <Search className="w-5 h-5" />
      </button>

      <div
        ref={rootRef}
        className={sheet
          ? 'max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:z-50 max-sm:bg-white max-sm:p-3 max-sm:shadow-lg max-sm:pt-[calc(0.75rem+env(safe-area-inset-top))] relative w-full max-w-md'
          : 'max-sm:hidden relative w-full max-w-md'}
      >
        {input}
        {panel}
      </div>
    </>
  );
}
