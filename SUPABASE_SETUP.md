# Supabase setup — Team Yuva

Everything the app needs to talk to Supabase lives in **one file: `.env.local`**
(gitignored). This guide shows exactly where to find each key, and what must exist
inside the Supabase project for every page to work.

> **TL;DR checklist**
> 1. Copy `.env.example` to `.env.local` (or edit the existing `.env.local`).
> 2. Fill in `NEXT_PUBLIC_SUPABASE_URL` + **one** client key (`..._PUBLISHABLE_KEY` or `..._ANON_KEY`).
> 3. Add `http://localhost:3000/auth/callback` under **Authentication → URL Configuration → Redirect URLs**.
> 4. Make sure the tables/bucket from [Step 4](#step-4--database-schema-fresh-project-only) exist (skip if you already use the v0-connected database).
> 5. Run [`setup_approval_system.sql`](./setup_approval_system.sql) (Supabase → **SQL Editor → New query → Run**) so account approvals, `user_profiles`, `is_reviewer()`, and reviewer visibility all exist. Safe to re-run.
> 6. Restart `pnpm dev` and sign in.

## Step 1 — The keys at a glance

| Variable | Required | What it is | Where to find it |
| --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Project URL, `https://<project-ref>.supabase.co` | Supabase → **Project Settings → Data API → Project URL** |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | one of these two | New-style public key, starts with `sb_publishable_` | Supabase → **Project Settings → API Keys** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | one of these two | Legacy public JWT, starts with `eyJ…` (fallback) | Supabase → **Project Settings → API → Project API keys → `anon` `public`** |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | optional | Confirmation-email return URL for local dev | Your own choice: `http://localhost:3000/auth/callback` |

Where the code reads them:

- `lib/supabase/client.ts` and `lib/supabase/server.ts` → URL + key. The
  **publishable key wins**; the anon key is the fallback, so setting either one is enough.
- `app/auth/sign-up/page.tsx` → redirect URL (falls back to `<origin>/auth/callback` when unset).

> The anon/publishable key is safe to expose in a browser — **row level security** is
> what protects your data (Step 4). **Never** put the `service_role` / secret key in a
> `NEXT_PUBLIC_*` variable.

## Step 2 — Which dashboard to copy from

**A. Existing Supabase project (most common).**
Open <https://supabase.com/dashboard>, pick the project that holds the Team Yuva
tables, then:

1. **Project Settings → Data API** → copy *Project URL* → `NEXT_PUBLIC_SUPABASE_URL`.
2. **Project Settings → API Keys** → copy the *Publishable key* (`sb_publishable_…`) → `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
3. Still in **API → Project API keys** (legacy tab), the *anon public* JWT is the fallback if your project is older → `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**B. Project created through the v0 + Supabase integration.**
The v0 project ([chat project link is in README.md](./README.md)) has a connected
Supabase database:

1. Open the v0 project → **Settings → Vars** (environment variables). Copy the values of
   `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (v0 sometimes names it
   `…PUBLISHABLE_KEY` — either works) into your local `.env.local`.
2. The same Supabase project can also be opened from the v0 **Integrations → Supabase**
   panel, where you can jump straight to the Supabase dashboard.

**C. Brand-new Supabase project.**
Create one at <https://supabase.com/dashboard>, take the keys from A, then run the
SQL in [Step 4](#step-4--database-schema-fresh-project-only) to create
everything the app expects.

## Step 3 — Supabase Auth settings

Supabase dashboard → **Authentication → URL Configuration**:

- **Site URL**: `http://localhost:3000`
- **Redirect URLs** (add both):
  - `http://localhost:3000/auth/callback`
  - your production domain later, e.g. `https://<your-app>.vercel.app/auth/callback`

Supabase dashboard → **Authentication → Sign In / Providers → Email**:

- Keep **Confirm email** enabled for the real flow (the sign-up page says *"Check your inbox"*).
- **Smooth testing (recommended while you iterate):** turn **OFF "Confirm email"** — new accounts
  get a session instantly and jump straight to `/progress` → the approval queue, with zero
  confirmation e-mails and zero `over_email_send_rate_limit` errors. Turn it back ON before launch
  (with custom SMTP below) if you want inbox verification in production.
- **Rate-limit safety net (already in the app):** `/auth/sign-up` saves the pending e-mail to
  `localStorage`, shows exactly what to do, and puts the resend button on a 60-second cooldown
  while Supabase reports `429` — so the flow never loses the user's details.
- For faster local testing you can disable it — new accounts then work immediately.

Creating accounts:

- **Clients**: let people use `/auth/sign-up` (email + password ≥ 8 chars), or add them in
  **Authentication → Users → Add user**.
- **Reviewers** (can open `/dashboard` and `/admin/content`): create the user, then open the
  user → **Edit** → *App metadata* and set `{"role": "reviewer"}`. This is what the
  `is_reviewer()` policy check in Step 4 looks for.
- **Custom SMTP (removes the free shared e-mail limit for production):** Authentication → SMTP
  Settings → enable custom SMTP with your own provider (e.g. Resend, Postmark, Gmail App Password).
  Once active, Supabase sends confirmation e-mails through *your* quota instead of the shared
  free-tier pool, so `over_email_send_rate_limit` stops appearing for real users.

## Step 4 — Database schema (fresh project only)

**Skip this step if your database already has the Team Yuva tables.** The app reads and
writes these objects:

| Object | Used by |
| --- | --- |
| `applications` | public application form on `/`, reviewer desk on `/dashboard` |
| `application_images` | photo records for an application |
| `storage` bucket `application-images` | photo uploads from the application form |
| `community_questions` | "Ask the team" section on `/` |
| `client_progress` | `/progress` weekly metrics |
| `site_content` | `/admin/content` content studio |

Paste this into Supabase → **SQL Editor → New query** and run it. It is re-runnable.

```sql
-- Team Yuva / BUM. — Supabase bootstrap (safe to re-run)

-- Reviewer check: users whose App metadata contains {"role": "reviewer"}
create or replace function public.is_reviewer()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'reviewer', false)
$$;

-- ── Tables ───────────────────────────────────────────────────────────────
create table if not exists public.applications (
  id             uuid primary key default gen_random_uuid(),
  email          text not null,
  full_name      text not null,
  age            integer,
  location       text,
  occupation     text,
  phone          text,
  height_cm      numeric,
  weight_kg      numeric,
  body_fat_pct   numeric,
  goals          text,
  concerns       text,
  consent        boolean default true,
  status         text not null default 'new',   -- new | reviewing | accepted | rejected
  reviewer_notes text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists public.application_images (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.applications(id) on delete cascade,
  storage_path   text not null,
  original_name  text,
  created_at     timestamptz not null default now()
);

create table if not exists public.community_questions (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  email      text not null,
  question   text not null,
  answer     text,
  created_at timestamptz not null default now()
);

create table if not exists public.client_progress (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  metric     text not null,
  value      numeric not null,
  target     numeric not null,
  note       text,
  week_start date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists public.site_content (
  id          uuid primary key default gen_random_uuid(),
  content_key text not null unique,
  title       text,
  body        text,
  updated_at  timestamptz not null default now()
);

-- ── Row level security ──────────────────────────────────────────────────
alter table public.applications        enable row level security;
alter table public.application_images  enable row level security;
alter table public.community_questions enable row level security;
alter table public.client_progress     enable row level security;
alter table public.site_content        enable row level security;
```

And then the access policies themselves:

```sql
-- applications: anyone may apply; only reviewers read/update
drop policy if exists "applications insert public" on public.applications;
create policy "applications insert public" on public.applications
  for insert to anon, authenticated with check (true);
drop policy if exists "applications read reviewers" on public.applications;
create policy "applications read reviewers" on public.applications
  for select to authenticated using (public.is_reviewer());
drop policy if exists "applications update reviewers" on public.applications;
create policy "applications update reviewers" on public.applications
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

-- application_images: inserted with the application; reviewers read
drop policy if exists "application_images insert public" on public.application_images;
create policy "application_images insert public" on public.application_images
  for insert to anon, authenticated with check (true);
drop policy if exists "application_images read reviewers" on public.application_images;
create policy "application_images read reviewers" on public.application_images
  for select to authenticated using (public.is_reviewer());

-- community_questions: anyone may ask; the public sees answered ones
drop policy if exists "community_questions insert public" on public.community_questions;
create policy "community_questions insert public" on public.community_questions
  for insert to anon, authenticated with check (true);
drop policy if exists "community_questions read answered" on public.community_questions;
create policy "community_questions read answered" on public.community_questions
  for select to anon, authenticated using (answer is not null);
drop policy if exists "community_questions update reviewers" on public.community_questions;
create policy "community_questions update reviewers" on public.community_questions
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

-- client_progress: clients read only their own rows; reviewers write
drop policy if exists "client_progress read own" on public.client_progress;
create policy "client_progress read own" on public.client_progress
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "client_progress insert reviewers" on public.client_progress;
create policy "client_progress insert reviewers" on public.client_progress
  for insert to authenticated with check (public.is_reviewer());
drop policy if exists "client_progress update reviewers" on public.client_progress;
create policy "client_progress update reviewers" on public.client_progress
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());

-- site_content: public read; reviewers edit
drop policy if exists "site_content read all" on public.site_content;
create policy "site_content read all" on public.site_content
  for select to anon, authenticated using (true);
drop policy if exists "site_content update reviewers" on public.site_content;
create policy "site_content update reviewers" on public.site_content
  for update to authenticated using (public.is_reviewer()) with check (public.is_reviewer());
```

Then the storage bucket for application photos (and optional seed copy for the content studio):

```sql
-- ── Storage bucket for application photos ───────────────────────────────
insert into storage.buckets (id, name, public)
values ('application-images', 'application-images', false)
on conflict (id) do nothing;

drop policy if exists "application-images upload public" on storage.objects;
create policy "application-images upload public" on storage.objects
  for insert to anon, authenticated with check (bucket_id = 'application-images');
drop policy if exists "application-images read reviewers" on storage.objects;
create policy "application-images read reviewers" on storage.objects
  for select to authenticated using (bucket_id = 'application-images' and public.is_reviewer());

-- ── Optional: seed editable copy for /admin/content ─────────────────────
insert into public.site_content (content_key, title, body) values
  ('hero', 'Your body. Your edge.', 'Personal coaching for building a body and mindset that can keep up with the life you want.'),
  ('application', 'Make the decision real.', 'Applications take 5 minutes. The next version of your life deserves that much attention.')
on conflict (content_key) do nothing;
```
### Step 4b — Account approvals (adds `user_profiles`, `is_reviewer()`, reviewer visibility)

Run [`setup_approval_system.sql`](./setup_approval_system.sql) in Supabase → **SQL Editor → New query → Run** (safe to re-run). It creates:

- `public.is_reviewer()` — one shared reviewer check (reads `app_metadata.role = 'reviewer'` from the JWT).
- `public.user_profiles(id, email, full_name, status, is_reviewer, created_at, approved_at, approved_by)` with RLS (users read their own row, reviewers read/update all).
- `on_auth_user_created` trigger — every new sign-up lands as `status='pending'` automatically.
- Backfill — existing auth users become `status='approved'`, with `is_reviewer` set from their app metadata.
- Reviewer visibility on `client_progress` — admins can read every client's rows and log metrics for any user (needed by `/admin/users/[id]`).

> The policies in Step 4 reference `is_reviewer()` — this file is what creates it, so apply it before testing approvals.


## Step 5 — Run and verify

```powershell
pnpm dev
```

Open <http://localhost:3000> and exercise each flow:

1. **`/` → "Ask the team"** — submit a question; a row appears in `community_questions`.
2. **`/` → application form** — submit it; a row appears in `applications` and any photo lands in the `application-images` bucket.
3. **`/auth/sign-up`** — create an account, click the confirmation link; it returns through `/auth/callback` and lands on `/progress`.
4. **`/progress`** — sign in; you see your metrics (demo values are shown on purpose when the user has none).
5. **`/dashboard`** — sign in as a reviewer; applications list loads and status/notes can be updated.
6. **`/admin/content`** — sign in as a reviewer; edit a section and press **Save changes**.

## Cleaning up the database-check rows

The health check exercises every public write path with clearly named rows. Remove them with
this SQL (Supabase → **SQL Editor → New query**), then delete the matching objects from
**Storage → application-images**:

```sql
delete from public.application_images where original_name in ('db-check.png', 'sdk-check.png');
delete from public.applications
  where email = 'db-check@example.com'
     or full_name ilike 'Database Check %' or full_name ilike 'SDK check %' or full_name = 'Probe C';
delete from public.community_questions
  where email = 'db-check@example.com'
     or name ilike 'Database Check %' or name ilike 'Burst probe %' or name ilike 'SDK check %';
```

If the auth check created an account (`db-check+…@mailinator.com`), delete it under
**Authentication → Users**.

> The last statement also removes the four sample Q&As seeded by the check
> (Aarav, Diya, Kabir, Ishita). Delete that statement from the script if you want to keep them.

## Step 6 — Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `Failed to fetch` / `Invalid API key` in the browser console | `.env.local` still has placeholder values; replace them and restart `pnpm dev`. |
| The app crashes at load with `supabaseKey is required` | neither `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` nor `NEXT_PUBLIC_SUPABASE_ANON_KEY` is set. |
| Reviewer desk: *"This account is not authorized as a reviewer."* | The signed-in user lacks `{"role": "reviewer"}` in App metadata, or the `applications` SELECT policy is missing (Step 4). |
| Confirmation e-mail link returns to the wrong place | Add the exact URL to **Authentication → URL Configuration → Redirect URLs**. |
| Photos never appear for reviewers | The `application-images` bucket or its storage policies are missing. (The form intentionally ignores upload failures.) |
| Sign-up succeeds but sign-in fails | **Confirm email** is enabled — the user must click the e-mail link first, or disable it for local testing. |
| Homepage says *"The team is preparing the first answers."* | No `community_questions` row has an `answer` yet — that is the expected empty state. |

## Production (Vercel) checklist

- Add the same variables in **Vercel → Project → Settings → Environment Variables**.
- **Do not** set `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` in production (it would force the
  localhost callback); the app automatically falls back to the deployed origin.
- Add the production callback URL, e.g. `https://<your-app>.vercel.app/auth/callback`,
  to Supabase → Authentication → URL Configuration → Redirect URLs.
- Never commit `.env.local` (already covered by `.gitignore` → `.env*.local`).

