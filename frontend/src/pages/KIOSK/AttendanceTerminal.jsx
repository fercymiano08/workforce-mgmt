import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import clsx from 'clsx';
import {
  Briefcase, ScanFace, LogIn, LogOut, CheckCircle2, Loader2,
  UserCheck, Clock, CalendarDays, Search, Hand, Lock, Delete,
  AlertTriangle, RefreshCw, ArrowLeft, ShieldCheck, Info, ShieldAlert,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import FaceRecognitionModal from '../../components/attendance/FaceRecognitionModal';
import KioskPinModal from '../../components/kiosk/KioskPinModal';
import { kioskService } from '../../services/kioskService';
import { loadModels } from '../../services/faceMatchService';
import { useToast } from '../../context/ToastContext';
import { formatDate, formatTime, nowInTimezone } from '../../utils/helpers';
import {
  toDateKey,
  toTimeString,
  minutesFromTime,
  calculateAttendanceStatus,
  calculateTimesheetFields,
} from '../../services/attendanceService';
import { ATTENDANCE_CONFIG } from '../../utils/attendanceConfig';

const RESET_DELAY_MS = 2000;
const TAP_WINDOW_MS = 2500;
const TAP_COUNT = 5;
const FACE_MAX_STRIKES = 3;
const FACE_COOLDOWN_MS = 60 * 1000;

const NOTICE_TONES = {
  danger: { icon: AlertTriangle, iconWrap: 'bg-red-50', iconColor: 'text-red-500', button: 'danger' },
  warning: { icon: AlertTriangle, iconWrap: 'bg-amber-50', iconColor: 'text-amber-500', button: 'primary' },
  info: { icon: Info, iconWrap: 'bg-blue-50', iconColor: 'text-blue-600', button: 'primary' },
  success: { icon: CheckCircle2, iconWrap: 'bg-emerald-50', iconColor: 'text-emerald-500', button: 'primary' },
};

const LOCK_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

function BrandHeader({ subtitle }) {
  return (
    <header className="flex items-center justify-between px-6 lg:px-10 py-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Briefcase className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-[15px] leading-tight tracking-tight">WorkForce Pro</h1>
          <p className="text-blue-300/60 text-[11px] font-medium">{subtitle}</p>
        </div>
      </div>
    </header>
  );
}

export default function AttendanceTerminal() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [settings, setSettings] = useState(() => kioskService.getSettings());
  const enabled = settings.active === true;
  const [unlocked, setUnlocked] = useState(() => kioskService.isUnlocked());

  const timezone = settings?.timezone || 'Asia/Manila';
  const timezoneRef = useRef(timezone);
  useEffect(() => {
    timezoneRef.current = timezone;
  }, [timezone]);

  const [phase, setPhase] = useState('mode');
  const [action, setAction] = useState(null);
  const [query, setQuery] = useState('');
  const [candidate, setCandidate] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [todayRecord, setTodayRecord] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [recordedType, setRecordedType] = useState(null);
  const [recordedAt, setRecordedAt] = useState(null);
  const [recordedHours, setRecordedHours] = useState(null);
  const [shiftInfo, setShiftInfo] = useState(null);
  const [notice, setNotice] = useState(null);
  const [faceLockUntil, setFaceLockUntil] = useState(null);
  const [clockInOutcome, setClockInOutcome] = useState(null);
  const faceStrikes = useRef(0);

  const [lockPin, setLockPin] = useState('');
  const [lockError, setLockError] = useState(null);
  const [lockSubmitting, setLockSubmitting] = useState(false);
  const [showUnlock, setShowUnlock] = useState(false);
  const [unlockError, setUnlockError] = useState(null);
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [tzNow, setTzNow] = useState(() => nowInTimezone(timezone));

  const [directory, setDirectory] = useState([]);
  const resetTimer = useRef(null);
  const searchRef = useRef(null);
  const taps = useRef([]);

  useEffect(() => {
    const clock = setInterval(() => {
      setNow(new Date());
      setTzNow(nowInTimezone(timezoneRef.current));
    }, 1000);
    kioskService.load().then((next) => {
      setSettings(next);
      setUnlocked(kioskService.isUnlocked());
      if (next.active) {
        loadModels().catch(() => {});
        kioskService.getEmployees()
          .then(setDirectory)
          .catch(() => {});
      }
    });
    return () => {
      clearInterval(clock);
      if (resetTimer.current) clearTimeout(resetTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    document.documentElement.requestFullscreen?.().catch(() => {});
    return () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [enabled]);

  const clearFlowState = () => {
    setQuery('');
    setCandidate(null);
    setEmployee(null);
    setTodayRecord(null);
    setAction(null);
    setConflict(null);
    setRecordedType(null);
    setRecordedAt(null);
    setRecordedHours(null);
    setShiftInfo(null);
    setNotice(null);
    setFaceLockUntil(null);
    setClockInOutcome(null);
  };

  const resetToMode = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    setPhase('mode');
    clearFlowState();
  };

  const scheduleReset = () => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(resetToMode, RESET_DELAY_MS);
  };

  const selectMode = (mode) => {
    setAction(mode);
    setConflict(null);
    setCandidate(null);
    setQuery('');
    setPhase('entry');
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  // --- Kiosk access PIN gate (one-time per 24 hours) ----------------------

  const pressLockKey = (digit) => setLockPin((prev) => (prev.length < 4 ? prev + digit : prev));
  const lockBackspace = () => setLockPin((prev) => prev.slice(0, -1));

  const handleLockSubmit = async (pin) => {
    if (lockSubmitting) return;
    setLockSubmitting(true);
    setLockError(null);
    const ok = await kioskService.verifyPin(pin);
    if (ok) {
      kioskService.log('security', 'Kiosk terminal unlocked with access PIN');
      kioskService.markUnlocked();
      setLockPin('');
      setLockSubmitting(false);
      setUnlocked(true);
      setPhase('mode');
    } else {
      kioskService.log('security', 'Failed attempt to unlock the kiosk (incorrect PIN)');
      setLockError('Incorrect PIN. Please try again.');
      setLockPin('');
      setLockSubmitting(false);
    }
  };

  useEffect(() => {
    if (!enabled || unlocked) return;
    if (lockPin.length === 4) {
      const timer = setTimeout(() => handleLockSubmit(lockPin), 150);
      return () => clearTimeout(timer);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, unlocked, lockPin]);

  useEffect(() => {
    if (!enabled || unlocked) return;
    const handleKey = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        pressLockKey(e.key);
      } else if (e.key === 'Backspace') {
        lockBackspace();
      } else if (e.key === 'Enter' && lockPin.length === 4) {
        handleLockSubmit(lockPin);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, unlocked, lockPin]);

  // --- Employee ID entry: exact full-ID match only (no partial search) ----

  const entryInfo = useMemo(() => {
    if (phase !== 'entry') return null;
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return null;
    const matches = directory.filter((e) => String(e.id).toLowerCase().startsWith(trimmed));
    if (matches.length === 0) {
      return trimmed.length >= 4 ? { type: 'none' } : null;
    }
    const exact = matches.find((e) => String(e.id).toLowerCase() === trimmed);
    if (exact) return { type: 'match' };
    if (matches.length === 1) {
      return { type: 'more', remaining: matches[0].id.length - trimmed.length };
    }
    return { type: 'keep' };
  }, [query, phase, directory]);

  const exactMatch = useMemo(() => {
    if (phase !== 'entry') return null;
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return null;
    return directory.find((e) => String(e.id).toLowerCase() === trimmed) || null;
  }, [query, phase, directory]);

  if (exactMatch && !candidate) {
    setCandidate(exactMatch);
    setPhase('confirm');
  }

  if (phase === 'locked' && faceLockUntil && now.getTime() >= faceLockUntil) {
    setPhase('mode');
    clearFlowState();
  }

  const handleConfirmEmployee = async () => {
    if (!candidate || !action) return;
    setEmployee(candidate);
    setQuery('');

    let today;
    try {
      const records = (await kioskService.getAttendanceByEmployee(candidate.id)) || [];
      today = records.find((r) => r.date === toDateKey(nowInTimezone(timezone))) || null;
    } catch {
      today = null;
    }
    setTodayRecord(today);

    let shift;
    try {
      shift = await kioskService.getTodaySchedule(candidate.id);
    } catch {
      shift = null;
    }
    setShiftInfo(shift || null);

    if (today && today.clockIn && today.clockOut) {
      setConflict(null);
      setPhase('completed');
      scheduleReset();
      return;
    }

    if (action === 'clock-in' && today && today.clockIn) {
      setConflict({
        type: 'already-clocked-in',
        suggested: 'clock-out',
        title: 'Already Clocked In',
        message: `${candidate.firstName} is already clocked in at ${formatTime(today.clockIn)}. Did you mean Clock Out?`,
      });
      setPhase('conflict');
      return;
    }

    if (action === 'clock-out' && (!today || !today.clockIn)) {
      setConflict({
        type: 'no-clock-in',
        suggested: 'clock-in',
        title: 'No Clock-In Found',
        message: `No clock-in was found for ${candidate.firstName} today. Did you mean Clock In?`,
      });
      setPhase('conflict');
      return;
    }

    setConflict(null);
    setPhase('verify');
  };

  const handleFaceComplete = () => {
    faceStrikes.current = 0;
    if (action === 'clock-in') {
      evaluateClockIn();
    } else {
      evaluateClockOut();
    }
  };

  const handleFaceClose = () => {
    setPhase('entry');
    setQuery('');
    setCandidate(null);
    setTimeout(() => searchRef.current?.focus(), 0);
  };

  // A face that did not match the confirmed employee - warn them to stop,
  // log it as a security event, and lock the terminal after repeat offenses.
  const handleFaceMismatch = async () => {
    if (!employee) return;
    faceStrikes.current += 1;

    kioskService.log(
      'security',
      `Face mismatch - person does not match ${employee.firstName} ${employee.lastName} (${employee.id})`,
      { employeeId: employee.id }
    );

    if (faceStrikes.current >= FACE_MAX_STRIKES) {
      faceStrikes.current = 0;
      setFaceLockUntil(Date.now() + FACE_COOLDOWN_MS);
      setPhase('locked');
      return;
    }

    setNotice({
      tone: 'danger',
      title: 'Identity Verification Failed',
      message: `The face in the camera does not match ${employee.firstName} ${employee.lastName}'s registered photo. Clocking in under another person's ID is a security violation. This attempt has been logged. Please step aside and see HR if you believe this is a mistake.`,
      confirmLabel: 'I Understand',
      cancelLabel: 'Cancel',
      onConfirm: resetToMode,
      onCancel: resetToMode,
    });
    setPhase('notice');
  };

  // --- Clock in / out -----------------------------------------------------

  // Runs the shift-aware pre-checks for a clock-in: no schedule today, early
  // arrivals, and being late (past the 15-minute grace period) all produce a
  // professional warning the employee must acknowledge before the clock-in is
  // actually recorded. Clocking in on time records directly.
  const evaluateClockIn = () => {
    if (!employee) return;
    const time = toTimeString(nowInTimezone(timezone));
    const start = shiftInfo?.hasShift && shiftInfo.startTime
      ? shiftInfo.startTime
      : ATTENDANCE_CONFIG.startTime;
    const startMin = minutesFromTime(start);
    const nowMin = minutesFromTime(time);
    const grace = ATTENDANCE_CONFIG.gracePeriodMinutes;

    // Schedule could not be determined (network hiccup) - record normally
    // instead of falsely warning about a missing shift.
    if (!shiftInfo) {
      recordAttendance();
      return;
    }

    if (!shiftInfo?.hasShift) {
      setNotice({
        tone: 'warning',
        title: 'No Shift Scheduled Today',
        message: `There is no shift scheduled for ${employee.firstName} ${employee.lastName} today. Clocking in without a schedule is not allowed. Please check your schedule with HR.`,
        confirmLabel: 'Back to Home',
        onConfirm: resetToMode,
      });
      setPhase('notice');
      return;
    }

    const end = shiftInfo?.hasShift && shiftInfo.endTime ? shiftInfo.endTime : null;
    const endMin = end ? minutesFromTime(end) : null;

    if (endMin !== null && endMin > startMin && nowMin >= endMin) {
      setNotice({
        tone: 'warning',
        title: 'Shift Over',
        message: `${employee.firstName} ${employee.lastName}'s shift ended at ${formatTime(end)} today. Clocking in for a finished shift is not allowed - please contact HR.`,
        confirmLabel: 'Back to Home',
        onConfirm: resetToMode,
      });
      setPhase('notice');
      return;
    }

    if (nowMin > startMin + grace) {
      const minutesLate = nowMin - startMin;
      setNotice({
        tone: 'warning',
        title: 'You Are Late',
        message: `Your shift started at ${formatTime(start)}. You are ${minutesLate} ${minutesLate === 1 ? 'minute' : 'minutes'} past the 15-minute grace period, so this clock-in will be recorded as Late.`,
        confirmLabel: 'Clock In Anyway',
        cancelLabel: 'Cancel',
        onConfirm: () => { setNotice(null); recordAttendance('late'); },
        onCancel: resetToMode,
      });
      setPhase('notice');
      return;
    }

    if (nowMin < startMin) {
      const minutesEarly = startMin - nowMin;
      setNotice({
        tone: 'info',
        title: minutesEarly > 60 ? 'Clocking In Very Early' : 'Clocking In Early',
        message: `Your shift starts at ${formatTime(start)}. You are ${minutesEarly} ${minutesEarly === 1 ? 'minute' : 'minutes'} early.`,
        confirmLabel: 'Clock In Anyway',
        cancelLabel: 'Cancel',
        onConfirm: () => { setNotice(null); recordAttendance('early'); },
        onCancel: resetToMode,
      });
      setPhase('notice');
      return;
    }

    recordAttendance();
  };

  // Runs the shift-aware pre-check for a clock-out: employees may not clock
  // out before their shift - including any approved overtime for the day -
  // is actually over. Early clock-outs are rejected outright; the terminal
  // tells them their shift is still ongoing instead of recording.
  const evaluateClockOut = () => {
    if (!employee || !todayRecord) return;

    if (!shiftInfo || !shiftInfo.hasShift || !shiftInfo.endTime) {
      recordAttendance();
      return;
    }

    const startMin = minutesFromTime(shiftInfo.startTime || ATTENDANCE_CONFIG.startTime);
    const otHours = Number(shiftInfo.approvedOvertimeHours || 0);
    const endMin = minutesFromTime(shiftInfo.endTime) + Math.round(otHours * 60);

    const target = nowInTimezone(timezone);
    target.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (endMin <= startMin) target.setDate(target.getDate() + 1);

    if (nowInTimezone(timezone).getTime() < target.getTime()) {
      const pad = (n) => String(n).padStart(2, '0');
      const endDisplay = formatTime(`${pad(Math.floor(endMin / 60) % 24)}:${pad(endMin % 60)}`);
      const otNote = otHours > 0 ? ` (${otHours}h approved overtime)` : '';
      setNotice({
        tone: 'warning',
        title: 'Shift Still Ongoing',
        message: `${employee.firstName} ${employee.lastName}, your shift is still in progress and ends at ${endDisplay}${otNote}. Clocking out early is not allowed - please return to your post.`,
        confirmLabel: 'Back to Home',
        onConfirm: resetToMode,
      });
      setPhase('notice');
      return;
    }

    recordAttendance();
  };

  const recordAttendance = async (outcome = null) => {
    if (!employee || !action) return;
    setPhase('recording');
    try {
      const time = toTimeString(nowInTimezone(timezone));

      if (action === 'clock-in') {
        const start = shiftInfo?.hasShift && shiftInfo.startTime
          ? shiftInfo.startTime
          : ATTENDANCE_CONFIG.startTime;
        const created = await kioskService.clockIn({
          employeeId: employee.id,
          date: toDateKey(nowInTimezone(timezone)),
          clockIn: time,
          status: calculateAttendanceStatus(time, { ...ATTENDANCE_CONFIG, startTime: start }),
          location: ATTENDANCE_CONFIG.location,
        });
        setTodayRecord(created);
        setRecordedHours(null);
        setClockInOutcome(outcome);
      } else {
        const fields = calculateTimesheetFields(todayRecord.clockIn, time);
        await kioskService.clockOut(todayRecord.id, {
          clockOut: time,
          regularHours: fields.regularHours,
          overtime: fields.overtimeHours,
          totalHours: fields.totalHours,
          breakHours: fields.breakHours,
        });
        setRecordedHours(fields.totalHours);
        setClockInOutcome(null);
      }

      kioskService.log(
        action === 'clock-in' ? 'clock-in' : 'clock-out',
        `${employee.firstName} ${employee.lastName} clocked ${action === 'clock-in' ? 'in' : 'out'}`,
        { employeeId: employee.id, detail: 'Method: Facial recognition' }
      );

      setRecordedType(action);
      setRecordedAt(time);
      setPhase('success');
      scheduleReset();
    } catch {
      setNotice({
        tone: 'danger',
        title: 'Attendance Not Recorded',
        message: 'Something went wrong while recording your attendance. Nothing was saved. Please try again.',
        confirmLabel: 'Try Again',
        cancelLabel: 'Cancel',
        onConfirm: () => { setNotice(null); setPhase('verify'); },
        onCancel: resetToMode,
      });
      setPhase('notice');
    }
  };

  // --- Admin exit via 5-tap -----------------------------------------------

  const handleSurfaceTap = (e) => {
    if (!enabled || !unlocked) return;
    if (e.target.closest('button, input, a, select, textarea')) return;
    const nowTs = Date.now();
    taps.current = [...taps.current, nowTs].filter((ts) => nowTs - ts <= TAP_WINDOW_MS);
    if (taps.current.length >= TAP_COUNT) {
      taps.current = [];
      setUnlockError(null);
      setShowUnlock(true);
    }
  };

  const handleUnlockSubmit = async (pin) => {
    if (unlockSubmitting) return;
    setUnlockSubmitting(true);
    setUnlockError(null);
    const ok = await kioskService.verifyPin(pin);
    if (ok) {
      kioskService.log('security', 'Kiosk unlocked by Administrator');
      kioskService.markUnlocked();
      setUnlockSubmitting(false);
      setShowUnlock(false);
      toast.success('Unlocked', 'Returning to the Kiosk Management Dashboard.');
      navigate('/kiosk-setup');
    } else {
      kioskService.log('security', 'Failed attempt to unlock the kiosk (incorrect PIN)');
      setUnlockError('Incorrect PIN. Please try again.');
      setUnlockSubmitting(false);
    }
  };

  const timeString = tzNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateString = tzNow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const lockSecondsLeft = faceLockUntil ? Math.max(0, Math.ceil((faceLockUntil - now.getTime()) / 1000)) : 0;

  // What the success screen shows depends on how the clock-in went: on-time
  // (within the grace period) is a clean success; late/early/unscheduled
  // arrivals carry a matching notice so HR policy is visible on the device.
  const successView = useMemo(() => {
    if (!employee || recordedType !== 'clock-in') {
      return {
        tone: 'emerald',
        title: 'Clocked Out',
        message: `Thank you, ${employee?.firstName}! Have a great day.`,
        noteTitle: null,
        note: null,
      };
    }
    switch (clockInOutcome) {
      case 'late':
        return {
          tone: 'amber',
          title: 'Clocked In (Late)',
          message: `Thank you, ${employee.firstName}. Your clock-in has been recorded as late.`,
          noteTitle: 'Late Arrival',
          note: `Your shift started at ${formatTime(shiftInfo?.startTime || ATTENDANCE_CONFIG.startTime)}. You clocked in after the 15-minute grace period.`,
        };
      case 'early':
        return {
          tone: 'blue',
          title: 'Clocked In (Early)',
          message: `Thank you, ${employee.firstName}. You clocked in before your shift start.`,
          noteTitle: 'Early Clock-In',
          note: `Your shift starts at ${formatTime(shiftInfo?.startTime || ATTENDANCE_CONFIG.startTime)}.`,
        };
      default:
        return {
          tone: 'emerald',
          title: 'Clocked In Successfully',
          message: `Thank you, ${employee.firstName}! Have a great day.`,
          noteTitle: 'On Time',
          note: 'You clocked in on time, within the 15-minute grace period.',
        };
    }
  }, [employee, recordedType, clockInOutcome, shiftInfo]);

  // --- Disabled screen: kiosk mode has not been enabled by the HR Manager --
  if (!enabled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0B1F3A] via-[#0E2747] to-[#0B1F3A] flex flex-col">
        <BrandHeader subtitle="Attendance Terminal · Not Configured" />
        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-amber-500" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mt-4">Clock-In Disabled</h2>
            <p className="text-gray-500 mt-1.5">
              Clock-in attendance is disabled. Wait for the administrator to set up the kiosk before clocking in.
            </p>
            <Button
              size="lg"
              className="mt-8 w-full"
              icon={RefreshCw}
              onClick={() => kioskService.load().then(setSettings)}
            >
              Check Again
            </Button>
          </div>
        </main>
      </div>
    );
  }

  // --- Lock screen: the kiosk access PIN is required once per 24 hours -----
  if (!unlocked) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0B1F3A] via-[#0E2747] to-[#0B1F3A] flex flex-col">
        <BrandHeader subtitle={`Attendance Terminal · ${settings.deviceName}`} />

        <div className="text-center px-4">
          <p className="text-5xl sm:text-6xl font-bold text-white tabular-nums tracking-tight drop-shadow-lg">{timeString}</p>
          <p className="text-blue-200/70 text-base sm:text-lg mt-2 font-medium">{dateString}</p>
        </div>

        <main className="flex-1 flex items-center justify-center px-4 py-10">
          <div className="w-full max-w-sm">
            <div className="bg-white rounded-3xl shadow-2xl p-8 text-center">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center">
                <Lock className="w-7 h-7 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mt-4">Kiosk Unlock</h2>
              <p className="text-xs text-gray-500 mt-1">
                Enter the kiosk PIN once. The terminal stays open for 24 hours.
              </p>

              <div className="flex justify-center gap-3 mt-6">
                {[0, 1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className={clsx(
                      'w-4 h-4 rounded-full border-2 transition-all duration-150',
                      lockPin.length > i ? 'bg-blue-600 border-blue-600 scale-110' : 'border-gray-300'
                    )}
                  />
                ))}
              </div>

              {lockError && (
                <p className="text-xs font-medium text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-4 animate-fadeIn">
                  {lockError}
                </p>
              )}

              <div className="grid grid-cols-3 gap-2.5 mt-6 select-none">
                {LOCK_KEYS.map((key, idx) => {
                  if (key === '') return <div key={idx} />;
                  if (key === 'back') {
                    return (
                      <button
                        key={idx}
                        type="button"
                        disabled={lockSubmitting}
                        onClick={lockBackspace}
                        className="h-14 rounded-2xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors flex items-center justify-center text-gray-500"
                      >
                        <Delete className="w-5 h-5" />
                      </button>
                    );
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={lockSubmitting}
                      onClick={() => pressLockKey(key)}
                      className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-blue-600 active:text-white transition-all text-lg font-semibold text-gray-900"
                    >
                      {key}
                    </button>
                  );
                })}
              </div>

              <p className="text-[11px] text-gray-400 mt-5">
                {settings.location} · {settings.deviceName}
              </p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // --- Clock-in terminal --------------------------------------------------
  return (
    <div
      onPointerDown={handleSurfaceTap}
      className="min-h-screen bg-gradient-to-br from-[#0B1F3A] via-[#0E2747] to-[#0B1F3A] flex flex-col"
    >
      <header className="flex items-center justify-between px-6 lg:px-10 py-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Briefcase className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-white font-bold text-[15px] leading-tight tracking-tight">WorkForce Pro</h1>
            <p className="text-blue-300/60 text-[11px] font-medium">Attendance Terminal · {settings.deviceName}</p>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-300/80">
          <Hand className="w-4 h-4" />
          Admin: tap 5 times to unlock
        </span>
      </header>

      <div className="text-center px-4">
        <p className="text-5xl sm:text-6xl font-bold text-white tabular-nums tracking-tight drop-shadow-lg">{timeString}</p>
        <p className="text-blue-200/70 text-base sm:text-lg mt-2 font-medium">{dateString}</p>
      </div>

      <main className="flex-1 flex items-start sm:items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          {phase === 'mode' && (
            <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10 animate-scaleIn">
              <div className="text-center">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center">
                  <ScanFace className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mt-4">Welcome to the Attendance Terminal</h2>
                <p className="text-gray-500 mt-1.5">Choose an action to continue</p>
              </div>

              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => selectMode('clock-in')}
                  className="group rounded-2xl border-2 border-emerald-200 bg-gradient-to-b from-emerald-50 to-emerald-50/30 p-6 sm:p-8 text-left transition-all hover:border-emerald-400 hover:shadow-xl hover:shadow-emerald-500/10 active:scale-[0.98]"
                >
                  <div className="w-14 h-14 rounded-2xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 transition-transform group-hover:scale-105">
                    <LogIn className="w-7 h-7 text-white" />
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-5">Clock In</p>
                  <p className="text-sm text-gray-500 mt-1">Starting your shift</p>
                  <p className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-600">
                    Tap to begin <span aria-hidden>→</span>
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => selectMode('clock-out')}
                  className="group rounded-2xl border-2 border-amber-200 bg-gradient-to-b from-amber-50 to-amber-50/30 p-6 sm:p-8 text-left transition-all hover:border-amber-400 hover:shadow-xl hover:shadow-amber-500/10 active:scale-[0.98]"
                >
                  <div className="w-14 h-14 rounded-2xl bg-amber-500 flex items-center justify-center shadow-lg shadow-amber-500/30 transition-transform group-hover:scale-105">
                    <LogOut className="w-7 h-7 text-white" />
                  </div>
                  <p className="text-xl font-bold text-gray-900 mt-5">Clock Out</p>
                  <p className="text-sm text-gray-500 mt-1">Ending your shift</p>
                  <p className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-amber-600">
                    Tap to begin <span aria-hidden>→</span>
                  </p>
                </button>
              </div>

              <p className="mt-6 text-center text-xs text-gray-400 flex items-center justify-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                Kiosk unlocked for 24 hours · Employees verified with facial recognition
              </p>
            </div>
          )}

          {phase === 'entry' && (
            <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10 animate-scaleIn">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Search className="w-7 h-7 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold text-gray-900">
                      {action === 'clock-in' ? 'Clocking In' : 'Clocking Out'}
                    </h2>
                    <p className="text-gray-500 mt-1">Enter your full Employee ID</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Badge variant={action === 'clock-out' ? 'danger' : 'primary'} size="md">
                    <span className="flex items-center gap-1.5">
                      {action === 'clock-in' ? <LogIn className="w-3.5 h-3.5" /> : <LogOut className="w-3.5 h-3.5" />}
                      {action === 'clock-in' ? 'Clock In' : 'Clock Out'}
                    </span>
                  </Badge>
                  <button
                    type="button"
                    onClick={resetToMode}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-blue-600 transition-colors underline"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Change action
                  </button>
                </div>
              </div>

              <div className="mt-8">
                <div className="relative">
                  <input
                    ref={searchRef}
                    type="text"
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. EMP20264845"
                    className="w-full h-16 pl-5 pr-5 text-center text-xl font-semibold tracking-[0.08em] uppercase rounded-2xl border-2 border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-gray-900 placeholder:text-gray-300 placeholder:tracking-normal"
                  />
                </div>

                {entryInfo && (
                  <div className="mt-3 text-center">
                    {entryInfo.type === 'more' && (
                      <p className="text-sm font-medium text-blue-600">
                        Continue typing — {entryInfo.remaining} more {entryInfo.remaining === 1 ? 'character' : 'characters'}
                      </p>
                    )}
                    {entryInfo.type === 'keep' && (
                      <p className="text-sm text-gray-500">Keep typing…</p>
                    )}
                    {entryInfo.type === 'none' && (
                      <p className="text-sm font-medium text-red-600">
                        No employee found with this ID. Check the spelling and try again.
                      </p>
                    )}
                    {entryInfo.type === 'match' && (
                      <p className="text-sm font-medium text-emerald-600">Employee found — verifying…</p>
                    )}
                  </div>
                )}
              </div>

              <p className="mt-6 text-center text-xs text-gray-400">
                Enter the FULL Employee ID. Matches are confirmed and verified with facial recognition.
              </p>
            </div>
          )}

          {phase === 'confirm' && candidate && (
            <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center animate-scaleIn">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-blue-50 flex items-center justify-center">
                <UserCheck className="w-7 h-7 text-blue-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-4">Is this you?</h2>
              <p className="text-sm text-gray-500 mt-1.5">
                Confirm before {action === 'clock-in' ? 'clocking in' : 'clocking out'}.
              </p>

              <div className="mt-8 rounded-2xl border border-gray-100 bg-gray-50/60 p-6 text-left">
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar src={candidate.avatar} firstName={candidate.firstName} lastName={candidate.lastName} size="lg" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{candidate.id}</p>
                    <p className="text-lg font-bold text-gray-900 truncate">{candidate.firstName} {candidate.lastName}</p>
                    <p className="text-sm text-gray-500 truncate">{candidate.position} · {candidate.department}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="flex-1"
                  icon={UserCheck}
                  onClick={handleConfirmEmployee}
                >
                  Yes, that's me
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="flex-1"
                  onClick={() => {
                    setCandidate(null);
                    setQuery('');
                    setPhase('entry');
                    setTimeout(() => searchRef.current?.focus(), 0);
                  }}
                >
                  No, start over
                </Button>
              </div>
            </div>
          )}

          {phase === 'conflict' && employee && conflict && (
            <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center animate-scaleIn">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-4">{conflict.title}</h2>
              <p className="text-gray-500 mt-1.5 max-w-md mx-auto">{conflict.message}</p>

              <div className="mt-8 rounded-2xl border border-gray-100 bg-gray-50/60 p-6 text-left">
                <div className="flex items-center gap-4 min-w-0">
                  <Avatar src={employee.avatar} firstName={employee.firstName} lastName={employee.lastName} size="lg" />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{employee.id}</p>
                    <p className="text-lg font-bold text-gray-900 truncate">{employee.firstName} {employee.lastName}</p>
                    <p className="text-sm text-gray-500 truncate">{employee.position} · {employee.department}</p>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Button
                  variant={conflict.suggested === 'clock-out' ? 'danger' : 'primary'}
                  size="lg"
                  className="flex-1"
                  icon={conflict.suggested === 'clock-out' ? LogOut : LogIn}
                  onClick={() => {
                    setAction(conflict.suggested);
                    setConflict(null);
                    setPhase('verify');
                  }}
                >
                  Yes, {conflict.suggested === 'clock-in' ? 'Clock In' : 'Clock Out'}
                </Button>
                <Button variant="outline" size="lg" className="flex-1" onClick={resetToMode}>
                  No, Start Over
                </Button>
              </div>
            </div>
          )}

          {phase === 'notice' && notice && (() => {
            const tone = NOTICE_TONES[notice.tone] || NOTICE_TONES.info;
            const ToneIcon = tone.icon;
            return (
              <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center animate-scaleIn">
                <div className={clsx('w-16 h-16 mx-auto rounded-full flex items-center justify-center', tone.iconWrap)}>
                  <ToneIcon className={clsx('w-8 h-8', tone.iconColor)} />
                </div>
                <h2 className="text-2xl font-bold text-gray-900 mt-4">{notice.title}</h2>
                <p className="text-gray-500 mt-1.5 max-w-md mx-auto">{notice.message}</p>

                <div className="mt-8 flex flex-col sm:flex-row gap-3">
                  <Button
                    variant={tone.button}
                    size="lg"
                    className={notice.cancelLabel ? 'flex-1' : 'w-full'}
                    onClick={notice.onConfirm}
                  >
                    {notice.confirmLabel || 'Continue'}
                  </Button>
                  {notice.cancelLabel && (
                    <Button variant="outline" size="lg" className="flex-1" onClick={notice.onCancel || resetToMode}>
                      {notice.cancelLabel}
                    </Button>
                  )}
                </div>
              </div>
            );
          })()}

          {phase === 'locked' && (
            <div className="bg-white rounded-3xl shadow-2xl p-8 sm:p-10 text-center animate-scaleIn">
              <div className="w-16 h-16 mx-auto rounded-full bg-red-50 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-4">Terminal Temporarily Locked</h2>
              <p className="text-gray-500 mt-1.5 max-w-md mx-auto">
                Multiple failed identity checks were detected. The terminal is suspended for the countdown below. This incident has been logged and will be reviewed by HR.
              </p>
              <p className="mt-6 text-5xl font-bold text-red-600 tabular-nums">{lockSecondsLeft}</p>
              <p className="text-sm text-gray-400 mt-2">seconds remaining</p>
            </div>
          )}

          {phase === 'recording' && (
            <div className="bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center text-center animate-fadeIn">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <p className="text-lg font-semibold text-gray-900 mt-5">
                Recording {action === 'clock-in' ? 'clock in' : 'clock out'}...
              </p>
              <p className="text-sm text-gray-400 mt-1">Please wait a moment</p>
            </div>
          )}

          {phase === 'success' && employee && (
            <div className="bg-white rounded-3xl shadow-2xl p-10 text-center animate-scaleIn">
              <div className={clsx(
                'w-20 h-20 mx-auto rounded-full flex items-center justify-center',
                successView.tone === 'amber' ? 'bg-amber-50' : successView.tone === 'blue' ? 'bg-blue-50' : 'bg-emerald-50'
              )}>
                <CheckCircle2 className={clsx(
                  'w-10 h-10',
                  successView.tone === 'amber' ? 'text-amber-500' : successView.tone === 'blue' ? 'text-blue-500' : 'text-emerald-500'
                )} />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-5">{successView.title}</h2>
              <p className="text-gray-500 mt-1.5">{successView.message}</p>
              {successView.note && (
                <div className={clsx(
                  'mt-5 rounded-2xl p-4 text-left',
                  successView.tone === 'amber' ? 'bg-amber-50' : successView.tone === 'blue' ? 'bg-blue-50' : 'bg-emerald-50'
                )}>
                  <p className={clsx(
                    'text-sm font-semibold',
                    successView.tone === 'amber' ? 'text-amber-700' : successView.tone === 'blue' ? 'text-blue-700' : 'text-emerald-700'
                  )}>
                    {successView.noteTitle}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{successView.note}</p>
                </div>
              )}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Employee</p>
                  <p className="text-base font-semibold text-gray-900 mt-1">{employee.firstName} {employee.lastName}</p>
                  <p className="text-sm text-gray-500">{employee.id}</p>
                </div>
                <div className="rounded-2xl bg-gray-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    {recordedType === 'clock-in' ? 'Clocked In At' : 'Clocked Out At'}
                  </p>
                  <p className="text-base font-semibold text-gray-900 mt-1 tabular-nums">{formatTime(recordedAt)}</p>
                  <p className="text-sm text-gray-500">{formatDate(toDateKey(nowInTimezone(timezone)))}</p>
                </div>
              </div>
              {recordedType === 'clock-out' && recordedHours !== null && (
                <div className="mt-4 rounded-2xl bg-blue-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-blue-500">Total Hours Today</p>
                  <p className="text-base font-bold text-blue-700 mt-1 tabular-nums">{recordedHours} hrs</p>
                </div>
              )}
              <p className="text-sm text-gray-400 mt-7 flex items-center justify-center gap-1.5">
                <Clock className="w-4 h-4" />
                Returning to the terminal in a moment...
              </p>
            </div>
          )}

          {phase === 'completed' && employee && (
            <div className="bg-white rounded-3xl shadow-2xl p-10 text-center animate-scaleIn">
              <div className="w-20 h-20 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
                <UserCheck className="w-10 h-10 text-amber-500" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mt-5">Attendance Already Recorded</h2>
              <p className="text-gray-500 mt-1.5">
                {employee.firstName} {employee.lastName} has already clocked in and out for today.
              </p>
              <div className="mt-6 inline-flex items-center gap-3 rounded-2xl bg-gray-50 px-6 py-3 text-sm text-gray-600">
                <span className="flex items-center gap-1.5">
                  <LogIn className="w-4 h-4 text-emerald-600" />
                  {formatTime(todayRecord.clockIn)}
                </span>
                <span className="text-gray-300">→</span>
                <span className="flex items-center gap-1.5">
                  <LogOut className="w-4 h-4 text-amber-600" />
                  {formatTime(todayRecord.clockOut)}
                </span>
              </div>
              <p className="text-sm text-gray-400 mt-7 flex items-center justify-center gap-1.5">
                <Clock className="w-4 h-4" />
                Returning to the terminal in a moment...
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="pb-5 text-center">
        <p className="text-blue-300/40 text-xs">
          <span className="flex items-center justify-center gap-1.5">
            <CalendarDays className="w-3.5 h-3.5" />
            Facial recognition · {settings.location} · Shift starts {formatTime(ATTENDANCE_CONFIG.startTime)}
          </span>
        </p>
      </footer>

      <FaceRecognitionModal
        isOpen={phase === 'verify'}
        employeeName={employee ? `${employee.firstName} ${employee.lastName}` : ''}
        employeeId={employee ? employee.id : ''}
        onComplete={handleFaceComplete}
        onClose={handleFaceClose}
        onMismatch={handleFaceMismatch}
      />

      <KioskPinModal
        isOpen={showUnlock}
        onClose={() => { if (!unlockSubmitting) setShowUnlock(false); }}
        title="Unlock Kiosk"
        subtitle="Enter the secret kiosk PIN to access admin functions."
        onSubmit={handleUnlockSubmit}
        submitting={unlockSubmitting}
        error={unlockError}
      />
    </div>
  );
}
