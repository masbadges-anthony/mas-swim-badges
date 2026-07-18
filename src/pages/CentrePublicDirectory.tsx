// Partner centres — public directory admin.
// Governance staff review; FO + sysadmin edit public-facing fields;
// sysadmin + chairperson + chief_examiner set capability flags
// (can_teach / can_assess). Publication toggle lives here so a centre
// only appears on the public website when the FO has confirmed
// photos + details + contact are ready.
//
// Data flow: list_centres_admin (staff view), centre_upsert_public_fields
// (FO/sysadmin write), centre_set_capabilities (governance write).
// Photos land in the centre-photos bucket via the storage API.
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon';
import '../styles/admin.css';

type Load = 'loading' | 'ready' | 'error';

interface CentreRow {
  id: string;
  name: string;
  state: string;
  status: string;
  can_teach: boolean;
  can_assess: boolean;
  publish_to_public_site: boolean;
  address: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  google_maps_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  public_contact_email: string | null;
  public_contact_phone: string | null;
  contact_public: boolean;
  operating_hours_text: string | null;
  public_blurb: string | null;
  image_paths: string[];
  pool_length_m: number | null;
  pool_min_depth_m: number | null;
  pool_max_depth_m: number | null;
  pool_lane_count: number | null;
  pool_certified: boolean;
  pool_certifier: string | null;
  has_lifeguard_on_duty: boolean;
  has_eap: boolean;
  has_first_aid_aed: boolean;
  has_adequate_deck: boolean;
  recognized_at: string | null;
  valid_until: string | null;
}

const CSS = `
.mas-centre-page { max-width: none; }
.mas-centre-toolbar { display: flex; gap: 0.6rem; align-items: center; flex-wrap: wrap; margin-bottom: 1rem; }
.mas-centre-card {
  background: #fff; border: 1px solid var(--mas-line, #e3e9f3); border-radius: 10px;
  margin-bottom: 0.8rem; overflow: hidden;
}
.mas-centre-head {
  display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
  padding: 0.8rem 1rem; cursor: pointer; user-select: none;
}
.mas-centre-head:hover { background: #f8fafd; }
.mas-centre-head.is-open { background: #eef1f8; }
.mas-centre-title { font-weight: 600; color: var(--mas-navy, #1E2752); font-size: 1rem; }
.mas-centre-sub { color: var(--mas-muted, #5b6472); font-size: 0.82rem; }
.mas-centre-badges { display: flex; gap: 0.35rem; flex-wrap: wrap; }
.mas-badge {
  font-size: 0.7rem; padding: 0.15rem 0.55rem; border-radius: 999px;
  text-transform: uppercase; letter-spacing: 0.05em;
  border: 1px solid var(--mas-line,#e3e9f3); color: var(--mas-muted,#5b6472); background: #fff;
}
.mas-badge.is-teach { background: #eef1f8; color: var(--mas-navy,#1E2752); border-color: transparent; }
.mas-badge.is-assess { background: #fef4d9; color: #7a5b00; border-color: transparent; }
.mas-badge.is-published { background: #dff3e6; color: #0d5928; border-color: transparent; }
.mas-badge.is-status-recognized { background: #dff3e6; color: #0d5928; border-color: transparent; }
.mas-badge.is-status-pending    { background: #fef4d9; color: #7a5b00; border-color: transparent; }
.mas-badge.is-status-flagged, .mas-badge.is-status-suspended, .mas-badge.is-status-terminated {
  background: #f7e3e4; color: var(--mas-red,#C62026); border-color: transparent;
}
.mas-centre-body { padding: 1rem 1.2rem 1.2rem; border-top: 1px solid var(--mas-line,#e3e9f3); }
.mas-centre-section h3 {
  margin: 0.4rem 0 0.6rem; font-size: 0.85rem; color: var(--mas-navy,#1E2752);
  text-transform: uppercase; letter-spacing: 0.04em; border-bottom: 1px solid var(--mas-line,#e3e9f3);
  padding-bottom: 0.3rem;
}
.mas-centre-section { margin-bottom: 1rem; }
.mas-centre-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.5rem 0.7rem; }
.mas-centre-form label { display: flex; flex-direction: column; font-size: 0.78rem; color: var(--mas-muted,#5b6472); gap: 0.15rem; }
.mas-centre-form input, .mas-centre-form textarea, .mas-centre-form select {
  font: inherit; padding: 0.4rem 0.55rem; border: 1px solid var(--mas-line,#e3e9f3); border-radius: 6px;
}
.mas-centre-form textarea { resize: vertical; }
.mas-centre-form label.span2 { grid-column: span 2; }
.mas-centre-form label.span3 { grid-column: span 3; }

.mas-toggle-row {
  display: flex; align-items: center; gap: 0.6rem; padding: 0.5rem 0.7rem;
  background: #f8fafd; border-radius: 6px; margin-bottom: 0.4rem;
}
.mas-toggle-row label { display: flex; align-items: center; gap: 0.5rem; font-size: 0.88rem; cursor: pointer; color: var(--mas-navy,#1E2752); }
.mas-toggle-row .hint { color: var(--mas-muted,#5b6472); font-size: 0.78rem; margin-left: auto; }

.mas-gallery { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.mas-gallery .cell {
  position: relative; width: 6.5rem; height: 6.5rem;
  border: 1px solid var(--mas-line,#e3e9f3); border-radius: 8px; overflow: hidden;
}
.mas-gallery .cell.is-hero { outline: 2px solid var(--mas-gold,#F9C610); }
.mas-gallery .cell img { width: 100%; height: 100%; object-fit: cover; }
.mas-gallery .cell .badge-hero {
  position: absolute; top: 0.2rem; left: 0.2rem;
  background: var(--mas-gold,#F9C610); color: var(--mas-navy,#1E2752);
  font-size: 0.6rem; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 0.1rem 0.4rem; border-radius: 3px; font-weight: 600;
}
.mas-gallery .cell button {
  position: absolute; background: rgba(0,0,0,0.6); color: #fff; border: 0;
  width: 1.3rem; height: 1.3rem; border-radius: 999px; cursor: pointer;
  font-size: 0.8rem; line-height: 1; display: flex; align-items: center; justify-content: center;
}
.mas-gallery .cell .rm { top: 0.2rem; right: 0.2rem; }
.mas-gallery .cell .mkhero { bottom: 0.2rem; right: 0.2rem; background: rgba(30,39,82,0.85); }
.mas-gallery .addcell {
  display: flex; align-items: center; justify-content: center;
  border-style: dashed; color: var(--mas-muted,#5b6472); cursor: pointer;
  background: #fff;
}
.mas-gallery .addcell:hover { background: #eef1f8; }
.mas-gallery .addcell input { display: none; }

.mas-centre-footer { display: flex; gap: 0.5rem; align-items: center; margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px solid var(--mas-line,#e3e9f3); }
.mas-centre-footer .grow { flex: 1; }
`;

