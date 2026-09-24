import { useEffect, useState } from 'react';

/* global __APP_BUILD__ */
// The build this tab is running (see vite.config.js). In development there is no version file: the dev
// server swaps code in by itself, so nothing is checked.
export const RUNNING_BUILD = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : null;
const CHECK_EVERY_MS = 60 * 1000;

// The build the server is handing out right now, or null if it cannot be told (development, offline).
export async function latestBuild() {
  if (!import.meta.env.PROD) return null;
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json())?.build || null;
  } catch {
    return null;
  }
}

// True once the system has been updated while this tab stayed open. Checked every minute and whenever
// the tab comes back into view, so a tab left open overnight notices before anyone clicks anything.
export default function useNewVersion() {
  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!import.meta.env.PROD || !RUNNING_BUILD) return undefined;
    let stopped = false;
    const check = async () => {
      const latest = await latestBuild();
      if (!stopped && latest && latest !== RUNNING_BUILD) setOutdated(true);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, CHECK_EVERY_MS);
    document.addEventListener('visibilitychange', onVisible);
    check();
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return outdated;
}
