import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  X, ScanFace, Camera, Scan, Fingerprint, UserCheck, ShieldCheck,
  Loader2, AlertTriangle, VideoOff, RefreshCw, BadgeCheck, CheckCircle2,
} from 'lucide-react';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import FaceScanOverlay from './FaceScanOverlay';
import useWebcam from '../../hooks/useWebcam';
import {
  FACE_VERIFICATION_STEPS,
  verifyFace,
} from '../../services/faceVerificationService';
import { getFaceDescriptor, loadModels } from '../../services/faceMatchService';

// Frames sent per scan (the server needs them all to agree), and how many tries to get them.
const SCAN_FRAMES = 3;
const SCAN_ATTEMPTS = 6;
// How long the "Verified" result stays up: long enough for the person to SEE that their face was
// checked and whose it matched (at 0.2 s it was invisible, and people thought no scan had happened).
const RESULT_HOLD_MS = 1500;
// A beat to get ready before anything is read from the camera. The scan itself is quick, which is
// the point - but it used to begin the instant the preview appeared, so the first frames were taken
// while the person was still walking up, turning their face, or looking at the screen to see what
// was happening. Those frames are the ones most likely to be a blur, and a blur is either a wasted
// retry or a false "that is not you". Three seconds of visible countdown, showing their own face,
// fixes that without making the check itself any slower.
const PREP_SECONDS = 3;

const STEP_ICONS = {
  camera: Camera,
  detect: ScanFace,
  scan: Scan,
  liveness: Fingerprint,
  match: UserCheck,
  verified: ShieldCheck,
};

const ERROR_MESSAGES = {
  permission: {
    title: 'Camera Permission Required',
    message: 'Camera access is required for attendance verification. Please allow camera access and try again.',
    retry: true,
  },
  noCamera: {
    title: 'No Camera Detected',
    message: 'No webcam was detected on this device. Attendance verification requires a camera. Please connect a webcam and try again.',
    retry: false,
  },
  readable: {
    title: 'Camera Unavailable',
    message: 'Your camera is currently in use by another application. Please close it and try again.',
    retry: true,
  },
  unavailable: {
    title: 'Camera Access Unavailable',
    message: 'Camera access is not supported in this browser or context. Please use a secure context (HTTPS or localhost).',
    retry: true,
  },
  unknown: {
    title: 'Camera Error',
    message: 'Something went wrong while accessing your camera. Please try again.',
    retry: true,
  },
};

