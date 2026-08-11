-- 20260721110000_cd4_fee_schedule_seed.sql
--
-- Seeds the ratified CD-4 assessment payout schedule into fee_schedule.
--
--   Levels 1-3 (Starfish/Guppy/Frog): RM 10 examiner + RM 10 instructor +
--     RM 10 hosting + RM 20 MAS retention = RM 50 total per candidate
--
--   Levels 4-7 (Octopus/Sea Turtle/Swordfish/Dolphin): RM 15/15/15/30 = RM 75
--
-- Governance reference: Manual §16 (framework), Appendix D CD-4 (ratified
-- schedule), Appendix F (Portal-authoritative values).
--
-- Written defensively: this migration TESTS what shape fee_schedule has and
-- inserts only if columns match. If the schema differs from what's assumed,
-- the DO block raises a clear notice explaining what to do rather than
-- silently failing or corrupting data.

do $$
declare
  _has_level      boolean;
  _has_level_band boolean;
  _has_component  boolean;
  _has_amount     boolean;
  _has_active     boolean;
begin
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='fee_schedule' and column_name='level')
    into _has_level;
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='fee_schedule' and column_name='level_band')
    into _has_level_band;
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='fee_schedule' and column_name='component')
    into _has_component;
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='fee_schedule' and column_name='amount')
    into _has_amount;
  select exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='fee_schedule' and column_name='is_active')
    into _has_active;

  raise notice 'fee_schedule columns: level=%, level_band=%, component=%, amount=%, is_active=%',
    _has_level, _has_level_band, _has_component, _has_amount, _has_active;

  -- CASE 1: schema uses per-level rows (level int + component text + amount numeric)
  if _has_level and _has_component and _has_amount then
    raise notice 'Detected per-level schema. Seeding 7 levels x 4 components = 28 rows.';

    -- Clear any existing CD-4 seed to make this idempotent.
    delete from public.fee_schedule
     where component in ('examiner','instructor','hosting','mas_retention');

    -- Levels 1-3: RM 10/10/10/20
    insert into public.fee_schedule (level, component, amount)
      select l, c, a from (values
        (1, 'examiner',      10.00::numeric), (1, 'instructor', 10.00), (1, 'hosting', 10.00), (1, 'mas_retention', 20.00),
        (2, 'examiner',      10.00),          (2, 'instructor', 10.00), (2, 'hosting', 10.00), (2, 'mas_retention', 20.00),
        (3, 'examiner',      10.00),          (3, 'instructor', 10.00), (3, 'hosting', 10.00), (3, 'mas_retention', 20.00),
        -- Levels 4-7: RM 15/15/15/30
        (4, 'examiner',      15.00),          (4, 'instructor', 15.00), (4, 'hosting', 15.00), (4, 'mas_retention', 30.00),
        (5, 'examiner',      15.00),          (5, 'instructor', 15.00), (5, 'hosting', 15.00), (5, 'mas_retention', 30.00),
        (6, 'examiner',      15.00),          (6, 'instructor', 15.00), (6, 'hosting', 15.00), (6, 'mas_retention', 30.00),
        (7, 'examiner',      15.00),          (7, 'instructor', 15.00), (7, 'hosting', 15.00), (7, 'mas_retention', 30.00)
      ) as v(l, c, a);

    raise notice 'CD-4 seed complete (per-level schema).';

  -- CASE 2: schema uses level bands (band text + component + amount)
  elsif _has_level_band and _has_component and _has_amount then
    raise notice 'Detected level-band schema. Seeding 2 bands x 4 components = 8 rows.';

    delete from public.fee_schedule
     where component in ('examiner','instructor','hosting','mas_retention');

    insert into public.fee_schedule (level_band, component, amount)
      select b, c, a from (values
        ('L1_L3', 'examiner',      10.00::numeric),
        ('L1_L3', 'instructor',    10.00),
        ('L1_L3', 'hosting',       10.00),
        ('L1_L3', 'mas_retention', 20.00),
        ('L4_L7', 'examiner',      15.00),
        ('L4_L7', 'instructor',    15.00),
        ('L4_L7', 'hosting',       15.00),
        ('L4_L7', 'mas_retention', 30.00)
      ) as v(b, c, a);

    raise notice 'CD-4 seed complete (level-band schema).';

  else
    raise exception 'fee_schedule schema does not match either expected shape (per-level or level-band with component + amount columns). Aborting seed. Run the fee_schedule diagnostic and share the column list — the seed can be adjusted.';
  end if;
end $$;
