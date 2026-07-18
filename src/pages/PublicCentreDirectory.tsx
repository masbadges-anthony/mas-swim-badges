// Public "Find a swim centre" page for www.masbadges.org.
// Reads list_published_centres() via the anon key; RLS+RPC filter to only
// published + recognized rows and redact contact info when the centre has
// contact_public = false.
//
// Grid of centres with hero image, name, city + state, classification
// badges (Teaching / Assessment). Expand a card to see blurb, address,
// operating hours, contact (if public), pool spec, and a map link.
// Filters: state, classification (teach / assess / both), name search.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
// styles are inline via the STYLES constant

interface PublishedCentre {
  id: string;
  name: string;
  state: string;
  can_teach: boolean;
  can_assess: boolean;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  postcode: string | null;
  google_maps_url: string | null;
  public_contact_email: string | null;
  public_contact_phone: string | null;
  contact_public: boolean;
  operating_hours_text: string | null;
  public_blurb: string | null;
  image_paths: string[];
}

type Load = 'loading' | 'ready' | 'error';
type Filter = 'all' | 'teach' | 'assess' | 'both';

function pretty(s: string | null): string {
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
}
function heroUrl(paths: string[]): string | null {
  if (!paths || paths.length === 0) return null;
  return supabase.storage.from('centre-photos').getPublicUrl(paths[0]).data.publicUrl;
}
function imageUrl(path: string): string {
  return supabase.storage.from('centre-photos').getPublicUrl(path).data.publicUrl;
}

const STYLES = `
.mas-fc {
  max-width: 1200px; margin: 0 auto; padding: 2rem 1.5rem 4rem;
  font-family: var(--mas-font, system-ui, sans-serif);
  color: var(--mas-navy, #1E2752);
}
.mas-fc-head { text-align: center; margin-bottom: 2rem; }
.mas-fc-head p.eyebrow {
  color: var(--mas-red, #C62026); font-size: 0.8rem;
  text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 0.4rem;
  font-weight: 700;
}
.mas-fc-head h1 { font-size: clamp(1.8rem, 4vw, 2.6rem); margin: 0 0 0.6rem; font-weight: 800; }
.mas-fc-head p.lede { color: var(--mas-muted, #5b6472); font-size: 1rem; max-width: 40rem; margin: 0 auto; }

.mas-fc-filters {
  display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center;
  padding: 1rem 1.2rem; background: #f8fafd; border-radius: 12px;
  margin-bottom: 1.5rem;
}
.mas-fc-filters label { display: flex; flex-direction: column; gap: 0.2rem; font-size: 0.78rem; color: var(--mas-muted, #5b6472); }
.mas-fc-filters input, .mas-fc-filters select {
  font: inherit; padding: 0.5rem 0.7rem; border: 1px solid var(--mas-line, #e3e9f3);
  border-radius: 6px; background: #fff; color: var(--mas-navy, #1E2752);
}
.mas-fc-filters .chip-row { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.mas-fc-chip {
  font: inherit; font-size: 0.85rem; padding: 0.4rem 0.9rem; border-radius: 999px;
  border: 1px solid var(--mas-line, #e3e9f3); background: #fff; cursor: pointer;
  color: var(--mas-navy, #1E2752);
}
.mas-fc-chip.is-active { background: var(--mas-navy, #1E2752); color: #fff; border-color: var(--mas-navy, #1E2752); }
.mas-fc-count { margin-left: auto; color: var(--mas-muted, #5b6472); font-size: 0.85rem; }

.mas-fc-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(18rem, 1fr)); gap: 1.2rem;
}
.mas-fc-card {
  background: #fff; border: 1px solid var(--mas-line, #e3e9f3); border-radius: 12px;
  overflow: hidden; display: flex; flex-direction: column;
  transition: box-shadow 0.15s, transform 0.15s;
}
.mas-fc-card:hover { box-shadow: 0 8px 28px rgba(30,39,82,0.10); transform: translateY(-3px); }
.mas-fc-hero {
  aspect-ratio: 3 / 2; background: #eef1f8;
  display: flex; align-items: center; justify-content: center;
  overflow: hidden; position: relative; color: var(--mas-muted, #5b6472);
  font-size: 0.9rem;
}
.mas-fc-hero img { width: 100%; height: 100%; object-fit: cover; }
.mas-fc-badges {
  position: absolute; top: 0.7rem; left: 0.7rem;
  display: flex; gap: 0.35rem;
}
.mas-fc-badge {
  font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
  padding: 0.25rem 0.6rem; border-radius: 999px; font-weight: 600;
  background: rgba(255,255,255,0.95); backdrop-filter: blur(4px);
  color: var(--mas-navy, #1E2752);
}
.mas-fc-badge.assess { background: var(--mas-gold, #F9C610); color: var(--mas-navy, #1E2752); }
.mas-fc-body { padding: 1rem 1.1rem 1.1rem; display: flex; flex-direction: column; gap: 0.3rem; flex: 1; }
.mas-fc-name { font-weight: 700; font-size: 1.05rem; margin: 0; }
.mas-fc-loc { color: var(--mas-muted, #5b6472); font-size: 0.86rem; margin: 0; }
.mas-fc-blurb { color: var(--mas-navy, #1E2752); font-size: 0.9rem; margin: 0.4rem 0 0; line-height: 1.45; }
.mas-fc-more {
  margin-top: auto; padding-top: 0.6rem;
  background: none; border: 0; font: inherit; font-weight: 600; font-size: 0.88rem;
  color: var(--mas-red, #C62026); text-align: left; cursor: pointer; padding-left: 0;
}
.mas-fc-more:hover { text-decoration: underline; }

.mas-fc-empty {
  text-align: center; padding: 4rem 1rem; color: var(--mas-muted, #5b6472);
  background: #f8fafd; border-radius: 12px; margin: 1rem 0;
}
.mas-fc-empty h3 { color: var(--mas-navy, #1E2752); margin: 0 0 0.4rem; font-size: 1.1rem; }
.mas-fc-empty p { margin: 0; }

.mas-fc-modal {
  position: fixed; inset: 0; z-index: 9999; background: rgba(20,26,51,0.85);
  display: flex; align-items: center; justify-content: center; padding: 2rem;
  animation: mas-fc-in 0.15s ease-out;
}
@keyframes mas-fc-in { from { opacity: 0; } to { opacity: 1; } }
.mas-fc-modal-inner {
  background: #fff; border-radius: 12px; max-width: 640px; width: 100%;
  max-height: 90vh; overflow: auto; position: relative;
}
.mas-fc-modal-close {
  position: absolute; top: 0.8rem; right: 0.8rem;
  background: rgba(255,255,255,0.9); border: 0; width: 2.2rem; height: 2.2rem;
  border-radius: 999px; font-size: 1.3rem; cursor: pointer; z-index: 2;
  color: var(--mas-navy, #1E2752);
}
.mas-fc-modal-hero { aspect-ratio: 3 / 2; background: #eef1f8; overflow: hidden; }
.mas-fc-modal-hero img { width: 100%; height: 100%; object-fit: cover; }
.mas-fc-modal-body { padding: 1.5rem; }
.mas-fc-modal-body h2 { margin: 0 0 0.3rem; font-size: 1.4rem; }
.mas-fc-modal-body .sub { color: var(--mas-muted, #5b6472); font-size: 0.95rem; margin: 0 0 1rem; }
.mas-fc-modal-body section { margin: 1rem 0; }
.mas-fc-modal-body section h3 {
  font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--mas-muted, #5b6472); margin: 0 0 0.3rem; font-weight: 700;
}
.mas-fc-modal-body section p { margin: 0; line-height: 1.5; }
.mas-fc-modal-body .contact a, .mas-fc-modal-body .map-link {
  color: var(--mas-red, #C62026); text-decoration: none; font-weight: 600;
}
.mas-fc-modal-body .contact a:hover, .mas-fc-modal-body .map-link:hover { text-decoration: underline; }
.mas-fc-modal-body .gallery {
  display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.4rem; margin-top: 0.5rem;
}
.mas-fc-modal-body .gallery img {
  height: 5rem; border-radius: 6px; flex-shrink: 0;
}
`;

