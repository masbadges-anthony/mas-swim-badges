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

function pretty(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

// What scope a role requires (best-effort mirror of the memberships CHECK).
function scopeKind(role: string): 'state' | 'centre' | 'centre_optional' | 'none' {
  if (role === 'examiner') return 'state';
  if (role === 'partner_center_admin') return 'centre';
  if (role === 'instructor') return 'centre_optional';
  return 'none';
}

export default function MembershipManagement() {
  const { session } = useAuth();
  const me = session?.user?.id ?? null;

  const [roles, setRoles] = useState<string[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [centres, setCentres] = useState<CentreRow[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  // grant form
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
    if (error) {
      setLoad('error');
      return;
    }
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
    return () => {
      cancelled = true;
    };
  }, [fetchMemberships]);

  async function find() {
    setFinding(true);
    setFound(null);
    setFindMsg(null);
    setGrantOk(null);
    setGrantError(null);
    const { data, error } = await supabase.rpc('find_profile_by_email', {
      _email: email,
    });
    setFinding(false);
    if (error) {
      setFindMsg(error.message);
      return;
    }
    const row = (data ?? [])[0] as FoundProfile | undefined;
    if (!row) {
      setFindMsg('No account found for that email. They must sign up first.');
      return;
    }
    setFound(row);
  }

  const kind = scopeKind(role);
  const canGrant =
    !!found &&
    !!role &&
    (kind !== 'state' || !!grantState) &&
    (kind !== 'centre' || !!grantCentre) &&
    !granting;

  async function grant() {
    if (!canGrant || !found) return;
    setGranting(true);
    setGrantError(null);
    setGrantOk(null);

    const payload: Record<string, unknown> = {
      profile_id: found.profile_id,
      role,
      status: 'active',
      state: kind === 'state' ? grantState : null,
      partner_center_id:
        kind === 'centre' || kind === 'centre_optional' ? grantCentre || null : null,
      expires_at: expiresAt || null,
    };

    const { error } = await supabase.from('memberships').insert(payload);
    setGranting(false);
    if (error) {
      setGrantError(error.message);
      return;
    }
    setGrantOk(`${pretty(role)} granted to ${found.full_name || found.email}.`);
    setRole('');
    setGrantState('');
    setGrantCentre('');
    setExpiresAt('');
    setFound(null);
    setEmail('');
    fetchMemberships();
  }

  async function setStatus(m: Membership, status: string) {
    setBusyId(m.membership_id);
    setRowError((x) => {
      const n = { ...x };
      delete n[m.membership_id];
      return n;
    });
    const { error } = await supabase
      .from('memberships')
      .update({ status })
      .eq('id', m.membership_id);
    setBusyId(null);
    if (error) {
      setRowError((x) => ({ ...x, [m.membership_id]: error.message }));
      return;
    }
    setMemberships((list) =>
      list.map((y) => (y.membership_id === m.membership_id ? { ...y, status } : y)),
    );
  }

  function scopeText(m: Membership): string {
    if (m.state) return m.state;
    if (m.partner_center_id) return centreName[m.partner_center_id] ?? 'Centre';
    return 'National';
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Governance</p>
        <h1>Memberships</h1>
        <p className="mas-lede">
          Grant and manage roles. Roles take effect immediately and govern what
          each person can do.
        </p>
      </header>

      <div className="mas-form">
        <div className="mas-field">
          <label htmlFor="email" className="mas-field-label">Find a person by email</label>
          <div className="mas-grade-actions">
            <input
              id="email"
              className="mas-input"
              type="email"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setFound(null); setFindMsg(null); }}
              placeholder="person@example.com"
              style={{ flex: '1 1 auto' }}
            />
            <button className="mas-btn-ghost" onClick={find} disabled={finding || !email.trim()}>
              {finding ? 'Finding…' : 'Find'}
            </button>
          </div>
          {findMsg && <p className="mas-field-note">{findMsg}</p>}
          {found && (
            <p className="mas-field-note">
              Found: <strong>{found.full_name || '(no name)'}</strong> · {found.email}
            </p>
          )}
        </div>

        {found && (
          <>
            <div className="mas-field">
              <label htmlFor="role" className="mas-field-label">Role</label>
              <select id="role" className="mas-select" value={role} onChange={(e) => setRole(e.target.value)}>
                <option value="">Select a role…</option>
                {roles.map((r) => (
                  <option key={r} value={r}>{pretty(r)}</option>
                ))}
              </select>
            </div>

            {kind === 'state' && (
              <div className="mas-field">
                <label htmlFor="state" className="mas-field-label">State</label>
                <select id="state" className="mas-select" value={grantState} onChange={(e) => setGrantState(e.target.value)}>
                  <option value="">Select a state…</option>
                  {states.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            )}

            {(kind === 'centre' || kind === 'centre_optional') && (
              <div className="mas-field">
                <label htmlFor="centre" className="mas-field-label">
                  Centre{kind === 'centre_optional' ? ' (optional)' : ''}
                </label>
                <select id="centre" className="mas-select" value={grantCentre} onChange={(e) => setGrantCentre(e.target.value)}>
                  <option value="">{kind === 'centre_optional' ? 'No centre' : 'Select a centre…'}</option>
                  {centres.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div className="mas-field">
              <label htmlFor="expiry" className="mas-field-label">Expires (optional)</label>
              <input id="expiry" className="mas-input" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>

            {grantError && <p className="mas-status mas-status-bad">{grantError}</p>}

            <div className="mas-form-actions">
              <button className="mas-btn-primary" onClick={grant} disabled={!canGrant}>
                {granting ? 'Granting…' : 'Grant role'}
              </button>
            </div>
          </>
        )}

        {grantOk && <p className="mas-status mas-status-good">{grantOk}</p>}
      </div>

      <header className="mas-page-head mas-section-head">
        <h2>Current memberships</h2>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchMemberships} disabled={load === 'loading'}>Refresh</button>
        {load === 'ready' && <span className="mas-admin-count">{memberships.length} total</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load memberships.</p>}
      {load === 'ready' && memberships.length === 0 && (
        <p className="mas-status">No memberships yet.</p>
      )}

      {load === 'ready' && memberships.length > 0 && (
        <ul className="mas-admin-list">
          {memberships.map((m) => {
            const suspended = m.status === 'suspended';
            return (
              <li key={m.membership_id} className="mas-admin-row">
                <div className="mas-admin-main">
                  <h3 className="mas-admin-name">{m.full_name || m.email || m.profile_id}</h3>
                  <p className="mas-admin-meta">
                    <span className="mas-pill">{pretty(m.role)}</span>
                    <span className={`mas-outcome ${suspended ? 'is-refer' : 'is-pass'}`}>
                      {pretty(m.status)}
                    </span>
                    <span className="mas-admin-sub">
                      {scopeText(m)}
                      {m.expires_at ? ` · expires ${m.expires_at}` : ''}
                      {m.profile_id === me ? ' · you' : ''}
                    </span>
                  </p>
                  {rowError[m.membership_id] && (
                    <p className="mas-status mas-status-bad mas-admin-rowerror">
                      {rowError[m.membership_id]}
                    </p>
                  )}
                </div>
                <div className="mas-admin-action">
                  {suspended ? (
                    <button className="mas-btn-primary" onClick={() => setStatus(m, 'active')} disabled={busyId === m.membership_id}>
                      {busyId === m.membership_id ? '…' : 'Reactivate'}
                    </button>
                  ) : (
                    <button className="mas-btn-ghost" onClick={() => setStatus(m, 'suspended')} disabled={busyId === m.membership_id}>
                      {busyId === m.membership_id ? '…' : 'Suspend'}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
