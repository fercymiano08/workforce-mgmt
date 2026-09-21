import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { Bot, CalendarDays, Trash2, Undo2, Plus, ShieldCheck, History, PartyPopper, Users, Save, Wand2, ArrowRight } from 'lucide-react';
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
const FULL_DAYS = { 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday', 7: 'Sunday' };
const hourLabel = (h) => `${((h + 11) % 12) + 1}:00 ${h < 12 ? 'AM' : 'PM'}`;
const daysText = (days) => (days || []).slice().sort((a, b) => a - b).map((d) => DAYS[d - 1][1]).join(', ');

const TABS = [
  { id: 'generate', label: 'Generate', icon: Wand2 },
  { id: 'auto', label: 'Automatic', icon: Bot },
  { id: 'patterns', label: 'Work patterns', icon: CalendarDays },
  { id: 'holidays', label: 'Holidays', icon: PartyPopper },
  { id: 'coverage', label: 'Coverage', icon: ShieldCheck },
  { id: 'history', label: 'History', icon: History },
];

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

// The rules automatic scheduling follows, and the history of what it (and the admins) generated.
export default function ScheduleRulesModal({ isOpen, onClose, employees, shiftDefs, onChanged, onGenerateNow }) {
  const { toast } = useToast();
  const [tab, setTab] = useState('generate');
  const rules = useApiData(() => shiftService.getRules(), []);
  const batches = useApiData(() => shiftService.getBatches(), []);
  const data = rules.data;

  const departments = useMemo(() => [...new Set(employees.map((e) => e.department).filter(Boolean))].sort(), [employees]);
  const changed = () => { rules.refresh(); batches.refresh(); onChanged?.(); };
  const fail = (err, title) => toast.error(title, err?.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : err?.response?.data?.message || 'Please try again.');

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Automated Shift Assign" size="xl">
      <div className="flex flex-wrap gap-1.5 mb-5 border-b border-gray-100 pb-3">
        {TABS.map((t) => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)} className={clsx('inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold transition-colors', tab === t.id ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50')}>
            <t.icon className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {rules.loading && !data ? <p className="text-sm text-gray-400 py-10 text-center">Loading the rules...</p> : rules.error ? <p className="text-sm text-red-500 py-10 text-center">{rules.error}</p> : (
        <>
          {tab === 'generate' && <GenerateTab automation={data.automation} batches={batches.data || []} onGenerateNow={onGenerateNow} openAutomatic={() => setTab('auto')} />}
          {tab === 'auto' && <AutomaticTab automation={data.automation} shiftDefs={shiftDefs} batches={batches.data || []} onSaved={changed} fail={fail} toast={toast} />}
          {tab === 'patterns' && <PatternsTab patterns={data.patterns} usual={data.automation.defaultWorkDays} employees={employees} departments={departments} onSaved={changed} fail={fail} toast={toast} />}
          {tab === 'holidays' && <HolidaysTab holidays={data.holidays} onSaved={changed} fail={fail} toast={toast} />}
          {tab === 'coverage' && <CoverageTab coverage={data.coverage} departments={departments} employees={employees} onSaved={changed} fail={fail} toast={toast} />}
          {tab === 'history' && <HistoryTab batches={batches.data || []} loading={batches.loading} onSaved={changed} fail={fail} toast={toast} />}
        </>
      )}
    </Modal>
  );
}

// The front door of automated assigning: do it now, or let the system do it every week.
function GenerateTab({ automation, batches, onGenerateNow, openAutomatic }) {
  const lastAuto = batches.find((b) => b.source === 'automatic');
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
      <div className="rounded-2xl border border-gray-200 p-5 flex flex-col">
        <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mb-4"><Wand2 className="w-5 h-5 text-blue-600" /></div>
        <p className="text-base font-bold text-gray-900">Generate a schedule now</p>
        <p className="text-sm text-gray-500 mt-1.5 flex-1">Pick a date range and choose employees by department and role. You see exactly what will be created, and what is skipped and why, before anything is saved.</p>
        <Button className="mt-5 self-start" icon={ArrowRight} onClick={onGenerateNow}>Start</Button>
      </div>
      <div className={clsx('rounded-2xl border p-5 flex flex-col', automation.autoEnabled ? 'border-emerald-200 bg-emerald-50/50' : 'border-gray-200')}>
        <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center mb-4', automation.autoEnabled ? 'bg-emerald-100' : 'bg-gray-100')}><Bot className={clsx('w-5 h-5', automation.autoEnabled ? 'text-emerald-600' : 'text-gray-500')} /></div>
        <p className="text-base font-bold text-gray-900">Automatic weekly scheduling: {automation.autoEnabled ? 'ON' : 'OFF'}</p>
        <p className="text-sm text-gray-500 mt-1.5 flex-1">
          {automation.autoEnabled
            ? `The system prepares the next ${automation.weeksAhead} week${automation.weeksAhead === 1 ? '' : 's'} by itself every ${FULL_DAYS[automation.runDay]} at ${hourLabel(automation.runHour)}.${lastAuto ? ` Last run: ${formatDate(lastAuto.startDate)} – ${formatDate(lastAuto.endDate)}.` : ''}`
            : 'Switch it on and the system prepares each coming week for you, skipping holidays and approved leave. You review and can undo it.'}
        </p>
        <Button className="mt-5 self-start" variant="outline" onClick={openAutomatic}>{automation.autoEnabled ? 'Change settings' : 'Set it up'}</Button>
      </div>
      <p className="md:col-span-2 text-xs text-gray-400">To give <strong>one person</strong> a shift by hand, close this window and use <strong>Standard Shift Assign</strong>. The tabs above hold the rules the automation follows: work patterns, holidays, coverage, and the history you can undo.</p>
    </div>
  );
}

function AutomaticTab({ automation, shiftDefs, batches, onSaved, fail, toast }) {
  const [form, setForm] = useState({
    autoEnabled: automation.autoEnabled, runDay: automation.runDay, runHour: automation.runHour, weeksAhead: automation.weeksAhead,
    defaultWorkDays: automation.defaultWorkDays || [1, 2, 3, 4, 5], shiftId: automation.shiftId || '',
  });
  const [saving, setSaving] = useState(false);
  const lastAuto = batches.find((b) => b.source === 'automatic');

  const save = async () => {
    setSaving(true);
    try {
      await shiftService.saveAutomation({ ...form, shiftId: form.shiftId || null });
      toast.success('Saved', form.autoEnabled ? `Next week's schedule will be prepared every ${FULL_DAYS[form.runDay]} at ${hourLabel(form.runHour)}.` : 'Automatic scheduling is off.');
      onSaved();
    } catch (err) { fail(err, 'Could not save'); }
    setSaving(false);
  };

  return (
    <div className="space-y-6">
      <div className={clsx('rounded-2xl border p-5 flex items-start gap-4', form.autoEnabled ? 'bg-emerald-50/60 border-emerald-200' : 'bg-gray-50 border-gray-200')}>
        <label className="relative inline-flex items-center cursor-pointer mt-0.5">
          <input type="checkbox" checked={form.autoEnabled} onChange={(e) => setForm({ ...form, autoEnabled: e.target.checked })} className="sr-only peer" />
          <span className="w-11 h-6 bg-gray-300 rounded-full peer-checked:bg-emerald-500 transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-5" />
        </label>
        <div className="min-w-0">
          <p className="text-sm font-bold text-gray-900">{form.autoEnabled ? 'Automatic scheduling is ON' : 'Automatic scheduling is OFF'}</p>
          <p className="text-sm text-gray-600 mt-1">The system prepares the coming week by itself: every active employee, on their work days, skipping holidays, approved leave and shifts that already exist. You get a summary and can undo it.</p>
          {lastAuto && <p className="text-xs text-gray-500 mt-2">Last automatic run: {formatDate(lastAuto.startDate)} – {formatDate(lastAuto.endDate)}, {lastAuto.createdCount} shifts ({lastAuto.status}).</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Select label="Runs every" value={form.runDay} onChange={(e) => setForm({ ...form, runDay: Number(e.target.value) })}>
          {DAYS.map(([d]) => <option key={d} value={d}>{FULL_DAYS[d]}</option>)}
        </Select>
        <Select label="At (Manila time)" value={form.runHour} onChange={(e) => setForm({ ...form, runHour: Number(e.target.value) })}>
          {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
        </Select>
        <Select label="Prepares the next" value={form.weeksAhead} onChange={(e) => setForm({ ...form, weeksAhead: Number(e.target.value) })}>
          {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} week{n === 1 ? '' : 's'}</option>)}
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <span className="text-[13px] font-medium text-gray-700 block mb-1.5">Usual work days (for everyone without their own pattern)</span>
          <DayToggles value={form.defaultWorkDays} onChange={(days) => setForm({ ...form, defaultWorkDays: days })} />
        </div>
        <Select label="Shift to schedule" value={form.shiftId} onChange={(e) => setForm({ ...form, shiftId: e.target.value })}>
          <option value="">Standard shift (default)</option>
          {(shiftDefs || []).map((d) => <option key={d.id} value={d.id}>{d.name} ({formatTime(d.startTime)} – {formatTime(d.endTime)})</option>)}
        </Select>
      </div>

      <div className="flex justify-end">
        <Button icon={Save} loading={saving} disabled={form.defaultWorkDays.length === 0} onClick={save}>Save</Button>
      </div>
    </div>
  );
}

function PatternsTab({ patterns, usual, employees, departments, onSaved, fail, toast }) {
  const [scope, setScope] = useState('department');
  const [key, setKey] = useState('');
  const [days, setDays] = useState([1, 2, 3, 4, 5, 6]);
  const nameOf = (id) => { const e = employees.find((x) => x.id === id); return e ? `${e.firstName} ${e.lastName}` : id; };

  const add = async () => {
    try {
      await shiftService.savePattern({ scope, key, workDays: days });
      toast.success('Pattern saved', `${scope === 'department' ? key : nameOf(key)} works ${daysText(days)}.`);
      setKey('');
      onSaved();
    } catch (err) { fail(err, 'Could not save the pattern'); }
  };
  const remove = async (p) => {
    try { await shiftService.deletePattern(p.id); toast.success('Pattern removed', 'They follow the usual days again.'); onSaved(); } catch (err) { fail(err, 'Could not remove it'); }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-600">Everyone works the usual days (<strong>{daysText(usual)}</strong>) unless they have a pattern. A person's own pattern beats their department's.</p>

      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
        {patterns.length === 0 && <p className="px-4 py-6 text-sm text-gray-400 text-center">No patterns yet: everyone follows the usual days.</p>}
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
        <p className="text-sm font-semibold text-gray-800 flex items-center gap-2"><Plus className="w-4 h-4" /> Add or change a pattern</p>
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
        <div className="flex justify-end"><Button icon={Save} disabled={!key || days.length === 0} onClick={add}>Save pattern</Button></div>
      </div>
    </div>
  );
}

function HolidaysTab({ holidays, onSaved, fail, toast }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [showPast, setShowPast] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const shown = holidays.filter((h) => showPast || h.date >= today);

  const add = async () => {
    try { await shiftService.addHoliday({ date, name }); toast.success('Holiday added', 'Nobody will be scheduled on that day.'); setDate(''); setName(''); onSaved(); } catch (err) { fail(err, 'Could not add the holiday'); }
  };
  const remove = async (h) => {
    try { await shiftService.deleteHoliday(h.id); toast.success('Holiday removed', `${h.name} is a working day again.`); onSaved(); } catch (err) { fail(err, 'Could not remove it'); }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-gray-600">Nobody is scheduled on these days, by hand-generation or automatically. Edit the list to match your company calendar.</p>
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
      <p className="text-sm text-gray-600">The fewest people a department needs scheduled on a working day. When a generated schedule would leave a day below it, you get a warning. Leave it at 0 for no rule.</p>
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

function HistoryTab({ batches, loading, onSaved, fail, toast }) {
  const [confirming, setConfirming] = useState(null);
  const [busy, setBusy] = useState(false);

  const undo = async (b) => {
    setBusy(true);
    try {
      const res = await shiftService.undoBatch(b.id);
      toast.success('Generation undone', `${res?.summary?.removed ?? 0} shift(s) removed${res?.summary?.kept ? `; ${res.summary.kept} on days that already passed were kept` : ''}.`);
      setConfirming(null);
      onSaved();
    } catch (err) { fail(err, 'Could not undo'); }
    setBusy(false);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-600">Every generation, by an admin or by the automatic job. Undoing one removes the shifts it created that have not happened yet, and tells the employees.</p>
      <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-96 overflow-y-auto">
        {loading && <p className="px-4 py-6 text-sm text-gray-400 text-center">Loading...</p>}
        {!loading && batches.length === 0 && <p className="px-4 py-8 text-sm text-gray-400 text-center">Nothing has been generated yet.</p>}
        {batches.map((b) => (
          <div key={b.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
            <span className="font-mono text-xs text-gray-400 w-14">{b.id}</span>
            <Badge variant={b.source === 'automatic' ? 'info' : 'default'} size="xs">{b.source === 'automatic' ? 'Automatic' : 'By an admin'}</Badge>
            <div className="flex-1 min-w-[180px]">
              <p className="text-sm font-medium text-gray-900">{formatDate(b.startDate)} – {formatDate(b.endDate)}</p>
              <p className="text-xs text-gray-500">{b.createdCount} shifts · {b.createdBy || 'System'}</p>
            </div>
            {b.status === 'Undone' ? (
              <Badge variant="default" size="xs">Undone{b.summary?.removed != null ? ` (${b.summary.removed} removed)` : ''}</Badge>
            ) : confirming === b.id ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600">Remove its upcoming shifts?</span>
                <Button size="sm" variant="outline" onClick={() => setConfirming(null)}>No</Button>
                <Button size="sm" variant="danger" loading={busy} onClick={() => undo(b)}>Yes, undo</Button>
              </div>
            ) : (
              <Button size="sm" variant="outline" icon={Undo2} onClick={() => setConfirming(b.id)}>Undo</Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
