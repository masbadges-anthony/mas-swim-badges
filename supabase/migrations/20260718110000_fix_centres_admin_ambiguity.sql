-- 20260718110000_fix_centres_admin_ambiguity.sql
--
-- Fix 42702: OUT parameter names in RETURNS TABLE shadow the source
-- column names of the same name. Alias the source table so every
-- unqualified column reference resolves.

create or replace function public.list_centres_admin()
returns table (
  id                    uuid,
  name                  text,
  state                 public.my_state,
  status                text,
  can_teach             boolean,
  can_assess            boolean,
  publish_to_public_site boolean,
  address               text,
  address_line1         text,
  address_line2         text,
  city                  text,
  postcode              text,
  google_maps_url       text,
  contact_email         text,
  contact_phone         text,
  public_contact_email  text,
  public_contact_phone  text,
  contact_public        boolean,
  operating_hours_text  text,
  public_blurb          text,
  image_paths           text[],
  pool_length_m         numeric,
  pool_min_depth_m      numeric,
  pool_max_depth_m      numeric,
  pool_lane_count       integer,
  pool_certified        boolean,
  pool_certifier        text,
  has_lifeguard_on_duty boolean,
  has_eap               boolean,
  has_first_aid_aed     boolean,
  has_adequate_deck     boolean,
  recognized_at         date,
  valid_until           date
)
language plpgsql stable security definer set search_path to ''
as $$
begin
  if not (public.has_role('system_admin')
       or public.has_role('finance_officer')
       or public.has_role('chairperson')
       or public.has_role('board_member')
       or public.has_role('chief_examiner')) then
    raise exception 'Not authorised.';
  end if;
  return query
    select
      c.id, c.name, c.state, c.status::text,
      c.can_teach, c.can_assess, c.publish_to_public_site,
      c.address, c.address_line1, c.address_line2, c.city, c.postcode, c.google_maps_url,
      c.contact_email, c.contact_phone,
      c.public_contact_email, c.public_contact_phone, c.contact_public,
      c.operating_hours_text, c.public_blurb, c.image_paths,
      c.pool_length_m, c.pool_min_depth_m, c.pool_max_depth_m, c.pool_lane_count,
      c.pool_certified, c.pool_certifier,
      c.has_lifeguard_on_duty, c.has_eap, c.has_first_aid_aed, c.has_adequate_deck,
      c.recognized_at, c.valid_until
    from public.partner_centers c
    order by c.state, c.name;
end;
$$;
