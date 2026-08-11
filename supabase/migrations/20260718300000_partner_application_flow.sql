-- 20260718300000_partner_application_flow.sql
--
-- Partner-centre application flow, three RPCs:
--
--   submit_public_enquiry(...)            anon-callable; writes an enquiries
--                                         row (category='centre_partnership').
--                                         Anti-spam guarded on the message
--                                         length and required-field checks.
--
--   convert_enquiry_to_application(...)   chairperson/board only; creates a
--                                         partner_centers stub in status
--                                         'pending' and a partner_applications
--                                         row linking to the enquiry. From
--                                         here the applicant fills the
--                                         proposed_* details.
--
--   decide_partner_application_split(...) chairperson/board/system_admin;
--                                         separates teach and assess
--                                         decisions. Each may be granted or
--                                         denied independently. When both
--                                         are decided (approved or denied),
--                                         the application status flips.
--                                         Approval seeds partner_centers
--                                         from the proposed_* values.
--
-- The existing decide_partner_application (single boolean) remains available
-- for backward compatibility with the current reviewer surface until it is
-- extended.

-- ============ 1 · submit_public_enquiry (anon-callable) ============
create or replace function public.submit_public_enquiry(
  _category      text,
  _contact_name  text,
  _contact_email text,
  _contact_phone text,
  _organisation  text,
  _state         text,
  _message       text
)
returns uuid
language plpgsql security definer set search_path to ''
as $$
declare
  _cat public.enquiry_category;
  _id  uuid;
begin
  -- Category whitelist (only the ones we allow public submission for).
  if _category not in ('centre_partnership', 'instructor_registration', 'parent_swimmer', 'general') then
    raise exception 'Unknown enquiry category.';
  end if;
  _cat := _category::public.enquiry_category;

  -- Required field validation.
  if coalesce(trim(_contact_name), '') = '' or coalesce(trim(_contact_email), '') = '' then
    raise exception 'Name and email are required.';
  end if;
  if _contact_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Please provide a valid email address.';
  end if;
  if coalesce(trim(_message), '') = '' then
    raise exception 'Please tell us how we can help.';
  end if;
  if char_length(_message) > 2000 then
    raise exception 'Message is too long (max 2000 characters).';
  end if;

  -- centre_partnership requires organisation + state
  if _cat = 'centre_partnership' then
    if coalesce(trim(_organisation), '') = '' then
      raise exception 'Centre name is required for a centre partnership enquiry.';
    end if;
    if coalesce(trim(_state), '') = '' then
      raise exception 'State is required.';
    end if;
  end if;

  insert into public.enquiries
    (category, contact_name, contact_email, contact_phone,
     organisation, state, message, status)
  values
    (_cat, trim(_contact_name), lower(trim(_contact_email)), nullif(trim(_contact_phone), ''),
     nullif(trim(_organisation), ''), nullif(trim(_state), ''), trim(_message), 'new')
  returning id into _id;

  return _id;
end;
$$;
grant execute on function public.submit_public_enquiry(text, text, text, text, text, text, text) to anon, authenticated;

-- ============ 2 · convert_enquiry_to_application ============
-- Reviewer sees a centre_partnership enquiry, decides it's legitimate,
-- clicks Convert. This creates:
--   • a partner_centers row (status='pending', name from enquiry.organisation)
--   • a partner_applications row (status='submitted', linked to the enquiry)
--   • marks the enquiry acknowledged
-- The applicant subsequently fills in the proposed_* fields via
-- submit_partner_application_details (below).
create or replace function public.convert_enquiry_to_application(
  _enquiry_id            uuid,
  _applicant_profile_id  uuid  -- the account the applicant will use to sign in
)
returns uuid  -- returns partner_application id
as $$
declare
  _enq       public.enquiries%rowtype;
  _centre_id uuid;
  _app_id    uuid;
  _state     public.my_state;
begin
  if not (public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('system_admin')) then
    raise exception 'Not authorised.';
  end if;

  select * into _enq from public.enquiries where id = _enquiry_id;
  if not found then
    raise exception 'Enquiry not found.';
  end if;
  if _enq.category <> 'centre_partnership' then
    raise exception 'Only centre partnership enquiries can be converted.';
  end if;
  if _enq.state is null or coalesce(trim(_enq.organisation), '') = '' then
    raise exception 'Enquiry is missing centre name or state.';
  end if;

  begin
    _state := _enq.state::public.my_state;
  exception when others then
    raise exception 'Invalid state on enquiry: %', _enq.state;
  end;

  if not exists (select 1 from public.profiles where id = _applicant_profile_id) then
    raise exception 'Applicant profile does not exist.';
  end if;

  insert into public.partner_centers
    (name, state, status, principal_profile_id, contact_email, contact_phone)
  values
    (_enq.organisation, _state, 'pending', _applicant_profile_id,
     _enq.contact_email, _enq.contact_phone)
  returning id into _centre_id;

  insert into public.partner_applications
    (partner_center_id, submitted_by_profile_id,
     poc_name, poc_email, poc_phone,
     status, enquiry_id)
  values
    (_centre_id, _applicant_profile_id,
     _enq.contact_name, _enq.contact_email, _enq.contact_phone,
     'submitted', _enquiry_id)
  returning id into _app_id;

  update public.enquiries
     set status = 'acknowledged',
         handled_by_profile_id = auth.uid(),
         handled_at = now()
   where id = _enquiry_id;

  return _app_id;
