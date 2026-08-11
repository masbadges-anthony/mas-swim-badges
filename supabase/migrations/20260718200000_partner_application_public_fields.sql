-- 20260718200000_partner_application_public_fields.sql
--
-- Extend partner_applications to capture the fields the public directory
-- needs — captured at intake, so FO doesn't re-enter them later. Applicants
-- supply their proposed public details on the application form; when the
-- application is approved and the partner_center row is created, these
-- values seed the corresponding public-directory columns.
--
-- Fields mirror the partner_centers additions from 20260718100000; they
-- are provisional at application stage, subject to FO review and edit
-- once the centre is recognized.

alter table public.partner_applications
  -- Requested classification (what the centre wants to be recognised for).
  -- The FO/committee decides what to actually grant at approval time.
  add column if not exists requested_can_teach   boolean not null default true,
  add column if not exists requested_can_assess  boolean not null default false,

  -- Proposed public directory content, filled by the applicant.
  add column if not exists proposed_public_blurb text
    check (proposed_public_blurb is null or char_length(proposed_public_blurb) <= 500),
  add column if not exists proposed_address_line1 text,
  add column if not exists proposed_address_line2 text,
  add column if not exists proposed_city          text,
  add column if not exists proposed_postcode      text,
  add column if not exists proposed_google_maps_url text,
  add column if not exists proposed_public_email  text,
  add column if not exists proposed_public_phone  text,
  add column if not exists proposed_hours_text    text,
  add column if not exists proposed_image_paths   text[] not null default '{}',

  -- Fit-for-assessment declaration (only relevant if requested_can_assess).
  add column if not exists proposed_pool_length_m    numeric(5,2),
  add column if not exists proposed_pool_min_depth_m numeric(5,2),
  add column if not exists proposed_pool_max_depth_m numeric(5,2),
  add column if not exists proposed_pool_lane_count  integer,
  add column if not exists proposed_pool_certified   boolean not null default false,
  add column if not exists proposed_pool_certifier   text,
  add column if not exists proposed_has_lifeguard    boolean not null default false,
  add column if not exists proposed_has_eap          boolean not null default false,
  add column if not exists proposed_has_first_aid_aed boolean not null default false,
  add column if not exists proposed_has_adequate_deck boolean not null default false;

alter table public.partner_applications
  drop constraint if exists partner_apps_proposed_images_len_chk;
alter table public.partner_applications
  add constraint partner_apps_proposed_images_len_chk
  check (array_length(proposed_image_paths, 1) is null
      or array_length(proposed_image_paths, 1) <= 5);
