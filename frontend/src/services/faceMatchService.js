import * as faceapi from 'face-api.js';
import * as tf from '@tensorflow/tfjs-core';

// Model weights are self-hosted from frontend/public/models and served at
// /models (Vite copies public/ into the build output). This keeps facial
// recognition fully functional offline - only the one-time download of these
// files ever needed the internet, and that already happened when they were
// vendored into the repository.
const MODEL_URL = '/models';

// Detection confidence floor. 0.5 is the face-api default, but live kiosk
// cameras are typically dim, wide-angle, or slightly off-center, so we run
// lower (0.35) for far better recall when a real face is present. A false
// positive would just be rejected a step later at the similarity compare.
const SCORE_THRESHOLD = 0.35;

// Detection tries the small input first (fast) and only falls back to the
// large input (slower, but finds faces that are farther/smaller in the
// frame) when the quick pass finds nothing. A kiosk scan is a close-up face,
// so 160 finds it on the first pass for most people; 320 covers the rest
// (it replaces the old 224/416 pair - cheaper on both passes).
const DETECTOR_INPUT_SIZES = [160, 320];

// Downscale large uploaded photos before running detection - a 12MP phone
// photo takes meaningfully longer to process than a 800px one, with no
// accuracy benefit for a single close-up face.
const MAX_DETECTION_DIMENSION = 800;

// Live scanning never needs the full camera resolution - the face nets all
// operate on a small fixed crop, and a lower-res snapshot is drawn faster,
// inferred faster, and kinder to weak kiosk hardware.
const LIVE_FRAME_MAX_DIMENSION = 480;

let modelsPromise = null;

// --- Computation backend ---------------------------------------------------
// face-api.js (tfjs 1.x) ships both the WebGL and CPU backends inside
// @tensorflow/tfjs-core and picks WebGL automatically. On many kiosk PCs the
// GPU/WebGL context is broken or virtualised (remote-desktop, old chipset),
// which makes every detection silently return "no face" while the models
// still load fine. We probe once and fall back to the CPU backend so
// scanning actually works on those machines too.

let backendChecked = false;
let backendUsed = 'unknown';

async function ensureUsableBackend() {
  if (backendChecked) return;
  backendChecked = true;
  try {
    await tf.ready();
    const name = tf.getBackend();
    if (name !== 'webgl') {
      backendUsed = name;
      return;
    }
    // WebGL is claimed - verify it genuinely computes a result.
    const probe = tf.tensor1d([1, 2, 3]);
    const out = await tf.softmax(probe).data();
    probe.dispose();
    if (out.length === 3 && out.every(Number.isFinite)) {
      backendUsed = 'webgl';
      return;
    }
    throw new Error('webgl backend returned invalid results');
  } catch {
    try {
      await tf.setBackend('cpu');
      await tf.ready();
      backendUsed = 'cpu';
      console.warn('[face] WebGL unusable on this device, switched face scanning to CPU backend.');
    } catch {
      backendUsed = tf.getBackend();
    }
  }
}

// Safe to call multiple times/early (e.g. as soon as a capture modal opens,
// in parallel with requesting camera access) - subsequent calls just await
// the same in-flight/resolved promise, so callers can "warm up" the models
// well before the user actually triggers a scan.
//
// face-api 0.22's .withFaceDescriptor() task ALWAYS computes the aligned
// face box from the 68-point landmarks (it calls parentResult.landmarks
// internally) - skipping the landmark net makes every descriptor call throw,
// which surfaces as an endless "No face detected". So the landmark net is a
// hard dependency here; and in practice it only ever runs
// after a face was already found by the (expensive) detector pass, so its
// cost is a few milliseconds on a single face.
export function loadModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      await ensureUsableBackend();
      await Promise.all([
        faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);
      await warmUpNetworks();
      // The fallback (larger) detector size compiles its own shaders too; do that in
      // the background so it never delays the first scan.
      warmUpDetector(DETECTOR_INPUT_SIZES[1]);
    })().catch((error) => {
      // A rejected promise would otherwise be cached forever - a one-off
      // download hiccup would then brick every scan until a full reload.
      // Clear the reference so the next call simply retries the (now warm)
      // fetch, which is what makes the modal's Retry button actually retry.
      modelsPromise = null;
      throw error;
    });
  }
  return modelsPromise;
}

// The first inference of each network on the WebGL backend compiles its shaders,
// which costs well over a second per network. Doing one throw-away pass through
// ALL THREE networks on blank frames while the modal is still opening moves that
// cost out of the user's real scan (previously only the detector was warmed, so
// the landmark and recognition networks still paid it during the first scan).
function blankCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

async function warmUpDetector(inputSize) {
  try {
    await faceapi.detectSingleFace(blankCanvas(inputSize), detectorOptions(inputSize));
  } catch {
    // Warm-up is best effort only.
  }
}

