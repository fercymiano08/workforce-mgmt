import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

/*
  A table that fits a phone without being rewritten into something else.

  A grid of columns is the right shape for comparing values down a page, and on a narrow screen it
  simply has more width than there is. Left alone that goes one of two bad ways: the table either
  spills out and drags the whole page sideways with it, or it is clipped and the right hand columns
  - the numbers people came for - are gone with no way to reach them.

  So the table keeps its markup and its cells, and only the frame around it changes:

  - it scrolls sideways inside its own box, so the page itself never does
  - it bleeds to the screen edges on a phone, where a half-pixel of margin looks like a mistake
  - the header row sticks to the top, so a column still says what it is while you scroll along it
  - the table keeps a sensible minimum width, so columns stay readable instead of collapsing to
    unreadable slivers
  - the faded edges appear only when there is genuinely more to scroll to in that direction

  That last one is why there is any JavaScript here at all. A permanent gradient is a lie on a
  screen where the table already fits, and it trains people to ignore it on the screens where it
  does mean something.
*/
export default function TableShell({ children, className, minWidth = 'min-w-[640px]' }) {
  const scroller = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    // 1px of slack: a sub-pixel remainder is not something a person can see or scroll.
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft < max - 1 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    // The table's own content changing width (a column appearing, a long value wrapping) moves the
    // far edge, so the fades have to be re-measured when the rows change, not just when the box does.
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [measure]);

  return (
    <div className={clsx('table-frame relative bg-white rounded-2xl border border-gray-200/80 shadow-sm', className)}>
      <div
        ref={scroller}
        onScroll={measure}
        className={clsx(
          // No negative margins here on purpose. Pulling the table 16px past its card on each side
          // looked better, but it made the scroller wider than the card, and the page's own content
          // area then became scrollable sideways - the whole screen sliding under your finger over a
          // table that was already scrolling perfectly well inside its own box.
          'overflow-x-auto overscroll-x-contain'
        )}
      >
        {/*
          The minimum width lives on the content, never on the scrolling box. An overflow-x-auto
          element with its own min-width is forced to be wider than the screen, and then it is the
          page that scrolls sideways - the exact failure this is here to prevent.

          .table-frame is what carries the shared design (see index.css). Applying it here rather
          than per table is what makes every module look the same without fifteen files being
          rewritten, and what stops the next table someone adds from arriving unstyled.
        */}
        <div className={minWidth}>{children}</div>
      </div>

      {edges.left && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-white to-transparent sm:from-white/90 z-20"
        />
      )}
      {edges.right && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent sm:from-white/90 z-20"
        />
      )}
    </div>
  );
}
