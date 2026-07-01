// #17 — Swimmer Registry. Governance overview of every swimmer.
// Gated (chair/sysadmin/finance_officer) at the DB layer; route + nav mirror it.
//   list ← list_swimmer_registry()
//   certs (expand) ← list_swimmer_certificates(_candidate_id)
//   withdraw/restore ← set_candidate_status(_candidate_id, _status)  (#16)
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface SwimmerRow {
  candidate_id: string;
  full_name: string;
  date_of_birth: string | null;
  status: string;
  swimmer_id: string | null;
  claim_code: string | null;
  claim_status: string;
  instructor_name: string | null;
  centre_name: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  highest_level: string | null;
  highest_level_on: string | null;
  last_assessment: string | null;
  has_active_session: boolean;
  cert_count: number;
}
interface SwimmerCert {
  serial: string;
  level: string;
  issued_on: string | null;
  centre_name: string | null;
}
type Load = 'loading' | 'ready' | 'error';
type Tab = 'active' | 'withdrawn';

function pretty(s: string | null): string {
  if (!s) return '—';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}
function ageFrom(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let a = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) a--;
  return a;
}

export default function SwimmerRegistry() {
  const [rows, setRows] = useState<SwimmerRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('active');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [certs, setCerts] = useState<Record<string, SwimmerCert[]>>({});
  const [certLoad, setCertLoad] = useState<Record<string, Load>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const fetchRegistry = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_swimmer_registry');
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as SwimmerRow[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  const fetchCerts = useCallback(async (candidateId: string) => {
    setCertLoad((m) => ({ ...m, [candidateId]: 'loading' }));
    const { data, error } = await supabase.rpc('list_swimmer_certificates', { _candidate_id: candidateId });
    if (error) {
      setCertLoad((m) => ({ ...m, [candidateId]: 'error' }));
      return;
    }
    setCerts((m) => ({ ...m, [candidateId]: (data ?? []) as SwimmerCert[] }));
    setCertLoad((m) => ({ ...m, [candidateId]: 'ready' }));
  }, []);

  function toggleExpand(id: string) {
    setExpanded((cur) => {
      const next = cur === id ? null : id;
      if (next && certs[id] === undefined) fetchCerts(id);
      return next;
    });
  }

  async function setStatus(row: SwimmerRow, status: 'active' | 'withdrawn') {
    setBusy(row.candidate_id);
    setRowError((m) => { const n = { ...m }; delete n[row.candidate_id]; return n; });
    const { error } = await supabase.rpc('set_candidate_status', {
      _candidate_id: row.candidate_id,
      _status: status,
    });
    setBusy(null);
    if (error) {
      setRowError((m) => ({ ...m, [row.candidate_id]: error.message }));
      return;
    }
    setRows((list) => list.map((x) => (x.candidate_id === row.candidate_id ? { ...x, status } : x)));
  }

  const counts = useMemo(() => ({
    active: rows.filter((r) => r.status === 'active').length,
    withdrawn: rows.filter((r) => r.status === 'withdrawn' || r.status === 'anonymized').length,
  }), [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (tab === 'active' ? r.status === 'active' : r.status === 'withdrawn' || r.status === 'anonymized'))
      .filter((r) =>
        !q ||
        r.full_name.toLowerCase().includes(q) ||
        (r.swimmer_id ?? '').toLowerCase().includes(q) ||
        (r.claim_code ?? '').toLowerCase().includes(q));
  }, [rows, tab, query]);

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Registry</p>
        <h1>Swimmer registry</h1>
        <p className="mas-lede">
          Every swimmer across the programme — their instructor, centre, claim status and
          parent contact, highest badge attained, and certificates. Expand a row to browse
          and print certificates.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchRegistry} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          <button role="tab" aria-selected={tab === 'active'}
            className={tab === 'active' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('active')}>Active ({counts.active})</button>
          <button role="tab" aria-selected={tab === 'withdrawn'}
            className={tab === 'withdrawn' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('withdrawn')}>Withdrawn ({counts.withdrawn})</button>
        </div>
        <input
          className="mas-input" type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, swimmer ID, claim code"
          style={{ maxWidth: '22rem' }}
        />
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load the registry.</p>}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">No swimmers in this view.</p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th className="mas-table-expandcol" aria-label="Expand" />
                <th>Swimmer</th>
                <th>Instructor</th>
                <th>Centre</th>
                <th>Highest</th>
                <th>Last assessed</th>
                <th>Active</th>
                <th>Claim</th>
                <th>Parent contact</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const isOpen = expanded === r.candidate_id;
                const age = ageFrom(r.date_of_birth);
                return (
                  <Fragment key={r.candidate_id}>
                    <tr className={isOpen ? 'is-open' : undefined}>
                      <td className="mas-table-expandcol">
                        <button type="button" className="mas-table-expandbtn"
                          onClick={() => toggleExpand(r.candidate_id)}
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Collapse' : 'Expand'}>
                          {isOpen ? '▾' : '▸'}
                        </button>
                      </td>
                      <td className="mas-cell-strong">
                        <span className="mas-cell-stack">
                          <span>
                            {r.full_name}
                            {r.status === 'anonymized' && <span className="mas-pill" style={{ marginLeft: '0.4rem' }}>anonymized</span>}
                          </span>
                          <span className="mas-cell-sub">
                            {fmtDate(r.date_of_birth)}{age !== null ? ` · ${age} yrs` : ''} · {r.swimmer_id ?? '—'}
                          </span>
                        </span>
                      </td>
                      <td>{r.instructor_name || '—'}</td>
                      <td>{r.centre_name || 'Independent'}</td>
                      <td>
                        {r.highest_level ? (
                          <span className="mas-cell-stack">
                            <span className="mas-pill">{pretty(r.highest_level)}</span>
                            <span className="mas-cell-sub">{fmtDate(r.highest_level_on)}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td>{fmtDate(r.last_assessment)}</td>
                      <td>{r.has_active_session ? <span className="mas-outcome is-pass">Yes</span> : '—'}</td>
                      <td>
                        <span className="mas-cell-stack">
                          <span className={r.claim_status === 'claimed' ? 'mas-outcome is-pass' : 'mas-outcome is-refer'}>
                            {pretty(r.claim_status)}
                          </span>
                          {r.claim_status !== 'claimed' && r.claim_code && (
                            <span className="mas-cell-sub mas-serial">{r.claim_code}</span>
                          )}
                        </span>
                      </td>
                      <td>
                        {r.parent_name ? (
                          <span className="mas-cell-stack">
                            <span>{r.parent_name}</span>
                            {r.parent_phone && <span className="mas-cell-sub"><a href={`tel:${r.parent_phone}`}>{r.parent_phone}</a></span>}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="mas-table-actioncol">
                        {r.status === 'anonymized' ? (
                          <span className="mas-cell-sub">—</span>
                        ) : r.status === 'withdrawn' ? (
                          <button className="mas-btn-ghost mas-btn-compact" onClick={() => setStatus(r, 'active')} disabled={busy === r.candidate_id}>
                            {busy === r.candidate_id ? '…' : 'Restore'}
                          </button>
                        ) : (
                          <button className="mas-btn-ghost mas-btn-compact" onClick={() => setStatus(r, 'withdrawn')} disabled={busy === r.candidate_id}>
                            {busy === r.candidate_id ? '…' : 'Withdraw'}
                          </button>
                        )}
                        {rowError[r.candidate_id] && <span className="mas-status mas-status-bad">{rowError[r.candidate_id]}</span>}
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={10}>
                          <div className="mas-table-detail">
                            <h3 className="mas-detail-heading">Certificates ({r.cert_count})</h3>
                            {certLoad[r.candidate_id] === 'loading' && <p className="mas-status">Loading…</p>}
                            {certLoad[r.candidate_id] === 'error' && <p className="mas-status mas-status-bad">Couldn’t load certificates.</p>}
                            {certLoad[r.candidate_id] === 'ready' && (certs[r.candidate_id]?.length ?? 0) === 0 && (
                              <p className="mas-status">No certificates released yet.</p>
                            )}
                            {certLoad[r.candidate_id] === 'ready' && (certs[r.candidate_id]?.length ?? 0) > 0 && (
                              <table className="mas-table" style={{ marginTop: '0.5rem' }}>
                                <thead>
                                  <tr><th>Level</th><th>Serial</th><th>Issued</th><th>Centre</th><th className="mas-table-actioncol">Certificate</th></tr>
                                </thead>
                                <tbody>
                                  {certs[r.candidate_id].map((ct) => (
                                    <tr key={ct.serial}>
                                      <td className="mas-cell-strong">{pretty(ct.level)}</td>
                                      <td className="mas-serial">{ct.serial}</td>
                                      <td>{fmtDate(ct.issued_on)}</td>
                                      <td>{ct.centre_name || '—'}</td>
                                      <td className="mas-table-actioncol">
                                        <a className="mas-btn-ghost mas-btn-compact" href={`/certificate/${ct.serial}`} target="_blank" rel="noopener noreferrer">
                                          View / print
                                        </a>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
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
    </section>
  );
}
