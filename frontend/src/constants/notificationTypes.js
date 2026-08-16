import {
  Bell, CheckCircle, XCircle, Calendar, Clock,
  Megaphone, AlertCircle, Settings, FileText, UserPlus,
  AlarmClockOff, UserX, Users,
} from 'lucide-react';

// Single source of truth for how each notification type renders (icon +
// color) - previously duplicated separately in the notification dropdown and
// the full Notifications page, which had to be kept in sync by hand.
export const notificationTypeConfig = {
  leave_request: { icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50' },
  leave_approved: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  leave_rejected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  leave_cancelled: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
  shift_assigned: { icon: Calendar, color: 'text-blue-500', bg: 'bg-blue-50' },
  schedule_change: { icon: Clock, color: 'text-amber-500', bg: 'bg-amber-50' },
  attendance_reminder: { icon: Bell, color: 'text-purple-500', bg: 'bg-purple-50' },
  timesheet_submitted: { icon: FileText, color: 'text-blue-500', bg: 'bg-blue-50' },
  timesheet_approved: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  timesheet_rejected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  employee_added: { icon: UserPlus, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  announcement: { icon: Megaphone, color: 'text-indigo-500', bg: 'bg-indigo-50' },
  system: { icon: Settings, color: 'text-gray-500', bg: 'bg-gray-50' },
  timesheet_reminder: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-50' },
  attendance_late: { icon: AlarmClockOff, color: 'text-amber-500', bg: 'bg-amber-50' },
  attendance_absent: { icon: UserX, color: 'text-red-500', bg: 'bg-red-50' },
  attendance_incomplete: { icon: AlertCircle, color: 'text-orange-500', bg: 'bg-orange-50' },
  staff_shortage: { icon: Users, color: 'text-red-500', bg: 'bg-red-50' },
  overtime_requested: { icon: Clock, color: 'text-blue-500', bg: 'bg-blue-50' },
  overtime_approved: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  overtime_rejected: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  overtime_cancelled: { icon: XCircle, color: 'text-gray-500', bg: 'bg-gray-50' },
};

export const notificationPriorityColors = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-amber-100 text-amber-700',
  low: 'bg-gray-100 text-gray-500',
};
