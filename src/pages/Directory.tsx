import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { MALAYSIAN_STATES, type DirectoryCenter } from '../lib/types';
import EditableText from '../components/EditableText';

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
        <p className="mas-eyebrow"><EditableText keyName="directory.header.eyebrow">Recognised partners</EditableText></p>
        <h1><EditableText keyName="directory.header.title">Find a swim centre</EditableText></h1>
        <p className="mas-lede">
          <EditableText keyName="directory.header.lede">
            Centres recognised by Malaysia Aquatics to prepare and present candidates
            for the Swim Badges programme. Only recognised centres appear here.
          </EditableText>
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

      {load === 'loading' && (
        <p className="mas-status">
          <EditableText keyName="directory.status.loading">Loading centres…</EditableText>
        </p>
      )}

      {load === 'error' && (
        <p className="mas-status mas-status-bad">
          <EditableText keyName="directory.status.error">
            Couldn’t load the directory just now. Refresh to try again.
          </EditableText>
        </p>
      )}

      {load === 'ready' && centers.length === 0 && (
        <p className="mas-status">
          <EditableText keyName="directory.status.empty">No recognised centres</EditableText>
          {state ? ` in ${state} ` : ' '}
          <EditableText keyName="directory.status.emptySuffix">yet.</EditableText>
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

      {/* ---- Become a partner centre (folded in from For Centres) ---- */}
      <section className="mas-centre-join">
        <div className="mas-centre-join-head">
          <p className="mas-eyebrow"><EditableText keyName="directory.join.eyebrow">Run the programme</EditableText></p>
          <h2><EditableText keyName="directory.join.title">Become a recognised partner centre</EditableText></h2>
          <p className="mas-lede">
            <EditableText keyName="directory.join.lede">
              A partner centre is the venue and the umbrella for the programme —
              recognised by Malaysia Aquatics, listed in this directory, and able to
              present swimmers for national certification.
            </EditableText>
          </p>
        </div>

        <div className="mas-centre-grid">
          <article className="mas-centre-block" style={{ ['--lvl' as string]: '#1D87E4' }}>
            <h3><EditableText keyName="directory.join.why.title">Why join</EditableText></h3>
            <ul>
              <li>National recognition by Malaysia Aquatics</li>
              <li>A listing in this public centre directory</li>
              <li>Access to the registry portal</li>
              <li>Verifiable certificates for your swimmers</li>
            </ul>
          </article>

          <article className="mas-centre-block" style={{ ['--lvl' as string]: '#26A59A' }}>
            <h3><EditableText keyName="directory.join.required.title">What’s required</EditableText></h3>
            <ul>
              <li>A certified BADGES instructor on your roster <strong>at all times</strong> — ideally the owner or manager</li>
              <li>A suitable, approved pool facility</li>
              <li>Good standing and the relevant insurance</li>
              <li>Commitment to the Partner Centre Code and an annual return</li>
            </ul>
          </article>

          <article className="mas-centre-block" style={{ ['--lvl' as string]: '#FF7042' }}>
            <h3><EditableText keyName="directory.join.how.title">How recognition works</EditableText></h3>
            <ol>
              <li>Your certified instructor registers the centre in the portal</li>
              <li>The Chairperson reviews it against the published criteria</li>
              <li>On approval and fee settlement, the centre is recognised</li>
              <li>Your centre appears in this directory</li>
            </ol>
          </article>
        </div>

        <div className="mas-centre-note mas-alert is-info">
          <div className="mas-alert-body">
            <p className="mas-alert-title"><EditableText keyName="directory.join.note.title">Don’t have a certified instructor yet?</EditableText></p>
            <p className="mas-alert-text">
              A centre can only deliver the syllabus through a certified instructor —
              so appoint, train, or partner with one first. Partner-centre membership
              entitles you to a place on the annual regional instructor course.
              See the <Link to="/guides/instructor-pathway" className="mas-link">instructor pathway</Link>.
            </p>
          </div>
        </div>

        <div className="mas-centre-cta">
          <Link className="mas-btn-solid-navy" to="/for-centres">Apply to become a partner centre</Link>
          <Link className="mas-btn-ghost-navy" to="/faq#faq-centres">Partner-centre FAQ</Link>
        </div>
      </section>
    </section>
  );
}
