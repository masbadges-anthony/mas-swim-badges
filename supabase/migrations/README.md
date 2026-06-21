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

## Coming next (Phase 1)

revisit `partner_centers` role policies + public directory view → `candidates`
(claimable minor records) → certificate-verification view.