end;
$$ language plpgsql security definer set search_path to '';
grant execute on function public.convert_enquiry_to_application(uuid, uuid) to authenticated;

-- ============ 3 · submit_partner_application_details ============
-- The applicant (submitted_by_profile_id) fills in the proposed_* details.
-- Callable only by the applicant themselves, only while status = 'submitted'
-- or 'pending'.
create or replace function public.submit_partner_application_details(
  _app_id                     uuid,
  _requested_can_teach        boolean,
  _requested_can_assess       boolean,
  _proposed_public_blurb      text,
  _proposed_address_line1     text,
  _proposed_address_line2     text,
  _proposed_city              text,
  _proposed_postcode          text,
  _proposed_google_maps_url   text,
  _proposed_public_email      text,
  _proposed_public_phone      text,
  _proposed_hours_text        text,
  _proposed_image_paths       text[],
  _proposed_pool_length_m     numeric,
  _proposed_pool_min_depth_m  numeric,
  _proposed_pool_max_depth_m  numeric,
  _proposed_pool_lane_count   integer,
  _proposed_pool_certified    boolean,
  _proposed_pool_certifier    text,
  _proposed_has_lifeguard     boolean,
  _proposed_has_eap           boolean,
  _proposed_has_first_aid_aed boolean,
  _proposed_has_adequate_deck boolean
)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _app public.partner_applications%rowtype;
begin
  select * into _app from public.partner_applications where id = _app_id;
  if not found then raise exception 'Application not found.'; end if;

  if _app.submitted_by_profile_id <> auth.uid() then
    raise exception 'Only the applicant may submit these details.';
  end if;
  if _app.status not in ('submitted', 'pending') then
    raise exception 'This application has already been decided.';
  end if;

  if _proposed_image_paths is not null and array_length(_proposed_image_paths, 1) > 5 then
    raise exception 'Maximum 5 photos.';
  end if;

  update public.partner_applications set
    requested_can_teach        = coalesce(_requested_can_teach, false),
    requested_can_assess       = coalesce(_requested_can_assess, false),
    proposed_public_blurb      = _proposed_public_blurb,
    proposed_address_line1     = _proposed_address_line1,
    proposed_address_line2     = _proposed_address_line2,
    proposed_city              = _proposed_city,
    proposed_postcode          = _proposed_postcode,
    proposed_google_maps_url   = _proposed_google_maps_url,
    proposed_public_email      = _proposed_public_email,
    proposed_public_phone      = _proposed_public_phone,
    proposed_hours_text        = _proposed_hours_text,
    proposed_image_paths       = coalesce(_proposed_image_paths, '{}'::text[]),
    proposed_pool_length_m     = _proposed_pool_length_m,
    proposed_pool_min_depth_m  = _proposed_pool_min_depth_m,
    proposed_pool_max_depth_m  = _proposed_pool_max_depth_m,
    proposed_pool_lane_count   = _proposed_pool_lane_count,
    proposed_pool_certified    = coalesce(_proposed_pool_certified, false),
    proposed_pool_certifier    = _proposed_pool_certifier,
    proposed_has_lifeguard     = coalesce(_proposed_has_lifeguard, false),
    proposed_has_eap           = coalesce(_proposed_has_eap, false),
    proposed_has_first_aid_aed = coalesce(_proposed_has_first_aid_aed, false),
    proposed_has_adequate_deck = coalesce(_proposed_has_adequate_deck, false),
    status                     = 'pending'  -- move from 'submitted' → 'pending' once applicant has filled in
  where id = _app_id;
end;
$$;
grant execute on function public.submit_partner_application_details(
  uuid, boolean, boolean, text, text, text, text, text, text, text, text, text,
  text[], numeric, numeric, numeric, integer, boolean, text,
  boolean, boolean, boolean, boolean
) to authenticated;

