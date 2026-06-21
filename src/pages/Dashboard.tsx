import { useAuth, ROLE_LABELS } from '../lib/auth';

// Which modules each role will manage. Surfaced now so the RBAC structure is
// visible and testable; the screens themselves are built out phase by phase.
const ROLE_MODULES: Record<string, string[]> = {
  chairperson: ['Recognise partner centres', 'Grant & revoke roles', 'Schedule assessments', 'Oversight of all records'],
  board_member: ['Oversight of all records', 'Grant & revoke roles'],
  chief_examiner: ['Maintain the examiner register', 'Schedule assessments', 'Audit results'],
  examiner_trainer: ['Run examiner courses'],
  examiner: ['Grade assigned candidates', 'Issue certificates'],
  instructor: ['Register candidates', 'Request assessments'],
  partner_center_admin: ['Manage your centre', 'Register candidates'],
};

export default function Dashboard() {
  const { user, memberships } = useAuth();

  const roles = Array.from(new Set(memberships.map((m) => m.role)));
  const modules = Array.from(new Set(roles.flatMap((r) => ROLE_MODULES[r] ?? [])));

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Signed in</p>
        <h1>Dashboard</h1>
        <p className="mas-lede">{user?.email}</p>
      </header>

      <div className="mas-panel">
        <h2 className="mas-panel-title">Your roles</h2>
        {roles.length === 0 ? (
          <p className="mas-status">
            Your account has no active role yet. A Chairperson or the Board grants roles —
            until then there’s nothing here to manage.
          </p>
        ) : (
          <div className="mas-chip-row">
            {roles.map((r) => (
              <span key={r} className="mas-chip">{ROLE_LABELS[r] ?? r}</span>
            ))}
          </div>
        )}
      </div>

      {modules.length > 0 && (
        <div className="mas-panel">
          <h2 className="mas-panel-title">Available to you</h2>
          <ul className="mas-module-list">
            {modules.map((m) => (
              <li key={m} className="mas-module">
                <span>{m}</span>
                <span className="mas-soon">soon</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
