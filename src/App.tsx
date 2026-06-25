import { BrowserRouter, Routes, Route, Link, NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth, ROLE_LABELS } from './lib/auth';
import Protected from './components/Protected';
import RequireRole from './components/RequireRole';
import Icon from './components/Icon';
import Home from './pages/Home';
import TheProgramme from './pages/TheProgramme';
import ForCentres from './pages/ForCentres';
import ForParents from './pages/ForParents';
import About from './pages/About';
import Contact from './pages/Contact';
import FAQ from './pages/FAQ';
import Privacy from './pages/Privacy';
import Terms from './pages/Terms';
import Safeguarding from './pages/Safeguarding';
import Directory from './pages/Directory';
import InstructorDirectory from './pages/InstructorDirectory';
import Courses from './pages/Courses';
import Verify from './pages/Verify';
import Login from './pages/Login';
import Signup from './pages/Signup';
import NotFound from './pages/NotFound';
import ErrorBoundary from './components/ErrorBoundary';
import Dashboard from './pages/Dashboard';
import RegisterCandidate from './pages/RegisterCandidate';
import CreateSession from './pages/CreateSession';
import ExaminerGrading from './pages/ExaminerGrading';
import Certificates from './pages/Certificates';
import CentreManagement from './pages/CentreManagement';
import MembershipManagement from './pages/MembershipManagement';
import AssessmentsOversight from './pages/AssessmentsOversight';
import AccountSettings from './pages/AccountSettings';
import CentreAdmin from './pages/CentreAdmin';
import ClaimCandidate from './pages/ClaimCandidate';
import ClaimSlips from './pages/ClaimSlips';
import Invitations from './pages/Invitations';
import InviteExaminer from './pages/InviteExaminer';
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

  return (
    <div className="mas-site">
      <header className="mas-topnav">
        <div className="mas-topnav-inner">
        <Brand />
        <nav className="mas-topnav-links">
          <NavLink to="/the-programme" className={navClass}>The programme</NavLink>
          <NavLink to="/directory" className={navClass}>Find a centre</NavLink>
          <NavLink to="/courses" className={navClass}>Courses</NavLink>
          <NavLink to="/for-centres" className={navClass}>For centres</NavLink>
          <NavLink to="/about" className={navClass}>About</NavLink>
          <NavLink to="/verify" className={navClass}>Verify</NavLink>
        </nav>
        {loginIsExternal ? (
          <a href={PORTAL_LOGIN} className="mas-login-btn">Portal login</a>
        ) : (
          <Link to={PORTAL_LOGIN} className="mas-login-btn">Portal login</Link>
        )}
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
            <Link to="/about">About &amp; governance</Link>
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
function Sidebar() {
  const { user, memberships, hasRole } = useAuth();

  const isGovernance =
    hasRole('chairperson') || hasRole('board_member') || hasRole('chief_examiner');
  const canManageCentres = hasRole('chairperson') || hasRole('board_member');
  const canManageMembers = hasRole('chairperson') || hasRole('board_member');
  const canCentreAdmin = hasRole('partner_center_admin');
  const canRegister = hasRole('instructor') || isGovernance;
  const canSchedule = hasRole('instructor') || isGovernance;
  const canGrade = hasRole('examiner') || isGovernance;
  const canViewCerts = hasRole('examiner') || isGovernance;
  const canInvitations = hasRole('examiner');
  const canInvite = isGovernance;
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

  const assessmentsGroup =
    canRegister || canSchedule || canInvite || canGrade || canInvitations || canViewCerts || isGovernance || canClaimSlips;
  const billingGroup = canAccounts || canMyInvoices || canCentreBilling || canManageStore;
  const adminGroup =
    canManageCentres || canManageMembers || canCentreAdmin || canOnboard || canBlacklist || canManageCourses || canEnquiries;

  const primaryRole = memberships[0]?.role;
  const roleLabel = primaryRole ? (ROLE_LABELS[primaryRole] ?? primaryRole) : 'Member';

  return (
    <aside className="mas-sidebar">
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
              {canInvite && <NavLink to="/assessments/invite" className={navClass}><Icon name="mail" /><span>Invite examiner</span></NavLink>}
              {canGrade && <NavLink to="/assessments/grade" className={navClass}><Icon name="check" /><span>Grading</span></NavLink>}
              {canInvitations && <NavLink to="/assessments/invitations" className={navClass}><Icon name="inbox" /><span>Invitations</span></NavLink>}
              {canViewCerts && <NavLink to="/certificates" className={navClass}><Icon name="award" /><span>Certificates</span></NavLink>}
              {isGovernance && <NavLink to="/assessments/oversight" className={navClass}><Icon name="eye" /><span>Oversight</span></NavLink>}
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
              {canEnquiries && <NavLink to="/admin/enquiries" className={navClass}><Icon name="inbox" /><span>Enquiries</span></NavLink>}
              {canPartnerApps && <NavLink to="/admin/partner-applications" className={navClass}><Icon name="check" /><span>Centre applications</span></NavLink>}
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
            <NavLink to="/claim" className={navClass}><Icon name="star" /><span>My child&rsquo;s badges</span></NavLink>
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
  '/assessments/invite': 'Invite examiner',
  '/assessments/grade': 'Grading',
  '/assessments/invitations': 'Invitations',
  '/assessments/oversight': 'Assessments oversight',
  '/assessments/examiners': 'Examiner registry',
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

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  return (
    <div className="mas-layout">
      <Sidebar />
      <div className="mas-shell-main">
        <header className="mas-topbar-app">
          <div className="mas-breadcrumb">
            <span className="mas-crumb-muted">Portal</span>
            <span className="mas-crumb-sep">›</span>
            <span className="mas-crumb-here">{title}</span>
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
      <BrowserRouter>
        <div className="mas-app">
          <ErrorBoundary>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/the-programme" element={<TheProgramme />} />
              <Route path="/for-centres" element={<ForCentres />} />
              <Route path="/for-parents" element={<ForParents />} />
              <Route path="/about" element={<About />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/faq" element={<FAQ />} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="/safeguarding" element={<Safeguarding />} />
              <Route path="/directory" element={<Directory />} />
              <Route path="/instructors" element={<InstructorDirectory />} />
              <Route path="/courses" element={<Courses />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/verify/:serial" element={<Verify />} />
            </Route>

            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/account" element={<Protected><AccountSettings /></Protected>} />
              <Route path="/claim" element={<Protected><ClaimCandidate /></Protected>} />
              <Route path="/invoices" element={<RequireRole roles={['instructor', 'partner_center_admin']}><MyInvoices /></RequireRole>} />
              <Route path="/centre" element={<RequireRole roles={['partner_center_admin']}><CentreAdmin /></RequireRole>} />
              <Route path="/candidates/register" element={<RequireRole roles={['instructor', 'chairperson', 'board_member', 'chief_examiner']}><RegisterCandidate /></RequireRole>} />
              <Route path="/candidates/claim-slips" element={<RequireRole roles={['instructor', 'chairperson', 'board_member', 'chief_examiner']}><ClaimSlips /></RequireRole>} />
              <Route path="/assessments/schedule" element={<RequireRole roles={['instructor', 'chairperson', 'board_member', 'chief_examiner']}><CreateSession /></RequireRole>} />
              <Route path="/assessments/invite" element={<RequireRole roles={['chairperson', 'board_member', 'chief_examiner']}><InviteExaminer /></RequireRole>} />
              <Route path="/assessments/grade" element={<RequireRole roles={['examiner', 'chief_examiner', 'chairperson', 'board_member']}><ExaminerGrading /></RequireRole>} />
              <Route path="/assessments/invitations" element={<RequireRole roles={['examiner']}><Invitations /></RequireRole>} />
              <Route path="/assessments/oversight" element={<RequireRole roles={['chairperson', 'board_member', 'chief_examiner']}><AssessmentsOversight /></RequireRole>} />
              <Route path="/assessments/examiners" element={<RequireRole roles={['chief_examiner']}><ExaminerRegistry /></RequireRole>} />
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
    </AuthProvider>
  );
}
