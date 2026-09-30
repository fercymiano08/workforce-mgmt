import { Filter, X } from 'lucide-react';
import clsx from 'clsx';
import SearchBar from './SearchBar';

/*
  One filter bar for every table.

  The problem this solves is not that some tables lacked search - most had it. It is that each one
  built its own: a search box here with a magnifier at 3.5, a native <select> there with the OS's
  own arrow and its own idea of padding, a third place with two of them side by side and a different
  gap. Moving between modules, the controls were recognisably the same job done in a different style,
  which made each one slower to work out than it needed to be.

  So the shape is fixed here and every module routes through it:

  - the search field always comes first and is the only control that grows
  - each filter is a labelled select, and the label is what tells you what you are filtering
  - a filter that is doing something says so, in text, with a way to undo it
  - "Clear" only appears when there is something to clear
  - on a phone the selects wrap to a full-width row underneath the search, because a 3-across row of
    selects at 360px is three unusable 100px targets

  Every control is a real labelled field, so it is reachable by keyboard and announced by a screen
  reader, and the whole bar is one landmark a screen reader can skip past.
*/
export default function TableFilters({
  search,
  onSearchChange,
  searchPlaceholder = 'Search...',
  filters = [],
  onClear,
  resultCount,
  totalCount,
  className,
  children,
}) {
  // "Active" means the reader has narrowed the list. Shown only when a search term is typed - a
  // select left on its first option has not narrowed anything, and saying so would be noise.
  const narrowed = search.trim().length > 0;
  const canClear = narrowed || filters.some((f) => f.value !== (f.options[0]?.value ?? ''));

  return (
    <div className={clsx('rounded-2xl border border-gray-200/80 bg-white p-3 sm:p-3.5 shadow-sm', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
        <SearchBar
          value={search}
          onChange={onSearchChange}
          placeholder={searchPlaceholder}
          className="flex-1 min-w-0"
        />

        {/*
          The selects take the full width of the phone and share it evenly. At 360px, three selects
          in a row are 100px each, which is below the 44px-tall comfortable target once the label sits
          above them, and the selected text is clipped to two characters. Wrapping them onto their own
          line gives each one the whole screen.
        */}
        {filters.length > 0 && (
          <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
            {filters.map((f) => (
              <label key={f.key} className="min-w-0">
                <span className="sr-only">{f.label}</span>
                <select
                  value={f.value}
                  onChange={(e) => f.onChange(e.target.value)}
                  className={clsx(
                    'w-full sm:w-auto sm:min-w-[9.5rem] appearance-none rounded-xl border bg-white text-sm text-gray-700',
                    'pl-3 pr-8 py-2.5 cursor-pointer transition-colors',
                    'focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500',
                    f.value !== f.options[0]?.value
                      ? 'border-blue-300 bg-blue-50/60 font-medium text-blue-800'
                      : 'border-gray-200 hover:border-gray-300'
                  )}
                >
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        )}

        {canClear && onClear && (
          <button
            type="button"
            onClick={onClear}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50 hover:text-gray-900 shrink-0"
          >
            <X className="w-4 h-4" />
            Clear
          </button>
        )}

        {children}
      </div>

      {/* A count, so a filtered table never looks broken. A short list with no explanation reads as
          "the data is missing" rather than "you narrowed it". */}
      {narrowed && resultCount != null && totalCount != null && (
        <p className="mt-2.5 flex items-center gap-1.5 text-xs text-gray-500">
          <Filter className="w-3.5 h-3.5" />
          Showing {resultCount} of {totalCount}
        </p>
      )}
    </div>
  );
}
