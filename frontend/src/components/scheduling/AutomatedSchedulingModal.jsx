import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Bot, CalendarDays, Trash2, Undo2, Plus, ShieldCheck, History, PartyPopper, Users, Save, Play, CheckCircle2,
  CircleDashed, ListChecks, CalendarRange, Send, ChevronRight,
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import Input, { Select } from '../ui/Input';
import EmployeePicker from './EmployeePicker';
import useApiData from '../../hooks/useApiData';
import { shiftService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatTime } from '../../utils/helpers';

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const daysText = (days) => (days || []).slice().sort((a, b) => a - b).map((d) => DAYS[d - 1][1]).join(', ');

// The calendar period kept scheduled. Weeks run Monday to Sunday (ISO 8601).
const WINDOWS = [['week', '1 week'], ['two_weeks', '2 weeks'], ['month', '1 month'], ['next_month', 'Next month']];
const WINDOW_TEXT = {
  week: 'this week',
  two_weeks: 'this week and next week',
  month: 'this month',
  next_month: 'next month',
};

// Today's date in Manila, as a UTC-midnight Date so day arithmetic never shifts with the viewer's time zone.
function manilaToday() {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (date) => date.toISOString().slice(0, 10);
const plusDays = (date, n) => new Date(date.getTime() + n * 86400000);

// The same periods the server uses, so each option can show its dates before it is saved.
function windowRange(mode) {
  const today = manilaToday();
  const monday = plusDays(today, -((today.getUTCDay() + 6) % 7));
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  if (mode === 'two_weeks') return [iso(monday), iso(plusDays(monday, 13))];
  if (mode === 'month') return [iso(new Date(Date.UTC(y, m, 1))), iso(new Date(Date.UTC(y, m + 1, 0)))];
  if (mode === 'next_month') return [iso(new Date(Date.UTC(y, m + 1, 1))), iso(new Date(Date.UTC(y, m + 2, 0)))];
  return [iso(monday), iso(plusDays(monday, 6))];
}

const TABS = [
  { id: 'schedule', label: 'Schedule', icon: Bot },
  { id: 'workdays', label: 'Work days', icon: CalendarDays },
  { id: 'holidays', label: 'Holidays', icon: PartyPopper },
  { id: 'coverage', label: 'Coverage', icon: ShieldCheck },
  { id: 'history', label: 'History', icon: History },
];

const errorText = (err) => (err?.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : err?.response?.data?.message || 'Please try again.');

function DayToggles({ value, onChange }) {
  const set = new Set(value);
  const toggle = (d) => { const next = new Set(set); if (next.has(d)) next.delete(d); else next.add(d); onChange([...next].sort((a, b) => a - b)); };
  return (
    <div className="flex flex-wrap gap-1.5">
      {DAYS.map(([d, label]) => (
        <button key={d} type="button" onClick={() => toggle(d)} className={clsx('w-12 py-1.5 rounded-lg text-xs font-semibold border transition-colors', set.has(d) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300')}>
          {label}
        </button>
      ))}
    </div>
  );
}

// Automated shift scheduling - one feature, one flow: Rules -> Window -> Publish -> Undo.
// "Run now" and the automatic switch perform the very same run; the switch just does it by itself.
export default function AutomatedSchedulingModal({ isOpen, onClose, employees, shiftDefs, onChanged }) {
  const { toast } = useToast();
  const [tab, setTab] = useState('schedule');
  const rules = useApiData(() => shiftService.getRules(), []);
  const batches = useApiData(() => shiftService.getBatches(), []);
  const data = rules.data;

  const departments = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(), [employees]);
  const changed = () => { rules.refresh(); batches.refresh(); onChanged?.(); };
  const fail = (err, title) => toast.error(title, errorText(err));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Automated Shift Scheduling" size="xl">
      <div className="flex flex-wrap gap-1.5 mb-5 border-b border-gray-100 pb-3">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={clsx('inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors', tab === t.id ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50')}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {rules.loading && !data ? <p className="text-sm text-gray-400 py-10 text-center">Loading...</p> : rules.error ? <p className="text-sm text-red-500 py-10 text-center">{rules.error}</p> : (
        <>
          {tab === 'schedule' && <ScheduleTab automation={data.automation} shiftDefs={shiftDefs} onSaved={changed} fail={fail} toast={toast} goTo={setTab} />}
          {tab === 'workdays' && <WorkDaysTab automation={data.automation} patterns={data.patterns} employees={employees} departments={departments} onSaved={changed} fail={fail} toast={toast} />}
          {tab === 'holidays' && <HolidaysTab holidays={data.holidays} onSaved={changed} fail={fail} toast={toast} />}
          {tab === 'coverage' && <CoverageTab coverage={data.coverage} departments={departments} employees={employees} onSaved={changed} fail={fail} toast={toast} />}
          {tab === 'history' && <HistoryTab batches={batches.data || []} loading={batches.loading} onSaved={changed} fail={fail} toast={toast} />}
        </>
      )}
    </Modal>
  );
}

// The four steps, always visible, so the flow can be read (and explained) at a glance.
function FlowStrip({ window: mode, goTo }) {
  const steps = [
    { icon: ListChecks, title: 'Rules', text: 'Work days, holidays, approved leave, coverage', onClick: () => goTo('workdays') },
    { icon: CalendarRange, title: 'Window', text: `Keep ${WINDOW_TEXT[mode]} scheduled` },
    { icon: Send, title: 'Publish', text: 'Preview, then create the shifts' },
    { icon: Undo2, title: 'Undo', text: 'Any week, from History', onClick: () => goTo('history') },
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
      {steps.map((s, i) => {
        const Tag = s.onClick ? 'button' : 'div';
        return (
          <Tag key={s.title} type={s.onClick ? 'button' : undefined} onClick={s.onClick} className={clsx('relative rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-left', s.onClick && 'hover:border-blue-300 hover:bg-blue-50/40 transition-colors')}>
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">{i + 1}</span>
              <s.icon className="w-4 h-4 text-blue-600" />
              <span className="text-sm font-bold text-gray-900">{s.title}</span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{s.text}</p>
            {i < steps.length - 1 && <ChevronRight className="hidden lg:block absolute -right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-300" />}
          </Tag>
        );
      })}
    </div>
  );
}

function weekLabel(w) {
  return `Week of ${formatDate(w.weekStart)}`;
}

const STATUS = {
  past: { icon: CircleDashed, iconClass: 'text-gray-200', badge: 'default', text: () => 'Passed' },
  scheduled: { icon: CheckCircle2, iconClass: 'text-emerald-500', badge: 'success', text: (w) => `Scheduled · ${w.shifts} shift${w.shifts === 1 ? '' : 's'}` },
  partly: { icon: CircleDashed, iconClass: 'text-amber-500', badge: 'warning', text: (w, auto) => (auto ? 'Partly scheduled · rest within the hour' : 'Partly scheduled · Run now to finish') },
  undone: { icon: Undo2, iconClass: 'text-amber-500', badge: 'warning', text: (w) => `Undone · ${w.shifts} shift${w.shifts === 1 ? '' : 's'} left · Run now to refill` },
  not_scheduled: { icon: CircleDashed, iconClass: 'text-gray-300', badge: 'default', text: (w, auto) => (auto ? 'Scheduled within the hour' : 'Not scheduled yet') },
};

function ScheduleTab({ automation, shiftDefs, onSaved, fail, toast, goTo }) {
  const saved = { autoEnabled: automation.autoEnabled, window: automation.window, shiftId: automation.shiftId || '' };
  const [form, setForm] = useState(saved);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const dirty = form.autoEnabled !== saved.autoEnabled || form.window !== saved.window || form.shiftId !== saved.shiftId;
  const [chosenFrom, chosenTo] = windowRange(form.window);

  const save = async () => {
    setSaving(true);
    try {
      await shiftService.saveAutomation({ ...form, shiftId: form.shiftId || null, defaultWorkDays: automation.defaultWorkDays });
      toast.success('Saved', form.autoEnabled
        ? `Automatic is ON: ${WINDOW_TEXT[form.window]} (${formatDate(chosenFrom)} – ${formatDate(chosenTo)}) will be kept scheduled.`
        : 'Automatic is OFF: nothing is scheduled until you press Run now.');
      setPreview(null);
      onSaved();
    } catch (err) { fail(err, 'Could not save'); }
    setSaving(false);
  };

  const runPreview = async () => {
    setBusy(true);
    try { setPreview(await shiftService.runAutomation(true)); } catch (err) { fail(err, 'Could not prepare the schedule'); }
    setBusy(false);
  };

  const publish = async () => {
    setBusy(true);
    try {
      const t = (await shiftService.runAutomation(false))?.totals || {};
      toast.success('Schedule published', `${t.created ?? 0} shift${t.created === 1 ? '' : 's'} created across ${t.weeks ?? 0} week${t.weeks === 1 ? '' : 's'}.`);
      setPreview(null);
      onSaved();
    } catch (err) { fail(err, 'Could not publish'); }
    setBusy(false);
  };

  const shiftDef = (shiftDefs || []).find((d) => d.id === automation.shiftId);
  const shiftName = shiftDef ? `${shiftDef.name} (${formatTime(shiftDef.startTime)} – ${formatTime(shiftDef.endTime)})` : 'the standard shift';
  const hasOpenDays = automation.weeks.some((w) => w.status !== 'past');

  return (
    <div className="space-y-5">
      <FlowStrip window={saved.window} goTo={goTo} />

      {/* Settings */}
      <div className="rounded-2xl border border-gray-200 p-5 space-y-4">
        <div className="flex items-start gap-4">
          <label className="relative inline-flex items-center cursor-pointer mt-0.5">
            <input type="checkbox" checked={form.autoEnabled} onChange={(e) => setForm({ ...form, autoEnabled: e.target.checked })} className="sr-only peer" />
            <span className="w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5" />
          </label>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900">Automatic: {form.autoEnabled ? <span className="text-emerald-600">ON</span> : <span className="text-gray-500">OFF</span>}</p>
            <p className="text-sm text-gray-600 mt-1">
              {form.autoEnabled
                ? 'The system runs this schedule by itself: every hour it schedules any day in the window not scheduled yet. A new week or month is scheduled just after midnight on its first day. Days already scheduled, by you or by the system, are left alone.'
                : 'Nothing happens by itself. Press Run now whenever you want the window scheduled. It is the same run the automatic switch would do.'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <span className="text-[13px] font-medium text-gray-700 block mb-1.5">Keep scheduled</span>
            <div className="inline-flex rounded-xl border border-gray-200 p-1 bg-gray-50">
              {WINDOWS.map(([mode, label]) => (
                <button key={mode} type="button" onClick={() => setForm({ ...form, window: mode })} className={clsx('px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors', form.window === mode ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-1.5">
              <span className="font-semibold text-gray-700">{formatDate(chosenFrom)} – {formatDate(chosenTo)}</span> ({WINDOW_TEXT[form.window]}; weeks run Monday to Sunday).
              {' '}Days that have already started are never filled.
            </p>
          </div>
          <Select label="Shift to schedule" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
            <option value="">Standard shift (default)</option>
            {(shiftDefs || []).map((d) => <option key={d.id} value={d.id}>{d.name} ({formatTime(d.startTime)} – {formatTime(d.endTime)})</option>)}
          </Select>
        </div>
        <p className="text-xs text-gray-400">Settings apply to the days scheduled from now on. Approved leave, holidays and deactivated employees also update days already scheduled, by themselves.</p>

        <div className="flex items-center justify-end gap-2">
          {dirty && <Button variant="ghost" onClick={() => setForm(saved)}>Discard</Button>}
          <Button icon={Save} loading={saving} disabled={!dirty} onClick={save}>Save settings</Button>
        </div>
      </div>

      {/* The window, week by week */}
      <div className="rounded-2xl border border-gray-200">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div>
            <p className="text-sm font-bold text-gray-900">{WINDOWS.find(([m]) => m === saved.window)?.[1]}: {formatDate(automation.range.from)} – {formatDate(automation.range.to)}</p>
            <p className="text-xs text-gray-500">Everyone active, on their work days, with {shiftName}. Open from {formatDate(automation.firstOpenDay)}.</p>
          </div>
          {!preview && (
            <Button icon={Play} loading={busy} disabled={dirty || !hasOpenDays} onClick={runPreview} title={dirty ? 'Save your settings first' : !hasOpenDays ? 'Every day of this period has already started' : undefined}>Run now</Button>
          )}
        </div>
        <ul className="divide-y divide-gray-50">
          {automation.weeks.map((w) => {
            const st = STATUS[w.status] || STATUS.not_scheduled;
            const Icon = st.icon;
            return (
              <li key={w.from} className={clsx('flex items-center gap-3 px-5 py-2.5', w.status === 'past' && 'opacity-60')}>
                <Icon className={clsx('w-4 h-4 shrink-0', st.iconClass)} />
                <span className="text-sm font-medium text-gray-800 w-40 shrink-0">{weekLabel(w)}</span>
                <span className="text-xs text-gray-400 flex-1">
                  {formatDate(w.from)} – {formatDate(w.to)}
                  {w.openFrom && w.openFrom !== w.from && <span className="text-gray-500"> · open from {formatDate(w.openFrom)}</span>}
                </span>
                <Badge variant={st.badge} size="xs">{st.text(w, saved.autoEnabled)}</Badge>
              </li>
            );
          })}
        </ul>
        {!hasOpenDays && <p className="px-5 pb-3 text-xs text-gray-500">Every day of this period has already started, so there is nothing left to schedule. Choose 2 weeks or Next month to plan ahead.</p>}
        {dirty && <p className="px-5 pb-3 text-xs text-amber-600">Save your settings first; Run now uses the saved ones.</p>}
      </div>

      {/* Preview of Run now: nothing is saved until Publish */}
      {preview && (
        <div className="rounded-2xl border-2 border-blue-200 bg-blue-50/40 p-5 space-y-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">Preview · nothing saved yet</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{preview.totals.created} <span className="text-base font-semibold text-gray-600">new shift{preview.totals.created === 1 ? '' : 's'}</span></p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setPreview(null)} disabled={busy}>Cancel</Button>
              <Button icon={Send} loading={busy} onClick={publish}>Publish</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[['Already scheduled', preview.totals.skippedExisting], ['On approved leave', preview.totals.skippedOnLeave], ['Holidays', preview.totals.skippedHoliday], ['Day off (work days)', preview.totals.skippedOffDay]].map(([label, n]) => (
              <div key={label} className="rounded-xl bg-white border border-gray-100 p-3">
                <p className="text-[11px] text-gray-400">Skipped: {label}</p>
                <p className="text-lg font-bold text-gray-800 tabular-nums">{n}</p>
              </div>
            ))}
          </div>
          <ul className="rounded-xl bg-white border border-gray-100 divide-y divide-gray-50">
            {preview.weeks.map((w) => (
              <li key={`${w.startDate}-${w.newcomersOnly ? "new" : "all"}`} className="px-4 py-2 flex items-center gap-3 text-sm">
                <span className="font-medium text-gray-800 w-40 shrink-0">{weekLabel(w)}</span>
                <span className="text-xs text-gray-400 flex-1">{formatDate(w.startDate)} – {formatDate(w.endDate)}</span>
                <span className="font-semibold text-gray-900 tabular-nums">{w.created} new</span>
              </li>
            ))}
          </ul>
          {preview.weeks.some((w) => w.coverageShortages.length > 0) && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-0.5">
              <p className="font-semibold">Below minimum coverage</p>
              {preview.weeks.flatMap((w) => w.coverageShortages).map((c) => <p key={`${c.date}-${c.department}`}>• {formatDate(c.date)}: {c.department} would have {c.have} scheduled, needs {c.need}</p>)}
            </div>
          )}
          {preview.totals.created === 0 && <p className="text-sm text-gray-500">Nothing new to add: everyone is already scheduled, on leave, or off on those days. Publishing still marks these weeks as done.</p>}
        </div>
      )}
    </div>
  );
}

function WorkDaysTab({ automation, patterns, employees, departments, onSaved, fail, toast }) {
  const [usual, setUsual] = useState(automation.defaultWorkDays || [1, 2, 3, 4, 5]);
  const [scope, setScope] = useState('department');
  const [key, setKey] = useState('');
  const [days, setDays] = useState([1, 2, 3, 4, 5, 6]);
  const nameOf = (id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : id; };
  const usualDirty = daysText(usual) !== daysText(automation.defaultWorkDays);

  const saveUsual = async () => {
    try {
      await shiftService.saveAutomation({ autoEnabled: automation.autoEnabled, window: automation.window, shiftId: automation.shiftId || null, defaultWorkDays: usual });
      toast.success('Saved', `Everyone works ${daysText(usual)} unless an exception below says otherwise. Weeks already scheduled keep their shifts; press Run now to add any new work days to them.`);
      onSaved();
    } catch (err) { fail(err, 'Could not save'); }
  };
  const add = async () => {
    try {
      await shiftService.savePattern({ scope, key, workDays: days });
      toast.success('Pattern saved', `${scope === 'department' ? key : nameOf(key)} works ${daysText(days)}. Weeks already scheduled keep their shifts; press Run now to add any new work days to them.`);
      setKey('');
      onSaved();
    } catch (err) { fail(err, 'Could not save the pattern'); }
  };
  const remove = async (p) => {
    try { await shiftService.deletePattern(p.id); toast.success('Pattern removed', 'They follow everyone\'s days again.'); onSaved(); } catch (err) { fail(err, 'Could not remove it'); }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">Who works which days. A person's own days beat their department's, and a department's beat everyone's. Changes apply to the weeks scheduled from now on; weeks already scheduled keep their shifts.</p>

      <div className="rounded-xl border border-gray-200 p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-800">Everyone (default)</p>
        <DayToggles value={usual} onChange={setUsual} />
        <div className="flex justify-end"><Button icon={Save} disabled={!usualDirty || usual.length === 0} onClick={saveUsual}>Save</Button></div>
      </div>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        {patterns.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">No exceptions yet: everyone works {daysText(automation.defaultWorkDays)}.</p>}
        {patterns.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-3">
            <Badge variant={p.scope === 'department' ? 'primary' : 'purple'} size="xs">{p.scope === 'department' ? 'Department' : 'Employee'}</Badge>
            <span className="text-sm font-semibold text-gray-900 flex-1 truncate">{p.scope === 'department' ? p.scopeKey : nameOf(p.scopeKey)}</span>
            <span className="text-sm text-gray-600">{daysText(p.workDays)}</span>
            <button type="button" onClick={() => remove(p)} aria-label="Remove pattern" className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-gray-200 p-4 space-y-4">
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Plus className="w-4 h-4" /> Add an exception</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Select label="Applies to" value={scope} onChange={(e) => { setScope(e.target.value); setKey(''); }}>
            <option value="department">A whole department</option>
            <option value="employee">One employee</option>
          </Select>
          {scope === 'department' && (
            <Select label="Department" value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">Choose a department...</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          )}
        </div>
        {scope === 'employee' && <EmployeePicker mode="single" employees={employees} value={key} onChange={setKey} listHeight="max-h-44" />}
        <div>
          <span className="text-[13px] font-medium text-gray-700 block mb-1.5">Works these days</span>
          <DayToggles value={days} onChange={setDays} />
        </div>
        <div className="flex justify-end"><Button icon={Save} disabled={!key || days.length === 0} onClick={add}>Save exception</Button></div>
      </div>
    </div>
  );
}

function HolidaysTab({ holidays, onSaved, fail, toast }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [showPast, setShowPast] = useState(false);
  // Today in the company's time zone (not UTC, which is still "yesterday" before 8 AM in Manila)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const shown = holidays.filter((h) => showPast || h.date >= today);

  const add = async () => {
    try {
      const added = await shiftService.addHoliday({ date, name });
      const removed = added?.removedShifts || 0;
      toast.success('Holiday added', removed > 0 ? `${removed} shift${removed === 1 ? '' : 's'} already published for that day ${removed === 1 ? 'was' : 'were'} removed, and the employees were told.` : 'Nobody will be scheduled on that day.');
      setDate(''); setName(''); onSaved();
    } catch (err) { fail(err, 'Could not add the holiday'); }
  };
  const remove = async (h) => {
    try { await shiftService.deleteHoliday(h.id); toast.success('Holiday removed', `${h.name} is a working day again.`); onSaved(); } catch (err) { fail(err, 'Could not remove it'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600">Nobody is scheduled on these days. Adding one also clears shifts already published for it. Edit the list to match your company calendar.</p>
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer"><input type="checkbox" checked={showPast} onChange={(e) => setShowPast(e.target.checked)} className="rounded border-gray-300" /> Show past holidays</label>
      </div>
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-72 overflow-y-auto">
        {shown.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">No upcoming holidays.</p>}
        {shown.map((h) => (
          <div key={h.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-32 text-sm font-medium text-gray-800">{formatDate(h.date)}</span>
            <span className="text-sm text-gray-600 flex-1 truncate">{h.name}</span>
            <button type="button" onClick={() => remove(h)} aria-label={`Remove ${h.name}`} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end">
        <div className="sm:col-span-2"><Input label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="sm:col-span-2"><Input label="Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Company Foundation Day" /></div>
        <Button icon={Plus} disabled={!date || !name.trim()} onClick={add}>Add</Button>
      </div>
    </div>
  );
}

function CoverageTab({ coverage, departments, employees, onSaved, fail, toast }) {
  const current = useMemo(() => Object.fromEntries(coverage.map((c) => [c.department, c.minStaff])), [coverage]);
  const [edits, setEdits] = useState({});
  const headcount = (d) => employees.filter((e) => e.department === d && e.status === 'Active').length;

  const save = async (d) => {
    try {
      await shiftService.saveCoverage({ department: d, minStaff: Number(edits[d] ?? 0) });
      toast.success('Coverage saved', Number(edits[d]) > 0 ? `${d} needs at least ${edits[d]} scheduled each working day.` : `${d} no longer has a minimum.`);
      setEdits((e) => { const next = { ...e }; delete next[d]; return next; });
      onSaved();
    } catch (err) { fail(err, 'Could not save'); }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">The fewest people a department needs scheduled on a working day. When a run would leave a day below it, you get a warning. Leave it at 0 for no rule.</p>
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-80 overflow-y-auto">
        {departments.map((d) => {
          const value = edits[d] ?? current[d] ?? 0;
          const dirty = edits[d] !== undefined && Number(edits[d]) !== (current[d] ?? 0);
          return (
            <div key={d} className="flex items-center gap-3 px-4 py-2.5">
              <Users className="w-4 h-4 text-gray-300" />
              <span className="text-sm font-medium text-gray-800 flex-1">{d}</span>
              <span className="text-xs text-gray-400">{headcount(d)} active</span>
              <input type="number" min={0} max={500} value={value} onChange={(e) => setEdits({ ...edits, [d]: e.target.value })} aria-label={`Minimum staff for ${d}`} className="w-20 px-2.5 py-1.5 text-sm border border-gray-200 rounded-lg text-right focus:outline-none focus:ring-2 focus:ring-blue-500/30" />
              <Button size="sm" variant={dirty ? 'primary' : 'outline'} disabled={!dirty} onClick={() => save(d)}>Save</Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 'restored' = people put back after a leave was withdrawn, an employee was reactivated or a holiday was removed.
const SOURCE_LABEL = { automatic: ['Automatic', 'info'], 'run-now': ['Run now', 'primary'], restored: ['Restored', 'success'] };

function HistoryTab({ batches, loading, onSaved, fail, toast }) {
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  const undo = async (b) => {
    setBusy(true);
    try {
      const res = await shiftService.undoBatch(b.id);
      toast.success('Week undone', `${res?.summary?.removed ?? 0} shift(s) removed${res?.summary?.kept ? `; ${res.summary.kept} on days that already passed were kept` : ''}.`);
      setConfirming(null);
      onSaved();
    } catch (err) { fail(err, 'Could not undo'); }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">One entry per week, whether you pressed Run now or the automatic switch did it. Undoing a week removes its shifts from tomorrow on (today and earlier stay) and tells the employees. An undone week is not refilled automatically; press Run now to fill it again.</p>
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {loading && <p className="px-4 py-6 text-sm text-gray-400 text-center">Loading...</p>}
        {!loading && batches.length === 0 && <p className="px-4 py-8 text-sm text-gray-400 text-center">Nothing has been scheduled yet.</p>}
        {batches.map((b) => {
          const [label, variant] = SOURCE_LABEL[b.source] || ['By an admin', 'default'];
          return (
            <div key={b.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xs text-gray-400 w-14">{b.id}</span>
              <Badge variant={variant} size="xs">{label}</Badge>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-medium text-gray-900">{formatDate(b.startDate)} – {formatDate(b.endDate)}</p>
                <p className="text-xs text-gray-500">{b.createdCount > 0 ? `${b.createdCount} shift${b.createdCount === 1 ? '' : 's'}` : 'No new shifts needed'} · {b.createdBy || 'System'}</p>
              </div>
              {b.status === 'Undone' ? (
                <Badge variant="default" size="xs">Undone{b.summary?.removed != null ? ` (${b.summary.removed} removed)` : ''}</Badge>
              ) : b.createdCount === 0 ? null : confirming === b.id ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Remove its upcoming shifts?</span>
                  <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>No</Button>
                  <Button size="sm" variant="danger" loading={busy} onClick={() => undo(b)}>Yes, undo</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" icon={Undo2} onClick={() => setConfirming(b.id)}>Undo</Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
