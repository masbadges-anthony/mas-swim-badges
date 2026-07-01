-- #19 unit 1 — parent claim flow: schema + reads.
-- Adds optional parent_email on candidates, a pre-signup verify function, and
-- the two parent dashboard reads (claimed swimmers list + per-swimmer tracker).

-- (1) parent_email — nullable, purely informational for now. Optional field on
--     candidate registration; used later for email delivery of the claim slip.
alter table public.candidates
  add column if not exists parent_email text;

-- (2) verify_claim_code — public/anon-safe pre-signup check.
--     Returns whether the code is valid and unclaimed, plus the child's first
--     name only (so the parent can visually confirm "yes, this is my kid's slip")
--     without leaking DOB, centre, or full identity to code-guessers.
create or replace function public.verify_claim_code(_code text)
 returns table(valid boolean, reason text, child_first_name text)
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select
    case
      when c.id is null then false
      when c.claimed_by_profile_id is not null then false
      when c.status = 'anonymized' then false
      else true
    end,
    case
      when c.id is null then 'invalid'
      when c.claimed_by_profile_id is not null then 'already_claimed'
      when c.status = 'anonymized' then 'invalid'
      else null
    end,
    case
      when c.id is null or c.claimed_by_profile_id is not null or c.status = 'anonymized'
      then null
      else split_part(c.full_name, ' ', 1)
    end
  from (select 1) x
  left join public.candidates c on c.claim_code = _code;
$fn$;

-- Anon can hit this — it's the pre-signup gate.
grant execute on function public.verify_claim_code(text) to anon, authenticated;

-- (3) list_my_claimed_swimmers — the parent dashboard's "one card per child".
--     Returns everything the card needs to render without another round-trip:
--     identity, highest cert, cert count.
create or replace function public.list_my_claimed_swimmers()
 returns table(
   candidate_id     uuid,
   full_name        text,
   date_of_birth    date,
   swimmer_id       text,
   status           text,
   highest_level    public.badge_level,
   highest_level_on date,
   cert_count       integer
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  select
    c.id, c.full_name, c.date_of_birth, c.swimmer_id, c.status::text,
    hi.level, hi.issued_on,
    coalesce(cc.n, 0)::int
  from public.candidates c
  left join lateral (
    select ce.level, ce.issued_on
    from public.certificates ce
    where ce.candidate_id = c.id
    order by array_position(enum_range(null::public.badge_level), ce.level) desc, ce.issued_on desc
    limit 1
  ) hi on true
  left join lateral (
    select count(*) as n from public.certificates ce where ce.candidate_id = c.id
  ) cc on true
  where c.claimed_by_profile_id = (select auth.uid())
  order by c.full_name;
$fn$;

grant execute on function public.list_my_claimed_swimmers() to authenticated;

-- (4) list_swimmer_tracker — one claimed child's active-session tracker.
--     Only returns a row if the child has a non-terminal session; otherwise empty.
--     Mirrors #15's list_session_tracker but scoped to one candidate + parent-safe
--     (no invoice detail, no examiner contact details — only the checkpoints,
--     scheduled venue/date, and status).
create or replace function public.list_swimmer_tracker(_candidate_id uuid)
 returns table(
   session_id     uuid,
   venue          text,
   state          public.my_state,
   scheduled_on   date,
   status         public.session_status,
   booked_level   public.badge_level,
   cp_created     boolean,
   cp_roster      boolean,
   cp_paid        boolean,
   cp_examiner    boolean,
   cp_completed   boolean,
   cp_certs       boolean
 )
 language sql
 stable security definer
 set search_path to ''
as $fn$
  -- authorization: the caller must be the claimed parent of this candidate.
  with me_owns as (
    select 1 from public.candidates
    where id = _candidate_id and claimed_by_profile_id = (select auth.uid())
  ),
  active as (
    select se.session_id, se.booked_level, s.venue, s.state, s.scheduled_on, s.status,
           s.examiner_profile_id
    from public.session_enrolments se
    join public.assessment_sessions s on s.id = se.session_id
    where se.candidate_id = _candidate_id
      and s.status not in ('cancelled', 'archived', 'closed')
    order by s.scheduled_on desc nulls last
    limit 1
  ),
  inv as (
    select i.status
    from public.invoices i
    where i.session_id = (select session_id from active) and i.stage = 'booked_prepay'
    order by i.created_at desc
    limit 1
  )
  select
    a.session_id, a.venue, a.state, a.scheduled_on, a.status, a.booked_level,
    true,
    exists (select 1 from public.session_enrolments e where e.session_id = a.session_id),
    ((select status from inv) = 'paid'),
    (a.examiner_profile_id is not null),
    (a.status in ('completed')),
    (exists (select 1 from public.assessment_results r
             where r.session_id = a.session_id and r.outcome = 'pass')
     and not exists (select 1 from public.assessment_results r
             where r.session_id = a.session_id and r.outcome = 'pass' and r.certificate_id is null))
  from active a
  where exists (select 1 from me_owns);
$fn$;

grant execute on function public.list_swimmer_tracker(uuid) to authenticated;
