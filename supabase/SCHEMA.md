# MAS Swim Badges — Database Schema Reference

Companion to `supabase/migrations/`. Documents the data model and the security
architecture as built through Phase 1 and the issuance core of Phase 2.

Apply workflow is unchanged: paste each migration (in filename order) into the
Supabase SQL editor for project `masbadges-web`. See `migrations/README.md`.

---

## 1. What the database covers

The certificate lifecycle, end to end:

```
register candidate → book session → assign examiner → assess → PASS
   → issue certificate (gated + serialised) → verify (public)
   → revoke → reissue
```

Plus the registry it all hangs off: people, their roles, and partner centers.

---

## 2. Tables at a glance

**People & access**
- `profiles` — one row per authenticated adult, 1:1 with `auth.users`. Minors are never here.
- `memberships` — the RBAC core. One row = one role grant to one person, scoped by state and/or center.

**Registry**
- `partner_centers` — recognition register for swim schools / clubs / academies. Optional for participation.

**Children**
- `candidates` — claimable minor records (5–12). Minimized identity + consent/retention/erasure fields.

**Assessment**
- `assessment_sessions` — a booking/event with an assigned examiner.
- `assessment_results` — one row per candidate per session; the roster until graded, then `pass`/`refer`.

**Certificates**
- `certificates` — append-only ledger. Names snapshotted at issue.
- `certificate_revocations` — append-only; one revocation per cert; links to its reissued replacement.

---

## 3. Relationships

```mermaid
erDiagram
    auth_users   ||--|| profiles : "1:1 (trigger)"
    profiles     ||--o{ memberships : holds
    partner_centers ||--o{ memberships : "scopes (center admin)"
    profiles     ||--o{ partner_centers : "principal"
    profiles     ||--o{ candidates : "registered_by / claimed_by"
    partner_centers ||--o{ candidates : "context"
    profiles     ||--o{ assessment_sessions : "requested_by / examiner"
    partner_centers ||--o{ assessment_sessions : hosts
    assessment_sessions ||--o{ assessment_results : rosters
    candidates   ||--o{ assessment_results : "assessed in"
    profiles     ||--o{ assessment_results : assessor
    assessment_results ||--o| certificates : "pass yields (1:1)"
    candidates   ||--o{ certificates : "issued to"
    certificates ||--o| certificate_revocations : "revoked by"
    certificates ||--o{ certificate_revocations : "replaces"
```

---

## 4. Security model (the cross-cutting design)

**RLS everywhere, deny-by-default.** Every table has RLS enabled. Access is
granted only by explicit policy; absent a matching policy, the row is invisible.

**`has_role()` is the spine.** Every role check in every policy calls
`has_role(role, center_id?)`. It is `SECURITY DEFINER` so it reads `memberships`
past that table's own RLS — which is what lets policies *on* `memberships` call
it without infinite recursion. It also treats an expired term as inactive even
if the status wasn't flipped.

**Definer helpers follow the same pattern.** `can_assess_candidate()` scopes an
examiner's reads to candidates they're actually assigned to assess — again
definer, to avoid RLS recursion through the assessment tables.

**Two public surfaces, two different shapes, on purpose:**
- `partner_center_directory` — a **view**. Public listing is the point, so an
  anonymous-readable definer view exposing only recognized centers and only safe
  columns is correct. (Shows as a "security definer view" in the linter — intended.)
- `verify_certificate(serial)` — a **function**, not a view. A view would let
  anyone scrape every child's name; a function keyed on an exact serial can only
  confirm a serial you already hold. No enumeration.

**Minors' data is protected in layers:**
- *Minimization* — `candidates` holds identity + governance fields only. No
  address, ID numbers, photos, medical or school data. School/booking detail
  lives on assessment records, not the child's identity.
- *Consent* — explicit flag plus who/when recorded (auditable).
- *Erasure* — `anonymize_candidate()` strips PII but keeps the row so
  certificate lineage survives; `verify_certificate()` masks anonymized names.
- *Scoped reads* — only the registrant, claiming parent, that center's admin,
  the assigned examiner, and program leadership can see a candidate.

**Conflict of interest is enforced in data.** `enforce_assessment_coi()` rejects
any result whose assessor instructs the candidate, and any assessor who isn't an
active examiner. It is a trigger — not a UI rule — so a direct API call can't
bypass it. (Manual §10.1.)

**Certificates are append-only.** `certificates_block_mutation()` blocks every
UPDATE/DELETE outright, beyond RLS. Corrections go through revoke-and-reissue:
revoke (which frees the underlying pass) then issue a corrected cert. A
certificate can't be created at all without a passing result behind it
(`link_certificate_to_result()`), guaranteeing one valid cert per pass.

---

## 5. Enums

| Enum | Values |
|---|---|
| `my_state` | 13 states + KL, Labuan, Putrajaya |
| `partner_center_status` | pending, recognized, suspended, removed |
| `membership_role` | board_member, coaching_panel, chairperson, chief_examiner, examiner_trainer, examiner, instructor, partner_center_admin |
| `membership_status` | pending, active, suspended, expired, revoked |
| `candidate_status` | active, withdrawn, anonymized |
| `badge_level` | starfish, sea_turtle, guppy, octopus, frog, swordfish, dolphin (1→7) |
| `session_status` | requested, scheduled, completed, cancelled |
| `assessment_outcome` | pass, refer |

---

## 6. Open decisions blocking Phases 3–4

These are governance calls, not engineering ones. Each blocks clean schema work
downstream, so resolving them prevents rework.

1. **Child-data retention duration.** `candidates.retention_until` exists but is
   intentionally unset — the *how long* is a board decision. Until set, no
   automated retention/erasure job can be written.
2. **Erasure vs. immutable certificates.** Today anonymization masks the child's
   name in public verification but the append-only certificate retains the
   snapshot internally. If full erasure must scrub the certificate too, that's a
   privileged override of immutability — a policy call to make explicitly.
3. **Parent claiming (blocks Phase 3).** How does a parent prove guardianship to
   claim a candidate? The mechanism (one-time claim code? token? manual
   verification?) determines what columns/flows the claim feature needs.
4. **Fees & payments (blocks Phase 4).** How are partner application and
   assessment fees collected and recorded? Payment provider choice drives the
   fee/transaction tables and whether any of it touches Edge Functions.
5. **Data controller / ownership.** Who is the legal data controller (MAS as an
   entity)? Affects retention, erasure, and the consent wording.
6. **Final web address & brand placement**, and **Phase 1 sign-off.**

---

## 7. Status

| Phase | Scope | State |
|---|---|---|
| 1 | Registry · directory · RBAC · candidates · verification | **schema complete** |
| 2 | Assessment · grading (COI) · issuance | **core complete**; serial gen + pass-gate done |
| 3 | Parent portal (candidate claiming) | blocked on decision #3 |
| 4 | Partner self-service · fees | blocked on decision #4 |
