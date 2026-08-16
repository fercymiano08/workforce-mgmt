import http from './http';

export const FACE_VERIFICATION_STEPS = [
  { id: 'camera', label: 'Initializing Camera...', icon: 'camera' },
  { id: 'detect', label: 'Detecting Face...', icon: 'detect' },
  { id: 'scan', label: 'Scanning Facial Features...', icon: 'scan' },
  { id: 'liveness', label: 'Performing Liveness Check...', icon: 'liveness' },
  { id: 'match', label: 'Matching Employee Identity...', icon: 'match' },
  { id: 'verified', label: 'Face Successfully Verified', icon: 'verified' },
];

// Steps tick fast so the scan feels instant - the real latency is the
// server round-trip, not the on-screen animation.
const STEP_DURATION_MS = 180;

// Runs the verification flow against the backend. Real identity matching
// happens server-side (POST /api/kiosk/verify-face), comparing the live
// descriptor (computed locally by face-api.js) against the one captured at
// registration. The step animation is a client-side affordance shown while
// the request is in flight - it does not represent separate real checks.
// Returns { ok: true, data } on success or { ok: false, message } on failure.
export async function verifyFace({ employeeId, descriptor, signal, onStep }) {
  let currentStep = 0;

  const tick = () => {
    if (signal?.aborted) return;
    onStep?.(currentStep);
    currentStep += 1;
  };

  tick();
  const timer = setInterval(() => {
    tick();
    if (currentStep >= FACE_VERIFICATION_STEPS.length) {
      clearInterval(timer);
    }
  }, STEP_DURATION_MS);

  if (!descriptor) {
    clearInterval(timer);
    return { ok: false, code: 'no-face', message: 'No face detected. Please center your face in the frame and try again.' };
  }

  try {
    const response = await http.post('/kiosk/verify-face', { employeeId, descriptor }, { signal });
    return { ok: true, data: response.data };
  } catch (error) {
    if (signal?.aborted) return { ok: false, aborted: true };
    const status = error.response?.status;
    const code = status === 401 ? 'mismatch'
      : status === 404 ? 'not-found'
      : status === 422 ? 'not-registered'
      : 'unknown';
    return {
      ok: false,
      code,
      message: error.response?.data?.message || 'Face verification failed. Please try again.',
    };
  } finally {
    clearInterval(timer);
  }
}
