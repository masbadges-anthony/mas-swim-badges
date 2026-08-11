// Partner Application — applicant fill-in form.
// After a centre_partnership enquiry has been converted by the chairperson/
// board, the applicant lands here (typically via an email link) to fill in
// the detailed proposed_* fields the reviewer needs to make the recognition
// decision.
//
// Data flow:
//   list_my_partner_application()       reads the application row for
//                                       the signed-in applicant (there is
//                                       typically only one active per
//                                       applicant at any time).
//   submit_partner_application_details  writes the proposed_* fields and
//                                       moves status from 'submitted' to
//                                       'pending' so reviewers see it.
//
// Photo uploads go to the centre-photos bucket under
// applications/<application_id>/... — the same bucket used by the admin
// screen. Max 5.
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface MyApplication {
  id: string;
  partner_center_id: string;
  centre_name: string;
  state: string;
  status: string;
  requested_can_teach: boolean;
  requested_can_assess: boolean;
  proposed_public_blurb: string | null;
  proposed_address_line1: string | null;
  proposed_address_line2: string | null;
  proposed_city: string | null;
  proposed_postcode: string | null;
  proposed_google_maps_url: string | null;
  proposed_public_email: string | null;
  proposed_public_phone: string | null;
  proposed_hours_text: string | null;
  proposed_image_paths: string[];
  proposed_pool_length_m: number | null;
  proposed_pool_min_depth_m: number | null;
  proposed_pool_max_depth_m: number | null;
  proposed_pool_lane_count: number | null;
  proposed_pool_certified: boolean;
  proposed_pool_certifier: string | null;
  proposed_has_lifeguard: boolean;
  proposed_has_eap: boolean;
  proposed_has_first_aid_aed: boolean;
  proposed_has_adequate_deck: boolean;
}

type Load = 'loading' | 'ready' | 'error' | 'none';

function pretty(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function toStr(v: unknown): string { return v == null ? '' : String(v); }
function toNumOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}
function imageUrl(path: string | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from('centre-photos').getPublicUrl(path).data.publicUrl;
}

const CSS = `
.mas-app-page { max-width: 820px; margin: 0 auto; }
.mas-app-status {
  padding: 0.8rem 1rem; border-radius: 8px; margin-bottom: 1.2rem;
  font-size: 0.9rem;
}
.mas-app-status.is-submitted { background: #fef4d9; color: #7a5b00; }
.mas-app-status.is-pending   { background: #dff3e6; color: #0d5928; }
.mas-app-status.is-approved  { background: #dff3e6; color: #0d5928; }
.mas-app-status.is-denied    { background: #f7e3e4; color: var(--mas-red, #C62026); }

.mas-app-section {
  background: #fff; border: 1px solid var(--mas-line, #e3e9f3); border-radius: 10px;
  padding: 1.2rem 1.4rem; margin-bottom: 1rem;
}
.mas-app-section h2 {
  font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--mas-navy, #1E2752); margin: 0 0 0.5rem;
  border-bottom: 1px solid var(--mas-line, #e3e9f3); padding-bottom: 0.5rem;
}
.mas-app-section p.help {
  color: var(--mas-muted, #5b6472); font-size: 0.85rem;
  margin: 0 0 0.9rem; line-height: 1.5;
}
.mas-app-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr)); gap: 0.6rem 0.8rem; }
.mas-app-form label { display: flex; flex-direction: column; font-size: 0.78rem; color: var(--mas-muted, #5b6472); gap: 0.15rem; }
.mas-app-form input, .mas-app-form textarea, .mas-app-form select {
  font: inherit; padding: 0.45rem 0.6rem; border: 1px solid var(--mas-line, #e3e9f3); border-radius: 6px;
}
.mas-app-form textarea { resize: vertical; }
.mas-app-form label.span2 { grid-column: span 2; }
.mas-app-form label.span3 { grid-column: span 3; }

.mas-toggle-line {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.7rem; background: #f8fafd; border-radius: 6px; margin-bottom: 0.4rem;
  cursor: pointer; font-size: 0.9rem; color: var(--mas-navy, #1E2752);
}
.mas-toggle-line input { margin: 0; }

.mas-gallery { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.mas-gallery .cell {
  position: relative; width: 6.5rem; height: 6.5rem;
  border: 1px solid var(--mas-line, #e3e9f3); border-radius: 8px; overflow: hidden;
}
.mas-gallery .cell.is-hero { outline: 2px solid var(--mas-gold, #F9C610); }
.mas-gallery .cell img { width: 100%; height: 100%; object-fit: cover; }
.mas-gallery .cell .badge-hero {
  position: absolute; top: 0.2rem; left: 0.2rem;
  background: var(--mas-gold, #F9C610); color: var(--mas-navy, #1E2752);
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
  border-style: dashed; color: var(--mas-muted, #5b6472); cursor: pointer; background: #fff;
}
.mas-gallery .addcell:hover { background: #eef1f8; }
.mas-gallery .addcell input { display: none; }

.mas-app-footer {
  display: flex; gap: 0.5rem; align-items: center; margin-top: 0.6rem;
  padding-top: 0.8rem; border-top: 1px solid var(--mas-line, #e3e9f3);
}
.mas-app-footer .grow { flex: 1; }
`;

