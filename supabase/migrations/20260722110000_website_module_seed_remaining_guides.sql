-- 20260722110000_website_module_seed_remaining_guides.sql
--
-- Follow-up to 20260722100000. The initial seed inserted only 2 of the 8 guides
-- in src/data/guides.ts (`how-it-works` and `instructor-pathway`). This
-- migration seeds the remaining 6 guides so nothing is missing on cut-over:
--   enrol · claim · certificates · verify · assessment · examiner-pathway
--
-- Idempotent: each card is inserted only if its slug does not already exist,
-- so re-running is safe and no duplicates are ever created.

do $$
declare
  seed jsonb := $seed$
    [
      {
        "slug": "enrol",
        "title": "Getting into the Badges",
        "audience": "Parents & swimmers",
        "accent": "#00ACC1",
        "summary": "How a child joins the programme and progresses through the seven levels.",
        "sections": [
          {"heading": "The one rule", "body": "Children join through a MAS BADGES–certified instructor or a recognised partner centre — not by registering directly. Find a swim school or instructor in the centre directory; they enrol and prepare your child."},
          {"heading": "The seven levels, in order", "body": "Starfish, Guppy, Frog, Octopus, Sea Turtle, Swordfish, Dolphin. Each builds on the one below and is assessed and certified in order — even for an advanced swimmer — so no fundamental water-safety or stroke skill is missed."},
          {"heading": "What happens, step by step",
           "steps": ["Your instructor teaches to the syllabus and tracks your child’s readiness.",
                     "When ready, the instructor books an assessment with MAS.",
                     "An independent examiner — never your child’s own teacher — assesses against the published criteria.",
                     "A Pass is recorded; MAS issues the badge and a verifiable certificate."]},
          {"heading": "After a pass", "body": "You’ll be given a claim slip to link your child’s record to your own account, where you can see their levels and certificates. See the claim and certificate guides next."}
        ]
      },
      {
        "slug": "claim",
        "title": "Claiming your child’s record",
        "audience": "Parents",
        "accent": "#2f9ee0",
        "summary": "Use the one-time claim code from your instructor to link your child to your account.",
        "sections": [
          {"heading": "What the claim slip is", "body": "When your child is registered, your instructor or centre hands you a one-time claim slip carrying a private claim code. That code links your child’s record to your account — it is never printed on a certificate, so keep it to yourself."},
          {"heading": "How to claim",
           "steps": ["Create a parent account on the portal (use the “Portal login” button on this site).",
                     "Choose to claim a swimmer and enter the claim code from your slip.",
                     "Your child’s record links to your account.",
                     "You can now see their levels and certificates."]},
          {"heading": "If something’s wrong", "body": "If the code doesn’t work or you’ve lost the slip, ask the instructor or centre who registered your child to re-issue it. For safety, MAS staff will route you back through the registering instructor rather than reveal a child’s record directly."}
        ]
      },
      {
        "slug": "certificates",
        "title": "Viewing certificates & levels",
        "audience": "Parents & swimmers",
        "accent": "#1D87E4",
        "summary": "See your child’s progression and print their digital certificates once claimed.",
        "sections": [
          {"heading": "Where to look", "body": "Once you’ve claimed your child’s record, log in and open their profile to see every level they’ve passed and the certificate issued for each."},
          {"heading": "Print a digital certificate",
           "steps": ["Log in and open your child’s record.",
                     "Select the level whose certificate you want.",
                     "View the certificate and print or save the digital copy."]},
          {"heading": "Progression at a glance", "body": "Levels are shown in order, so you can see where your child is on the Starfish → Dolphin pathway and what comes next. A printed hardcopy certificate may also be available to order through your centre."}
        ]
      },
      {
        "slug": "verify",
        "title": "Authenticating a certificate",
        "audience": "Everyone",
        "accent": "#FF7042",
        "summary": "Confirm any certificate is genuine by its serial — with a child’s identity protected.",
        "sections": [
          {"heading": "How to verify",
           "steps": ["Find the serial number on the certificate (or scan its QR code).",
                     "Open the certificate-verification page on this site.",
                     "Enter the serial to see the result."]},
          {"heading": "What you’ll see — and what you won’t",
           "body": "Verification confirms the serial, badge level, issuing centre, issue date, and whether the certificate is valid or has been revoked. It deliberately never shows the child’s name.",
           "note": "Child safety by design: a public lookup must prove a certificate is real without exposing a minor’s identity."},
          {"heading": "If a certificate doesn’t verify", "body": "A serial that returns nothing, or shows as revoked, should be treated with caution — contact the MAS BADGES team to check."}
        ]
      },
      {
        "slug": "assessment",
        "title": "The assessment guide",
        "audience": "Parents, instructors & centres",
        "accent": "#66BA69",
        "summary": "Exactly how a single assessment runs, from booking to certificate.",
        "sections": [
          {"heading": "Booking", "body": "The instructor or centre books the assessment in the portal at least a month ahead, listing each candidate and the target level. MAS assigns an independent examiner and re-routes any conflict-of-interest cases."},
          {"heading": "Before the day",
           "points": ["A parental consent form, plus a Safe-to-Swim declaration and release of liability, is prepared for every candidate.",
                      "The venue is an approved pool; the examiner verifies safety and forms before starting.",
                      "The requesting party provides the water-safety and marshalling team for the session."]},
          {"heading": "On the day", "body": "The examiner briefs candidates in age-appropriate language, then observes each against the published criteria and records a Pass or Refer at the time of observation. Results are never announced poolside."},
          {"heading": "Pass or Refer",
           "points": ["Pass — every criterion at the level is met; the badge and certificate are awarded.",
                      "Refer — one or more criteria not yet met; the examiner notes which, and the swimmer re-attempts at any future session, with no penalty or limit.",
                      "There is no partial pass — the full standard is met, or it’s a Refer."]},
          {"heading": "Results & certificates",
           "body": "MAS releases results on the portal (the examiner submits within seven working days). For every Pass, MAS issues the certificate and supplies the badge — typically two to three weeks from assessment to badge in hand.",
           "note": "If it rains or there’s lightning, the pool is cleared and the examiner decides whether to continue or call a rain-off — re-booked at no additional fee."}
        ]
      },
      {
        "slug": "examiner-pathway",
        "title": "Examiner pathway",
        "audience": "Examiners",
        "accent": "#5D34B1",
        "summary": "How examiners are appointed and certified to assess independently.",
        "sections": [
          {"heading": "Appointed, not open-listed", "body": "Examiners are independent assessors appointed by Malaysia Aquatics. MAS welcomes applications, screens candidates, and the Chief Examiner invites and deploys examiners by state. During the pilot the pool is intentionally small — quality before coverage."},
          {"heading": "Prerequisites",
           "points": ["A current instructor certification (a hard prerequisite).",
                      "At least two years’ active Learn-to-Swim teaching experience.",
                      "A valid lifesaving certification (First Aid/CPR, Bronze Medallion, or equivalent).",
                      "Good Standing — no current disciplinary action and no disqualifying record."]},
          {"heading": "The pathway",
           "steps": ["Apply in the portal with your evidence and a statement of intent, and pay the course fee.",
                     "Attend the full 2–3 day Examiner Certification Course.",
                     "Pass: attend every module, score at least 80% on theory, demonstrate portal competency, and achieve Competent or above on a practical assessment.",
                     "Complete the pilot target — assess at least ten candidates across three levels within six months, under the Chief Examiner’s oversight.",
                     "On Coaching Panel ratification, the portal grants the examiner role and issues your examiner UID."]},
          {"heading": "The rule that defines the role", "body": "Never assess a candidate you have taught. Appointment is for two years; staying in good standing means conducting assessments, attending the annual meeting, passing audits, and keeping your instructor and lifesaving certifications current."}
        ]
      }
    ]
  $seed$::jsonb;
  card jsonb;
  section jsonb;
  new_card_id uuid;
  next_sort int;
  section_sort int;
begin
  for card in select * from jsonb_array_elements(seed) loop
    -- Skip if this slug already exists (idempotent)
    if not exists (select 1 from public.guide_cards where slug = card->>'slug') then
      -- Append to end of existing sort order
      select coalesce(max(sort_order), -1) + 1 into next_sort from public.guide_cards;

      insert into public.guide_cards (
        slug, title, audience, accent, summary, sort_order, is_published
      ) values (
        card->>'slug', card->>'title', card->>'audience',
        card->>'accent', card->>'summary', next_sort, true
      ) returning id into new_card_id;

      section_sort := 0;
      for section in select * from jsonb_array_elements(card->'sections') loop
        insert into public.guide_sections (
          card_id, heading, body, steps, points, note, sort_order
        ) values (
          new_card_id,
          section->>'heading',
          section->>'body',
          case when section ? 'steps'  then section->'steps'  else null end,
          case when section ? 'points' then section->'points' else null end,
          section->>'note',
          section_sort
        );
        section_sort := section_sort + 1;
      end loop;
    end if;
  end loop;
end $$;

-- End of migration.
