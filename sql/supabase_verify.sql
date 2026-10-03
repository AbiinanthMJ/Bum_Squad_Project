-- ── Supabase verification + hardening (SAFE: additive only, no deletes) ────
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- What this does:
--  1. Creates missing helper `is_reviewer()` (needed by RLS policies).
--  2. Creates `user_profiles` + the sign-up trigger if the approval migration
--     was skipped.
--  3. Backfills profiles for auth users that pre-date the trigger.
--  4. Adds the reviewer SELECT/INSERT policies on `client_progress` that
--     /admin/users/[id] needs (missing policy = "Could not load" errors).
--  5. Creates the `application-images` storage bucket (/dashboard photo reads).
--  6. Seeds the content-studio rows the homepage expects.
--  7. Adds the reviewer SELECT policies on `applications` and
--     `application_images` that /dashboard needs — without them the reviewer
--     desk shows "00 total" with no error, because RLS returns an empty list.
--  8. Aligns the legacy `applications` body-fat check constraint with the app
--     (NULL or 1-100), so inserts cannot fail with a raw
--     "applications_body_fat_pct_check" violation.
--  9. Prints a verification report (tables, policies, bucket, counts).
-- Nothing is dropped, truncated, or deleted.
begin;

-- 1. Reviewer helper ---------------------------------------------------------
create or replace function public.is_reviewer()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'reviewer', false);
$$;

grant execute on function public.is_reviewer() to authenticated, anon;

-- 2. Profile / approval table ------------------------------------------------
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  status      text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  is_reviewer boolean not null default false,
  created_at  timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid
);

alter table public.user_profiles enable row level security;

drop policy if exists "user_profiles read own" on public.user_profiles;
create policy "user_profiles read own" on public.user_profiles
  for select to authenticated using (auth.uid() = id);

drop policy if exists "user_profiles read reviewers" on public.user_profiles;
create policy "user_profiles read reviewers" on public.user_profiles
  for select to authenticated using (public.is_reviewer());

drop policy if exists "user_profiles insert reviewers" on public.user_profiles;
create policy "user_profiles insert reviewers" on public.user_profiles
  for insert to authenticated with check (public.is_reviewer());

drop policy if exists "user_profiles update reviewers" on public.user_profiles;
create policy "user_profiles update reviewers" on public.user_profiles
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

-- 3. Auto-create a pending profile for every new auth user -------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_profiles (id, email, full_name, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    'pending'
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 4. Backfill: auth users created before the trigger get an approved row -----
--    Idempotent: only inserts rows that do not exist yet, and NEVER flips a
--    'pending' row to approved, so re-running keeps the approval flow.
insert into public.user_profiles (id, email, full_name, status, is_reviewer, approved_at)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'full_name', split_part(u.email, '@', 1)),
  'approved',
  coalesce(u.raw_app_meta_data ->> 'role' = 'reviewer', false),
  now()
from auth.users u
where not exists (select 1 from public.user_profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 5. Reviewer access to every client's progress rows -------------------------
--    (needed by /admin/users/[id] dashboards + coach data entry)
drop policy if exists "client_progress read reviewers" on public.client_progress;
create policy "client_progress read reviewers" on public.client_progress
  for select to authenticated using (public.is_reviewer());

drop policy if exists "client_progress insert reviewers" on public.client_progress;
create policy "client_progress insert reviewers" on public.client_progress
  for insert to authenticated with check (public.is_reviewer());

create index if not exists user_profiles_status_idx on public.user_profiles (status, created_at desc);

-- 6. Storage bucket for application photos -----------------------------------
--    The bucket is where the public application form uploads photos and where
--    the reviewer desk (/dashboard) reads signed URLs from. When it is missing,
--    uploads fail with 400 NoSuchBucket while the rest of the site still works.
--    Idempotent: creates/refreshes policies only, never deletes stored objects.
insert into storage.buckets (id, name, public)
values ('application-images', 'application-images', false)
on conflict (id) do nothing;

drop policy if exists "application-images upload public" on storage.objects;
create policy "application-images upload public" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'application-images');

drop policy if exists "application-images read reviewers" on storage.objects;
create policy "application-images read reviewers" on storage.objects
  for select to authenticated using (bucket_id = 'application-images' and public.is_reviewer());

