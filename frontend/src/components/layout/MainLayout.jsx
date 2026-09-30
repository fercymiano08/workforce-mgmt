import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import clsx from 'clsx';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import MobileTabBar from './MobileTabBar';
import Breadcrumbs from './Breadcrumb';
import NotificationToasts from '../common/NotificationToasts';
import { settingsService } from '../../services/api';
import { applySystemSettings } from '../../utils/appSettings';

export default function MainLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const mainRef = useRef(null);
  const { pathname } = useLocation();

  // Apply saved system preferences (date/time format) from the backend once
  // per app load so every page formats dates consistently.
  useEffect(() => {
    settingsService.get()
      .then((settings) => applySystemSettings(settings.system || {}, settings.profile || {}))
      .catch(() => {});
  }, []);

  // Reset scroll position of the content area every time the route changes,
  // since MainLayout persists across page navigations and the browser
  // doesn't know to reset scroll on this inner scrollable container.
  // useLayoutEffect (instead of useEffect) runs synchronously right after
  // the DOM updates but before the browser paints, so there's no visible
  // flash of the old scroll position on the new page.
  useLayoutEffect(() => {
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
      // Fallback: in case late-loading content (e.g. avatar images) shifts
      // layout and the browser's scroll-anchoring nudges the position again,
      // force it back to top on the next frame too.
      requestAnimationFrame(() => {
        if (mainRef.current) mainRef.current.scrollTop = 0;
      });
    }
  }, [pathname]);

  return (
    // h-[100dvh] rather than h-screen. On a phone 100vh is the height the viewport would be with its
    // own bars hidden, which is taller than the space actually available - the bottom of every page
    // was therefore unreachable, and the fixed tab bar sat over content that could not be scrolled
    // clear of it. 100dvh is the real height right now, and it is what an installed app uses.
    <div className="flex h-screen h-[100dvh] overflow-hidden bg-[#F8FAFC]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-[260px]">
        <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        {/* overflow-x-hidden is a floor, not the fix: a wide table scrolls inside its own box, and
            anything that still manages to push this container wider would otherwise slide the whole
            page sideways under the reader's thumb. A grid of columns has more width than a phone
            does, and the page must never be the thing that gives. */}
        <main
          ref={mainRef}
          className={clsx(
            'flex-1 overflow-y-auto overflow-x-hidden',
            // Horizontal padding is the same on a phone as on a tablet, so a card's left edge sits
            // one consistent distance from the glass rather than drifting per breakpoint. The padding
            // step itself still grows with the screen, because a 16px gutter on a 400px phone eats
            // 8% of the width for no reason.
            'px-4 sm:px-6 lg:px-8',
            // Top padding clears the notch and the status bar in standalone mode; bottom padding
            // clears the tab bar plus the gesture bar. The calc() reads 0 in an ordinary browser tab,
            // so the browser view is unchanged.
            'pt-[max(1rem,env(safe-area-inset-top))]',
            'pb-[max(6rem,calc(4rem+env(safe-area-inset-bottom)))] lg:pb-8'
          )}
          style={{ overflowAnchor: 'none' }}
        >
          {/*
            The centering fix.

            Every page renders a stack of cards and tables. Left alone that stack is as wide as the
            window, so on a 430px phone a five-column grid either squeezes to unreadable slivers or
            overflows, and on a wide monitor the same content strands itself against the left edge
            with a screen of empty space to the right. Capping the column and centring it fixes both
            ends at once: the content is a consistent measure at every size, and the page reads as a
            deliberate column instead of a stretched one.

            max-w is only reached on genuinely wide screens - a phone is always under it, so the
            phone layout is exactly what it was, just reliably aligned.
          */}
          <div className="mx-auto w-full max-w-[1400px]">
            <Breadcrumbs />
            {children}
          </div>
        </main>
      </div>
      <MobileTabBar />
      <NotificationToasts />
    </div>
  );
}
