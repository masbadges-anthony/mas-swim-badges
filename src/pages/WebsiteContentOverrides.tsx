// src/pages/WebsiteContentOverrides.tsx
// Sysadmin browser for all content_overrides in the database. Previously the
// only way to edit them was to click on the specific EditableText element on
// the public site while logged in as sysadmin. This surface lists everything
// in one table, groups by key prefix, and lets values be edited directly.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Override {
  key: string;
  value: string;
  updated_at: string;
}

type Load = 'loading' | 'ready' | 'error';

export default function WebsiteContentOverrides() {
  const [rows, setRows] = useState<Override[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase
      .from('content_overrides')
      .select('key, value, updated_at')
      .order('key', { ascending: true });
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as Override[]);
    setLoad('ready');
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  async function save(key: string) {
    const draft = drafts[key] ?? '';
    setBusy(key);
    setMsg(null);
    const { error } = await supabase.rpc('set_content_override', { _key: key, _value: draft });
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `Saved ${key}` });
    setDrafts((m) => { const n = { ...m }; delete n[key]; return n; });
    fetchRows();
  }

  async function remove(key: string) {
    if (!window.confirm(`Reset "${key}" to its coded default? This deletes the override.`)) return;
    setBusy(key);
    const { error } = await supabase.from('content_overrides').delete().eq('key', key);
    setBusy(null);
    if (error) { setMsg({ ok: false, text: error.message }); return; }
    setMsg({ ok: true, text: `Reset ${key}` });
    fetchRows();
  }

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = rows.filter((r) => !q || r.key.toLowerCase().includes(q) || r.value.toLowerCase().includes(q));
    const map = new Map<string, Override[]>();
    for (const r of filtered) {
      const prefix = r.key.split('.')[0] || 'other';
      if (!map.has(prefix)) map.set(prefix, []);
      map.get(prefix)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows, query]);

  return (
    <section className="mas-page mas-page-wide">
      <header className="mas-page-head mas-page-head-row">
        <div>
          <p className="mas-eyebrow">Website</p>
          <h1>Content overrides</h1>
          <p className="mas-lede">
            Every piece of copy that has been edited via the inline in-page editor
            (click-to-edit on any EditableText element as sysadmin) is stored here.
            You can also edit values directly in this table. Reset removes the
            override so the coded default returns.
          </p>
        </div>
        <div className="mas-page-actions">
          <button className="mas-btn-ghost" onClick={fetchRows} disabled={load === 'loading'}>Refresh</button>
        </div>
      </header>

      <div className="mas-admin-toolbar">
        <input className="mas-input" placeholder="Filter by key or value…" value={query} onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: '22rem' }} />
        {load === 'ready' && <span className="mas-admin-count">{rows.length} override{rows.length === 1 ? '' : 's'}</span>}
      </div>

      {msg && (
        <div className={`mas-alert ${msg.ok ? 'is-success' : 'is-danger'}`}>
          <div className="mas-alert-body"><p className="mas-alert-text">{msg.text}</p></div>
        </div>
      )}

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'ready' && rows.length === 0 && (
        <p className="mas-status">No overrides yet. Any text you edit inline on the public site will appear here.</p>
      )}

      {load === 'ready' && groups.map(([prefix, list]) => (
        <div key={prefix} style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '0.95rem', color: 'var(--mas-navy, #1E2752)', margin: '0.5rem 0 0.5rem', textTransform: 'capitalize' }}>
            {prefix} ({list.length})
          </h2>
          <div className="mas-table-wrap">
            <table className="mas-table">
              <thead>
                <tr>
                  <th style={{ width: '30%' }}>Key</th>
                  <th>Value</th>
                  <th style={{ width: '16rem' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const draft = drafts[r.key];
                  const current = draft ?? r.value;
                  const dirty = draft !== undefined && draft !== r.value;
                  return (
                    <tr key={r.key}>
                      <td className="mas-mono" style={{ fontSize: '0.78rem', wordBreak: 'break-word' }}>{r.key}</td>
                      <td>
                        <textarea
                          className="mas-input"
                          rows={2}
                          value={current}
                          onChange={(e) => setDrafts((m) => ({ ...m, [r.key]: e.target.value }))}
                        />
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                          <button className="mas-btn-primary mas-btn-compact" onClick={() => save(r.key)} disabled={!dirty || busy === r.key}>
                            {busy === r.key ? 'Saving…' : 'Save'}
                          </button>
                          <button className="mas-btn-ghost mas-btn-compact" onClick={() => setDrafts((m) => { const n = { ...m }; delete n[r.key]; return n; })} disabled={!dirty}>Revert</button>
                          <button className="mas-btn-danger mas-btn-compact" onClick={() => remove(r.key)} disabled={busy === r.key}>Reset</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
