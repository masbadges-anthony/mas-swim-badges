import { Link } from 'react-router-dom';
import '../styles/admin.css';

// Outcome lines are drawn from the programme manual (Edition 1.4).
// Accent colours are placeholders — replace with the official badge artwork colours.
const LEVELS: { name: string; accent: string; outcome: string }[] = [
  { name: 'Starfish',  accent: '#E8662B', outcome: 'Water familiarisation, breath control, and basic floating and gliding.' },
  { name: 'Sea Turtle',accent: '#1FA36B', outcome: 'Self-survival to the wall, with the first stroke shapes on front and back.' },
  { name: 'Guppy',     accent: '#1F9ED1', outcome: 'Front crawl with breathing, backstroke, and deep-water treading.' },
  { name: 'Octopus',   accent: '#8E44AD', outcome: 'Bilateral breathing, breaststroke kick, sit dive, and survival backstroke.' },
  { name: 'Frog',      accent: '#6AA84F', outcome: 'Full breaststroke, dolphin kick, sculling, a basic flip turn, and squat dive.' },
  { name: 'Swordfish', accent: '#C62026', outcome: 'Butterfly, breaststroke pullout, tumble and open turns, and sidestroke.' },
  { name: 'Dolphin',   accent: '#1E2752', outcome: 'All four strokes to competitive distance, individual medley, backstroke dive, and a timed qualification.' },
];

export default function TheProgramme() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">The programme</p>
        <h1>Seven badges, one national pathway</h1>
        <p className="mas-lede">
          The MAS Swim Badges programme is a national learn-to-swim framework that
          takes a child from their very first day in the water through to
          competitive readiness — a clear, standardised pathway with the same
          meaning at every recognised centre in the country.
        </p>
      </header>

      <ul className="mas-admin-list">
        {LEVELS.map((l, i) => (
          <li
            key={l.name}
            className="mas-admin-row"
            style={{ borderLeft: `6px solid ${l.accent}`, paddingLeft: '0.9rem' }}
          >
            <div className="mas-admin-main">
              <h2 className="mas-admin-name">
                <span style={{ color: l.accent }}>{i + 1}.</span> {l.name}
              </h2>
              <p className="mas-admin-meta">
                <span className="mas-admin-sub">{l.outcome}</span>
              </p>
            </div>
          </li>
        ))}
      </ul>

      <header className="mas-page-head mas-section-head">
        <h2>How assessment works</h2>
      </header>
      <p className="mas-lede">
        A child is prepared by their instructor, then assessed by an independent
        examiner who has no conflict of interest with the candidate. On a pass,
        a certificate is issued with a unique serial that anyone can verify
        online. The badge certifies the swimmer — it is the same standard
        wherever it is earned, and progression follows the pathway in order
        without skipping levels.
      </p>

      <header className="mas-page-head mas-section-head">
        <h2>Fees</h2>
      </header>
      <p className="mas-lede">
        Assessment fees are set nationally — RM 50 per level for Starfish, Sea
        Turtle and Guppy, and RM 75 per level for Octopus, Frog, Swordfish and
        Dolphin. Centres may set their own tuition separately.
      </p>

      <div className="mas-form-actions" style={{ marginTop: '1.25rem' }}>
        <Link className="mas-btn-primary" to="/directory">Find a recognised centre</Link>
        <Link className="mas-btn-ghost" to="/verify">Verify a certificate</Link>
      </div>
    </section>
  );
}