function toStr(v: unknown): string { return v == null ? '' : String(v); }
function toNumOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}
function pretty(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function imageUrl(path: string | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('centre-photos').getPublicUrl(path).data.publicUrl;
}

export default function CentrePublicDirectory() {
  const [rows, setRows] = useState<CentreRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');
  const [publishedOnly, setPublishedOnly] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ id?: string; ok: boolean; text: string } | null>(null);

  // Draft state per expanded centre (single at a time).
  const [draft, setDraft] = useState<Partial<CentreRow>>({});
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_centres_admin');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as CentreRow[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  function openCentre(c: CentreRow) {
    setDraft({ ...c });
    setExpanded(c.id);
    setMsg(null);
  }
  function closeCentre() {
    setExpanded(null);
    setDraft({});
  }

  function d<K extends keyof CentreRow>(k: K): CentreRow[K] | undefined { return draft[k]; }
  function setD<K extends keyof CentreRow>(k: K, v: CentreRow[K]) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }

  async function saveCentre() {
    if (!expanded) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('centre_upsert_public_fields', {
      _id: expanded,
      _address_line1: draft.address_line1 ?? null,
      _address_line2: draft.address_line2 ?? null,
      _city: draft.city ?? null,
      _postcode: draft.postcode ?? null,
      _google_maps_url: draft.google_maps_url ?? null,
      _public_contact_email: draft.public_contact_email ?? null,
      _public_contact_phone: draft.public_contact_phone ?? null,
      _contact_public: draft.contact_public ?? true,
      _operating_hours_text: draft.operating_hours_text ?? null,
      _public_blurb: draft.public_blurb ?? null,
      _image_paths: draft.image_paths ?? [],
      _publish_to_public_site: draft.publish_to_public_site ?? false,
      _pool_length_m: draft.pool_length_m ?? null,
      _pool_min_depth_m: draft.pool_min_depth_m ?? null,
      _pool_max_depth_m: draft.pool_max_depth_m ?? null,
      _pool_lane_count: draft.pool_lane_count ?? null,
      _pool_certified: draft.pool_certified ?? false,
      _pool_certifier: draft.pool_certifier ?? null,
      _has_lifeguard_on_duty: draft.has_lifeguard_on_duty ?? false,
      _has_eap: draft.has_eap ?? false,
      _has_first_aid_aed: draft.has_first_aid_aed ?? false,
      _has_adequate_deck: draft.has_adequate_deck ?? false,
    });
    setBusy(false);
    if (error) { setMsg({ id: expanded, ok: false, text: error.message }); return; }
    setMsg({ id: expanded, ok: true, text: 'Saved.' });
    fetchRows();
  }

  async function saveCapabilities() {
    if (!expanded) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('centre_set_capabilities', {
      _id: expanded,
      _can_teach: draft.can_teach ?? false,
      _can_assess: draft.can_assess ?? false,
    });
    setBusy(false);
    if (error) { setMsg({ id: expanded, ok: false, text: error.message }); return; }
    setMsg({ id: expanded, ok: true, text: 'Capabilities updated.' });
    fetchRows();
  }

  async function uploadPhoto(f: File) {
    if (!expanded) return;
    const current = draft.image_paths ?? [];
    if (current.length >= 5) {
      setMsg({ id: expanded, ok: false, text: 'Maximum 5 photos per centre.' });
      return;
    }
    setUploading(true);
    const clean = f.name.replace(/[^A-Za-z0-9._-]/g, '_');
    const path = `centres/${expanded}/${Date.now()}_${clean}`;
    const up = await supabase.storage.from('centre-photos').upload(path, f, { upsert: false });
    setUploading(false);
    if (up.error) { setMsg({ id: expanded, ok: false, text: up.error.message }); return; }
    setD('image_paths', [...current, path] as CentreRow['image_paths']);
  }
  async function removePhoto(path: string) {
    if (!expanded) return;
    setD('image_paths', (draft.image_paths ?? []).filter((p) => p !== path) as CentreRow['image_paths']);
    // best-effort object cleanup after save; skip immediate delete so undo is easy pre-save.
  }
  function makeHero(path: string) {
    const rest = (draft.image_paths ?? []).filter((p) => p !== path);
    setD('image_paths', [path, ...rest] as CentreRow['image_paths']);
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (publishedOnly && !r.publish_to_public_site) return false;
      if (!q) return true;
      return (r.name ?? '').toLowerCase().includes(q)
          || (r.city ?? '').toLowerCase().includes(q)
          || pretty(r.state).toLowerCase().includes(q);
    });
  }, [rows, query, publishedOnly]);

  return (
    <section className="mas-page mas-page-wide mas-centre-page">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Governance</p>
        <h1>Partner centres</h1>
        <p className="mas-lede">
          Curate the recognised centre register. Set what each centre is qualified for
          (teaching, assessment, or both), edit the details shown on the public directory,
          and control publication.
        </p>
      </header>

      <div className="mas-centre-toolbar">
        <button className="mas-btn-ghost" onClick={fetchRows} disabled={load === 'loading'}>Refresh</button>
        <input className="mas-input" type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, city, state" style={{ maxWidth: '20rem' }} />
        <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.85rem', color: 'var(--mas-muted,#5b6472)' }}>
          <input type="checkbox" checked={publishedOnly} onChange={(e) => setPublishedOnly(e.target.checked)} />
          Published only
        </label>
        {load === 'ready' && <span className="mas-admin-count">{filtered.length} shown</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error'   && <p className="mas-status mas-status-bad">Couldn’t load centres.</p>}
      {load === 'ready' && filtered.length === 0 && <p className="mas-status">No centres match.</p>}

      {load === 'ready' && filtered.map((c) => {
        const isOpen = expanded === c.id;
        const dr = isOpen ? draft : c;
        return (
          <Fragment key={c.id}>
            <div className="mas-centre-card">
              <div className={`mas-centre-head${isOpen ? ' is-open' : ''}`}
                onClick={() => (isOpen ? closeCentre() : openCentre(c))}>
                <div>
                  <div className="mas-centre-title">{c.name}</div>
                  <div className="mas-centre-sub">
                    {pretty(c.state)}{c.city ? ` · ${c.city}` : ''}
                  </div>
                </div>
                <div className="mas-centre-badges">
                  <span className={`mas-badge is-status-${c.status}`}>{pretty(c.status)}</span>
                  {c.can_teach && <span className="mas-badge is-teach">Teaching</span>}
                  {c.can_assess && <span className="mas-badge is-assess">Assessment</span>}
                  {c.publish_to_public_site && <span className="mas-badge is-published">Published</span>}
                </div>
              </div>

              {isOpen && (
                <div className="mas-centre-body">
                  {/* Capabilities */}
                  <div className="mas-centre-section">
                    <h3>Classification (governance)</h3>
                    <div className="mas-toggle-row">
                      <label>
                        <input type="checkbox" checked={!!dr.can_teach}
                          onChange={(e) => setD('can_teach', e.target.checked)} />
                        MAS BADGES syllabus taught here
                      </label>
                    </div>
                    <div className="mas-toggle-row">
                      <label>
                        <input type="checkbox" checked={!!dr.can_assess}
                          onChange={(e) => setD('can_assess', e.target.checked)} />
                        Fit for MAS BADGES assessment / examination here
                      </label>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.4rem' }}>
                      <button className="mas-btn-primary mas-btn-compact" onClick={saveCapabilities} disabled={busy}>
                        {busy ? 'Saving…' : 'Save classification'}
                      </button>
                      <span className="mas-cell-sub" style={{ alignSelf: 'center' }}>
                        Requires sysadmin, chairperson, or chief examiner.
                      </span>
                    </div>
                  </div>

                  {/* Publication */}
                  <div className="mas-centre-section">
                    <h3>Public directory</h3>
                    <div className="mas-toggle-row">
                      <label>
                        <input type="checkbox" checked={!!dr.publish_to_public_site}
                          onChange={(e) => setD('publish_to_public_site', e.target.checked)} />
                        Publish this centre on the MAS BADGES website
                      </label>
                      <span className="hint">Requires status &ldquo;recognized&rdquo;. Save at the bottom.</span>
                    </div>
                    <div className="mas-toggle-row">
                      <label>
                        <input type="checkbox" checked={dr.contact_public ?? true}
                          onChange={(e) => setD('contact_public', e.target.checked)} />
                        Show contact phone &amp; email on the public site
                      </label>
                    </div>
                  </div>

                  {/* Public details */}
                  <div className="mas-centre-section">
                    <h3>Public details</h3>
                    <div className="mas-centre-form">
                      <label className="span3">Short description (public blurb, max 500 chars)
                        <textarea rows={2} maxLength={500} value={toStr(dr.public_blurb)}
                          onChange={(e) => setD('public_blurb', e.target.value)} />
                      </label>
                      <label className="span2">Address line 1
                        <input type="text" value={toStr(dr.address_line1)}
                          onChange={(e) => setD('address_line1', e.target.value)} />
                      </label>
                      <label>Address line 2
                        <input type="text" value={toStr(dr.address_line2)}
                          onChange={(e) => setD('address_line2', e.target.value)} />
                      </label>
                      <label>City
                        <input type="text" value={toStr(dr.city)}
                          onChange={(e) => setD('city', e.target.value)} />
                      </label>
                      <label>Postcode
                        <input type="text" value={toStr(dr.postcode)}
                          onChange={(e) => setD('postcode', e.target.value)} />
                      </label>
                      <label>Google Maps URL
                        <input type="url" value={toStr(dr.google_maps_url)}
                          onChange={(e) => setD('google_maps_url', e.target.value)}
                          placeholder="https://maps.google.com/…" />
                      </label>
                      <label>Public phone
                        <input type="tel" value={toStr(dr.public_contact_phone)}
                          onChange={(e) => setD('public_contact_phone', e.target.value)} />
                      </label>
                      <label>Public email
                        <input type="email" value={toStr(dr.public_contact_email)}
                          onChange={(e) => setD('public_contact_email', e.target.value)} />
                      </label>
                      <label className="span3">Operating hours (free text — e.g. Mon–Fri 4–8pm, Sat–Sun 9am–5pm)
                        <input type="text" value={toStr(dr.operating_hours_text)}
                          onChange={(e) => setD('operating_hours_text', e.target.value)} />
                      </label>
                    </div>
                  </div>

                  {/* Photos */}
                  <div className="mas-centre-section">
                    <h3>Photos (max 5 · first is hero)</h3>
                    <div className="mas-gallery">
                      {(dr.image_paths ?? []).map((path, i) => {
                        const url = imageUrl(path);
                        return (
                          <div key={path} className={`cell${i === 0 ? ' is-hero' : ''}`}>
                            {url && <img src={url} alt="" />}
                            {i === 0 && <span className="badge-hero">Hero</span>}
                            <button className="rm" title="Remove" onClick={() => removePhoto(path)}>×</button>
                            {i !== 0 && <button className="mkhero" title="Make hero" onClick={() => makeHero(path)}>★</button>}
                          </div>
                        );
                      })}
                      {(dr.image_paths ?? []).length < 5 && (
                        <label className="cell addcell">
                          {uploading ? '…' : '+ Add'}
                          <input type="file" accept="image/*" disabled={uploading}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) uploadPhoto(f);
                              e.target.value = '';
                            }} />
                        </label>
                      )}
                    </div>
                  </div>

                  {/* Assessment fitness */}
                  <div className="mas-centre-section">
                    <h3>Fit-for-assessment criteria</h3>
                    <div className="mas-centre-form">
                      <label>Pool length (m)
                        <input type="number" step="0.1" value={toStr(dr.pool_length_m)}
                          onChange={(e) => setD('pool_length_m', toNumOrNull(e.target.value))} />
                      </label>
                      <label>Pool min depth (m)
                        <input type="number" step="0.1" value={toStr(dr.pool_min_depth_m)}
                          onChange={(e) => setD('pool_min_depth_m', toNumOrNull(e.target.value))} />
                      </label>
                      <label>Pool max depth (m)
                        <input type="number" step="0.1" value={toStr(dr.pool_max_depth_m)}
                          onChange={(e) => setD('pool_max_depth_m', toNumOrNull(e.target.value))} />
                      </label>
                      <label>Lane count
                        <input type="number" step="1" value={toStr(dr.pool_lane_count)}
                          onChange={(e) => setD('pool_lane_count', toNumOrNull(e.target.value) as number | null)} />
                      </label>
                      <label className="span2">Pool certifier (if applicable)
                        <input type="text" value={toStr(dr.pool_certifier)}
                          onChange={(e) => setD('pool_certifier', e.target.value)}
                          placeholder="e.g. MOH, Local Council — placeholder" />
                      </label>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(15rem, 1fr))', gap: '0.4rem', marginTop: '0.6rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', color: 'var(--mas-navy,#1E2752)' }}>
                        <input type="checkbox" checked={!!dr.pool_certified}
                          onChange={(e) => setD('pool_certified', e.target.checked)} />
                        Pool certified (placeholder)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', color: 'var(--mas-navy,#1E2752)' }}>
                        <input type="checkbox" checked={!!dr.has_lifeguard_on_duty}
                          onChange={(e) => setD('has_lifeguard_on_duty', e.target.checked)} />
                        Lifeguard on duty during assessments
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', color: 'var(--mas-navy,#1E2752)' }}>
                        <input type="checkbox" checked={!!dr.has_eap}
                          onChange={(e) => setD('has_eap', e.target.checked)} />
                        Emergency Action Plan documented
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', color: 'var(--mas-navy,#1E2752)' }}>
                        <input type="checkbox" checked={!!dr.has_first_aid_aed}
                          onChange={(e) => setD('has_first_aid_aed', e.target.checked)} />
                        First aid + AED on site
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.88rem', color: 'var(--mas-navy,#1E2752)' }}>
                        <input type="checkbox" checked={!!dr.has_adequate_deck}
                          onChange={(e) => setD('has_adequate_deck', e.target.checked)} />
                        Adequate deck space for candidate marshalling
                      </label>
                    </div>
                  </div>

                  {/* Footer: save the public/pool block */}
                  <div className="mas-centre-footer">
                    {msg && msg.id === c.id && (
                      <span className={`mas-status ${msg.ok ? 'mas-status-good' : 'mas-status-bad'}`} style={{ margin: 0 }}>
                        {msg.text}
                      </span>
                    )}
                    <span className="grow" />
                    <button className="mas-btn-ghost mas-btn-compact" onClick={closeCentre}>Close</button>
                    <button className="mas-btn-primary mas-btn-compact" onClick={saveCentre} disabled={busy}>
                      {busy ? 'Saving…' : 'Save public details & pool spec'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Fragment>
        );
      })}
    </section>
  );
}
