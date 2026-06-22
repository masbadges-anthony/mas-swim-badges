import { BrowserRouter, Routes, Route, Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Protected from './components/Protected';
import RequireRole from './components/RequireRole';
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
import Dashboard from './pages/Dashboard';
import RegisterCandidate from './pages/RegisterCandidate';
import CreateSession from './pages/CreateSession';
import ExaminerGrading from './pages/ExaminerGrading';
import Certificates from './pages/Certificates';
import CentreManagement from './pages/CentreManagement';
import MembershipManagement from './pages/MembershipManagement';
import AssessmentsOversight from './pages/AssessmentsOversight';
import AccountSettings from './pages/AccountSettings';
import ApplyCentre from './pages/ApplyCentre';
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
import './styles/public.css';
import './styles/auth.css';
import './styles/admin.css';
import './styles/site.css';
import './styles/shell.css';

// Where the marketing site's "Member login" button points. In production set
// VITE_PORTAL_LOGIN_URL=https://apps.masbadges.org/login on the www build so the
// button crosses to the portal; locally/preview it falls back to a relative route.
const PORTAL_LOGIN: string =
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_PORTAL_LOGIN_URL ?? '/login';

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'is-active' : '');

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
  const { session } = useAuth();
  const loginIsExternal = /^https?:\/\//i.test(PORTAL_LOGIN);

  return (
    <div className="mas-site">
      <header className="mas-topnav">
        <Brand />
        <nav className="mas-topnav-links">
          <NavLink to="/the-programme" className={navClass}>The programme</NavLink>
          <NavLink to="/directory" className={navClass}>Find a centre</NavLink>
          <NavLink to="/courses" className={navClass}>Courses</NavLink>
          <NavLink to="/for-centres" className={navClass}>For centres</NavLink>
          <NavLink to="/about" className={navClass}>About</NavLink>
          <NavLink to="/verify" className={navClass}>Verify</NavLink>
        </nav>
        {session ? (
          <Link to="/dashboard" className="mas-login-btn">Go to portal</Link>
        ) : loginIsExternal ? (
          <a href={PORTAL_LOGIN} className="mas-login-btn">Member login</a>
        ) : (
          <Link to={PORTAL_LOGIN} className="mas-login-btn">Member login</Link>
        )}
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

/* ---------- Authenticated portal layout (apps) ---------- */
function Sidebar() {
  const { hasRole, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

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

  const assessmentsGroup =
    canRegister || canSchedule || canInvite || canGrade || canInvitations || canViewCerts || isGovernance || canClaimSlips;
  const billingGroup = canAccounts || canMyInvoices;
  const adminGroup =
    canManageCentres || canManageMembers || canCentreAdmin || canOnboard || canBlacklist || canManageCourses;

  return (
    <aside className="mas-sidebar">
      <Brand />

      <nav className="mas-sidenav">
        <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>

        {assessmentsGroup && (
          <details className="mas-navgroup" open>
            <summary>Assessments</summary>
            <div className="mas-navgroup-items">
              {canRegister && <NavLink to="/candidates/register" className={navClass}>Register candidate</NavLink>}
              {canSchedule && <NavLink to="/assessments/schedule" className={navClass}>Schedule assessment</NavLink>}
              {canInvite && <NavLink to="/assessments/invite" className={navClass}>Invite examiner</NavLink>}
              {canGrade && <NavLink to="/assessments/grade" className={navClass}>Grading</NavLink>}
              {canInvitations && <NavLink to="/assessments/invitations" className={navClass}>Invitations</NavLink>}
              {canViewCerts && <NavLink to="/certificates" className={navClass}>Certificates</NavLink>}
              {isGovernance && <NavLink to="/assessments/oversight" className={navClass}>Oversight</NavLink>}
              {canClaimSlips && <NavLink to="/candidates/claim-slips" className={navClass}>Claim slips</NavLink>}
            </div>
          </details>
        )}

        {billingGroup && (
          <details className="mas-navgroup" open>
            <summary>Billing</summary>
            <div className="mas-navgroup-items">
              {canAccounts && <NavLink to="/admin/accounts" className={navClass}>Accounts</NavLink>}
              {canMyInvoices && <NavLink to="/invoices" className={navClass}>My invoices</NavLink>}
            </div>
          </details>
        )}

        {adminGroup && (
          <details className="mas-navgroup" open>
            <summary>Administration</summary>
            <div className="mas-navgroup-items">
              {canManageCentres && <NavLink to="/admin/centres" className={navClass}>Manage centres</NavLink>}
              {canManageMembers && <NavLink to="/admin/memberships" className={navClass}>Memberships</NavLink>}
              {canOnboard && <NavLink to="/admin/instructors" className={navClass}>Instructor onboarding</NavLink>}
              {canBlacklist && <NavLink to="/admin/instructor-blacklist" className={navClass}>Instructor blacklist</NavLink>}
              {canManageCourses && <NavLink to="/admin/courses" className={navClass}>Manage courses</NavLink>}
              {canCentreAdmin && <NavLink to="/centre" className={navClass}>My centre</NavLink>}
            </div>
          </details>
        )}

        <details className="mas-navgroup" open>
          <summary>Account</summary>
          <div className="mas-navgroup-items">
            <NavLink to="/claim" className={navClass}>My child&rsquo;s badges</NavLink>
            <NavLink to="/centres/apply" className={navClass}>Apply as a centre</NavLink>
            <NavLink to="/account" className={navClass}>Account</NavLink>
          </div>
        </details>
      </nav>

      <div className="mas-sidebar-foot">
        <Link to="/" className="mas-foot-link">View public site</Link>
        <button className="mas-signout" onClick={handleSignOut}>Sign out</button>
      </div>
    </aside>
  );
}

function AppLayout() {
  return (
    <div className="mas-layout">
      <Sidebar />
      <div className="mas-shell-main">
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
          <Routes>
            {/* Public marketing site (www) */}
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
              <Route path="/login" element={<Login />} />
              <Route path="*" element={<Home />} />
            </Route>

            {/* Authenticated portal (apps) */}
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/account" element={<Protected><AccountSettings /></Protected>} />
              <Route path="/centres/apply" element={<Protected><ApplyCentre /></Protected>} />
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
              <Route path="/certificates" element={<RequireRole roles={['examiner', 'chief_examiner', 'chairperson', 'board_member']}><Certificates /></RequireRole>} />
              <Route path="/admin/accounts" element={<RequireRole roles={['system_admin']}><Accounts /></RequireRole>} />
              <Route path="/admin/instructors" element={<RequireRole roles={['instructor_trainer', 'chairperson', 'board_member']}><InstructorOnboarding /></RequireRole>} />
              <Route path="/admin/instructor-blacklist" element={<RequireRole roles={['chairperson', 'board_member']}><InstructorBlacklist /></RequireRole>} />
              <Route path="/admin/courses" element={<RequireRole roles={['instructor_trainer', 'examiner_trainer', 'chairperson', 'board_member']}><CourseManagement /></RequireRole>} />
              <Route path="/admin/centres" element={<RequireRole roles={['chairperson', 'board_member']}><CentreManagement /></RequireRole>} />
              <Route path="/admin/memberships" element={<RequireRole roles={['chairperson', 'board_member']}><MembershipManagement /></RequireRole>} />
            </Route>
          </Routes>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
