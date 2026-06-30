import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, ROLE_LABELS } from './lib/auth';
import { ContentOverridesProvider } from './lib/contentOverrides';
import Protected from './components/Protected';
import RequireRole from './components/RequireRole';
import ScrollToTop from './components/ScrollToTop';
import Icon from './components/Icon';
import AttentionDot from './components/AttentionDot';
import { supabase } from './lib/supabase';
import Home from './pages/Home';
import TheProgramme from './pages/TheProgramme';
import ForCentres from './pages/ForCentres';
import ForParents from './pages/ForParents';
import Contact from './pages/Contact';
import FAQ from './pages/FAQ';
import Guides from './pages/Guides';
import GuideDetail from './pages/GuideDetail';
import Instructors from './pages/Instructors';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Safeguarding from './pages/Safeguarding';
import Directory from './pages/Directory';
import Courses from './pages/Courses';
import Verify from './pages/Verify';
import SearchResults from './pages/SearchResults';
import Login from './pages/Login';
import Signup from './pages/Signup';
import NotFound from './pages/NotFound';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import RegisterCandidate from './pages/RegisterCandidate';
import RosterBooking from './pages/RosterBooking';
import ExaminerGrading from './pages/ExaminerGrading';
import Certificates from './pages/Certificates';
import CertificateIssuance from './pages/CertificateIssuance';
import CentreManagement from './pages/CentreManagement';
import MembershipManagement from './pages/MembershipManagement';
import AssessmentsOversight from './pages/AssessmentsOversight';
import AccountSettings from './pages/AccountSettings';
import CentreAdmin from './pages/CentreAdmin';
import ClaimCandidate from './pages/ClaimCandidate';
import ClaimSlips from './pages/ClaimSlips';
import Invitations from './pages/Invitations';
import InstructorOnboarding from './pages/InstructorOnboarding';
import InstructorBlacklist from './pages/InstructorBlacklist';
import CourseManagement from './pages/CourseManagement';
import Accounts from './pages/Accounts';
import MyInvoices from './pages/MyInvoices';
import Enquiries from './pages/Enquiries';
import RegisterCentre from './pages/RegisterCentre';
import PartnerApplications from './pages/PartnerApplications';
import RoleRegistry from './pages/RoleRegistry';
import ExaminerRegistry from './pages/ExaminerRegistry';
import CentreBilling from './pages/CentreBilling';
import Store from './pages/Store';
import StoreAdmin from './pages/StoreAdmin';
import './styles/public.css';
import './styles/auth.css';
import './styles/admin.css';
import './styles/site.css';
import './styles/shell.css';
import './styles/theme.css';

const PORTAL_LOGIN: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PORTAL_LOGIN_URL ?? '/login';

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'is-active' : '');

function initials(email?: string | null): string {
  if (!email) return 'U';
  const name = email.split('@')[0];
  const parts = name.split(/[._-]/).filter(Boolean);
  return ((parts[0]?.[0] ?? 'U') + (parts[1]?.[0] ?? '')).toUpperCase();
}

function Brand() {
  return (
    <Link to="/" className="mas-brand" aria-label="MAS Swim Badges — home">
      <img
        src="/mas-logo.png"
        alt="MAS Swim Badges"
        className="mas-logo"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden'; }}
      />
    </Link>
  );
}

