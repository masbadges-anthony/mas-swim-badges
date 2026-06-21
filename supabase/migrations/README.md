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

## Coming next (Phase 1)

certificate-verification view (the last Phase 1 piece) — note: the
`certificates` table it reads is part of Phase 2 (issuance), so the public
verify-by-serial surface may land alongside P2.
