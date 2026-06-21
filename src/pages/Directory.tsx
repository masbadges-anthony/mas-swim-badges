import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { MALAYSIAN_STATES, type DirectoryCenter } from '../lib/types';

type Load = 'loading' | 'ready' | 'error';

export default function Directory() {
  const [centers, setCenters] = useState<DirectoryCenter[]>([]);
  const [state, setState] = useState<string>('');
  const [load, setLoad] = useState<Load>('loading');

  useEffect(() => {
    let cancelled = false;
    setLoad('loading');

    (async () => {
      let query = supabase
        .from('partner_center_directory')
        .select('*')
        .order('name');

      if (state) query = query.eq('state', state);

      const { data, error } = await query;
      if (cancelled) return;

      if (error) {
        setLoad('error');
        return;
      }
      setCenters((data ?? []) as DirectoryCenter[]);
      setLoad('ready');
    })();

    return () => {
      cancelled = true;
    };
  }, [state]);

  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Recognised partners</p>
        <h1>Find a swim centre</h1>
        <p className="mas-lede">
          Centres recognised by Malaysia Aquatics to prepare and present candidates
          for the Swim Badges programme.
        </p>
      </header>

      <div className="mas-toolbar">
        <label htmlFor="state" className="mas-field-label">State</label>
        <select
          id="state"
          className="mas-select"
          value={state}
          onChange={(e) => setState(e.target.value)}
        >
          <option value="">All states</option>
          {MALAYSIAN_STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {load === 'loading' && <p className="mas-status">Loading centres…</p>}

      {load === 'error' && (
        <p className="mas-status mas-status-bad">
          Couldn’t load the directory just now. Refresh to try again.
        </p>
      )}

      {load === 'ready' && centers.length === 0 && (
        <p className="mas-status">
          No recognised centres{state ? ` in ${state}` : ''} yet.
        </p>
      )}

      {load === 'ready' && centers.length > 0 && (
        <ul className="mas-card-grid">
          {centers.map((c) => (
            <li key={c.id} className="mas-card">
              <h2 className="mas-card-title">{c.name}</h2>
              <p className="mas-card-state">{c.state}</p>
              {c.address && <p className="mas-card-line">{c.address}</p>}
              <div className="mas-card-contact">
                {c.contact_phone && <span>{c.contact_phone}</span>}
                {c.contact_email && (
                  <a href={`mailto:${c.contact_email}`}>{c.contact_email}</a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
