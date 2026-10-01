import { useEffect, useRef, useState } from 'react';
import { Info } from 'lucide-react';

/**
 * The little ⓘ on every Workforce Analytics card: click (or hover/focus) to see exactly where
 * the number came from and how it was calculated, in the card's own words. The point is that
 * nobody - least of all whoever is showing this page - has to remember the rule separately from
 * the code that applies it.
 *
 * Also renders that same text as plain, always-visible print content (`hidden print:block`), so
 * a printed page carries every formula without anyone needing to click anything first.
 */
export default function FormulaInfo({ dataSource, formula }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (!dataSource && !formula) return null;

  return (
    <>
      <div ref={rootRef} className="relative print:hidden">
        <button
          type="button"
          aria-expanded={open}
          aria-label="Where this number comes from and how it's calculated"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          className="w-5 h-5 shrink-0 rounded-full flex items-center justify-center text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <Info className="w-4 h-4" />
        </button>
        {open && (
          <div
            role="tooltip"
            onMouseEnter={() => setOpen(true)}
            onMouseLeave={() => setOpen(false)}
            className="absolute right-0 top-full mt-2 z-20 w-72 rounded-xl border border-gray-100 bg-white shadow-xl p-4 text-left animate-fadeIn"
          >
            {dataSource && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Data source</p>
                <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{dataSource}</p>
              </div>
            )}
            {formula && (
              <div className={dataSource ? 'mt-3' : ''}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Formula</p>
                <p className="text-xs text-gray-700 mt-0.5 leading-relaxed">{formula}</p>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Print-only: the same text, always there, no hover required. */}
      <div className="hidden print:block text-[10px] text-gray-500 mt-1 leading-snug">
        {dataSource && <p><span className="font-semibold">Data source:</span> {dataSource}</p>}
        {formula && <p><span className="font-semibold">Formula:</span> {formula}</p>}
      </div>
    </>
  );
}
