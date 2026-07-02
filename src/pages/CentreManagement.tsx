// Manage centres — tight-row conversion.
// Single dense table with tabs by recognition state; single-line rows; text link
// actions. Reads/writes unchanged.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Centre {
  id: string;
  name: string;
  state: string;
  status: string;
  recognized_at: string | null;
  contact_email: string | null;
  contact_phone: string | null;
}
type Load = 'loading' | 'ready' | 'error';
type Tab = 'pending' | 'recognized' | 'suspended' | 'removed';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending', recognized: 'Recognised', suspended: 'Suspended', removed: 'Removed',
};

const CSS = `
.mas-page.mas-page-wide { max-width: none !important; width: auto !important; margin-left: 0 !important; margin-right: 0 !important; }
.mas-tight th, .mas-tight td { padding: 0.35rem 0.6rem; white-space: nowrap; vertical-align: middle; }
.mas-tight tbody tr { line-height: 1.3; }
.mas-tight td.mas-contact-cell { white-space: normal; }
.mas-tight .mas-link { color: var(--mas-navy, #1E2752); text-decoration: underline; cursor: pointer; background: none; border: none; padding: 0; font: inherit; }
.mas-tight .mas-link:hover { text-decoration: none; }
.mas-tight .mas-link + .mas-link { margin-left: 0.6rem; }
`;

function todayLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function actionsFor(status: string): { label: string; patch: Record<string, unknown> }[] {
  switch (status) {
    case 'pending':    return [
      { label: 'Recognise', patch: { status: 'recognized', recognized_at: todayLocal() } },
      { label: 'Remove',    patch: { status: 'removed' } },
    ];
    case 'recognized': return [
      { label: 'Suspend', patch: { status: 'suspended' } },
      { label: 'Remove',  patch: { status: 'removed' } },
    ];
    case 'suspended':  return [
      { label: 'Restore', patch: { status: 'recognized' } },
      { label: 'Remove',  patch: { status: 'removed' } },
    ];
    case 'removed':    return [{ label: 'Reopen', patch: { status: 'pending' } }];
    default: return [];
  }
}

export default function CentreManagement() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('pending');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase
      .from('partner_centers')
      .select('id, name, state, status, recognized_at, contact_email, contact_phone')
      .order('name');
    if (error) { setLoad('error'); return; }
    setCentres((data ?? []) as Centre[]);
    setLoad('ready');
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const counts = useMemo(() => ({
    pending:    centres.filter((c) => c.status === 'pending').length,
    recognized: centres.filter((c) => c.status === 'recognized').length,
    suspended:  centres.filter((c) => c.status === 'suspended').length,
    removed:    centres.filter((c) => c.status === 'removed').length,
  }), [centres]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return centres
      .filter((c) => c.status === tab)
      .filter((c) =>
        !q ||
        c.name.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        (c.contact_email ?? '').toLowerCase().includes(q));
  }, [centres, tab, query]);

  async function apply(c: Centre, patch: Record<string, unknown>) {
    setBusyId(c.id);
    setRowError((m) => { const n = { ...m }; delete n[c.id]; return n; });
    const { data, error } = await supabase
      .from('partner_centers')
      .update(patch)
      .eq('id', c.id)
      .select('id, name, state, status, recognized_at, contact_email, contact_phone')
      .single();
    setBusyId(null);
    if (error) { setRowError((m) => ({ ...m, [c.id]: error.message })); return; }
    setCentres((list) => list.map((x) => (x.id === c.id ? (data as Centre) : x)));
  }

  return (
    <section className="mas-page mas-page-wide">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Governance</p>
        <h1>Manage centres</h1>
        <p className="mas-lede">
          Every partner centre and its recognition status. Only recognised centres appear
          in the public directory.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchAll} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          {(['pending', 'recognized', 'suspended', 'removed'] as Tab[]).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t}
              className={tab === t ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
              onClick={() => setTab(t)}>
              {STATUS_LABEL[t]} ({counts[t]})
            </button>
          ))}
        </div>
        <input className="mas-input" type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, state, email"
          style={{ maxWidth: '22rem' }} />
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load centres.</p>}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">No centres in this view.</p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table mas-tight">
            <thead>
              <tr>
                <th>Centre</th>
                <th>State</th>
                <th>Recognised on</th>
                <th>Contact</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id}>
                  <td className="mas-cell-strong">{c.name}</td>
                  <td>{c.state}</td>
                  <td>{fmtDate(c.recognized_at)}</td>
                  <td className="mas-contact-cell">
                    {c.contact_phone && <span>{c.contact_phone}</span>}
                    {c.contact_phone && c.contact_email && ' · '}
                    {c.contact_email && <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a>}
                    {!c.contact_phone && !c.contact_email && <span className="mas-cell-sub">—</span>}
                  </td>
                  <td className="mas-table-actioncol">
                    {actionsFor(c.status).map((a) => (
                      <button key={a.label} className="mas-link"
                        onClick={() => apply(c, a.patch)}
                        disabled={busyId === c.id}>
                        {busyId === c.id ? '…' : a.label}
                      </button>
                    ))}
                    {rowError[c.id] && (
                      <span className="mas-status mas-status-bad" style={{ marginLeft: '0.4rem' }}>
                        {rowError[c.id]}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