/* ---------- Public marketing layout (www) ---------- */
function PublicLayout() {
  const loginIsExternal = /^https?:\/\//i.test(PORTAL_LOGIN);
  const location = useLocation();
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Collapse the mobile menu (and the desktop search reveal) whenever the route
  // changes (e.g. a link is followed).
  useEffect(() => {
    setMenuOpen(false);
    setOpenSection(null);
    setSearchOpen(false);
  }, [location.pathname]);

  // Focus the desktop search input as soon as it is revealed.
  useEffect(() => {
    if (searchOpen) searchInputRef.current?.focus();
  }, [searchOpen]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
    setSearchOpen(false);
    setMenuOpen(false);
    setQuery('');
  };

  // Allow closing the open mobile menu with the Escape key.
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const toggleSection = (key: string) =>
    setOpenSection((cur) => (cur === key ? null : key));

  return (
    <div className="mas-site">
      <header className={`mas-topnav${scrolled ? ' is-scrolled' : ''}`}>
        {/* Slim utility strip above the main header. Part of the fixed stack, so
            its (constant) height is added to the `.mas-main` top offset in CSS.
            The left side is intentionally left open for future social links —
            add them before the "Contact us" link. */}
        <div className="mas-utilitybar">
          <div className="mas-utilitybar-inner">
            {/* Future: social-media links go here, on the left. */}
            <Link to="/contact" className="mas-utilitybar-link">Contact us</Link>
          </div>
        </div>
        <div className="mas-topnav-inner">
        <Brand />
        {/* Closes the mobile menu when any link inside is selected (the submenu
            toggle is a <button>, so tapping it leaves the menu open). */}
        <nav
          id="mas-mobile-nav"
          className={`mas-topnav-links${menuOpen ? ' is-open' : ''}`}
          onClick={(e) => { if ((e.target as HTMLElement).closest('a')) setMenuOpen(false); }}
        >
          {/* Search lives inside the mobile menu; the desktop reveal sits in the
              header bar (below). Both share the same query + submit handler. */}
          <form className="mas-search-mobile" role="search" onSubmit={submitSearch}>
            <input
              className="mas-search-input"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search the site…"
              aria-label="Search the site"
            />
            <button type="submit" className="mas-search-mobile-btn" aria-label="Search">
              <Icon name="search" />
            </button>
          </form>

          <NavLink to="/the-programme" className={navClass}>The programme</NavLink>

          <div className={`mas-navitem mas-has-menu${openSection === 'centre' ? ' is-open' : ''}`}>
            <div className="mas-navitem-top">
              <NavLink to="/directory" className={({ isActive }) => `mas-menu-top${isActive ? ' is-active' : ''}`}>Find a centre</NavLink>
              <button
                type="button"
                className="mas-submenu-toggle"
                aria-expanded={openSection === 'centre'}
                aria-label="Toggle Find a centre links"
                onClick={() => toggleSection('centre')}
              >
                <span className="mas-submenu-caret" aria-hidden="true" />
              </button>
            </div>
            <div className="mas-submenu">
              <NavLink to="/directory">Browse the directory</NavLink>
              <NavLink to="/for-centres">Become a partner centre</NavLink>
            </div>
          </div>

          <NavLink to="/instructors" className={navClass}>Instructors</NavLink>

          <div className={`mas-navitem mas-has-menu${openSection === 'guides' ? ' is-open' : ''}`}>
            <div className="mas-navitem-top">
              <NavLink to="/guides" className={({ isActive }) => `mas-menu-top${isActive ? ' is-active' : ''}`}>Guides</NavLink>
              <button
                type="button"
                className="mas-submenu-toggle"
                aria-expanded={openSection === 'guides'}
                aria-label="Toggle Guides links"
                onClick={() => toggleSection('guides')}
              >
                <span className="mas-submenu-caret" aria-hidden="true" />
              </button>
            </div>
            <div className="mas-submenu mas-submenu-wide">
              <NavLink to="/guides" className="mas-submenu-head">All guides</NavLink>
              <NavLink to="/guides/how-it-works">How MAS BADGES works</NavLink>
              <NavLink to="/guides/enrol">Getting into the Badges</NavLink>
              <NavLink to="/guides/claim">Claiming your child</NavLink>
              <NavLink to="/guides/certificates">Viewing certificates &amp; levels</NavLink>
              <NavLink to="/guides/verify">Authenticating a certificate</NavLink>
              <NavLink to="/guides/assessment">The assessment guide</NavLink>
              <NavLink to="/guides/instructor-pathway">Instructor pathway</NavLink>
              <NavLink to="/guides/examiner-pathway">Examiner pathway</NavLink>
            </div>
          </div>

          <NavLink to="/courses" className={navClass}>Courses</NavLink>
          <NavLink to="/faq" className={navClass}>FAQ</NavLink>
        </nav>
        {/* Desktop search: an icon button that reveals an inline input. Hidden on
            mobile, where the search box lives inside the menu panel instead. */}
        <form
          className={`mas-search${searchOpen ? ' is-open' : ''}`}
          role="search"
          onSubmit={submitSearch}
          onBlur={(e) => {
            // Close when focus leaves the whole control (input + toggle), not when
            // it merely moves between them.
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setSearchOpen(false);
          }}
        >
          <input
            ref={searchInputRef}
            className="mas-search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Escape') setSearchOpen(false); }}
            placeholder="Search the site…"
            aria-label="Search the site"
            aria-hidden={!searchOpen}
            tabIndex={searchOpen ? 0 : -1}
          />
          <button
            type="button"
            className="mas-search-toggle"
            aria-label={searchOpen ? 'Close search' : 'Open search'}
            aria-expanded={searchOpen}
            onClick={() => {
              // Toggle the reveal. When open the icon dismisses it; submitting is
              // done with Enter from the input, which fires the form's onSubmit.
              // (This button must NOT be type="submit": as the form's default
              // submit control it would otherwise intercept the Enter keypress
              // and cancel navigation via preventDefault.)
              setSearchOpen((o) => !o);
            }}
          >
            <Icon name="search" />
          </button>
        </form>
        {loginIsExternal ? (
          <a href={PORTAL_LOGIN} className="mas-login-btn">Portal login</a>
        ) : (
          <Link to={PORTAL_LOGIN} className="mas-login-btn">Portal login</Link>
        )}
        <button
          type="button"
          className="mas-nav-toggle"
          aria-expanded={menuOpen}
          aria-controls="mas-mobile-nav"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((o) => !o)}
        >
          <span className={`mas-burger${menuOpen ? ' is-open' : ''}`} aria-hidden="true">
            <span></span><span></span><span></span>
          </span>
        </button>
        </div>
      </header>

      <main className="mas-main"><Outlet /></main>

      <footer className="mas-site-footer">
        <div className="mas-footer-cols">
          <div>
            <h4>Programme</h4>
            <Link to="/the-programme">The programme</Link>
            <Link to="/directory">Find a centre</Link>
            <Link to="/instructors">Instructors</Link>
            <Link to="/courses">Courses</Link>
          </div>
          <div>
            <h4>Get involved</h4>
            <Link to="/for-parents">For parents</Link>
            <Link to="/for-centres">For centres</Link>
            <Link to="/verify">Verify a certificate</Link>
          </div>
          <div>
            <h4>About</h4>
            <Link to="/#about">About &amp; governance</Link>
            <Link to="/contact">Contact</Link>
            <Link to="/faq">FAQ</Link>
          </div>
          <div>
            <h4>Legal</h4>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/safeguarding">Child safeguarding</Link>
          </div>
        </div>
        <div className="mas-footer-base">© Malaysia Aquatics · Swim Badges programme</div>
      </footer>
    </div>
  );
}

