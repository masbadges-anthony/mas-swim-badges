// #16 — Certificates registry, dense-table conversion.
// Reads (unchanged wire): certificates + certificate_revocations directly via RLS.
// House law: dense table · Valid/Revoked tabs · per-row Revoke (with reason).
// Revoke is a data-write with real weight, so it uses an inline expanded row
// (reason + Confirm/Cancel) rather than a modal — the same "reveal on action"
// pattern as MyInvoices' cancel flow.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import '../styles/admin.css';

interface Certificate {
  id: string;
  serial: string;
  candidate_name_snapshot: string;
  level: string;
  issued_on: string;
}
type Load = 'loading' | 'ready' | 'error';
type Tab = 'valid' | 'revoked';

function prettyLevel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function fmtDate(s: string | null): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function Certificates() {
  const { session } = useAuth();
  const me = session?.user?.id ?? null;

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [revoked, setRevoked] = useState<Set<string>>(new Set());
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<Tab>('valid');
  const [query, setQuery] = useState('');

  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoad('loading');
    const [c, r] = await Promise.all([
      supabase.from('certificates')
        .select('id, serial, candidate_name_snapshot, level, issued_on')
        .order('issued_on', { ascending: false }),
      supabase.from('certificate_revocations').select('certificate_id'),
    ]);
    if (c.error) { setLoad('error'); return; }
    setCerts((c.data ?? []) as Certificate[]);
    setRevoked(new Set(((r.data ?? []) as { certificate_id: string }[]).map((x) => x.certificate_id)));
    setLoad('ready');
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  function startRevoke(id: string) {
    setRevokingId(id);
    setReason('');
    setRowError((m) => { const n = { ...m }; delete n[id]; return n; });
  }

  async function confirmRevoke(cert: Certificate) {
    setBusyId(cert.id);
    const { error } = await supabase.from('certificate_revocations').insert({
      certificate_id: cert.id,
      revoked_by_profile_id: me,
      reason: reason.trim() || null,
    });
    setBusyId(null);
    if (error) {
      setRowError((m) => ({ ...m, [cert.id]: error.message }));
      return;
    }
    setRevoked((s) => new Set(s).add(cert.id));
    setRevokingId(null);
    setReason('');
  }

  const counts = useMemo(() => ({
    valid: certs.filter((c) => !revoked.has(c.id)).length,
    revoked: certs.filter((c) => revoked.has(c.id)).length,
  }), [certs, revoked]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return certs
      .filter((c) => (tab === 'valid' ? !revoked.has(c.id) : revoked.has(c.id)))
      .filter((c) =>
        !q ||
        c.candidate_name_snapshot.toLowerCase().includes(q) ||
        c.serial.toLowerCase().includes(q) ||
        c.level.toLowerCase().includes(q));
  }, [certs, revoked, tab, query]);

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Registry</p>
        <h1>Certificates</h1>
        <p className="mas-lede">
          Issued certificates. Revoking one releases its passing result so a
          corrected certificate can be reissued from the issuance queue.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchAll} disabled={load === 'loading'}>
          Refresh
        </button>
        <div className="mas-tabs" role="tablist" style={{ display: 'flex', gap: '0.3rem' }}>
          <button role="tab" aria-selected={tab === 'valid'}
            className={tab === 'valid' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('valid')}>Valid ({counts.valid})</button>
          <button role="tab" aria-selected={tab === 'revoked'}
            className={tab === 'revoked' ? 'mas-btn-primary mas-btn-compact' : 'mas-btn-ghost mas-btn-compact'}
            onClick={() => setTab('revoked')}>Revoked ({counts.revoked})</button>
        </div>
        <input
          className="mas-input" type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, serial, level"
          style={{ maxWidth: '22rem' }}
        />
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load certificates. Refresh to try again.</p>}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">No certificates in this view.</p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-table-wrap">
          <table className="mas-table">
            <thead>
              <tr>
                <th>Candidate</th>
                <th>Level</th>
                <th>Serial</th>
                <th>Issued</th>
                <th>Status</th>
                <th className="mas-table-actioncol">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => {
                const isRevoked = revoked.has(c.id);
                const isRevoking = revokingId === c.id;
                return (
                  <Fragment key={c.id}>
                    <tr>
                      <td className="mas-cell-strong">{c.candidate_name_snapshot}</td>
                      <td><span className="mas-pill">{prettyLevel(c.level)}</span></td>
                      <td>
                        <span className="mas-cell-stack">
                          <Link to={`/certificate/${c.serial}`} className="mas-serial">{c.serial}</Link>
                          <span className="mas-cell-sub"><Link to={`/verify/${c.serial}`}>verify</Link></span>
                        </span>
                      </td>
                      <td>{fmtDate(c.issued_on)}</td>
                      <td>
                        <span className={`mas-outcome ${isRevoked ? 'is-refer' : 'is-pass'}`}>
                          {isRevoked ? 'Revoked' : 'Valid'}
                        </span>
                      </td>
                      <td className="mas-table-actioncol">
                        {!isRevoked && !isRevoking && (
                          <button className="mas-btn-ghost mas-btn-compact" onClick={() => startRevoke(c.id)}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                    {isRevoking && (
                      <tr className="mas-table-detailrow">
                        <td colSpan={6}>
                          <div className="mas-table-detail">
                            <p className="mas-field-label" style={{ marginBottom: '0.4rem' }}>
                              Revoking this certificate will release the underlying pass for reissue.
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                              <input
                                className="mas-input"
                                type="text"
                                value={reason}
                                onChange={(e) => setReason(e.target.value)}
                                placeholder="Reason (optional)"
                                style={{ flex: '1 1 22rem', minWidth: '15rem' }}
                              />
                              <button
                                className="mas-btn-primary mas-btn-compact"
                                onClick={() => confirmRevoke(c)}
                                disabled={busyId === c.id}
                              >
                                {busyId === c.id ? 'Revoking…' : 'Confirm revoke'}
                              </button>
                              <button
                                className="mas-btn-ghost mas-btn-compact"
                                onClick={() => setRevokingId(null)}
                                disabled={busyId === c.id}
                              >
                                Cancel
                              </button>
                            </div>
                            {rowError[c.id] && (
                              <p className="mas-status mas-status-bad" style={{ marginTop: '0.4rem' }}>
                                {rowError[c.id]}
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
    </section>
  );
}