-- ============ 4 · decide_partner_application_split ============
-- Grants teach and/or assess independently, seeds partner_centers from
-- proposed_* at grant time. Flips application status when both dimensions
-- have been decided (either granted or explicitly not requested).
create or replace function public.decide_partner_application_split(
  _app_id       uuid,
  _grant_teach  boolean,   -- true = grant, false = deny/decline
  _grant_assess boolean,
  _note         text default null
)
returns void
language plpgsql security definer set search_path to ''
as $$
declare
  _app     public.partner_applications%rowtype;
  _centre  public.partner_centers%rowtype;
begin
  if not (public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('system_admin')) then
    raise exception 'Not authorised.';
  end if;

  select * into _app from public.partner_applications where id = _app_id;
  if not found then raise exception 'Application not found.'; end if;
  if _app.status not in ('submitted', 'pending') then
    raise exception 'This application has already been decided.';
  end if;

  select * into _centre from public.partner_centers where id = _app.partner_center_id;
  if not found then raise exception 'Linked centre not found.'; end if;

  -- Apply capability grants + seed public directory fields from the proposed_*
  update public.partner_centers set
    can_teach   = case when _grant_teach  then true else can_teach end,
    can_assess  = case when _grant_assess then true else can_assess end,
    status      = case when _grant_teach or _grant_assess then 'recognized' else status end,
    recognized_at = case when (_grant_teach or _grant_assess) and status <> 'recognized' then current_date else recognized_at end,
    valid_until = case when (_grant_teach or _grant_assess) and valid_until is null then current_date + interval '1 year' else valid_until end,
    -- Seed public-facing fields from application (only if empty)
    address_line1        = coalesce(address_line1, _app.proposed_address_line1),
    address_line2        = coalesce(address_line2, _app.proposed_address_line2),
    city                 = coalesce(city, _app.proposed_city),
    postcode             = coalesce(postcode, _app.proposed_postcode),
    google_maps_url      = coalesce(google_maps_url, _app.proposed_google_maps_url),
    public_contact_email = coalesce(public_contact_email, _app.proposed_public_email),
    public_contact_phone = coalesce(public_contact_phone, _app.proposed_public_phone),
    operating_hours_text = coalesce(operating_hours_text, _app.proposed_hours_text),
    public_blurb         = coalesce(public_blurb, _app.proposed_public_blurb),
    image_paths          = case when array_length(image_paths, 1) is null and _app.proposed_image_paths is not null
                                then _app.proposed_image_paths else image_paths end,
    -- Seed pool spec (only if empty)
    pool_length_m         = coalesce(pool_length_m, _app.proposed_pool_length_m),
    pool_min_depth_m      = coalesce(pool_min_depth_m, _app.proposed_pool_min_depth_m),
    pool_max_depth_m      = coalesce(pool_max_depth_m, _app.proposed_pool_max_depth_m),
    pool_lane_count       = coalesce(pool_lane_count, _app.proposed_pool_lane_count),
    pool_certified        = case when pool_certified then true else _app.proposed_pool_certified end,
    pool_certifier        = coalesce(pool_certifier, _app.proposed_pool_certifier),
    has_lifeguard_on_duty = case when has_lifeguard_on_duty then true else _app.proposed_has_lifeguard end,
    has_eap               = case when has_eap then true else _app.proposed_has_eap end,
    has_first_aid_aed     = case when has_first_aid_aed then true else _app.proposed_has_first_aid_aed end,
    has_adequate_deck     = case when has_adequate_deck then true else _app.proposed_has_adequate_deck end,
    updated_at            = now()
  where id = _app.partner_center_id;

  -- Application status: approved if either was granted, denied if both refused
  update public.partner_applications set
    status = case when _grant_teach or _grant_assess then 'approved'::public.partner_application_status
                  else 'denied'::public.partner_application_status end,
    decided_by_profile_id = auth.uid(),
    decided_at = now(),
    decision_note = coalesce(_note, decision_note)
  where id = _app_id;
end;
$$;
grant execute on function public.decide_partner_application_split(uuid, boolean, boolean, text) to authenticated;

