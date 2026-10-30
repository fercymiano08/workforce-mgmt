import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import {
  HelpCircle, BookOpen, Mail, ChevronDown, ChevronUp, Info, LifeBuoy, ShieldCheck,
  Users, GraduationCap, ExternalLink, Layers, Clock, CalendarDays, FileText, BarChart3,
} from 'lucide-react';

const APP_NAME = 'WorkForce Pro';
const APP_VERSION = '2.0';
const COURSE_SECTION = 'BSIT 41020';
const COLLEGE = 'Bestlink College of the Philippines';
const DEGREE = 'Bachelor of Science in Information Technology';
const ADVISER = 'Ms. Kris Villaflores';
const GITHUB_URL = 'https://github.com/fercymiano08/workforce-mgmt';
const COMPLETION = 'September 2026';

const TEAM = [
  { name: 'Miano, Fercy B.', role: 'Project Manager / Scrum Master', duties: 'Manages the Product Backlog, organizes sprint planning and retrospectives, primary liaison with Archon Nell Incorporated.' },
  { name: 'Florita, Romulo E.', role: 'Lead Programmer', duties: 'Designs PostgreSQL schemas, structures Laravel backend APIs, leads integration of facial recognition and AI decision support.' },
  { name: 'Balderama, John Paul M.', role: 'Assistant Programmer', duties: 'Builds React + Tailwind CSS user interfaces, implements state management and API consumption, develops schedule management interfaces.' },
  { name: 'Galande, Kyle Mathew B.', role: 'QA & Documentation Lead', duties: 'Authors technical documentation, designs test cases, manages bug tracking through GitHub Issues.' },
  { name: 'Malna, Asniyah G.', role: 'Documentation & Research Lead', duties: 'Authors academic chapters, conducts data privacy audits, facilitates UAT sessions, ensures APA citation compliance.' },
];

const MODULES = [
  { icon: Clock, name: 'Attendance', desc: 'Clock in/out, late & undertime tracking, missing clock-out flags, location capture, kiosk terminal support.' },
  { icon: CalendarDays, name: 'Scheduling', desc: 'Rule-based shift assignment respecting approved leave, staffing-shortage alerts, early-arrival window, grace minutes.' },
  { icon: FileText, name: 'Leave Management', desc: 'Leave requests, multi-level approval, leave balances, leave trends and type composition analytics.' },
  { icon: BarChart3, name: 'Timesheets', desc: 'Semi-monthly (1st–15th, 16th–end) generation, submission, review, approval, payroll-ready export.' },
  { icon: LifeBuoy, name: 'Overtime', desc: 'Overtime requests with approval, reconciliation (authorized / overrun / unauthorized), payable hours.' },
  { icon: ShieldCheck, name: 'Early Clock-Out', desc: 'Reason capture at kiosk, HR classification (excused sick, emergency, early leave, unpaid), certificate tracking.' },
];

const EMPLOYEE_FAQ = [
  { q: 'How do I clock in / out?', a: 'Open My Attendance and use the Clock In / Clock Out buttons. The kiosk terminal at the entrance also records punches; you may clock in up to 30 minutes before your shift start. Arriving after the grace period (default 15 min) marks you Late.' },
  { q: 'What does "Late" mean and how is it measured?', a: 'Your clock-in was after shift start + grace minutes. Late minutes = (actual clock-in − shift start) − grace, clamped at 0. Late minutes are stored on the record and shown on your timesheet and attendance history.' },
  { q: 'What is an Early Clock-Out / Early Leave?', a: 'When you leave before your shift ends, you pick a reason at the kiosk (Feeling Unwell, Family/Personal Emergency, Other). HR then classifies the shortfall (excused sick, excused emergency, excused early leave, or unpaid). Review classifications under My Attendance → Early Clock Outs. Sick claims may require a medical certificate.' },
  { q: 'How do overtime requests work?', a: 'Request overtime ahead of time on My Attendance → Overtime (date, expected hours, reason). Once HR approves, those hours are paid. Working overtime without an approved request is flagged "Unauthorized" on your record and earns no extra pay.' },
  { q: 'When is my timesheet generated and what do the statuses mean?', a: 'Timesheets are generated semi-monthly (1st–15th and 16th–end of month). Draft = in progress; Submitted = waiting for HR review; Approved = ready for payroll; Rejected = returned for correction. Check My Timesheet for status and flags (no hours recorded, missing clock-out, attendance changed after submit, unpaid overtime).' },
  { q: 'How do I request leave?', a: 'Go to Leave → New Request, choose a leave type and dates, and submit. HR approves/rejects and you are notified. Approved leave is reflected on your schedule and attendance (status becomes "On Leave").' },
  { q: 'What is the "unsaved changes" bar?', a: 'On pages like My Profile, edits are not saved automatically. The floating bar at the bottom lets you Save changes or Discard. Leaving the page with unsaved edits prompts a confirmation.' },
  { q: 'What does "Missing clock-out" mean?', a: 'You clocked in but never clocked out (including still-in-progress rows). It is flagged amber on your attendance history. HR follows up; you may file a correction request with photo evidence.' },
  { q: 'How do attendance corrections work?', a: 'If the kiosk missed a punch or you worked past your shift end, file a correction request with supporting photo evidence. A HR Admin reviews it against what the kiosk recorded before approving or rejecting.' },
  { q: 'Can I enable two-factor sign-in?', a: 'Yes — employees may optionally enable 2FA in Settings. After password verification, a time-limited one-time code is sent to your email.' },
];

