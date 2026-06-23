import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import '../styles/admin.css';

interface Tile { to: string; title: string; desc: string; accent: string; show: boolean; }
interface Stat { label: string; value: number; icon: string; tint: string; color: string; }

function displayName(email?: string | null): string {
  if (!email) return 'there';
  const h = email.split('@')[0].split('+')[0].split('.')[0];
  return h ? h.charAt(0).toUpperCase() + h.slice(1) : 'there';
}
function todayLabel(): string {
  return new Date()
    .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    .toUpperCase()
    .replace(/,/g, ' ·');
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const [stats, setStats] = useState<Stat[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = (tbl: string) => supabase.from(tbl).select('*', { count: 'exact', head: true });
      const res = await Promise.allSettled([
        q('candidates'), q('certificates'), q('partner_center_directory'), q('public_courses'),
      ]);
      const val = (r: PromiseSettledResult<{ count: number | null }>): number | null =>
        r.status === 'fulfilled' && r.value.count != null ? r.value.count : null;
      const defs: [number | null, Stat][] = [
        [val(res[0] as PromiseSettledResult<{ count: number | null }>), { label: 'Candidates', value: 0, icon: 'userPlus', tint: '#eaf2fc', color: '#1d6fd6' }],
        [val(res[1] as PromiseSettledResult<{ count: number | null }>), { label: 'Certificates', value: 0, icon: 'award', tint: '#e7f6ed', color: '#16a34a' }],
        [val(res[2] as PromiseSettledResult<{ count: number | null }>), { label: 'Centres', value: 0, icon: 'building', tint: '#f3eafe', color: '#8e44ad' }],
        [val(res[3] as PromiseSettledResult<{ count: number | null }>), { label: 'Courses', value: 0, icon: 'book', tint: '#fff4e0', color: '#f4b400' }],
      ];
      const out = defs.filter(([c]) => c != null).map(([c, s]) => ({ ...s, value: c as number }));
      if (!cancelled) setStats(out);
    })();
    return () => { cancelled = true; };
  }, []);

  const isGovernance = hasRole('chairperson') || hasRole('board_member') || hasRole('chief_examiner');
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
  const canOnboard = hasRole('instructor_trainer') || hasRole('chairperson') || hasRole('board_member');
  const canManageCourses =
    hasRole('instructor_trainer') || hasRole('examiner_trainer') || hasRole('chairperson') || hasRole('board_member');

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
      <header className="mas-page-head mas-dash-head">
        <p className="mas-eyebrow">{todayLabel()}</p>
        <h1>Welcome back, <span className="mas-welcome-name">{displayName(user?.email)}</span></h1>
        <p className="mas-lede">Jump to anything you have access to.</p>
      </header>

      {stats.length > 0 && (
        <div className="mas-statgrid">
          {stats.map((s) => (
            <div key={s.label} className="mas-stat">
              <div className="mas-stat-top">
                <span className="mas-stat-icon" style={{ background: s.tint, color: s.color }}>
                  <Icon name={s.icon} />
                </span>
                <span className="mas-stat-label">{s.label}</span>
              </div>
              <div className="mas-stat-value">{s.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      )}

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
