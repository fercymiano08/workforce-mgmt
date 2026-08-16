import { useEffect, useRef, useState, useCallback } from 'react';
import {
  ScanFace, Camera, RefreshCw, Check, AlertTriangle, VideoOff, Loader2, X, Upload, Video,
} from 'lucide-react';
import clsx from 'clsx';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import useWebcam from '../../hooks/useWebcam';
import { getFaceDescriptor, loadImageFileToCanvas, loadModels } from '../../services/faceMatchService';

const ERROR_MESSAGES = {
  permission: {
    title: 'Camera Permission Required',
    message: 'Please allow camera access in your browser to register a face photo.',
    retry: true,
  },
  noCamera: {
    title: 'No Camera Detected',
    message: 'No webcam was found on this device. Connect a webcam and try again.',
    retry: false,
  },
  readable: {
    title: 'Camera Unavailable',
    message: 'Your camera is currently in use by another application. Close it and try again.',
    retry: true,
  },
  unavailable: {
    title: 'Camera Access Unavailable',
    message: 'Camera access is not supported in this browser or context (use HTTPS or localhost).',
    retry: true,
  },
  unknown: {
    title: 'Camera Error',
    message: 'Something went wrong while accessing your camera. Please try again.',
    retry: true,
  },
};

/**
 * Face Registration capture modal.
 *
 * Two capture modes - live camera, or upload an existing photo file - both
 * converge on the same pipeline: run face-api.js locally in the browser to
 * compute a 128-value face descriptor, then hand both the preview image and
 * descriptor back via onCapture(dataUrl, descriptor). The descriptor is what
 * the kiosk compares against later for real face matching - not just a
 * stored photo. There is still no liveness/anti-spoofing check (blink/motion
 * detection); this only verifies "does this face match the registered one."
 */