function getInitials(name = '') {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function waitForVideo(video, timeoutMs = 6000) {
  return new Promise((resolve) => {
    if (!video) return resolve(false);
    if (video.readyState >= 2 && video.videoWidth > 0) return resolve(true);
    const startedAt = Date.now();
    const check = () => {
      if (video.readyState >= 2 && video.videoWidth > 0) return resolve(true);
      if (Date.now() - startedAt >= timeoutMs) return resolve(false);
      requestAnimationFrame(check);
    };
    check();
  });
}

export default function FaceRecognitionModal({ isOpen, employeeName, employeeId, onComplete, onClose, onMismatch }) {
  const { videoRef, error, start, stop, isActive } = useWebcam();
  const [runId, setRunId] = useState(0);
  const [phase, setPhase] = useState('initializing');
  const [prepLeft, setPrepLeft] = useState(PREP_SECONDS);
  const [stepIndex, setStepIndex] = useState(0);
  const [result, setResult] = useState(null);
  const [verifyError, setVerifyError] = useState(null);
  const onCompleteRef = useRef(onComplete);
  const onMismatchRef = useRef(onMismatch);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    onMismatchRef.current = onMismatch;
  }, [onMismatch]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const controller = new AbortController();
    let completeTimer;
    let prepTimer;

    const run = async () => {
      setPhase('initializing');
      setStepIndex(0);
      setPrepLeft(PREP_SECONDS);
      setResult(null);
      setVerifyError(null);

      // Warm up the face-api models in parallel with requesting camera
      // access, so they're already loaded by the time the real scan runs.
      loadModels().catch(() => {});

      try {
        const started = await start();
        if (cancelled) return;
        if (!started) {
          setPhase('error');
          return;
        }

        // Wait until the <video> is actually painting frames before
        // snapshotting it - running detection on a not-yet-ready stream
        // makes face-api fail (zero-size canvas / no frames).
        const ready = await waitForVideo(videoRef.current);
        if (cancelled) return;
        if (!ready) {
          setVerifyError('The camera is taking too long to start. Please try again.');
          setPhase('error');
          return;
        }

        // "Get ready" countdown, with the live preview already on screen so the person can centre
        // themselves. Nothing is captured or sent during this: it is purely time to prepare.
        setPhase('preparing');
        for (let remaining = PREP_SECONDS; remaining > 0; remaining -= 1) {
          if (cancelled) return;
          setPrepLeft(remaining);
          await new Promise((resolve) => { prepTimer = setTimeout(resolve, 1000); });
        }
        if (cancelled) return;
        setPrepLeft(0);

        setPhase('verifying');

        // Several separate frames, not one snapshot: the server averages them and
        // checks they all show the same face, so one lucky frame cannot pass.
        const descriptors = [];
        try {
          await loadModels();
          // getFaceDescriptor never throws (it resolves null when no face is found).
          for (let attempt = 0; attempt < SCAN_ATTEMPTS && descriptors.length < SCAN_FRAMES; attempt += 1) {
            if (cancelled) return;
            const descriptor = await getFaceDescriptor(videoRef.current);
            if (descriptor) descriptors.push(Array.from(descriptor));
            await new Promise((resolve) => setTimeout(resolve, 150));
          }
        } catch {
          setVerifyError('Face recognition models could not be loaded. Please try again.');
          setPhase('error');
          return;
        }
        if (cancelled) return;

        if (descriptors.length < SCAN_FRAMES) {
          setVerifyError('No face detected. Make sure your face is well-lit, centered, and close enough to fill most of the camera frame, then try again.');
          setPhase('error');
          return;
        }

        const verification = await verifyFace({
          employeeId,
          descriptors,
          signal: controller.signal,
          onStep: (index) => {
            if (!cancelled) setStepIndex(index);
          },
        });
        if (cancelled) return;
        if (!verification.ok) {
          // A mismatched face means the person in the frame is not the
          // registered employee. Hand that off to the kiosk so it can warn
          // them to stop (with escalation) instead of a generic retry error.
          // A locked-out reader goes the same way: the kiosk owns the countdown
          // and the "too many attempts" screen, so the rule is shown in one place.
          if (verification.code === 'mismatch' || verification.code === 'face-locked') {
            onMismatchRef.current?.(verification);
            return;
          }
          setVerifyError(verification.message || 'Face verification failed.');
          setPhase('error');
          return;
        }

        setResult(verification.data);
        setPhase('result');
        completeTimer = setTimeout(() => {
          if (!cancelled) onCompleteRef.current(verification.data);
        }, RESULT_HOLD_MS);
      } catch {
        if (cancelled) return;
        setVerifyError('Face verification failed. Please try again.');
        setPhase('error');
      }
    };

    run();

    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(completeTimer);
      clearTimeout(prepTimer);
      stop();
    };
  }, [isOpen, runId, start, stop, employeeId, videoRef]);

  const handleClose = () => {
    stop();
    onClose?.();
  };

  const handleRetry = () => {
    setRunId((id) => id + 1);
  };

  if (!isOpen) return null;

  const errorInfo = ERROR_MESSAGES[error?.type] || ERROR_MESSAGES.unknown;
  const progress = Math.round(((stepIndex + 1) / FACE_VERIFICATION_STEPS.length) * 100);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn" onMouseDown={handleClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl animate-scaleIn max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <ScanFace className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-[15px] font-semibold text-gray-900">AI Face Verification</h2>
              <p className="text-xs text-gray-400">Secure attendance confirmation</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {phase === 'error' ? (
            <div className="flex flex-col items-center text-center gap-4 py-2">
              <div
                className={clsx(
                  'w-14 h-14 rounded-full flex items-center justify-center',
                  error?.type === 'noCamera' ? 'bg-gray-100' : 'bg-red-50'
                )}
              >
                {error?.type === 'noCamera' ? (
                  <VideoOff className="w-7 h-7 text-gray-500" />
                ) : (
                  <AlertTriangle className="w-7 h-7 text-red-500" />
                )}
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {verifyError ? 'Verification Failed' : errorInfo.title}
                </h3>
                <p className="text-sm text-gray-500 mt-1.5 max-w-sm">
                  {verifyError || errorInfo.message}
                </p>
              </div>
              <div className="flex items-center gap-3 w-full mt-1">
                <Button variant="outline" className="flex-1" onClick={handleClose}>Close</Button>
                {errorInfo.retry && (
                  <Button variant="primary" className="flex-1" icon={RefreshCw} onClick={handleRetry}>Retry</Button>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="relative rounded-2xl overflow-hidden bg-[#0B1F3A] aspect-[4/3]">
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
                {!isActive && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                    <p className="text-xs font-medium tracking-wide">
                      {phase === 'initializing' ? 'Requesting camera access...' : 'Starting camera...'}
                    </p>
                  </div>
                )}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-4 top-4 w-8 h-8 border-l-2 border-t-2 border-blue-400 rounded-tl-lg" />
                  <div className="absolute right-4 top-4 w-8 h-8 border-r-2 border-t-2 border-blue-400 rounded-tr-lg" />
                  <div className="absolute left-4 bottom-4 w-8 h-8 border-l-2 border-b-2 border-blue-400 rounded-bl-lg" />
                  <div className="absolute right-4 bottom-4 w-8 h-8 border-r-2 border-b-2 border-blue-400 rounded-br-lg" />
                  {isActive && (
                    <FaceScanOverlay
                      state={phase === 'result' && result ? 'success' : phase === 'verifying' ? 'scanning' : 'idle'}
                    />
                  )}
                  {phase === 'preparing' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0B1F3A]/55 animate-fadeIn">
                      <p className="text-3xl font-bold text-white tabular-nums drop-shadow-lg">{prepLeft}</p>
                      <p className="text-xs font-semibold text-white tracking-wide text-center px-6">
                        Get ready
                      </p>
                      <p className="text-[11px] text-white/70 text-center px-6 leading-snug">
                        Look at the camera and center your face
                      </p>
                    </div>
                  )}
                  {phase === 'result' && result && (
                    <div className="absolute inset-x-0 bottom-3 flex justify-center animate-fadeIn">
                      <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/90 px-3 py-1 text-white">
                        <BadgeCheck className="w-4 h-4" />
                        <p className="text-xs font-semibold tracking-wide">Identity Confirmed</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-5 space-y-1">
                {FACE_VERIFICATION_STEPS.map((step, index) => {
                  const done = index < stepIndex;
                  // Only light up during the real check: during the "get ready" countdown the
                  // steps are not running yet, and showing one spinning would be a lie.
                  const active = index === stepIndex && phase === 'verifying';
                  const StepIcon = STEP_ICONS[step.icon] || ScanFace;
                  return (
                    <div
                      key={step.id}
                      className={clsx(
                        'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors',
                        active && 'bg-blue-50'
                      )}
                    >
                      <span
                        className={clsx(
                          'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors',
                          done ? 'bg-emerald-50' : active ? 'bg-blue-600' : 'bg-gray-100'
                        )}
                      >
                        {done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : active ? (
                          <Loader2 className="w-4 h-4 animate-spin text-white" />
                        ) : (
                          <StepIcon className="w-4 h-4 text-gray-400" />
                        )}
                      </span>
                      <span
                        className={clsx(
                          'text-sm transition-colors',
                          done ? 'text-gray-500' : active ? 'font-medium text-gray-900' : 'text-gray-400'
                        )}
                      >
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              {phase === 'verifying' && (
                <div className="mt-5">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-gray-500 font-medium">Verifying identity</span>
                    <span className="text-blue-600 font-semibold tabular-nums">{progress}%</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300 ease-out"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              )}

              {phase === 'result' && result && (
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 animate-fadeIn">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-600 to-blue-500 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                        {getInitials(employeeName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">Verified Employee</p>
                        <p className="text-sm font-semibold text-gray-900 truncate">{employeeName}</p>
                      </div>
                    </div>
                    <Badge variant="success" dot size="sm" className="shrink-0">
                      <span className="flex items-center gap-1"><BadgeCheck className="w-3.5 h-3.5" /> Verified</span>
                    </Badge>
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white border border-emerald-100 p-3 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Confidence</p>
                      <p className="text-lg font-bold text-emerald-600 mt-1 tabular-nums">{result.confidence}%</p>
                    </div>
                    <div className="rounded-xl bg-white border border-emerald-100 p-3 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Liveness</p>
                      <p className={clsx('text-lg font-bold mt-1', result.liveness === 'Not Checked' ? 'text-gray-400' : 'text-emerald-600')}>{result.liveness}</p>
                    </div>
                    <div className="rounded-xl bg-white border border-emerald-100 p-3 text-center">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Approval</p>
                      <p className="text-lg font-bold text-emerald-600 mt-1">{result.approval}</p>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-center text-[11px] text-gray-400 mt-5">
                Face matching runs locally in your browser against the registered photo. Your camera feed never leaves this device.
              </p>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
