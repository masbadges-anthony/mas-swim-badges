import { Link, useParams } from 'react-router-dom';
import { GUIDES } from '../data/guides';
import EditableText from '../components/EditableText';

export default function GuideDetail() {
  const { slug } = useParams();
  const guide = GUIDES.find((g) => g.slug === slug);

  if (!guide) {
    return (
      <section className="mas-page">
        <header className="mas-page-head">
          <h1><EditableText keyName="guides.detail.notfound.title">Guide not found</EditableText></h1>
          <p className="mas-lede">
            <EditableText keyName="guides.detail.notfound.lede">That guide doesn’t exist or has moved.</EditableText>
          </p>
        </header>
        <Link to="/guides" className="mas-link"><EditableText keyName="guides.detail.notfound.back">← All guides</EditableText></Link>
      </section>
    );
  }

  return (
    <section className="mas-page mas-guide" style={{ ['--lvl' as string]: guide.accent }}>
      <Link to="/guides" className="mas-guide-back"><EditableText keyName="guides.detail.back">← All guides</EditableText></Link>
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
        <Link to="/guides" className="mas-link"><EditableText keyName="guides.detail.foot.back">← Back to all guides</EditableText></Link>
        <Link to="/faq" className="mas-link"><EditableText keyName="guides.detail.foot.faq">Browse the FAQ →</EditableText></Link>
      </div>
    </section>
  );
}