/* ---------- Portal sidebar (apps) ---------- */
function Sidebar({
  open,
  onClose,
  onAttentionChange,
}: {
  open: boolean;
  onClose: () => void;
  onAttentionChange?: (total: number) => void;
}) {
  const { user, memberships, hasRole } = useAuth();

  const isGovernance =
    hasRole('chairperson') || hasRole('board_member') || hasRole('chief_examiner');
  const canManageCentres = hasRole('chairperson') || hasRole('board_member');
  const canManageMembers = hasRole('chairperson') || hasRole('board_member');
  const canCentreAdmin = hasRole('partner_center_admin');
  // Assessments oversight doubles as the payment-recording surface, so the
  // billing roles (finance_officer, system_admin) can reach it alongside
  // governance. (system_admin already passes via the has_role wildcard, but it
  // is listed explicitly to mirror the route guard.)
  const canOversight =
    isGovernance || hasRole('finance_officer') || hasRole('system_admin');
  const canRegister = hasRole('instructor') || isGovernance;
  const canSchedule = hasRole('instructor') || isGovernance;
  const canGrade = hasRole('examiner') || isGovernance;
  const canViewCerts = hasRole('examiner') || isGovernance;
  const canInvitations = hasRole('examiner');
  const canAccounts = hasRole('system_admin');
  const canMyInvoices = hasRole('instructor') || hasRole('partner_center_admin');
  const canClaimSlips = canRegister;
  const canOnboard =
    hasRole('instructor_trainer') || hasRole('chairperson') || hasRole('board_member');
  const canBlacklist = canManageMembers;
  const canManageCourses =
    hasRole('instructor_trainer') || hasRole('examiner_trainer') ||
    hasRole('chairperson') || hasRole('board_member');
  const canEnquiries =
    hasRole('chairperson') || hasRole('board_member') ||
    hasRole('instructor_trainer') || hasRole('system_admin');
  const canRegisterCentre = hasRole('instructor');
  const canPartnerApps = hasRole('chairperson') || hasRole('board_member');
  const canRoleRegistry = hasRole('system_admin');
  const canExaminerRegistry = hasRole('chief_examiner');
  const canCentreBilling = hasRole('chairperson') || hasRole('board_member') || hasRole('system_admin');
  const canBuyStore = hasRole('instructor') || hasRole('partner_center_admin');
  const canManageStore = hasRole('system_admin') || hasRole('chairperson') || hasRole('board_member');

  // Staff/operator roles are not parents in the context of the system, so the
  // "My child's badges" (claim) link is hidden for them. Pure-parent users —
  // those holding no portal role at all — keep seeing it.
  const isStaffOperator =
    hasRole('chairperson') || hasRole('board_member') || hasRole('chief_examiner') ||
    hasRole('instructor') || hasRole('examiner') || hasRole('instructor_trainer') ||
    hasRole('examiner_trainer') || hasRole('partner_center_admin') || hasRole('system_admin');

  const assessmentsGroup =
    canRegister || canSchedule || canGrade || canInvitations || canViewCerts || isGovernance || canClaimSlips || canOversight;
  const billingGroup = canAccounts || canMyInvoices || canCentreBilling || canManageStore;
  const adminGroup =
    canManageCentres || canManageMembers || canCentreAdmin || canOnboard || canBlacklist || canManageCourses || canEnquiries;

  const primaryRole = memberships[0]?.role;
  const roleLabel = primaryRole ? (ROLE_LABELS[primaryRole] ?? primaryRole) : 'Member';

  // Attention counts for sidebar dots. Re-fetched on every navigation so the
  // dot clears once an admin acknowledges the new enquiries on the queue page.
  const location = useLocation();
  const [unhandledEnquiries, setUnhandledEnquiries] = useState(0);
  useEffect(() => {
    if (!canEnquiries) { setUnhandledEnquiries(0); return; }
    let active = true;
    supabase.rpc('count_unhandled_enquiries').then(({ data }) => {
      if (active) setUnhandledEnquiries(typeof data === 'number' ? data : 0);
    });
    return () => { active = false; };
  }, [canEnquiries, location.pathname]);

  const [unhandledPartnerApps, setUnhandledPartnerApps] = useState(0);
  useEffect(() => {
    if (!canPartnerApps) { setUnhandledPartnerApps(0); return; }
    let active = true;
    supabase.rpc('count_unhandled_partner_applications').then(({ data }) => {
      if (active) setUnhandledPartnerApps(typeof data === 'number' ? data : 0);
    });
    return () => { active = false; };
  }, [canPartnerApps, location.pathname]);

  // Surface the total attention count to the shell so the mobile hamburger can
  // show its own little indicator when something inside the (collapsed) sidebar
  // needs attention.
  useEffect(() => {
    onAttentionChange?.(unhandledEnquiries + unhandledPartnerApps);
  }, [unhandledEnquiries, unhandledPartnerApps, onAttentionChange]);

  return (
    <>
      {/* Translucent backdrop: only visible (and tappable) on mobile when the
          drawer is open. Tapping it dismisses the sidebar. */}
      <div
        className={`mas-sidebar-backdrop${open ? ' is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      {/* Closes the drawer when any nav link inside is tapped (the <summary>
          group toggles are not anchors, so they keep the drawer open). */}
      <aside
        id="mas-portal-sidebar"
        className={`mas-sidebar${open ? ' is-open' : ''}`}
        onClick={(e) => { if ((e.target as HTMLElement).closest('a')) onClose(); }}
      >
      <Brand />

      <nav className="mas-sidenav">
        <NavLink to="/dashboard" className={navClass}><Icon name="grid" /><span>Dashboard</span></NavLink>
        {canBuyStore && <NavLink to="/store" className={navClass}><Icon name="card" /><span>Store</span></NavLink>}

        {assessmentsGroup && (
          <details className="mas-navgroup" open>
            <summary>Assessments</summary>
            <div className="mas-navgroup-items">
              {canRegister && <NavLink to="/candidates/register" className={navClass}><Icon name="userPlus" /><span>Register candidate</span></NavLink>}
              {canRegisterCentre && <NavLink to="/centres/register" className={navClass}><Icon name="building" /><span>Register a centre</span></NavLink>}
              {canSchedule && <NavLink to="/assessments/schedule" className={navClass}><Icon name="calendar" /><span>Schedule assessment</span></NavLink>}
              {canGrade && <NavLink to="/assessments/grade" className={navClass}><Icon name="check" /><span>Grading</span></NavLink>}
              {canInvitations && <NavLink to="/assessments/invitations" className={navClass}><Icon name="inbox" /><span>Available sessions</span></NavLink>}
              {isGovernance && <NavLink to="/certificates/issue" className={navClass}><Icon name="award" /><span>Issue certificates</span></NavLink>}
              {canViewCerts && <NavLink to="/certificates" className={navClass}><Icon name="award" /><span>Certificates</span></NavLink>}
              {canOversight && <NavLink to="/assessments/oversight" className={navClass}><Icon name="eye" /><span>Oversight</span></NavLink>}
              {canExaminerRegistry && <NavLink to="/assessments/examiners" className={navClass}><Icon name="users" /><span>Examiner registry</span></NavLink>}
              {canClaimSlips && <NavLink to="/candidates/claim-slips" className={navClass}><Icon name="printer" /><span>Claim slips</span></NavLink>}
            </div>
          </details>
        )}

        {billingGroup && (
          <details className="mas-navgroup" open>
            <summary>Billing</summary>
            <div className="mas-navgroup-items">
              {canAccounts && <NavLink to="/admin/accounts" className={navClass}><Icon name="card" /><span>Accounts</span></NavLink>}
              {canCentreBilling && <NavLink to="/admin/centre-billing" className={navClass}><Icon name="building" /><span>Centre billing</span></NavLink>}
              {canManageStore && <NavLink to="/admin/store" className={navClass}><Icon name="inbox" /><span>Store orders</span></NavLink>}
              {canMyInvoices && <NavLink to="/invoices" className={navClass}><Icon name="file" /><span>My invoices</span></NavLink>}
            </div>
          </details>
        )}

        {adminGroup && (
          <details className="mas-navgroup" open>
            <summary>Administration</summary>
            <div className="mas-navgroup-items">
              {canEnquiries && <NavLink to="/admin/enquiries" className={navClass}><Icon name="inbox" /><span>Enquiries</span><AttentionDot count={unhandledEnquiries} label="unhandled enquiries" /></NavLink>}
              {canPartnerApps && <NavLink to="/admin/partner-applications" className={navClass}><Icon name="check" /><span>Centre applications</span><AttentionDot count={unhandledPartnerApps} label="new applications" /></NavLink>}
              {canRoleRegistry && <NavLink to="/admin/role-registry" className={navClass}><Icon name="settings" /><span>Roles &amp; policies</span></NavLink>}
              {canManageCentres && <NavLink to="/admin/centres" className={navClass}><Icon name="building" /><span>Manage centres</span></NavLink>}
              {canManageMembers && <NavLink to="/admin/memberships" className={navClass}><Icon name="users" /><span>Memberships</span></NavLink>}
              {canOnboard && <NavLink to="/admin/instructors" className={navClass}><Icon name="userPlus" /><span>Instructor onboarding</span></NavLink>}
              {canBlacklist && <NavLink to="/admin/instructor-blacklist" className={navClass}><Icon name="userX" /><span>Instructor blacklist</span></NavLink>}
              {canManageCourses && <NavLink to="/admin/courses" className={navClass}><Icon name="book" /><span>Manage courses</span></NavLink>}
              {canCentreAdmin && <NavLink to="/centre" className={navClass}><Icon name="building" /><span>My centre</span></NavLink>}
            </div>
          </details>
        )}

        <details className="mas-navgroup" open>
          <summary>Account</summary>
          <div className="mas-navgroup-items">
            {!isStaffOperator && <NavLink to="/claim" className={navClass}><Icon name="star" /><span>My child&rsquo;s badges</span></NavLink>}
            <NavLink to="/account" className={navClass}><Icon name="settings" /><span>Account</span></NavLink>
          </div>
        </details>
      </nav>

      <Link to="/account" className="mas-profile">
        <span className="mas-avatar">{initials(user?.email)}</span>
        <span className="mas-profile-meta">
          <span className="mas-profile-name">{user?.email ?? 'Account'}</span>
          <span className="mas-profile-role">{roleLabel}</span>
        </span>
      </Link>
      </aside>
    </>
  );
}

/* ---------- Portal layout (apps) ---------- */
const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/account': 'Account',
  '/claim': "My child's badges",
  '/invoices': 'My invoices',
  '/centre': 'My centre',
  '/candidates/register': 'Register candidate',
  '/candidates/claim-slips': 'Claim slips',
  '/assessments/schedule': 'Schedule assessment',
  '/assessments/grade': 'Grading',
  '/assessments/invitations': 'Available sessions',
  '/assessments/oversight': 'Assessments oversight',
  '/assessments/examiners': 'Examiner registry',
  '/certificates/issue': 'Issue certificates',
  '/certificates': 'Certificates',
  '/admin/accounts': 'Accounts',
  '/admin/centre-billing': 'Centre billing',
  '/store': 'Store',
  '/admin/store': 'Store orders',
  '/admin/instructors': 'Instructor onboarding',
  '/admin/instructor-blacklist': 'Instructor blacklist',
  '/admin/courses': 'Manage courses',
  '/admin/centres': 'Manage centres',
  '/admin/memberships': 'Memberships',
  '/admin/enquiries': 'Enquiries',
  '/centres/register': 'Register a centre',
  '/admin/partner-applications': 'Centre applications',
  '/admin/role-registry': 'Roles & policies',
};

function AppLayout() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const title = PAGE_TITLES[location.pathname] ?? 'Portal';

  // Off-canvas sidebar state (mobile only — on desktop the sidebar is always
  // visible and `sidebarOpen` is inert because the drawer CSS is breakpointed).
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [attentionTotal, setAttentionTotal] = useState(0);

  // Close the drawer whenever the route changes (e.g. a nav link is followed).
  useEffect(() => { setSidebarOpen(false); }, [location.pathname]);

  // Escape closes the drawer; lock body scroll while it is open.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [sidebarOpen]);

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <div className="mas-layout">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onAttentionChange={setAttentionTotal}
      />
      <div className="mas-shell-main">
        <header className="mas-topbar-app">
          <div className="mas-topbar-left">
            <button
              type="button"
              className="mas-sidebar-toggle"
              aria-expanded={sidebarOpen}
              aria-controls="mas-portal-sidebar"
              aria-label={sidebarOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setSidebarOpen((o) => !o)}
            >
              <span className={`mas-burger${sidebarOpen ? ' is-open' : ''}`} aria-hidden="true">
                <span></span><span></span><span></span>
              </span>
              {attentionTotal > 0 && (
                <span
                  className="mas-toggle-dot"
                  role="status"
                  aria-label={`${attentionTotal} items need attention`}
                />
              )}
            </button>
            <div className="mas-breadcrumb">
              <span className="mas-crumb-muted">Portal</span>
              <span className="mas-crumb-sep">›</span>
              <span className="mas-crumb-here">{title}</span>
            </div>
          </div>
          <div className="mas-topbar-right">
            <Link to="/" className="mas-topbar-link">View site</Link>
            <button className="mas-signout" onClick={handleSignOut}>Sign out</button>
            <span className="mas-avatar mas-avatar-sm" title={user?.email ?? ''}>{initials(user?.email)}</span>
          </div>
        </header>
        <main className="mas-main"><Outlet /></main>
        <footer className="mas-footer">
          <p>© Malaysia Aquatics · Swim Badges programme</p>
        </footer>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ContentOverridesProvider>
      <BrowserRouter>
        <ScrollToTop />
        <div className="mas-app">
          <ErrorBoundary>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/the-programme" element={<TheProgramme />} />
              <Route path="/for-centres" element={<ForCentres />} />
              <Route path="/for-parents" element={<ForParents />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/guides" element={<Guides />} />
              <Route path="/guides/:slug" element={<GuideDetail />} />
              <Route path="/instructors" element={<Instructors />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/safeguarding" element={<Safeguarding />} />
              <Route path="/directory" element={<Directory />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/verify/:serial" element={<Verify />} />
              <Route path="/search" element={<SearchResults />} />
            </Route>

            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/account" element={<Protected><AccountSettings /></Protected>} />
              <Route path="/claim" element={<Protected><ClaimCandidate /></Protected>} />
              <Route path="/invoices" element={<RequireRole roles={['instructor', 'partner_center_admin']}><MyInvoices /></RequireRole>} />
              <Route path="/centre" element={<RequireRole roles={['partner_center_admin']}><CentreAdmin /></RequireRole>} />
              <Route path="/candidates/register" element={<RequireRole roles={['instructor', 'chairperson', 'board_member', 'chief_examiner']}><RegisterCandidate /></RequireRole>} />
              <Route path="/candidates/claim-slips" element={<RequireRole roles={['instructor', 'chairperson', 'board_member', 'chief_examiner']}><ClaimSlips /></RequireRole>} />
              <Route path="/assessments/schedule" element={<RequireRole roles={['instructor', 'chairperson', 'board_member', 'chief_examiner']}><RosterBooking /></RequireRole>} />
              <Route path="/assessments/grade" element={<RequireRole roles={['examiner', 'chief_examiner', 'chairperson', 'board_member']}><ExaminerGrading /></RequireRole>} />
              <Route path="/assessments/invitations" element={<RequireRole roles={['examiner']}><Invitations /></RequireRole>} />
              <Route path="/assessments/oversight" element={<RequireRole roles={['chairperson', 'board_member', 'chief_examiner', 'finance_officer', 'system_admin']}><AssessmentsOversight /></RequireRole>} />
              <Route path="/assessments/examiners" element={<RequireRole roles={['chief_examiner']}><ExaminerRegistry /></RequireRole>} />
              <Route path="/certificates/issue" element={<RequireRole roles={['chairperson', 'board_member', 'chief_examiner']}><CertificateIssuance /></RequireRole>} />
              <Route path="/certificates" element={<RequireRole roles={['examiner', 'chief_examiner', 'chairperson', 'board_member']}><Certificates /></RequireRole>} />
              <Route path="/admin/accounts" element={<RequireRole roles={['system_admin']}><Accounts /></RequireRole>} />
              <Route path="/admin/centre-billing" element={<RequireRole roles={['chairperson', 'board_member', 'system_admin']}><CentreBilling /></RequireRole>} />
              <Route path="/store" element={<RequireRole roles={['instructor', 'partner_center_admin']}><Store /></RequireRole>} />
              <Route path="/admin/store" element={<RequireRole roles={['system_admin', 'chairperson', 'board_member']}><StoreAdmin /></RequireRole>} />
              <Route path="/admin/instructors" element={<RequireRole roles={['instructor_trainer', 'chairperson', 'board_member']}><InstructorOnboarding /></RequireRole>} />
              <Route path="/admin/instructor-blacklist" element={<RequireRole roles={['chairperson', 'board_member']}><InstructorBlacklist /></RequireRole>} />
              <Route path="/admin/courses" element={<RequireRole roles={['instructor_trainer', 'examiner_trainer', 'chairperson', 'board_member']}><CourseManagement /></RequireRole>} />
              <Route path="/admin/centres" element={<RequireRole roles={['chairperson', 'board_member']}><CentreManagement /></RequireRole>} />
              <Route path="/admin/enquiries" element={<RequireRole roles={['chairperson', 'board_member', 'instructor_trainer', 'system_admin']}><Enquiries /></RequireRole>} />
              <Route path="/centres/register" element={<RequireRole roles={['instructor']}><RegisterCentre /></RequireRole>} />
              <Route path="/admin/partner-applications" element={<RequireRole roles={['chairperson', 'board_member']}><PartnerApplications /></RequireRole>} />
              <Route path="/admin/role-registry" element={<RequireRole roles={['system_admin']}><RoleRegistry /></RequireRole>} />
              <Route path="/admin/memberships" element={<RequireRole roles={['chairperson', 'board_member']}><MembershipManagement /></RequireRole>} />
            </Route>

            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          </ErrorBoundary>
        </div>
      </BrowserRouter>
      </ContentOverridesProvider>
    </AuthProvider>
  );
}
