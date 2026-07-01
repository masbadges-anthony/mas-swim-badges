// #16 — Instructor blacklist, dense-table conversion.
// House law: dense table · Active/Lifted tabs · inline-add row (instructor · reason · +Blacklist).
// A "lifted" blacklist is one where the profile has been unblacklisted since —
// we don't have a distinct history table, so the Active/Lifted tabs derive from
// whether the profile currently appears in list_blacklisted_instructors. When
// lifted, they drop from the list entirely. So the "Lifted" tab here shows an
// informational note explaining that (rather than pretending to have history).
import { useCallback, useEffect, useMemo, useState } from 'react';
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
type Tab = 'active' | 'lifted';

const CSS = `
.mas-addrow td { background:#f5f8fc; }
.mas-addrow-fields { display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; }
.mas-addrow-fields select, .mas-addrow-fields input[type=text] {
  font:inherit; padding:0.35rem 0.5rem; border:1px solid var(--mas-line,#e3e9f3); border-radius:6px;
}
.mas-addrow-fields select { min-width:18rem; }
.mas-addrow-fields input[type=text] { min-width:16rem; flex:1 1 auto; }
`;

function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function InstructorBlacklist() {
  const [instructors, setInstructors] = useState<InstructorOption[]>([]);
  const [blacklisted, setBlacklisted] = useState<Blacklisted[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('active');

  const [targetId, setTargetId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

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

  const blacklistedIds = useMemo(() => new Set(blacklisted.map((b) => b.profile_id)), [blacklisted]);
  const candidates = useMemo(
    () => instructors.filter((i) => !blacklistedIds.has(i.profile_id)),
    [instructors, blacklistedIds],
  );
  const canBlacklist = !!targetId && !busy;

  async function doBlacklist() {
    if (!canBlacklist) return;
    setBusy(true); setAddError(null); setNotice(null);
    const { error } = await supabase.rpc('blacklist_instructor', {
      _profile_id: targetId,
      _reason: reason.trim() || null,
    });
    setBusy(false);
    if (error) { setAddError(error.message); return; }
    setNotice('Instructor blacklisted and their instructor membership suspended.');
    setTargetId(''); setReason('');
    refresh();
  }

  async function lift(profileId: string) {
    setBusyId(profileId); setNotice(null); setAddError(null);
    const { error } = await supabase.rpc('unblacklist_instructor', { _profile_id: profileId });
    setBusyId(null);
    if (error) { setAddError(error.message); return; }
    setNotice('Blacklist lifted. Reactivate their membership in Memberships when ready.');
    refresh();
  }

  return (
    <section className="mas-page">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Administration</p>
        <h1>Instructor blacklist</h1>
        <p className="mas-lede">
          Internal only — blacklisting suspends an instructor’s membership and removes
          them from the public directory. Reasons are recorded for the committee and
          never shown publicly.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={refresh} disabled={load === 'loading'}>Refresh</button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          <button role="tab" aria-selected={tab === 'active'}
            className={tab === 'active' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('active')}>Active ({blacklisted.length})</button>
          <button role="tab" aria-selected={tab === 'lifted'}
            className={tab === 'lifted' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('lifted')}>Lifted</button>
        </div>
      </div>

      {notice && <p className="mas-status mas-status-good">{notice}</p>}
      {addError && <p className="mas-status mas-status-bad">{addError}</p>}

      <div className="mas-table-wrap">
        <table className="mas-table">
          <thead>
            <tr>
              <th>Instructor</th>
              <th>Reason</th>
              <th>Blacklisted</th>
              <th className="mas-table-actioncol">Action</th>
            </tr>
          </thead>
          <tbody>
            {tab === 'active' && (
              <tr className="mas-addrow">
                <td colSpan={4}>
                  <div className="mas-addrow-fields">
                    <select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                      <option value="">Select an instructor…</option>
                      {candidates.map((i) => (
                        <option key={i.profile_id} value={i.profile_id}>
                          {i.full_name || i.email || i.profile_id}
                        </option>
                      ))}
                    </select>
                    <input type="text" value={reason} placeholder="Reason (internal, optional)"
                      onChange={(e) => setReason(e.target.value)} />
                    <button className="mas-btn-primary mas-btn-compact" onClick={doBlacklist} disabled={!canBlacklist}>
                      {busy ? 'Working…' : '+ Blacklist'}
                    </button>
                  </div>
                </td>
              </tr>
            )}

            {load === 'loading' && (
              <tr><td colSpan={4} className="mas-status">Loading…</td></tr>
            )}
            {load === 'error' && (
              <tr><td colSpan={4} className="mas-status mas-status-bad">Couldn’t load.</td></tr>
            )}

            {tab === 'active' && load === 'ready' && blacklisted.length === 0 && (
              <tr><td colSpan={4} className="mas-status">No instructors are blacklisted.</td></tr>
            )}

            {tab === 'active' && load === 'ready' && blacklisted.map((b) => (
              <tr key={b.profile_id}>
                <td className="mas-cell-strong">
                  <span className="mas-cell-stack">
                    <span>{b.full_name || b.email || b.profile_id}</span>
                    {b.email && b.full_name && <span className="mas-cell-sub">{b.email}</span>}
                  </span>
                </td>
                <td>{b.reason || <span className="mas-cell-sub">—</span>}</td>
                <td>{fmtDate(b.created_at)}</td>
                <td className="mas-table-actioncol">
                  <button className="mas-btn-ghost mas-btn-compact" onClick={() => lift(b.profile_id)} disabled={busyId === b.profile_id}>
                    {busyId === b.profile_id ? '…' : 'Lift'}
                  </button>
                </td>
              </tr>
            ))}

            {tab === 'lifted' && (
              <tr><td colSpan={4} className="mas-status">
                Once a blacklist is lifted, the instructor is removed from this list.
                Historical records aren’t retained here — the action is audited in the
                Audit log.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
