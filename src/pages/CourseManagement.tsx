import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
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
  is_published: boolean;
}
interface StateRow { state: string; }

type Load = 'loading' | 'ready' | 'error';

const KINDS: { value: string; label: string }[] = [
  { value: 'instructor_certification', label: 'Instructor certification' },
  { value: 'examiner_certification', label: 'Examiner certification' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'other', label: 'Other' },
];

function prettyDate(s: string | null): string {
  if (!s) return '';
  const d = new Date(s + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function CourseManagement() {
  const { session } = useAuth();
  const me = session?.user?.id ?? null;

  const [courses, setCourses] = useState<Course[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  const [kind, setKind] = useState('instructor_certification');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [venue, setVenue] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [capacity, setCapacity] = useState('');
  const [fee, setFee] = useState('');
  const [regUrl, setRegUrl] = useState('');

  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    setLoad('loading');
    const { data, error } = await supabase.from('courses').select('*').order('starts_on', { ascending: false });
    if (error) { setLoad('error'); return; }
    setCourses((data ?? []) as Course[]);
    setLoad('ready');
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc('list_states');
      if (!cancelled) setStates(((data ?? []) as StateRow[]).map((x) => x.state));
    })();
    fetchCourses();
    return () => { cancelled = true; };
  }, [fetchCourses]);

  const canCreate = !!title.trim() && !!startsOn && !busy && !!me;

  async function create() {
    if (!canCreate) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    const { error } = await supabase.from('courses').insert({
      kind,
      title: title.trim(),
      description: description.trim() || null,
      state: stateVal || null,
      venue: venue.trim() || null,
      starts_on: startsOn,
      ends_on: endsOn || null,
      capacity: capacity ? Number(capacity) : null,
      fee: fee ? Number(fee) : null,
      registration_url: regUrl.trim() || null,
      is_published: false,
      created_by_profile_id: me,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setNotice('Course created as a draft. Publish it when you’re ready for it to appear publicly.');
    setTitle(''); setDescription(''); setVenue(''); setStartsOn(''); setEndsOn('');
    setCapacity(''); setFee(''); setRegUrl('');
    fetchCourses();
  }

  async function togglePublish(c: Course) {
    setBusyId(c.id);
    const { error } = await supabase.from('courses').update({ is_published: !c.is_published }).eq('id', c.id);
    setBusyId(null);
    if (error) { setError(error.message); return; }
    setCourses((list) => list.map((x) => (x.id === c.id ? { ...x, is_published: !c.is_published } : x)));
  }

  async function remove(c: Course) {
    setBusyId(c.id);
    const { error } = await supabase.from('courses').delete().eq('id', c.id);
    setBusyId(null);
    if (error) { setError(error.message); return; }
    setCourses((list) => list.filter((x) => x.id !== c.id));
  }

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Training</p>
        <h1>Manage courses</h1>
        <p className="mas-lede">
          Schedule certification courses and clinics. Drafts are private; publish
          a course to list it on the public Courses page.
        </p>
      </header>

      <div className="mas-form">
        <div className="mas-field">
          <label htmlFor="kind" className="mas-field-label">Type</label>
          <select id="kind" className="mas-select" value={kind} onChange={(e) => setKind(e.target.value)}>
            {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
          </select>
        </div>
        <div className="mas-field">
          <label htmlFor="title" className="mas-field-label">Title</label>
          <input id="title" className="mas-input" type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="mas-field">
          <label htmlFor="desc" className="mas-field-label">Description (optional)</label>
          <input id="desc" className="mas-input" type="text" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="mas-field">
          <label htmlFor="state" className="mas-field-label">State (optional)</label>
          <select id="state" className="mas-select" value={stateVal} onChange={(e) => setStateVal(e.target.value)}>
            <option value="">Any / unspecified</option>
            {states.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="mas-field">
          <label htmlFor="venue" className="mas-field-label">Venue (optional)</label>
          <input id="venue" className="mas-input" type="text" value={venue} onChange={(e) => setVenue(e.target.value)} />
        </div>
        <div className="mas-field">
          <label htmlFor="starts" className="mas-field-label">Starts on</label>
          <input id="starts" className="mas-input" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
        </div>
        <div className="mas-field">
          <label htmlFor="ends" className="mas-field-label">Ends on (optional)</label>
          <input id="ends" className="mas-input" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
        </div>
        <div className="mas-field">
          <label htmlFor="cap" className="mas-field-label">Capacity (optional)</label>
          <input id="cap" className="mas-input" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        </div>
        <div className="mas-field">
          <label htmlFor="fee" className="mas-field-label">Fee, RM (optional)</label>
          <input id="fee" className="mas-input" type="number" step="0.01" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <div className="mas-field">
          <label htmlFor="url" className="mas-field-label">Registration link (optional)</label>
          <input id="url" className="mas-input" type="url" value={regUrl} onChange={(e) => setRegUrl(e.target.value)} placeholder="https://…" />
        </div>

        {error && <p className="mas-status mas-status-bad">{error}</p>}
        {notice && <p className="mas-status mas-status-good">{notice}</p>}

        <div className="mas-form-actions">
          <button className="mas-btn-primary" onClick={create} disabled={!canCreate}>
            {busy ? 'Creating…' : 'Create course'}
          </button>
        </div>
      </div>

      <header className="mas-page-head mas-section-head">
        <h2>Scheduled courses</h2>
      </header>

      <div className="mas-admin-toolbar">
        <button className="mas-btn-ghost" onClick={fetchCourses} disabled={load === 'loading'}>Refresh</button>
        {load === 'ready' && <span className="mas-admin-count">{courses.length} total</span>}
      </div>

      {load === 'loading' && <p className="mas-status">Loading…</p>}
      {load === 'error' && <p className="mas-status mas-status-bad">Couldn’t load courses.</p>}
      {load === 'ready' && courses.length === 0 && <p className="mas-status">No courses yet.</p>}

      {load === 'ready' && courses.length > 0 && (
        <ul className="mas-admin-list">
          {courses.map((c) => (
            <li key={c.id} className="mas-admin-row" style={{ flexWrap: 'wrap' }}>
              <div className="mas-admin-main">
                <h3 className="mas-admin-name">{c.title}</h3>
                <p className="mas-admin-meta">
                  <span className={`mas-outcome ${c.is_published ? 'is-pass' : 'is-refer'}`}>
                    {c.is_published ? 'Published' : 'Draft'}
                  </span>
                  <span className="mas-admin-sub">
                    {prettyDate(c.starts_on)}
                    {c.ends_on ? ` – ${prettyDate(c.ends_on)}` : ''}
                    {c.state ? ` · ${c.state}` : ''}
                    {c.venue ? ` · ${c.venue}` : ''}
                  </span>
                </p>
              </div>
              <div className="mas-admin-action" style={{ display: 'flex', gap: '0.5rem' }}>
                <button className="mas-btn-ghost" onClick={() => togglePublish(c)} disabled={busyId === c.id}>
                  {busyId === c.id ? '…' : c.is_published ? 'Unpublish' : 'Publish'}
                </button>
                <button className="mas-btn-ghost" onClick={() => remove(c)} disabled={busyId === c.id}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
