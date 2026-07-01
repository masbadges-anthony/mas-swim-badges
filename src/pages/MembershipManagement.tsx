// #16 — Memberships, dense-table conversion.
// Design note: granting a membership is a genuine multi-step, multi-conditional
// form (find-by-email → role → conditional state/centre → optional expiry).
// The house law's inline-add serves LIGHTWEIGHT creates. Forcing a 10-field grant
// into a single row degrades UX — so this screen uses a COMPACT GRANT PANEL for
// the create, and the memberships list itself is the dense table + tabs.
// Reads/writes unchanged.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/admin.css';

interface RoleRow { role: string; }
interface StateRow { state: string; }
interface CentreRow { id: string; name: string; }
interface FoundProfile { profile_id: string; full_name: string | null; email: string | null; }
interface Membership {
  membership_id: string;
  profile_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  state: string | null;
  partner_center_id: string | null;
  expires_at: string | null;
}
type Load = 'loading' | 'ready' | 'error';
type Tab = 'active' | 'expired' | 'suspended';

function pretty(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function isExpired(m: Membership): boolean {
  if (!m.expires_at) return false;
  const d = new Date(m.expires_at + 'T00:00:00');
  return d.getTime() < Date.now();
}
function scopeKind(role: string): 'state' | 'centre' | 'centre_optional' | 'none' {
  if (role === 'examiner') return 'state';
  if (role === 'partner_center_admin') return 'centre';
  if (role === 'instructor') return 'centre_optional';
  return 'none';
}

const CSS = `
.mas-grant-panel {
  background:#f5f8fc; border:1px solid var(--mas-line,#e3e9f3); border-radius:10px;
  padding:0.8rem 0.9rem; margin-bottom:1rem;
}
.mas-grant-row { display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; }
.mas-grant-row + .mas-grant-row { margin-top:0.5rem; }
.mas-grant-row input, .mas-grant-row select {
  font:inherit; padding:0.35rem 0.5rem; border:1px solid var(--mas-line,#e3e9f3); border-radius:6px;
}
.mas-grant-row input[type=email] { min-width:16rem; flex:1 1 auto; max-width:26rem; }
.mas-grant-row select { min-width:11rem; }
.mas-grant-row .mas-grant-label { font-size:0.78rem; color:var(--mas-muted,#5b6472); }
.mas-grant-panel-title {
  font-family:'Barlow Condensed',Arial,sans-serif; font-weight:800;
  color:var(--mas-navy,#1E2752); font-size:0.95rem; letter-spacing:.5px;
  text-transform:uppercase; margin:0 0 0.5rem;
}
`;

export default function MembershipManagement() {
  const { session } = useAuth();
  const me = session?.user?.id ?? null;

  const [roles, setRoles] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [centres, setCentres] = useState<CentreRow[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');

  // grant panel state
  const [email, setEmail] = useState('');
  const [finding, setFinding] = useState(false);
  const [found, setFound] = useState<FoundProfile | null>(null);
  const [findMsg, setFindMsg] = useState<string | null>(null);
  const [role, setRole] = useState('');
  const [grantState, setGrantState] = useState('');
  const [grantCentre, setGrantCentre] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [granting, setGranting] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const [grantOk, setGrantOk] = useState<string | null>(null);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const centreName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of centres) map[c.id] = c.name;
    return map;
  }, [centres]);

  const fetchMemberships = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_memberships');
    if (error) { setLoad('error'); return; }
    setMemberships((data ?? []) as Membership[]);
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
    fetchMemberships();
    return () => { cancelled = true; };
  }, [fetchMemberships]);

  async function find() {
    setFinding(true); setFound(null); setFindMsg(null); setGrantOk(null); setGrantError(null);
    const { data, error } = await supabase.rpc('find_profile_by_email', { _email: email });
    setFinding(false);
    if (error) { setFindMsg(error.message); return; }
    const row = (data ?? [])[0] as FoundProfile | undefined;
    if (!row) { setFindMsg('No account found for that email. They must sign up first.'); return; }
    setFound(row);
  }

  const kind = scopeKind(role);
  const canGrant =
    !!found && !!role &&
    (kind !== 'state' || !!grantState) &&
    (kind !== 'centre' || !!grantCentre) &&
    !granting;

  async function grant() {
    if (!canGrant || !found) return;
    setGranting(true); setGrantError(null); setGrantOk(null);
    const payload: Record<string, unknown> = {
      profile_id: found.profile_id,
      role,
      status: 'active',
      state: kind === 'state' ? grantState : null,
      partner_center_id: kind === 'centre' || kind === 'centre_optional' ? grantCentre || null : null,
      expires_at: expiresAt || null,
    };
    const { error } = await supabase.from('memberships').insert(payload);
    setGranting(false);
    if (error) { setGrantError(error.message); return; }
    setGrantOk(`${pretty(role)} granted to ${found.full_name || found.email}.`);
    setRole(''); setGrantState(''); setGrantCentre(''); setExpiresAt('');
    setFound(null); setEmail('');
    fetchMemberships();
  }

  async function setStatus(m: Membership, status: string) {
    setBusyId(m.membership_id);
    setRowError((x) => { const n = { ...x }; delete n[m.membership_id]; return n; });
    const { error } = await supabase.from('memberships').update({ status }).eq('id', m.membership_id);
    setBusyId(null);
    if (error) { setRowError((x) => ({ ...x, [m.membership_id]: error.message })); return; }
    setMemberships((list) => list.map((y) => (y.membership_id === m.membership_id ? { ...y, status } : y)));
  }

  function scopeText(m: Membership): string {
    if (m.state) return m.state;
    if (m.partner_center_id) return centreName[m.partner_center_id] ?? 'Centre';
    return 'National';
  }

  const counts = useMemo(() => ({
    active: memberships.filter((m) => m.status === 'active' && !isExpired(m)).length,
    expired: memberships.filter((m) => isExpired(m)).length,
    suspended: memberships.filter((m) => m.status === 'suspended').length,
  }), [memberships]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return memberships
      .filter((m) => {
        if (tab === 'expired') return isExpired(m);
        if (tab === 'suspended') return m.status === 'suspended';
        return m.status === 'active' && !isExpired(m);
      })
      .filter((m) =>
        !q ||
        (m.full_name ?? '').toLowerCase().includes(q) ||
        (m.email ?? '').toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        scopeText(m).toLowerCase().includes(q));
  }, [memberships, tab, query, centreName]);

  return (
    <section className="mas-page">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Governance</p>
        <h1>Memberships</h1>
        <p className="mas-lede">
          Grant and manage roles. Roles take effect immediately and govern what each
          person can do.
        </p>
      </header>

      {/* ---- Grant panel (compact, two-step) ---- */}
      <div className="mas-grant-panel">
        <p className="mas-grant-panel-title">Grant a role</p>
        <div className="mas-grant-row">
          <input type="email" value={email}
            placeholder="Find a person by email…"
            onChange={(e) => { setEmail(e.target.value); setFound(null); setFindMsg(null); }} />
          <button className="mas-btn-ghost mas-btn-compact" onClick={find} disabled={finding || !email.trim()}>
            {finding ? 'Finding…' : 'Find'}
          </button>
          {found && <span className="mas-cell-sub">Found: <strong>{found.full_name || '(no name)'}</strong> · {found.email}</span>}
          {findMsg && !found && <span className="mas-cell-sub">{findMsg}</span>}
        </div>

        {found && (
          <div className="mas-grant-row">
            <label className="mas-grant-label">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="">Select role…</option>
              {roles.map((r) => <option key={r} value={r}>{pretty(r)}</option>)}
            </select>

            {kind === 'state' && (
              <>
                <label className="mas-grant-label">State</label>
                <select value={grantState} onChange={(e) => setGrantState(e.target.value)}>
                  <option value="">Select state…</option>
                  {states.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </>
            )}
            {(kind === 'centre' || kind === 'centre_optional') && (
              <>
                <label className="mas-grant-label">Centre</label>
                <select value={grantCentre} onChange={(e) => setGrantCentre(e.target.value)}>
                  <option value="">{kind === 'centre_optional' ? 'No centre' : 'Select centre…'}</option>
                  {centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </>
            )}

            <label className="mas-grant-label">Expires</label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />

            <button className="mas-btn-primary mas-btn-compact" onClick={grant} disabled={!canGrant}>
              {granting ? 'Granting…' : '+ Grant'}
            </button>
          </div>
        )}

        {grantError && <p className="mas-status mas-status-bad" style={{ marginTop: '0.4rem' }}>{grantError}</p>}
        {grantOk && <p className="mas-status mas-status-good" style={{ marginTop: '0.4rem' }}>{grantOk}</p>}
      </div>

      {/* ---- Tabs + search ---- */}
      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchMemberships} disabled={load === 'loading'}>Refresh</button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          <button role="tab" aria-selected={tab === 'active'}
            className={tab === 'active' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('active')}>Active ({counts.active})</button>
          <button role="tab" aria-selected={tab === 'expired'}
            className={tab === 'expired' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('expired')}>Expired ({counts.expired})</button>
          <button role="tab" aria-selected={tab === 'suspended'}
            className={tab === 'suspended' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('suspended')}>Suspended ({counts.suspended})</button>
        </div>
        <input className="mas-input" type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, role, scope"
          style={{ maxWidth: '22rem' }} />
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load memberships.</p>}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">No memberships in this view.</p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th>Person</th>
                <th>Role</th>
                <th>Scope</th>
                <th>Status</th>
                <th>Expires</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => {
                const suspended = m.status === 'suspended';
                const expired = isExpired(m);
                return (
                  <tr key={m.membership_id}>
                    <td className="mas-cell-strong">
                      <span className="mas-cell-stack">
                        <span>{m.full_name || m.email || m.profile_id}{m.profile_id === me ? ' (you)' : ''}</span>
                        {m.email && m.full_name && <span className="mas-cell-sub">{m.email}</span>}
                      </span>
                    </td>
                    <td><span className="mas-pill">{pretty(m.role)}</span></td>
                    <td>{scopeText(m)}</td>
                    <td>
                      <span className={`mas-outcome ${suspended || expired ? 'is-refer' : 'is-pass'}`}>
                        {expired ? 'Expired' : pretty(m.status)}
                      </span>
                    </td>
                    <td>{fmtDate(m.expires_at)}</td>
                    <td className="mas-table-actioncol">
                      {suspended ? (
                        <button className="mas-btn-ghost mas-btn-compact" onClick={() => setStatus(m, 'active')} disabled={busyId === m.membership_id}>
                          {busyId === m.membership_id ? '…' : 'Reactivate'}
                        </button>
                      ) : (
                        <button className="mas-btn-ghost mas-btn-compact" onClick={() => setStatus(m, 'suspended')} disabled={busyId === m.membership_id}>
                          {busyId === m.membership_id ? '…' : 'Suspend'}
                        </button>
                      )}
                      {rowError[m.membership_id] && <span className="mas-status mas-status-bad">{rowError[m.membership_id]}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
