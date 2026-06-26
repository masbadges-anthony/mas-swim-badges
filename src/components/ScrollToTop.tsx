import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Resets the window scroll to the top on every route (pathname) change so a new
 * page never lands mid-scroll or at the footer.
 *
 * It deliberately does nothing when the location carries a `#hash`, so in-page
 * anchor links (e.g. `/faq#instructors`) that are meant to scroll to a section
 * on the same page are left to the browser and not hijacked.
 */
export default function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    // Let the browser handle anchor navigation; only reset on plain page changes.
    if (hash) return;
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  return null;
}
