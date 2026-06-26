import { Link } from 'react-router-dom';
import { GUIDES } from '../data/guides';

export default function Guides() {
  return (
    <section className="mas-page mas-guides">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Guides</p>
        <h1>How the programme works, for you</h1>
        <p className="mas-lede">
          Clear walk-throughs for every part of MAS BADGES — from getting your
          child started, to becoming an instructor, to how assessment and
          certification actually run.
        </p>
      </header>

      <div className="mas-guidegrid">
        {GUIDES.map((g) => (
          <Link key={g.slug} to={`/guides/${g.slug}`} className="mas-guidecard" style={{ ['--lvl' as string]: g.accent }}>
            <span className="mas-guidecard-aud">{g.audience}</span>
            <h2>{g.title}</h2>
            <p>{g.summary}</p>
            <span className="mas-guidecard-go">Read the guide →</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
