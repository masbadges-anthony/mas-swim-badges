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

const STATUS_ORDER = ['pending', 'recognized', 'suspended', 'removed'];
const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  recognized: 'Recognised',
  suspended: 'Suspended',
  removed: 'Removed',
};

function todayLocal(): string {
  const d = new Date();
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

// Actions available from each status, as label → patch to apply.
function actionsFor(status: string): { label: string; patch: Record<string, unknown> }[] {
  switch (status) {
    case 'pending':
      return [
        { label: 'Recognise', patch: { status: 'recognized', recognized_at: todayLocal() } },
        { label: 'Remove', patch: { status: 'removed' } },
      ];
    case 'recognized':
      return [
        { label: 'Suspend', patch: { status: 'suspended' } },
        { label: 'Remove', patch: { status: 'removed' } },
      ];
    case 'suspended':
      return [
        { label: 'Restore', patch: { status: 'recognized' } },
        { label: 'Remove', patch: { status: 'removed' } },
      ];
    case 'removed':
      return [{ label: 'Reopen', patch: { status: 'pending' } }];
    default:
      return [];
  }
}

export default function CentreManagement() {
  const [centres, setCentres] = useState<Centre[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const fetchAll = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase
      .from('partner_centers')
      .select('id, name, state, status, recognized_at, contact_email, contact_phone')
      .order('name');
    if (error) {
      setLoad('error');
      return;
    }
    setCentres((data ?? []) as Centre[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const grouped = useMemo(() => {
    const map: Record<string, Centre[]> = {};
    for (const c of centres) (map[c.status] ??= []).push(c);
    return STATUS_ORDER.filter((s) => map[s]?.length).map((s) => ({
      status: s,
      items: map[s],
    }));
  }, [centres]);

  async function apply(c: Centre, patch: Record<string, unknown>) {
    setBusyId(c.id);
    setRowError((m) => {
      const n = { ...m };
      delete n[c.id];
      return n;
    });

    const { data, error } = await supabase
      .from('partner_centers')
      .update(patch)
      .eq('id', c.id)
      .select('id, name, state, status, recognized_at, contact_email, contact_phone')
      .single();

    setBusyId(null);
    if (error) {
      setRowError((m) => ({ ...m, [c.id]: error.message }));
      return;
    }
    setCentres((list) => list.map((x) => (x.id === c.id ? (data as Centre) : x)));
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Governance</p>
        <h1>Manage centres</h1>
        <p className="mas-lede">
          Every partner centre and its recognition status. Only recognised
          centres appear in the public directory.
        </p>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchAll} disabled={load === 'loading'}>
          Refresh
        </button>
        {load === 'ready' && (
          <span className="mas-admin-count">{centres.length} total</span>
        )}
      </div>

      {load === 'loading' && <p className="mas-status">Loading centres…</p>}
      {load === 'error' && (
        <p className="mas-status mas-status-bad">Couldn’t load centres. Refresh to try again.</p>
      )}
      {load === 'ready' && centres.length === 0 && (
        <p className="mas-status">No centres registered yet.</p>
      )}

      {load === 'ready' &&
        grouped.map((g) => (
          <div key={g.status} className="mas-grade-session">
            <div className="mas-grade-session-head">
              <h2 className="mas-admin-name">
                {STATUS_LABEL[g.status] ?? g.status} ({g.items.length})
              </h2>
            </div>
            <ul className="mas-admin-list">
              {g.items.map((c) => (
                <li key={c.id} className="mas-admin-row">
                  <div className="mas-admin-main">
                    <h3 className="mas-admin-name">{c.name}</h3>
                    <p className="mas-admin-meta">
                      <span className="mas-pill">{c.state}</span>
                      {c.recognized_at && (
                        <span className="mas-admin-sub">
                          Recognised {c.recognized_at}
                        </span>
                      )}
                    </p>
                    <div className="mas-admin-contact">
                      {c.contact_phone && <span>{c.contact_phone}</span>}
                      {c.contact_email && (
                        <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a>
                      )}
                    </div>
                    {rowError[c.id] && (
                      <p className="mas-status mas-status-bad mas-admin-rowerror">
                        {rowError[c.id]}
                      </p>
                    )}
                  </div>
                  <div className="mas-admin-action mas-grade-actions">
                    {actionsFor(c.status).map((a, i) => (
                      <button
                        key={a.label}
                        className={i === 0 ? 'mas-btn-primary' : 'mas-btn-ghost'}
                        onClick={() => apply(c, a.patch)}
                        disabled={busyId === c.id}
                      >
                        {busyId === c.id ? '…' : a.label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
    </section>
  );
}