async function warmUpNetworks() {
  await warmUpDetector(DETECTOR_INPUT_SIZES[0]);
  try {
    await faceapi.nets.faceLandmark68Net.detectLandmarks(blankCanvas(112));
  } catch {
    // best effort
  }
  try {
    await faceapi.nets.faceRecognitionNet.computeFaceDescriptor(blankCanvas(150));
  } catch {
    // best effort
  }
}

// Call from a page that will soon need face scanning (registration, the kiosk)
// so the ~7 MB of model files and the shader warm-up happen while the user is
// still filling in the form, not after they press the scan button.
export function preloadFaceModels() {
  const start = () => loadModels().catch(() => {});
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(start, { timeout: 2500 });
  } else {
    setTimeout(start, 800);
  }
}
// Lets the browser paint (e.g. the scan animation) before a long synchronous
// detection pass starts blocking the main thread.
const nextPaint = () => new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

function detectorOptions(inputSize) {
  return new faceapi.TinyFaceDetectorOptions({
    inputSize,
    scoreThreshold: SCORE_THRESHOLD,
  });
}

function snapshotToCanvas(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;
  const scale = Math.min(1, LIVE_FRAME_MAX_DIMENSION / Math.max(vw, vh));
  const cw = Math.round(vw * scale);
  const ch = Math.round(vh * scale);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    canvas.getContext('2d').drawImage(video, 0, 0, cw, ch);
    return canvas;
  } catch {
    return null;
  }
}

// Estimate how "black" a snapshot is (0-255 average luminance) so a machine
// whose camera never paints a frame can be told apart from a real no-face.
function frameMeanLuminance(canvas) {
  try {
    const thumb = document.createElement('canvas');
    thumb.width = 8;
    thumb.height = 8;
    const thumbCtx = thumb.getContext('2d', { willReadFrequently: true });
    thumbCtx.drawImage(canvas, 0, 0, 8, 8);
    const { data } = thumbCtx.getImageData(0, 0, 8, 8);
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    return sum / (data.length / 4);
  } catch {
    return null;
  }
}

async function detectOnce(source, inputSize) {
  try {
    const detection = await faceapi
      .detectSingleFace(source, detectorOptions(inputSize))
      .withFaceLandmarks()
      .withFaceDescriptor();

    if (!detection) return null;

    const descriptor = detection.descriptor;
    if (!descriptor || descriptor.length !== 128) return null;
    if (descriptor.some((value) => !Number.isFinite(value))) return null;

    return Array.from(descriptor);
  } catch {
    return null;
  }
}

/**
 * Detects the single most prominent face in a video/image/canvas element and
 * returns its 128-value descriptor, or null if no face was found.
 *
 * Never throws: any failure (camera racing, mid-resize video, WebGL hiccup,
 * a not-yet-ready stream, a corrupt descriptor) resolves as null so callers
 * can simply re-scan instead of crashing the flow.
 *
 * Detection is deliberately multi-pass for reliability:
 *   1. a stable low-res snapshot of the live frame, fast detector input 224
 *   2. the same snapshot, large detector input 416 (finds smaller faces)
 * The moment any pass returns a valid descriptor, that is the result, so a
 * clear centered face is still found on the first (fast) pass.
 */
export async function getFaceDescriptor(mediaElement) {
  await loadModels();

  if (!mediaElement) return null;

  const isVideo = mediaElement?.tagName === 'VIDEO';
  // The snapshot holds the same pixels as the live video, so re-running
  // detection on the raw element only doubled the worst-case time. It is kept
  // solely as a fallback for when a snapshot could not be drawn.
  const snapshot = isVideo ? snapshotToCanvas(mediaElement) : null;
  const sources = isVideo ? [snapshot || mediaElement] : [mediaElement];

  await nextPaint();

  for (const source of sources) {
    if (!source) continue;
    for (const inputSize of DETECTOR_INPUT_SIZES) {
      const descriptor = await detectOnce(source, inputSize);
      if (descriptor) return descriptor;
    }
  }

  const luminance = snapshot ? frameMeanLuminance(snapshot) : null;
  console.warn('[face] no face detected', {
    backend: backendUsed,
    luminance,
    blackFrame: luminance !== null && luminance < 4,
    sources: sources.map((s) => (s?.tagName === 'VIDEO' ? 'live-video' : 'snapshot')),
    sizes: DETECTOR_INPUT_SIZES,
  });
  return null;
}

/**
 * Loads an uploaded image file into a canvas, downscaling it if it's larger
 * than MAX_DETECTION_DIMENSION. The returned canvas can be passed straight to
 * getFaceDescriptor() and also read via canvas.toDataURL() for a preview.
 */
export function loadImageFileToCanvas(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the selected file.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That file is not a readable image.'));
      img.onload = () => {
        const scale = Math.min(1, MAX_DETECTION_DIMENSION / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export const faceMatchService = { loadModels, preloadFaceModels, getFaceDescriptor, loadImageFileToCanvas };