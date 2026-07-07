-- 20260707142000_quiz_module_functions.sql  (corrected: my_role_kinds status list)
-- Onboarding quiz module — RPCs. All SECURITY DEFINER, search_path locked.
-- Draw hides correct answers; submission scores and THEN returns the key.

-- Which role_kinds does the current user hold (or is onboarding for)?
create or replace function public.my_role_kinds()
 returns table (role_kind public.role_kind)
 language sql stable security definer set search_path to ''
as $$
  select distinct k.role_kind
  from (
    select case
             when m.role in ('instructor','partner_center_admin') then 'instructor'::public.role_kind
             when m.role = 'examiner' then 'examiner'::public.role_kind
           end as role_kind
    from public.memberships m
    where m.profile_id = (select auth.uid())
      and m.status in ('pending','active')
  ) k
  where k.role_kind is not null;
$$;

-- Start an attempt: draw draw_size random active questions, hide the answers.
create or replace function public.start_quiz_attempt(p_role public.role_kind)
 returns table (attempt_id uuid, question_id uuid, category text, stem text, options text[])
 language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_n int; v_attempt uuid; v_ids uuid[];
begin
  if not exists (select 1 from public.my_role_kinds() r where r.role_kind = p_role) then
    raise exception 'not eligible for the % quiz', p_role using errcode = '42501';
  end if;

  select c.draw_size into v_n from public.quiz_config c where c.role_kind = p_role;
  if v_n is null then raise exception 'no quiz config for %', p_role; end if;

  select array_agg(q.id) into v_ids
  from (select id from public.quiz_question
        where role_kind = p_role and active
        order by random() limit v_n) q;

  if v_ids is null or array_length(v_ids,1) < v_n then
    raise exception 'question bank for % has fewer than % active questions', p_role, v_n;
  end if;

  insert into public.quiz_attempt (profile_id, role_kind, question_ids)
  values ((select auth.uid()), p_role, v_ids)
  returning id into v_attempt;

  return query
    select v_attempt, q.id, q.category, q.stem, q.options
    from public.quiz_question q
    join unnest(v_ids) with ordinality u(qid, ord) on u.qid = q.id
    order by u.ord;
end;
$$;

-- Submit an attempt: score, persist, gate onboarding, return the key.
create or replace function public.submit_quiz_attempt(p_attempt uuid, p_answers int[])
 returns table (score int, pass_mark int, passed boolean,
                question_id uuid, your_answer int, correct_index int, is_correct boolean)
 language plpgsql volatile security definer set search_path to ''
as $$
declare
  v_role public.role_kind; v_ids uuid[]; v_pass int; v_score int; v_ok boolean;
begin
  select a.role_kind, a.question_ids into v_role, v_ids
  from public.quiz_attempt a
  where a.id = p_attempt and a.profile_id = (select auth.uid()) and a.submitted_at is null;
  if v_role is null then raise exception 'attempt not found or already submitted' using errcode='42501'; end if;
  if array_length(p_answers,1) is distinct from array_length(v_ids,1) then
    raise exception 'answer count does not match question count';
  end if;

  select c.pass_mark into v_pass from public.quiz_config c where c.role_kind = v_role;

  select count(*) filter (where p_answers[o.ord] = q.correct_index) into v_score
  from unnest(v_ids) with ordinality o(qid, ord)
  join public.quiz_question q on q.id = o.qid;

  v_ok := v_score >= v_pass;

  update public.quiz_attempt
    set answers = p_answers, score = v_score, passed = v_ok, submitted_at = now()
  where id = p_attempt;

  if v_ok then
    insert into public.onboarding_checkpoint (profile_id, role_kind, quiz_passed, quiz_passed_at)
    values ((select auth.uid()), v_role, true, now())
    on conflict (profile_id, role_kind) do update
      set quiz_passed = true,
          quiz_passed_at = coalesce(public.onboarding_checkpoint.quiz_passed_at, now()),
          updated_at = now();
  end if;

  return query
    select v_score, v_pass, v_ok,
           q.id, p_answers[o.ord], q.correct_index, (p_answers[o.ord] = q.correct_index)
    from unnest(v_ids) with ordinality o(qid, ord)
    join public.quiz_question q on q.id = o.qid
    order by o.ord;
end;
$$;

-- First-login gate: what does the current user still owe, per role?
create or replace function public.get_onboarding_status()
 returns table (role_kind public.role_kind, quiz_passed boolean,
                coc_accepted boolean, activated boolean, outstanding text[])
 language sql stable security definer set search_path to ''
as $$
  select r.role_kind,
         coalesce(cp.quiz_passed, false),
         (cp.coc_accepted_at is not null),
         coalesce(cp.activated, false),
         array_remove(array[
           case when not coalesce(cp.quiz_passed, false) then 'quiz' end,
           case when cp.coc_accepted_at is null          then 'code_of_conduct' end
         ], null)
  from public.my_role_kinds() r
  left join public.onboarding_checkpoint cp
    on cp.profile_id = (select auth.uid()) and cp.role_kind = r.role_kind;
$$;

create or replace function public.needs_onboarding()
 returns boolean language sql stable security definer set search_path to ''
as $$
  select exists (
    select 1 from public.get_onboarding_status() s
    where array_length(s.outstanding, 1) > 0
  );
$$;

grant execute on function public.my_role_kinds(),
  public.start_quiz_attempt(public.role_kind),
  public.submit_quiz_attempt(uuid, int[]),
  public.get_onboarding_status(),
  public.needs_onboarding()
  to authenticated;