export default function FaceCaptureModal({ isOpen, employeeId, employeeName, onCapture, onClose }) {
  const { videoRef, status, error, start, stop } = useWebcam();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('camera');
  const [capturedImage, setCapturedImage] = useState(null);
  const [descriptor, setDescriptor] = useState(null);
  const [detecting, setDetecting] = useState(false);
  const [noFaceDetected, setNoFaceDetected] = useState(false);
  const [uploadError, setUploadError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    // Warm up the face-api models as soon as the modal opens (in parallel
    // with camera startup) so the actual scan, whenever it's triggered,
    // isn't also waiting on a multi-MB model download.
    loadModels();
    const run = async () => {
      setCapturedImage(null);
      setDescriptor(null);
      setNoFaceDetected(false);
      setUploadError(null);
      if (cancelled || mode !== 'camera') return;
      await start();
    };
    run();
    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, mode]);

  const switchMode = (next) => {
    if (next === mode) return;
    stop();
    setCapturedImage(null);
    setDescriptor(null);
    setNoFaceDetected(false);
    setUploadError(null);
    setMode(next);
  };

  const runDetection = useCallback(async (source, dataUrl) => {
    setCapturedImage(dataUrl);
    setDetecting(true);
    setNoFaceDetected(false);
    try {
      const result = await getFaceDescriptor(source);
      setDescriptor(result);
      setNoFaceDetected(!result);
    } catch {
      setNoFaceDetected(true);
    } finally {
      setDetecting(false);
    }
  }, []);

  const handleCapture = useCallback(async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const sx = (video.videoWidth - size) / 2;
    const sy = (video.videoHeight - size) / 2;
    ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

    stop();
    await runDetection(canvas, canvas.toDataURL('image/jpeg', 0.9));
  }, [videoRef, stop, runDetection]);

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadError(null);
    try {
      const canvas = await loadImageFileToCanvas(file);
      await runDetection(canvas, canvas.toDataURL('image/jpeg', 0.9));
    } catch {
      setUploadError('Could not read that file. Please choose an image.');
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setDescriptor(null);
    setNoFaceDetected(false);
    if (mode === 'camera') start();
  };

  const handleConfirm = () => {
    if (!capturedImage || !descriptor) return;
    onCapture?.(capturedImage, descriptor);
  };

  const handleClose = () => {
    stop();
    onClose?.();
  };

  const errorInfo = ERROR_MESSAGES[error?.type] || ERROR_MESSAGES.unknown;
  const isActive = status === 'active';
  const showModeTabs = !capturedImage && !(mode === 'camera' && status === 'error');

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Register Face" size="sm">
      <div className="flex items-center gap-2 -mt-1 mb-4">
        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
          <ScanFace className="w-5 h-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{employeeName || 'New Employee'}</p>
          <p className="text-xs text-gray-400">{employeeId}</p>
        </div>
      </div>

      {showModeTabs && (
        <div className="flex items-center gap-1 p-1 mb-4 bg-gray-100 rounded-xl">
          {[
            { id: 'camera', label: 'Use Camera', icon: Video },
            { id: 'upload', label: 'Upload Photo', icon: Upload },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => switchMode(tab.id)}
              className={clsx(
                'flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-medium transition-colors',
                mode === tab.id ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {mode === 'camera' && status === 'error' ? (
        <div className="flex flex-col items-center text-center gap-4 py-4">
          <div className={`w-14 h-14 rounded-full flex items-center justify-center ${error?.type === 'noCamera' ? 'bg-gray-100' : 'bg-red-50'}`}>
            {error?.type === 'noCamera' ? (
              <VideoOff className="w-7 h-7 text-gray-500" />
            ) : (
              <AlertTriangle className="w-7 h-7 text-red-500" />
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">{errorInfo.title}</h3>
            <p className="text-xs text-gray-500 mt-1.5 max-w-xs">{errorInfo.message}</p>
          </div>
          <div className="flex items-center gap-3 w-full mt-1">
            <Button variant="outline" className="flex-1" icon={Upload} onClick={() => switchMode('upload')}>Upload Instead</Button>
            {errorInfo.retry && (
              <Button variant="primary" className="flex-1" icon={RefreshCw} onClick={start}>Retry</Button>
            )}
          </div>
        </div>
      ) : capturedImage ? (
        <>
          <div className="relative rounded-2xl overflow-hidden bg-gray-900 aspect-square">
            <img src={capturedImage} alt="Captured face preview" className="w-full h-full object-cover" />
            {detecting && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/40 text-white/90">
                <Loader2 className="w-6 h-6 animate-spin" />
                <p className="text-xs font-medium">Analyzing face...</p>
              </div>
            )}
          </div>
          {noFaceDetected ? (
            <p className="text-center text-xs text-red-500 mt-3 flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> No face detected in this photo. Please try again.
            </p>
          ) : (
            <p className="text-center text-[11px] text-gray-400 mt-3">
              Review the photo below. This face is what the kiosk will match against at clock-in.
            </p>
          )}
          <div className="flex items-center gap-3 mt-4">
            <Button variant="outline" className="flex-1" icon={RefreshCw} onClick={handleRetake}>
              {mode === 'camera' ? 'Retake' : 'Choose Another'}
            </Button>
            <Button
              variant="primary"
              className="flex-1"
              icon={Check}
              disabled={detecting || !descriptor}
              onClick={handleConfirm}
            >
              Confirm Registration
            </Button>
          </div>
        </>
      ) : mode === 'upload' ? (
        <>
          <label className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 aspect-square cursor-pointer hover:border-blue-300 hover:bg-blue-50/40 transition-colors">
            <div className="w-14 h-14 rounded-2xl bg-white border border-gray-200 flex items-center justify-center">
              <Upload className="w-6 h-6 text-gray-400" />
            </div>
            <div className="text-center px-6">
              <p className="text-sm font-medium text-gray-700">Click to choose a photo</p>
              <p className="text-xs text-gray-400 mt-1">A clear, front-facing photo works best</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileSelected} />
          </label>
          {uploadError && (
            <p className="text-center text-xs text-red-500 mt-3 flex items-center justify-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> {uploadError}
            </p>
          )}
          <div className="flex items-center gap-3 mt-4">
            <Button variant="outline" className="flex-1" icon={X} onClick={handleClose}>Cancel</Button>
          </div>
        </>
      ) : (
        <>
          <div className="relative rounded-2xl overflow-hidden bg-[#0B1F3A] aspect-square">
            <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
            {!isActive && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
                <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
                <p className="text-xs font-medium tracking-wide">
                  {status === 'requesting' ? 'Requesting camera access...' : 'Starting camera...'}
                </p>
              </div>
            )}
            {isActive && (
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-[62%] aspect-square rounded-full border-2 border-dashed border-blue-400/80" />
                <div className="absolute left-4 top-4 w-8 h-8 border-l-2 border-t-2 border-blue-400 rounded-tl-lg" />
                <div className="absolute right-4 top-4 w-8 h-8 border-r-2 border-t-2 border-blue-400 rounded-tr-lg" />
                <div className="absolute left-4 bottom-4 w-8 h-8 border-l-2 border-b-2 border-blue-400 rounded-bl-lg" />
                <div className="absolute right-4 bottom-4 w-8 h-8 border-r-2 border-b-2 border-blue-400 rounded-br-lg" />
              </div>
            )}
          </div>
          <p className="text-center text-[11px] text-gray-400 mt-3">
            Position your face inside the frame, then capture. Camera feed is processed locally and never leaves this device.
          </p>
          <div className="flex items-center gap-3 mt-4">
            <Button variant="outline" className="flex-1" icon={X} onClick={handleClose}>Cancel</Button>
            <Button variant="primary" className="flex-1" icon={Camera} onClick={handleCapture} disabled={!isActive}>
              Capture
            </Button>
          </div>
        </>
      )}

      <canvas ref={canvasRef} className="hidden" />
    </Modal>
  );
}
