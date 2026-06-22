import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import '../styles/admin.css';

interface Row {
  profile_id: string;
  full_name: string | null;
  state: string | null;
  centre_name: string | null;
}

type Load = 'loading' | 'ready' | 'error';

export default function InstructorDirectory() {
  const [rows, setRows] = useState<Row[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('instructor_directory')
        .select('profile_id, full_name, state, centre_name')
        .order('full_name');
      if (cancelled) return;
      if (error) { setLoad('error'); return; }
      setRows((data ?? []) as Row[]);
      setLoad('ready');
    })();
    return () => { cancelled = true; };
  }, []);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        (r.full_name ?? '').toLowerCase().includes(q) ||
        (r.centre_name ?? '').toLowerCase().includes(q) ||
        (r.state ?? '').toLowerCase().includes(q),
    );
  }, [rows, filter]);

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Find an instructor</p>
        <h1>Certified instructors</h1>
        <p className="mas-lede">
          Instructors currently certified under the MAS Swim Badges programme.
          Bookings for assessments are made through a certified instructor.
        </p>
      </header>

      <div className="mas-form">
        <div className="mas-field">
          <label htmlFor="filter" className="mas-field-label">Search by name, centre, or state</label>
          <input
            id="filter"
            className="mas-input"
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Start typing…"
          />
        </div>
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load the directory.</p>}
      {load === 'ready' && shown.length === 0 && (
        <p className="mas-status">No instructors found.</p>
      )}

      {load === 'ready' && shown.length > 0 && (
        <ul className="mas-admin-list">
          {shown.map((r, i) => (
            <li key={`${r.profile_id}-${i}`} className="mas-admin-row">
              <div className="mas-admin-main">
                <h2 className="mas-admin-name">{r.full_name || 'Instructor'}</h2>
                <p className="mas-admin-meta">
                  {r.state && <span className="mas-pill">{r.state}</span>}
                  <span className="mas-admin-sub">{r.centre_name || 'Independent'}</span>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
