// src/pages/admin/WebsiteGuides.tsx
// Sysadmin-only. Manages the /guides content the public site reads:
// - Create, edit, delete, reorder cards
// - Publish/unpublish cards
// - Two image slots + captions per card, per section
// - Sections inside each card: create, edit, delete, reorder
// Wire:
//   admin_list_guides()
//   admin_upsert_guide_card(...)
//   admin_delete_guide_card(id)
//   admin_reorder_guide_cards(ids[])
//   admin_upsert_guide_section(...)
//   admin_delete_guide_section(id)
//   admin_reorder_guide_sections(card_id, ids[])
// Uploads go directly to storage bucket `website-images` via supabase.storage.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface GuideSection {
  id: string;
  heading: string;
  body: string | null;
  steps: string[] | null;
  points: string[] | null;
  note: string | null;
  image1_url: string | null;
  image1_caption: string | null;
  image2_url: string | null;
  image2_caption: string | null;
  sort_order: number;
}
interface GuideCard {
  id: string;
  slug: string;
  title: string;
  audience: string;
  accent: string;
  summary: string;
  sort_order: number;
  is_published: boolean;
  image1_url: string | null;
  image1_caption: string | null;
  image2_url: string | null;
  image2_caption: string | null;
  updated_at: string;
  sections: GuideSection[];
}

type Load = 'loading' | 'ready' | 'error';

const CSS = `
.mas-wm-list { display: grid; gap: 0.8rem; }
.mas-wm-card {
  background: #fff;
  border: 1px solid var(--mas-line, #e3e9f3);
  border-radius: 10px;
  padding: 1rem 1.2rem;
}
.mas-wm-cardhead {
  display: flex; align-items: flex-start; justify-content: space-between;
  gap: 1rem; flex-wrap: wrap;
}
.mas-wm-cardhead h2 { margin: 0.15rem 0 0; font-size: 1.05rem; color: var(--mas-navy, #1E2752); }
.mas-wm-badge { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 600; }
.mas-wm-badge.is-live { background: #e6f4ea; color: #2e7d32; }
.mas-wm-badge.is-draft { background: #fef3c7; color: #92400e; }
.mas-wm-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.65rem 1rem;
}
@media (max-width: 640px) { .mas-wm-form-grid { grid-template-columns: 1fr; } }
.mas-wm-imageslot {
  display: grid; grid-template-columns: 8rem 1fr auto; gap: 0.6rem;
  align-items: center;
  padding: 0.55rem 0.7rem;
  border: 1px dashed var(--mas-line, #e3e9f3); border-radius: 8px;
  background: #f8fafd;
}
.mas-wm-thumb {
  width: 8rem; height: 5rem; object-fit: cover;
  border-radius: 6px; background: #eef2f8;
  display: flex; align-items: center; justify-content: center;
  font-size: 0.75rem; color: var(--mas-muted, #5b6472);
  overflow: hidden;
}
.mas-wm-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.mas-wm-actions { display: flex; gap: 0.4rem; flex-wrap: wrap; }
.mas-wm-sections { margin-top: 0.9rem; padding-top: 0.9rem; border-top: 1px solid var(--mas-line, #e3e9f3); }
.mas-wm-section {
  background: #f8fafd; border-radius: 8px; padding: 0.7rem 0.9rem; margin-bottom: 0.5rem;
}
.mas-wm-section h3 { margin: 0 0 0.4rem; font-size: 0.92rem; color: var(--mas-navy, #1E2752); }
`;

function accentColour(hex: string, fallback = '#09B3CA'): string {
  return /^#[0-9a-f]{6}$/i.test(hex) ? hex : fallback;
}

