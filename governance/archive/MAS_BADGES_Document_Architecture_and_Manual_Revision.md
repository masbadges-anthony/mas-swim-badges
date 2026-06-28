# MAS BADGES — Governing Document Architecture & Manual Revision Plan

*A proposal for reorganizing the MAS BADGES governing documents into a layered set: a thin requirements **Manual** on top, specialist **Syllabus / Handbooks / Course Guides** beneath it, and the **BADGES Platform Portal** as the execution hub that enforces the policies the documents describe.*

**Scope:** what each document owns, what the Manual keeps vs. sheds, a section-by-section migration map out of `MAS_Swim_Badges_Manual_v1.4.docx`, and the cross-reference rules that keep one fact in one place.

House style retained: American `-ize`; British `centre/centres`; "Program."

---

## 1. The problem with v1.4

The current Manual is a single operating handbook that mixes four altitudes in one document:

| Altitude | Example in v1.4 | Should live in |
|---|---|---|
| **Constitution** — what the system requires | Governance, roles, accountability, objectives | **Manual** (keep) |
| **Standard** — the proficiency criteria | Appendix A syllabus, §12 progression | **Syllabus** |
| **Procedure** — how teaching / assessing is done | §7 workshop content, §11 assessment process, Appendix C modules | **Handbooks + Course Guides** |
| **Mechanism** — the running system of record | Booking, billing, claim, certificate issue, directory | **Portal** (documented, not re-specified) |

Because all four sit together, every operational tweak (a fee change, a form field, a workshop day) forces a Manual re-edition and a fresh board sign-off. The fix is to make the Manual a **charter of requirements** and let the specialist documents and the Portal carry the detail that actually changes.

---

## 2. The target document set

Seven instruments, one hub.

```
                          ┌─────────────────────────────────────┐
                          │   MAS BADGES MANUAL  (the charter)   │
                          │   vision · governance · the          │
                          │   REQUIREMENTS, by topic — no how     │
                          └───────────────┬─────────────────────┘
                                          │ states requirements; defers specifics ↓
        ┌──────────────────┬──────────────┼───────────────────┬──────────────────┐
        ▼                  ▼              ▼                   ▼                  ▼
 ┌─────────────┐   ┌───────────────┐  ┌──────────────┐  ┌───────────────┐  (Partner Centre
 │ 7-LEVEL     │   │ TEACHING      │  │ ASSESSMENT   │  │  (governance   │   requirements stay
 │ SYLLABUS    │   │ SYSTEM        │  │ SYSTEM       │  │   code, child  │   in the Manual;
 │             │   │ HANDBOOK      │  │ HANDBOOK     │  │   safety…)     │   centre ops in Portal)
 │ outcomes/   │   │ how to teach  │  │ how to       │  └───────────────┘
 │ criteria    │   │ to the        │  │ assess to    │
 │ L1–L7       │   │ syllabus      │  │ the syllabus │
 └──────┬──────┘   └───────┬───────┘  └──────┬───────┘
        │                  │                 │
        │ feeds            ▼                 ▼
        │          ┌────────────────┐ ┌────────────────┐
        │          │ INSTRUCTOR     │ │ EXAMINER       │
        │          │ FOUNDATION     │ │ CERTIFICATION  │
        │          │ COURSE GUIDE   │ │ COURSE GUIDE   │
        │          │ (Master        │ │ (Master        │
        │          │  Trainer runs) │ │  Trainer runs) │
        │          └───────┬────────┘ └───────┬────────┘
        │                  │                  │
        └──────────────────┴───────┬──────────┴──────────────────┐
                                    ▼                             │
                        ┌───────────────────────────┐            │
                        │  BADGES PLATFORM PORTAL     │◄───────────┘
                        │  apps.masbadges.org         │
                        │  the system of record that  │  every handbook & course
                        │  EXECUTES the policies; RLS  │  references the Portal as
                        │  is the real enforcement gate│  the place the work happens
                        └───────────────────────────┘
```

