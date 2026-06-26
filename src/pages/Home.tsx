import { Link } from 'react-router-dom';
import { LEVELS } from '../data/levels';

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
          <p className="mas-eyebrow-pill">Swimming Proficiency Test</p>
          <h1 className="mas-home-title">Learn-to-Swim Badges</h1>
          <p className="mas-home-sub">
            A skill-progression programme for swimmers aged 5–12 — from first
            water familiarisation through to competitive readiness, across seven
            levels.
          </p>
          <div className="mas-home-cta">
            <Link to="/directory" className="mas-btn-solid">Find a swim centre</Link>
            <Link to="/verify" className="mas-btn-outline-light">Verify a certificate</Link>
          </div>
        </div>
      </header>

      <section className="mas-levels">
        <div className="mas-levels-head">
          <h2>Seven levels</h2>
          <span className="mas-levels-arrow">Starfish → Dolphin</span>
        </div>
        <div className="mas-levelstrip">
          {LEVELS.map((l) => (
            <article key={l.key} className="mas-levelcard" style={{ ['--lvl' as string]: l.color }}>
              <div className="mas-levelcard-badge">
                <img src={l.badge} alt={`${l.name} badge`} loading="lazy" />
              </div>
              <span className="mas-levelcard-no">Level {l.level}</span>
              <span className="mas-levelcard-name">{l.name}</span>
              <p className="mas-levelcard-blurb">{l.blurb}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="mas-entry-grid">
        <Link to="/programme" className="mas-entry">
          <h2>About the programme</h2>
          <p>How the seven levels work, what each badge means, and how children progress.</p>
          <span className="mas-entry-go">Explore the levels →</span>
        </Link>
        <Link to="/for-centres" className="mas-entry">
          <h2>Run the programme</h2>
          <p>For swim schools: become a recognised Malaysia Aquatics partner centre.</p>
          <span className="mas-entry-go">For centres →</span>
        </Link>
      </div>
    </section>
  );
}
