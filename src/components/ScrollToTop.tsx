import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets the window scroll to the top on every route (pathname) change so a new
 * page never lands mid-scroll or at the footer.
 *
 * When the location carries a `#hash` it instead scrolls to that section. The
 * browser does NOT do this for client-side (SPA) navigations — the target only
 * exists after React renders the new page — so we resolve the element ourselves
 * once it is in the DOM. `scroll-margin-top` on the targets keeps them clear of
 * the fixed header (see theme.css).
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      // The destination page may not have rendered yet; retry across a couple of
      // frames until the anchor exists, then scroll to it.
      const id = decodeURIComponent(hash.slice(1));
      let frame = 0;
      const tryScroll = () => {
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else if (frame < 20) {
          frame += 1;
          requestAnimationFrame(tryScroll);
        }
      };
      requestAnimationFrame(tryScroll);
      return;
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
