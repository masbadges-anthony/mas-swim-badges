import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface InstructorOption { profile_id: string; full_name: string | null; email: string | null; }
interface Blacklisted {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  reason: string | null;
  created_at: string;
}

type Load = 'loading' | 'ready' | 'error';

export default function InstructorBlacklist() {
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [blacklisted, setBlacklisted] = useState<Blacklisted[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoad('loading');
    const [ins, bl] = await Promise.all([
      supabase.rpc('list_instructors'),
      supabase.rpc('list_blacklisted_instructors'),
    ]);
    if (ins.error || bl.error) { setLoad('error'); return; }
    setInstructors((ins.data ?? []) as InstructorOption[]);
    setBlacklisted((bl.data ?? []) as Blacklisted[]);
    setLoad('ready');
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const blacklistedIds = new Set(blacklisted.map((b) => b.profile_id));
  const candidates = instructors.filter((i) => !blacklistedIds.has(i.profile_id));
  const canBlacklist = !!targetId && !busy;

  async function doBlacklist() {
    if (!canBlacklist) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    const { error } = await supabase.rpc('blacklist_instructor', {
      _profile_id: targetId,
      _reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setNotice('Instructor blacklisted and their instructor membership suspended.');
    setTargetId('');
    setReason('');
    refresh();
  }

  async function lift(profileId: string) {
    setBusyId(profileId);
    setNotice(null);
    setError(null);
    const { error } = await supabase.rpc('unblacklist_instructor', { _profile_id: profileId });
    setBusyId(null);
    if (error) { setError(error.message); return; }
    setNotice('Blacklist lifted. Reactivate their membership in Memberships when ready.');
    refresh();
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Administration</p>
        <h1>Instructor blacklist</h1>
        <p className="mas-lede">
          Internal only — blacklisting suspends an instructor’s membership and
          removes them from the public directory. The reason is recorded for the
          committee and is never shown publicly.
        </p>
      </header>

      <div className="mas-form">
        <div className="mas-field">
          <label htmlFor="who" className="mas-field-label">Instructor</label>
          <select id="who" className="mas-select" value={targetId} onChange={(e) => setTargetId(e.target.value)}>
            <option value="">Select an instructor…</option>
            {candidates.map((i) => (
              <option key={i.profile_id} value={i.profile_id}>
                {i.full_name || i.email || i.profile_id}
              </option>
            ))}
          </select>
        </div>
        <div className="mas-field">
          <label htmlFor="reason" className="mas-field-label">Reason (internal)</label>
          <input
            id="reason"
            className="mas-input"
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Recorded for the committee"
          />
        </div>

        {error && <p className="mas-status mas-status-bad">{error}</p>}
        {notice && <p className="mas-status mas-status-good">{notice}</p>}

        <div className="mas-form-actions">
          <button className="mas-btn-primary" onClick={doBlacklist} disabled={!canBlacklist}>
            {busy ? 'Working…' : 'Blacklist instructor'}
          </button>
        </div>
      </div>

      <header className="mas-page-head mas-section-head">
        <h2>Currently blacklisted</h2>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={refresh} disabled={load === 'loading'}>Refresh</button>
        {load === 'ready' && <span className="mas-admin-count">{blacklisted.length} total</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load.</p>}
      {load === 'ready' && blacklisted.length === 0 && (
        <p className="mas-status">No instructors are blacklisted.</p>
      )}

      {load === 'ready' && blacklisted.length > 0 && (
        <ul className="mas-admin-list">
          {blacklisted.map((b) => (
            <li key={b.profile_id} className="mas-admin-row">
              <div className="mas-admin-main">
                <h3 className="mas-admin-name">{b.full_name || b.email || b.profile_id}</h3>
                <p className="mas-admin-meta">
                  <span className="mas-outcome is-refer">Blacklisted</span>
                  <span className="mas-admin-sub">
                    {b.email}
                    {b.reason ? ` · ${b.reason}` : ''}
                    {` · ${b.created_at.slice(0, 10)}`}
                  </span>
                </p>
              </div>
              <div className="mas-admin-action">
                <button className="mas-btn-ghost" onClick={() => lift(b.profile_id)} disabled={busyId === b.profile_id}>
                  {busyId === b.profile_id ? '…' : 'Lift'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
