import { Link } from 'react-router-dom';
import '../styles/admin.css';

export default function About() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">About</p>
        <h1>About the programme</h1>
        <p className="mas-lede">
          MAS Swim Badges is the national learn-to-swim certification framework of
          Malaysia Aquatics — built to give every Malaysian child a clear,
          standardised pathway from their first day in the water through to
          competitive readiness.
        </p>
      </header>

      <header className="mas-page-head mas-section-head"><h2>How it’s run</h2></header>
      <p className="mas-lede">
        The programme is governed by Malaysia Aquatics through its Board and its
        Coaching &amp; Technical Board. A Chairperson leads the programme, a Chief
        Examiner oversees assessment standards, and certified trainers run the
        instructor and examiner courses. Examiners are selected and deployed by
        state, and assessments are independent of the centres being assessed.
      </p>

      <header className="mas-page-head mas-section-head"><h2>The committee</h2></header>
      <ul className="mas-admin-list">
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">Chairperson</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Name and short bio to be added.</span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">Chief Examiner</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Name and short bio to be added.</span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">Examiner Course Trainer</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Name and short bio to be added.</span></p>
        </div></li>
      </ul>
      <p className="mas-field-note">Committee names, bios, and photos to be supplied for publication.</p>

      <div className="mas-form-actions" style={{ marginTop: '1.25rem' }}>
        <Link className="mas-btn-primary" to="/the-programme">Explore the seven badges</Link>
        <Link className="mas-btn-ghost" to="/contact">Contact us</Link>
      </div>
    </section>
  );
}
