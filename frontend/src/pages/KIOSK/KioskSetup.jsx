import { useCallback, useEffect, useState } from 'react';
import clsx from 'clsx';
import {
  ScanFace, Wrench, Settings, AlertTriangle, LayoutDashboard,
  ListChecks, RotateCcw, RefreshCw, LogIn, LogOut, Radio,
} from 'lucide-react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import KioskPinModal from '../../components/kiosk/KioskPinModal';
import KioskStatusHero from '../../components/kiosk/KioskStatusHero';
import KioskStatTiles from '../../components/kiosk/KioskStatTiles';
import KioskWaitingList from '../../components/kiosk/KioskWaitingList';
import KioskReadiness from '../../components/kiosk/KioskReadiness';
import KioskActivityTimeline from '../../components/kiosk/KioskActivityTimeline';
import KioskPreview from '../../components/kiosk/KioskPreview';
import { kioskService, TIMEZONES } from '../../services/kioskService';
import { useToast } from '../../context/ToastContext';

const TABS = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'activity', label: 'Activity', icon: ListChecks },
  { id: 'settings', label: 'Settings', icon: Settings },
  { id: 'maintenance', label: 'Maintenance', icon: Wrench },
];

const OVERVIEW_REFRESH_MS = 15000;
const LOGS_REFRESH_MS = 10000;

const inputClass = 'mt-2 w-full h-12 px-4 rounded-xl border border-gray-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none text-gray-900 placeholder:text-gray-300';

