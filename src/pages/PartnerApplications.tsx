import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface App {
  id: string;
  partner_center_id: string;
  centre_name: string;
  state: string;
  poc_name: string | null;
  poc_email: string;
  poc_phone: string | null;
  submitted_by: string | null;
  status: string;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
}
interface Attention { id: string; name: string; state: string; status: string; flagged_at: string; }

const STAT: Record<string, { label: string; cls: string }> = {
  submitted: { label: 'New', cls: 'is-warning' },
  pending:   { label: 'In review', cls: 'is-info' },
  approved:  { label: 'Approved', cls: 'is-success' },
  denied:    { label: 'Denied', cls: 'is-danger' },
  archived:  { label: 'Archived', cls: '' },
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return iso; }
}

export default function PartnerApplications() {
  const [apps, setApps] = useState<App[]>([]);
  const [attention, setAttention] = useState<Attention[]>([]);
  const [includeDecided, setIncludeDecided] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [a, n] = await Promise.all([
      supabase.rpc('list_partner_applications', { _include_decided: includeDecided }),
      supabase.rpc('list_centres_needing_attention'),
    ]);
    setApps((a.data ?? []) as App[]);
    setAttention((n.data ?? []) as Attention[]);
    setLoading(false);
  }, [includeDecided]);

  useEffect(() => { load(); }, [load]);

  async function acknowledge(id: string) {
    setBusyId(id);
    await supabase.rpc('acknowledge_partner_application', { _app_id: id });
    setBusyId(null); load();
  }
  async function decide(id: string, approve: boolean) {
    setBusyId(id);
    await supabase.rpc('decide_partner_application', { _app_id: id, _approve: approve, _note: notes[id] ?? null });
    setBusyId(null); load();
  }

  const newCount = apps.filter((a) => a.status === 'submitted').length;

  return (
    <section className="mas-page">
      <header className="mas-page-head mas-page-head-row">
        <div>
          <p className="mas-eyebrow">Partner centres</p>
          <h1>Centre applications</h1>
          <p className="mas-lede">
            Centre registrations submitted by appointed instructors. Acknowledge to
            start handling, then approve or deny. Approval is the decision only —
            billing and verified payment recognise and list the centre.
          </p>
        </div>
        <div className="mas-page-actions">
          <button className="mas-btn-ghost" onClick={() => setIncludeDecided((v) => !v)}>
            {includeDecided ? 'Hide decided' : 'Show decided'}
          </button>
        </div>
      </header>

      {attention.length > 0 && (
        <div className="mas-alert is-danger">
          <div className="mas-alert-body">
            <p className="mas-alert-title">{attention.length} centre{attention.length === 1 ? '' : 's'} without an active instructor</p>
            <p className="mas-alert-text">
              {attention.map((c) => `${c.name} (${c.state})`).join(' · ')}.
              These need a centre-appointed instructor to stay legitimate — follow up before renewal.
            </p>
          </div>
        </div>
      )}

      {newCount > 0 && (
        <div className="mas-alert is-warning">
          <div className="mas-alert-body">
            <p className="mas-alert-title">{newCount} new application{newCount === 1 ? '' : 's'}</p>
            <p className="mas-alert-text">Acknowledge each once you’ve picked it up.</p>
          </div>
        </div>
      )}

      {loading && <p className="mas-status">Loading…</p>}
      {!loading && apps.length === 0 && <p className="mas-status">No applications right now.</p>}

      {!loading && apps.map((a) => (
        <div key={a.id} className="mas-form" style={{ marginBottom: '0.9rem' }}>
          <div className="mas-form-cardhead">
            <div>
              <span className={`mas-badge ${STAT[a.status]?.cls ?? ''}`}>{STAT[a.status]?.label ?? a.status}</span>
              <h2 style={{ marginTop: '0.5rem' }}>{a.centre_name}</h2>
            </div>
            <span className="mas-field-opt">{fmt(a.created_at)}</span>
          </div>

          <div className="mas-form-grid">
            <div className="mas-field">
              <span className="mas-field-label">State</span><div>{a.state}</div>
              <span className="mas-field-label" style={{ marginTop: '0.5rem' }}>Appointed instructor</span>
              <div>{a.submitted_by ?? '—'}</div>
            </div>
            <div className="mas-field">
              <span className="mas-field-label">Point of communication</span>
              <div>{a.poc_name ?? '—'}</div>
              <a className="mas-link" href={`mailto:${a.poc_email}`}>{a.poc_email}</a>
              {a.poc_phone && <div className="mas-field-note">{a.poc_phone}</div>}
            </div>
          </div>

          {a.decision_note && <p className="mas-field-note" style={{ marginTop: '0.5rem' }}>Note: {a.decision_note}</p>}

          {(a.status === 'submitted' || a.status === 'pending') && (
            <div style={{ marginTop: '1rem' }}>
              <input className="mas-input" placeholder="Optional decision note…" value={notes[a.id] ?? ''}
                onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))} style={{ marginBottom: '0.6rem' }} />
              <div className="mas-form-actions" style={{ gap: '0.6rem' }}>
                {a.status === 'submitted' && (
                  <button className="mas-btn-ghost" disabled={busyId === a.id} onClick={() => acknowledge(a.id)}>Acknowledge</button>
                )}
                <button className="mas-btn-success" disabled={busyId === a.id} onClick={() => decide(a.id, true)}>
                  {busyId === a.id ? 'Saving…' : 'Approve'}
                </button>
                <button className="mas-btn-danger" disabled={busyId === a.id} onClick={() => decide(a.id, false)}>Deny</button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