| # | Document | One-line purpose | Custodian / owner | Primary audience |
|---|---|---|---|---|
| 0 | **BADGES Manual** | Governance, vision, and the *requirements* of the system — defers all specifics | Chairperson (program owner); Coaching Panel co-signs technical clauses | MAS Board, governance, external stakeholders |
| 1 | **7-Level Swimming Syllabus** | The proficiency standard: criteria/outcomes for L1–L7 | Coaching & Technical Board | Instructors, examiners, parents |
| 2 | **Teaching System Handbook** | How instruction is delivered to meet the syllabus | Coaching Panel (technical) + Master Trainer | Instructors, partner centres |
| 3 | **Instructor Foundation Certification Course Guide** | Outcomes/criteria to *become* a BADGES Instructor | BADGES System Master Trainer | Instructor candidates, the Master Trainer |
| 4 | **Assessment System Handbook** | How levels are assessed, recorded, and certified | **Chief Examiner** (custody & maintenance) | Examiners, partner centres |
| 5 | **Examiner Certification Course Guide** | Outcomes/criteria to *become* a BADGES Examiner | BADGES System Master Trainer (with Chief Examiner) | Examiner candidates, the Master Trainer |
| — | **BADGES Platform Portal** | Executes the policies; system of record | Anthony / system admin; governance per RLS | All roles, operationally |

Two clean dependency chains fall out of this:

- **Teach side:** Manual → Syllabus → Teaching System Handbook → Instructor Foundation Course Guide → Portal.
- **Assess side:** Manual → Syllabus → Assessment System Handbook → Examiner Certification Course Guide → Portal.

The Syllabus is the shared spine both sides bend to. The Portal is where both sides converge in practice.

---

## 3. The doctrine of separation (the rule that keeps it clean)

Four sentences govern the whole set:

