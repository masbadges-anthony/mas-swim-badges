import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

// Read-only certificate registry. Issuance is now AUTOMATIC (#14): booked certs release
// on examiner submit, bonus certs on bonus payment. This screen no longer issues — it
// lists issued certificates and shows how many passes are awaiting auto-issuance.

interface CertRow {
  serial: string;
  candidate_name: string;
  level: string;
  billing_stage: 'booked' | 'bonus' | null;
  issued_on: string | null;
  venue: string | null;
  scheduled_on: string | null;
}
type Load = 'loading' | 'ready' | 'error';

const LEVEL_LABEL: Record<string, string> = {
  starfish: 'Starfish', sea_turtle: 'Sea Turtle', guppy: 'Guppy', octopus: 'Octopus',
  frog: 'Frog', swordfish: 'Swordfish', dolphin: 'Dolphin',
};

function prettyDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const CSS = `
.mas-creg-wrap { overflow-x:auto; border:1px solid var(--border,#e3e7ee); border-radius:12px; }
.mas-creg { width:100%; border-collapse:collapse; font-size:0.9rem; }
.mas-creg thead th { text-align:left; padding:0.55rem 0.7rem; background:#1E2752; color:#fff; font-size:0.74rem; letter-spacing:0.04em; text-transform:uppercase; white-space:nowrap; }
.mas-creg tbody td { padding:0.45rem 0.7rem; border-top:1px solid var(--border,#e3e7ee); vertical-align:middle; }
.mas-creg tbody tr:hover { background:#f6f8fc; }
.mas-creg .mono { font-variant-numeric:tabular-nums; font-weight:600; color:var(--navy,#1E2752); white-space:nowrap; }
.mas-cstage { display:inline-block; padding:0.1rem 0.5rem; border-radius:999px; font-size:0.72rem; }
.mas-cstage.booked { background:#e6ecf6; color:#1E2752; }
.mas-cstage.bonus { background:#fff1d6; color:#7a4d00; }
`;

export default function CertificateIssuance() {
  const [rows, setRows] = useState<CertRow[]>([]);
  const [awaiting, setAwaiting] = useState<number>(0);
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');

  const fetchRegistry = useCallback(async () => {
    setLoad('loading');
    const [{ data, error }, awaitRes] = await Promise.all([
      supabase.rpc('list_issued_certificates', { _limit: 300 }),
      supabase.rpc('count_certs_awaiting'),
    ]);
    if (error) {
      setLoad('error');
      return;
    }
    setRows((data ?? []) as CertRow[]);
    setAwaiting((awaitRes.data as number) ?? 0);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchRegistry();
  }, [fetchRegistry]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.serial.toLowerCase().includes(q) ||
        r.candidate_name.toLowerCase().includes(q) ||
        (r.venue ?? '').toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <section className="mas-page">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Issuance</p>
        <h1>Certificate registry</h1>
        <p className="mas-lede">
          Issued certificates. Issuance is automatic — booked certificates release when the
          examiner submits a session, and bonus certificates release once the bonus payment
          is recorded. This is a read-only record.
        </p>
      </header>

      <div className="mas-admin-toolbar" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="mas-btn-ghost" onClick={fetchRegistry} disabled={load === 'loading'}>
          Refresh
        </button>
        <input
          className="mas-input"
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search serial, candidate, or venue"
          style={{ maxWidth: '20rem' }}
        />
        {load === 'ready' && (
          <span className="mas-admin-count">
            {filtered.length} certificate{filtered.length === 1 ? '' : 's'}
            {awaiting > 0 ? ` · ${awaiting} awaiting auto-issue` : ''}
          </span>
        )}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load the registry. Refresh to try again.</p>
      )}
      {load === 'ready' && filtered.length === 0 && (
        <p className="mas-status">No certificates {query ? 'match your search' : 'issued yet'}.</p>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-creg-wrap">
          <table className="mas-creg">
            <thead>
              <tr>
                <th>Serial</th>
                <th>Candidate</th>
                <th>Level</th>
                <th>Stage</th>
                <th>Issued</th>
                <th>Session</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={`${r.serial}-${i}`}>
                  <td className="mono">{r.serial}</td>
                  <td>{r.candidate_name}</td>
                  <td>{LEVEL_LABEL[r.level] ?? r.level}</td>
                  <td>
                    {r.billing_stage ? (
                      <span className={`mas-cstage ${r.billing_stage}`}>
                        {r.billing_stage === 'bonus' ? 'Bonus' : 'Booked'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>{prettyDate(r.issued_on)}</td>
                  <td>
                    {r.venue || '—'}
                    {r.scheduled_on ? ` · ${prettyDate(r.scheduled_on)}` : ''}
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