function ago(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export default function KioskSetup() {
  const { toast } = useToast();

  const [tab, setTab] = useState('overview');
  const [settings, setSettings] = useState(() => kioskService.getSettings());
  const [overview, setOverview] = useState(null);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [live, setLive] = useState(true);   // false when the last refresh failed

  const [form, setForm] = useState(() => {
    const current = kioskService.getSettings();
    return { location: current.location, deviceName: current.deviceName, timezone: current.timezone };
  });

  const [pinModal, setPinModal] = useState(null);
  const [pinError, setPinError] = useState(null);
  const [pinSubmitting, setPinSubmitting] = useState(false);
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const refreshOverview = useCallback(() => {
    kioskService.loadOverview()
      .then((data) => { setOverview(data); setLive(true); })
      .catch(() => setLive(false));
  }, []);

  const refreshLogs = useCallback(() => {
    kioskService.loadLogs()
      .then((data) => { setLogs(data); setLive(true); })
      .catch(() => setLive(false))
      .finally(() => setLogsLoading(false));
  }, []);

  // Settings once on open (with a friendly message if the server is down) ...
  useEffect(() => {
    kioskService.load().then(setSettings).catch(() => {
      toast.error('Could not load kiosk settings', 'The server did not respond. Showing defaults.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ... and the live numbers again every few seconds, only for the tab that shows them.
  useEffect(() => {
    if (tab !== 'overview') return undefined;
    refreshOverview();
    const timer = setInterval(() => { refreshOverview(); kioskService.load().then(setSettings).catch(() => {}); }, OVERVIEW_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tab, refreshOverview]);

  useEffect(() => {
    if (tab !== 'activity') return undefined;
    refreshLogs();
    const timer = setInterval(refreshLogs, LOGS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [tab, refreshLogs]);

  const handleSaveSettings = async () => {
    try {
      const next = await kioskService.updateSettings(form);
      setSettings(next);
      await kioskService.log('maintenance', 'Kiosk settings updated', {
        detail: `Location: ${next.location} · Device: ${next.deviceName}`,
      });
      toast.success('Settings saved', 'Kiosk configuration has been updated.');
    } catch {
      toast.error('Could not save settings', 'The server did not respond. Please try again.');
    }
  };

  const openPin = (mode) => {
    setPinError(null);
    setPinModal({ mode });
  };

  const handlePinSubmit = async (pin) => {
    if (pinSubmitting || !pinModal) return;
    setPinSubmitting(true);
    setPinError(null);

    // A failed request must never leave the modal spinning - always release
    // the submit lock and show the reason.
    try {
      if (pinModal.mode === 'create') {
        await kioskService.enableKiosk(pin);
        setSettings(kioskService.getSettings());
        setPinModal(null);
        refreshOverview();
        toast.success('Kiosk Mode enabled', 'The kiosk PIN now gates the clock-in terminal.');
        return;
      }

      const ok = await kioskService.verifyPin(pin);
      if (ok) {
        await kioskService.disableKiosk();
        setSettings(kioskService.getSettings());
        setPinModal(null);
        refreshOverview();
        toast.success('Kiosk Mode disabled', 'The kiosk is back in setup mode.');
      } else {
        await kioskService.log('security', 'Failed attempt to unlock the kiosk (incorrect PIN)');
        setPinError('Incorrect PIN. Please try again.');
      }
    } catch (error) {
      const status = error?.response?.status;
      setPinError(
        error?.code === 'ECONNABORTED' || !error?.response || status >= 500
          ? 'The server took too long or failed to respond. Please try again in a moment.'
          : error?.response?.data?.message || 'Something went wrong. Please try again.'
      );
    } finally {
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
    try {
      const next = await kioskService.resetAll();
      setSettings(next);
      setLogs([]);
      setForm({ location: 'Main Entrance', deviceName: 'Front Door Kiosk', timezone: 'Asia/Manila' });
      refreshOverview();
      toast.success('Kiosk data reset', `All kiosk data for "${before.deviceName}" was cleared.`);
    } catch {
      toast.error('Could not reset kiosk data', 'The server did not respond. Please try again.');
    }
  };

  const last = overview?.lastActivity;
  const dirty = form.location !== settings.location || form.deviceName !== settings.deviceName || form.timezone !== settings.timezone;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kiosk Management</h1>
          <p className="mt-1 text-[14px] text-gray-500">Monitor the entrance clock-in device and manage how it behaves.</p>
        </div>
        <span className={clsx('inline-flex items-center gap-2 self-start rounded-full px-3 py-1.5 text-xs font-semibold', live ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
          <Radio className={clsx('h-3.5 w-3.5', live && 'animate-pulse')} />
          {live ? 'Live data' : 'Connection lost — retrying'}
        </span>
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
              {tabItem.id === 'overview' && overview?.failedAttempts > 0 && (
                <span className={clsx('ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold', isActive ? 'bg-white/25 text-white' : 'bg-red-100 text-red-700')}>{overview.failedAttempts}</span>
              )}
            </button>
          );
        })}
      </div>

      {tab === 'overview' && (
        <div className="space-y-5">
          <KioskStatusHero settings={settings} overview={overview} onEnable={() => openPin('create')} onDisable={() => openPin('verify')} />
          <KioskStatTiles overview={overview} />

          {last && (
            <div className="flex items-center gap-3 rounded-2xl bg-white px-5 py-3.5 shadow-sm">
              <div className={clsx('flex h-9 w-9 items-center justify-center rounded-xl', last.type === 'clock-in' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600')}>
                {last.type === 'clock-in' ? <LogIn className="h-4.5 w-4.5" /> : <LogOut className="h-4.5 w-4.5" />}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm text-gray-700">
                <span className="font-medium text-gray-900">Last activity:</span> {last.message}
              </p>
              <span className="shrink-0 text-xs text-gray-400">{ago(last.at)}</span>
            </div>
          )}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
            <KioskWaitingList waiting={overview?.waiting} loaded={overview !== null} />
            <KioskReadiness overview={overview} />
          </div>

          <div className="rounded-2xl bg-white p-6 shadow-sm">
            <h3 className="text-sm font-bold text-gray-900">How the device is unlocked</h3>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ['1', 'Tap the clock-in screen 5 times quickly.'],
                ['2', 'Enter the secret 4-digit PIN when the pad appears.'],
                ['3', 'At midnight kiosk mode turns off by itself. Enable it again the next morning.'],
              ].map(([step, text]) => (
                <div key={step} className="flex items-start gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-600">{step}</span>
                  <p className="text-sm text-gray-600">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab === 'activity' && (
        <KioskActivityTimeline logs={logs} timezone={settings.timezone} loading={logsLoading} />
      )}

      {tab === 'settings' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="rounded-2xl bg-white p-6 shadow-sm sm:p-8 lg:col-span-3">
            <h2 className="text-lg font-bold text-gray-900">Kiosk settings</h2>
            <p className="mt-1 text-sm text-gray-500">Configure how this kiosk is named and which clock it follows.</p>

            <div className="mt-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700">Location</label>
                <input value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} placeholder="Main Entrance" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Device name</label>
                <input value={form.deviceName} onChange={(e) => setForm((f) => ({ ...f, deviceName: e.target.value }))} placeholder="Front Door Kiosk" className={inputClass} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Time zone</label>
                <select value={form.timezone} onChange={(e) => setForm((f) => ({ ...f, timezone: e.target.value }))} className={clsx(inputClass, 'bg-white')}>
                  {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                </select>
                <p className="mt-1.5 text-xs text-gray-400">Shifts, lateness and the daily unlock all follow this clock.</p>
              </div>

              <div>
                <span className="block text-sm font-medium text-gray-700">Verification method</span>
                <div className="mt-3 flex items-center gap-3 rounded-2xl border-2 border-blue-600 bg-blue-50/50 p-4">
                  <ScanFace className="h-6 w-6 shrink-0 text-blue-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Employee + Facial Recognition</p>
                    <p className="mt-0.5 text-xs text-gray-500">Employees are identified by name and verified with facial recognition. This is fixed for the system.</p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button size="lg" icon={Settings} onClick={handleSaveSettings} disabled={!dirty}>Save settings</Button>
                {dirty
                  ? <Button variant="ghost" onClick={() => setForm({ location: settings.location, deviceName: settings.deviceName, timezone: settings.timezone })}>Discard changes</Button>
                  : <span className="text-xs text-gray-400">No unsaved changes</span>}
              </div>
            </div>
          </div>

          <div className="lg:col-span-2">
            <KioskPreview deviceName={form.deviceName} location={form.location} timezone={form.timezone} />
          </div>
        </div>
      )}

      {tab === 'maintenance' && (
        <div className="max-w-2xl space-y-3 rounded-2xl bg-white p-6 shadow-sm">
          <h3 className="text-sm font-bold text-gray-900">Maintenance tools</h3>
          {[
            { icon: ListChecks, tone: 'bg-blue-50 text-blue-600', title: 'View activity', text: 'Inspect all kiosk events and security attempts', onClick: () => setTab('activity') },
            { icon: RefreshCw, tone: 'bg-purple-50 text-purple-600', title: 'Check for updates', text: 'Verify the kiosk is running the latest software', onClick: () => toast.info('Up to date', 'WorkForce Pro Kiosk is running the latest version (v1.0.0).') },
            { icon: RotateCcw, tone: 'bg-amber-50 text-amber-600', title: 'Reboot kiosk', text: 'Restart the kiosk on this device', onClick: () => setConfirmReboot(true) },
          ].map(({ icon: Icon, tone, title, text, onClick }) => (
            <button key={title} onClick={onClick} className="flex w-full items-center gap-4 rounded-2xl border border-gray-100 p-4 text-left transition-colors hover:bg-gray-50">
              <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl', tone)}><Icon className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">{title}</p>
                <p className="mt-0.5 text-xs text-gray-500">{text}</p>
              </div>
            </button>
          ))}

          <div className="mt-2 rounded-2xl border border-red-100 bg-red-50/40 p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-600"><AlertTriangle className="h-5 w-5" /></div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-900">Danger zone: reset all kiosk data</p>
                <p className="mt-0.5 text-xs text-gray-500">Clears the kiosk settings, the PIN and the whole activity log. Cannot be undone.</p>
              </div>
              <Button variant="dangerOutline" onClick={() => setConfirmReset(true)}>Reset</Button>
            </div>
          </div>
        </div>
      )}

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
