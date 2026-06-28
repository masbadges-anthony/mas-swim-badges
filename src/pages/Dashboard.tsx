import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import Icon from '../components/Icon';
import '../styles/admin.css';

interface Tile { to: string; title: string; icon: string; accent: string; group: string; show: boolean; }
interface Stat { label: string; value: number; icon: string; tint: string; color: string; }
interface Attention { to: string; label: string; icon: string; }

const GROUPS = ['Assessments', 'Centres & partnerships', 'Billing & store', 'Administration', 'You'];

function displayName(email?: string | null): string {
  if (!email) return 'there';
  const h = email.split('@')[0].split('+')[0].split('.')[0];
  return h ? h.charAt(0).toUpperCase() + h.slice(1) : 'there';
}
function todayLabel(): string {
  return new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export default function Dashboard() {
  const { user, hasRole } = useAuth();
  const [stats, setStats] = useState<Stat[]>([]);
  const [unhandledEnquiries, setUnhandledEnquiries] = useState(0);
  const [unhandledPartnerApps, setUnhandledPartnerApps] = useState(0);

  // Capabilities used to gate the lightweight attention fetches below. The full
  // set of tile capabilities is computed further down for the fallback grid.
  const canSeeEnquiries = hasRole('chairperson') || hasRole('board_member') || hasRole('instructor_trainer') || hasRole('system_admin');
  const canSeePartnerApps = hasRole('chairperson') || hasRole('board_member');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const q = (tbl: string) => supabase.from(tbl).select('*', { count: 'exact', head: true });
      // Fire the stat counts and the role-gated attention counts together. Each
      // RPC is only requested when the signed-in user is permitted to act on it,
      // so non-permitted users never query.
      const enquiriesP = canSeeEnquiries ? supabase.rpc('count_unhandled_enquiries') : null;
      const partnerAppsP = canSeePartnerApps ? supabase.rpc('count_unhandled_partner_applications') : null;
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

      if (enquiriesP) {
        const { data } = await enquiriesP;
        if (!cancelled) setUnhandledEnquiries(typeof data === 'number' ? data : 0);
      }
      if (partnerAppsP) {
        const { data } = await partnerAppsP;
        if (!cancelled) setUnhandledPartnerApps(typeof data === 'number' ? data : 0);
      }
    })();
    return () => { cancelled = true; };
  }, [canSeeEnquiries, canSeePartnerApps]);

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
  const canManageCourses = hasRole('instructor_trainer') || hasRole('examiner_trainer') || hasRole('chairperson') || hasRole('board_member');
  const canEnquiries = hasRole('chairperson') || hasRole('board_member') || hasRole('instructor_trainer') || hasRole('system_admin');
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

  const tiles: Tile[] = [
    { to: '/candidates/register', title: 'Register candidate', icon: 'userPlus', accent: '#1d6fd6', group: 'Assessments', show: canRegister },
    { to: '/assessments/schedule', title: 'Schedule assessment', icon: 'calendar', accent: '#0ea5a4', group: 'Assessments', show: canSchedule },
    { to: '/assessments/invite', title: 'Invite examiner', icon: 'mail', accent: '#8e44ad', group: 'Assessments', show: canInvite },
    { to: '/assessments/grade', title: 'Grading', icon: 'check', accent: '#16a34a', group: 'Assessments', show: canGrade },
    { to: '/assessments/invitations', title: 'Invitations', icon: 'inbox', accent: '#f4b400', group: 'Assessments', show: canInvitations },
    { to: '/certificates', title: 'Certificates', icon: 'award', accent: '#0a1f44', group: 'Assessments', show: canViewCerts },
    { to: '/assessments/oversight', title: 'Oversight', icon: 'eye', accent: '#3b5bdb', group: 'Assessments', show: isGovernance },
    { to: '/assessments/examiners', title: 'Examiner registry', icon: 'users', accent: '#8e44ad', group: 'Assessments', show: canExaminerRegistry },
    { to: '/candidates/claim-slips', title: 'Claim slips', icon: 'printer', accent: '#2f9ee0', group: 'Assessments', show: canRegister },
    { to: '/admin/centres', title: 'Manage centres', icon: 'building', accent: '#1d6fd6', group: 'Centres & partnerships', show: canManageCentres },
    { to: '/admin/partner-applications', title: 'Centre applications', icon: 'check', accent: '#0a1f44', group: 'Centres & partnerships', show: canPartnerApps },
    { to: '/centres/register', title: 'Register a centre', icon: 'building', accent: '#1d6fd6', group: 'Centres & partnerships', show: canRegisterCentre },
    { to: '/admin/enquiries', title: 'Enquiries', icon: 'inbox', accent: '#0ea5e9', group: 'Centres & partnerships', show: canEnquiries },
    { to: '/centre', title: 'My centre', icon: 'building', accent: '#0a1f44', group: 'Centres & partnerships', show: canCentreAdmin },
    { to: '/admin/accounts', title: 'Accounts', icon: 'card', accent: '#dc2626', group: 'Billing & store', show: canAccounts },
    { to: '/admin/centre-billing', title: 'Centre billing', icon: 'building', accent: '#16a34a', group: 'Billing & store', show: canCentreBilling },
    { to: '/invoices', title: 'My invoices', icon: 'file', accent: '#16a34a', group: 'Billing & store', show: canMyInvoices },
    { to: '/store', title: 'Store', icon: 'card', accent: '#1d6fd6', group: 'Billing & store', show: canBuyStore },
    { to: '/admin/store', title: 'Store orders', icon: 'inbox', accent: '#d97706', group: 'Billing & store', show: canManageStore },
    { to: '/admin/memberships', title: 'Memberships', icon: 'users', accent: '#8e44ad', group: 'Administration', show: canManageMembers },
    { to: '/admin/instructors', title: 'Instructor onboarding', icon: 'userPlus', accent: '#0ea5a4', group: 'Administration', show: canOnboard },
    { to: '/admin/instructor-blacklist', title: 'Instructor blacklist', icon: 'userX', accent: '#dc2626', group: 'Administration', show: canManageMembers },
    { to: '/admin/courses', title: 'Manage courses', icon: 'book', accent: '#f4b400', group: 'Administration', show: canManageCourses },
    { to: '/admin/role-registry', title: 'Roles & policies', icon: 'settings', accent: '#64748b', group: 'Administration', show: canRoleRegistry },
    { to: '/claim', title: "My child's badges", icon: 'star', accent: '#2f9ee0', group: 'You', show: !isStaffOperator },
    { to: '/account', title: 'Account', icon: 'settings', accent: '#64748b', group: 'You', show: true },
  ];
  const visible = tiles.filter((t) => t.show);

  const attention: Attention[] = [
    canEnquiries && unhandledEnquiries > 0
      ? { to: '/admin/enquiries', label: `${unhandledEnquiries} unhandled ${unhandledEnquiries === 1 ? 'enquiry' : 'enquiries'}`, icon: 'inbox' }
      : null,
    canPartnerApps && unhandledPartnerApps > 0
      ? { to: '/admin/partner-applications', label: `${unhandledPartnerApps} new centre ${unhandledPartnerApps === 1 ? 'application' : 'applications'}`, icon: 'building' }
      : null,
  ].filter((a): a is Attention => a !== null);

  return (
    <section className="mas-page">
      <header className="mas-dash-head">
        <h1>Welcome back, <span className="mas-welcome-name">{displayName(user?.email)}</span></h1>
        <span className="mas-dash-date">{todayLabel()}</span>
      </header>

      {stats.length > 0 && (
        <div className="mas-statbar">
          {stats.map((s) => (
            <div key={s.label} className="mas-statpill">
              <span className="mas-statpill-ic" style={{ background: s.tint, color: s.color }}><Icon name={s.icon} /></span>
              <span className="mas-statpill-text">
                <span className="mas-statpill-n">{s.value.toLocaleString()}</span>
                <span className="mas-statpill-l">{s.label}</span>
              </span>
            </div>
          ))}
        </div>
      )}

      {attention.length > 0 && (
        <div className="mas-dash-section">
          <p className="mas-dash-section-label">What needs your attention</p>
          <div className="mas-attngrid">
            {attention.map((a) => (
              <Link key={a.to} to={a.to} className="mas-attncard">
                <span className="mas-attncard-ic"><Icon name={a.icon} /></span>
                <span className="mas-attncard-t">{a.label}</span>
                <span className="mas-attncard-go"><Icon name="arrowRight" /></span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {GROUPS.map((g) => {
        const items = visible.filter((t) => t.group === g);
        if (items.length === 0) return null;
        return (
          <div key={g} className="mas-dash-section">
            <p className="mas-dash-section-label">{g}</p>
            <div className="mas-tilegrid">
              {items.map((t) => (
                <Link key={t.to} to={t.to} className="mas-tile">
                  <span className="mas-tile-ic" style={{ background: `${t.accent}1a`, color: t.accent }}><Icon name={t.icon} /></span>
                  <span className="mas-tile-t">{t.title}</span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
