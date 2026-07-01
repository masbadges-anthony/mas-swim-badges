// #18 — Staff account provisioning.
//
// Admin-only surface at /admin/staff. Calls the admin-create-user Edge Function
// which invites a new user via Supabase Auth AND grants their membership in one
// atomic step. The invite email lands them on /auth/callback → /set-password.
//
// House law: dense table · Active / Pending / All tabs · inline-add row.
// Inline-add: email · full name · role · conditional scope · expiry · +Create.
//
// Reads via list_provisioned_accounts() (unit 18.2). Writes via Edge Function
// (unit 18.1's SQL + admin_create_user_index.ts).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Account {
  profile_id: string;
  email: string;
  full_name: string | null;
  roles: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  status: string; // 'active' | 'invited_pending' | 'suspended' | 'no_membership'
}
interface RoleRow { role: string; }
interface StateRow { state: string; }
interface CentreRow { id: string; name: string; }

type Load = 'loading' | 'ready' | 'error';
type Tab = 'active' | 'pending' | 'suspended' | 'all';

function pretty(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function scopeKind(role: string): 'state' | 'centre' | 'centre_optional' | 'none' {
  if (role === 'examiner') return 'state';
  if (role === 'partner_center_admin') return 'centre';
  if (role === 'instructor') return 'centre_optional';
  return 'none';
}

const CSS = `
.mas-addrow td { background:#f5f8fc; }
.mas-addrow-fields { display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; }
.mas-addrow-fields input, .mas-addrow-fields select {
  font:inherit; padding:0.35rem 0.5rem; border:1px solid var(--mas-line,#e3e9f3); border-radius:6px;
}
.mas-addrow-fields input[type=email] { min-width:16rem; }
.mas-addrow-fields input[type=text] { min-width:12rem; }
.mas-addrow-fields select { min-width:11rem; }
.mas-addrow-fields input[type=date] { min-width:9rem; }
.mas-menu-item {
  display: block; width: 100%; text-align: left; padding: 0.45rem 0.8rem;
  font: inherit; color: var(--mas-navy, #1E2752); background: transparent;
  border: none; cursor: pointer;
}
.mas-menu-item:hover { background: #f5f8fc; }
`;

export default function AccountProvisioning() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');

  // Reference data for the inline-add row
  const [roles, setRoles] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [centres, setCentres] = useState<CentreRow[]>([]);

  // Create-form state
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState('');
  const [state, setState] = useState('');
  const [centreId, setCentreId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createOk, setCreateOk] = useState<string | null>(null);

  // Row action state
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [rowMenuOpen, setRowMenuOpen] = useState<string | null>(null);
  const [rowMenuAnchor, setRowMenuAnchor] = useState<{ x: number; y: number } | null>(null);
  const [rowMsg, setRowMsg] = useState<Record<string, { ok?: string; err?: string }>>({});

  const fetchAccounts = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_provisioned_accounts');
    if (error) { setLoad('error'); return; }
    setAccounts((data ?? []) as Account[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [r, s, c] = await Promise.all([
        supabase.rpc('list_roles'),
        supabase.rpc('list_states'),
        supabase.from('partner_centers').select('id, name').order('name'),
      ]);
      if (cancelled) return;
      setRoles(((r.data ?? []) as RoleRow[]).map((x) => x.role));
      setStates(((s.data ?? []) as StateRow[]).map((x) => x.state));
      setCentres((c.data ?? []) as CentreRow[]);
    })();
    fetchAccounts();
    return () => { cancelled = true; };
  }, [fetchAccounts]);

  // Click-outside-to-close for the row action menu.
  useEffect(() => {
    if (!rowMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) { setRowMenuOpen(null); return; }
      // Don't close if the click was inside the menu itself or on the trigger.
      if (t.closest('[data-mas-row-menu]')) return;
      if (t.closest('[data-mas-row-menu-trigger]')) return;
      setRowMenuOpen(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRowMenuOpen(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [rowMenuOpen]);

  const kind = scopeKind(role);
  const canCreate =
    email.includes('@') && !!fullName.trim() && !!role &&
    (kind !== 'state' || !!state) &&
    (kind !== 'centre' || !!centreId) &&
    !creating;

  async function create() {
    if (!canCreate) return;
    setCreating(true); setCreateError(null); setCreateOk(null);

    const { data, error } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: email.trim().toLowerCase(),
        full_name: fullName.trim(),
        role,
        state: kind === 'state' ? state : null,
        centre_id: kind === 'centre' || (kind === 'centre_optional' && centreId) ? centreId || null : null,
        expires_at: expiresAt || null,
      },
    });
    setCreating(false);

    if (error) {
      setCreateError(error.message || 'Failed to create account.');
      return;
    }
    // Edge Function returns a JSON body via data; error branches surface via .error above,
    // but a 4xx-with-JSON might land in data as { error: ... } — handle both.
    const resp = data as { ok?: boolean; error?: string; detail?: string; email?: string } | null;
    if (!resp?.ok) {
      const msg = resp?.error === 'email_exists'
        ? 'An account already exists for that email. Grant additional roles via Memberships instead.'
        : resp?.error === 'forbidden'
        ? 'Only system administrators and the chairperson can create accounts.'
        : `Create failed: ${resp?.error ?? 'unknown'}${resp?.detail ? ' — ' + resp.detail : ''}`;
      setCreateError(msg);
      return;
    }

    setCreateOk(`Invitation sent to ${resp.email}. They'll set a password from the email link.`);
    setEmail(''); setFullName(''); setRole('');
    setState(''); setCentreId(''); setExpiresAt('');
    fetchAccounts();
  }

  async function callAction(a: Account, action: string, extra?: Record<string, unknown>) {
    setRowBusy(a.profile_id);
    setRowMsg((m) => ({ ...m, [a.profile_id]: {} }));
    setRowMenuOpen(null);
    const { data, error } = await supabase.functions.invoke('admin-manage-user', {
      body: { action, target_profile_id: a.profile_id, ...extra },
    });
    setRowBusy(null);
    if (error) {
      // supabase.functions.invoke throws on non-2xx but the friendly detail is on
      // the response body. Try to fetch it from error.context.body if present.
      let friendly = error.message;
      try {
        // FunctionsHttpError puts the Response on error.context; extract JSON.
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.detail) friendly = body.detail;
          else if (body?.error) friendly = body.error;
        }
      } catch (_e) { /* fall through with generic message */ }
      setRowMsg((m) => ({ ...m, [a.profile_id]: { err: friendly } }));
      return;
    }
    const resp = data as { ok?: boolean; error?: string; detail?: string } | null;
    if (!resp?.ok) {
      setRowMsg((m) => ({ ...m, [a.profile_id]: { err: `${resp?.error ?? 'failed'}${resp?.detail ? ' — ' + resp.detail : ''}` } }));
      return;
    }
    const okMsg = action === 'update_email' ? 'Email updated. Verification email sent to the new address.'
      : action === 'reset_password' ? 'Password-reset email sent.'
      : action === 'suspend' ? 'Account suspended.'
      : action === 'reactivate' ? 'Account reactivated.'
      : action === 'delete' ? 'Account deleted.'
      : 'Done.';
    setRowMsg((m) => ({ ...m, [a.profile_id]: { ok: okMsg } }));
    fetchAccounts();
  }

  async function onChangeEmail(a: Account) {
    const ne = window.prompt(`Change email for ${a.full_name || a.email}.\n\nNew email:`, a.email);
    if (!ne || !ne.trim() || !ne.includes('@')) return;
    if (ne.trim().toLowerCase() === a.email.toLowerCase()) return;
    if (!window.confirm(`Change ${a.email} to ${ne.trim().toLowerCase()}?\nA verification email will be sent to the new address.`)) return;
    await callAction(a, 'update_email', { new_email: ne.trim().toLowerCase() });
  }
  async function onResetPassword(a: Account) {
    if (!window.confirm(`Send a password-reset email to ${a.email}?`)) return;
    await callAction(a, 'reset_password');
  }
  async function onSuspend(a: Account) {
    if (!window.confirm(`Suspend ${a.full_name || a.email}?\nThey will not be able to sign in until reactivated.`)) return;
    await callAction(a, 'suspend');
  }
  async function onReactivate(a: Account) {
    await callAction(a, 'reactivate');
  }
  async function onDelete(a: Account) {
    const confirm1 = window.confirm(`DELETE ${a.full_name || a.email}?\n\nThis removes their account permanently. Certificates and audit history remain, but they lose all access.`);
    if (!confirm1) return;
    const confirm2 = window.prompt(`Type DELETE to confirm.`);
    if (confirm2 !== 'DELETE') return;
    await callAction(a, 'delete');
  }

  const counts = useMemo(() => ({
    active: accounts.filter((a) => a.status === 'active').length,
    pending: accounts.filter((a) => a.status === 'invited_pending').length,
    suspended: accounts.filter((a) => a.status === 'suspended').length,
    all: accounts.length,
  }), [accounts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts
      .filter((a) => {
        if (tab === 'active') return a.status === 'active';
        if (tab === 'pending') return a.status === 'invited_pending';
        if (tab === 'suspended') return a.status === 'suspended';
        return true;
      })
      .filter((a) =>
        !q ||
        (a.email ?? '').toLowerCase().includes(q) ||
        (a.full_name ?? '').toLowerCase().includes(q) ||
        (a.roles ?? '').toLowerCase().includes(q));
  }, [accounts, tab, query]);

  return (
    <section className="mas-page">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Administration</p>
        <h1>Staff accounts</h1>
        <p className="mas-lede">
          Provision staff and governance accounts. The invitee receives an email to
          set their password; their role is granted the moment the account is
          created. Parents don’t appear here — they claim access via the public
          claim-code sign-up.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchAccounts} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          <button role="tab" aria-selected={tab === 'active'}
            className={tab === 'active' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('active')}>Active ({counts.active})</button>
          <button role="tab" aria-selected={tab === 'pending'}
            className={tab === 'pending' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('pending')}>Invited ({counts.pending})</button>
          <button role="tab" aria-selected={tab === 'suspended'}
            className={tab === 'suspended' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('suspended')}>Suspended ({counts.suspended})</button>
          <button role="tab" aria-selected={tab === 'all'}
            className={tab === 'all' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('all')}>All ({counts.all})</button>
        </div>
        <input className="mas-input" type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, role"
          style={{ maxWidth: '22rem' }} />
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {createError && <p className="mas-status mas-status-bad">{createError}</p>}
      {createOk && <p className="mas-status mas-status-good">{createOk}</p>}

      <div className="mas-table-wrap">
        <table className="mas-table">
          <thead>
            <tr>
              <th>Person</th>
              <th>Role(s)</th>
              <th>Created</th>
              <th>Last sign-in</th>
              <th>Status</th>
              <th className="mas-table-actioncol">Action</th>
            </tr>
          </thead>
          <tbody>
            {/* Inline-add row on the Active tab only */}
            {tab === 'active' && (
              <tr className="mas-addrow">
                <td colSpan={6}>
                  <div className="mas-addrow-fields">
                    <input type="email" value={email} autoComplete="off"
                      placeholder="Email"
                      onChange={(e) => setEmail(e.target.value)} />
                    <input type="text" value={fullName}
                      placeholder="Full name"
                      onChange={(e) => setFullName(e.target.value)} />
                    <select value={role} onChange={(e) => { setRole(e.target.value); setState(''); setCentreId(''); }}>
                      <option value="">Select role…</option>
                      {roles.map((r) => <option key={r} value={r}>{pretty(r)}</option>)}
                    </select>
                    {kind === 'state' && (
                      <select value={state} onChange={(e) => setState(e.target.value)}>
                        <option value="">Select state…</option>
                        {states.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    )}
                    {(kind === 'centre' || kind === 'centre_optional') && (
                      <select value={centreId} onChange={(e) => setCentreId(e.target.value)}>
                        <option value="">{kind === 'centre_optional' ? 'No centre' : 'Select centre…'}</option>
                        {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    )}
                    <input type="date" value={expiresAt}
                      onChange={(e) => setExpiresAt(e.target.value)}
                      title="Expires (optional)" />
                    <button className="mas-btn-primary mas-btn-compact" onClick={create} disabled={!canCreate}>
                      {creating ? 'Creating…' : '+ Create'}
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {load === 'loading' && (
              <tr><td colSpan={6} className="mas-status">Loading…</td></tr>
            )}
            {load === 'error' && (
              <tr><td colSpan={5} className="mas-status mas-status-bad">Couldn’t load accounts.</td></tr>
            )}
            {load === 'ready' && filtered.length === 0 && (
              <tr><td colSpan={6} className="mas-status">
                {tab === 'pending' ? 'No pending invitations.' : 'No accounts in this view.'}
              </td></tr>
            )}

            {filtered.map((a) => (
              <tr key={a.profile_id}>
                <td className="mas-cell-strong">
                  <span className="mas-cell-stack">
                    <span>{a.full_name || '(no name)'}</span>
                    <span className="mas-cell-sub">{a.email}</span>
                  </span>
                </td>
                <td>
                  {a.roles ? (
                    a.roles.split(', ').map((r) => (
                      <span key={r} className="mas-pill" style={{ marginRight: '0.3rem' }}>{pretty(r)}</span>
                    ))
                  ) : (
                    <span className="mas-cell-sub">no membership</span>
                  )}
                </td>
                <td>{fmt(a.created_at)}</td>
                <td>{fmt(a.last_sign_in_at)}</td>
                <td>
                  <span className={`mas-outcome ${
                    a.status === 'active' ? 'is-pass'
                    : a.status === 'invited_pending' ? 'is-refer'
                    : a.status === 'suspended' ? 'is-refer'
                    : ''
                  }`}>
                    {a.status === 'active' ? 'Active'
                    : a.status === 'invited_pending' ? 'Invited'
                    : a.status === 'suspended' ? 'Suspended'
                    : 'No membership'}
                  </span>
                  {rowMsg[a.profile_id]?.ok && (
                    <p className="mas-status mas-status-good" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                      {rowMsg[a.profile_id].ok}
                    </p>
                  )}
                  {rowMsg[a.profile_id]?.err && (
                    <p className="mas-status mas-status-bad" style={{ margin: '0.25rem 0 0', fontSize: '0.8rem' }}>
                      {rowMsg[a.profile_id].err}
                    </p>
                  )}
                </td>
                <td className="mas-table-actioncol">
                  <button
                    data-mas-row-menu-trigger
                    className="mas-btn-ghost mas-btn-compact"
                    onClick={(e) => {
                      if (rowMenuOpen === a.profile_id) {
                        setRowMenuOpen(null);
                        return;
                      }
                      const rect = e.currentTarget.getBoundingClientRect();
                      // Anchor the menu just below and left-aligned to the trigger's right edge.
                      setRowMenuAnchor({
                        x: rect.right,
                        y: rect.bottom + 4,
                      });
                      setRowMenuOpen(a.profile_id);
                    }}
                    disabled={rowBusy === a.profile_id}
                    aria-haspopup="menu"
                    aria-expanded={rowMenuOpen === a.profile_id}
                  >
                    {rowBusy === a.profile_id ? '…' : '⋯'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {rowMenuOpen && rowMenuAnchor && (() => {
        const target = accounts.find((x) => x.profile_id === rowMenuOpen);
        if (!target) return null;
        return (
          <div
            data-mas-row-menu
            role="menu"
            style={{
              position: 'fixed',
              // Right-align the menu to the trigger's right edge; adjust to keep on-screen.
              left: Math.max(8, Math.min(rowMenuAnchor.x - 208, window.innerWidth - 216)),
              top: Math.min(rowMenuAnchor.y, window.innerHeight - 200),
              zIndex: 1000,
              background: '#fff',
              border: '1px solid var(--mas-line, #e3e9f3)',
              borderRadius: 8,
              boxShadow: '0 6px 20px rgba(30,39,82,0.18)',
              minWidth: '13rem',
              padding: '0.3rem 0',
            }}
          >
            <button className="mas-menu-item" onClick={() => onChangeEmail(target)}>Change email</button>
            <button className="mas-menu-item" onClick={() => onResetPassword(target)}>Send reset password</button>
            {target.status === 'suspended' ? (
              <button className="mas-menu-item" onClick={() => onReactivate(target)}>Reactivate</button>
            ) : (
              <button className="mas-menu-item" onClick={() => onSuspend(target)}>Suspend</button>
            )}
            <button className="mas-menu-item" style={{ color: 'var(--mas-red,#C62026)' }} onClick={() => onDelete(target)}>Delete…</button>
          </div>
        );
      })()}
    </section>
  );
}
