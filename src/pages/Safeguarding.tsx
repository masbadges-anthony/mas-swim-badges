import '../styles/admin.css';

export default function Safeguarding() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Legal</p>
        <h1>Child-safeguarding statement</h1>
        <p className="mas-lede">Our commitment to the safety of children in the programme.</p>
      </header>

      <header className="mas-page-head mas-section-head"><h2>Independent assessment</h2></header>
      <p className="mas-lede">
        Every assessment is conducted by an independent examiner who has no
        conflict of interest with the candidate. An examiner is never permitted to
        assess a child they prepared, and this rule is enforced in the registry
        itself.
      </p>

      <header className="mas-page-head mas-section-head"><h2>Data minimisation &amp; privacy</h2></header>
      <p className="mas-lede">
        We hold only the minimum information needed to run the programme and never
        expose candidate details publicly. Certificate verification works by
        non-guessable serial, so the registry cannot be browsed for children’s
        information.
      </p>

      <header className="mas-page-head mas-section-head"><h2>Reporting a concern</h2></header>
      <p className="mas-lede">
        Any safeguarding concern can be raised with the programme office. Concerns
        are treated seriously and handled by the committee.
      </p>

      <p className="mas-field-note">Draft — to be confirmed alongside the programme’s governance and legal review.</p>
    </section>
  );
}
