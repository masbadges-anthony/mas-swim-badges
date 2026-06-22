import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Centre {
  id: string;
  name: string;
  state: string;
  status: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
}
interface Cert {
  id: string;
  serial: string;
  candidate_name_snapshot: string;
  level: string;
  issued_on: string;
  partner_center_id: string | null;
}

type Load = 'loading' | 'ready' | 'error';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending review',
  recognized: 'Recognised',
  suspended: 'Suspended',
  removed: 'Removed',
};

function prettyLevel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function CentreAdmin() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [certs, setCerts] = useState<Record<string, Cert[]>>({});
  const [load, setLoad] = useState<Load>('loading');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoad('loading');

    // 1) Which centres do I administer? (own memberships are readable to me)
    const { data: mem, error: mErr } = await supabase
      .from('memberships')
      .select('partner_center_id')
      .eq('role', 'partner_center_admin')
      .eq('status', 'active');
    if (mErr) {
      setLoad('error');
      return;
    }
    const ids = Array.from(
      new Set(
        ((mem ?? []) as { partner_center_id: string | null }[])
          .map((m) => m.partner_center_id)
          .filter((x): x is string => !!x),
      ),
    );
    if (ids.length === 0) {
      setCentres([]);
      setCerts({});
      setLoad('ready');
      return;
    }

    // 2) Fetch those centres and their certificates (both scoped by RLS).
    const [c, ct] = await Promise.all([
      supabase
        .from('partner_centers')
        .select('id, name, state, status, contact_email, contact_phone, address')
        .in('id', ids)
        .order('name'),
      supabase
        .from('certificates')
        .select('id, serial, candidate_name_snapshot, level, issued_on, partner_center_id')
        .in('partner_center_id', ids)
        .order('issued_on', { ascending: false }),
    ]);
    if (c.error) {
      setLoad('error');
      return;
    }
    setCentres((c.data ?? []) as Centre[]);
    const byCentre: Record<string, Cert[]> = {};
    for (const x of (ct.data ?? []) as Cert[]) {
      if (x.partner_center_id) (byCentre[x.partner_center_id] ??= []).push(x);
    }
    setCerts(byCentre);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  function edit(id: string, field: 'contact_email' | 'contact_phone' | 'address', value: string) {
    setCentres((list) => list.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    setSavedId(null);
  }

  async function save(c: Centre) {
    setSavingId(c.id);
    setSavedId(null);
    setRowError((m) => {
      const n = { ...m };
      delete n[c.id];
      return n;
    });

    const { error } = await supabase.rpc('update_my_centre_contact', {
      _center_id: c.id,
      _email: c.contact_email?.trim() || null,
      _phone: c.contact_phone?.trim() || null,
      _address: c.address?.trim() || null,
    });

    setSavingId(null);
    if (error) {
      setRowError((m) => ({ ...m, [c.id]: error.message }));
      return;
    }
    setSavedId(c.id);
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Centre admin</p>
        <h1>My centre</h1>
        <p className="mas-lede">
          Keep your centre's contact details current — these are what parents see
          in the public directory. Recognition status is managed by Malaysia
          Aquatics.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchAll} disabled={load === 'loading'}>
          Refresh
        </button>
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load your centre.</p>
      )}
      {load === 'ready' && centres.length === 0 && (
        <p className="mas-status">
          You don’t administer any centres yet. If you’ve applied, an officer
          needs to recognise it and grant you centre-admin access.
        </p>
      )}

      {load === 'ready' &&
        centres.map((c) => {
          const list = certs[c.id] ?? [];
          const recognised = c.status === 'recognized';
          return (
            <div key={c.id} className="mas-grade-session">
              <div className="mas-grade-session-head">
                <h2 className="mas-admin-name">{c.name}</h2>
                <p className="mas-admin-meta">
                  <span className="mas-pill">{c.state}</span>
                  <span className={`mas-outcome ${recognised ? 'is-pass' : 'is-refer'}`}>
                    {STATUS_LABEL[c.status] ?? c.status}
                  </span>
                </p>
              </div>

              <div className="mas-form">
                <div className="mas-field">
                  <label className="mas-field-label" htmlFor={`email-${c.id}`}>Contact email</label>
                  <input
                    id={`email-${c.id}`}
                    className="mas-input"
                    type="email"
                    value={c.contact_email ?? ''}
                    onChange={(e) => edit(c.id, 'contact_email', e.target.value)}
                  />
                </div>
                <div className="mas-field">
                  <label className="mas-field-label" htmlFor={`phone-${c.id}`}>Contact phone</label>
                  <input
                    id={`phone-${c.id}`}
                    className="mas-input"
                    type="tel"
                    value={c.contact_phone ?? ''}
                    onChange={(e) => edit(c.id, 'contact_phone', e.target.value)}
                  />
                </div>
                <div className="mas-field">
                  <label className="mas-field-label" htmlFor={`addr-${c.id}`}>Address</label>
                  <input
                    id={`addr-${c.id}`}
                    className="mas-input"
                    type="text"
                    value={c.address ?? ''}
                    onChange={(e) => edit(c.id, 'address', e.target.value)}
                  />
                </div>

                {rowError[c.id] && (
                  <p className="mas-status mas-status-bad">{rowError[c.id]}</p>
                )}
                {savedId === c.id && <p className="mas-status mas-status-good">Saved.</p>}

                <div className="mas-form-actions">
                  <button
                    className="mas-btn-primary"
                    onClick={() => save(c)}
                    disabled={savingId === c.id}
                  >
                    {savingId === c.id ? 'Saving…' : 'Save contact details'}
                  </button>
                </div>
              </div>

              <header className="mas-page-head mas-section-head">
                <h3>Certificates from this centre ({list.length})</h3>
              </header>
              {list.length === 0 ? (
                <p className="mas-status">No certificates issued through this centre yet.</p>
              ) : (
                <ul className="mas-admin-list">
                  {list.map((cert) => (
                    <li key={cert.id} className="mas-admin-row">
                      <div className="mas-admin-main">
                        <h4 className="mas-admin-name">{cert.candidate_name_snapshot}</h4>
                        <p className="mas-admin-meta">
                          <span className="mas-pill">{prettyLevel(cert.level)}</span>
                          <span className="mas-admin-sub">Issued {cert.issued_on}</span>
                        </p>
                        <p className="mas-admin-line">
                          <span className="mas-serial">{cert.serial}</span> ·{' '}
                          <Link to={`/verify/${cert.serial}`}>verify</Link>
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
    </section>
  );
}