-- 7. Content-studio seed rows (only when absent, existing edits are kept) -----
insert into public.site_content (content_key, title, body) values
  ('hero', 'Your body. Your edge.', 'Personal coaching for building a body and mindset that can keep up with the life you want.'),
  ('application', 'Make the decision real.', 'Applications take 5 minutes. The next version of your life deserves that much attention.')
on conflict (content_key) do nothing;

-- 8. Reviewer visibility for applications + photo rows -----------------------
--    The reviewer desk (/dashboard) reads `applications` and `application_images`
--    with the reviewer's own token, so BOTH tables need a SELECT policy that
--    calls is_reviewer(). When the policy is absent PostgREST still answers
--    HTTP 200 with an empty list and no error, so the desk renders "00 total"
--    while the rows sit in the Table Editor. The public application form keeps
--    writing through the open INSERT policies; only reviewers read or update.
alter table public.applications       enable row level security;
alter table public.application_images enable row level security;

drop policy if exists "applications insert public" on public.applications;
create policy "applications insert public" on public.applications
  for insert to anon, authenticated with check (true);

drop policy if exists "applications read reviewers" on public.applications;
create policy "applications read reviewers" on public.applications
  for select to authenticated using (public.is_reviewer());

drop policy if exists "applications update reviewers" on public.applications;
create policy "applications update reviewers" on public.applications
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

-- 8. Body-fat constraint alignment (v0 drift) ---------------------------------
-- The v0-created database can carry a body-fat rule the form can violate
-- (raw "applications_body_fat_pct_check" errors on submit). The app stores
-- blank as NULL and validates 1-100, so make the database agree. `not valid`
-- keeps the check enforced for every new insert without scanning old rows.
alter table public.applications drop constraint if exists applications_body_fat_pct_check;
alter table public.applications add constraint applications_body_fat_pct_check
  check (body_fat_pct is null or (body_fat_pct >= 1 and body_fat_pct <= 100)) not valid;

drop policy if exists "application_images insert public" on public.application_images;
create policy "application_images insert public" on public.application_images
  for insert to anon, authenticated with check (true);

drop policy if exists "application_images read reviewers" on public.application_images;
create policy "application_images read reviewers" on public.application_images
  for select to authenticated using (public.is_reviewer());

commit;

-- 9. Verification report (read-only selects) ---------------------------------
select 'table' as check, tablename as name, 'exists' as status
from pg_tables where schemaname = 'public'
  and tablename in ('applications','application_images','community_questions','client_progress','site_content','user_profiles')
order by tablename;

select 'policy' as check, tablename || ' / ' || policyname as name, 'exists' as status
from pg_policies where schemaname = 'public'
order by tablename, policyname;

select 'bucket' as check, id as name, case when public then 'public' else 'private' end as status
from storage.buckets where id = 'application-images';

select 'count' as check, 'auth.users' as name, count(*)::text as status from auth.users
union all
select 'count', 'user_profiles', count(*)::text from public.user_profiles
union all
select 'count', 'user_profiles pending', count(*)::text from public.user_profiles where status = 'pending'
union all
select 'count', 'applications', count(*)::text from public.applications
union all
select 'count', 'client_progress', count(*)::text from public.client_progress
union all
select 'count', 'community_questions', count(*)::text from public.community_questions;

-- Which reviewer gate is open? /dashboard needs BOTH a reviewer role on the
-- account AND the SELECT policies in section 8. This prints both facts.
select 'policy' as check,
       p.tablename || ' / ' || p.policyname as name,
       'roles: ' || array_to_string(p.roles::text[], ', ') as status
from pg_policies p
where p.schemaname = 'public' and p.tablename in ('applications', 'application_images')
order by p.tablename, p.policyname;

select 'reviewer' as check,
       coalesce(u.email, '(no email)') as name,
       case when u.raw_app_meta_data ->> 'role' = 'reviewer'
            then 'reviewer role: granted' else 'reviewer role: MISSING (promote this account)' end as status
from auth.users u
order by u.created_at;

-- 10. Storage policies + stored objects ----------------------------------------
select 'storage policy' as check, policyname as name, 'exists' as status
from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like 'application-images%'
order by policyname;

select 'storage objects' as check, count(*)::text as name, 'photos stored' as status
from storage.objects where bucket_id = 'application-images';
