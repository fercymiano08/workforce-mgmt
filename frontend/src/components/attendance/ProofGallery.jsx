import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, ImageOff, X } from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * The photo proof on a correction, for the admin: thumbnails with their captions, and a full-screen view with
 * arrow keys to go through them. photos: [{ name, caption, dataUrl }]
 */
export default function ProofGallery({ photos }) {
  const [open, setOpen] = useState(null);   // index of the photo shown large, or null

  useEffect(() => {
    if (open === null) return undefined;
    // Captured first and stopped, so Esc closes only the photo and not the review window underneath it
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(null); }
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % photos.length);
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + photos.length) % photos.length);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, photos.length]);

  if (!photos?.length) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <ImageOff className="w-5 h-5 shrink-0" />
        <span>No photo was attached to this request. It was filed before photo proof was required, so weigh it on the employee's explanation alone.</span>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {photos.map((photo, i) => (
          <button key={`${photo.name}-${i}`} type="button" onClick={() => setOpen(i)}
            className="group text-left rounded-xl border border-gray-200 bg-white overflow-hidden hover:border-blue-300 hover:shadow-sm transition">
            <div className="aspect-[4/3] bg-gray-100 overflow-hidden">
              <img src={photo.dataUrl} alt={photo.caption || photo.name} className="h-full w-full object-cover group-hover:scale-105 transition-transform" />
            </div>
            <p className="px-2.5 py-2 text-xs text-gray-600 truncate">{photo.caption || <span className="text-gray-400">No caption</span>}</p>
          </button>
        ))}
      </div>

      {open !== null && createPortal(
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/85 p-4" onClick={() => setOpen(null)}>
          <button type="button" onClick={() => setOpen(null)} aria-label="Close" className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
            <X className="w-5 h-5" />
          </button>
          {photos.length > 1 && (
            <>
              <button type="button" aria-label="Previous photo" onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + photos.length) % photos.length); }} className="absolute left-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronLeft className="w-6 h-6" /></button>
              <button type="button" aria-label="Next photo" onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % photos.length); }} className="absolute right-4 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"><ChevronRight className="w-6 h-6" /></button>
            </>
          )}
          <figure className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img src={photos[open].dataUrl} alt={photos[open].caption || photos[open].name} className="max-h-[80vh] max-w-full rounded-lg object-contain" />
            <figcaption className="mt-3 text-center text-sm text-white/90">
              {photos[open].caption || photos[open].name} <span className="text-white/50">· {open + 1} of {photos.length}</span>
            </figcaption>
          </figure>
        </div>,
        document.body
      )}
    </>
  );
}
