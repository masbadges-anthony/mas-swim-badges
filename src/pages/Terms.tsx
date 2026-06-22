import '../styles/admin.css';

export default function Terms() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Legal</p>
        <h1>Terms of use</h1>
        <p className="mas-lede">The terms governing use of the MAS Swim Badges website and portal.</p>
      </header>

      <p className="mas-status mas-status-bad">Draft — pending legal review.</p>

      <header className="mas-page-head mas-section-head"><h2>Use of the service</h2></header>
      <p className="mas-lede">
        The website provides information and public verification; the portal is for
        authorised officers, examiners, instructors, centres, and parents. Accounts
        and roles are granted by the programme and must not be shared or misused.
      </p>

      <header className="mas-page-head mas-section-head"><h2>Programme intellectual property</h2></header>
      <p className="mas-lede">
        The badge names, syllabus, artwork, and marks are the intellectual property
        of the MAS Swim Badges programme. They may not be reproduced or used to
        imply recognition without authorisation.
      </p>

      <header className="mas-page-head mas-section-head"><h2>Certificates</h2></header>
      <p className="mas-lede">
        Certificates are issued on a passed assessment and may be revoked where
        issued in error or in breach of programme rules. Verification reflects the
        current status of a certificate.
      </p>

      <p className="mas-field-note">© Malaysia Aquatics — Swim Badges programme.</p>
    </section>
  );
}
