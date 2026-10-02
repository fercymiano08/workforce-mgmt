import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check, ChevronDown } from 'lucide-react';

/**
 * A filter dropdown that looks like part of the toolbar: a pill showing what it filters and what is
 * chosen, opening a small menu with a check against the current choice (and a count when the option has
 * one). It turns blue once it is narrowing the list, so at a glance you can see which filters are on.
 * A native <select> cannot be styled like this - its open list is drawn by the browser.
 *
 *   options: [{ value, label, count? }]
 */
export default function FilterMenu({ label, value, options, onChange, defaultValue, icon: Icon, className, align = 'left' }) {
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef(null);

  const selected = options.find((o) => o.value === value) || options[0];
  const active = defaultValue !== undefined && value !== defaultValue;

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const toggle = () => {
    setCursor(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen((v) => !v);
  };

  const pick = (option) => {
    onChange(option.value);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      return;
    }
    if (e.key === 'Escape') { setOpen(false); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setCursor((c) => (c + 1) % options.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setCursor((c) => (c - 1 + options.length) % options.length); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(options[cursor]); }
  };

  return (
    <div ref={rootRef} className={clsx('relative', className)} onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={toggle}
        className={clsx(
          'w-full inline-flex items-center gap-2 px-3.5 py-2.5 pointer-coarse:py-3 rounded-xl border text-sm transition-colors',
          active
            ? 'border-blue-200 bg-blue-50 text-blue-700'
            : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50 hover:border-gray-300',
          open && 'ring-2 ring-blue-500/20 border-blue-300'
        )}
      >
        {Icon && <Icon className={clsx('w-4 h-4 shrink-0', active ? 'text-blue-500' : 'text-gray-400')} />}
        <span className={clsx('text-xs font-medium shrink-0', active ? 'text-blue-500' : 'text-gray-400')}>{label}</span>
        <span className="font-semibold truncate">{selected?.label}</span>
        <ChevronDown className={clsx('w-4 h-4 ml-auto shrink-0 transition-transform', open && 'rotate-180', active ? 'text-blue-500' : 'text-gray-400')} />
      </button>

      {open && (
        <ul
          role="listbox"
          className={clsx(
            'absolute z-30 mt-2 min-w-full w-max max-w-[18rem] max-h-72 overflow-y-auto rounded-xl border border-gray-100 bg-white p-1.5 shadow-xl shadow-gray-900/10 animate-scaleIn',
            align === 'right' ? 'right-0' : 'left-0'
          )}
        >
          {options.map((o, i) => {
            const isSelected = o.value === value;
            return (
              <li key={String(o.value)} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  onMouseEnter={() => setCursor(i)}
                  onClick={() => pick(o)}
                  className={clsx(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition-colors',
                    i === cursor ? 'bg-gray-50' : '',
                    isSelected ? 'text-blue-700 font-semibold' : 'text-gray-700'
                  )}
                >
                  <span className="flex-1 truncate">{o.label}</span>
                  {o.count !== undefined && (
                    <span className={clsx('text-[11px] tabular-nums px-1.5 py-0.5 rounded-md', isSelected ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500')}>{o.count}</span>
                  )}
                  <Check className={clsx('w-4 h-4 shrink-0', isSelected ? 'text-blue-600' : 'text-transparent')} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
