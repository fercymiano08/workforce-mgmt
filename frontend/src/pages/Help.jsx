import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import {
  HelpCircle, BookOpen, Mail, ChevronDown, ChevronUp, Info, LifeBuoy, ShieldCheck,
} from 'lucide-react';

const APP_NAME = 'WorkForce Pro';
const APP_VERSION = '2.0';

const EMPLOYEE_FAQ = [
  { q: 'How do I clock in / out?', a: 'Go to My Attendance and use the Clock In / Clock Out buttons. The kiosk terminal at the entrance also records punches; make sure you are within the early-arrival window (30 min before your shift).' },
  { q: 'What does "Late" mean?', a: 'Your clock-in was after your shift start plus the grace period (default 15 minutes). Late minutes are tracked on your record and shown on your timesheet.' },
  { q: 'What is an Early Clock-Out / Early Leave?', a: 'When you leave before your shift ends, you pick a reason at the kiosk. HR then classifies the shortfall (excused sick, emergency, early leave, or unpaid). You can review the classification under My Attendance → Early Clock Outs.' },
  { q: 'How do overtime requests work?', a: 'Request overtime ahead of time on My Attendance → Overtime. Once HR approves it, the approved hours are paid. Working overtime without an approved request shows as "Unauthorized" on your record.' },
  { q: 'When is my timesheet generated?', a: 'Timesheets are generated semi-monthly (1st–15th and 16th–end). Drafts are auto-submitted; HR reviews and approves before payroll. Check My Timesheet for status.' },
  { q: 'How do I request leave?', a: 'Go to Leave → New Request, pick the leave type and dates, and submit. HR approves/rejects and you are notified.' },
  { q: 'My profile shows "unsaved changes" — what now?', a: 'Edit your details, then click "Save changes" in the floating bar at the bottom, or "Discard" to revert.' },
];

const ADMIN_FAQ = [
  { q: 'How do I approve a timesheet?', a: 'Timesheets → filter by "Waiting for review", open a row, and Approve/Reject. Approved timesheets are ready for payroll export.' },
  { q: 'How do I handle an early clock-out?', a: 'Attendance → Early Clock-Out Review. Classify the shortfall (excused sick, emergency, early leave, unpaid). The punch is never vetoed — the employee already left.' },
  { q: 'How are overtime hours reconciled?', a: 'Each day with overtime is compared against approved overtime requests: authorized (within approved hours), overrun (worked more than approved), or unauthorized (no approval). See Attendance → Overtime tab.' },
  { q: 'How do I add an employee?', a: 'Employees → Add Employee (or Employee Registration). Fill in details and assign a shift/department.' },
  { q: 'How do I configure shifts and holidays?', a: 'Shifts → define shift windows and working days. Holidays are managed under Settings.' },
  { q: 'What does "Missing clock-out" mean?', a: 'An employee clocked in but never clocked out. Flagged amber on the attendance history; HR should follow up.' },
  { q: 'How do I export reports?', a: 'Reports → pick the report type and date range, then Export (PDF/CSV).' },
];

function FaqItem({ q, a }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 py-3 text-left hover:text-blue-600 transition-colors"
      >
        <span className="text-sm font-medium text-gray-900">{q}</span>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" /> : <ChevronDown className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />}
      </button>
      {open && <p className="pb-3 text-sm text-gray-600 leading-relaxed">{a}</p>}
    </div>
  );
}

export default function Help() {
  const { isAdmin, user } = useAuth();
  const navigate = useNavigate();
  const faq = isAdmin ? ADMIN_FAQ : EMPLOYEE_FAQ;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Help & About</h1>
          <p className="text-sm text-gray-500">Guides, frequently asked questions, and system information.</p>
        </div>
      </div>

      <Card>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#0B1F3A] flex items-center justify-center shrink-0">
            <Info className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">{APP_NAME}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Workforce Management System — version {APP_VERSION}</p>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              A capstone workforce management platform covering attendance, scheduling, leave, overtime,
              timesheets, and HR analytics. Built with Laravel (backend) and React + Vite (frontend).
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Signed in as {user?.firstName} {user?.lastName}</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{isAdmin ? 'Administrator' : 'Employee'}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Frequently Asked Questions</h2>
        </div>
        <div>
          {faq.map((item, i) => (
            <FaqItem key={i} q={item.q} a={item.a} />
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <LifeBuoy className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Support</h2>
        </div>
        <p className="text-sm text-gray-600 leading-relaxed">
          Need help beyond the FAQ? Reach out to your system administrator or HR. For account, password, or access issues,
          contact the Workforce Admin team.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Mail} onClick={() => { window.location.href = 'mailto:support@workforcepro.com'; }}>
            Email support
          </Button>
          <Button variant="ghost" size="sm" icon={ShieldCheck} onClick={() => navigate(isAdmin ? '/settings' : '/my-profile')}>
            {isAdmin ? 'System settings' : 'My profile'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