1. **The Manual states *that* something must happen and *who* is accountable. It never states *how*.** ("Every candidate is assessed against the published syllabus by a certified examiner." — yes. The pre-assessment safety checklist — no, that's the Assessment Handbook.)
2. **A Handbook states *how* the work is done, to the standard the Syllabus defines.** It is the operating doctrine for a role, refreshed as practice matures, without a board re-edition.
3. **A Course Guide states the *outcomes and criteria* for certifying a person to do that work,** and is delivered by the Master Trainer. It points back to its Handbook for content and forward to the Portal for the systems module.
4. **The Portal *enforces*. The documents *describe*.** Where a document and the Portal disagree on a number or a state, the Portal's configured value is authoritative for operations and the document is corrected — mirroring the existing principle that *RLS is the real security gate and the role-catalog UI is documentation only.*

This is the same discipline already proven in the build (portal/website boundary; RLS-as-gate). Extending it to the paper layer means: **one fact, one home.** A fee quantum lives in the Portal fee schedule, not in five PDFs. A pass criterion lives in the Syllabus, not also in the Examiner Guide. Everyone else *references* the home.

---

## 4. The Manual, revised — from operating handbook to requirements charter

### 4.1 What the revised Manual is

A board-level constitution that any stakeholder can read in one sitting to understand: the vision, who is accountable to whom, what the system *requires* on each topic, and which instrument carries the detail. It enumerates requirements; it defers methods.

### 4.2 Proposed new table of contents

```
PART I — FOUNDATIONS
  1. Introduction & Scope of this Manual
  2. Vision, Mission & Objectives
  3. The Governing Document Architecture        ← NEW (defines docs 1–5 + Portal,
                                                    custody, precedence, change control)
  4. Definitions & Glossary

PART II — GOVERNANCE & ACCOUNTABILITY
  5. Governance & Reporting Structure            (dual authority, chain, roles, decision flow)
  6. The Chairperson — role, eligibility, term
  7. The Chief Examiner — role, eligibility, term
  8. The BADGES System Master Trainer — role     ← RENAMED/UNIFIED (was "Examiner Course Trainer")
  9. Code of Conduct & Child Safety — requirements (specifics deferred to handbooks)

PART III — SYSTEM REQUIREMENTS  (the heart: requirements by topic, specifics deferred)
 10. The 7-Level Certification                   → defers criteria to the SYLLABUS
 11. Instruction & Instructor Certification       → defers to TEACHING HANDBOOK + INSTRUCTOR GUIDE
 12. Assessment & Examiner Certification           → defers to ASSESSMENT HANDBOOK + EXAMINER GUIDE
 13. Partner Centres — recognition requirements    → defers centre operations to the PORTAL
 14. The BADGES Platform Portal — system of record → defers screens/ops to portal docs
 15. Records, Data Protection & Child Safety       (data-controller stance; anonymized verification)
 16. Fees & Commercial Framework — principles only  → defers quantum to the PORTAL fee schedule

PART IV — PROGRAM LIFECYCLE
 17. Pilot Phase & National Rollout
 18. State Allocation & Cross-State Deployment — requirement (schedule deferred)
 19. Expected Outcomes & Review cycle

APPENDICES (Manual-level only)
  A. Document Register & Version Control
  B. Change-Control Routing (who proposes / approves / ratifies each document)
  C. Glossary  (if not folded into §4)
```

Everything that was syllabus, workshop content, assessment procedure, form templates, and FAQ leaves the Manual.

### 4.3 Migration map — every v1.4 element, and where it goes

| v1.4 location | Content | Disposition | New home |
|---|---|---|---|
| §1 Introduction | What the program is | **Keep**, trimmed; add "how to read the document set" | Manual §1 |
| §2 Objectives | Program objectives | **Keep** | Manual §2 |
| §3 Governance & Reporting | Dual authority, chain, roles, decision flow | **Keep** (core) | Manual §5 |
| §4 Chairperson | Role / eligibility / term | **Keep** | Manual §6 |
| §5 Chief Examiner | Role / eligibility / term | **Keep**; add "custodian of the Assessment Handbook" | Manual §7 |
| §6 Examiner Selection | Eligibility criteria | **Split**: keep eligibility *requirements* in Manual; move the application/course pathway steps out | Manual §12 (requirement) + **Examiner Course Guide** (pathway) |
| §7 Examiner Workshop | Trainer role, format, day-by-day content, fees, attendance | **Move** content out; keep only "examiners are certified via the Examiner Certification Course, run by the Master Trainer" as a requirement | **Examiner Course Guide** (all detail); Manual §8 (Master Trainer role) + §12 (requirement) |
| §8 Partner Centres | Definition, eligibility, application, renewal, privileges, fees | **Split**: keep recognition *requirements* + the data-controller relationship; move booking/annual-return *mechanics* to Portal docs | Manual §13 (requirements) + **Portal** (operations) |
| §9 State Allocation | Cross-state deployment rules | **Keep** as requirement; move the allowance *schedule* to Portal settings | Manual §18 + **Portal** (schedule) |
| §10 Examiner Code of Conduct | Conduct rules | **Move** the operational code to the Assessment Handbook; keep the *requirement to hold and sign a code* in the Manual | Manual §9 (requirement) + **Assessment Handbook** (the code) |
| §11 The Assessment Process | Booking → assess → record → issue | **Move** wholesale | **Assessment System Handbook** (mirrors SwimSafer CAMS structure) |
| §12 Student Progression Pathway | Level-by-level progression, competition bridge | **Move** to the standard | **Syllabus** (progression narrative) |
| §13 Pilot & Rollout | Phasing | **Keep** | Manual §17 |
| §14 Fee Structure | All quanta (assessment, application, recognition, workshop) | **Move** the numbers to the Portal fee schedule; keep the *principle* (single national schedule, set by Chairperson, approved by Board) | Manual §16 (principle) + **Portal** `fee_schedule` (quanta) |
| §15 Outcomes & Conclusion | Expected outcomes | **Keep** | Manual §19 |
| Appendix A — Syllabus L1–L7 | The proficiency criteria | **Move** wholesale — this *becomes* a standalone document | **7-Level Syllabus** |
| Appendix B — Forms & Records | 10+ form definitions | **Move**: each becomes a Portal artifact (generated) or a handbook annex; the Manual keeps only a *register* of required records | **Portal** (live forms) + handbook annexes; Manual App. A (register) |
| Appendix C — Examiner Cert Syllabus | 7 modules, pass requirements, continuing cert | **Move** wholesale | **Examiner Course Guide** |
| Appendix D — FAQ | 15 Q&A across audiences | **Move** to the public website + per-document FAQ sections | Website / each handbook |
| Leadership pages | Inaugural appointees | **Keep** | Manual front/back matter |

### 4.4 "What to revise" — the editing checklist

Concrete edits to convert v1.4 into the charter:

1. **Insert a new §3 "Governing Document Architecture"** — the table from §2 above, the custody column, the precedence rule (§3 doctrine), and a pointer to App. B change-control. This is the single most important addition; it is what makes the Manual *thin by design* rather than thin by omission.
2. **Rewrite §6/§7/§11/§14 as requirement statements + a deferral line.** Pattern for each topic: *"BADGES requires X. The methods, criteria, and procedures for X are specified in [Document], maintained by [Custodian], and executed through the BADGES Platform Portal."* Then delete the how.
3. **Rename "Examiner Course Trainer" → "BADGES System Master Trainer"** and broaden the role to certify **both** instructors and examiners (see open decision OD-2). Keep Melvin Chua as inaugural.
4. **Promote the Portal to a named §14 "system of record."** State the requirement that registration, booking, assessment recording, certification, verification, billing, and directories are transacted through the Portal; that the public certificate verification is **anonymized and never exposes a minor's identity**; and that the Portal's configured values are operationally authoritative.
5. **Add §15 data-protection requirements:** Malaysia Aquatics as data controller, centres as processors (pending counsel), minors-never-named-publicly as a hard rule.
6. **Strip every fee number** from prose into a single reference to the Portal fee schedule; keep only the governance of *who sets and approves* fees.
7. **Excise Appendices A and C and §11/§12 detail entirely**, replacing each with a one-paragraph requirement and a cross-reference.
8. **Convert Appendix B into a "Register of Required Records"** — a list of *what records must exist and who holds them*, not the form layouts themselves.
9. **Re-stamp** edition (2.0 — it's a structural break, not a 1.5) and update the subtitle from *"Governance, Examiner Framework, Assessment & Level 1–7 Syllabus"* to something like *"Governance, Requirements & the BADGES Document System."*

---

## 5. The downstream documents — briefs

Each brief: purpose, custodian, what it inherits, contents, and its Portal hook.

### 5.1 BADGES 7-Level Swimming Syllabus
- **Purpose:** the single authoritative proficiency standard — criteria and outcomes for Starfish → Dolphin.
- **Custodian:** Coaching & Technical Board (per the existing syllabus-change route).
- **Contents:** per level — Introduce / Reinforce / Develop teaching objectives, assessment criteria ("demonstrate ability to…"), assessment conditions (shallow/deep, independence), badge awarded; plus the progression narrative and the Level-7 competition bridge migrated from §12.
- **Inherits from Manual:** the requirement that a published syllabus exists and is the basis of all teaching and assessment.
- **Portal hook:** the level definitions and pass/refer outcomes are the data model the Portal already grades against; the syllabus is the human-readable source for those enums.

### 5.2 BADGES Teaching System Handbook
- **Purpose:** how instruction is delivered to produce candidates who meet the syllabus.
- **Custodian:** Coaching Panel + Master Trainer.
- **Contents:** teaching methodology, lesson structure, the Introduce/Reinforce/Develop pedagogy, water-safety and child-safety in delivery, class management, progress recording, candidate registration practice, and **the instructor's front-line duties in the Portal** (registering candidates, issuing the claim slip to families, booking assessments).
- **Inherits:** the syllabus standard; the program-wide code of conduct and child-safety requirements from Manual §9.
- **Portal hook:** the instructor's operating surface — candidate registration, claim-slip generation, session booking.

### 5.3 BADGES Instructor Foundation Certification Course Guide
- **Purpose:** the outcomes and criteria to certify a person as a BADGES Instructor.
- **Custodian / delivery:** BADGES System Master Trainer.
- **Contents:** entry requirements, module structure, hours/mode, theory + practical pass requirements, a **mandatory Portal module** (registering candidates, claim slips, booking, reading the syllabus), continuing-certification requirements, and the link into onboarding.
- **Inherits:** the Teaching System Handbook (its content) and the syllabus (its standard).
- **Portal hook:** on completion the Master Trainer marks attendees certified → triggers the existing **instructor-invitation onboarding** (email-keyed invite → self-signup matches invitation → `instructor` role granted). The course *is* the front door to the `courses → certification → onboarding` loop already designed.

### 5.4 BADGES Assessment System Handbook
- **Purpose:** how levels are assessed, recorded, certified, appealed, and audited. *This is the document the in-project SwimSafer CAMS handbook is the closest model for.*
- **Custodian:** **Chief Examiner** (explicit custody and maintenance).
- **Contents (CAMS-style):** the assessment portal & registration; practical assessment conduct (pre-assessment safety check, briefing, positioning, observation, pass/refer, feedback); re-attempts; payments; results; appeals; certificates; medical conditions; large-group / multi-school testing; non-standard venues & pool specs; the **Examiner Code of Conduct** (migrated from §10); assessor responsibilities; submission deadlines; disciplinary framework; FAQ.
- **Inherits:** the syllabus standard; the Manual's requirement of a credible, auditable, anonymized assessment.
- **Portal hook:** the session lifecycle (requested → examiner invited → scheduled → completed → invoiced → paid → certificates issued → closed), COI enforcement, and bulk certificate issuance are all Portal-executed; the Handbook documents the human procedure around those states.

### 5.5 BADGES Examiner Certification Course Guide
- **Purpose:** the outcomes and criteria to certify a person as a BADGES Examiner.
- **Custodian / delivery:** Master Trainer, with the Chief Examiner.
- **Contents:** Appendix C migrated intact — 7 modules (Program & Governance; L1–3 / L4–5 / L6–7 standards; Conduct of Assessment; Code of Conduct; Practical Independent Assessment "eye-level analysis"), pass requirements (80% theory, Competent practical, pilot certification target), continuing certification; **plus a mandatory Portal module** (accepting session invitations, recording outcomes, certificate issuance flow).
- **Inherits:** the Assessment System Handbook (its content) and the syllabus (its standard).
- **Portal hook:** the examiner's operating surface — session invitations, outcome recording.

---

## 6. The Portal as the hub — how every document points to it

The instruction "each System Handbook & Certification Course refers to the Portal as the HUB that executes the policies" becomes a concrete, uniform pattern:

- **A standard "On the BADGES Platform Portal" section** at the end of each Handbook, mapping that role's policies to the screens that execute them, and stating the doctrine: *the Portal's configured state is operationally authoritative; the Handbook documents the procedure, not the enforcement.*
- **A mandatory Portal competency module** in each Course Guide, so certification provably includes knowing how to operate the Portal for that role. No one is certified who can't use the system.
- **The requirements → instrument → execution matrix** below is the connective tissue. The Manual carries this matrix (in §3 and §14); each downstream doc carries its own row in expanded form.

### Core requirements → method → execution (the Manual's central matrix)

| Core requirement (Manual owns) | Specifics live in | Executed in the Portal as |
|---|---|---|
| A national 7-level proficiency standard exists | Syllabus | level enums; pass/refer outcomes |
| Instruction meets that standard | Teaching System Handbook | candidate registration; progress practice |
| Only certified instructors instruct | Instructor Foundation Course Guide | invitation-gated `instructor` role |
| Assessment is credible, independent, auditable | Assessment System Handbook | session lifecycle; COI trigger; audit records |
| Only certified examiners assess | Examiner Certification Course Guide | examiner role; assigned-session scoping |
| Certificates are issued only on a genuine pass | Assessment System Handbook | pass-gated, serialized, append-only issuance |
| Certificates are publicly verifiable without exposing a minor | Manual §15 (hard rule) | anonymized `verify_certificate()` |
| Centres are recognized against published criteria | Manual §13 | recognition register; directory views |
| Fees follow a single national schedule | Manual §16 (principle) | settings-editable `fee_schedule` |
| Conduct & child-safety obligations are signed and enforced | Manual §9 + Handbook codes | signed codes; status/blacklist controls |
| One certifying authority trains both instructors and examiners | Manual §8 (Master Trainer) | `courses` → certification → onboarding loop |

---

## 7. Open decisions to resolve before drafting

These are forks where the source documents currently disagree or are silent — flagging them now avoids re-edits later.

- **OD-1 — Instructor certification lineage.** v1.4 §6.1 makes a generic *"MAS Instructor certification"* a hard prerequisite for examiners and treats it as pre-existing/external. The new **Instructor Foundation Course** brings instruction *into* the BADGES system. Decide: does the BADGES Instructor Foundation cert *replace* the old MAS Instructor Course, *sit above* it, or *recognize* it as equivalent? This changes the examiner prerequisite wording.
- **OD-2 — One Master Trainer or two trainer roles.** You describe a single *"BADGES System Master Trainer"* running both course guides; the operations design (D6) proposed a `system`-level split into `instructor_trainer` and `examiner_trainer`. Recommended reconciliation: **one Master Trainer role in governance** (the human authority, named in the Manual), with the Portal optionally retaining two narrower trainer *capabilities* for RLS scoping — documentation vs. enforcement, again.
- **OD-3 — Partner Centre handbook?** Centre obligations are currently split between Manual §8 and the Portal. Decide whether centres warrant their own thin handbook (recognition, renewal, the centre's Portal duties) or whether the Manual-requirement + Portal-execution split is enough. Given the existing centre model (record / instructor / point-of-comm / Chairperson-as-approver) and renewal migration, a short **Partner Centre Guide** is likely worth it but is not in your named set.
- **OD-4 — Edition vs. new identity.** Recommend the charter ships as **Manual Edition 2.0** and the set as a whole gets a one-page **"BADGES Document System"** cover note, so the board sees the architecture, not five disconnected files.

---

## 8. Suggested build order

1. **Manual §3 architecture + the requirements matrix** (this plan, ratified) — lock the skeleton first.
2. **Syllabus** — extract Appendix A + §12; it is the spine everything else references, and it changes least.
3. **Assessment System Handbook** — highest operational value; CAMS handbook as the template; Chief Examiner as custodian.
4. **Examiner Certification Course Guide** — Appendix C lifts in almost intact; add the Portal module.
5. **Teaching System Handbook**, then **Instructor Foundation Course Guide** — the teach side, newest material, aligns with the instructor-onboarding loop already built.
6. **Manual Edition 2.0** — finalize once the downstream homes exist, so every deferral points at a real document.

Version-control rule for the whole set (Manual App. A/B): each document carries its own edition stamp and a change-control row naming who *proposes / approves / ratifies* it, following the existing decision-flow routing (technical → Coaching Panel; operational → Chairperson; both → Board). One fact, one home, one owner, one change route.
