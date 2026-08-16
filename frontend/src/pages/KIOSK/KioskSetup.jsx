import { useEffect, useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  MapPin, MonitorSmartphone, ScanFace,
  Power, Activity, Wrench, Settings, CheckCircle2, AlertTriangle,
  Lock, KeyRound, ListChecks, RotateCcw, RefreshCw, LogIn, ShieldCheck, Clock,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import KioskPinModal from '../../components/kiosk/KioskPinModal';
import { kioskService, LOG_TYPES, TIMEZONES } from '../../services/kioskService';
import { useToast } from '../../context/ToastContext';

const TABS = [
  { id: 'configuration', label: 'Configuration', icon: Power },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'status', label: 'Status', icon: Activity },
  { id: 'activity', label: 'Activity Log', icon: ListChecks },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
];

const LOG_ICONS = {
  'clock-in': LogIn,
  'clock-out': Clock,
  mode: Power,
  pin: KeyRound,
  security: ShieldCheck,
  maintenance: Wrench,
};

function timeInZone(iso, timezone) {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return '';
  }
}

export default function KioskSetup() {
  const { toast } = useToast();

  const [tab, setTab] = useState('configuration');
  const [settings, setSettings] = useState(() => kioskService.getSettings());
  const [logs, setLogs] = useState(() => kioskService.getLogs());

  const [form, setForm] = useState(() => {
    const current = kioskService.getSettings();
    return {
      location: current.location,
      deviceName: current.deviceName,
      timezone: current.timezone,
    };
  });

  const [pinModal, setPinModal] = useState(null);
  const [pinError, setPinError] = useState(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      kioskService.load().then((next) => {
        setSettings(next);
        setLogs(kioskService.getLogs());
      });
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    kioskService.load().then((next) => {
      setSettings(next);
      setLogs(kioskService.getLogs());
    });
  }, []);

  const handleSaveSettings = async () => {
    const next = await kioskService.updateSettings(form);
    setSettings(next);
    await kioskService.log('maintenance', 'Kiosk settings updated', {
      detail: `Location: ${next.location} · Device: ${next.deviceName}`,
    });
    setLogs(kioskService.getLogs());
    toast.success('Settings saved', 'Kiosk configuration has been updated.');
  };

  const handleEnableKiosk = () => {
    setPinError(null);
    setPinModal({ mode: 'create' });
  };

  const handleDisableKiosk = () => {
    setPinError(null);
    setPinModal({ mode: 'verify' });
  };

  const handlePinSubmit = async (pin) => {
    if (pinSubmitting || !pinModal) return;
    setPinSubmitting(true);
    setPinError(null);

    if (pinModal.mode === 'create') {
      await kioskService.enableKiosk(pin);
      setSettings(kioskService.getSettings());
      setLogs(kioskService.getLogs());
      setPinModal(null);
      setPinSubmitting(false);
      toast.success('Kiosk Mode enabled', 'The kiosk PIN now gates the clock-in terminal.');
      return;
    }

    const ok = await kioskService.verifyPin(pin);
    if (ok) {
      await kioskService.disableKiosk();
      setSettings(kioskService.getSettings());
      setLogs(kioskService.getLogs());
      setPinModal(null);
      setPinSubmitting(false);
      toast.success('Kiosk Mode disabled', 'The kiosk is back in setup mode.');
    } else {
      await kioskService.log('security', 'Failed attempt to unlock the kiosk (incorrect PIN)');
      setLogs(kioskService.getLogs());
      setPinError('Incorrect PIN. Please try again.');
      setPinSubmitting(false);
    }
  };

  const handleReboot = () => {
    setConfirmReboot(false);
    kioskService.log('maintenance', 'Kiosk reboot initiated');
    toast.info('Rebooting', 'Kiosk will restart momentarily.');
    setTimeout(() => {
      document.documentElement.requestFullscreen?.().catch(() => {});
      window.location.reload();
    }, 800);
  };

  const handleResetAll = async () => {
    setConfirmReset(false);
    const before = kioskService.getSettings();
    const next = await kioskService.resetAll();
    setSettings(next);
    setLogs([]);
    setForm({
      location: 'Main Entrance',
      deviceName: 'Front Door Kiosk',
      timezone: 'Asia/Manila',
    });
    toast.success('Kiosk data reset', `All kiosk data for "${before.deviceName}" was cleared.`);
  };

  const statCards = useMemo(
    () => [
      { label: 'Status', value: settings.active ? 'Active' : 'Setup Mode', icon: Power, active: settings.active },
      { label: 'Device', value: settings.deviceName, icon: MonitorSmartphone, active: true },
      { label: 'Location', value: settings.location, icon: MapPin, active: true },
      { label: 'Verification', value: 'Employee + Facial Recognition', icon: ScanFace, active: true },
    ],
    [settings]
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kiosk Management</h1>
          <p className="text-[14px] text-gray-500 mt-1">
            {settings.deviceName} · {settings.location}
          </p>
        </div>
        <Badge variant={settings.active ? 'success' : 'warning'} dot size="md">
          {settings.active ? 'Kiosk Mode Active' : 'Setup Mode'}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {TABS.map((tabItem) => {
          const Icon = tabItem.icon;
          const isActive = tab === tabItem.id;
          return (
            <button
              key={tabItem.id}
              onClick={() => setTab(tabItem.id)}
              className={clsx(
                'inline-flex items-center gap-2 px-4 h-10 rounded-xl text-[13.5px] font-medium transition-all duration-200 whitespace-nowrap',
                isActive ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/25' : 'bg-white text-gray-600 hover:bg-gray-50'
              )}
            >
              <Icon className="w-4 h-4" />
              {tabItem.label}
            </button>
          );
        })}
      </div>

      <div>
        {tab === 'configuration' && (
          <div className="space-y-5">
            {!settings.active ? (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-50 flex items-center justify-center">
                  <Power className="w-8 h-8 text-amber-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mt-4">Enable Kiosk Mode</h2>
                <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
                  This locks the entrance device to the clock-in terminal. Employees can no longer
                  access any other functions. You'll create a secret 4-digit PIN that is required to
                  unlock the clock-in terminal, and can be used again to exit kiosk mode.
                </p>
                <Button size="xl" className="mt-8 px-10" icon={Lock} onClick={handleEnableKiosk}>
                  Enable Kiosk Mode
                </Button>
                <p className="text-xs text-gray-400 mt-5 flex items-center justify-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  This happens once when the device is first deployed.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl p-8 text-center shadow-sm">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-50 flex items-center justify-center">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                </div>
                <h2 className="text-xl font-bold text-gray-900 mt-4">Kiosk Mode is Active</h2>
                <p className="text-sm text-gray-500 mt-1.5 max-w-md mx-auto">
                  The entrance device is locked behind the kiosk PIN. Tap the clock-in screen 5 times
                  rapidly, then enter the secret PIN to return to this dashboard.
                </p>
                <div className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-5 py-3 text-sm font-medium text-emerald-700">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live since {timeInZone(settings.enabledAt, settings.timezone)}
                </div>
                <div className="mt-8">
                  <Button variant="dangerOutline" icon={Power} onClick={handleDisableKiosk}>
                    Disable Kiosk Mode
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm max-w-xl">
            <h2 className="text-lg font-bold text-gray-900">Kiosk Settings</h2>
            <p className="text-sm text-gray-500 mt-1">Configure how this kiosk behaves.</p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                  placeholder="Main Entrance"
                  className="mt-2 w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-gray-900 placeholder:text-gray-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Device Name</label>
                <input
                  value={form.deviceName}
                  onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))}
                  placeholder="Front Door Kiosk"
                  className="mt-2 w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-gray-900 placeholder:text-gray-300"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Timezone</label>
                <select
                  value={form.timezone}
                  onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))}
                  className="mt-2 w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-gray-900 bg-white"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>{tz}</option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700">Verification Method</span>
                <p className="text-xs text-gray-400 mt-1">How employees verify their identity when clocking in.</p>
                <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-blue-600 bg-blue-50/50 p-4">
                  <ScanFace className="w-6 h-6 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Employee + Facial Recognition</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Employees are identified by name and verified with facial recognition. This is the
                      standard for the capstone and cannot be changed.
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button size="lg" icon={Settings} onClick={handleSaveSettings}>Save Settings</Button>
              </div>
            </div>
          </div>
        )}

        {tab === 'status' && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {statCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.label} className="bg-white rounded-2xl p-5 shadow-sm flex items-center gap-4">
                    <div className={clsx(
                      'w-12 h-12 rounded-xl flex items-center justify-center',
                      card.active === false ? 'bg-amber-50' : 'bg-blue-50'
                    )}>
                      <Icon className={clsx('w-6 h-6', card.active === false ? 'text-amber-500' : 'text-blue-600')} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wider text-gray-400">{card.label}</p>
                      <p className="text-sm font-semibold text-gray-900 mt-0.5 truncate">{card.value}</p>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900">Unlock Instructions</h3>
              <div className="mt-3 space-y-2.5">
                {[
                  { step: '1', text: 'From the clock-in terminal, tap anywhere on the screen 5 times quickly.' },
                  { step: '2', text: 'A PIN pad appears. Enter the secret 4-digit PIN created during setup.' },
                  { step: '3', text: 'The kiosk unlocks and returns to this management dashboard.' },
                ].map((item) => (
                  <div key={item.step} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-50 text-blue-600 text-xs font-bold flex items-center justify-center shrink-0">
                      {item.step}
                    </span>
                    <p className="text-sm text-gray-600">{item.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Activity Log</h2>
                <p className="text-xs text-gray-400 mt-0.5">Real-time feed of kiosk events</p>
              </div>
              <Badge variant="default" size="md">{logs.length} events</Badge>
            </div>

            {logs.length === 0 ? (
              <div className="py-16 text-center">
                <Activity className="w-10 h-10 text-gray-300 mx-auto" />
                <p className="text-sm font-medium text-gray-500 mt-3">No activity yet</p>
                <p className="text-xs text-gray-400 mt-1">Kiosk events will appear here as they happen.</p>
              </div>
            ) : (
              <ul className="divide-y divide-gray-50">
                {logs.map((entry) => {
                  const meta = LOG_TYPES[entry.type] || LOG_TYPES.maintenance;
                  const Icon = LOG_ICONS[entry.type] || Wrench;
                  return (
                    <li key={entry.id} className="flex items-start gap-4 px-6 py-4">
                      <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', meta.bg)}>
                        <Icon className={clsx('w-5 h-5', meta.color)} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{entry.message}</p>
                        {entry.detail && <p className="text-xs text-gray-500 mt-0.5">{entry.detail}</p>}
                        <p className="text-[11px] text-gray-400 mt-1">
                          {timeInZone(entry.at, settings.timezone)} · {new Date(entry.at).toLocaleTimeString()}
                        </p>
                      </div>
                      <span className={clsx('text-[10px] font-bold uppercase tracking-wider mt-1', meta.color)}>
                        {meta.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}

        {tab === 'maintenance' && (
          <div className="space-y-5 max-w-xl">
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-bold text-gray-900">Maintenance Tools</h3>
              <div className="mt-4 space-y-3">
                <button
                  onClick={() => setTab('activity')}
                  className="w-full flex items-center gap-4 rounded-2xl border border-gray-100 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                    <ListChecks className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">View Activity Log</p>
                    <p className="text-xs text-gray-500 mt-0.5">Inspect all kiosk events and security attempts</p>
                  </div>
                </button>

                <button
                  onClick={() => {
                    toast.info('Up to date', 'WorkForce Pro Kiosk is running the latest version (v1.0.0).');
                  }}
                  className="w-full flex items-center gap-4 rounded-2xl border border-gray-100 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center">
                    <RefreshCw className="w-5 h-5 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Check for Updates</p>
                    <p className="text-xs text-gray-500 mt-0.5">Verify the kiosk is running the latest software</p>
                  </div>
                </button>

                <button
                  onClick={() => setConfirmReboot(true)}
                  className="w-full flex items-center gap-4 rounded-2xl border border-gray-100 p-4 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
                    <RotateCcw className="w-5 h-5 text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Reboot Kiosk</p>
                    <p className="text-xs text-gray-500 mt-0.5">Restart the kiosk device</p>
                  </div>
                </button>

                <button
                  onClick={() => setConfirmReset(true)}
                  className="w-full flex items-center gap-4 rounded-2xl border border-red-100 p-4 text-left hover:bg-red-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-900">Reset All Kiosk Data</p>
                    <p className="text-xs text-gray-500 mt-0.5">Clear settings, PIN, and activity logs</p>
                  </div>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* PIN modal: create (enable kiosk) or verify (disable kiosk) */}
      <KioskPinModal
        isOpen={pinModal !== null}
        onClose={() => { if (!pinSubmitting) setPinModal(null); }}
        title={pinModal?.mode === 'create' ? 'Create Kiosk PIN' : 'Enter Kiosk PIN'}
        subtitle={
          pinModal?.mode === 'create'
            ? 'Choose a secret 4-digit PIN. It is required to unlock the clock-in terminal and to exit kiosk mode later.'
            : 'Enter the secret PIN to disable kiosk mode.'
        }
        onSubmit={handlePinSubmit}
        submitting={pinSubmitting}
        error={pinError}
      />

      <Modal isOpen={confirmReboot} onClose={() => setConfirmReboot(false)} title="Reboot Kiosk" size="sm">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center">
            <RotateCcw className="w-7 h-7 text-amber-500" />
          </div>
          <div>
            <p className="text-gray-900 font-semibold text-base">Are you sure you want to reboot?</p>
            <p className="text-gray-500 text-sm mt-1">The kiosk will restart and return to its locked state.</p>
          </div>
          <div className="flex items-center gap-3 mt-2 w-full">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmReboot(false)}>Cancel</Button>
            <Button variant="warning" className="flex-1" onClick={handleReboot}>Reboot</Button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={confirmReset} onClose={() => setConfirmReset(false)} title="Reset Kiosk Data" size="sm">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <div>
            <p className="text-gray-900 font-semibold text-base">Reset all kiosk data?</p>
            <p className="text-gray-500 text-sm mt-1">
              This clears the kiosk settings, the exit PIN, and every activity log. This cannot be undone.
            </p>
          </div>
          <div className="flex items-center gap-3 mt-2 w-full">
            <Button variant="outline" className="flex-1" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button variant="danger" className="flex-1" onClick={handleResetAll}>Yes, Reset</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
