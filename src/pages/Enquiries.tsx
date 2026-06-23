import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

type Status = 'new' | 'acknowledged' | 'closed' | 'archived';
type Category = 'centre_partnership' | 'instructor_registration' | 'parent_swimmer' | 'general';

interface Enquiry {
  id: string;
  category: Category;
  contact_name: string;
  contact_email: string;
  contact_phone: string | null;
  organisation: string | null;
  state: string | null;
  instructor_ref: string | null;
  affiliated_centre: string | null;
  message: string;
  status: Status;
  assigned_role: string | null;
  handled_at: string | null;
  internal_note: string | null;
  created_at: string;
}

const CAT: Record<Category, { label: string; cls: string }> = {
  centre_partnership:      { label: 'Centre', cls: 'is-primary' },
  instructor_registration: { label: 'Instructor', cls: 'is-purple' },
  parent_swimmer:          { label: 'Parent', cls: 'is-info' },
  general:                 { label: 'General', cls: '' },
};
const STAT: Record<Status, { label: string; cls: string }> = {
  new:          { label: 'New', cls: 'is-warning' },
  acknowledged: { label: 'Acknowledged', cls: 'is-info' },
  closed:       { label: 'Closed', cls: 'is-success' },
  archived:     { label: 'Archived', cls: '' },
};

const FILTERS: { key: Status | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'acknowledged', label: 'In progress' },
  { key: 'closed', label: 'Closed' },
];

function fmt(iso: string): string {
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

export default function Enquiries() {
  const [rows, setRows] = useState<Enquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [filter, setFilter] = useState<Status | 'all'>('all');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('list_enquiries', { _include_archived: showArchived });
    setRows((data ?? []) as Enquiry[]);
    setLoading(false);
  }, [showArchived]);

  useEffect(() => { load(); }, [load]);

  async function act(id: string, status: Status) {
    setBusyId(id);
    await supabase.rpc('set_enquiry_status', { _id: id, _status: status, _note: notes[id] ?? null });
    setBusyId(null);
    load();
  }

  const newCount = rows.filter((r) => r.status === 'new').length;
  const visible = filter === 'all' ? rows : rows.filter((r) => r.status === filter);

  return (
    <section className="mas-page">
      <header className="mas-page-head mas-page-head-row">
        <div>
          <p className="mas-eyebrow">Inbox</p>
          <h1>Enquiries</h1>
          <p className="mas-lede">
            First-contact enquiries routed to you. Reply by email, then acknowledge,
            close, or archive each one here. Archived enquiries have no further effect.
          </p>
        </div>
        <div className="mas-page-actions">
          <button className="mas-btn-ghost" onClick={() => setShowArchived((v) => !v)}>
            {showArchived ? 'Hide archived' : 'Show archived'}
          </button>
        </div>
      </header>

      {newCount > 0 && (
        <div className="mas-alert is-warning">
          <div className="mas-alert-body">
            <p className="mas-alert-title">{newCount} new {newCount === 1 ? 'enquiry' : 'enquiries'}</p>
            <p className="mas-alert-text">Acknowledge each once you’ve picked it up so the team knows it’s being handled.</p>
          </div>
        </div>
      )}

      <div className="mas-segmented" style={{ marginBottom: '1.25rem' }}>
        {FILTERS.map((f) => (
          <button key={f.key} type="button" className={filter === f.key ? 'is-active' : ''} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>

      {loading && <p className="mas-status">Loading…</p>}
      {!loading && visible.length === 0 && <p className="mas-status">Nothing here right now.</p>}

      {!loading && visible.map((e) => (
        <div key={e.id} className="mas-form" style={{ marginBottom: '0.9rem' }}>
          <div className="mas-form-cardhead">
            <div>
              <span className={`mas-badge ${CAT[e.category].cls}`}>{CAT[e.category].label}</span>{' '}
              <span className={`mas-badge ${STAT[e.status].cls}`}>{STAT[e.status].label}</span>
              <h2 style={{ marginTop: '0.5rem' }}>{e.organisation || e.contact_name}</h2>
            </div>
            <span className="mas-field-opt">{fmt(e.created_at)}</span>
          </div>

          <div className="mas-form-grid">
            <div className="mas-field">
              <span className="mas-field-label">Contact</span>
              <div>{e.contact_name}</div>
              <a className="mas-link" href={`mailto:${e.contact_email}`}>{e.contact_email}</a>
              {e.contact_phone && <div className="mas-field-note">{e.contact_phone}</div>}
            </div>
            <div className="mas-field">
              {e.state && (<><span className="mas-field-label">State</span><div>{e.state}</div></>)}
              {e.instructor_ref && (<><span className="mas-field-label" style={{ marginTop: '0.5rem' }}>Instructor ID</span><div className="mas-mono">{e.instructor_ref}</div></>)}
              {e.affiliated_centre && (<div className="mas-field-note">Teaches at: {e.affiliated_centre}</div>)}
            </div>
            <div className="mas-field mas-col-2">
              <span className="mas-field-label">Message</span>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{e.message}</p>
            </div>
          </div>

          {e.internal_note && (
            <p className="mas-field-note" style={{ marginTop: '0.5rem' }}>Internal note: {e.internal_note}</p>
          )}

          {e.status !== 'archived' && (
            <div style={{ marginTop: '1rem' }}>
              <input
                className="mas-input"
                placeholder="Optional internal note…"
                value={notes[e.id] ?? ''}
                onChange={(ev) => setNotes((n) => ({ ...n, [e.id]: ev.target.value }))}
                style={{ marginBottom: '0.6rem' }}
              />
              <div className="mas-form-actions" style={{ gap: '0.6rem' }}>
                {e.status === 'new' && (
                  <button className="mas-btn-primary" disabled={busyId === e.id} onClick={() => act(e.id, 'acknowledged')}>
                    {busyId === e.id ? 'Saving…' : 'Acknowledge'}
                  </button>
                )}
                {e.status === 'acknowledged' && (
                  <button className="mas-btn-success" disabled={busyId === e.id} onClick={() => act(e.id, 'closed')}>
                    {busyId === e.id ? 'Saving…' : 'Mark closed'}
                  </button>
                )}
                <button className="mas-btn-ghost" disabled={busyId === e.id} onClick={() => act(e.id, 'archived')}>
                  Archive
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