export default function PartnerApplicationForm() {
  const [app, setApp] = useState<MyApplication | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [draft, setDraft] = useState<Partial<MyApplication>>({});
  function set<K extends keyof MyApplication>(k: K, v: MyApplication[K]) {
    setDraft((prev) => ({ ...prev, [k]: v }));
  }
  function d<K extends keyof MyApplication>(k: K): MyApplication[K] | undefined { return draft[k]; }

  const fetchApp = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_my_partner_application');
    if (error) { setLoad('error'); return; }
    const rows = (data ?? []) as MyApplication[];
    if (rows.length === 0) { setLoad('none'); return; }
    const a = rows[0];
    setApp(a);
    setDraft({ ...a });
    setLoad('ready');
  }, []);
  useEffect(() => { fetchApp(); }, [fetchApp]);

  async function save() {
    if (!app) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('submit_partner_application_details', {
      _app_id: app.id,
      _requested_can_teach: draft.requested_can_teach ?? true,
      _requested_can_assess: draft.requested_can_assess ?? false,
      _proposed_public_blurb: draft.proposed_public_blurb ?? null,
      _proposed_address_line1: draft.proposed_address_line1 ?? null,
      _proposed_address_line2: draft.proposed_address_line2 ?? null,
      _proposed_city: draft.proposed_city ?? null,
      _proposed_postcode: draft.proposed_postcode ?? null,
      _proposed_google_maps_url: draft.proposed_google_maps_url ?? null,
      _proposed_public_email: draft.proposed_public_email ?? null,
      _proposed_public_phone: draft.proposed_public_phone ?? null,
      _proposed_hours_text: draft.proposed_hours_text ?? null,
      _proposed_image_paths: draft.proposed_image_paths ?? [],
      _proposed_pool_length_m: draft.proposed_pool_length_m ?? null,
      _proposed_pool_min_depth_m: draft.proposed_pool_min_depth_m ?? null,
      _proposed_pool_max_depth_m: draft.proposed_pool_max_depth_m ?? null,
      _proposed_pool_lane_count: draft.proposed_pool_lane_count ?? null,
      _proposed_pool_certified: draft.proposed_pool_certified ?? false,
      _proposed_pool_certifier: draft.proposed_pool_certifier ?? null,
      _proposed_has_lifeguard: draft.proposed_has_lifeguard ?? false,
      _proposed_has_eap: draft.proposed_has_eap ?? false,
      _proposed_has_first_aid_aed: draft.proposed_has_first_aid_aed ?? false,
      _proposed_has_adequate_deck: draft.proposed_has_adequate_deck ?? false,
    });
    setBusy(false);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Saved. Your application is now with the review team.' });
    fetchApp();
  }

  async function uploadPhoto(f: File) {
    if (!app) return;
    const current = draft.proposed_image_paths ?? [];
    if (current.length >= 5) {
      setMsg({ ok: false, text: 'Maximum 5 photos.' });
      return;
    }
    setUploading(true);
    const clean = f.name.replace(/[^A-Za-z0-9._-]/g, '_');
    const path = `applications/${app.id}/${Date.now()}_${clean}`;
    const up = await supabase.storage.from('centre-photos').upload(path, f, { upsert: false });
    setUploading(false);
    if (up.error) { setMsg({ ok: false, text: up.error.message }); return; }
    set('proposed_image_paths', [...current, path] as MyApplication['proposed_image_paths']);
  }
  function removePhoto(path: string) {
    set('proposed_image_paths', (draft.proposed_image_paths ?? []).filter((p) => p !== path) as MyApplication['proposed_image_paths']);
  }
  function makeHero(path: string) {
    const rest = (draft.proposed_image_paths ?? []).filter((p) => p !== path);
    set('proposed_image_paths', [path, ...rest] as MyApplication['proposed_image_paths']);
  }

  if (load === 'loading') {
    return (
      <section className="mas-page mas-app-page">
        <style>{CSS}</style>
        <p className="mas-status">Loading your application…</p>
      </section>
    );
  }
  if (load === 'error') {
    return (
      <section className="mas-page mas-app-page">
        <style>{CSS}</style>
        <p className="mas-status mas-status-bad">Couldn&rsquo;t load your application. Please refresh.</p>
      </section>
    );
  }
  if (load === 'none') {
    return (
      <section className="mas-page mas-app-page">
        <style>{CSS}</style>
        <header className="mas-page-head">
          <p className="mas-eyebrow">Partner application</p>
          <h1>No application in progress</h1>
          <p className="mas-lede">
            You don&rsquo;t have a partner-centre application waiting to be completed.
            If you submitted an enquiry via <a href="/apply-partner-centre">the application page</a>,
            we&rsquo;ll email you a link once it&rsquo;s been converted into a formal
            application by the review team.
          </p>
        </header>
      </section>
    );
  }
  if (!app) return null;

  const readOnly = app.status === 'approved' || app.status === 'denied' || app.status === 'archived';

  return (
    <section className="mas-page mas-app-page">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Partner application</p>
        <h1>{app.centre_name}</h1>
        <p className="mas-lede">
          Complete these details so the MAS BADGES review team has everything
          needed to make a decision on your centre&rsquo;s recognition.
        </p>
      </header>

      <div className={`mas-app-status is-${app.status}`}>
        <strong>Status:</strong> {pretty(app.status)}
        {app.status === 'submitted' && ' — please fill in the details below so the review team can consider your application.'}
        {app.status === 'pending' && ' — your application is with the review team.'}
        {app.status === 'approved' && ' — your application has been approved. Welcome to the MAS BADGES partner network.'}
        {app.status === 'denied' && ' — your application was not approved at this time.'}
      </div>

      {msg && (
        <div className={`mas-app-status ${msg.ok ? 'is-approved' : 'is-denied'}`}>{msg.text}</div>
      )}

      {/* Classification requested */}
      <div className="mas-app-section">
        <h2>What are you applying for?</h2>
        <p className="help">
          You may request one or both. The review team confirms what your centre is
          recognised for; assessment recognition requires a review of your pool and
          safety arrangements.
        </p>
        <label className="mas-toggle-line">
          <input type="checkbox" checked={draft.requested_can_teach ?? true} disabled={readOnly}
            onChange={(e) => set('requested_can_teach', e.target.checked)} />
          We want to be recognised for <strong>&nbsp;teaching the MAS BADGES syllabus</strong>
        </label>
        <label className="mas-toggle-line">
          <input type="checkbox" checked={draft.requested_can_assess ?? false} disabled={readOnly}
            onChange={(e) => set('requested_can_assess', e.target.checked)} />
          We want to be recognised as a <strong>&nbsp;venue fit for MAS BADGES assessments</strong>
        </label>
      </div>

      {/* Public directory details */}
      <div className="mas-app-section">
        <h2>Public directory listing</h2>
        <p className="help">
          If approved, we can list your centre on the public MAS BADGES directory at
          www.masbadges.org so families can find you. These details appear on your listing.
        </p>
        <div className="mas-app-form">
          <label className="span3">About your centre (max 500 characters)
            <textarea rows={3} maxLength={500} value={toStr(d('proposed_public_blurb'))} disabled={readOnly}
              onChange={(e) => set('proposed_public_blurb', e.target.value)} />
          </label>
          <label className="span2">Address line 1
            <input type="text" value={toStr(d('proposed_address_line1'))} disabled={readOnly}
              onChange={(e) => set('proposed_address_line1', e.target.value)} />
          </label>
          <label>Address line 2
            <input type="text" value={toStr(d('proposed_address_line2'))} disabled={readOnly}
              onChange={(e) => set('proposed_address_line2', e.target.value)} />
          </label>
          <label>City
            <input type="text" value={toStr(d('proposed_city'))} disabled={readOnly}
              onChange={(e) => set('proposed_city', e.target.value)} />
          </label>
          <label>Postcode
            <input type="text" value={toStr(d('proposed_postcode'))} disabled={readOnly}
              onChange={(e) => set('proposed_postcode', e.target.value)} />
          </label>
          <label>Google Maps URL
            <input type="url" value={toStr(d('proposed_google_maps_url'))} disabled={readOnly}
              onChange={(e) => set('proposed_google_maps_url', e.target.value)}
              placeholder="https://maps.google.com/…" />
          </label>
          <label>Public phone
            <input type="tel" value={toStr(d('proposed_public_phone'))} disabled={readOnly}
              onChange={(e) => set('proposed_public_phone', e.target.value)} />
          </label>
          <label>Public email
            <input type="email" value={toStr(d('proposed_public_email'))} disabled={readOnly}
              onChange={(e) => set('proposed_public_email', e.target.value)} />
          </label>
          <label className="span3">Operating hours (e.g. Mon&ndash;Fri 4&ndash;8pm, Sat&ndash;Sun 9am&ndash;5pm)
            <input type="text" value={toStr(d('proposed_hours_text'))} disabled={readOnly}
              onChange={(e) => set('proposed_hours_text', e.target.value)} />
          </label>
        </div>
      </div>

      {/* Photos */}
      <div className="mas-app-section">
        <h2>Photos (up to 5 &middot; first is hero)</h2>
        <p className="help">Upload photos of your centre, pool, and facilities. The first one is your hero image on the directory.</p>
        <div className="mas-gallery">
          {(draft.proposed_image_paths ?? []).map((path, i) => {
            const url = imageUrl(path);
            return (
              <div key={path} className={`cell${i === 0 ? ' is-hero' : ''}`}>
                {url && <img src={url} alt="" />}
                {i === 0 && <span className="badge-hero">Hero</span>}
                {!readOnly && <button className="rm" title="Remove" onClick={() => removePhoto(path)}>×</button>}
                {i !== 0 && !readOnly && <button className="mkhero" title="Make hero" onClick={() => makeHero(path)}>★</button>}
              </div>
            );
          })}
          {!readOnly && (draft.proposed_image_paths ?? []).length < 5 && (
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

      {/* Fit-for-assessment — only shown if assess requested */}
      {(draft.requested_can_assess ?? false) && (
        <div className="mas-app-section">
          <h2>Fit-for-assessment: pool &amp; safety</h2>
          <p className="help">
            Since you&rsquo;re requesting assessment recognition, tell us about your pool.
            The review team considers these before granting assessment status.
          </p>
          <div className="mas-app-form">
            <label>Pool length (m)
              <input type="number" step="0.1" value={toStr(d('proposed_pool_length_m'))} disabled={readOnly}
                onChange={(e) => set('proposed_pool_length_m', toNumOrNull(e.target.value))} />
            </label>
            <label>Pool min depth (m)
              <input type="number" step="0.1" value={toStr(d('proposed_pool_min_depth_m'))} disabled={readOnly}
                onChange={(e) => set('proposed_pool_min_depth_m', toNumOrNull(e.target.value))} />
            </label>
            <label>Pool max depth (m)
              <input type="number" step="0.1" value={toStr(d('proposed_pool_max_depth_m'))} disabled={readOnly}
                onChange={(e) => set('proposed_pool_max_depth_m', toNumOrNull(e.target.value))} />
            </label>
            <label>Number of lanes
              <input type="number" value={toStr(d('proposed_pool_lane_count'))} disabled={readOnly}
                onChange={(e) => set('proposed_pool_lane_count', toNumOrNull(e.target.value) as number | null)} />
            </label>
            <label className="span2">Pool certifier (if applicable)
              <input type="text" value={toStr(d('proposed_pool_certifier'))} disabled={readOnly}
                onChange={(e) => set('proposed_pool_certifier', e.target.value)}
                placeholder="e.g. Local Council" />
            </label>
          </div>
          <div style={{ marginTop: '0.8rem' }}>
            <label className="mas-toggle-line">
              <input type="checkbox" checked={!!d('proposed_pool_certified')} disabled={readOnly}
                onChange={(e) => set('proposed_pool_certified', e.target.checked)} />
              Our pool is certified
            </label>
            <label className="mas-toggle-line">
              <input type="checkbox" checked={!!d('proposed_has_lifeguard')} disabled={readOnly}
                onChange={(e) => set('proposed_has_lifeguard', e.target.checked)} />
              A lifeguard is on duty during our operating hours
            </label>
            <label className="mas-toggle-line">
              <input type="checkbox" checked={!!d('proposed_has_eap')} disabled={readOnly}
                onChange={(e) => set('proposed_has_eap', e.target.checked)} />
              We have a documented Emergency Action Plan (EAP)
            </label>
            <label className="mas-toggle-line">
              <input type="checkbox" checked={!!d('proposed_has_first_aid_aed')} disabled={readOnly}
                onChange={(e) => set('proposed_has_first_aid_aed', e.target.checked)} />
              First aid supplies &amp; AED are available on site
            </label>
            <label className="mas-toggle-line">
              <input type="checkbox" checked={!!d('proposed_has_adequate_deck')} disabled={readOnly}
                onChange={(e) => set('proposed_has_adequate_deck', e.target.checked)} />
              We have adequate deck space for candidate marshalling
            </label>
          </div>
        </div>
      )}

      {!readOnly && (
        <div className="mas-app-footer">
          <p className="mas-cell-sub" style={{ margin: 0 }}>
            You can save and come back to keep editing until the review team decides.
          </p>
          <span className="grow" />
          <button className="mas-btn-primary" onClick={save} disabled={busy}>
            {busy ? 'Saving…' : 'Save application'}
          </button>
        </div>
      )}
    </section>
  );
}
