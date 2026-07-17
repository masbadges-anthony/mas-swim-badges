// Settings — system_admin only. Five tabs:
//   Accounts        create login-ready accounts (admin_create_account_with_password),
//                   appoint further roles (admin_grant_membership), list via
//                   list_provisioned_accounts.
//   Store products  full product CRUD + image upload to the store-products bucket
//                   (direct table access under sysadmin RLS).
//   Parameters      app_settings (numeric config values - the Appendix F mirror).
//   Flags           app_flags (feature toggles, e.g. store_enabled).
//   System          build version (version.json), environment.
//
// Dense-table house style per Accounts.tsx. Route: /admin/settings,
// RequireRole ['system_admin'] (App.tsx); every write is additionally
// gated server-side (RLS / definer RPC checks) - the UI is never the guard.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import Icon from '../components/Icon';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

type Load = 'loading' | 'ready' | 'error';
type Tab = 'accounts' | 'params' | 'flags' | 'contacts' | 'resources' | 'system';

const CSS = `
.mas-page.mas-page-wide { max-width: none !important; width: auto !important; margin-left: 0 !important; margin-right: 0 !important; }
.mas-tight th, .mas-tight td { padding: 0.35rem 0.6rem; white-space: nowrap; vertical-align: middle; }
.mas-tight tbody tr { line-height: 1.3; }
.mas-tight .mas-link { color: var(--mas-navy, #1E2752); text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0; font: inherit; }
.mas-tight .mas-link:hover { text-decoration: none; }
.mas-tight .mas-link + .mas-link { margin-left: 0.6rem; }
.mas-set-form { display: flex; gap: 0.5rem; align-items: end; flex-wrap: wrap; }
.mas-set-form label { display: flex; flex-direction: column; font-size: 0.8rem; color: var(--mas-muted, #5b6472); }
.mas-tight .mas-link.is-danger { color: var(--mas-red, #C62026); }
.mas-set-form input, .mas-set-form select, .mas-set-form textarea {
  font: inherit; padding: 0.35rem 0.5rem; border: 1px solid var(--mas-line, #e3e9f3); border-radius: 6px;
}
.mas-set-thumbs { display: flex; gap: 0.5rem; flex-wrap: wrap; margin: 0.5rem 0; }
.mas-set-thumb { border: 1px solid var(--mas-line, #e3e9f3); border-radius: 6px; padding: 0.3rem; text-align: center; }
.mas-set-thumb img { width: 84px; height: 84px; object-fit: cover; display: block; border-radius: 4px; }
.mas-set-thumb .mas-link { font-size: 0.75rem; }
.mas-set-primary { outline: 2px solid var(--mas-gold, #F9C610); }
`;

