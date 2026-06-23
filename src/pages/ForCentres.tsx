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
        Recognised centres are listed in the public directory, can register
        candidates and book independently-assessed assessments, and can offer
        their swimmers nationally recognised certificates that anyone can verify
        by serial. Recognised centres and their instructors are also rated and
        audited over time, building trust with parents.
      </p>

      <header className="mas-page-head mas-section-head"><h2>What’s required</h2></header>
      <p className="mas-lede">
        Every partner centre must keep at least one MAS Badges–certified
        instructor on its roster — the centre-appointed instructor who registers
        and represents the centre. The centre follows the national syllabus and
        assessment process and upholds the programme’s child-safety standards.
        Assessments are always conducted by an independent examiner, never by the
        centre’s own instructor.
      </p>

      <header className="mas-page-head mas-section-head"><h2>How partnership works</h2></header>
      <ul className="mas-admin-list">
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">1. Enquire</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Send us an enquiry. We’ll explain the requirements, benefits, and fees, and help you get started.</span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">2. Appoint a certified instructor</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Your centre-appointed MAS Badges–certified instructor registers the centre. Don’t have one yet? See the instructor course schedule.</span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">3. Approval &amp; billing</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Malaysia Aquatics reviews your application. Once approved and the partnership fee is settled, your centre is recognised.</span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">4. Recognised &amp; listed</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Your centre appears in the public directory and can begin registering candidates and booking assessments.</span></p>
        </div></li>
      </ul>

      <div className="mas-form-actions" style={{ marginTop: '1.25rem' }}>
        <Link className="mas-btn-primary" to="/contact?topic=centre">Enquire about partnership</Link>
        <Link className="mas-btn-ghost" to="/courses">See instructor courses</Link>
      </div>
    </section>
  );
}
