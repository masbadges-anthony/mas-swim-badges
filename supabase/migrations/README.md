# Supabase migrations

SQL migrations for the MAS Swim Badges portal database (Supabase project
`masbadges-web`, region `ap-southeast-1`).

## Workflow — cloud-only, manual apply

1. Schema work is written as a numbered `.sql` file in this folder and committed
   to GitHub (browser edit, same as the rest of the repo).
2. To apply: open the **Supabase SQL editor**, paste the file's contents, run.
3. Apply files **in filename order**. Each file is self-contained and runs
   top-to-bottom in a single execution.

Migrations are append-only history. Once a file has been applied and committed,
**do not edit it** — corrections go into a new, later migration. This keeps the
folder a faithful record of how the live database was built.

## Naming

`<UTC-timestamp>_<short_name>.sql` — e.g. `20260621090000_profiles.sql`.

The timestamp prefix makes ordering unambiguous and keeps the folder compatible
with the Supabase CLI, should we ever move off manual apply.

## Applied so far

| File | Adds |
|---|---|
| `20260621090000_profiles.sql` | `profiles` table · `handle_updated_at()` · `handle_new_user()` + `auth.users` trigger · RLS (own-row read/update) |
| `20260621093000_partner_centers.sql` | `partner_centers` table · `my_state` + `partner_center_status` enums · baseline RLS (principal reads own) |
| `20260621100000_memberships.sql` | `memberships` table · `membership_role` + `membership_status` enums · scope-validity CHECK · `has_role()` · RLS · bootstrap seed template |
| `20260621103000_partner_centers_policies_directory.sql` | `partner_centers` role policies (admin/governance/center-admin) · `partner_center_directory` public view (anon, recognized-only) |
| `20260621110000_candidates.sql` | `candidates` table (claimable minor records) · `candidate_status` enum · consent + retention fields · `anonymize_candidate()` erasure path · scoped RLS |
| `20260621120000_certificates.sql` | `badge_level` enum · append-only `certificates` ledger (immutability trigger) · `certificate_revocations` · public `verify_certificate()` lookup · RLS |

## Phase 1 schema — complete

The registry foundation the PRD said the schema must unblock is in place:
profiles · partner centers + public directory · RBAC (`has_role()`) ·
claimable candidates with consent/retention/erasure · append-only certificate
ledger with public verify-by-serial.

## Coming next (Phase 2 — issuance)

assessment/booking records → grading with **conflict-of-interest enforced in
data** (an examiner cannot grade a candidate they instruct) → tighten examiner
read/issue scope to assigned assessments → certificate serial generation.

## Phase 2 — in progress

| File | Adds |
|---|---|
| `20260621130000_assessments.sql` | `assessment_sessions` + `assessment_results` · `session_status` + `assessment_outcome` enums · **COI enforcement trigger** · `can_assess_candidate()` + examiner-scoped candidate reads · RLS |

Still ahead in P2: tie certificate issuance to a passed result (serial
generation + a trigger so a cert can only be issued against a `pass`).
