import '../styles/admin.css';

const EMAIL = 'badges.mas@gmail.com';

export default function Contact() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Contact</p>
        <h1>Get in touch</h1>
        <p className="mas-lede">
          Reach the programme office for general enquiries, centre recognition, or
          instructor and examiner courses.
        </p>
      </header>

      <ul className="mas-admin-list">
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">General enquiries</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub"><a href={`mailto:${EMAIL}`}>{EMAIL}</a></span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">Becoming a recognised centre</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">Email us, or apply directly in the portal under “Apply as a centre”.</span></p>
        </div></li>
        <li className="mas-admin-row"><div className="mas-admin-main">
          <h3 className="mas-admin-name">Instructor &amp; examiner courses</h3>
          <p className="mas-admin-meta"><span className="mas-admin-sub">See the Courses page for the schedule, or email us to register interest.</span></p>
        </div></li>
      </ul>

      <p className="mas-field-note">Organisation: Malaysia Aquatics (MAS) — Swim Badges programme.</p>
    </section>
  );
}
