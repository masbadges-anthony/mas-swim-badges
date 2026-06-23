import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface StateRow { state: string; }
interface Invite {
  id: string;
  email: string;
  examiner_uid: string;
  state: string;
  status: string;
  invited_at: string;
  accepted_at: string | null;
  accepted_person: string | null;
}

const STAT: Record<string, { label: string; cls: string }> = {
  pending:  { label: 'Awaiting registration', cls: 'is-warning' },
  accepted: { label: 'Registered', cls: 'is-success' },
  revoked:  { label: 'Revoked', cls: '' },
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

export default function ExaminerRegistry() {
  const [states, setStates] = useState<string[]>([]);
  const [email, setEmail] = useState('');
  const [state, setState] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUid, setLastUid] = useState<string | null>(null);

  const [rows, setRows] = useState<Invite[]>([]);
  const [showRevoked, setShowRevoked] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('list_examiner_invitations', { _include_revoked: showRevoked });
    setRows((data ?? []) as Invite[]);
  }, [showRevoked]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc('list_states');
      setStates(((data ?? []) as StateRow[]).map((x) => x.state));
    })();
    load();
  }, [load]);

  const canInvite = email.includes('@') && !!state && !busy;

  async function invite() {
    if (!canInvite) return;
    setBusy(true); setError(null); setLastUid(null);
    const { data, error } = await supabase.rpc('onboard_examiner', { _email: email, _state: state });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setLastUid(data as string);
    setEmail(''); setState('');
    load();
  }

  async function revoke(id: string) {
    await supabase.rpc('revoke_examiner_invitation', { _id: id });
    load();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Chief Examiner</p>
        <h1>Examiner registry</h1>
        <p className="mas-lede">
          Examiners are appointed internally. Invite an approved examiner by email
          and a unique examiner UID is generated. The examiner role is granted
          automatically when they register with that email.
        </p>
      </header>

      {lastUid && (
        <div className="mas-alert is-success">
          <div className="mas-alert-body">
            <p className="mas-alert-title">Invitation created · UID <span className="mas-mono">{lastUid}</span></p>
            <p className="mas-alert-text">Ask the examiner to register using the invited email; their role activates on first login.</p>
          </div>
        </div>
      )}
      {error && (
        <div className="mas-alert is-danger">
          <div className="mas-alert-body"><p className="mas-alert-text">{error}</p></div>
        </div>
      )}

      <div className="mas-form">
        <div className="mas-form-cardhead">
          <div><p className="mas-eyebrow">Invite</p><h2>New examiner</h2></div>
        </div>
        <div className="mas-form-grid">
          <div className="mas-field">
            <label htmlFor="email" className="mas-field-label">Examiner email <span className="mas-req">*</span></label>
            <input id="email" type="email" className="mas-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="examiner@example.com" />
          </div>
          <div className="mas-field">
            <label htmlFor="state" className="mas-field-label">State coverage <span className="mas-req">*</span></label>
            <select id="state" className="mas-select" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">Select a state…</option>
              {states.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="mas-form-actions" style={{ marginTop: '1rem' }}>
          <button className="mas-btn-primary" onClick={invite} disabled={!canInvite}>
            {busy ? 'Inviting…' : 'Invite examiner'}
          </button>
        </div>
      </div>

      <header className="mas-page-head mas-section-head mas-section-rowhead">
        <h2>Registry</h2>
        <button className="mas-btn-ghost" onClick={() => setShowRevoked((v) => !v)}>
          {showRevoked ? 'Hide revoked' : 'Show revoked'}
        </button>
      </header>

      {rows.length === 0 && <p className="mas-status">No examiner invitations yet.</p>}
      {rows.length > 0 && (
        <ul className="mas-admin-list">
          {rows.map((r) => (
            <li key={r.id} className="mas-admin-row">
              <div className="mas-admin-main">
                <h3 className="mas-admin-name"><span className="mas-mono">{r.examiner_uid}</span> · {r.accepted_person ?? r.email}</h3>
                <p className="mas-admin-meta">
                  <span className="mas-pill">{r.state}</span>
                  <span className={`mas-badge ${STAT[r.status]?.cls ?? ''}`}>{STAT[r.status]?.label ?? r.status}</span>
                  <span className="mas-field-opt">invited {fmt(r.invited_at)}</span>
                </p>
              </div>
              {r.status === 'pending' && (
                <button className="mas-btn-ghost" onClick={() => revoke(r.id)}>Revoke</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
