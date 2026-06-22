import '../styles/admin.css';

export default function Privacy() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Legal</p>
        <h1>Privacy policy</h1>
        <p className="mas-lede">How the MAS Swim Badges programme handles personal data, including children’s data.</p>
      </header>

      <p className="mas-status mas-status-bad">Draft — pending legal review and confirmation of the programme’s data controller.</p>

      <header className="mas-page-head mas-section-head"><h2>What we collect</h2></header>
      <p className="mas-lede">
        The registry holds the minimum needed to operate the programme: a
        candidate’s name and date of birth, the centre and instructor associated
        with their assessment, and their badge results. We do not collect national
        identity numbers, addresses, photographs, medical, or school information.
      </p>

      <header className="mas-page-head mas-section-head"><h2>How verification protects children</h2></header>
      <p className="mas-lede">
        Certificates are verified by a unique, non-guessable serial. The registry
        cannot be browsed or harvested for children’s names — verification confirms
        a single certificate without exposing any other record.
      </p>

      <header className="mas-page-head mas-section-head"><h2>Consent, access, and retention</h2></header>
      <p className="mas-lede">
        A parent or guardian can claim and link their child’s record. Retention
        periods and the handling of erasure requests against the immutable
        certificate ledger are being finalised as part of the programme’s
        governance decisions and will be stated here once confirmed.
      </p>

      <p className="mas-field-note">This policy will be completed in line with Malaysia’s PDPA once the data-controller decision is settled.</p>
    </section>
  );
}
