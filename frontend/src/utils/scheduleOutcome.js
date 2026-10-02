// What a scheduled shift actually turned into, for the employee screens. A row in the schedule says a
// shift was PLANNED; for a day that has happened, the attendance record says what became of it - so a
// past shift that was worked reads "Completed", not still "Scheduled".
export function scheduleOutcome(schedule, attendanceByDate, today) {
  if (schedule.status === 'Cancelled') return 'Cancelled';
  if (schedule.date > today) return 'Upcoming';
  const a = attendanceByDate[schedule.date];
  if (a?.status === 'On Leave') return 'On leave';
  if (a?.status === 'Absent') return 'Absent';
  if (a?.clockIn && a?.clockOut) return 'Completed';
  if (a?.clockIn) return 'In progress';
  if (schedule.date < today) return 'Missed';
  return schedule.status; // today, and not arrived yet
}

export const SCHEDULE_BADGE = {
  Upcoming: 'primary', Scheduled: 'warning', Completed: 'success', 'In progress': 'info',
  Absent: 'danger', Missed: 'danger', 'On leave': 'default', Cancelled: 'danger',
};
