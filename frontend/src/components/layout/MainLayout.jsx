import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import Breadcrumbs from './Breadcrumb';
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
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-[260px]">
        <Topbar onMenuToggle={() => setSidebarOpen(!sidebarOpen)} />
        <main ref={mainRef} className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8" style={{ overflowAnchor: 'none' }}>
          <Breadcrumbs />
          {children}
        </main>
      </div>
    </div>
  );
}
