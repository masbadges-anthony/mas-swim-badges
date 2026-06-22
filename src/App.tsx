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
import CertificateIssuance from './pages/CertificateIssuance';
import Certificates from './pages/Certificates';
import CentreManagement from './pages/CentreManagement';
import './styles/public.css';
import './styles/auth.css';

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
  const canRegister = hasRole('instructor') || isGovernance;
  const canSchedule = isGovernance;
  const canGrade = hasRole('examiner') || isGovernance;
  const canIssue = hasRole('examiner') || isGovernance;
  const canViewCerts = hasRole('examiner') || isGovernance;

  return (
    <header className="mas-topbar">
      <Link to="/" className="mas-brand">
        <span className="mas-brand-mark">MAS</span>
        <span className="mas-brand-text">Swim Badges</span>
      </Link>
      <nav className="mas-nav mas-nav-auth">
        <NavLink to="/directory" className={({ isActive }) => isActive ? 'is-active' : ''}>Centres</NavLink>
        <NavLink to="/verify" className={({ isActive }) => isActive ? 'is-active' : ''}>Verify</NavLink>
        {session ? (
          <>
            <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'is-active' : ''}>Dashboard</NavLink>
            {canRegister && (
              <NavLink to="/candidates/register" className={({ isActive }) => isActive ? 'is-active' : ''}>Register</NavLink>
            )}
            {canSchedule && (
              <NavLink to="/assessments/schedule" className={({ isActive }) => isActive ? 'is-active' : ''}>Schedule</NavLink>
            )}
            {canGrade && (
              <NavLink to="/assessments/grade" className={({ isActive }) => isActive ? 'is-active' : ''}>Grading</NavLink>
            )}
            {canIssue && (
              <NavLink to="/certificates/issue" className={({ isActive }) => isActive ? 'is-active' : ''}>Issue</NavLink>
            )}
            {canViewCerts && (
              <NavLink to="/certificates" className={({ isActive }) => isActive ? 'is-active' : ''}>Certificates</NavLink>
            )}
            {canManageCentres && (
              <NavLink to="/admin/centres" className={({ isActive }) => isActive ? 'is-active' : ''}>Manage centres</NavLink>
            )}
            <button className="mas-signout" onClick={handleSignOut}>Sign out</button>
          </>
        ) : (
          <NavLink to="/login" className={({ isActive }) => isActive ? 'is-active' : ''}>Sign in</NavLink>
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
                  <RequireRole roles={['chairperson', 'board_member', 'chief_examiner']}>
                    <CreateSession />
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
                path="/certificates/issue"
                element={
                  <RequireRole roles={['examiner', 'chief_examiner', 'chairperson', 'board_member']}>
                    <CertificateIssuance />
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
                path="/admin/centres"
                element={
                  <RequireRole roles={['chairperson', 'board_member']}>
                    <CentreManagement />
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
