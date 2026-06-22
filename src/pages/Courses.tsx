import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Course {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  state: string | null;
  venue: string | null;
  starts_on: string;
  ends_on: string | null;
  capacity: number | null;
  fee: number | null;
  registration_url: string | null;
}

type Load = 'loading' | 'ready' | 'error';

const KIND_LABELS: Record<string, string> = {
  instructor_certification: 'Instructor certification',
  examiner_certification: 'Examiner certification',
  clinic: 'Clinic',
  other: 'Course',
};

function prettyDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function dateRange(a: string, b: string | null): string {
  if (!b || b === a) return prettyDate(a);
  return `${prettyDate(a)} – ${prettyDate(b)}`;
}
function money(n: number | null): string {
  if (n == null) return '';
  return `RM ${Number(n).toFixed(2)}`;
}

export default function Courses() {
  const [rows, setRows] = useState<Course[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('public_courses')
        .select('*')
        .order('starts_on');
      if (cancelled) return;
      if (error) { setLoad('error'); return; }
      setRows((data ?? []) as Course[]);
      setLoad('ready');
    })();
    return () => { cancelled = true; };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = useMemo(
    () => rows.filter((c) => (c.ends_on ?? c.starts_on) >= today),
    [rows, today],
  );

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Training</p>
        <h1>Courses &amp; certification</h1>
        <p className="mas-lede">
          Upcoming instructor and examiner certification courses and clinics
          under the MAS Swim Badges programme.
        </p>
      </header>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load courses.</p>}
      {load === 'ready' && upcoming.length === 0 && (
        <p className="mas-status">No upcoming courses are scheduled right now.</p>
      )}

      {load === 'ready' && upcoming.length > 0 && (
        <ul className="mas-admin-list">
          {upcoming.map((c) => (
            <li key={c.id} className="mas-admin-row" style={{ flexWrap: 'wrap' }}>
              <div className="mas-admin-main">
                <h2 className="mas-admin-name">{c.title}</h2>
                <p className="mas-admin-meta">
                  <span className="mas-pill">{KIND_LABELS[c.kind] ?? c.kind}</span>
                  <span className="mas-admin-sub">
                    {dateRange(c.starts_on, c.ends_on)}
                    {c.state ? ` · ${c.state}` : ''}
                    {c.venue ? ` · ${c.venue}` : ''}
                    {c.fee != null ? ` · ${money(c.fee)}` : ''}
                  </span>
                </p>
                {c.description && (
                  <p className="mas-admin-meta"><span className="mas-admin-sub">{c.description}</span></p>
                )}
              </div>
              {c.registration_url && (
                <div className="mas-admin-action">
                  <a
                    className="mas-btn-primary"
                    href={c.registration_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Register
                  </a>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
