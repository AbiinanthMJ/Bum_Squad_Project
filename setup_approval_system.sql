-- ── Account approval system (safe to re-run) ────────────────────────────────
-- Run in Supabase Dashboard -> SQL Editor -> New query -> Run.
--
-- Flow:  user signs up -> trigger creates a user_profiles row with status
--        'pending' -> admin approves at /admin/users -> user can sign in.
-- Requires the is_reviewer() function from SUPABASE_SETUP.md Step 4.

begin;

-- 0. Reviewer helper (Step 4 of SUPABASE_SETUP.md assumed this existed) --------
--    Reads the 'reviewer' role from the JWT app_metadata. SECURITY DEFINER so
--    RLS policies can call it. Created here so this file is self-contained.
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

-- 1. Profile / approval table -----------------------------------------------
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

-- 2. Every new auth user gets a pending profile automatically ---------------
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

-- 3. Existing users: show up as approved (they pre-date the approval flow) ----
--    Idempotent: only inserts rows that do not exist yet, and NEVER flips a
--    'pending' row to approved, so re-running the file keeps the approval flow.
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

-- 4. Reviewers can read every client's progress rows (for admin dashboards) --
drop policy if exists "client_progress read reviewers" on public.client_progress;
create policy "client_progress read reviewers" on public.client_progress
  for select to authenticated using (public.is_reviewer());

-- 5. Reviewers can insert/edit metrics for any client (coach data entry) -----
drop policy if exists "client_progress insert reviewers" on public.client_progress;
create policy "client_progress insert reviewers" on public.client_progress
  for insert to authenticated with check (public.is_reviewer());

-- 6. Index for the admin list -----------------------------------------------
create index if not exists user_profiles_status_idx on public.user_profiles (status, created_at desc);

commit;

-- ── Optional: approve the first reviewer from SQL (set your e-mail) ──────────
-- update public.user_profiles set is_reviewer = true, status = 'approved'
--   where email = 'you@example.com';
