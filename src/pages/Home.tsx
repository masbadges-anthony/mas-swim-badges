import { Link } from 'react-router-dom';
import { LEVELS } from '../data/levels';
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

export default function Home() {
  return (
    <section className="mas-page mas-home">
      <header className="mas-home-hero">
        <span className="mas-hero-halftone" aria-hidden="true" />
        <svg className="mas-hero-waves" viewBox="0 0 1200 260" preserveAspectRatio="none" aria-hidden="true">
          <g fill="none" stroke="#ffffff" strokeWidth="2">
            <path d="M0 150 C 200 110 360 200 560 160 S 980 110 1200 160" strokeOpacity="0.16" />
            <path d="M0 190 C 220 150 380 240 600 200 S 1000 150 1200 200" strokeOpacity="0.12" />
            <path d="M0 110 C 180 80 380 150 600 110 S 1020 60 1200 110" strokeOpacity="0.10" />
          </g>
        </svg>
        <div className="mas-home-hero-inner">
          <p className="mas-eyebrow-pill">
            <EditableText keyName="home.hero.eyebrow">Swimming Proficiency Test</EditableText>
          </p>
          <h1 className="mas-home-title">
            <EditableText keyName="home.hero.title">Learn-to-Swim Badges</EditableText>
          </h1>
          <p className="mas-home-sub">
            <EditableText keyName="home.hero.subtitle">
              A skill-progression programme for swimmers aged 5–12 — from first water familiarisation through to competitive readiness, across seven levels.
            </EditableText>
          </p>
          <div className="mas-home-cta">
            <Link to="/directory" className="mas-btn-solid">Find a swim centre</Link>
            <Link to="/verify" className="mas-btn-outline-light">Verify a certificate</Link>
          </div>
        </div>
      </header>

      <section className="mas-levels">
        <div className="mas-levels-head">
          <h2><EditableText keyName="home.levels.title">Seven levels</EditableText></h2>
          <span className="mas-levels-arrow">Starfish → Dolphin</span>
        </div>
        <div className="mas-levelstrip">
          {LEVELS.map((l) => (
            <Link
              key={l.key}
              className="mas-levelcard"
              to={`/the-programme#level-${l.level}`}
              style={{ ['--lvl' as string]: l.color }}
              aria-label={`Level ${l.level}: ${l.name} — see details on The Programme page`}
            >
              <div className="mas-levelcard-badge">
                <img src={l.badge} alt={`${l.name} badge`} loading="lazy" />
              </div>
              <span className="mas-levelcard-no">Level {l.level}</span>
              <span className="mas-levelcard-name">{l.name}</span>
              <p className="mas-levelcard-blurb">{l.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="mas-home-teasers" aria-label="Explore the programme">
        <article className="mas-teaser">
          <span className="mas-eyebrow">How it works</span>
          <h2>
            <EditableText keyName="home.teaser.howitworks.title">From first splash to finish line</EditableText>
          </h2>
          <p>
            <EditableText keyName="home.teaser.howitworks.body">
              Seven levels take a child from water familiarisation to competitive readiness — each one a clear, assessed step with a badge to show for it. No guesswork, just steady progress.
            </EditableText>
          </p>
          <Link to="/the-programme" className="mas-btn-solid-navy">See the programme</Link>
        </article>

        <article className="mas-teaser">
          <span className="mas-eyebrow">Find a centre near you</span>
          <h2>
            <EditableText keyName="home.teaser.findcentre.title">Learn at a centre you can trust</EditableText>
          </h2>
          <p>
            <EditableText keyName="home.teaser.findcentre.body">
              BADGES is taught at partner centres across Malaysia, each one accredited to the national standard. Find one near you and enrol your child.
            </EditableText>
          </p>
          <Link to="/directory" className="mas-btn-solid-navy">Find a swim centre</Link>
        </article>

        <article className="mas-teaser">
          <span className="mas-eyebrow">Teach with BADGES</span>
          <h2>
            <EditableText keyName="home.teaser.teach.title">Bring BADGES to your centre</EditableText>
          </h2>
          <p>
            Become an accredited instructor or partner centre and deliver a
            structured national curriculum, backed by a full teaching and
            assessment system.
          </p>
          <Link to="/courses" className="mas-btn-solid-navy">Explore courses</Link>
        </article>

        <article className="mas-teaser">
          <span className="mas-eyebrow">Keep levelling up</span>
          <h2>
            <EditableText keyName="home.teaser.levelup.title">Every level is a reason to keep going</EditableText>
          </h2>
          <p>
            Each badge marks real, assessed progress — a milestone a child can
            see and be proud of, and a clear next step to aim for. Good teaching
            and honest assessment keep swimmers moving from one level to the next.
          </p>
          <Link to="/guides/enrol" className="mas-btn-solid-navy">What to expect</Link>
        </article>
      </section>

      <section id="about" className="mas-home-about">
        <header className="mas-page-head mas-section-head">
          <p className="mas-eyebrow"><EditableText keyName="home.about.header.eyebrow">About</EditableText></p>
          <h2><EditableText keyName="home.about.header.title">About the programme</EditableText></h2>
          <p className="mas-lede">
            <EditableText keyName="home.about.header.lede">
              MAS Swim Badges is the national Learn-to-Swim certification framework of
              Malaysia Aquatics — built to give every Malaysian child a clear,
              standardised pathway from their first day in the water through to
              competitive readiness.
            </EditableText>
          </p>
        </header>

        <header className="mas-page-head mas-section-head"><h2><EditableText keyName="home.about.run.title">How it’s run</EditableText></h2></header>
        <p className="mas-lede">
          <EditableText keyName="home.about.run.body">
            The programme is governed by Malaysia Aquatics through its Board and its
            Coaching & Technical Board. A Chairperson leads the programme, a Chief
            Examiner oversees assessment standards, and certified Master Trainers run
            the instructor and examiner courses. Examiners are selected and deployed by
            state, and assessments are always independent of the centres being assessed.
          </EditableText>
        </p>

        <header className="mas-page-head mas-section-head"><h2><EditableText keyName="home.about.governs.title">Who governs it</EditableText></h2></header>
        <div className="mas-gov-grid">
          {ROLES.map((r) => (
            <article key={r.title} className="mas-gov-card">
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </article>
          ))}
        </div>
        <p className="mas-field-note" style={{ marginTop: '0.85rem' }}>
          <EditableText keyName="home.about.governs.note">
            Office-holder names are published in the official MAS Accreditation & Badges Awards booklet.
          </EditableText>
        </p>

        <header className="mas-page-head mas-section-head"><h2><EditableText keyName="home.about.trust.title">What makes a badge trustworthy</EditableText></h2></header>
        <div className="mas-trust-grid">
          {TRUST.map((t) => (
            <article key={t.title} className="mas-trust-card" style={{ ['--lvl' as string]: t.lvl }}>
              <div className="mas-trust-ico" aria-hidden="true">{t.mark}</div>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
            </article>
          ))}
        </div>

        <p className="mas-home-verify-note">
          Earned a badge? <Link to="/verify">You can verify any certificate online.</Link>
        </p>

        <div className="mas-cta-band">
          <h2><EditableText keyName="home.about.cta.title">Seven badges, one national pathway</EditableText></h2>
          <p><EditableText keyName="home.about.cta.body">See how a child progresses from Starfish to Dolphin — and find a recognised centre near you.</EditableText></p>
          <div className="mas-cta-row">
            <Link className="mas-btn-solid" to="/the-programme">Explore the seven badges</Link>
            <Link className="mas-btn-outline-light" to="/contact">Contact us</Link>
          </div>
        </div>
      </section>
    </section>
  );
}
