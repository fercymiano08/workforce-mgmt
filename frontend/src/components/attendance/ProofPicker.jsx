import { useRef, useState } from 'react';
import { Camera, ImagePlus, X, Info } from 'lucide-react';
import clsx from 'clsx';

const MAX_SIDE = 1600;          // longest edge after shrinking, in pixels
const TARGET_BYTES = 900_000;   // aim for well under 1 MB per photo (the server allows 3 MB)

// Reads a picked file and shrinks it in the browser, so a 12 MP phone photo becomes a few hundred KB of proof.
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      // JPEG, lowering the quality until it is small enough
      let quality = 0.85;
      let dataUrl = canvas.toDataURL('image/jpeg', quality);
      while (dataUrl.length * 0.75 > TARGET_BYTES && quality > 0.4) {
        quality -= 0.15;
        dataUrl = canvas.toDataURL('image/jpeg', quality);
      }
      resolve(dataUrl);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('unreadable')); };
    img.src = url;
  });
}

/**
 * Photo proof for a correction: up to `max` photos, each with an optional caption ("the kiosk error", "the live time").
 * value: [{ id, name, dataUrl, caption }]. Photos are shrunk here; the server checks they are real images.
 */
export default function ProofPicker({ value, onChange, max = 5, hint, error }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const pick = async (event) => {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    if (!files.length) return;
    setProblem('');
    const room = max - value.length;
    if (files.length > room) setProblem(`You can attach up to ${max} photos. Only the first ${room} were added.`);
    setBusy(true);
    const added = [];
    for (const file of files.slice(0, Math.max(0, room))) {
      if (!file.type.startsWith('image/')) { setProblem('Only photos (JPEG, PNG or WebP) can be attached.'); continue; }
      try {
        added.push({ id: `${file.name}-${file.size}-${Date.now()}-${added.length}`, name: file.name, dataUrl: await shrink(file), caption: '' });
      } catch {
        setProblem('One of the photos could not be read. Please try another.');
      }
    }
    setBusy(false);
    if (added.length) onChange([...value, ...added]);
  };

  const update = (id, patch) => onChange(value.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const remove = (id) => onChange(value.filter((p) => p.id !== id));

  return (
    <div>
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-medium text-gray-700">
          Photo proof <span className="text-red-500">*</span>
        </label>
        <span className="text-xs text-gray-400">{value.length} of {max}</span>
      </div>
      {hint && (
        <p className="mt-1 flex items-start gap-1.5 text-xs text-gray-500">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-500" />
          <span>Add clear photos so HR can see what happened: {hint}.</span>
        </p>
      )}

      <div className={clsx('mt-2 grid grid-cols-2 sm:grid-cols-3 gap-3 rounded-xl', error && 'ring-1 ring-red-300 p-2')}>
        {value.map((photo) => (
          <div key={photo.id} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <div className="relative aspect-[4/3] bg-gray-100">
              <img src={photo.dataUrl} alt={photo.caption || photo.name} className="h-full w-full object-cover" />
              <button type="button" onClick={() => remove(photo.id)} aria-label="Remove photo"
                className="absolute top-1.5 right-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80">
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              value={photo.caption}
              onChange={(e) => update(photo.id, { caption: e.target.value.slice(0, 80) })}
              placeholder="What does this show? (optional)"
              className="w-full px-2.5 py-2 text-xs text-gray-700 placeholder:text-gray-400 focus:outline-none focus:bg-blue-50/40"
            />
          </div>
        ))}

        {value.length < max && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy}
            className="flex aspect-[4/3] sm:aspect-auto sm:min-h-[150px] flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/40 transition-colors disabled:opacity-60"
          >
            {value.length === 0 ? <Camera className="w-6 h-6" /> : <ImagePlus className="w-6 h-6" />}
            <span className="text-xs font-semibold">{busy ? 'Preparing…' : value.length === 0 ? 'Add photos' : 'Add another'}</span>
            <span className="text-[11px] text-gray-400">Take or choose a photo</span>
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={pick} />

      {(error || problem) && <p className="mt-1.5 text-xs text-red-600">{error || problem}</p>}
    </div>
  );
}
