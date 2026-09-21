import clsx from 'clsx';
import { Check, X, Clock, Send, RotateCcw, Banknote, Bot } from 'lucide-react';
import { whenText } from '../../utils/timesheetWorkflow';

// Small pieces shared by the employee's "My Timesheet" and the admin's "Timesheets" pages, so both
// describe the workflow in exactly the same words.

const EVENTS = {
  submitted: { label: 'Submitted by the employee', icon: Send, tone: 'bg-blue-50 text-blue-600' },
  auto_submitted: { label: 'Submitted automatically (deadline passed)', icon: Bot, tone: 'bg-blue-50 text-blue-600' },
  approved: { label: 'Approved', icon: Check, tone: 'bg-emerald-50 text-emerald-600' },
  rejected: { label: 'Rejected', icon: X, tone: 'bg-red-50 text-red-600' },
  reopened: { label: 'Reopened for correction', icon: RotateCcw, tone: 'bg-amber-50 text-amber-600' },
  exported: { label: 'Sent to payroll', icon: Banknote, tone: 'bg-purple-50 text-purple-600' },
};


// Draft -> Submitted -> Approved, with a red second step when it was sent back.
export function StatusSteps({ status }) {
  const steps = [
    { id: 'Draft', label: 'Draft' },
    { id: 'Submitted', label: status === 'Rejected' ? 'Rejected' : 'Submitted' },
    { id: 'Approved', label: 'Approved' },
  ];
  const at = { Draft: 0, Rejected: 1, Submitted: 1, Approved: 2 }[status] ?? 0;

  return (
    <ol className="flex items-center gap-2 text-xs">
      {steps.map((s, i) => {
        const done = i < at || (status === 'Approved' && i === 2);
        const current = i === at;
        const rejected = status === 'Rejected' && i === 1;
        return (
          <li key={s.id} className="flex items-center gap-2">
            <span className={clsx(
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold border',
              rejected ? 'bg-red-50 text-red-700 border-red-200'
                : done ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : current ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-gray-50 text-gray-400 border-gray-100',
            )}>
              {rejected ? <X className="w-3 h-3" /> : done ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
              {s.label}
            </span>
            {i < steps.length - 1 && <span className="w-4 h-px bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}

// Everything that happened to a timesheet, oldest first.
export function HistoryTimeline({ history }) {
  const items = (history || []).filter((h) => EVENTS[h.event]);
  if (!items.length) return <p className="text-sm text-gray-400">Nothing has happened to this timesheet yet.</p>;

  return (
    <ol className="space-y-3">
      {items.map((h, i) => {
        const meta = EVENTS[h.event];
        const Icon = meta.icon;
        return (
          <li key={`${h.event}-${i}`} className="flex gap-3">
            <span className={clsx('w-7 h-7 rounded-full flex items-center justify-center shrink-0', meta.tone)}><Icon className="w-3.5 h-3.5" /></span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-800">{meta.label}{h.by && h.by !== 'System' ? <span className="text-gray-500 font-normal"> · {h.by}</span> : null}</p>
              {h.at && <p className="text-xs text-gray-400">{whenText(h.at)}</p>}
              {h.note && <p className="text-xs text-gray-600 mt-1 bg-gray-50 rounded-lg px-2.5 py-1.5">&ldquo;{h.note}&rdquo;</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