const ADMIN_FAQ = [
  { q: 'How do I approve a timesheet?', a: 'Timesheets → filter by "Waiting for review", open a row, then Approve or Reject. Approved timesheets are ready for payroll export. Use the period filter (All / This Week / This Month / Custom) and department filter to narrow results.' },
  { q: 'How do I handle an early clock-out?', a: 'Attendance → Early Clock-Out Review. Classify the shortfall (excused sick, excused emergency, excused early leave, or unpaid). The punch is never vetoed — the employee already left. Sick claims may require a medical certificate; overdue certificates are flagged.' },
  { q: 'How are overtime hours reconciled?', a: 'Each day with overtime is compared against approved overtime requests: authorized (within approved hours), overrun (worked more than approved), or unauthorized (no approval). See Attendance → Overtime tab. Payable overtime = min(worked, approved) per day.' },
  { q: 'How do I add an employee?', a: 'Employees → Add Employee (or Employee Registration). Fill in details, assign department/position/shift, and optionally register a face for kiosk verification.' },
  { q: 'How do I configure shifts and holidays?', a: 'Shifts → define shift windows, working days, and grace minutes. Holidays are managed under Settings. Schedules are generated respecting approved leave and flagging staffing shortages.' },
  { q: 'What does "Missing clock-out" mean and how do I handle it?', a: 'An employee clocked in but never clocked out. Flagged amber on attendance history. Follow up with the employee; they can file a correction request with photo evidence for your review.' },
  { q: 'How do I export reports?', a: 'Reports → pick the report type and date range, then Export (PDF/CSV). Available reports include attendance, leave, overtime, and timesheet summaries.' },
  { q: 'How do I manage leave types and rules?', a: 'Settings → Leave Rules. Define leave types, accrual, and approval flows. Leave Management shows pending/approved/rejected requests with analytics.' },
  { q: 'How does the kiosk work?', a: 'The Entrance Clocking In Device (/kiosk) is a public terminal. Employees clock in/out via Employee ID + optional facial recognition. It respects the early-arrival window and grace minutes, and captures location. Configure it under Kiosk Setup (admin only).' },
  { q: 'What are the audit logs?', a: 'Audit Logs record sign-ins, failed sign-in attempts, password resets, 2FA events, approvals/rejections, and settings changes — capturing who performed each action and when. Searchable and filterable.' },
  { q: 'How do notifications work?', a: 'A dedicated Notifications page shows full history in All / Unread / Important views grouped by day. In-app toasts appear for key events (late arrivals, approvals, etc.).' },
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
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
          <HelpCircle className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Help & About</h1>
          <p className="text-sm text-gray-500">Guides, frequently asked questions, system overview, and project information.</p>
        </div>
      </div>

      <Card>
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-[#0B1F3A] flex items-center justify-center shrink-0">
            <Info className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <h2 className="text-base font-semibold text-gray-900">{APP_NAME}</h2>
            <p className="text-sm text-gray-500 mt-0.5">Workforce Management System — version {APP_VERSION} · Completed {COMPLETION}</p>
            <p className="text-sm text-gray-600 mt-2 leading-relaxed">
              An AI-enhanced workforce management platform for e-commerce enterprises and industrial organizations.
              It covers intelligent shift scheduling, leave management, timesheet generation, attendance corrections,
              overtime reconciliation, and workforce analytics — all backed by a single shared period filter and
              role-based access (HR Admin vs Employee). Built with Laravel (backend) + React/Vite (frontend),
              PostgreSQL, and Docker Compose.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">Signed in as {user?.firstName} {user?.lastName}</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{isAdmin ? 'Administrator' : 'Employee'}</span>
              <span className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">{COURSE_SECTION}</span>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">Project Team — Group 8</h2>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-medium text-gray-900">{DEGREE}</span> · {COLLEGE} · Section {COURSE_SECTION} · Adviser: {ADVISER}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Member</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Role</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Responsibilities</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {TEAM.map((m) => (
                <tr key={m.name} className="hover:bg-blue-50/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{m.name}</td>
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{m.role}</td>
                  <td className="px-4 py-3 text-gray-600">{m.duties}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700">
            <ExternalLink className="w-3.5 h-3.5" /> github.com/fercymiano08/workforce-mgmt
          </a>
        </div>
      </Card>

      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Layers className="w-4 h-4 text-blue-600" />
          <h2 className="text-base font-semibold text-gray-900">System Modules</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MODULES.map((m) => (
            <div key={m.name} className="flex items-start gap-3 p-3 rounded-xl bg-gray-50/60 border border-gray-100">
              <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
                <m.icon className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">{m.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{m.desc}</p>
              </div>
            </div>
          ))}
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
          contact the HR Admin team. Bug reports and feature requests can be filed via GitHub Issues.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" icon={Mail} onClick={() => { window.location.href = 'mailto:support@workforcepro.com'; }}>
            Email support
          </Button>
          <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => window.open(GITHUB_URL, '_blank', 'noopener')}>
            GitHub repo
          </Button>
          <Button variant="ghost" size="sm" icon={ShieldCheck} onClick={() => navigate(isAdmin ? '/settings' : '/my-profile')}>
            {isAdmin ? 'System settings' : 'My profile'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
