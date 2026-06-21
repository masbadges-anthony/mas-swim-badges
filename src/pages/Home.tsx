import { Link } from 'react-router-dom';

export default function Home() {
  return (
    <section className="mas-page">
      <header className="mas-hero">
        <p className="mas-eyebrow">Malaysia Aquatics</p>
        <h1 className="mas-hero-title">Swim Badges</h1>
        <p className="mas-lede">
          The national registry for the Learn-to-Swim Badges programme — seven
          levels from Starfish to Dolphin.
        </p>
      </header>

      <div className="mas-entry-grid">
        <Link to="/directory" className="mas-entry">
          <h2>Find a swim centre</h2>
          <p>Browse centres recognised to run the programme, by state.</p>
          <span className="mas-entry-go">Open directory →</span>
        </Link>

        <Link to="/verify" className="mas-entry">
          <h2>Verify a certificate</h2>
          <p>Confirm a Swim Badges certificate is genuine by its serial.</p>
          <span className="mas-entry-go">Check a serial →</span>
        </Link>
      </div>
    </section>
  );
}
