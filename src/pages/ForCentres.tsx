import { Link } from 'react-router-dom';
import '../styles/admin.css';

export default function ForCentres() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">For centres</p>
        <h1>Become a recognised partner centre</h1>
        <p className="mas-lede">
          Recognition places your swim school inside Malaysia’s national badge
          standard — a credential parents can trust and verify, and a clear point
          of difference for your centre.
        </p>
      </header>

      <header className="mas-page-head mas-section-head"><h2>Why join</h2></header>
      <p className="mas-lede">
        Recognised centres are listed in the public directory, gain access to the
        registry portal to register candidates and book assessments, and can offer
        their swimmers nationally recognised, independently assessed certificates
        that anyone can verify by serial.
      </p>

      <header className="mas-page-head mas-section-head"><h2>What’s required</h2></header>
      <p className="mas-lede">
        A centre maintains at least one MAS Badges–certified instructor, follows
        the national syllabus and assessment process, and upholds the programme’s
        child-safety standards. Assessments are always conducted by an independent
        examiner, never by the centre’s own instructor of record.
      </p>

      <header className="mas-page-head mas-section-head"><h2>The recognition process</h2></header>
      <ul className="mas-admin-list">
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">1. Apply</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Create an account and submit your centre application in the portal.</span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">2. Review</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">The committee reviews eligibility and your certified instructor of record.</span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">3. Recognised &amp; listed</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">On approval, your centre appears in the public directory and can begin registering candidates.</span></p>
        </div></li>
      </ul>

      <div className="mas-form-actions" style={{ marginTop: '1.25rem' }}>
        <Link className="mas-btn-primary" to="/centres/apply">Apply to become a recognised centre</Link>
        <Link className="mas-btn-ghost" to="/courses">See instructor courses</Link>
      </div>
    </section>
  );
}
