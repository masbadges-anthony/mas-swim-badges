import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom';
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
import './styles/shell.css';

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'is-active' : '');

function Sidebar() {
  const { session, hasRole, signOut } = useAuth();
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
      <Link to="/" className="mas-brand">
        <span className="mas-brand-mark">MAS</span>
        <span className="mas-brand-text">Swim Badges</span>
      </Link>

      <nav className="mas-sidenav">
        <NavLink to="/the-programme" className={navClass}>The programme</NavLink>
        <NavLink to="/directory" className={navClass}>Find a centre</NavLink>
        <NavLink to="/instructors" className={navClass}>Instructors</NavLink>
        <NavLink to="/courses" className={navClass}>Courses</NavLink>
        <NavLink to="/for-centres" className={navClass}>For centres</NavLink>
        <NavLink to="/for-parents" className={navClass}>For parents</NavLink>
        <NavLink to="/about" className={navClass}>About</NavLink>
        <NavLink to="/verify" className={navClass}>Verify</NavLink>
        {session && <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>}

        {session && assessmentsGroup && <p className="mas-sidenav-group">Assessments</p>}
        {session && canRegister && <NavLink to="/candidates/register" className={navClass}>Register candidate</NavLink>}
        {session && canSchedule && <NavLink to="/assessments/schedule" className={navClass}>Schedule assessment</NavLink>}
        {session && canInvite && <NavLink to="/assessments/invite" className={navClass}>Invite examiner</NavLink>}
        {session && canGrade && <NavLink to="/assessments/grade" className={navClass}>Grading</NavLink>}
        {session && canInvitations && <NavLink to="/assessments/invitations" className={navClass}>Invitations</NavLink>}
        {session && canViewCerts && <NavLink to="/certificates" className={navClass}>Certificates</NavLink>}
        {session && isGovernance && <NavLink to="/assessments/oversight" className={navClass}>Oversight</NavLink>}
        {session && canClaimSlips && <NavLink to="/candidates/claim-slips" className={navClass}>Claim slips</NavLink>}

        {session && billingGroup && <p className="mas-sidenav-group">Billing</p>}
        {session && canAccounts && <NavLink to="/admin/accounts" className={navClass}>Accounts</NavLink>}
        {session && canMyInvoices && <NavLink to="/invoices" className={navClass}>My invoices</NavLink>}

        {session && adminGroup && <p className="mas-sidenav-group">Administration</p>}
        {session && canManageCentres && <NavLink to="/admin/centres" className={navClass}>Manage centres</NavLink>}
        {session && canManageMembers && <NavLink to="/admin/memberships" className={navClass}>Memberships</NavLink>}
        {session && canOnboard && <NavLink to="/admin/instructors" className={navClass}>Instructor onboarding</NavLink>}
        {session && canBlacklist && <NavLink to="/admin/instructor-blacklist" className={navClass}>Instructor blacklist</NavLink>}
        {session && canManageCourses && <NavLink to="/admin/courses" className={navClass}>Manage courses</NavLink>}
        {session && canCentreAdmin && <NavLink to="/centre" className={navClass}>My centre</NavLink>}

        {session && <p className="mas-sidenav-group">Account</p>}
        {session && <NavLink to="/claim" className={navClass}>My child&rsquo;s badges</NavLink>}
        {session && <NavLink to="/centres/apply" className={navClass}>Apply as a centre</NavLink>}
        {session && <NavLink to="/account" className={navClass}>Account</NavLink>}
      </nav>

      <div className="mas-sidebar-foot">
        {session ? (
          <button className="mas-signout" onClick={handleSignOut}>Sign out</button>
        ) : (
          <NavLink to="/login" className={navClass}>Member login</NavLink>
        )}
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="mas-app">
          <div className="mas-layout">
            <Sidebar />
            <div className="mas-shell-main">
              <main className="mas-main">
                <Routes>
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
                  <Route path="*" element={<Home />} />
                </Routes>
              </main>
              <footer className="mas-footer">
                <nav className="mas-footer-links">
                  <Link to="/contact">Contact</Link>
                  <Link to="/faq">FAQ</Link>
                  <Link to="/privacy">Privacy</Link>
                  <Link to="/terms">Terms</Link>
                  <Link to="/safeguarding">Child safeguarding</Link>
                </nav>
                <p>© Malaysia Aquatics · Swim Badges programme</p>
              </footer>
            </div>
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
