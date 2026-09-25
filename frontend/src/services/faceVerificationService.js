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
const STEP_DURATION_MS = 110;

// Runs the verification flow against the backend. Real identity matching
// happens server-side (POST /api/kiosk/verify-face), comparing several live
// descriptors (computed locally by face-api.js, one per camera frame) against
// the one captured at registration, and against every other enrolled face. The step animation is a client-side affordance shown while
// the request is in flight - it does not represent separate real checks.
// Returns { ok: true, data } on success or { ok: false, message } on failure.
export async function verifyFace({ employeeId, descriptors, signal, onStep }) {
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

  if (!descriptors?.length) {
    clearInterval(timer);
    return { ok: false, code: 'no-face', message: 'No face detected. Please center your face in the frame and try again.' };
  }

  try {
    const response = await http.post('/kiosk/verify-face', { employeeId, descriptors }, { signal });
    return { ok: true, data: response.data };
  } catch (error) {
    if (signal?.aborted) return { ok: false, aborted: true };
    const status = error.response?.status;
    const body = error.response?.data;

    // The server's own code wins over the status code. Both a mismatch and a locked-out reader
    // can come back as a failure, and the device being locked is a completely different thing
    // from a face being wrong - treating one as the other sent people to a security notice for
    // what was really just an expired unlock.
    const code = body?.code === 'face_locked' ? 'face-locked'
      : body?.code === 'kiosk_locked' ? 'kiosk-locked'
      : status === 401 ? 'mismatch'
      : status === 404 ? 'not-found'
      : status === 409 ? 'ambiguous'
      : status === 422 ? 'not-registered'
      : 'unknown';

    return {
      ok: false,
      code,
      attemptsRemaining: body?.data?.attemptsRemaining ?? null,
      retryAfter: body?.data?.retryAfter ?? null,
      message: body?.message || 'Face verification failed. Please try again.',
    };
  } finally {
    clearInterval(timer);
  }
}
