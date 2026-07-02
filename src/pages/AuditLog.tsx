// Audit log — money events (payments, refunds), post-close overrides (reopen),
// AND account-management events (#24 D9). Read-only governance record.
// system_admin / chairperson only.
//   list ← list_audit_log(_session_id?, _limit?) → id, actor_name, action,
//          object_type, object_id, session_id, venue, target_name, detail (jsonb),
//          created_at
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
  target_name: string | null;
  detail: Record<string, unknown> | null;
  created_at: string;
}
type Load = 'loading' | 'ready' | 'error';
type Bucket = 'all' | 'money' | 'accounts' | 'sessions';

const ACTION_LABEL: Record<string, string> = {
  payment_recorded: 'Payment recorded',
  refund_recorded: 'Refund recorded',
  payout_recorded: 'Payout recorded',
  session_reopened: 'Session reopened',
  account_created: 'Account created',
  account_name_updated: 'Name updated',
  account_email_updated: 'Email updated',
  account_password_set: 'Password set by admin',
  account_password_reset_sent: 'Password-reset email sent',
  account_suspended: 'Account suspended',
  account_reactivated: 'Account reactivated',
  account_deleted: 'Account deleted',
};
const MONEY_ACTIONS = new Set(['payment_recorded', 'refund_recorded', 'payout_recorded']);
const ACCOUNT_ACTIONS = new Set([
  'account_created', 'account_name_updated', 'account_email_updated',
  'account_password_set', 'account_password_reset_sent',
  'account_suspended', 'account_reactivated', 'account_deleted',
]);
const SESSION_ACTIONS = new Set(['session_reopened']);

const CSS = `
.mas-page.mas-page-wide { max-width: none !important; width: auto !important; margin-left: 0 !important; margin-right: 0 !important; }
.mas-tight th, .mas-tight td { padding: 0.35rem 0.6rem; white-space: nowrap; vertical-align: middle; }
.mas-tight tbody tr { line-height: 1.3; }
.mas-tight td.mas-detail-cell { white-space: normal; }
`;

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
  if (MONEY_ACTIONS.has(r.action)) {
    const parts: string[] = [money(d.amount)];
    if (d.method) parts.push(String(d.method));
    if (d.reference) parts.push(`ref ${String(d.reference)}`);
    if (d.note) parts.push(String(d.note));
    return parts.join(' · ');
  }
  if (r.action === 'account_created') {
    const parts: string[] = [];
    if (d.email) parts.push(String(d.email));
    if (d.role) parts.push(String(d.role).replace(/_/g, ' '));
    if (d.mode) parts.push(`via ${String(d.mode)}`);
    return parts.join(' · ') || '—';
  }
  if (r.action === 'account_name_updated') return `→ ${String(d.new_name ?? '—')}`;
  if (r.action === 'account_email_updated') return `→ ${String(d.new_email ?? '—')}`;
  if (r.action === 'account_password_reset_sent') return `to ${String(d.email ?? '—')}`;
  if (r.action === 'account_password_set') return 'must change at next sign-in';
  return '';
}
function bucketOf(action: string): Bucket {
  if (MONEY_ACTIONS.has(action)) return 'money';
  if (ACCOUNT_ACTIONS.has(action)) return 'accounts';
  if (SESSION_ACTIONS.has(action)) return 'sessions';
  return 'all';
}

export default function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Bucket>('all');

  const fetchLog = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_audit_log', { _limit: 300 });
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as AuditRow[]);
    setLoad('ready');
  }, []);

  useEffect(() => { fetchLog(); }, [fetchLog]);

  const counts = useMemo(() => {
    const c = { all: rows.length, money: 0, accounts: 0, sessions: 0 };
    for (const r of rows) {
      const b = bucketOf(r.action);
      if (b !== 'all') c[b]++;
    }
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => tab === 'all' || bucketOf(r.action) === tab)
      .filter((r) =>
        !q ||
        (r.actor_name ?? '').toLowerCase().includes(q) ||
        (r.target_name ?? '').toLowerCase().includes(q) ||
        (ACTION_LABEL[r.action] ?? r.action).toLowerCase().includes(q) ||
        (r.venue ?? '').toLowerCase().includes(q) ||
        detailSummary(r).toLowerCase().includes(q),
      );
  }, [rows, query, tab]);

  return (
    <section className="mas-page mas-page-wide">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Administration</p>
        <h1>Audit log</h1>
        <p className="mas-lede">
          Money events, post-close overrides, and account-management actions —
          who did what and when. Read-only governance record.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchLog} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          {(['all', 'money', 'accounts', 'sessions'] as Bucket[]).map((b) => (
            <button
              key={b}
              role="tab"
              aria-selected={tab === b}
              className={tab === b ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
              onClick={() => setTab(b)}
            >
              {b === 'all' ? 'All' : b === 'money' ? 'Money' : b === 'accounts' ? 'Accounts' : 'Sessions'}
              {' '}({counts[b]})
            </button>
          ))}
        </div>
        <input
          className="mas-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search actor, target, action, venue, detail"
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
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Detail</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="mas-cell-sub">{whenStr(r.created_at)}</td>
                  <td>{r.actor_name || '—'}</td>
                  <td className="mas-cell-strong">{ACTION_LABEL[r.action] ?? r.action}</td>
                  <td>{r.target_name || <span className="mas-cell-sub">—</span>}</td>
                  <td className="mas-detail-cell">{detailSummary(r) || <span className="mas-cell-sub">—</span>}</td>
                  <td>{r.venue || <span className="mas-cell-sub">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
