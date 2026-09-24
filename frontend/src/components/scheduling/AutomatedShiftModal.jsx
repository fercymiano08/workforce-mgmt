import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  Bot, CalendarRange, Clock, ClipboardCheck, PartyPopper, ChevronLeft, ChevronRight, ArrowLeft, ArrowRight,
  CheckCircle2, Pencil, TriangleAlert, Users, Sparkles, Palmtree, Hourglass, Scale, CalendarOff, Info,
} from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input, { Select } from '../ui/Input';
import { shiftService } from '../../services/api';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatTime } from '../../utils/helpers';

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const STEPS = [
  { id: 'period', label: 'Period', icon: CalendarRange },
  { id: 'shift', label: 'Requirement', icon: Clock },
  { id: 'review', label: 'Review', icon: ClipboardCheck },
  { id: 'done', label: 'Done', icon: PartyPopper },
];

// Today in Manila as a UTC-midnight Date, so day arithmetic never shifts with the viewer's time zone.
function manilaToday() {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date()).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
const iso = (date) => date.toISOString().slice(0, 10);
const plusDays = (date, n) => new Date(date.getTime() + n * 86400000);
const tomorrow = () => iso(plusDays(manilaToday(), 1));
// The first Monday after today: the natural start of a schedule (weeks run Monday to Sunday)
const nextMonday = () => { const t = manilaToday(); return iso(plusDays(t, 7 - ((t.getUTCDay() + 6) % 7))); };
const isoWeekday = (dateKey) => { const [y, m, d] = dateKey.split('-').map(Number); return ((new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7) + 1; };
const dayLabel = (dateKey) => ({ weekday: DAYS[isoWeekday(dateKey) - 1][1], num: Number(dateKey.slice(8)) });
const errorText = (err) => (err?.response?.data?.errors ? Object.values(err.response.data.errors).flat()[0] : err?.response?.data?.message || 'Please try again.');
const hoursBetween = (start, end) => { const [a, b] = start.split(':').map(Number); const [c, d] = end.split(':').map(Number); return (c * 60 + d - a * 60 - b) / 60; };
const shortDate = (dateKey) => { const l = dayLabel(dateKey); return `${l.weekday} ${l.num}`; };

const blankForm = () => ({
  startDate: nextMonday(), weeks: 1, workDays: [1, 2, 3, 4, 5, 6],
  required: 5, department: '', position: '', maxWeeklyHours: 48,
});

// Automated shift scheduling: the rules build a draft, HR reviews it and approves it. Nothing is saved until Approve.
// The shift is always the Standard Shift - the only shift the company has.
// Mounted afresh every time it opens, so each run starts on step 1 with nothing left over from the last one
export default function AutomatedShiftModal(props) {
  return props.isOpen ? <AutomatedShiftFlow {...props} /> : null;
}

function AutomatedShiftFlow({ isOpen, onClose, employees, shiftDefs, onChanged }) {
  const { toast } = useToast();
  const [step, setStep] = useState('period');
  const [form, setForm] = useState(blankForm);
  const [draft, setDraft] = useState(null);
  const [cells, setCells] = useState({});       // "employeeId|date" -> 'assigned' (HR's version of the draft; anything absent is not assigned)
  const [editing, setEditing] = useState(false);
  const [weekIndex, setWeekIndex] = useState(0);
  const [result, setResult] = useState(null);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const standard = useMemo(() => (shiftDefs || []).find((s) => s.id === 'SHIFT004') || (shiftDefs || [])[0], [shiftDefs]);
  const departments = useMemo(() => [...new Set((employees || []).map((e) => e.department).filter(Boolean))].sort(), [employees]);
  const positions = useMemo(() => [...new Set((employees || []).filter((e) => !form.department || e.department === form.department).map((e) => e.position).filter(Boolean))].sort(), [employees, form.department]);
  const endDate = useMemo(() => iso(plusDays(new Date(`${form.startDate}T00:00:00Z`), form.weeks * 7 - 1)), [form.startDate, form.weeks]);
  const pool = useMemo(() => (employees || []).filter((e) => e.status !== 'Inactive' && (!form.department || e.department === form.department) && (!form.position || e.position === form.position)), [employees, form.department, form.position]);

  const payload = () => ({
    startDate: form.startDate, weeks: Number(form.weeks), workDays: form.workDays,
    required: Number(form.required), department: form.department || null, position: form.position || null,
    maxWeeklyHours: Number(form.maxWeeklyHours) || undefined,
  });

  const periodProblem = !form.startDate ? 'Pick a start date.'
    : form.startDate < tomorrow() ? 'Pick a start date from tomorrow on. A shift for today is added with Standard Shift Assign.'
      : form.workDays.length === 0 ? 'Pick at least one work day.' : '';
  const requirementProblem = !(Number(form.required) >= 1) ? 'At least 1 employee is required per day.'
    : pool.length === 0 ? 'No employee matches this department and position.' : '';

  const generate = async () => {
    try {
      const data = await shiftService.previewAutomated(payload());
      const next = {};
      data.employees.forEach((e) => Object.entries(e.cells).forEach(([date, c]) => { if (c.state === 'assigned') next[`${e.id}|${date}`] = 'assigned'; }));
      setDraft(data); setCells(next); setEditing(false); setWeekIndex(0); setStep('review');
    } catch (err) {
      toast.error('Could not build the schedule', errorText(err));
    }
  };

  const approve = async () => {
    const assignments = Object.entries(cells).filter(([, v]) => v === 'assigned').map(([k]) => { const [employeeId, date] = k.split('|'); return { employeeId, date }; });
    try {
      const data = await shiftService.approveAutomated({ ...payload(), assignments });
      setResult(data); setStep('done'); onChanged?.();
    } catch (err) {
      toast.error('Schedule not saved', errorText(err));
    }
  };

  const toggleCell = (employeeId, date) => {
    const key = `${employeeId}|${date}`;
    setCells((c) => { const next = { ...c }; if (next[key]) delete next[key]; else next[key] = 'assigned'; return next; });
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Automated Shift Scheduling" size="wide">
      <Stepper step={step} />

      {step === 'period' && (
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-5">
            <p className="text-sm text-gray-500">The system builds a draft from fixed rules. <strong className="text-gray-700">Nothing is saved until you approve it.</strong></p>
            <div className="grid sm:grid-cols-3 gap-4">
              <Input label="Start date" type="date" min={tomorrow()} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} required />
              <Select label="Duration" value={form.weeks} onChange={(e) => set('weeks', Number(e.target.value))}>
                {[1, 2, 3, 4].map((w) => <option key={w} value={w}>{w} week{w === 1 ? '' : 's'}</option>)}
              </Select>
              <div className="flex flex-col gap-1.5">
                <span className="text-[13px] font-medium text-gray-700">End date</span>
                <div className="px-3.5 py-2.5 text-sm rounded-xl border border-gray-100 bg-gray-50 text-gray-700">{form.startDate ? formatDate(endDate) : '—'}</div>
              </div>
            </div>
            <div>
              <span className="text-[13px] font-medium text-gray-700">Work days</span>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {DAYS.map(([d, label]) => {
                  const on = form.workDays.includes(d);
                  return (
                    <button key={d} type="button" onClick={() => set('workDays', on ? form.workDays.filter((x) => x !== d) : [...form.workDays, d].sort((a, b) => a - b))}
                      className={clsx('w-14 py-2 rounded-lg text-xs font-semibold border transition-colors', on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300')}>
                      {label}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-1.5">Holidays are skipped automatically. Weeks run Monday to Sunday.</p>
            </div>
            {periodProblem && form.startDate && <p className="text-sm text-red-600">{periodProblem}</p>}
          </div>
          <PeriodPreview form={form} endDate={endDate} />
          <div className="lg:col-span-5"><Footer>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button icon={ArrowRight} disabled={!!periodProblem} onClick={() => setStep('shift')}>Continue</Button>
          </Footer></div>
        </div>
      )}

      {step === 'shift' && (
        <div className="grid lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-5">
            <p className="text-sm text-gray-500">{formatDate(form.startDate)} – {formatDate(endDate)} · tell the system how many people each day needs.</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Employees required per day" type="number" min={1} value={form.required} onChange={(e) => set('required', e.target.value)} required />
              <Input label="Max paid hours per week, each person" type="number" min={1} max={168} value={form.maxWeeklyHours} onChange={(e) => set('maxWeeklyHours', e.target.value)} />
              <Select label="Department (optional)" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value, position: '' }))}>
                <option value="">All departments</option>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
              </Select>
              <Select label="Position (optional)" value={form.position} onChange={(e) => set('position', e.target.value)}>
                <option value="">All positions</option>
                {positions.map((p) => <option key={p} value={p}>{p}</option>)}
              </Select>
            </div>
            <RulesNote />
            {requirementProblem && <p className="text-sm text-red-600">{requirementProblem}</p>}
          </div>
          <div className="lg:col-span-2 space-y-4">
            <StandardShiftCard shift={standard} />
            <div className={clsx('rounded-xl border p-4', Number(form.required) > pool.length ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50/60')}>
              <div className="flex items-center gap-2 text-sm font-bold text-gray-900"><Users className="w-4 h-4 text-blue-600" /> Who can be picked</div>
              <p className="mt-2 text-3xl font-bold text-gray-900">{pool.length}<span className="ml-1.5 text-sm font-medium text-gray-500">employee{pool.length === 1 ? '' : 's'}</span></p>
              <p className="text-xs text-gray-500 mt-1">
                Active{form.department ? ` in ${form.department}` : ''}{form.position ? ` as ${form.position}` : ''}. Leave, existing shifts and the hours limit are checked day by day on the next screen.
              </p>
              {Number(form.required) > pool.length && pool.length > 0 && (
                <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-amber-800"><TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />You need {form.required} a day but only {pool.length} match: every day will be short.</p>
              )}
            </div>
          </div>
          <div className="lg:col-span-5"><Footer>
            <Button variant="outline" icon={ArrowLeft} onClick={() => setStep('period')}>Back</Button>
            <Button icon={Sparkles} disabled={!!requirementProblem} onClick={generate}>Generate Schedule</Button>
          </Footer></div>
        </div>
      )}

      {step === 'review' && draft && (
        <Review
          draft={draft} cells={cells} editing={editing} weekIndex={weekIndex} setWeekIndex={setWeekIndex}
          onToggleEdit={() => setEditing((v) => !v)} onToggleCell={toggleCell}
          onBack={() => setStep('shift')} onApprove={approve}
        />
      )}

      {step === 'done' && result && (
        <div className="py-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50"><CheckCircle2 className="h-8 w-8 text-emerald-600" /></div>
          <div>
            <h3 className="text-lg font-bold text-gray-900">Schedule approved</h3>
            <p className="text-sm text-gray-500 mt-1 max-w-xl mx-auto">
              {result.created} Standard Shift{result.created === 1 ? '' : 's'} saved for {formatDate(result.startDate)} – {formatDate(result.endDate)}.
              Each employee was notified and will see it in their schedule. You can still change any shift later from the schedule table.
            </p>
          </div>
          {result.skipped?.length > 0 && (
            <div className="mx-auto max-w-lg rounded-xl bg-amber-50 border border-amber-100 p-3 text-left text-sm text-amber-800">
              <p className="font-semibold">{result.skipped.length} assignment{result.skipped.length === 1 ? ' was' : 's were'} skipped because things changed while you reviewed:</p>
              <ul className="mt-1 list-disc pl-5 text-xs">
                {result.skipped.slice(0, 5).map((s) => <li key={`${s.employeeId}${s.date}`}>{s.employeeId} on {formatDate(s.date)}: {s.reason}</li>)}
                {result.skipped.length > 5 && <li>and {result.skipped.length - 5} more</li>}
              </ul>
            </div>
          )}
          <Button onClick={onClose}>Close</Button>
        </div>
      )}
    </Modal>
  );
}

function Stepper({ step }) {
  const at = STEPS.findIndex((s) => s.id === step);
  return (
    <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-1">
      {STEPS.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2">
          <div className={clsx('flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap',
            i === at ? 'bg-blue-600 text-white' : i < at ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-400')}>
            <s.icon className="w-3.5 h-3.5" /> {i + 1}. {s.label}
          </div>
          {i < STEPS.length - 1 && <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />}
        </div>
      ))}
    </div>
  );
}

function Footer({ children }) {
  return <div className="flex justify-between gap-2 pt-4 border-t border-gray-100">{children}</div>;
}

// The period laid out week by week, so the dates that will be scheduled can be seen before anything is generated
function PeriodPreview({ form, endDate }) {
  const weeks = useMemo(() => {
    if (!form.startDate) return [];
    const out = [];
    const first = new Date(`${form.startDate}T00:00:00Z`);
    const last = new Date(`${endDate}T00:00:00Z`);
    let day = first;
    while (day <= last) {
      const monday = plusDays(day, -(isoWeekday(iso(day)) - 1));
      const days = [];
      for (let i = 0; i < 7; i += 1) {
        const d = plusDays(monday, i);
        days.push({ key: iso(d), inPeriod: d >= first && d <= last, weekday: i + 1 });
      }
      out.push({ monday: iso(monday), days });
      day = plusDays(monday, 7);
    }
    return out;
  }, [form.startDate, endDate]);
  const working = weeks.flatMap((w) => w.days).filter((d) => d.inPeriod && form.workDays.includes(d.weekday)).length;

  return (
    <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-gray-50/60 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-gray-900"><CalendarRange className="w-4 h-4 text-blue-600" /> The period, week by week</div>
      <div className="mt-3 space-y-2">
        {weeks.map((w) => (
          <div key={w.monday}>
            <p className="text-[11px] font-semibold text-gray-400 mb-1">Week of {formatDate(w.monday)}</p>
            <div className="grid grid-cols-7 gap-1">
              {w.days.map((d) => {
                const works = d.inPeriod && form.workDays.includes(d.weekday);
                return (
                  <div key={d.key} title={d.key} className={clsx('rounded-md py-1.5 text-center text-[11px] font-semibold', works ? 'bg-blue-600 text-white' : d.inPeriod ? 'bg-gray-200 text-gray-500' : 'bg-white text-gray-300 border border-dashed border-gray-200')}>
                    {DAYS[d.weekday - 1][1]}<div className="text-[10px] font-medium opacity-80">{Number(d.key.slice(8))}</div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-gray-500"><strong className="text-gray-800">{working} working day{working === 1 ? '' : 's'}</strong> before holidays. Grey days are the days off you chose.</p>
    </div>
  );
}

function StandardShiftCard({ shift }) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex items-center gap-2 text-sm font-bold text-gray-900"><Clock className="w-4 h-4 text-blue-600" /> {shift?.name || 'Standard Shift'}</div>
      {shift ? (
        <>
          <p className="mt-2 text-2xl font-bold text-blue-700">{formatTime(shift.startTime)} – {formatTime(shift.endTime)}</p>
          <p className="text-xs text-gray-500 mt-1">{hoursBetween(shift.startTime, shift.endTime)} hours long, minus the unpaid lunch set in Settings.</p>
        </>
      ) : <p className="mt-2 text-sm text-red-600">The Standard Shift is missing.</p>}
      <p className="mt-2 text-xs text-blue-900/70 flex items-start gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />This is the only shift the company works, so it is always the one scheduled. Overtime extends it and is never a shift of its own.</p>
    </div>
  );
}

// The rules, in plain words, so anyone reading the screen can see what "automated" means
function RulesNote() {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5">
      <p className="text-xs font-semibold text-blue-800 flex items-center gap-1.5"><Bot className="w-3.5 h-3.5" /> How the system picks people (rules, not AI)</p>
      <ol className="mt-1.5 text-xs text-blue-900/80 list-decimal pl-5 space-y-0.5">
        <li><strong>Eligible:</strong> active, matches the department and position, not on approved leave, not already scheduled that day, still under the weekly hours limit.</li>
        <li><strong>Fair:</strong> whoever has the fewest shifts so far in this draft goes first.</li>
        <li><strong>Assigned:</strong> the top employees each day, up to the number required. Nobody is booked twice.</li>
      </ol>
    </div>
  );
}

function Review({ draft, cells, editing, weekIndex, setWeekIndex, onToggleEdit, onToggleCell, onBack, onApprove }) {
  const weeks = useMemo(() => {
    const map = new Map();
    draft.days.forEach((d) => { if (!map.has(d.weekStart)) map.set(d.weekStart, []); map.get(d.weekStart).push(d); });
    return [...map.entries()].map(([weekStart, days]) => ({ weekStart, days }));
  }, [draft]);
  const week = weeks[Math.min(weekIndex, weeks.length - 1)] || { days: [] };
  const workingDays = draft.days.filter((d) => !d.holiday);

  const assignedOn = (date) => draft.employees.filter((e) => cells[`${e.id}|${date}`]).length;
  const total = Object.keys(cells).length;
  const shiftsOf = (e, days) => days.filter((d) => cells[`${e.id}|${d.date}`]).length;
  const perPerson = draft.employees.map((e) => shiftsOf(e, draft.days));
  const shortDays = workingDays.filter((d) => assignedOn(d.date) < draft.required);
  const hours = draft.shift.hours;
  // Hours already scheduled that week outside this draft are not known here, so this only checks the draft's own shifts
  const overLimit = draft.employees.filter((e) => weeks.some((w) => shiftsOf(e, w.days) * hours > draft.maxWeeklyHours + 1e-9));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat icon={Users} label="Eligible employees" value={draft.eligibleEmployees} />
        <Stat icon={ClipboardCheck} label="Needed per day" value={draft.required} />
        <Stat icon={CalendarRange} label="Working days" value={workingDays.length} />
        <Stat icon={CheckCircle2} label="Total assignments" value={total} tone="blue" />
        <Stat icon={Hourglass} label="Paid hours" value={`${Math.round(total * hours * 10) / 10}h`} />
      </div>
      <p className="text-xs text-gray-500">
        <strong className="text-gray-700">{draft.shift.name}</strong> · {formatTime(draft.shift.startTime)} – {formatTime(draft.shift.endTime)} ({hours}h paid)
        {draft.department ? ` · ${draft.department}` : ''}{draft.position ? ` · ${draft.position}` : ''} · max {draft.maxWeeklyHours}h a week each
      </p>

      {draft.eligibleEmployees === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center text-sm text-amber-800">
          No employee matches this department and position. Go back and widen the filter.
        </div>
      ) : (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
          <div className="space-y-3 min-w-0">
            {weeks.length > 1 && (
              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" icon={ChevronLeft} disabled={weekIndex === 0} onClick={() => setWeekIndex(weekIndex - 1)}>Previous week</Button>
                <span className="text-sm font-semibold text-gray-700">Week of {formatDate(week.weekStart)} <span className="text-gray-400 font-normal">({weekIndex + 1} of {weeks.length})</span></span>
                <Button variant="outline" size="sm" disabled={weekIndex >= weeks.length - 1} onClick={() => setWeekIndex(weekIndex + 1)}>Next week <ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}

            <div className="overflow-auto rounded-xl border border-gray-200 max-h-[52vh]">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 z-10 bg-gray-50">
                  <tr>
                    <th className="text-left font-semibold text-gray-600 px-3 py-2.5 min-w-[176px]">Employee</th>
                    {week.days.map((d) => {
                      const l = dayLabel(d.date);
                      return (
                        <th key={d.date} className="text-center font-semibold text-gray-600 px-1.5 py-2.5 min-w-[100px]">
                          {l.weekday} <span className="text-gray-400 font-normal">{l.num}</span>
                          {d.holiday && <div className="text-[10px] font-medium text-purple-600 truncate max-w-[100px] mx-auto" title={d.holiday}>{d.holiday}</div>}
                          {!d.holiday && <div className={clsx('text-[10px] font-medium', assignedOn(d.date) < draft.required ? 'text-amber-600' : 'text-emerald-600')}>{assignedOn(d.date)} / {draft.required}</div>}
                        </th>
                      );
                    })}
                    <th className="text-center font-semibold text-gray-600 px-2 py-2.5" title="Shifts this week">Week</th>
                    <th className="text-center font-semibold text-gray-600 px-2 py-2.5" title="Shifts in the whole period">Total</th>
                    <th className="text-center font-semibold text-gray-600 px-2 py-2.5" title="Paid hours in the whole period">Hours</th>
                  </tr>
                </thead>
                <tbody>
                  {draft.employees.map((e) => {
                    const mine = shiftsOf(e, draft.days);
                    return (
                      <tr key={e.id} className="border-t border-gray-100">
                        <td className="px-3 py-2">
                          <div className="font-medium text-gray-900 leading-tight">{e.name}</div>
                          <div className="text-[11px] text-gray-400">{[e.department, e.position].filter(Boolean).join(' · ')}</div>
                        </td>
                        {week.days.map((d) => (
                          <td key={d.date} className="px-1.5 py-1.5 text-center">
                            <Cell employee={e} day={d} assigned={!!cells[`${e.id}|${d.date}`]} shiftName={draft.shift.name} editing={editing} onToggle={onToggleCell} />
                          </td>
                        ))}
                        <td className="px-2 py-2 text-center font-semibold text-gray-700">{shiftsOf(e, week.days)}</td>
                        <td className="px-2 py-2 text-center font-semibold text-gray-700">{mine}</td>
                        <td className="px-2 py-2 text-center text-gray-500">{Math.round(mine * hours * 10) / 10}h</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-500">
              <span><i className="inline-block w-2.5 h-2.5 rounded bg-blue-600 mr-1 align-middle" />Assigned</span>
              <span><i className="inline-block w-2.5 h-2.5 rounded bg-amber-200 mr-1 align-middle" />On approved leave</span>
              <span><i className="inline-block w-2.5 h-2.5 rounded bg-gray-300 mr-1 align-middle" />Already has a shift</span>
              <span><i className="inline-block w-2.5 h-2.5 rounded bg-rose-200 mr-1 align-middle" />Weekly hours limit reached</span>
              <span><i className="inline-block w-2.5 h-2.5 rounded border border-gray-300 mr-1 align-middle" />Not needed that day</span>
            </div>
          </div>

          <aside className="space-y-3">
            <Panel icon={Scale} title="Fairness">
              <p className="text-sm text-gray-700">Each person works between <strong>{Math.min(...perPerson)}</strong> and <strong>{Math.max(...perPerson)}</strong> shifts in this period.</p>
              <p className="text-xs text-gray-400 mt-1">{Math.max(...perPerson) - Math.min(...perPerson) <= 1 ? 'Shared as evenly as the days allow.' : 'Uneven: leave, existing shifts or your edits shifted the load.'}</p>
              {overLimit.length > 0 && <p className="text-xs text-rose-600 mt-1.5">{overLimit.length} person{overLimit.length === 1 ? '' : 's'} over {draft.maxWeeklyHours}h in a week after your edits.</p>}
            </Panel>

            <Panel icon={CalendarRange} title="Coverage by day">
              <ul className="space-y-1.5 max-h-52 overflow-auto pr-1">
                {draft.days.map((d) => {
                  const n = d.holiday ? 0 : assignedOn(d.date);
                  return (
                    <li key={d.date} className="flex items-center gap-2 text-xs">
                      <span className="w-14 shrink-0 font-medium text-gray-600">{shortDate(d.date)}</span>
                      {d.holiday ? <span className="text-purple-600 truncate">{d.holiday}: no shifts</span> : (
                        <>
                          <span className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden"><span className={clsx('block h-full rounded-full', n < draft.required ? 'bg-amber-400' : 'bg-emerald-500')} style={{ width: `${Math.min(100, (n / draft.required) * 100)}%` }} /></span>
                          <span className={clsx('w-9 text-right font-semibold', n < draft.required ? 'text-amber-600' : 'text-emerald-600')}>{n}/{draft.required}</span>
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
              {shortDays.length > 0 && <p className="mt-2 text-xs text-amber-700 flex items-start gap-1.5"><TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-0.5" />{shortDays.length} day{shortDays.length === 1 ? ' is' : 's are'} short: not enough people were eligible.</p>}
            </Panel>

            <Panel icon={CalendarOff} title="Why some people are not scheduled">
              <Reason color="amber" label="On approved leave" items={draft.notes.onLeave} />
              <Reason color="rose" label="Weekly hours limit reached" items={draft.notes.hoursLimited} />
              <Reason color="gray" label="Already have a shift" items={draft.notes.alreadyScheduled} />
              {draft.notes.holidays.length > 0 && (
                <p className="text-xs text-purple-700 mt-1.5"><strong>Holidays skipped:</strong> {draft.notes.holidays.map((h) => `${formatDate(h.date)} (${h.name})`).join(', ')}</p>
              )}
              {draft.notes.onLeave.length + draft.notes.hoursLimited.length + draft.notes.alreadyScheduled.length + draft.notes.holidays.length === 0 && (
                <p className="text-xs text-gray-500">Nobody was held back: no leave, no existing shifts, no holidays and no one near the hours limit.</p>
              )}
            </Panel>
          </aside>
        </div>
      )}

      {editing && <p className="text-xs text-blue-700 bg-blue-50 rounded-lg px-3 py-2">Editing: click a cell to assign or remove someone. Leave days and existing shifts can't be changed here.</p>}

      <Footer>
        <Button variant="outline" icon={ArrowLeft} onClick={onBack}>Back</Button>
        <div className="flex gap-2">
          <Button variant={editing ? 'secondary' : 'outline'} icon={Pencil} onClick={onToggleEdit}>{editing ? 'Done editing' : 'Edit Schedule'}</Button>
          <Button variant="success" icon={CheckCircle2} disabled={total === 0} onClick={onApprove}>Approve Schedule</Button>
        </div>
      </Footer>
    </div>
  );
}

function Panel({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-3.5">
      <div className="flex items-center gap-2 text-[13px] font-bold text-gray-900 mb-2"><Icon className="w-4 h-4 text-blue-600" />{title}</div>
      {children}
    </div>
  );
}

// One reason people were held back: who, and on which days
function Reason({ color, label, items }) {
  if (!items?.length) return null;
  const tone = { amber: 'text-amber-800', rose: 'text-rose-700', gray: 'text-gray-700' }[color];
  return (
    <div className="mb-2 last:mb-0">
      <p className={clsx('text-xs font-semibold', tone)}>{label} <span className="font-normal text-gray-400">· {items.length} {items.length === 1 ? 'person' : 'people'}</span></p>
      <ul className="mt-0.5 max-h-24 overflow-auto text-xs text-gray-600 space-y-0.5">
        {items.map((p) => <li key={p.id}>{p.name} <span className="text-gray-400">({p.dates.map(shortDate).join(', ')})</span></li>)}
      </ul>
    </div>
  );
}

function Cell({ employee, day, assigned, shiftName, editing, onToggle }) {
  if (day.holiday) return <span className="text-gray-300">—</span>;
  const c = employee.cells[day.date];
  if (c?.state === 'leave') return <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-800"><Palmtree className="w-3 h-3" />Leave</span>;
  if (c?.state === 'existing') return <span title={c.label} className="inline-block max-w-[100px] truncate rounded-lg bg-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600">{c.label}</span>;
  if (c?.state === 'limit' && !assigned) {
    return editing
      ? <button type="button" onClick={() => onToggle(employee.id, day.date)} title="At the weekly hours limit. Click to assign anyway" className="rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-200">Max hrs</button>
      : <span title="Another shift would go over the weekly hours limit" className="inline-block rounded-lg bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700">Max hrs</span>;
  }
  if (assigned) {
    return editing
      ? <button type="button" onClick={() => onToggle(employee.id, day.date)} title="Click to remove" className="inline-block max-w-[100px] truncate rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-blue-700">{shiftName}</button>
      : <span className="inline-block max-w-[100px] truncate rounded-lg bg-blue-600 px-2 py-1 text-[11px] font-semibold text-white">{shiftName}</span>;
  }
  return editing
    ? <button type="button" onClick={() => onToggle(employee.id, day.date)} title="Click to assign" className="rounded-lg border border-dashed border-gray-300 px-3 py-1 text-[11px] font-semibold text-gray-400 hover:border-blue-400 hover:text-blue-600">+</button>
    : <span className="text-gray-300">—</span>;
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <div className={clsx('rounded-xl border px-4 py-3', tone === 'blue' ? 'border-blue-100 bg-blue-50' : 'border-gray-100 bg-gray-50')}>
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><Icon className="w-3.5 h-3.5" />{label}</div>
      <div className={clsx('mt-1 text-2xl font-bold', tone === 'blue' ? 'text-blue-700' : 'text-gray-900')}>{value}</div>
    </div>
  );
}
