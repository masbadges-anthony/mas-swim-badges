import { Link } from 'react-router-dom';
import EditableText from '../components/EditableText';

const ROLES = [
  { title: 'Chairperson', body: 'Leads the programme and is accountable for its governance and direction.' },
  { title: 'Chief Examiner', body: 'Owns the assessment standard — examiner certification, audits, and the integrity of every result.' },
  { title: 'Master Trainer', body: 'Develops and delivers the instructor and examiner certification courses.' },
  { title: 'Coaching & Technical Board', body: 'Governs the syllabus and technical standards, with the MAS Board ratifying major decisions.' },
];

const TRUST = [
  { lvl: '#1D87E4', mark: '⇄', title: 'Independent assessment', body: 'A firewall between teaching and judging — an examiner never assesses a swimmer they taught.' },
  { lvl: '#26A59A', mark: '①', title: 'One national standard', body: 'The same seven-level syllabus and criteria at every recognised centre in the country.' },
  { lvl: '#FF7042', mark: '✓', title: 'Verifiable certificates', body: 'Serialised, issued only on a genuine pass, and publicly verifiable — without exposing a child’s identity.' },
];

export default function About() {
  return (
    <section className="mas-page mas-about">
      <header className="mas-page-head">
        <p className="mas-eyebrow"><EditableText keyName="about.header.eyebrow">About</EditableText></p>
        <h1><EditableText keyName="about.header.title">About the programme</EditableText></h1>
        <p className="mas-lede">
          <EditableText keyName="about.header.lede">
            MAS Swim Badges is the national Learn-to-Swim certification framework of
            Malaysia Aquatics — built to give every Malaysian child a clear,
            standardised pathway from their first day in the water through to
            competitive readiness.
          </EditableText>
        </p>
      </header>

      <header className="mas-page-head mas-section-head"><h2><EditableText keyName="about.run.title">How it’s run</EditableText></h2></header>
      <p className="mas-lede">
        <EditableText keyName="about.run.body">
          The programme is governed by Malaysia Aquatics through its Board and its
          Coaching & Technical Board. A Chairperson leads the programme, a Chief
          Examiner oversees assessment standards, and certified Master Trainers run
          the instructor and examiner courses. Examiners are selected and deployed by
          state, and assessments are always independent of the centres being assessed.
        </EditableText>
      </p>

      <header className="mas-page-head mas-section-head"><h2><EditableText keyName="about.governs.title">Who governs it</EditableText></h2></header>
      <div className="mas-gov-grid">
        {ROLES.map((r) => (
          <article key={r.title} className="mas-gov-card">
            <h3>{r.title}</h3>
            <p>{r.body}</p>
          </article>
        ))}
      </div>
      <p className="mas-field-note" style={{ marginTop: '0.85rem' }}>
        <EditableText keyName="about.governs.note">
          Office-holder names are published in the official MAS Accreditation & Badges Awards booklet.
        </EditableText>
      </p>

      <header className="mas-page-head mas-section-head"><h2><EditableText keyName="about.trust.title">What makes a badge trustworthy</EditableText></h2></header>
      <div className="mas-trust-grid">
        {TRUST.map((t) => (
          <article key={t.title} className="mas-trust-card" style={{ ['--lvl' as string]: t.lvl }}>
            <div className="mas-trust-ico" aria-hidden="true">{t.mark}</div>
            <h3>{t.title}</h3>
            <p>{t.body}</p>
          </article>
        ))}
      </div>

      <div className="mas-cta-band">
        <h2><EditableText keyName="about.cta.title">Seven badges, one national pathway</EditableText></h2>
        <p><EditableText keyName="about.cta.body">See how a child progresses from Starfish to Dolphin — and find a recognised centre near you.</EditableText></p>
        <div className="mas-cta-row">
          <Link className="mas-btn-solid" to="/the-programme">Explore the seven badges</Link>
          <Link className="mas-btn-outline-light" to="/contact">Contact us</Link>
        </div>
      </div>
    </section>
  );
}