export default function PublicCentreDirectory() {
  const [rows, setRows] = useState<PublishedCentre[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [classFilter, setClassFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<PublishedCentre | null>(null);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_published_centres');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as PublishedCentre[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  // Esc key closes modal
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const states = useMemo(() => {
    const s = new Set<string>();
    rows.forEach((r) => s.add(r.state));
    return Array.from(s).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (stateFilter !== 'all' && r.state !== stateFilter) return false;
      if (classFilter === 'teach' && !r.can_teach) return false;
      if (classFilter === 'assess' && !r.can_assess) return false;
      if (classFilter === 'both' && !(r.can_teach && r.can_assess)) return false;
      if (q) {
        const hay = `${r.name} ${r.city ?? ''} ${pretty(r.state)}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, query, stateFilter, classFilter]);

  return (
    <div className="mas-fc">
      <style>{STYLES}</style>

      <header className="mas-fc-head">
        <p className="eyebrow">Recognised Partners</p>
        <h1>Find a swim centre</h1>
        <p className="lede">
          These centres are recognised by Malaysia Aquatics for the MAS BADGES
          Learn-to-Swim programme. Look for &ldquo;Teaching&rdquo; if you want your
          child to learn the syllabus, and &ldquo;Assessment&rdquo; if you&rsquo;re
          looking for a venue to complete a badge examination.
        </p>
      </header>

      <div className="mas-fc-filters">
        <label>
          Search
          <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Name, city, or state" style={{ minWidth: '14rem' }} />
        </label>
        <label>
          State
          <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="all">All states</option>
            {states.map((s) => <option key={s} value={s}>{pretty(s)}</option>)}
          </select>
        </label>
        <div className="chip-row" style={{ marginLeft: '0.4rem' }}>
          <button className={`mas-fc-chip ${classFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setClassFilter('all')}>All</button>
          <button className={`mas-fc-chip ${classFilter === 'teach' ? 'is-active' : ''}`}
            onClick={() => setClassFilter('teach')}>Teaching</button>
          <button className={`mas-fc-chip ${classFilter === 'assess' ? 'is-active' : ''}`}
            onClick={() => setClassFilter('assess')}>Assessment</button>
          <button className={`mas-fc-chip ${classFilter === 'both' ? 'is-active' : ''}`}
            onClick={() => setClassFilter('both')}>Both</button>
        </div>
        {load === 'ready' && (
          <span className="mas-fc-count">{filtered.length} of {rows.length} centres</span>
        )}
      </div>

      {load === 'loading' && (
        <div className="mas-fc-empty">
          <p>Loading centres…</p>
        </div>
      )}
      {load === 'error' && (
        <div className="mas-fc-empty">
          <h3>Unable to load centres</h3>
          <p>Please try again in a moment.</p>
        </div>
      )}
      {load === 'ready' && filtered.length === 0 && rows.length > 0 && (
        <div className="mas-fc-empty">
          <h3>No centres match</h3>
          <p>Try widening the filters or clearing the search.</p>
        </div>
      )}
      {load === 'ready' && rows.length === 0 && (
        <div className="mas-fc-empty">
          <h3>Directory coming soon</h3>
          <p>Recognised partner centres will appear here as they come online. Check back shortly.</p>
        </div>
      )}

      {load === 'ready' && filtered.length > 0 && (
        <div className="mas-fc-grid">
          {filtered.map((c) => {
            const hero = heroUrl(c.image_paths);
            return (
              <article key={c.id} className="mas-fc-card">
                <div className="mas-fc-hero">
                  {hero ? <img src={hero} alt={c.name} loading="lazy" /> : <span>Photo coming soon</span>}
                  <div className="mas-fc-badges">
                    {c.can_teach && <span className="mas-fc-badge">Teaching</span>}
                    {c.can_assess && <span className="mas-fc-badge assess">Assessment</span>}
                  </div>
                </div>
                <div className="mas-fc-body">
                  <h3 className="mas-fc-name">{c.name}</h3>
                  <p className="mas-fc-loc">
                    {[c.city, pretty(c.state)].filter(Boolean).join(', ')}
                  </p>
                  {c.public_blurb && (
                    <p className="mas-fc-blurb">
                      {c.public_blurb.length > 140 ? c.public_blurb.slice(0, 140) + '…' : c.public_blurb}
                    </p>
                  )}
                  <button className="mas-fc-more" onClick={() => setSelected(c)}>
                    View details →
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selected && (
        <div className="mas-fc-modal" onClick={() => setSelected(null)} role="dialog" aria-modal="true">
          <div className="mas-fc-modal-inner" onClick={(e) => e.stopPropagation()}>
            <button className="mas-fc-modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
            <div className="mas-fc-modal-hero">
              {heroUrl(selected.image_paths)
                ? <img src={heroUrl(selected.image_paths) || ''} alt={selected.name} />
                : null}
            </div>
            <div className="mas-fc-modal-body">
              <h2>{selected.name}</h2>
              <p className="sub">
                {[selected.city, pretty(selected.state), selected.postcode].filter(Boolean).join(' · ')}
                {' — '}
                {selected.can_teach && selected.can_assess ? 'Teaching & Assessment'
                  : selected.can_teach ? 'Teaching'
                  : selected.can_assess ? 'Assessment'
                  : 'Partner Centre'}
              </p>

              {selected.public_blurb && (
                <section>
                  <p>{selected.public_blurb}</p>
                </section>
              )}

              {(selected.address_line1 || selected.address_line2 || selected.google_maps_url) && (
                <section>
                  <h3>Address</h3>
                  <p>
                    {selected.address_line1}{selected.address_line2 ? <><br />{selected.address_line2}</> : null}
                    {selected.city ? <><br />{selected.city}</> : null}
                    {selected.postcode ? ` ${selected.postcode}` : null}
                  </p>
                  {selected.google_maps_url && (
                    <p style={{ marginTop: '0.4rem' }}>
                      <a href={selected.google_maps_url} target="_blank" rel="noopener noreferrer" className="map-link">
                        Open in Google Maps ↗
                      </a>
                    </p>
                  )}
                </section>
              )}

              {selected.operating_hours_text && (
                <section>
                  <h3>Operating Hours</h3>
                  <p>{selected.operating_hours_text}</p>
                </section>
              )}

              {selected.contact_public && (selected.public_contact_email || selected.public_contact_phone) && (
                <section className="contact">
                  <h3>Contact</h3>
                  <p>
                    {selected.public_contact_phone && <>Phone: <a href={`tel:${selected.public_contact_phone}`}>{selected.public_contact_phone}</a><br /></>}
                    {selected.public_contact_email && <>Email: <a href={`mailto:${selected.public_contact_email}`}>{selected.public_contact_email}</a></>}
                  </p>
                </section>
              )}

              {selected.image_paths && selected.image_paths.length > 1 && (
                <section>
                  <h3>Photos</h3>
                  <div className="gallery">
                    {selected.image_paths.slice(1).map((p) => (
                      <img key={p} src={imageUrl(p)} alt="" />
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
