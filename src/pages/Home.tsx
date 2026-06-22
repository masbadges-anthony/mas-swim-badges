import { Link } from 'react-router-dom';
import '../styles/home.css';

// Accent colours are placeholders — swap for the official badge artwork colours.
const LEVELS: { name: string; c: string }[] = [
  { name: 'Starfish',   c: '#E8662B' },
  { name: 'Sea Turtle', c: '#1FA36B' },
  { name: 'Guppy',      c: '#1F9ED1' },
  { name: 'Octopus',    c: '#8E44AD' },
  { name: 'Frog',       c: '#6AA84F' },
  { name: 'Swordfish',  c: '#C62026' },
  { name: 'Dolphin',    c: '#0a1f44' },
];

export default function Home() {
  return (
    <section className="mas-page">
      <header className="mas-hero">
        <p className="mas-eyebrow">Malaysia Aquatics</p>
        <h1 className="mas-hero-title">Malaysia’s national learn-to-swim badge programme</h1>
        <p className="mas-lede">
          From a child’s first day in the water to competitive readiness — seven
          badges, one national standard, independently assessed and verifiable by
          anyone.
        </p>
        <div className="mas-hero-cta">
          <Link className="mas-btn" to="/directory">Find a recognised centre</Link>
          <Link className="mas-btn mas-btn-ghost-light" to="/verify">Verify a certificate</Link>
        </div>
      </header>

      <div className="mas-pathway-wrap">
        <p className="mas-eyebrow">The pathway</p>
        <Link to="/the-programme" className="mas-pathway">
          {LEVELS.map((l, i) => (
            <span className="mas-path-step" key={l.name}>
              <span className="mas-path-dot" style={{ background: l.c }} />
              {l.name}
              {i < LEVELS.length - 1 && <span className="mas-path-arrow">→</span>}
            </span>
          ))}
        </Link>
      </div>

      <div className="mas-entry-grid is-three">
        <Link to="/for-parents" className="mas-entry">
          <h2>Parents</h2>
          <p>What the badges mean, how to find a centre, and how to verify your child’s certificate.</p>
          <span className="mas-entry-go">For parents →</span>
        </Link>
        <Link to="/for-centres" className="mas-entry">
          <h2>Centres</h2>
          <p>Join the national standard, get listed in the public directory, and access the registry.</p>
          <span className="mas-entry-go">For centres →</span>
        </Link>
        <Link to="/courses" className="mas-entry">
          <h2>Instructors &amp; examiners</h2>
          <p>The qualification pathway and the upcoming course schedule.</p>
          <span className="mas-entry-go">See courses →</span>
        </Link>
      </div>

      <Link to="/verify" className="mas-verify-strip">
        <div>
          <h2>Verify a certificate</h2>
          <p>Confirm any Swim Badges certificate is genuine by its serial.</p>
        </div>
        <span className="mas-entry-go">Check a serial →</span>
      </Link>

      <ul className="mas-trustbar">
        <li><strong>National standard</strong><span>One syllabus, seven badges</span></li>
        <li><strong>Recognised centres</strong><span>Vetted and listed publicly</span></li>
        <li><strong>Child-safe</strong><span>Independent assessment</span></li>
        <li><strong>Verifiable</strong><span>Every certificate by serial</span></li>
      </ul>
    </section>
  );
}
