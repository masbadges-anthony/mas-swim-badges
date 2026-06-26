import { Link, useParams } from 'react-router-dom';
import { GUIDES } from '../data/guides';

export default function GuideDetail() {
  const { slug } = useParams();
  const guide = GUIDES.find((g) => g.slug === slug);

  if (!guide) {
    return (
      <section className="mas-page">
        <header className="mas-page-head">
          <h1>Guide not found</h1>
          <p className="mas-lede">That guide doesn’t exist or has moved.</p>
        </header>
        <Link to="/guides" className="mas-link">← All guides</Link>
      </section>
    );
  }

  return (
    <section className="mas-page mas-guide" style={{ ['--lvl' as string]: guide.accent }}>
      <Link to="/guides" className="mas-guide-back">← All guides</Link>
      <header className="mas-page-head mas-guide-head">
        <p className="mas-eyebrow" style={{ color: guide.accent }}>{guide.audience}</p>
        <h1>{guide.title}</h1>
        <p className="mas-lede">{guide.summary}</p>
      </header>

      {guide.sections.map((s, i) => (
        <section key={i} className="mas-guide-section">
          <h2>{s.heading}</h2>
          {s.body && <p>{s.body}</p>}
          {s.steps && (
            <ol className="mas-guide-steps">
              {s.steps.map((st, j) => <li key={j}>{st}</li>)}
            </ol>
          )}
          {s.points && (
            <ul className="mas-guide-points">
              {s.points.map((p, j) => <li key={j}>{p}</li>)}
            </ul>
          )}
          {s.note && <p className="mas-guide-note">{s.note}</p>}
        </section>
      ))}

      <div className="mas-guide-foot">
        <Link to="/guides" className="mas-link">← Back to all guides</Link>
        <Link to="/faq" className="mas-link">Browse the FAQ →</Link>
      </div>
    </section>
  );
}
