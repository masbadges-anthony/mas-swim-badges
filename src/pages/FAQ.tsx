import '../styles/admin.css';

interface QA { q: string; a: string; }

const PARENTS: QA[] = [
  { q: 'What is a MAS Swim Badge?', a: 'A nationally recognised learn-to-swim credential. Each badge marks a defined set of skills, assessed by an independent examiner, with a verifiable certificate.' },
  { q: 'How do I find a centre?', a: 'Use Find a Centre to see recognised centres by state. Only currently recognised centres appear there.' },
  { q: 'How do I verify my child’s certificate?', a: 'Enter the certificate serial on the Verify page. You’ll see the level, issue date, and whether it’s valid.' },
  { q: 'How do I claim my child’s record?', a: 'When your child is registered you’ll receive a claim code. Sign up, open “My child’s badges”, and enter the code to link their record.' },
];

const CENTRES: QA[] = [
  { q: 'How does a centre get recognised?', a: 'Create an account, submit the centre application in the portal, and the committee reviews it. On approval you’re listed in the public directory.' },
  { q: 'Do we need a certified instructor?', a: 'Yes. A recognised centre maintains at least one MAS Badges–certified instructor as its instructor of record.' },
  { q: 'Who assesses our swimmers?', a: 'An independent examiner with no conflict of interest — never the centre’s own instructor of record.' },
];

const TRAINERS: QA[] = [
  { q: 'How do I become an instructor?', a: 'Complete a MAS Badges instructor course. See the Courses page for the schedule; on certification you’re onboarded by email.' },
  { q: 'How do I become an examiner?', a: 'Examiners are selected and trained through the examiner course and deployed by state under the Chief Examiner.' },
];

function Block({ title, items }: { title: string; items: QA[] }) {
  return (
    <>
      <header className="mas-page-head mas-section-head"><h2>{title}</h2></header>
      <ul className="mas-admin-list">
        {items.map((x) => (
          <li key={x.q} className="mas-admin-row"><div className="mas-admin-main">
            <h3 className="mas-admin-name">{x.q}</h3>
            <p className="mas-admin-meta"><span className="mas-admin-sub">{x.a}</span></p>
          </div></li>
        ))}
      </ul>
    </>
  );
}

export default function FAQ() {
  return (
    <section className="mas-page">
      <header className="mas-page-head">
        <p className="mas-eyebrow">Help</p>
        <h1>Frequently asked questions</h1>
        <p className="mas-lede">Answers for parents, centres, and prospective instructors and examiners.</p>
      </header>
      <Block title="For parents" items={PARENTS} />
      <Block title="For centres" items={CENTRES} />
      <Block title="For instructors &amp; examiners" items={TRAINERS} />
    </section>
  );
}