function money(n: number | string | null | undefined): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function prettyDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function pretty(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

// ============================================================ Accounts
interface ProvisionedAccount {
  profile_id: string;
  email: string;
  full_name: string | null;
  roles: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  banned_until: string | null;
  status: string | null;
  username?: string | null;
}

// Streamlined role list per Anthony's spec — labels distinct from raw enum
// so operators aren't decoding underscores. Order deliberate: sysadmin first,
// governance next, delivery roles last.
// Curated Lucide icon set for the Resources module — small subset keeps
// bundle light and choices sensible for document links.
const CURATED_ICONS = [
  'file', 'book', 'award', 'shield', 'clipboard', 'checkList', 'users',
  'userPlus', 'building', 'calendar', 'card', 'inbox', 'settings', 'grid',
  'check', 'printer', 'mail', 'lock',
];

const CURATED_ROLES: { value: string; label: string }[] = [
  { value: 'system_admin',        label: 'Sysadmin' },
  { value: 'finance_officer',     label: 'Admin & Finance Officer' },
  { value: 'chairperson',         label: 'Chairperson (DSL)' },
  { value: 'board_member',        label: 'Board Member' },
  { value: 'chief_examiner',      label: 'Chief Examiner' },
  { value: 'master_trainer',      label: 'Master Trainer' },
  { value: 'instructor_trainer',  label: 'Instructor Trainer' },
  { value: 'examiner',            label: 'Examiner' },
  { value: 'instructor',          label: 'Instructor' },
  { value: 'partner_center_admin',label: 'Partner Centre Admin' },
];

function AccountsTab({ states, roles }: { states: string[]; roles: string[] }) {
  const [rows, setRows] = useState<ProvisionedAccount[]>([]);
  const [memberships, setMemberships] = useState<Record<string, { id: string; role: string; state: string | null }[]>>({});
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  // create form
  const [cKind, setCKind] = useState<'email' | 'username'>('email');
  const [cEmail, setCEmail] = useState('');
  const [cUsername, setCUsername] = useState('');
  const [cName, setCName] = useState('');
  const [cPassword, setCPassword] = useState('');
  const [cRole, setCRole] = useState('');
  const [cState, setCState] = useState('');
  const [cBusy, setCBusy] = useState(false);
  const [cMsg, setCMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // grant form (per expanded account)
  const [gRole, setGRole] = useState('');
  const [gState, setGState] = useState('');
  const [gExpires, setGExpires] = useState('');
  const [gBusy, setGBusy] = useState(false);
  const [gMsg, setGMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const [accRes, unRes] = await Promise.all([
      supabase.rpc('list_provisioned_accounts'),
      supabase.rpc('list_account_usernames'),
    ]);
    if (accRes.error) { setLoad('error'); return; }
    const unMap: Record<string, string> = {};
    (unRes.data ?? []).forEach((r: { profile_id: string; username: string }) => {
      unMap[r.profile_id] = r.username;
    });
    const merged = (accRes.data ?? []).map((r: ProvisionedAccount) => ({
      ...r,
      username: unMap[r.profile_id] ?? null,
    }));
    // memberships alongside accounts, keyed by profile_id.
    // Defensive: if list_memberships fails or is unavailable, we still render
    // the accounts table — just without the current-roles chip strip.
    try {
      const memRes = await supabase.rpc('list_memberships');
      if (memRes.error) {
        console.warn('[Settings] list_memberships failed:', memRes.error);
      } else {
        const memMap: Record<string, { id: string; role: string; state: string | null }[]> = {};
        const memRows = (memRes.data ?? []) as Array<{
          membership_id: string; profile_id: string; role: string;
          state: string | null; status: string;
        }>;
        memRows.forEach((m) => {
          if (m.status !== 'active') return;
          if (!memMap[m.profile_id]) memMap[m.profile_id] = [];
          memMap[m.profile_id].push({ id: m.membership_id, role: m.role, state: m.state });
        });
        setMemberships(memMap);
      }
    } catch (e) {
      console.warn('[Settings] list_memberships threw:', e);
    }
    setRows(merged as ProvisionedAccount[]);
    setLoad('ready');
  }, []);
  const fetchMemberships = fetchRows;
  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function createAccount() {
    setCMsg(null);
    if (!cPassword || !cRole || !cState) {
      setCMsg({ ok: false, text: 'Password, role, and state are required.' });
      return;
    }
    if (cPassword.length < 8) {
      setCMsg({ ok: false, text: 'Password must be at least 8 characters.' });
      return;
    }
    if (cKind === 'email' && !cEmail.trim()) {
      setCMsg({ ok: false, text: 'Email is required for an email account.' });
      return;
    }
    if (cKind === 'username' && !cUsername.trim()) {
      setCMsg({ ok: false, text: 'Username is required for a username account.' });
      return;
    }
    if (cKind === 'username' && !/^[a-z0-9_.]{3,32}$/.test(cUsername.trim().toLowerCase())) {
      setCMsg({ ok: false, text: 'Username must be 3-32 lowercase letters, digits, underscore, or dot.' });
      return;
    }
    setCBusy(true);
    const { error } = cKind === 'email'
      ? await supabase.rpc('admin_create_account_with_password', {
          p_email: cEmail.trim().toLowerCase(),
          p_password: cPassword,
          p_role: cRole,
          p_state: cState,
          p_full_name: cName.trim() || null,
        })
      : await supabase.rpc('admin_create_username_account', {
          p_username: cUsername.trim().toLowerCase(),
          p_password: cPassword,
          p_role: cRole,
          p_state: cState,
          p_display_name: cName.trim() || null,
        });
    setCBusy(false);
    if (error) { setCMsg({ ok: false, text: error.message }); return; }
    const identity = cKind === 'email' ? cEmail.trim() : cUsername.trim().toLowerCase();
    setCMsg({ ok: true, text: `Account created for ${identity} with role ${pretty(cRole)}. Share the password securely.` });
    setCEmail(''); setCUsername(''); setCName(''); setCPassword(''); setCRole(''); setCState('');
    fetchRows();
  }

  async function deleteAccount(r: ProvisionedAccount) {
    const who = r.username ?? r.email;
    const confirm1 = window.confirm(
      `Delete account for ${who}? This removes all their memberships and logs them out immediately. This cannot be undone.`
    );
    if (!confirm1) return;
    const confirm2 = window.confirm(`Second confirmation: really delete ${who}?`);
    if (!confirm2) return;
    const { error } = await supabase.rpc('admin_delete_account', { _profile_id: r.profile_id });
    if (error) { setCMsg({ ok: false, text: error.message }); return; }
    setCMsg({ ok: true, text: `Account ${who} deleted.` });
    fetchRows();
  }

  async function revokeMembership(membershipId: string, label: string) {
    if (!window.confirm(`Revoke ${label}? The person keeps their account and any other roles.`)) return;
    const { error } = await supabase.rpc('admin_revoke_membership', { _membership_id: membershipId });
    if (error) { setGMsg({ ok: false, text: error.message }); return; }
    setGMsg({ ok: true, text: `${label} revoked.` });
    fetchRows();
  }

  async function grantRole(profileId: string) {
    setGMsg(null);
    if (!gRole || !gState) {
      setGMsg({ ok: false, text: 'Role and state are required.' });
      return;
    }
    setGBusy(true);
    const { error } = await supabase.rpc('admin_grant_membership', {
      _profile_id: profileId,
      _role: gRole,
      _state: gState,
      _centre_id: null,
      _expires_at: gExpires || null,
    });
    setGBusy(false);
    if (error) { setGMsg({ ok: false, text: error.message }); return; }
    setGMsg({ ok: true, text: `Role ${pretty(gRole)} granted.` });
    setGRole(''); setGState(''); setGExpires('');
    fetchRows();
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) =>
      !q ||
      (r.email ?? '').toLowerCase().includes(q) ||
      (r.username ?? '').toLowerCase().includes(q) ||
      (r.full_name ?? '').toLowerCase().includes(q) ||
      (r.roles ?? '').toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <>
      <div className="mas-table-detail" style={{ marginBottom: '1rem' }}>
        <p className="mas-cell-sub" style={{ marginBottom: '0.5rem' }}>
          Create a login-ready account. <strong>Email</strong> accounts sign in with the
          email address and support password reset by mail. <strong>Username</strong> accounts
          sign in with a chosen username and are for role-holders without a working
          email — password reset is manual through this screen. Both grant the same
          role permissions.
        </p>
        <div className="mas-set-form" style={{ marginBottom: '0.4rem' }}>
          <label>Account type
            <select value={cKind} onChange={(e) => setCKind(e.target.value as 'email' | 'username')}>
              <option value="email">Email login</option>
              <option value="username">Username login</option>
            </select>
          </label>
        </div>
        <div className="mas-set-form">
          {cKind === 'email' ? (
            <label>Email
              <input type="email" value={cEmail} onChange={(e) => setCEmail(e.target.value)} style={{ width: '16rem' }} />
            </label>
          ) : (
            <label>Username
              <input type="text" value={cUsername}
                onChange={(e) => setCUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, ''))}
                placeholder="e.g. clara" style={{ width: '12rem' }} />
            </label>
          )}
          <label>Display name
            <input type="text" value={cName} onChange={(e) => setCName(e.target.value)} style={{ width: '14rem' }} />
          </label>
          <label>Password
            <input type="text" value={cPassword} onChange={(e) => setCPassword(e.target.value)} placeholder="min 8 chars" style={{ width: '11rem' }} />
          </label>
          <label>Role
            <select value={cRole} onChange={(e) => setCRole(e.target.value)}>
              <option value="">—</option>
              {CURATED_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
          <label>State
            <select value={cState} onChange={(e) => setCState(e.target.value)}>
              <option value="">—</option>
              {states.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
            </select>
          </label>
          <button className="mas-btn-primary mas-btn-compact" onClick={createAccount} disabled={cBusy}>
            {cBusy ? 'Creating…' : 'Create account'}
          </button>
        </div>
        {cMsg && (
          <p className={`mas-status ${cMsg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
            {cMsg.text}
          </p>
        )}
      </div>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchRows} disabled={load === 'loading'}>Refresh</button>
        <input className="mas-input" type="text" value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search email, name, role" style={{ maxWidth: '22rem' }} />
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load accounts. Refresh to try again.</p>}
      {load === 'ready' && filtered.length === 0 && <p className="mas-status">No accounts found.</p>}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>Login</th><th>Name</th><th>Roles</th><th>Status</th>
                <th>Created</th><th>Last sign-in</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = expanded === r.profile_id;
                return (
                  <Fragment key={r.profile_id}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td className="mas-cell-strong">
                        {r.username ?? r.email}
                        {r.username && <div className="mas-cell-sub">username</div>}
                      </td>
                      <td>{r.full_name || <span className="mas-cell-sub">—</span>}</td>
                      <td>{r.roles ? pretty(r.roles) : <span className="mas-cell-sub">none</span>}</td>
                      <td>{pretty(r.status) || '—'}</td>
                      <td>{prettyDate(r.created_at)}</td>
                      <td>{prettyDate(r.last_sign_in_at)}</td>
                      <td className="mas-table-actioncol">
                        <button className="mas-link" onClick={() => {
                          setGMsg(null); setGRole(''); setGState(''); setGExpires('');
                          setExpanded(isOpen ? null : r.profile_id);
                        }}>
                          {isOpen ? 'Close' : 'Manage'}
                        </button>
                        <button className="mas-link is-danger" onClick={() => deleteAccount(r)}>Delete</button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={7}>
                          <div className="mas-table-detail">
                            {(memberships[r.profile_id] ?? []).length > 0 && (
                              <div style={{ marginBottom: '0.6rem' }}>
                                <p className="mas-cell-sub" style={{ marginBottom: '0.3rem' }}>Current roles</p>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                  {(memberships[r.profile_id] ?? []).map((m) => {
                                    const label = CURATED_ROLES.find((x) => x.value === m.role)?.label ?? pretty(m.role);
                                    return (
                                      <span key={m.id} style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
                                        padding: '0.2rem 0.6rem', border: '1px solid var(--mas-line,#e3e9f3)',
                                        borderRadius: 999, fontSize: '0.82rem',
                                      }}>
                                        {label}{m.state ? ` · ${pretty(m.state)}` : ''}
                                        <button className="mas-link is-danger" style={{ fontSize: '0.75rem' }}
                                          onClick={() => revokeMembership(m.id, label)}>revoke</button>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <p className="mas-cell-sub" style={{ marginBottom: '0.3rem' }}>Grant another role</p>
                            <div className="mas-set-form">
                              <label>Role
                                <select value={gRole} onChange={(e) => setGRole(e.target.value)}>
                                  <option value="">—</option>
                                  {CURATED_ROLES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
                                </select>
                              </label>
                              <label>State
                                <select value={gState} onChange={(e) => setGState(e.target.value)}>
                                  <option value="">—</option>
                                  {states.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
                                </select>
                              </label>
                              <label>Expires (optional)
                                <input type="date" value={gExpires} onChange={(e) => setGExpires(e.target.value)} />
                              </label>
                              <button className="mas-btn-primary mas-btn-compact" onClick={() => grantRole(r.profile_id)} disabled={gBusy}>
                                {gBusy ? 'Granting…' : 'Grant'}
                              </button>
                            </div>
                            {gMsg && (
                              <p className={`mas-status ${gMsg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
                                {gMsg.text}
                              </p>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ============================================================ Parameters
interface AppSetting { key: string; value: number; updated_at: string | null; }

function ParamsTab() {
  const [rows, setRows] = useState<AppSetting[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [edit, setEdit] = useState<Record<string, string>>({});
  const [newKey, setNewKey] = useState('');
  const [newVal, setNewVal] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.from('app_settings').select('*').order('key');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as AppSetting[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function save(key: string) {
    const v = Number(edit[key]);
    if (Number.isNaN(v)) { setMsg({ ok: false, text: 'Value must be a number.' }); return; }
    setBusy(key); setMsg(null);
    const { error } = await supabase.from('app_settings')
      .update({ value: v, updated_at: new Date().toISOString() })
      .eq('key', key);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `${key} updated.` });
    setEdit((m) => { const n = { ...m }; delete n[key]; return n; });
    fetchRows();
  }

  async function addNew() {
    const v = Number(newVal);
    if (!newKey.trim() || Number.isNaN(v)) {
      setMsg({ ok: false, text: 'Key and a numeric value are required.' });
      return;
    }
    setBusy('__new'); setMsg(null);
    const { error } = await supabase.from('app_settings').insert({ key: newKey.trim(), value: v });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `${newKey.trim()} added.` });
    setNewKey(''); setNewVal('');
    fetchRows();
  }

  return (
    <>
      <p className="mas-cell-sub" style={{ marginBottom: '0.6rem' }}>
        Operational parameters — the Portal half of Manual Appendix F. Values here are
        authoritative for calculations (e.g. examiner payout). Documents reference,
        never restate.
      </p>
      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load parameters.</p>}
      {load === 'ready' && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr><th>Key</th><th className="mas-num">Value</th><th>Updated</th><th className="mas-table-actioncol">Action</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="mas-cell-strong">{r.key}</td>
                  <td className="mas-num">
                    {edit[r.key] != null ? (
                      <input type="number" step="0.01" value={edit[r.key]}
                        onChange={(e) => setEdit((m) => ({ ...m, [r.key]: e.target.value }))}
                        style={{ width: '8rem', font: 'inherit', padding: '0.2rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }} />
                    ) : Number(r.value).toFixed(2)}
                  </td>
                  <td>{prettyDate(r.updated_at)}</td>
                  <td className="mas-table-actioncol">
                    {edit[r.key] != null ? (
                      <>
                        <button className="mas-link" onClick={() => save(r.key)} disabled={busy === r.key}>Save</button>
                        <button className="mas-link" onClick={() => setEdit((m) => { const n = { ...m }; delete n[r.key]; return n; })}>Cancel</button>
                      </>
                    ) : (
                      <button className="mas-link" onClick={() => setEdit((m) => ({ ...m, [r.key]: String(r.value) }))}>Edit</button>
                    )}
                  </td>
                </tr>
              ))}
              <tr>
                <td>
                  <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new_parameter_key"
                    style={{ width: '16rem', font: 'inherit', padding: '0.2rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }} />
                </td>
                <td className="mas-num">
                  <input type="number" step="0.01" value={newVal} onChange={(e) => setNewVal(e.target.value)} placeholder="0.00"
                    style={{ width: '8rem', font: 'inherit', padding: '0.2rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }} />
                </td>
                <td />
                <td className="mas-table-actioncol">
                  <button className="mas-link" onClick={addNew} disabled={busy === '__new'}>Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {msg && (
        <p className={`mas-status ${msg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
          {msg.text}
        </p>
      )}
    </>
  );
}

// ============================================================ Flags
interface AppFlag { key: string; enabled: boolean; updated_at: string | null; }

function FlagsTab() {
  const [rows, setRows] = useState<AppFlag[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.from('app_flags').select('*').order('key');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as AppFlag[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function toggle(f: AppFlag) {
    setBusy(f.key); setMsg(null);
    const { error } = await supabase.from('app_flags')
      .update({ enabled: !f.enabled, updated_at: new Date().toISOString() })
      .eq('key', f.key);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchRows();
  }

  async function addFlag() {
    if (!newKey.trim()) return;
    setBusy('__new'); setMsg(null);
    const { error } = await supabase.from('app_flags').insert({ key: newKey.trim(), enabled: false });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setNewKey('');
    fetchRows();
  }

  return (
    <>
      <p className="mas-cell-sub" style={{ marginBottom: '0.6rem' }}>
        Feature flags. <code>store_enabled</code> controls the buyer-facing store.
      </p>
      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load flags.</p>}
      {load === 'ready' && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr><th>Flag</th><th>Enabled</th><th>Updated</th><th className="mas-table-actioncol">Action</th></tr>
            </thead>
            <tbody>
              {rows.map((f) => (
                <tr key={f.key}>
                  <td className="mas-cell-strong">{f.key}</td>
                  <td>{f.enabled ? 'On' : 'Off'}</td>
                  <td>{prettyDate(f.updated_at)}</td>
                  <td className="mas-table-actioncol">
                    <button className="mas-link" onClick={() => toggle(f)} disabled={busy === f.key}>
                      {f.enabled ? 'Turn off' : 'Turn on'}
                    </button>
                  </td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>
                  <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="new_flag_key"
                    style={{ width: '16rem', font: 'inherit', padding: '0.2rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }} />
                </td>
                <td className="mas-table-actioncol">
                  <button className="mas-link" onClick={addFlag} disabled={busy === '__new'}>Add</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      {msg && <p className="mas-status mas-status-bad" style={{ marginTop: '0.4rem' }}>{msg.text}</p>}
    </>
  );
}


// ============================================================ Role contacts
interface RoleContact {
  alias: string;
  holder_id: string | null;
  full_name: string | null;
  email: string | null;
}
interface ContactCandidate {
  profile_id: string;
  full_name: string | null;
  email: string;
}

const ALIASES: { alias: string; label: string; role: string }[] = [
  { alias: 'enquiries',    label: 'enquiries@masbadges.org',    role: 'Finance Officer' },
  { alias: 'finance',      label: 'finance@masbadges.org',      role: 'Finance Officer' },
  { alias: 'safeguarding', label: 'safeguarding@masbadges.org', role: 'Chairperson (Designated Safeguarding Lead)' },
];

function ContactsTab() {
  const [rows, setRows] = useState<RoleContact[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [candidates, setCandidates] = useState<Record<string, ContactCandidate[]>>({});
  const [pending, setPending] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoad('loading');
    const results = await Promise.all(
      ALIASES.map((a) => supabase.rpc('resolve_role_contact', { _alias: a.alias }))
    );
    const merged: RoleContact[] = ALIASES.map((a, i) => {
      const row = (results[i].data as RoleContact[] | null)?.[0];
      return row ?? { alias: a.alias, holder_id: null, full_name: null, email: null };
    });
    setRows(merged);
    // load candidates in parallel — sysadmin-gated, so only fires here
    const candResults = await Promise.all(
      ALIASES.map((a) => supabase.rpc('list_role_contact_candidates', { _alias: a.alias }))
    );
    const candMap: Record<string, ContactCandidate[]> = {};
    ALIASES.forEach((a, i) => { candMap[a.alias] = (candResults[i].data ?? []) as ContactCandidate[]; });
    setCandidates(candMap);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  async function assign(alias: string) {
    const nextId = pending[alias];
    setMsg(null);
    setBusy(alias);
    const { error } = await supabase.rpc('upsert_role_contact', {
      _alias: alias,
      _holder_id: nextId || null,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: nextId ? 'Assignment updated.' : 'Assignment cleared.' });
    setPending((m) => { const n = { ...m }; delete n[alias]; return n; });
    fetchAll();
  }

  return (
    <>
      <p className="mas-cell-sub" style={{ marginBottom: '0.6rem' }}>
        Point each published alias to the current role holder. Screens and templates
        resolve the current holder's name and email through this table. External mail
        delivery (MX / forwarding) is configured separately at the mail provider.
      </p>
      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load role contacts.</p>}
      {load === 'ready' && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>Alias</th>
                <th>Role</th>
                <th>Current holder</th>
                <th>Assign</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = ALIASES.find((a) => a.alias === r.alias)!;
                const cands = candidates[r.alias] ?? [];
                const selected = pending[r.alias] ?? r.holder_id ?? '';
                const changed = selected !== (r.holder_id ?? '');
                return (
                  <tr key={r.alias}>
                    <td className="mas-cell-strong">{meta.label}</td>
                    <td>{meta.role}</td>
                    <td>
                      {r.full_name || r.email
                        ? <>{r.full_name || '—'}<div className="mas-cell-sub">{r.email}</div></>
                        : <span className="mas-cell-sub">Not assigned</span>}
                    </td>
                    <td>
                      <select
                        value={selected}
                        onChange={(e) => setPending((m) => ({ ...m, [r.alias]: e.target.value }))}
                        style={{ font: 'inherit', padding: '0.25rem 0.4rem', border: '1px solid var(--mas-line,#e3e9f3)', borderRadius: 6 }}
                      >
                        <option value="">— unassigned —</option>
                        {cands.map((c) => (
                          <option key={c.profile_id} value={c.profile_id}>
                            {c.full_name ? `${c.full_name} (${c.email})` : c.email}
                          </option>
                        ))}
                      </select>
                      {cands.length === 0 && (
                        <p className="mas-cell-sub" style={{ marginTop: '0.2rem' }}>
                          No active {meta.role} account. Assign the role in the Accounts tab first.
                        </p>
                      )}
                    </td>
                    <td className="mas-table-actioncol">
                      <button
                        className="mas-link"
                        onClick={() => assign(r.alias)}
                        disabled={!changed || busy === r.alias}
                      >
                        {busy === r.alias ? 'Saving…' : 'Save'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {msg && (
        <p className={`mas-status ${msg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>
          {msg.text}
        </p>
      )}
    </>
  );
}


// ============================================================ Resources
interface AdminResource {
  id: string;
  title: string;
  description: string | null;
  url: string;
  icon: string;
  category: string;
  sort_order: number;
  is_active: boolean;
  roles: string[];
}
const RESOURCE_CATEGORIES = [
  { value: 'manual',   label: 'Manual' },
  { value: 'handbook', label: 'Handbook' },
  { value: 'guide',    label: 'Course Guide' },
  { value: 'form',     label: 'Form' },
  { value: 'other',    label: 'Other' },
];
function ResourcesTab() {
  const [rows, setRows] = useState<AdminResource[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [fTitle, setFTitle] = useState('');
  const [fDesc, setFDesc] = useState('');
  const [fUrl, setFUrl] = useState('');
  const [fIcon, setFIcon] = useState('file');
  const [fCategory, setFCategory] = useState('manual');
  const [fSort, setFSort] = useState('100');
  const [fActive, setFActive] = useState(true);
  const [fRoles, setFRoles] = useState<string[]>([]);
  const [iconSearch, setIconSearch] = useState('');
  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_resources_admin');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as AdminResource[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);
  function openEdit(r: AdminResource | null) {
    setMsg(null);
    if (r) {
      setExpanded(r.id);
      setFTitle(r.title); setFDesc(r.description ?? ''); setFUrl(r.url);
      setFIcon(r.icon); setFCategory(r.category);
      setFSort(String(r.sort_order)); setFActive(r.is_active);
      setFRoles(r.roles ?? []);
    } else {
      setExpanded('new');
      setFTitle(''); setFDesc(''); setFUrl(''); setFIcon('file');
      setFCategory('manual'); setFSort('100'); setFActive(true); setFRoles([]);
    }
  }
  async function save(existing: AdminResource | null) {
    if (!fTitle.trim() || !fUrl.trim()) { setMsg({ ok: false, text: 'Title and URL are required.' }); return; }
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.rpc('resource_upsert', {
      _id: existing?.id ?? null, _title: fTitle.trim(), _description: fDesc.trim() || null,
      _url: fUrl.trim(), _icon: fIcon, _category: fCategory,
      _sort_order: Number(fSort) || 100, _is_active: fActive,
    });
    if (error) { setBusy(false); setMsg({ ok: false, text: error.message }); return; }
    const rid = existing?.id ?? (data as string);
    const { error: vErr } = await supabase.rpc('resource_set_visibility', { _resource_id: rid, _roles: fRoles });
    setBusy(false);
    if (vErr) { setMsg({ ok: false, text: vErr.message }); return; }
    setMsg({ ok: true, text: existing ? 'Resource updated.' : 'Resource created.' });
    if (!existing) setExpanded(null);
    fetchRows();
  }
  async function del(r: AdminResource) {
    if (!window.confirm(`Delete "${r.title}"?`)) return;
    const { error } = await supabase.rpc('resource_delete', { _id: r.id });
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `Deleted "${r.title}".` });
    fetchRows();
  }
  const filteredIcons = useMemo(() => {
    const q = iconSearch.trim().toLowerCase();
    return q ? CURATED_ICONS.filter((n) => n.toLowerCase().includes(q)) : CURATED_ICONS;
  }, [iconSearch]);
  const filtered = useMemo(() => {
    if (filter === 'all') return rows;
    return rows.filter((r) => r.roles?.includes(filter));
  }, [rows, filter]);
  const form = (existing: AdminResource | null) => (
    <div className="mas-table-detail">
      <div className="mas-set-form">
        <label>Title<input type="text" value={fTitle} onChange={(e) => setFTitle(e.target.value)} style={{ width: '20rem' }} /></label>
        <label>Category
          <select value={fCategory} onChange={(e) => setFCategory(e.target.value)}>
            {RESOURCE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
        <label>Sort<input type="number" value={fSort} onChange={(e) => setFSort(e.target.value)} style={{ width: '5rem' }} /></label>
        <label>Active
          <select value={fActive ? 'yes' : 'no'} onChange={(e) => setFActive(e.target.value === 'yes')}>
            <option value="yes">Yes</option><option value="no">No</option>
          </select>
        </label>
      </div>
      <div className="mas-set-form" style={{ marginTop: '0.4rem' }}>
        <label style={{ flex: 1, minWidth: '20rem' }}>URL
          <input type="url" value={fUrl} onChange={(e) => setFUrl(e.target.value)} placeholder="https://drive.google.com/…" />
        </label>
      </div>
      <div className="mas-set-form" style={{ marginTop: '0.4rem' }}>
        <label style={{ flex: 1, minWidth: '24rem' }}>Description
          <textarea rows={2} value={fDesc} onChange={(e) => setFDesc(e.target.value)} />
        </label>
      </div>
      <p className="mas-cell-sub" style={{ margin: '0.8rem 0 0.3rem' }}>Icon</p>
      <div className="mas-set-form" style={{ marginBottom: '0.4rem' }}>
        <label>Search icons<input type="text" value={iconSearch} onChange={(e) => setIconSearch(e.target.value)} style={{ width: '14rem' }} placeholder="e.g. book" /></label>
        <span className="mas-cell-sub">Selected: <strong>{fIcon}</strong></span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
        {filteredIcons.map((name) => (
          <button key={name} type="button" onClick={() => setFIcon(name)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem',
              border: '1px solid ' + (fIcon === name ? 'var(--mas-navy,#1E2752)' : 'var(--mas-line,#e3e9f3)'),
              background: fIcon === name ? '#eef1f8' : '#fff',
              borderRadius: 6, cursor: 'pointer', font: 'inherit', fontSize: '0.78rem' }}>
            <Icon name={name} /> {name}
          </button>
        ))}
      </div>
      <p className="mas-cell-sub" style={{ margin: '0.8rem 0 0.3rem' }}>Visible to roles</p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.6rem' }}>
        {CURATED_ROLES.map((r) => {
          const on = fRoles.includes(r.value);
          return (
            <label key={r.value} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
              padding: '0.25rem 0.55rem',
              border: '1px solid ' + (on ? 'var(--mas-navy,#1E2752)' : 'var(--mas-line,#e3e9f3)'),
              background: on ? '#eef1f8' : '#fff', borderRadius: 6, cursor: 'pointer', fontSize: '0.82rem' }}>
              <input type="checkbox" checked={on} onChange={(e) => {
                setFRoles((cur) => e.target.checked ? [...cur, r.value] : cur.filter((x) => x !== r.value));
              }} />
              {r.label}
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button className="mas-btn-primary mas-btn-compact" onClick={() => save(existing)} disabled={busy}>
          {busy ? 'Saving…' : existing ? 'Save changes' : 'Create resource'}
        </button>
        <button className="mas-btn-ghost mas-btn-compact" onClick={() => setExpanded(null)}>Cancel</button>
        {existing && <button className="mas-link is-danger" style={{ marginLeft: 'auto' }} onClick={() => del(existing)}>Delete resource</button>}
      </div>
      {msg && <p className={`mas-status ${msg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ marginTop: '0.4rem' }}>{msg.text}</p>}
    </div>
  );
  return (
    <>
      <p className="mas-cell-sub" style={{ marginBottom: '0.6rem' }}>
        Curate the resource library. Each entry is a live link tagged for one or more roles.
        Users see only what their roles grant, under Account &rarr; My resources.
      </p>
      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchRows} disabled={load === 'loading'}>Refresh</button>
        <button className="mas-btn-primary mas-btn-compact" onClick={() => openEdit(null)}>New resource</button>
        <label style={{ marginLeft: 'auto', display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--mas-muted,#5b6472)' }}>
          Preview as role
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All resources</option>
            {CURATED_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>
      {expanded === 'new' && form(null)}
      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load resources.</p>}
      {load === 'ready' && filtered.length === 0 && expanded !== 'new' && (
        <p className="mas-status">
          {filter === 'all' ? 'No resources yet. Add the first one to build the library.'
            : `No resources visible to the ${CURATED_ROLES.find((x) => x.value === filter)?.label ?? filter} role.`}
        </p>
      )}
      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr><th>Title</th><th>Category</th><th>Icon</th><th>Roles</th><th className="mas-num">Sort</th><th>Active</th><th className="mas-table-actioncol">Action</th></tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td className="mas-cell-strong">{r.title}</td>
                      <td>{RESOURCE_CATEGORIES.find((c) => c.value === r.category)?.label ?? r.category}</td>
                      <td><Icon name={r.icon} /></td>
                      <td>{(r.roles ?? []).length > 0 ? (r.roles ?? []).map((x) => CURATED_ROLES.find((c) => c.value === x)?.label ?? x).join(', ') : <span className="mas-cell-sub">— none —</span>}</td>
                      <td className="mas-num">{r.sort_order}</td>
                      <td>{r.is_active ? 'Yes' : 'No'}</td>
                      <td className="mas-table-actioncol">
                        <button className="mas-link" onClick={() => (isOpen ? setExpanded(null) : openEdit(r))}>{isOpen ? 'Close' : 'Edit'}</button>
                      </td>
                    </tr>
                    {isOpen && (<tr className="mas-table-detailrow"><td colSpan={7}>{form(r)}</td></tr>)}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ============================================================ System
function SystemTab() {
  const [buildTime, setBuildTime] = useState<string>('…');
  const [userEmail, setUserEmail] = useState<string>('…');
  useEffect(() => {
    fetch(`/version.json?ts=${Date.now()}`)
      .then((r) => r.json())
      .then((j) => {
        const raw = j.build ?? j.version ?? j.buildId ?? null;
        if (!raw) { setBuildTime('unknown'); return; }
        const d = new Date(String(raw));
        if (Number.isNaN(d.getTime())) { setBuildTime(String(raw)); return; }
        setBuildTime(d.toLocaleString('en-GB', {
          day: 'numeric', month: 'short', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
        }));
      })
      .catch(() => setBuildTime('unavailable'));
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? 'unknown');
    });
  }, []);
  const mode = (import.meta as unknown as { env?: Record<string, string> }).env?.MODE ?? 'unknown';
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))',
      gap: '0.6rem',
      padding: '1rem 1.1rem',
      background: '#f8fafd',
      border: '1px solid var(--mas-line, #e3e9f3)',
      borderRadius: 8,
    }}>
      <SysStat label="Build" value={buildTime} />
      <SysStat label="Environment" value={mode} />
      <SysStat label="Signed in as" value={userEmail} />
    </div>
  );
}
function SysStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{
        fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.06em',
        color: 'var(--mas-muted, #5b6472)', marginBottom: '0.2rem',
      }}>{label}</div>
      <div style={{
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '0.9rem', color: 'var(--mas-navy, #1E2752)',
        wordBreak: 'break-word',
      }}>{value}</div>
    </div>
  );
}

// ============================================================ Page
export default function Settings() {
  const [tab, setTab] = useState<Tab>('accounts');
  const [states, setStates] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);

  useEffect(() => {
    supabase.rpc('list_my_states').then(({ data }) => {
      if (data) setStates((data as unknown[]).map((x) => String((x as Record<string, unknown>).list_my_states ?? x)));
    });
    supabase.rpc('list_roles').then(({ data }) => {
      if (data) setRoles((data as { role: string }[]).map((x) => x.role));
    });
  }, []);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'accounts', label: 'Accounts' },
    { id: 'params', label: 'Parameters' },
    { id: 'flags', label: 'Flags' },
    { id: 'contacts', label: 'Role contacts' },
    { id: 'resources', label: 'Resources' },
    { id: 'system', label: 'System' },
  ];

  return (
    <section className="mas-page mas-page-wide">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">System administration</p>
        <h1>Settings</h1>
        <p className="mas-lede">
          Account provisioning, store catalogue, operational parameters, and feature
          flags. This area is restricted to the system administrator; every action is
          enforced server-side.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.3rem', flexWrap: 'wrap' }}>
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id}
            className={tab === t.id ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'accounts' && <AccountsTab states={states} roles={roles} />}
      {tab === 'params' && <ParamsTab />}
      {tab === 'flags' && <FlagsTab />}
      {tab === 'contacts' && <ContactsTab />}
      {tab === 'resources' && <ResourcesTab />}
      {tab === 'system' && <SystemTab />}
    </section>
  );
}
