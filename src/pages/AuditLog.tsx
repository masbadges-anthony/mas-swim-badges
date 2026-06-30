// Audit log — money events (payments, refunds) and post-close overrides (reopen).
// Read-only governance record. system_admin / chairperson only.
//   list ← list_audit_log(_session_id?, _limit?) → id, actor_name, action,
//          object_type, object_id, session_id, venue, detail (jsonb), created_at
// House UI law: dense table. (A log is append-only — no active/archive tabs apply.)
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface AuditRow {
  id: string;
  actor_name: string | null;
  action: string;
  object_type: string;
  object_id: string | null;
  session_id: string | null;
  venue: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}
type Load = 'loading' | 'ready' | 'error';

const ACTION_LABEL: Record<string, string> = {
  payment_recorded: 'Payment recorded',
  refund_recorded: 'Refund recorded',
  payout_recorded: 'Payout recorded',
  session_reopened: 'Session reopened',
};

function money(n: unknown): string {
  return `RM ${Number(n ?? 0).toFixed(2)}`;
}
function whenStr(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function detailSummary(r: AuditRow): string {
  const d = r.detail ?? {};
  if (r.action === 'session_reopened') {
    return `Reason: ${String(d.reason ?? '—')}`;
  }
  // payment / refund / payout
  const parts: string[] = [money(d.amount)];
  if (d.method) parts.push(String(d.method));
  if (d.reference) parts.push(`ref ${String(d.reference)}`);
  if (d.note) parts.push(String(d.note));
  return parts.join(' · ');
}

export default function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');

  const fetchLog = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_audit_log', { _limit: 300 });
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as AuditRow[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchLog();
  }, [fetchLog]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.actor_name ?? '').toLowerCase().includes(q) ||
        (ACTION_LABEL[r.action] ?? r.action).toLowerCase().includes(q) ||
        (r.venue ?? '').toLowerCase().includes(q) ||
        detailSummary(r).toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Administration</p>
        <h1>Audit log</h1>
        <p className="mas-lede">
          Money events (payments, refunds) and post-close overrides, with who did what and
          when. Read-only governance record.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchLog} disabled={load === 'loading'}>
          Refresh
        </button>
        <input
          className="mas-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actor, action, venue, detail"
          style={{ maxWidth: '22rem' }}
        />
        {load === 'ready' && (
          <span className="mas-admin-count">
            {filtered.length} event{filtered.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load the audit log. Refresh to try again.</p>
      )}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">No events {query ? 'match your search' : 'recorded yet'}.</p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Detail</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="mas-cell-sub" style={{ whiteSpace: 'nowrap' }}>{whenStr(r.created_at)}</td>
                  <td>{r.actor_name || '—'}</td>
                  <td className="mas-cell-strong">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td>{detailSummary(r)}</td>
                  <td>{r.venue || (r.session_id ? '—' : '')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
