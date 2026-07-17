// My Resources — the per-user document collection surfaced under Account.
// Every resource here is a live link (Google Drive typically) which the
// sysadmin has tagged for one of the roles the current user holds.
// Reads via list_my_resources() — the RPC does the filtering; the UI just
// renders. Grouped by category, ordered by category then sort_order.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import Icon from '../components/Icon';
import '../styles/admin.css';

interface Resource {
  id: string;
  title: string;
  description: string | null;
  url: string;
  icon: string;
  category: string;
  sort_order: number;
}

type Load = 'loading' | 'ready' | 'error';

const CATEGORY_LABEL: Record<string, string> = {
  manual: 'Manuals',
  handbook: 'Handbooks',
  guide: 'Course Guides',
  form: 'Forms',
  other: 'Other',
};
const CATEGORY_ORDER = ['manual', 'handbook', 'guide', 'form', 'other'];

const CSS = `
.mas-resources {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.8rem;
}
.mas-resource {
  display: flex; align-items: flex-start; gap: 0.7rem;
  background: #fff; border: 1px solid var(--mas-line, #e3e9f3); border-radius: 8px;
  padding: 0.8rem; text-decoration: none; color: var(--mas-navy, #1E2752);
  transition: box-shadow 0.15s, transform 0.15s, border-color 0.15s;
}
.mas-resource:hover {
  box-shadow: 0 4px 14px rgba(30, 39, 82, 0.08);
  transform: translateY(-1px);
  border-color: var(--mas-gold, #F9C610);
}
.mas-resource-icon {
  flex: 0 0 2.4rem; width: 2.4rem; height: 2.4rem;
  display: flex; align-items: center; justify-content: center;
  background: #eef1f8; color: var(--mas-navy, #1E2752); border-radius: 6px;
}
.mas-resource-body { flex: 1; min-width: 0; }
.mas-resource-title { font-weight: 600; font-size: 0.95rem; margin: 0 0 0.15rem; }
.mas-resource-desc { font-size: 0.82rem; color: var(--mas-muted, #5b6472); margin: 0; line-height: 1.35; }
.mas-resource-cathead {
  font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.06em;
  color: var(--mas-muted, #5b6472); margin: 1.2rem 0 0.5rem;
}
.mas-resource-cathead:first-of-type { margin-top: 0.4rem; }
`;

export default function MyResources() {
  const [rows, setRows] = useState<Resource[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.rpc('list_my_resources');
    if (error) { setLoad('error'); return; }
    setRows((data ?? []) as Resource[]);
    setLoad('ready');
  }, []);
  useEffect(() => { fetchRows(); }, [fetchRows]);

  const grouped = useMemo(() => {
    const g: Record<string, Resource[]> = {};
    for (const r of rows) {
      const c = r.category || 'other';
      if (!g[c]) g[c] = [];
      g[c].push(r);
    }
    return g;
  }, [rows]);

  const orderedCategories = useMemo(
    () => CATEGORY_ORDER.filter((c) => grouped[c]?.length),
    [grouped],
  );

  return (
    <section className="mas-page">
      <style>{CSS}</style>
      <header className="mas-page-head">
        <p className="mas-eyebrow">Account</p>
        <h1>My resources</h1>
        <p className="mas-lede">
          Documents and forms curated for your role. Links open in a new tab and
          resolve to the current live version.
        </p>
      </header>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load your resources. Refresh to try again.</p>}
      {load === 'ready' && rows.length === 0 && (
        <p className="mas-status">
          No resources have been assigned to your role yet. Your system administrator
          curates this collection.
        </p>
      )}

      {load === 'ready' && rows.length > 0 && orderedCategories.map((cat) => (
        <div key={cat}>
          <h2 className="mas-resource-cathead">{CATEGORY_LABEL[cat] ?? cat}</h2>
          <div className="mas-resources">
            {grouped[cat].map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noopener noreferrer" className="mas-resource">
                <span className="mas-resource-icon"><Icon name={r.icon} /></span>
                <div className="mas-resource-body">
                  <p className="mas-resource-title">{r.title}</p>
                  {r.description && <p className="mas-resource-desc">{r.description}</p>}
                </div>
              </a>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
