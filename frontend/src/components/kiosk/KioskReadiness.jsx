import { useState } from 'react';
import { Link } from 'react-router-dom';
import clsx from 'clsx';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Camera, ArrowRight } from 'lucide-react';
import Button from '../ui/Button';
import { loadModels } from '../../services/faceMatchService';

const ICON = {
  ok: { Icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' },
  warn: { Icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  bad: { Icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
  wait: { Icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50' },
};

function Row({ state, title, detail, action }) {
  const { Icon, color, bg } = ICON[state];
  return (
    <li className="flex items-center gap-3.5 py-3">
      <div className={clsx('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', bg)}>
        <Icon className={clsx('h-5 w-5', color, state === 'wait' && 'animate-spin')} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{title}</p>
        <p className="text-xs text-gray-500">{detail}</p>
      </div>
      {action}
    </li>
  );
}

// "Is the kiosk ready?" in four rows. The first three come from the server; the camera and the face
// models can only be tested in this browser, so they have a button.
export default function KioskReadiness({ overview }) {
  const r = overview?.readiness;
  const [hardware, setHardware] = useState({ state: 'idle', detail: 'Not tested yet. Run this on the device that will be the kiosk.' });

  const runHardwareCheck = async () => {
    setHardware({ state: 'wait', detail: 'Checking the camera and loading the face models...' });
    const problems = [];
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      problems.push('the camera is not available or permission was refused');
    }
    try {
      await loadModels();
    } catch {
      problems.push('the face recognition models could not be loaded');
    }
    setHardware(problems.length
      ? { state: 'bad', detail: `Problem: ${problems.join(' and ')}.` }
      : { state: 'ok', detail: 'Camera works and the face models are loaded on this device.' });
  };

  const faces = r ? r.activeEmployees - r.withoutFace : 0;
  const total = r?.activeEmployees ?? 0;

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <h3 className="text-sm font-bold text-gray-900">Readiness check</h3>
      <p className="mt-0.5 text-xs text-gray-400">Everything the kiosk needs before people arrive</p>

      <ul className="mt-2 divide-y divide-gray-50">
        <Row
          state={!r ? 'wait' : r.pinSet ? 'ok' : 'bad'}
          title="Access PIN"
          detail={!r ? 'Checking...' : r.pinSet ? 'A PIN is set. Devices unlock with it once a day.' : 'No PIN yet. Enable kiosk mode to create one.'}
        />
        <Row
          state={!r ? 'wait' : r.kioskActive ? 'ok' : 'warn'}
          title="Kiosk mode"
          detail={!r ? 'Checking...' : r.kioskActive ? 'On. The entrance device accepts clock-ins.' : 'Off. Clock-ins are disabled until it is enabled.'}
        />
        <Row
          state={!r ? 'wait' : r.withoutFace === 0 ? 'ok' : 'warn'}
          title="Faces registered"
          detail={!r ? 'Checking...' : r.withoutFace === 0
            ? `All ${total} active employees can use the kiosk.`
            : `${faces} of ${total} active employees are registered. ${r.withoutFace} cannot clock in yet.`}
          action={r && r.withoutFace > 0 ? (
            <Link to="/employees" className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700">
              Fix <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ) : null}
        />
        <Row
          state={hardware.state === 'idle' ? 'warn' : hardware.state}
          title="Camera and face models"
          detail={hardware.detail}
          action={(
            <Button variant="outline" size="sm" icon={Camera} onClick={runHardwareCheck} disabled={hardware.state === 'wait'}>
              {hardware.state === 'idle' ? 'Run check' : 'Re-check'}
            </Button>
          )}
        />
      </ul>
    </div>
  );
}
