-- 20260629140000_swimmer_id.sql
-- #12 Assessment Workflow Redesign — migration 1 of N (leaf, additive, no live-trigger touch).
--
-- Adds the human-readable, non-secret Swimmer ID to candidates.
--   Format: SW{YY}-{XXXXX}  where YY = 2-digit cohort year (year of registration),
--           XXXXX = 5 chars of Crockford base32 (0-9 A-Z minus I,L,O,U) — transcription-safe,
--           randomized to defeat enumeration. Space = 32^5 = 33,554,432 per cohort year.
-- Pairs with DOB in lookup_swimmer() for existing-candidate match (bulk roster) and the claim flow.
-- The secret remains candidates.claim_code; both print on the claim slip.

-- (1) Column (nullable for backfill; constrained at step 4).
alter table public.candidates add column if not exists swimmer_id text;

-- (2) Generator — SECURITY DEFINER so the uniqueness probe reads past candidates' RLS.
--     Bounded retry; the UNIQUE constraint (step 4) is the hard backstop.
create or replace function public.generate_swimmer_id(_cohort_year int)
 returns text
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  _alphabet constant text := '0123456789ABCDEFGHJKMNPQRSTVWXYZ';  -- Crockford base32
  _yy       text := lpad((_cohort_year % 100)::text, 2, '0');
  _suffix   text;
  _candidate text;
  _i        int;
  _attempt  int := 0;
begin
  loop
    _attempt := _attempt + 1;
    _suffix := '';
    for _i in 1..5 loop
      _suffix := _suffix || substr(_alphabet, 1 + floor(random() * 32)::int, 1);
    end loop;
    _candidate := 'SW' || _yy || '-' || _suffix;

    if not exists (select 1 from public.candidates where swimmer_id = _candidate) then
      return _candidate;
    end if;

    if _attempt >= 100 then
      raise exception 'generate_swimmer_id: exhausted attempts for cohort %', _cohort_year;
    end if;
  end loop;
end;
$function$;

-- (3) Backfill existing rows, row-by-row so each generation sees prior assignments
--     (a single set-based UPDATE would probe a pre-update snapshot and risk intra-batch dupes).
do $$
declare r record;
begin
  for r in select id, created_at from public.candidates where swimmer_id is null loop
    update public.candidates
      set swimmer_id = public.generate_swimmer_id(extract(year from r.created_at)::int)
      where id = r.id;
  end loop;
end $$;

-- (4) Lock it down now that every row has a value.
alter table public.candidates add constraint candidates_swimmer_id_key unique (swimmer_id);
alter table public.candidates alter column swimmer_id set not null;

-- (5) Assign on future inserts (respects an explicitly supplied value, e.g. data migration).
create or replace function public.set_swimmer_id()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
begin
  if new.swimmer_id is null then
    new.swimmer_id := public.generate_swimmer_id(extract(year from coalesce(new.created_at, now()))::int);
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_set_swimmer_id on public.candidates;
create trigger trg_set_swimmer_id
  before insert on public.candidates
  for each row execute function public.set_swimmer_id();

-- (6) Existing-candidate lookup: exact Swimmer ID + DOB. DEFINER so it can confirm a match
--     without exposing candidate rows broadly; returns only minimal fields.
create or replace function public.lookup_swimmer(_swimmer_id text, _dob date)
 returns table(id uuid, full_name text, status candidate_status)
 language sql
 stable security definer
 set search_path to ''
as $function$
  select c.id, c.full_name, c.status
  from public.candidates c
  where c.swimmer_id = _swimmer_id
    and c.date_of_birth = _dob;
$function$;

revoke all on function public.generate_swimmer_id(int) from public;
grant execute on function public.lookup_swimmer(text, date) to authenticated;
