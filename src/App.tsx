import { BrowserRouter, Routes, Route, Link, NavLink, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import Protected from './components/Protected';
import RequireRole from './components/RequireRole';
import Home from './pages/Home';
import Directory from './pages/Directory';
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
import Invitations from './pages/Invitations';
import InviteExaminer from './pages/InviteExaminer';
import Accounts from './pages/Accounts';
import MyInvoices from './pages/MyInvoices';
import './styles/public.css';
import './styles/auth.css';
import './styles/admin.css';

const navClass = ({ isActive }: { isActive: boolean }) => (isActive ? 'is-active' : '');

function TopBar() {
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

  return (
    <header className="mas-topbar">
      <Link to="/" className="mas-brand">
        <img src="/mas-logo.png" alt="MAS Badges — Malaysia Aquatics" />
      </Link>
      <nav className="mas-nav mas-nav-auth">
        <NavLink to="/directory" className={navClass}>Centres</NavLink>
        <NavLink to="/verify" className={navClass}>Verify</NavLink>
        {session ? (
          <>
            <NavLink to="/dashboard" className={navClass}>Dashboard</NavLink>
            <details className="mas-tools">
              <summary>Tools</summary>
              <div className="mas-tools-menu">
                {canRegister && <NavLink to="/candidates/register" className={navClass}>Register candidate</NavLink>}
                {canSchedule && <NavLink to="/assessments/schedule" className={navClass}>Schedule assessment</NavLink>}
                {canInvite && <NavLink to="/assessments/invite" className={navClass}>Invite examiner</NavLink>}
                {canGrade && <NavLink to="/assessments/grade" className={navClass}>Grading</NavLink>}
                {canInvitations && <NavLink to="/assessments/invitations" className={navClass}>Invitations</NavLink>}
                {canViewCerts && <NavLink to="/certificates" className={navClass}>Certificates</NavLink>}
                {isGovernance && <NavLink to="/assessments/oversight" className={navClass}>Oversight</NavLink>}
                {canAccounts && <NavLink to="/admin/accounts" className={navClass}>Accounts</NavLink>}
                {canMyInvoices && <NavLink to="/invoices" className={navClass}>My invoices</NavLink>}
                {canManageCentres && <NavLink to="/admin/centres" className={navClass}>Manage centres</NavLink>}
                {canManageMembers && <NavLink to="/admin/memberships" className={navClass}>Memberships</NavLink>}
                {canCentreAdmin && <NavLink to="/centre" className={navClass}>My centre</NavLink>}
                <NavLink to="/claim" className={navClass}>My child&rsquo;s badges</NavLink>
                <NavLink to="/centres/apply" className={navClass}>Apply as a centre</NavLink>
                <NavLink to="/account" className={navClass}>Account</NavLink>
              </div>
            </details>
            <button className="mas-signout" onClick={handleSignOut}>Sign out</button>
          </>
        ) : (
          <NavLink to="/login" className={navClass}>Sign in</NavLink>
        )}
      </nav>
    </header>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="mas-app">
          <TopBar />
          <main className="mas-main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/directory" element={<Directory />} />
              <Route path="/verify" element={<Verify />} />
              <Route path="/verify/:serial" element={<Verify />} />
              <Route path="/login" element={<Login />} />
              <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
              <Route path="/account" element={<Protected><AccountSettings /></Protected>} />
              <Route path="/centres/apply" element={<Protected><ApplyCentre /></Protected>} />
              <Route path="/claim" element={<Protected><ClaimCandidate /></Protected>} />
              <Route path="/invoices" element={<RequireRole roles={['instructor', 'partner_center_admin']}><MyInvoices /></RequireRole>} />
              <Route
                path="/centre"
                element={
                  <RequireRole roles={['partner_center_admin']}>
                    <CentreAdmin />
                  </RequireRole>
                }
              />
              <Route
                path="/candidates/register"
                element={
                  <RequireRole roles={['instructor', 'chairperson', 'board_member', 'chief_examiner']}>
                    <RegisterCandidate />
                  </RequireRole>
                }
              />
              <Route
                path="/assessments/schedule"
                element={
                  <RequireRole roles={['instructor', 'chairperson', 'board_member', 'chief_examiner']}>
                    <CreateSession />
                  </RequireRole>
                }
              />
              <Route
                path="/assessments/invite"
                element={
                  <RequireRole roles={['chairperson', 'board_member', 'chief_examiner']}>
                    <InviteExaminer />
                  </RequireRole>
                }
              />
              <Route
                path="/assessments/grade"
                element={
                  <RequireRole roles={['examiner', 'chief_examiner', 'chairperson', 'board_member']}>
                    <ExaminerGrading />
                  </RequireRole>
                }
              />
              <Route
                path="/assessments/invitations"
                element={
                  <RequireRole roles={['examiner']}>
                    <Invitations />
                  </RequireRole>
                }
              />
              <Route
                path="/assessments/oversight"
                element={
                  <RequireRole roles={['chairperson', 'board_member', 'chief_examiner']}>
                    <AssessmentsOversight />
                  </RequireRole>
                }
              />
              <Route
                path="/certificates"
                element={
                  <RequireRole roles={['examiner', 'chief_examiner', 'chairperson', 'board_member']}>
                    <Certificates />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/accounts"
                element={
                  <RequireRole roles={['system_admin']}>
                    <Accounts />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/centres"
                element={
                  <RequireRole roles={['chairperson', 'board_member']}>
                    <CentreManagement />
                  </RequireRole>
                }
              />
              <Route
                path="/admin/memberships"
                element={
                  <RequireRole roles={['chairperson', 'board_member']}>
                    <MembershipManagement />
                  </RequireRole>
                }
              />
              <Route path="*" element={<Home />} />
            </Routes>
          </main>
          <footer className="mas-footer">
            <p>Malaysia Aquatics · Swim Badges programme</p>
          </footer>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
