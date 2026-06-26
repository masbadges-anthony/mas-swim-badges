// src/data/guides.ts
// Narrative "how the system works for you" guides, grounded in the BADGES Manual,
// Assessment System Handbook, Teaching System Handbook, Instructor Foundation &
// Examiner Certification Course Guides, and the Registration-Paths FAQ.

export interface GuideSection {
  heading: string;
  body?: string;
  steps?: string[];   // rendered as an ordered list
  points?: string[];  // rendered as a bulleted list
  note?: string;      // rendered as a callout
}
export interface Guide {
  slug: string;
  title: string;
  audience: string;
  accent: string;
  summary: string;
  sections: GuideSection[];
}

export const GUIDES: Guide[] = [
  {
    slug: 'how-it-works',
    title: 'How MAS BADGES works',
    audience: 'Everyone',
    accent: '#09B3CA',
    summary: 'The whole system in one read — who teaches, who assesses, how a badge is earned, and why it can be trusted.',
    sections: [
      { heading: 'A badge certifies the swimmer',
        body: 'A MAS Swim Badge certifies the swimmer against a single published standard — not whoever coached them. Seven levels run in order, Starfish through Dolphin, each assessed and certified individually so no fundamental skill is skipped.' },
      { heading: 'The instructor is the core conduit',
        body: 'Everything starts with a MAS BADGES–certified instructor. The instructor teaches to the syllabus, registers each swimmer, judges readiness honestly, and books the assessment. A swimmer who isn’t registered by an instructor or centre cannot be assessed — there is no anonymous booking.' },
      { heading: 'Centres provide the home',
        body: 'A partner centre is the venue and the umbrella, recognised by Malaysia Aquatics and listed publicly. A centre’s core undertaking is to deliver the syllabus, which is why it must keep at least one certified instructor on its roster at all times.' },
      { heading: 'An independent examiner judges',
        body: 'The swimmer is assessed by an independent examiner — never their own teacher. This conflict-of-interest firewall is the integrity rule the whole programme rests on, and the portal enforces it in data: an examiner can only grade the candidates assigned to them.' },
      { heading: 'A pass becomes a verifiable certificate',
        body: 'A Pass is recorded and a serialised certificate is issued; a shortfall is a Refer that names the gap to close. Certificates are publicly verifiable by serial — while never exposing a child’s identity.' },
      { heading: 'Where each audience goes next',
        points: [
          'Parents & swimmers → find a centre, then claim and view your child’s badges.',
          'Instructors → get certified, then register and prepare swimmers.',
          'Centres → appoint a certified instructor and apply for recognition.',
          'Examiners → apply, certify, and be invited to assess by state.',
        ] },
    ],
  },
  {
    slug: 'instructor-pathway',
    title: 'Instructor pathway',
    audience: 'Instructors',
    accent: '#26A59A',
    summary: 'How to become a BADGES-certified instructor and what the role involves — the heart of the programme.',
    sections: [
      { heading: 'Why the instructor matters',
        body: 'Only a MAS BADGES–certified instructor can prepare swimmers and book assessments. The instructor is the accountable person behind every booking, and a centre can only operate by having one on its roster.' },
      { heading: 'Getting certified',
        steps: [
          'Apply in the portal with proof of your swimming-competency baseline, a valid lifesaving / First Aid certification, and a Good Standing declaration.',
          'Pay the course registration fee.',
          'Attend the full Instructor Foundation Course — classroom and poolside, including a hands-on portal module.',
          'Pass the theory assessment and a practical teaching assessment judged by the Master Trainer.',
          'On certification, you receive a portal invitation; sign up with that email and the instructor role is granted.',
        ] },
      { heading: 'What you do in the portal',
        points: [
          'Register candidates — an unregistered swimmer cannot be assessed.',
          'Issue the claim slip so a family can link to their child’s record.',
          'Confirm readiness, candidate by candidate, against every criterion at the target level.',
          'Book the assessment, at least a month ahead.',
        ] },
      { heading: 'Stay firewalled',
        body: 'You prepare and book; the assigned examiner — never you — judges your swimmers. Build genuine technique rather than drilling the assessment task, and put a swimmer forward only when truly ready. A Refer is a normal, useful outcome.',
        note: 'Not certified yet? You can still operate by partnering with a certified instructor or centre while you train — see the enrolment guide.' },
    ],
  },
  {
    slug: 'enrol',
    title: 'Getting into the Badges',
    audience: 'Parents & swimmers',
    accent: '#00ACC1',
    summary: 'How a child joins the programme and progresses through the seven levels.',
    sections: [
      { heading: 'The one rule',
        body: 'Children join through a MAS BADGES–certified instructor or a recognised partner centre — not by registering directly. Find a swim school or instructor in the centre directory; they enrol and prepare your child.' },
      { heading: 'The seven levels, in order',
        body: 'Starfish, Sea Turtle, Guppy, Octopus, Frog, Swordfish, Dolphin. Each builds on the one below and is assessed and certified in order — even for an advanced swimmer — so no fundamental water-safety or stroke skill is missed.' },
      { heading: 'What happens, step by step',
        steps: [
          'Your instructor teaches to the syllabus and tracks your child’s readiness.',
          'When ready, the instructor books an assessment with MAS.',
          'An independent examiner — never your child’s own teacher — assesses against the published criteria.',
          'A Pass is recorded; MAS issues the badge and a verifiable certificate.',
        ] },
      { heading: 'After a pass',
        body: 'You’ll be given a claim slip to link your child’s record to your own account, where you can see their levels and certificates. See the claim and certificate guides next.' },
    ],
  },
  {
    slug: 'claim',
    title: 'Claiming your child’s record',
    audience: 'Parents',
    accent: '#2f9ee0',
    summary: 'Use the one-time claim code from your instructor to link your child to your account.',
    sections: [
      { heading: 'What the claim slip is',
        body: 'When your child is registered, your instructor or centre hands you a one-time claim slip carrying a private claim code. That code links your child’s record to your account — it is never printed on a certificate, so keep it to yourself.' },
      { heading: 'How to claim',
        steps: [
          'Create a parent account on the portal (use the “Portal login” button on this site).',
          'Choose to claim a swimmer and enter the claim code from your slip.',
          'Your child’s record links to your account.',
          'You can now see their levels and certificates.',
        ] },
      { heading: 'If something’s wrong',
        body: 'If the code doesn’t work or you’ve lost the slip, ask the instructor or centre who registered your child to re-issue it. For safety, MAS staff will route you back through the registering instructor rather than reveal a child’s record directly.' },
    ],
  },
  {
    slug: 'certificates',
    title: 'Viewing certificates & levels',
    audience: 'Parents & swimmers',
    accent: '#1D87E4',
    summary: 'See your child’s progression and print their digital certificates once claimed.',
    sections: [
      { heading: 'Where to look',
        body: 'Once you’ve claimed your child’s record, log in and open their profile to see every level they’ve passed and the certificate issued for each.' },
      { heading: 'Print a digital certificate',
        steps: [
          'Log in and open your child’s record.',
          'Select the level whose certificate you want.',
          'View the certificate and print or save the digital copy.',
        ] },
      { heading: 'Progression at a glance',
        body: 'Levels are shown in order, so you can see where your child is on the Starfish → Dolphin pathway and what comes next. A printed hardcopy certificate may also be available to order through your centre.' },
    ],
  },
  {
    slug: 'verify',
    title: 'Authenticating a certificate',
    audience: 'Everyone',
    accent: '#FF7042',
    summary: 'Confirm any certificate is genuine by its serial — with a child’s identity protected.',
    sections: [
      { heading: 'How to verify',
        steps: [
          'Find the serial number on the certificate (or scan its QR code).',
          'Open the certificate-verification page on this site.',
          'Enter the serial to see the result.',
        ] },
      { heading: 'What you’ll see — and what you won’t',
        body: 'Verification confirms the serial, badge level, issuing centre, issue date, and whether the certificate is valid or has been revoked. It deliberately never shows the child’s name.',
        note: 'Child safety by design: a public lookup must prove a certificate is real without exposing a minor’s identity.' },
      { heading: 'If a certificate doesn’t verify',
        body: 'A serial that returns nothing, or shows as revoked, should be treated with caution — contact the MAS BADGES team to check.' },
    ],
  },
  {
    slug: 'assessment',
    title: 'The assessment guide',
    audience: 'Parents, instructors & centres',
    accent: '#66BA69',
    summary: 'Exactly how a single assessment runs, from booking to certificate.',
    sections: [
      { heading: 'Booking',
        body: 'The instructor or centre books the assessment in the portal at least a month ahead, listing each candidate and the target level. MAS assigns an independent examiner and re-routes any conflict-of-interest cases.' },
      { heading: 'Before the day',
        points: [
          'A parental consent form, plus a Safe-to-Swim declaration and release of liability, is prepared for every candidate.',
          'The venue is an approved pool; the examiner verifies safety and forms before starting.',
          'The requesting party provides the water-safety and marshalling team for the session.',
        ] },
      { heading: 'On the day',
        body: 'The examiner briefs candidates in age-appropriate language, then observes each against the published criteria and records a Pass or Refer at the time of observation. Results are never announced poolside.' },
      { heading: 'Pass or Refer',
        points: [
          'Pass — every criterion at the level is met; the badge and certificate are awarded.',
          'Refer — one or more criteria not yet met; the examiner notes which, and the swimmer re-attempts at any future session, with no penalty or limit.',
          'There is no partial pass — the full standard is met, or it’s a Refer.',
        ] },
      { heading: 'Results & certificates',
        body: 'MAS releases results on the portal (the examiner submits within seven working days). For every Pass, MAS issues the certificate and supplies the badge — typically two to three weeks from assessment to badge in hand.',
        note: 'If it rains or there’s lightning, the pool is cleared and the examiner decides whether to continue or call a rain-off — re-booked at no additional fee.' },
    ],
  },
  {
    slug: 'examiner-pathway',
    title: 'Examiner pathway',
    audience: 'Examiners',
    accent: '#5D34B1',
    summary: 'How examiners are appointed and certified to assess independently.',
    sections: [
      { heading: 'Appointed, not open-listed',
        body: 'Examiners are independent assessors appointed by Malaysia Aquatics. MAS welcomes applications, screens candidates, and the Chief Examiner invites and deploys examiners by state. During the pilot the pool is intentionally small — quality before coverage.' },
      { heading: 'Prerequisites',
        points: [
          'A current instructor certification (a hard prerequisite).',
          'At least two years’ active Learn-to-Swim teaching experience.',
          'A valid lifesaving certification (First Aid/CPR, Bronze Medallion, or equivalent).',
          'Good Standing — no current disciplinary action and no disqualifying record.',
        ] },
      { heading: 'The pathway',
        steps: [
          'Apply in the portal with your evidence and a statement of intent, and pay the course fee.',
          'Attend the full 2–3 day Examiner Certification Course.',
          'Pass: attend every module, score at least 80% on theory, demonstrate portal competency, and achieve Competent or above on a practical assessment.',
          'Complete the pilot target — assess at least ten candidates across three levels within six months, under the Chief Examiner’s oversight.',
          'On Coaching Panel ratification, the portal grants the examiner role and issues your examiner UID.',
        ] },
      { heading: 'The rule that defines the role',
        body: 'Never assess a candidate you have taught. Appointment is for two years; staying in good standing means conducting assessments, attending the annual meeting, passing audits, and keeping your instructor and lifesaving certifications current.' },
    ],
  },
];