export default function WebsiteGuides() {
  const [cards, setCards] = useState<GuideCard[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);

  const fetchGuides = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('admin_list_guides');
    if (error) { setLoad('error'); setMsg({ ok: false, text: error.message }); return; }
    const parsed: GuideCard[] = Array.isArray(data) ? (data as GuideCard[]) : [];
    setCards(parsed);
    setLoad('ready');
  }, []);

  useEffect(() => { fetchGuides(); }, [fetchGuides]);

  async function uploadImage(file: File, keyHint: string): Promise<string | null> {
    setBusy(`upload:${keyHint}`);
    const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
    const path = `guides/${keyHint}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('website-images')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return null; }
    const { data } = supabase.storage.from('website-images').getPublicUrl(path);
    return data.publicUrl;
  }

  async function saveCard(card: GuideCard, patch: Partial<GuideCard>) {
    setBusy(`card:${card.id}`);
    setMsg(null);
    const merged = { ...card, ...patch };
    const { error } = await supabase.rpc('admin_upsert_guide_card', {
      _id: card.id,
      _slug: merged.slug,
      _title: merged.title,
      _audience: merged.audience,
      _accent: merged.accent,
      _summary: merged.summary,
      _is_published: merged.is_published,
      _image1_url: merged.image1_url,
      _image1_caption: merged.image1_caption,
      _image2_url: merged.image2_url,
      _image2_caption: merged.image2_caption,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Saved.' });
    fetchGuides();
  }

  async function saveSection(section: GuideSection, cardId: string, patch: Partial<GuideSection>) {
    setBusy(`section:${section.id}`);
    setMsg(null);
    const merged = { ...section, ...patch };
    const { error } = await supabase.rpc('admin_upsert_guide_section', {
      _id: section.id,
      _card_id: cardId,
      _heading: merged.heading,
      _body: merged.body,
      _steps: merged.steps,
      _points: merged.points,
      _note: merged.note,
      _image1_url: merged.image1_url,
      _image1_caption: merged.image1_caption,
      _image2_url: merged.image2_url,
      _image2_caption: merged.image2_caption,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Section saved.' });
    fetchGuides();
  }

  async function createSection(cardId: string) {
    setBusy(`new-section:${cardId}`);
    const { error } = await supabase.rpc('admin_upsert_guide_section', {
      _id: null, _card_id: cardId,
      _heading: 'New section', _body: null, _steps: null, _points: null, _note: null,
      _image1_url: null, _image1_caption: null, _image2_url: null, _image2_caption: null,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchGuides();
  }

  async function deleteCard(card: GuideCard) {
    if (!window.confirm(`Delete guide "${card.title}"? All sections will be deleted too. This cannot be undone.`)) return;
    setBusy(`delete:${card.id}`);
    const { error } = await supabase.rpc('admin_delete_guide_card', { _id: card.id });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: 'Guide deleted.' });
    fetchGuides();
  }

  async function deleteSection(section: GuideSection) {
    if (!window.confirm(`Delete section "${section.heading}"?`)) return;
    setBusy(`delete-section:${section.id}`);
    const { error } = await supabase.rpc('admin_delete_guide_section', { _id: section.id });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchGuides();
  }

  async function reorderCards(direction: 'up' | 'down', index: number) {
    const ids = cards.map((c) => c.id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    setBusy(`reorder`);
    const { error } = await supabase.rpc('admin_reorder_guide_cards', { _ids: ids });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchGuides();
  }

  async function reorderSections(cardId: string, direction: 'up' | 'down', index: number) {
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    const ids = card.sections.map((s) => s.id);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    const { error } = await supabase.rpc('admin_reorder_guide_sections', { _card_id: cardId, _ids: ids });
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchGuides();
  }

  async function createCard() {
    const slug = window.prompt('Slug for the new guide (URL segment, e.g. "for-parents"):');
    if (!slug || !slug.trim()) return;
    setBusy('new-card');
    const { error } = await supabase.rpc('admin_upsert_guide_card', {
      _id: null,
      _slug: slug.trim(),
      _title: 'New guide',
      _audience: '',
      _accent: '#09B3CA',
      _summary: '',
      _is_published: false,
      _image1_url: null, _image1_caption: null,
      _image2_url: null, _image2_caption: null,
    });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    fetchGuides();
  }

  return (
    <section className="mas-page mas-page-wide">
      <style>{CSS}</style>
      <header className="mas-page-head mas-page-head-row">
        <div>
          <p className="mas-eyebrow">Website</p>
          <h1>Guides</h1>
          <p className="mas-lede">
            Manage the content shown on <em>/guides</em> and each guide's detail page.
            Reorder cards, publish or unpublish, and add up to two images (with captions)
            per card and per section. Image slots without a URL are invisible on the
            public page — nothing looks missing.
          </p>
        </div>
        <div className="mas-page-actions">
          <button className="mas-btn-ghost" onClick={fetchGuides} disabled={load === 'loading'}>Refresh</button>
          <button className="mas-btn-primary" onClick={createCard} disabled={busy === 'new-card'}>
            {busy === 'new-card' ? 'Creating…' : 'New guide'}
          </button>
        </div>
      </header>

      {msg && (
        <div className={`mas-alert ${msg.ok ? 'is-success' : 'is-danger'}`}>
          <div className="mas-alert-body"><p className="mas-alert-text">{msg.text}</p></div>
        </div>
      )}

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn't load guides.</p>}
      {load === 'ready' && cards.length === 0 && (
        <p className="mas-status">No guides yet. Click "New guide" to add one.</p>
      )}

      {load === 'ready' && cards.length > 0 && (
        <div className="mas-wm-list">
          {cards.map((card, ci) => {
            const isOpen = openCardId === card.id;
            return (
              <div key={card.id} className="mas-wm-card">
                <div className="mas-wm-cardhead">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <span
                      className={`mas-wm-badge ${card.is_published ? 'is-live' : 'is-draft'}`}
                      style={{ marginRight: '0.5rem' }}
                    >
                      {card.is_published ? 'LIVE' : 'DRAFT'}
                    </span>
                    <span style={{ fontSize: '0.72rem', color: 'var(--mas-muted, #5b6472)' }}>
                      /guides/{card.slug}
                    </span>
                    <h2>{card.title || '(untitled)'}</h2>
                    <p style={{ margin: '0.15rem 0 0', color: 'var(--mas-muted, #5b6472)', fontSize: '0.85rem' }}>
                      {card.audience || '(no audience)'} · {card.sections.length} section{card.sections.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  <div className="mas-wm-actions">
                    <button className="mas-btn-ghost mas-btn-compact" onClick={() => reorderCards('up', ci)} disabled={ci === 0}>↑</button>
                    <button className="mas-btn-ghost mas-btn-compact" onClick={() => reorderCards('down', ci)} disabled={ci === cards.length - 1}>↓</button>
                    <button className="mas-btn-ghost mas-btn-compact" onClick={() => setOpenCardId(isOpen ? null : card.id)}>
                      {isOpen ? 'Close' : 'Edit'}
                    </button>
                    <button className="mas-btn-danger mas-btn-compact" onClick={() => deleteCard(card)}>Delete</button>
                  </div>
                </div>

                {isOpen && (
                  <div style={{ marginTop: '1rem' }}>
                    <CardEditor
                      card={card}
                      busyKey={busy}
                      onSave={(patch) => saveCard(card, patch)}
                      onUpload={uploadImage}
                    />

                    <div className="mas-wm-sections">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <h3 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--mas-navy, #1E2752)' }}>Sections</h3>
                        <button className="mas-btn-ghost mas-btn-compact" onClick={() => createSection(card.id)} disabled={busy === `new-section:${card.id}`}>
                          {busy === `new-section:${card.id}` ? 'Adding…' : '+ Add section'}
                        </button>
                      </div>

                      {card.sections.length === 0 && (
                        <p className="mas-field-note">This guide has no sections yet.</p>
                      )}

                      {card.sections.map((s, si) => (
                        <SectionEditor
                          key={s.id}
                          section={s}
                          cardId={card.id}
                          index={si}
                          total={card.sections.length}
                          busyKey={busy}
                          onSave={(patch) => saveSection(s, card.id, patch)}
                          onDelete={() => deleteSection(s)}
                          onMove={(dir) => reorderSections(card.id, dir, si)}
                          onUpload={uploadImage}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// CardEditor — inline editor for a single card's own fields (not sections).
// -----------------------------------------------------------------------------
function CardEditor({
  card,
  busyKey,
  onSave,
  onUpload,
}: {
  card: GuideCard;
  busyKey: string | null;
  onSave: (patch: Partial<GuideCard>) => void;
  onUpload: (file: File, keyHint: string) => Promise<string | null>;
}) {
  const [local, setLocal] = useState<GuideCard>(card);
  useEffect(() => { setLocal(card); }, [card.id]);

  const dirty = useMemo(() => JSON.stringify(local) !== JSON.stringify(card), [local, card]);

  return (
    <>
      <div className="mas-wm-form-grid">
        <label className="mas-field">
          <span className="mas-field-label">Title</span>
          <input className="mas-input" value={local.title} onChange={(e) => setLocal({ ...local, title: e.target.value })} />
        </label>
        <label className="mas-field">
          <span className="mas-field-label">Audience</span>
          <input className="mas-input" value={local.audience} onChange={(e) => setLocal({ ...local, audience: e.target.value })} placeholder="e.g. Instructors" />
        </label>
        <label className="mas-field">
          <span className="mas-field-label">Slug</span>
          <input className="mas-input" value={local.slug} onChange={(e) => setLocal({ ...local, slug: e.target.value })} />
          <span className="mas-field-note">Changes the public URL /guides/&lt;slug&gt;.</span>
        </label>
        <label className="mas-field">
          <span className="mas-field-label">Accent colour</span>
          <input className="mas-input" type="color" value={accentColour(local.accent)} onChange={(e) => setLocal({ ...local, accent: e.target.value })} />
        </label>
        <label className="mas-field mas-col-2">
          <span className="mas-field-label">Summary</span>
          <textarea className="mas-input" rows={2} value={local.summary} onChange={(e) => setLocal({ ...local, summary: e.target.value })} />
        </label>
        <label className="mas-field">
          <span className="mas-field-label">Published</span>
          <select className="mas-select" value={local.is_published ? '1' : '0'} onChange={(e) => setLocal({ ...local, is_published: e.target.value === '1' })}>
            <option value="1">Published (live)</option>
            <option value="0">Draft (hidden)</option>
          </select>
        </label>
      </div>

      <div style={{ marginTop: '0.7rem', display: 'grid', gap: '0.5rem' }}>
        <ImageSlot
          label="Header image 1"
          slotKey={`card-${card.id}-1`}
          url={local.image1_url}
          caption={local.image1_caption}
          onUrlChange={(url) => setLocal({ ...local, image1_url: url })}
          onCaptionChange={(cap) => setLocal({ ...local, image1_caption: cap })}
          onUpload={onUpload}
        />
        <ImageSlot
          label="Header image 2"
          slotKey={`card-${card.id}-2`}
          url={local.image2_url}
          caption={local.image2_caption}
          onUrlChange={(url) => setLocal({ ...local, image2_url: url })}
          onCaptionChange={(cap) => setLocal({ ...local, image2_caption: cap })}
          onUpload={onUpload}
        />
      </div>

      <div style={{ marginTop: '0.8rem', display: 'flex', gap: '0.5rem' }}>
        <button
          className="mas-btn-primary mas-btn-compact"
          disabled={!dirty || busyKey === `card:${card.id}`}
          onClick={() => onSave(local)}
        >
          {busyKey === `card:${card.id}` ? 'Saving…' : dirty ? 'Save changes' : 'Saved'}
        </button>
        <button
          className="mas-btn-ghost mas-btn-compact"
          disabled={!dirty}
          onClick={() => setLocal(card)}
        >
          Revert
        </button>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// SectionEditor — inline editor for a single guide section.
// -----------------------------------------------------------------------------
function SectionEditor({
  section, cardId, index, total, busyKey,
  onSave, onDelete, onMove, onUpload,
}: {
  section: GuideSection;
  cardId: string;
  index: number;
  total: number;
  busyKey: string | null;
  onSave: (patch: Partial<GuideSection>) => void;
  onDelete: () => void;
  onMove: (dir: 'up' | 'down') => void;
  onUpload: (file: File, keyHint: string) => Promise<string | null>;
}) {
  const [local, setLocal] = useState<GuideSection>(section);
  useEffect(() => { setLocal(section); }, [section.id]);
  const dirty = useMemo(() => JSON.stringify(local) !== JSON.stringify(section), [local, section]);

  // Steps / points as multiline text for editing convenience
  const stepsText = (local.steps ?? []).join('\n');
  const pointsText = (local.points ?? []).join('\n');

  return (
    <div className="mas-wm-section">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
        <h3>{local.heading || '(untitled section)'}</h3>
        <div className="mas-wm-actions">
          <button className="mas-btn-ghost mas-btn-compact" onClick={() => onMove('up')} disabled={index === 0}>↑</button>
          <button className="mas-btn-ghost mas-btn-compact" onClick={() => onMove('down')} disabled={index === total - 1}>↓</button>
          <button className="mas-btn-danger mas-btn-compact" onClick={onDelete}>Delete</button>
        </div>
      </div>

      <div className="mas-wm-form-grid">
        <label className="mas-field mas-col-2">
          <span className="mas-field-label">Heading</span>
          <input className="mas-input" value={local.heading} onChange={(e) => setLocal({ ...local, heading: e.target.value })} />
        </label>
        <label className="mas-field mas-col-2">
          <span className="mas-field-label">Body</span>
          <textarea className="mas-input" rows={3} value={local.body ?? ''} onChange={(e) => setLocal({ ...local, body: e.target.value })} />
        </label>
        <label className="mas-field">
          <span className="mas-field-label">Steps (one per line)</span>
          <textarea className="mas-input" rows={3} value={stepsText}
            onChange={(e) => {
              const arr = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
              setLocal({ ...local, steps: arr.length > 0 ? arr : null });
            }}
            placeholder="Rendered as a numbered list on the public page. Leave empty to hide."
          />
        </label>
        <label className="mas-field">
          <span className="mas-field-label">Points (one per line)</span>
          <textarea className="mas-input" rows={3} value={pointsText}
            onChange={(e) => {
              const arr = e.target.value.split('\n').map((s) => s.trim()).filter(Boolean);
              setLocal({ ...local, points: arr.length > 0 ? arr : null });
            }}
            placeholder="Rendered as a bulleted list. Leave empty to hide."
          />
        </label>
        <label className="mas-field mas-col-2">
          <span className="mas-field-label">Note (callout)</span>
          <textarea className="mas-input" rows={2} value={local.note ?? ''} onChange={(e) => setLocal({ ...local, note: e.target.value })}
            placeholder="Optional — highlighted footnote at the end of the section." />
        </label>
      </div>

      <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.5rem' }}>
        <ImageSlot
          label="Section image 1"
          slotKey={`section-${section.id}-1`}
          url={local.image1_url}
          caption={local.image1_caption}
          onUrlChange={(url) => setLocal({ ...local, image1_url: url })}
          onCaptionChange={(cap) => setLocal({ ...local, image1_caption: cap })}
          onUpload={onUpload}
        />
        <ImageSlot
          label="Section image 2"
          slotKey={`section-${section.id}-2`}
          url={local.image2_url}
          caption={local.image2_caption}
          onUrlChange={(url) => setLocal({ ...local, image2_url: url })}
          onCaptionChange={(cap) => setLocal({ ...local, image2_caption: cap })}
          onUpload={onUpload}
        />
      </div>

      <div style={{ marginTop: '0.7rem', display: 'flex', gap: '0.5rem' }}>
        <button
          className="mas-btn-primary mas-btn-compact"
          disabled={!dirty || busyKey === `section:${section.id}`}
          onClick={() => onSave(local)}
        >
          {busyKey === `section:${section.id}` ? 'Saving…' : dirty ? 'Save section' : 'Saved'}
        </button>
        <button className="mas-btn-ghost mas-btn-compact" disabled={!dirty} onClick={() => setLocal(section)}>Revert</button>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ImageSlot — thumbnail + upload + URL + caption. Zero-footprint on the public
// page is guaranteed by the public renderer only using URL when set.
// -----------------------------------------------------------------------------
function ImageSlot({
  label, slotKey, url, caption, onUrlChange, onCaptionChange, onUpload,
}: {
  label: string;
  slotKey: string;
  url: string | null;
  caption: string | null;
  onUrlChange: (v: string | null) => void;
  onCaptionChange: (v: string | null) => void;
  onUpload: (file: File, keyHint: string) => Promise<string | null>;
}) {
  const [uploading, setUploading] = useState(false);
  async function pickFile() {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = async () => {
      const file = inp.files?.[0];
      if (!file) return;
      setUploading(true);
      const publicUrl = await onUpload(file, slotKey);
      setUploading(false);
      if (publicUrl) onUrlChange(publicUrl);
    };
    inp.click();
  }
  return (
    <div className="mas-wm-imageslot">
      <div className="mas-wm-thumb">
        {url ? <img src={url} alt="" /> : <span>No image</span>}
      </div>
      <div style={{ display: 'grid', gap: '0.35rem' }}>
        <label className="mas-field" style={{ margin: 0 }}>
          <span className="mas-field-label" style={{ fontSize: '0.72rem' }}>{label} — caption</span>
          <input
            className="mas-input"
            value={caption ?? ''}
            onChange={(e) => onCaptionChange(e.target.value || null)}
            placeholder="Optional caption shown under the image"
          />
        </label>
        <span style={{ fontSize: '0.72rem', color: 'var(--mas-muted, #5b6472)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {url ?? 'No image uploaded'}
        </span>
      </div>
      <div className="mas-wm-actions" style={{ flexDirection: 'column' }}>
        <button className="mas-btn-ghost mas-btn-compact" onClick={pickFile} disabled={uploading}>
          {uploading ? 'Uploading…' : url ? 'Replace' : 'Upload'}
        </button>
        {url && (
          <button className="mas-btn-ghost mas-btn-compact" onClick={() => onUrlChange(null)}>Remove</button>
        )}
      </div>
    </div>
  );
}
