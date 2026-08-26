import * as faceapi from 'face-api.js';

// Model weights are self-hosted from frontend/public/models and served at
// /models (Vite copies public/ into the build output). This keeps facial
// recognition fully functional offline - only the one-time download of these
// files ever needed the internet, and that already happened when they were
// vendored into the repository.
const MODEL_URL = '/models';

// Tuned for speed: this app only ever detects one close-up face (a webcam
// selfie, an uploaded ID-style photo, or a kiosk camera frame) - never a
// crowd of small/distant faces - so a smaller detector input size trades
// away accuracy the use case doesn't need in exchange for meaningfully
// faster inference (compute scales roughly with inputSize^2). 416 (the
// face-api.js default) is tuned for general-purpose, multi-face detection.
const DETECTOR_OPTIONS = new faceapi.TinyFaceDetectorOptions({
  inputSize: 224,
  scoreThreshold: 0.5,
});

// Downscale large uploaded photos before running detection - a 12MP phone
// photo takes meaningfully longer to process than a 800px one, with no
// accuracy benefit for a single close-up face.
const MAX_DETECTION_DIMENSION = 800;

let modelsPromise = null;

// Safe to call multiple times/early (e.g. as soon as a capture modal opens,
// in parallel with requesting camera access) - subsequent calls just await
// the same in-flight/resolved promise, so callers can "warm up" the models
// well before the user actually triggers a scan.
export function loadModels() {
  if (!modelsPromise) {
    modelsPromise = Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
    ]);
  }
  return modelsPromise;
}

/**
 * Detects the single most prominent face in a video/image/canvas element and
 * returns its 128-value descriptor, or null if no face was found.
 */
export async function getFaceDescriptor(mediaElement) {
  await loadModels();

  const isVideo = mediaElement?.tagName === 'VIDEO';
  const width = isVideo ? mediaElement.videoWidth : mediaElement?.width;
  const height = isVideo ? mediaElement.videoHeight : mediaElement?.height;

  if (!width || !height) return null;

  const detection = await faceapi
    .detectSingleFace(mediaElement, DETECTOR_OPTIONS)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) return null;

  return Array.from(detection.descriptor);
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

export const faceMatchService = { loadModels, getFaceDescriptor, loadImageFileToCanvas };
