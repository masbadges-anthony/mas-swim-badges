import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

// Full partner_centers row for the admin list (not the curated public
// directory view). Kept local for now; can graduate to lib/types.ts when other
// admin modules need the same shape.
interface PendingCentre {
  id: string;
  name: string;
  state: string;
  status: string;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  created_at: string;
}

type Load = 'loading' | 'ready' | 'error';

// recognized_at is a DATE column. The chairperson's local calendar date is the
// correct semantic for "recognition granted today" — toISOString() alone is UTC
// and could roll a day near midnight in UTC+8.
function todayLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function formatDate(d: string | null): string {
  if (!d) return '';
  const date = new Date(d);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
}

export default function CentreRecognition() {
  const [centres, setCentres] = useState<PendingCentre[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [justRecognised, setJustRecognised] = useState<string | null>(null);

  const fetchPending = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase
      .from('partner_centers')
      .select(
        'id, name, state, status, contact_email, contact_phone, address, created_at',
      )
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      setLoad('error');
      return;
    }
    setCentres((data ?? []) as PendingCentre[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  async function recognise(centre: PendingCentre) {
    setBusyId(centre.id);
    setRowError((m) => {
      const next = { ...m };
      delete next[centre.id];
      return next;
    });

    const { error } = await supabase
      .from('partner_centers')
      .update({ status: 'recognized', recognized_at: todayLocal() })
      .eq('id', centre.id)
      .eq('status', 'pending'); // guard: only ever transition out of pending

    setBusyId(null);

    if (error) {
      setRowError((m) => ({ ...m, [centre.id]: error.message }));
      return;
    }

    // It leaves the pending list and surfaces in the public directory
    // automatically (the directory view shows status = 'recognized').
    setCentres((list) => list.filter((c) => c.id !== centre.id));
    setJustRecognised(centre.name);
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Chairperson</p>
        <h1>Centre recognition</h1>
        <p className="mas-lede">
          Swim centres awaiting recognition. Recognising a centre publishes it to
          the public directory immediately.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button
          className="mas-btn-ghost"
          onClick={fetchPending}
          disabled={load === 'loading'}
        >
          Refresh
        </button>
        {load === 'ready' && (
          <span className="mas-admin-count">{centres.length} pending</span>
        )}
      </div>

      {justRecognised && (
        <p className="mas-status mas-status-good" role="status">
          “{justRecognised}” is now recognised and live in the directory.
        </p>
      )}

      {load === 'loading' && <p className="mas-status">Loading centres…</p>}

      {load === 'error' && (
        <p className="mas-status mas-status-bad">
          Couldn’t load pending centres. Refresh to try again.
        </p>
      )}

      {load === 'ready' && centres.length === 0 && (
        <p className="mas-status">No centres are awaiting recognition.</p>
      )}

      {load === 'ready' && centres.length > 0 && (
        <ul className="mas-admin-list">
          {centres.map((c) => (
            <li key={c.id} className="mas-admin-row">
              <div className="mas-admin-main">
                <h2 className="mas-admin-name">{c.name}</h2>
                <p className="mas-admin-meta">
                  <span className="mas-pill">{c.state}</span>
                  <span className="mas-admin-sub">
                    Applied {formatDate(c.created_at)}
                  </span>
                </p>
                {c.address && <p className="mas-admin-line">{c.address}</p>}
                <div className="mas-admin-contact">
                  {c.contact_phone && <span>{c.contact_phone}</span>}
                  {c.contact_email && (
                    <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a>
                  )}
                </div>
                {rowError[c.id] && (
                  <p className="mas-status mas-status-bad mas-admin-rowerror">
                    Couldn’t recognise this centre: {rowError[c.id]}
                  </p>
                )}
              </div>
              <div className="mas-admin-action">
                <button
                  className="mas-btn-primary"
                  onClick={() => recognise(c)}
                  disabled={busyId === c.id}
                >
                  {busyId === c.id ? 'Recognising…' : 'Recognise'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
