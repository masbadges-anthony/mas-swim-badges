import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import '../styles/admin.css';

interface Tile {
  to: string;
  title: string;
  desc: string;
  accent: string;
  show: boolean;
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();

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
  const canOnboard =
    hasRole('instructor_trainer') || hasRole('chairperson') || hasRole('board_member');
  const canManageCourses =
    hasRole('instructor_trainer') || hasRole('examiner_trainer') ||
    hasRole('chairperson') || hasRole('board_member');

  const tiles: Tile[] = [
    { to: '/candidates/register', title: 'Register candidate', desc: 'Enrol a swimmer for assessment.', accent: '#1d6fd6', show: canRegister },
    { to: '/assessments/schedule', title: 'Schedule assessment', desc: 'Create a session and roster candidates.', accent: '#0ea5a4', show: canSchedule },
    { to: '/assessments/invite', title: 'Invite examiner', desc: 'Assign an independent examiner.', accent: '#8e44ad', show: canInvite },
    { to: '/assessments/grade', title: 'Grading', desc: 'Record assessment outcomes.', accent: '#16a34a', show: canGrade },
    { to: '/assessments/invitations', title: 'Invitations', desc: 'Respond to assessment invitations.', accent: '#f4b400', show: canInvitations },
    { to: '/certificates', title: 'Certificates', desc: 'View the certificate registry.', accent: '#0a1f44', show: canViewCerts },
    { to: '/assessments/oversight', title: 'Oversight', desc: 'Monitor sessions and results.', accent: '#3b5bdb', show: isGovernance },
    { to: '/candidates/claim-slips', title: 'Claim slips', desc: 'Print parent claim slips.', accent: '#2f9ee0', show: canRegister },
    { to: '/admin/accounts', title: 'Accounts', desc: 'Invoicing, payments, payouts.', accent: '#dc2626', show: canAccounts },
    { to: '/invoices', title: 'My invoices', desc: 'See your assessment fees.', accent: '#16a34a', show: canMyInvoices },
    { to: '/admin/centres', title: 'Manage centres', desc: 'Recognise and manage centres.', accent: '#1d6fd6', show: canManageCentres },
    { to: '/admin/memberships', title: 'Memberships', desc: 'Grant and manage roles.', accent: '#8e44ad', show: canManageMembers },
    { to: '/admin/instructors', title: 'Instructor onboarding', desc: 'Invite instructors by email.', accent: '#0ea5a4', show: canOnboard },
    { to: '/admin/instructor-blacklist', title: 'Instructor blacklist', desc: 'Suspend and review instructors.', accent: '#dc2626', show: canManageMembers },
    { to: '/admin/courses', title: 'Manage courses', desc: 'Schedule certification courses.', accent: '#f4b400', show: canManageCourses },
    { to: '/centre', title: 'My centre', desc: 'Manage your centre and staff.', accent: '#0a1f44', show: canCentreAdmin },
    { to: '/claim', title: "My child's badges", desc: 'Claim and view your child’s record.', accent: '#2f9ee0', show: true },
    { to: '/account', title: 'Account', desc: 'Your profile and settings.', accent: '#64748b', show: true },
  ];

  const visible = tiles.filter((t) => t.show);

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Portal</p>
        <h1>Welcome{user?.email ? `, ${user.email}` : ''}</h1>
        <p className="mas-lede">Jump to anything you have access to.</p>
      </header>

      <div className="mas-dash-grid">
        {visible.map((t) => (
          <Link key={t.to} to={t.to} className="mas-dash-card">
            <span className="mas-dash-accent" style={{ background: t.accent }} />
            <h3>{t.title}</h3>
            <p>{t.desc}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
