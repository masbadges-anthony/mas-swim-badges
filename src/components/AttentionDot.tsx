/**
 * AttentionDot — a small, reusable "needs attention" indicator for sidebar
 * menu items (and anywhere else). Render it inside a menu item and feed it a
 * count or a boolean; it shows a dot when there is something to attend to and
 * renders nothing otherwise.
 *
 * Reusable by design: it is NOT tied to Enquiries. Any item can opt in by
 * wiring its own count source, e.g.
 *   <NavLink ...><Icon .../><span>Centre applications</span>
 *     <AttentionDot count={pendingApplications} label="awaiting review" /></NavLink>
 */
interface AttentionDotProps {
  /** Number of items needing attention, or a plain boolean flag. */
  count?: number | boolean;
  /** Screen-reader / tooltip wording, e.g. "unhandled enquiries". */
  label?: string;
}

export default function AttentionDot({ count, label = 'need attention' }: AttentionDotProps) {
  const active = typeof count === 'number' ? count > 0 : Boolean(count);
  if (!active) return null;

  const title = typeof count === 'number' ? `${count} ${label}` : label;
  return <span className="mas-nav-dot" role="status" aria-label={title} title={title} />;
}
