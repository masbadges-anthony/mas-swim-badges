import { useEffect, useState } from 'react';

// Baked in at build time by vite.config.ts (define: __BUILD_ID__).
declare const __BUILD_ID__: string;

const POLL_MS = 5 * 60 * 1000; // re-check every 5 minutes, and on tab focus

/**
 * UpdateBanner — detects when a newer build has been deployed while this tab was
 * open, and offers a refresh. Fixes stale-bundle-in-a-long-open-tab: cache
 * headers keep fresh loads correct, but an already-loaded tab runs old JS until
 * reloaded. Polls /version.json (served no-store) and compares to the build id
 * this session booted with.
 */
export default function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const boot = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : null;
    if (!boot) return; // dev server / no build id — nothing to compare
    let stopped = false;

    async function check() {
      try {
        const res = await fetch('/version.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { buildId?: string };
        if (!stopped && data.buildId && data.buildId !== boot) {
          setUpdateReady(true);
        }
      } catch {
        /* offline, or version.json not present yet — ignore */
      }
    }

    const onFocus = () => { if (!updateReady) check(); };
    const timer = window.setInterval(check, POLL_MS);
    window.addEventListener('focus', onFocus);
    check();
    return () => {
      stopped = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [updateReady]);

  if (!updateReady) return null;

  return (
    <div style={styles.bar} role="status" aria-live="polite">
      <span>A new version of the portal is available.</span>
      <button style={styles.btn} onClick={() => window.location.reload()}>
        Refresh
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  bar: {
    position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14,
    background: '#1E2752', color: '#fff', fontFamily: 'Arial, sans-serif',
    fontSize: 14, padding: '10px 16px', boxShadow: '0 -2px 10px rgba(0,0,0,.15)',
  },
  btn: {
    background: '#F9C610', color: '#1E2752', border: 'none', borderRadius: 6,
    padding: '6px 14px', fontWeight: 700, fontSize: 14, cursor: 'pointer',
  },
};
