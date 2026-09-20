import clsx from 'clsx';

// Rough landmark positions (% of the oval) - eyes, nose, mouth, cheeks, jaw.
const LANDMARKS = [
  [32, 38], [68, 38], [50, 52], [36, 68], [64, 68], [50, 74], [22, 52], [78, 52], [50, 90],
];

/**
 * Face-shaped scan guide for a camera preview. Place inside a `relative
 * overflow-hidden` wrapper around the <video>.
 *
 *   state="idle"     - dashed guide oval (position your face here)
 *   state="scanning" - sweeping scan band + pulsing landmark dots
 *   state="success"  - solid green oval
 *
 * Every animation is a CSS transform/opacity keyframe, so the browser runs it
 * on the compositor thread and it keeps moving while face-api is busy
 * computing on the main thread.
 */
export default function FaceScanOverlay({ state = 'idle' }) {
  const scanning = state === 'scanning';
  const success = state === 'success';

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div
        className={clsx(
          'face-oval relative h-[82%] aspect-[3/4] overflow-hidden border-2 transition-colors duration-300',
          success ? 'border-emerald-400 bg-emerald-400/10' : scanning ? 'border-blue-400' : 'border-dashed border-blue-400/80'
        )}
      >
        {scanning && (
          <>
            <div className="face-sweep absolute inset-x-0 top-0 h-[28%]" />
            {LANDMARKS.map(([x, y], i) => (
              <span
                key={i}
                className="face-dot absolute w-1.5 h-1.5 -ml-[3px] -mt-[3px] rounded-full bg-blue-300"
                style={{ left: `${x}%`, top: `${y}%`, animationDelay: `${i * 130}ms` }}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}
