import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

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
const KIND_COLORS: Record<string, string> = {
  instructor_certification: '#26A59A',
  examiner_certification: '#5D34B1',
  clinic: '#FF7042',
  other: '#1D87E4',
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
    <section className="mas-page mas-courses">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Training</p>
        <h1>Courses &amp; certification</h1>
        <p className="mas-lede">
          Upcoming instructor and examiner certification courses and clinics under
          the MAS Swim Badges programme.
        </p>
      </header>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load courses.</p>}
      {load === 'ready' && upcoming.length === 0 && (
        <div className="mas-alert is-info">
          <div className="mas-alert-body">
            <p className="mas-alert-title">No upcoming courses are scheduled right now.</p>
            <p className="mas-alert-text">
              Check back soon, or <a href="/contact?topic=instructor" className="mas-link">register your interest</a> and
              we’ll let you know when the next intake opens.
            </p>
          </div>
        </div>
      )}

      {load === 'ready' && upcoming.length > 0 && (
        <div className="mas-course-list">
          {upcoming.map((c) => {
            const color = KIND_COLORS[c.kind] ?? '#1D87E4';
            return (
              <article key={c.id} className="mas-course-card" style={{ ['--lvl' as string]: color }}>
                <div className="mas-course-body">
                  <span className="mas-course-kind">{KIND_LABELS[c.kind] ?? c.kind}</span>
                  <h2>{c.title}</h2>
                  <p className="mas-course-meta">
                    {dateRange(c.starts_on, c.ends_on)}
                    {c.state ? ` · ${c.state}` : ''}
                    {c.venue ? ` · ${c.venue}` : ''}
                    {c.fee != null ? ` · ${money(c.fee)}` : ''}
                  </p>
                  {c.description && <p className="mas-course-desc">{c.description}</p>}
                </div>
                {c.registration_url && (
                  <a className="mas-course-register" href={c.registration_url} target="_blank" rel="noreferrer">
                    Register
                  </a>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
