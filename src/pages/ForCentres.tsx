import { Link } from 'react-router-dom';

export default function ForCentres() {
  return (
    <section className="mas-page mas-forcentres">
      <header className="mas-page-head">
        <p className="mas-eyebrow">For centres</p>
        <h1>Become a recognised partner centre</h1>
        <p className="mas-lede">
          Recognition places your swim school inside Malaysia’s national badge
          standard — a credential parents can trust and verify, and a clear point
          of difference for your centre.
        </p>
      </header>

      <div className="mas-centre-grid">
        <article className="mas-centre-block" style={{ ['--lvl' as string]: '#1D87E4' }}>
          <h3>Why join</h3>
          <ul>
            <li>Listed in the public centre directory</li>
            <li>Register candidates and book independently-assessed sessions</li>
            <li>Nationally recognised, verifiable certificates for your swimmers</li>
            <li>Recognition and audit that builds trust with parents over time</li>
          </ul>
        </article>
        <article className="mas-centre-block" style={{ ['--lvl' as string]: '#26A59A' }}>
          <h3>What’s required</h3>
          <ul>
            <li>At least one MAS BADGES–certified instructor on your roster <strong>at all times</strong></li>
            <li>Delivery of the national syllabus and assessment process</li>
            <li>Upholding the programme’s child-safety standards</li>
            <li>Assessments by an independent examiner — never your own instructor</li>
          </ul>
        </article>
      </div>

      <header className="mas-page-head mas-section-head" style={{ marginTop: '2rem' }}><h2>How partnership works</h2></header>
      <article className="mas-centre-block" style={{ ['--lvl' as string]: '#FF7042' }}>
        <ol>
          <li><strong>Enquire.</strong> Send us an enquiry — we’ll explain the requirements, benefits, and fees, and help you get started.</li>
          <li><strong>Appoint a certified instructor.</strong> Your centre-appointed BADGES instructor registers the centre. Don’t have one yet? See the instructor course schedule.</li>
          <li><strong>Approval &amp; billing.</strong> Malaysia Aquatics reviews your application; once approved and the partnership fee is settled, your centre is recognised.</li>
          <li><strong>Recognised &amp; listed.</strong> Your centre appears in the public directory and can begin registering candidates and booking assessments.</li>
        </ol>
      </article>

      <div className="mas-centre-note mas-alert is-info" style={{ marginTop: '1.25rem' }}>
        <div className="mas-alert-body">
          <p className="mas-alert-title">No certified instructor yet?</p>
          <p className="mas-alert-text">
            A centre can only deliver the syllabus through a certified instructor — so appoint,
            train, or partner with one first. See the{' '}
            <Link to="/guides/instructor-pathway" className="mas-link">instructor pathway</Link>, or the{' '}
            <Link to="/courses" className="mas-link">upcoming courses</Link>.
          </p>
        </div>
      </div>

      <div className="mas-cta-band">
        <h2>Ready to join the national standard?</h2>
        <p>Tell us about your centre and we’ll guide you through recognition, step by step.</p>
        <div className="mas-cta-row">
          <Link className="mas-btn-solid" to="/contact?topic=centre">Enquire about partnership</Link>
          <Link className="mas-btn-outline-light" to="/courses">See instructor courses</Link>
        </div>
      </div>
    </section>
  );
}
