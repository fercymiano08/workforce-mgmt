import { useCallback, useEffect, useRef, useState } from 'react';

export default function useWebcam() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const requestIdRef = useRef(0);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('error');
      setError({ type: 'unavailable', name: 'Unavailable', message: 'Camera access is not supported in this context.' });
      return false;
    }

    const requestId = ++requestIdRef.current;
    setStatus('requesting');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
      if (requestId !== requestIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return false;
      }
      streamRef.current = stream;
      setStatus('active');
      return true;
    } catch (err) {
      if (requestId !== requestIdRef.current) return false;
      let type = 'unknown';
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') type = 'permission';
      else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError' || err?.name === 'OverconstrainedError') type = 'noCamera';
      else if (err?.name === 'NotReadableError' || err?.name === 'TrackStartError' || err?.name === 'AbortError') type = 'readable';
      setStatus('error');
      setError({ type, name: err?.name || 'CameraError', message: err?.message || '' });
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    requestIdRef.current += 1;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
    setError(null);
  }, []);

  useEffect(() => {
    if (status === 'active' && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      const playPromise = videoRef.current.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(() => {});
      }
    }
  }, [status]);

  useEffect(() => () => stop(), [stop]);

  return { videoRef, status, error, start, stop, isActive: status === 'active' };
}
