import clsx from 'clsx';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/*
  A table that survives a phone.

  The desktop version is a real <table> and always will be - a grid of columns is the right shape for
  comparing values across rows. But on a narrow screen that same table has to scroll sideways, and
  sideways-scrolling a wide table on a phone is miserable: the first column and the row you are
  looking at drift apart, and the columns that matter are usually off the right edge.

  So below the sm breakpoint each row is re-laid-out as a card, one field per line, using the column
  header as the field label. Every value stays on screen with no scrolling at all. Both versions are
  rendered and one is hidden with CSS rather than switching in JavaScript, so there is no measuring,
  no re-render on rotation, and no layout shift when the page first appears.

  A column marked `primary: true` becomes the card's title - usually the person or the record name,
  the one thing you scan the list for. Without it the first column is used.
*/
export default function Table({ columns, data, onRowClick, emptyMessage = 'No data available', className }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center shadow-sm">
        <p className="text-gray-400 text-sm">{emptyMessage}</p>
      </div>
    );
  }

  const primaryIndex = Math.max(
    0,
    columns.findIndex((col) => col.primary)
  );

  return (
    <div className={clsx('bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm', className)}>
      {/* Desktop: columns side by side. */}
      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/80">
              {columns.map((col, i) => (
                <th
                  key={i}
                  className="px-5 py-3.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-50/80"
                  style={col.width ? { width: col.width } : {}}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                onClick={() => onRowClick?.(row)}
                className={clsx(
                  'transition-colors duration-150',
                  rowIndex % 2 === 1 && 'bg-gray-50/30',
                  onRowClick ? 'cursor-pointer hover:bg-blue-50/30' : 'hover:bg-gray-50/60'
                )}
              >
                {columns.map((col, colIndex) => (
                  <td key={colIndex} className="px-5 py-3.5 text-sm text-gray-700">
                    {col.render ? col.render(row) : row[col.accessor]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Phone: one card per row, every value on screen, nothing to scroll sideways. */}
      <ul className="sm:hidden divide-y divide-gray-100">
        {data.map((row, rowIndex) => (
          <li
            key={rowIndex}
            onClick={() => onRowClick?.(row)}
            className={clsx(
              'px-4 py-3.5 transition-colors',
              onRowClick && 'active:bg-blue-50/50 min-h-[56px]'
            )}
          >
            <dl className="space-y-2">
              {columns.map((col, colIndex) => (
                <div
                  key={colIndex}
                  className={clsx(
                    'flex items-start justify-between gap-3',
                    colIndex === primaryIndex && 'pb-1'
                  )}
                >
                  {colIndex === primaryIndex ? (
                    <dd className="text-[15px] font-semibold text-gray-900 min-w-0">
                      {col.render ? col.render(row) : row[col.accessor]}
                    </dd>
                  ) : (
                    <>
                      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 pt-0.5 shrink-0">
                        {col.header}
                      </dt>
                      <dd className="text-sm text-gray-700 text-right min-w-0 break-words">
                        {col.render ? col.render(row) : row[col.accessor]}
                      </dd>
                    </>
                  )}
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pagination({ currentPage, totalPages, onPageChange }) {
  if (totalPages <= 1) return null;

  // 44px is the smallest target a fingertip reliably hits. The arrows are the only paging control on
  // a phone, so they have to be comfortable, not just big enough to see.
  const arrowClass =
    'min-w-[44px] min-h-[44px] p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 text-gray-500 transition-colors flex items-center justify-center';

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-2 py-4">
      <p className="text-sm text-gray-500 hidden sm:block">
        Page <span className="font-medium text-gray-700">{currentPage}</span> of <span className="font-medium text-gray-700">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(1)} disabled={currentPage === 1} aria-label="First page" className={arrowClass}>
          <ChevronsLeft className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(currentPage - 1)} disabled={currentPage === 1} aria-label="Previous page" className={arrowClass}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let page;
          if (totalPages <= 5) page = i + 1;
          else if (currentPage <= 3) page = i + 1;
          else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
          else page = currentPage - 2 + i;
          return (
            <button
              key={page}
              onClick={() => onPageChange(page)}
              className={clsx(
                'w-10 h-10 rounded-lg text-sm font-medium transition-all duration-200 hidden sm:flex items-center justify-center',
                currentPage === page
                  ? 'bg-blue-600 text-white shadow-sm shadow-blue-600/20'
                  : 'text-gray-600 hover:bg-gray-100'
              )}
            >
              {page}
            </button>
          );
        })}
        <button onClick={() => onPageChange(currentPage + 1)} disabled={currentPage === totalPages} aria-label="Next page" className={arrowClass}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button onClick={() => onPageChange(totalPages)} disabled={currentPage === totalPages} aria-label="Last page" className={arrowClass}>
          <ChevronsRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
