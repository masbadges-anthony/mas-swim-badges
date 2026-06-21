import { useCallback, useEffect, useState } from 'react';
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

function prettyLevel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function Certificates() {
  const { session } = useAuth();
  const me = session?.user?.id ?? null;

  const [certs, setCerts] = useState<Certificate[]>([]);
  const [revoked, setRevoked] = useState<Set<string>>(new Set());
  const [load, setLoad] = useState<Load>('loading');

  // per-cert revoke UI state
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoad('loading');
    const [c, r] = await Promise.all([
      supabase
        .from('certificates')
        .select('id, serial, candidate_name_snapshot, level, issued_on')
        .order('issued_on', { ascending: false }),
      supabase.from('certificate_revocations').select('certificate_id'),
    ]);
    if (c.error) {
      setLoad('error');
      return;
    }
    setCerts((c.data ?? []) as Certificate[]);
    setRevoked(
      new Set(((r.data ?? []) as { certificate_id: string }[]).map((x) => x.certificate_id)),
    );
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function startRevoke(id: string) {
    setRevokingId(id);
    setReason('');
    setRowError((m) => {
      const n = { ...m };
      delete n[id];
      return n;
    });
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
    // The trigger frees the underlying pass, so it returns to the issuance queue.
    setRevoked((s) => new Set(s).add(cert.id));
    setRevokingId(null);
    setReason('');
  }

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

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchAll} disabled={load === 'loading'}>
          Refresh
        </button>
        {load === 'ready' && (
          <span className="mas-admin-count">{certs.length} issued</span>
        )}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load certificates. Refresh to try again.</p>
      )}
      {load === 'ready' && certs.length === 0 && (
        <p className="mas-status">No certificates issued yet.</p>
      )}

      {load === 'ready' && certs.length > 0 && (
        <ul className="mas-admin-list">
          {certs.map((c) => {
            const isRevoked = revoked.has(c.id);
            return (
              <li key={c.id} className="mas-admin-row">
                <div className="mas-admin-main">
                  <h2 className="mas-admin-name">{c.candidate_name_snapshot}</h2>
                  <p className="mas-admin-meta">
                    <span className="mas-pill">{prettyLevel(c.level)}</span>
                    <span
                      className={`mas-outcome ${isRevoked ? 'is-refer' : 'is-pass'}`}
                    >
                      {isRevoked ? 'Revoked' : 'Valid'}
                    </span>
                    <span className="mas-admin-sub">Issued {c.issued_on}</span>
                  </p>
                  <p className="mas-admin-line">
                    <span className="mas-serial">{c.serial}</span> ·{' '}
                    <Link to={`/verify/${c.serial}`}>verify</Link>
                  </p>

                  {revokingId === c.id && (
                    <div className="mas-revoke">
                      <input
                        className="mas-input"
                        type="text"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Reason (optional)"
                      />
                      <div className="mas-grade-actions">
                        <button
                          className="mas-btn-primary"
                          onClick={() => confirmRevoke(c)}
                          disabled={busyId === c.id}
                        >
                          {busyId === c.id ? 'Revoking…' : 'Confirm revoke'}
                        </button>
                        <button
                          className="mas-btn-ghost"
                          onClick={() => setRevokingId(null)}
                          disabled={busyId === c.id}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {rowError[c.id] && (
                    <p className="mas-status mas-status-bad mas-admin-rowerror">
                      {rowError[c.id]}
                    </p>
                  )}
                </div>

                <div className="mas-admin-action">
                  {!isRevoked && revokingId !== c.id && (
                    <button
                      className="mas-btn-ghost"
                      onClick={() => startRevoke(c.id)}
                    >
                      Revoke
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