-- ============ 5 · list_my_partner_application ============
-- Applicant's view of their own application, so the private form can prefill.
create or replace function public.list_my_partner_application()
returns table (
  id                          uuid,
  partner_center_id           uuid,
  centre_name                 text,
  state                       public.my_state,
  status                      public.partner_application_status,
  requested_can_teach         boolean,
  requested_can_assess        boolean,
  proposed_public_blurb       text,
  proposed_address_line1      text,
  proposed_address_line2      text,
  proposed_city               text,
  proposed_postcode           text,
  proposed_google_maps_url    text,
  proposed_public_email       text,
  proposed_public_phone       text,
  proposed_hours_text         text,
  proposed_image_paths        text[],
  proposed_pool_length_m      numeric,
  proposed_pool_min_depth_m   numeric,
  proposed_pool_max_depth_m   numeric,
  proposed_pool_lane_count    integer,
  proposed_pool_certified     boolean,
  proposed_pool_certifier     text,
  proposed_has_lifeguard      boolean,
  proposed_has_eap            boolean,
  proposed_has_first_aid_aed  boolean,
  proposed_has_adequate_deck  boolean
)
language sql stable security definer set search_path to ''
as $$
  select a.id, a.partner_center_id, pc.name, pc.state, a.status,
         a.requested_can_teach, a.requested_can_assess,
         a.proposed_public_blurb,
         a.proposed_address_line1, a.proposed_address_line2, a.proposed_city, a.proposed_postcode,
         a.proposed_google_maps_url, a.proposed_public_email, a.proposed_public_phone,
         a.proposed_hours_text, a.proposed_image_paths,
         a.proposed_pool_length_m, a.proposed_pool_min_depth_m, a.proposed_pool_max_depth_m,
         a.proposed_pool_lane_count, a.proposed_pool_certified, a.proposed_pool_certifier,
         a.proposed_has_lifeguard, a.proposed_has_eap,
         a.proposed_has_first_aid_aed, a.proposed_has_adequate_deck
  from public.partner_applications a
  join public.partner_centers pc on pc.id = a.partner_center_id
  where a.submitted_by_profile_id = auth.uid()
  order by a.created_at desc
  limit 1;
$$;
grant execute on function public.list_my_partner_application() to authenticated;

-- ============ 6 · list_partner_applications_full ============
-- Reviewer view including all proposed_* fields (drop-in wider companion to
-- the existing list_partner_applications so the reviewer surface can show
-- the full picture without adding an extra round trip).
create or replace function public.list_partner_applications_full(_include_decided boolean default false)
returns table (
  id                          uuid,
  partner_center_id           uuid,
  centre_name                 text,
  state                       public.my_state,
  poc_name                    text,
  poc_email                   text,
  poc_phone                   text,
  submitted_by                text,
  status                      public.partner_application_status,
  decision_note               text,
  decided_at                  timestamp with time zone,
  created_at                  timestamp with time zone,
  requested_can_teach         boolean,
  requested_can_assess        boolean,
  can_teach_now               boolean,
  can_assess_now              boolean,
  proposed_public_blurb       text,
  proposed_address_line1      text,
  proposed_address_line2      text,
  proposed_city               text,
  proposed_postcode           text,
  proposed_google_maps_url    text,
  proposed_public_email       text,
  proposed_public_phone       text,
  proposed_hours_text         text,
  proposed_image_paths        text[],
  proposed_pool_length_m      numeric,
  proposed_pool_min_depth_m   numeric,
  proposed_pool_max_depth_m   numeric,
  proposed_pool_lane_count    integer,
  proposed_pool_certified     boolean,
  proposed_pool_certifier     text,
  proposed_has_lifeguard      boolean,
  proposed_has_eap            boolean,
  proposed_has_first_aid_aed  boolean,
  proposed_has_adequate_deck  boolean
)
language sql stable security definer set search_path to ''
as $$
  select a.id, a.partner_center_id, pc.name, pc.state,
         a.poc_name, a.poc_email, a.poc_phone,
         pr.full_name, a.status, a.decision_note, a.decided_at, a.created_at,
         a.requested_can_teach, a.requested_can_assess,
         pc.can_teach, pc.can_assess,
         a.proposed_public_blurb,
         a.proposed_address_line1, a.proposed_address_line2, a.proposed_city, a.proposed_postcode,
         a.proposed_google_maps_url, a.proposed_public_email, a.proposed_public_phone,
         a.proposed_hours_text, a.proposed_image_paths,
         a.proposed_pool_length_m, a.proposed_pool_min_depth_m, a.proposed_pool_max_depth_m,
         a.proposed_pool_lane_count, a.proposed_pool_certified, a.proposed_pool_certifier,
         a.proposed_has_lifeguard, a.proposed_has_eap,
         a.proposed_has_first_aid_aed, a.proposed_has_adequate_deck
  from public.partner_applications a
  join public.partner_centers pc on pc.id = a.partner_center_id
  left join public.profiles pr on pr.id = a.submitted_by_profile_id
  where (public.has_role('chairperson') or public.has_role('board_member') or public.has_role('system_admin'))
    and (_include_decided or a.status in ('submitted', 'pending'))
  order by case a.status when 'submitted' then 0 when 'pending' then 1 else 2 end, a.created_at desc;
$$;
grant execute on function public.list_partner_applications_full(boolean) to authenticated;
