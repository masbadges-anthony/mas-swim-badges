# MAS Badges — #12 Assessment Workflow Redesign (Data Model Spec)

*Design + decision document for the assessment/billing/issuance core. Reconciles the live Phase-1/Phase-2 schema with the operational model (Swimmer ID, new-vs-existing candidate mode, bulk roster + snapshot, multi-level on-the-day, 2-stage invoicing, payment-gated issuance). **No migration SQL yet** — this is the ratifiable model; migrations follow once the shape is signed off.*

---

## 0. What changes, in one breath

> **Correction (post-build):** the original framing here claimed the live `assessment_results` was one-row-per-(session, candidate) and that this *blocked* multi-level assessment. That was wrong — the live unique key was already `(session_id, candidate_id, target_level)`, so the table was **already per-level**. The keystone of this redesign is therefore not "unlock the grain" but **add the enrolment tier** (snapshot archiving) and the **billing columns** (stage + fee snapshot) that the fee model and payment-gated issuance require.

We add **two tiers**: a per-candidate **enrolment** row (`session_enrolments`, carrying the snapshot) and the existing per-level **result** row beneath it (`assessment_results`, gaining `enrolment_id` + `billing_stage` + `fee_rm_snapshot`). Swimmer ID, the fee schedule, and 2-stage invoicing are added around that spine. The existing COI trigger, pass-gate, serial generator, and revoke→reissue loop are **preserved untouched** — they read columns we keep (`candidate_id`, `session_id`, `assessor_profile_id`, `target_level`, `outcome`, `certificate_id`), which is exactly why the regrain needed no trigger rewrites.

---

## 1. Swimmer ID (on `candidates`)

A stable, human-readable, **non-secret** handle (the secret is the existing `claim_code`; both print on the claim slip). Paired with DOB for lookup, so it need not be unguessable for auth — but we still randomize to defeat enumeration of how many swimmers exist.

| Add to `candidates` | Type | Notes |
|---|---|---|
| `swimmer_id` | `text not null unique` | Format `SW{YY}-{XXXXX}` |

- **Format:** `SW` + 2-digit cohort year (year of registration, from `created_at`) + `-` + **5 chars** of **Crockford base32** (`0123456789ABCDEFGHJKMNPQRSTVWXYZ` — omits I, L, O, U; survives being read off a slip over the phone). Example `SW26-K7Q9X`.
- **Space:** 32⁵ = 33,554,432 per cohort year. Collision-safe at programme scale.
- **Generator:** `generate_swimmer_id()` — builds the string, retries on the unique constraint until clear. Called by a `BEFORE INSERT` trigger on `candidates` (and in backfill).
- **Backfill:** every existing candidate gets one, cohort year = year of `created_at`.
- **`lookup_swimmer(_swimmer_id text, _dob date)`** — `SECURITY DEFINER`, exact match on `swimmer_id` **and** `date_of_birth`. Returns `(id, full_name, status)` or nothing. Powers (a) the existing-candidate match in bulk submission and (b) a cross-check in the parent claim flow.

---

## 2. Two-tier assessment model

### Tier 1 — `session_enrolments` (NEW): one row per candidate per session

The roster entry and the **snapshot anchor**. This is where "who's in this session, on whose behalf, from which centre" is frozen at submission — replacing reliance on the live `candidates.partner_center_id` / `registered_by` columns (which become non-authoritative for assessment context).

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid pk` | |
| `session_id` | `uuid not null → assessment_sessions` | |
| `candidate_id` | `uuid not null → candidates` | |
| `booked_level` | `badge_level not null` | Instructor-indicated starting level; drives stage-1 fee |
| `assessor_profile_id` | `uuid → profiles` | Set at scheduling = the accepting examiner (COI-checked) |
| `attendance` | `enrolment_attendance not null default 'registered'` | `registered\|present\|absent\|no_show\|withdrawn` (§3.2.4) |
| `consent_confirmed_at_submission` | `boolean not null default false` | Registration consent gate snapshot (§3.4) |
| `candidate_name_snapshot` | `text not null` | Frozen at submission (survives later rename/anonymize) |
| `partner_center_id_snapshot` | `uuid → partner_centers` | Centre context, frozen |
| `partner_center_name_snapshot` | `text` | Frozen name (survives centre rename/removal) |
| `instructor_of_record_profile_id` | `uuid not null → profiles` | Bill-to; the booking instructor |
| `created_at / updated_at` | `timestamptz` | |

**Constraint:** `unique(session_id, candidate_id)` — the per-candidate uniqueness that used to live on `assessment_results` moves here.

### Tier 2 — `assessment_results` (REGRAINED): one row per (enrolment, level)

Minimal-churn path: keep the table, its COI trigger, its certificate FK and issuance link — just add the enrolment parent and push uniqueness down to the level.

| Column | Type | Change |
|---|---|---|
| `id` | `uuid pk` | — |
| `enrolment_id` | `uuid not null → session_enrolments` | **NEW** parent |
| `session_id` | `uuid not null` | kept (denormalized from enrolment, for COI/issuance convenience) |
| `candidate_id` | `uuid not null` | kept (denormalized; COI trigger + cert link read it) |
| `target_level` | `badge_level not null` | — |
| `billing_stage` | `result_billing_stage not null` | **NEW** `booked\|bonus` |
| `fee_rm_snapshot` | `numeric(8,2)` | **NEW** fee captured from schedule when the row is created |
| `assessor_profile_id` | `uuid → profiles` | — |
| `outcome` | `assessment_outcome` | null until graded (`pass\|refer`) |
| `assessed_on` | `date` | — |
| `certificate_id` | `uuid unique → certificates` | set by issuance trigger |
| `notes` | `text` | criteria not met |
| `created_at / updated_at` | `timestamptz` | — |

**Constraint:** `unique(enrolment_id, target_level)` (replaces `unique(session_id, candidate_id)`). One outcome per candidate per level per session.

> Why keep `assessment_results` as the level tier rather than rename: it semantically *is* the assessment result, and it preserves `enforce_assessment_coi()`, `link_certificate_to_result()`, the serial default, and the revoke-frees-result trigger with the least rewrite — each just keys on the row's `candidate_id` + `target_level` as before.

---

## 3. Fee schedule (authoritative in Portal — Decision R3)

| `fee_schedule` | Type | |
|---|---|---|
| `level` | `badge_level pk` | |
| `fee_rm` | `numeric(8,2) not null` | seed L1–3 = 50.00, L4–7 = 75.00 (Manual §14.1) |
| `updated_by / updated_at` | | sysadmin-only writes |

Examiner-payout config lives in `app_settings` (sysadmin-only) — modelled later with the payout leg; out of scope for this pass beyond reserving it.

---

## 4. Two-stage invoicing

One `invoices` table discriminated by `stage`; line items link to the exact level they bill, so issuance can gate per stage.

| `invoices` | Type | |
|---|---|---|
| `id` | `uuid pk` | |
| `session_id` | `uuid not null → assessment_sessions` | |
| `stage` | `invoice_stage not null` | `booked_prepay\|bonus_reconcile` |
| `bill_to_profile_id` | `uuid not null → profiles` | instructor-of-record |
| `partner_center_id` | `uuid → partner_centers` | context |
| `status` | `invoice_status not null` | `proforma\|issued\|paid\|void` |
| `subtotal / adjustments / total` | `numeric(10,2)` | |
| `issued_at / paid_at` | `timestamptz` | |
| `receipt_no` | `text` | |

| `invoice_items` | Type | |
|---|---|---|
| `id` | `uuid pk` | |
| `invoice_id` | `uuid not null → invoices` | |
| `result_id` | `uuid → assessment_results` | the level being billed (null for adjustments) |
| `item_type` | `text` | `assessment_fee_booked\|assessment_fee_bonus\|adjustment\|…` |
| `level` | `badge_level` | |
| `description / qty / unit_price / amount` | | |

| `payments` | Type | |
|---|---|---|
| `id` | `uuid pk` | |
| `invoice_id` | `uuid → invoices` | |
| `direction` | `payment_direction not null` | `in` (instructor→MAS) \| `out` (MAS→examiner) |
| `method / amount / proof_ref / paid_at` | | manual recording until provider wired |

---

## 5. Fee computation (the confirmed rule)

- **Booked level is prepaid on attempt** — each enrolment's `booked_level` fee is charged at **stage 1**, regardless of outcome, no refund on refer.
- **Stage-1 total** (per session) = `Σ fee(enrolment.booked_level)`. **Full prepay; settlement gates scheduling.**
- On the day the examiner records outcomes **upward from `booked_level`**, no skipping; the chain **stops at the first refer**.
- A **bonus level** = any level **above** `booked_level` that the candidate **passes**.
- **Stage-2 total** (per session) = `Σ fee(level)` over **bonus passes only**. Auto-generated when the examiner submits results. A referred level (booked or bonus) bills nothing extra.

**Worked trace (your example):** book Guppy (L3) → prepay RM50. Pass L3, pass Octopus (L4) → +RM75. Pass Frog (L5) → +RM75 → **RM150 stage-2**. Had L5 referred → stage-2 stays **RM75**. ✓

---

## 6. Issuance gating (two-batch) + certificate hooks

Certificates remain append-only; gating is by *when we insert*, never by mutation.

- **Batch 1 — booked passes:** issuable once `outcome='pass'` on a `billing_stage='booked'` row **and** its stage-1 invoice is `paid`. Since stage-1 is paid before scheduling, these issue at/after grading.
- **Batch 2 — bonus passes:** issuable once `outcome='pass'` on a `billing_stage='bonus'` row **and** the stage-2 invoice is `paid`.
- **`issue_session_certificates(_session_id, _stage)`** — governance/staff `SECURITY DEFINER`: inserts certs for every un-certified, passing level row of that stage whose invoice is paid. The existing pass-gate (`link_certificate_to_result`), serial default, and per-cert immutability all still fire.
- Revoke→reissue unchanged: revoking frees the level row's `certificate_id` back to the issuance queue.

---

## 7. Examiner firewall / RLS deltas

- Examiner reads, via extended `can_assess_candidate()`, only the enrolment essentials (candidate name, level) for sessions they're assigned — **never** snapshot billing fields, instructor-of-record, claim status, or invoices.
- Examiner **grades** level rows where they are the row's `assessor_profile_id` (the existing `results_update_assessor` USING-existing-assessor pattern, now at level grain).
- Examiner **adds a bonus level row** (insert) when a candidate clears above `booked_level`: `billing_stage='bonus'`, `fee_rm_snapshot` filled **server-side from `fee_schedule`** (examiner cannot set it). Submitting results crystallizes the stage-2 invoice from these rows. The examiner sees "3 bonus passes recorded," not "RM225."

---

## 8. Session state machine — settlement derived from the ledger

**Decision (A), confirmed against the build:** `session_status` is **not** extended with settlement states. The live enum already has the 7 operational states it needs, and money-state is **derived from the ledger** (`invoices.status`, `payments`), exactly as `list_sessions_overview()` already does. Adding `invoiced`/`paid`/`examiner_paid` to the status enum was over-modelling — it would duplicate state the ledger already holds and risk the two disagreeing.

Real lifecycle (the 7 that exist in `session_status`):

`requested` → `examiner_invited` → `scheduled` → `completed` → `closed` → `archived`, with `cancelled` out-of-band.

Money-gates sit *beside* status, read from the ledger:
- **stage-1 (booked_prepay)** invoice is generated when the examiner accepts and the session becomes `scheduled` (`respond_to_invitation`).
- **stage-2 (bonus_reconcile)** invoice is generated when the examiner submits and the session becomes `completed` (`submit_session_results`).
- **issuance** (`issue_session_certificates`) gates each batch on its stage invoice being `status='paid'` — booked certs once stage-1 is paid, bonus certs once stage-2 is paid. Never keyed off `session_status`.

> Note: an earlier draft of this section (and the Operations design's single "invoiced→paid") modelled settlement as session states. Superseded — settlement lives in the ledger; status stays operational.

---

## 9. Open micro-decisions (ratify before I write migrations)

1. **Naming:** `session_enrolments` (Tier 1) + regrained `assessment_results` (Tier 2). OK, or do you want both renamed (e.g. `session_candidates` / `session_candidate_levels`)?
2. **Snapshot column set** (§2 Tier 1): name + centre(id+name) + instructor-of-record + consent flag + booked level. Enough, or also snapshot DOB / candidate's tagged-instructor?
3. **Bonus-row authorship:** examiner inserts the bonus level row (§7). Confirm examiners get an explicit "record level cleared above booked" action, vs. pre-creating rows for *all* levels ≥ booked at scheduling and the examiner only sets outcomes.
4. **Backfill cohort year** for existing Swimmer IDs: year of `created_at` (my default) vs. all current-year.

---

## 10. Migration sequencing (next step — not yet written)

Provisional order, leaf-first, each a self-contained append-only file:

1. `…_swimmer_id.sql` — column, generator, BEFORE-INSERT trigger, backfill, `lookup_swimmer`.
2. `…_fee_schedule.sql` — `fee_schedule` + seed.
3. `…_session_enrolments.sql` — Tier-1 table + `enrolment_attendance` enum + RLS.
4. `…_results_regrain.sql` — `assessment_results` add `enrolment_id` / `billing_stage` / `fee_rm_snapshot`, repoint uniqueness, migrate any existing rows into the two-tier shape, regrain COI + issuance link.
5. `…_invoicing.sql` — `invoices` / `invoice_items` / `payments` + enums + RLS.
6. `…_issuance_gating.sql` — `issue_session_certificates`, state-machine enum extension, stage gates.

Steps 4–6 carry the real risk (touching live triggers); I'll diagnose current `assessment_sessions` columns and the exact trigger bodies before writing each, same as the role reconciliation.
