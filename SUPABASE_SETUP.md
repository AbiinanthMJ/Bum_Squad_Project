# Supabase setup — Team Yuva

Everything the app needs to talk to Supabase lives in **one file: `.env.local`**
(gitignored). This guide shows exactly where to find each key, and what must exist
inside the Supabase project for every page to work.

> **TL;DR checklist**
> 1. Copy `.env.example` to `.env.local` (or edit the existing `.env.local`).
> 2. Fill in `NEXT_PUBLIC_SUPABASE_URL` + **one** client key (`..._PUBLISHABLE_KEY` or `..._ANON_KEY`).
> 3. **Recommended:** in Supabase → **Authentication → Sign In / Providers → Email**, turn **Confirm email OFF** (Step 3c). Sign-up then returns a session instantly, no confirmation e-mail is sent, and the 2-per-hour mail cap can never rate-limit a visitor.
> 4. Add `http://localhost:3000/auth/callback` under **Authentication → URL Configuration → Redirect URLs**.
> 5. Make sure the tables/bucket from [Step 4](#step-4--database-schema-fresh-project-only) exist (skip if you already use the v0-connected database).
> 6. Run [`sql/supabase_verify.sql`](./sql/supabase_verify.sql) (Supabase → **SQL Editor → New query → Run**). It is a superset of [`sql/setup_approval_system.sql`](./sql/setup_approval_system.sql): account approvals, `user_profiles`, `is_reviewer()`, reviewer visibility **and the `application-images` storage bucket** — then it prints a verification report. Safe to re-run, nothing is ever deleted.
> 7. Run `pnpm db:check` to confirm tables, bucket and public-write policies from your machine.
> 8. Restart `pnpm dev` and sign in.

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

- **Site URL**: your production URL (`https://bum-squad-project-dwcj.vercel.app`). It is only the fallback
  when the app passes no redirect — `lib/auth-redirect.ts` always passes one — so leaving it on
  `localhost` makes any un-redirected link (dashboard invites) land on your machine.
- **Redirect URLs** (add all four: the `/auth/callback` entry is what the app handles, `/**`
  covers the rest of the site, including Vercel preview URLs if you add a wildcard):
  - `http://localhost:3000/auth/callback`
  - `http://localhost:3000/**`
  - `https://bum-squad-project-dwcj.vercel.app/auth/callback`
  - `https://bum-squad-project-dwcj.vercel.app/**`

Supabase dashboard → **Authentication → Sign In / Providers → Email**:

- **Turn "Confirm email" OFF — this is the recommended setting for this app.** Sign-up then
  returns a session straight away, `/auth/sign-up` sends the new account to `/progress`, and the
  reviewer approval queue is the only gate. **No confirmation e-mail is sent at all**, so the
  built-in mailer's `over_email_send_rate_limit` (HTTP 429, ~2 messages/hour) can never block a
  visitor. See Step 3c.
- Turn it back **ON** only if you specifically want inbox verification, which requires custom
  SMTP (Step 3b) and a raised rate limit — otherwise you reintroduce the mail cap.
- **No rate-limit scaffolding:** `/auth/sign-up` stores nothing in the browser and runs no resend
  cooldown. If Supabase does answer `429`, the real error text is shown and the resend button is
  immediately usable again.
- For faster local testing you can disable it — new accounts then work immediately.

Creating accounts:

- **Clients**: let people use `/auth/sign-up` (email + password ≥ 8 chars), or add them in
  **Authentication → Users → Add user**, or from `/admin/users` (Step 3d).
- **Reviewers** (can open `/dashboard` and `/admin/content`): create the user, then open the
  user → **Edit** → *App metadata* and set `{"role": "reviewer"}`. This is what the
  `is_reviewer()` policy check in Step 4 looks for.
- **Custom SMTP (removes the free shared e-mail limit for production):** Authentication → SMTP
  Settings → enable custom SMTP with your own provider (e.g. Resend, Postmark, Gmail App Password).
  Once active, Supabase sends confirmation e-mails through *your* quota instead of the shared
  free-tier pool, so `over_email_send_rate_limit` stops appearing for real users.

### Step 3b — The "Confirm sign up" e-mail (why it silently does nothing)

The **Confirm sign up** page (Authentication → Emails → Confirm sign up) is only the message
body. Two things *outside* that page decide whether confirmation works at all:

1. **The built-in SMTP server only delivers to your own team.** Until custom SMTP is
   configured, Supabase refuses every other recipient with `Email address not authorized`, and
   the whole project is capped at **2 messages per hour**, best-effort, no SLA. So confirmation
   appears to work for the project owner's own address and silently fails for clients and
   friends. Either add each test address under **Organization → Team**, or move to custom SMTP.
2. **The template editor is read-only until custom SMTP exists.** The banner *"Set up custom
   SMTP to edit templates"* is literal — subject and body come from the default template and
   your edits are not saved.

Custom SMTP lives at **Authentication → Settings → SMTP Settings** and needs six values from
your provider (Resend, Brevo, SendGrid, Postmark, AWS SES, ZeptoMail, Gmail app password…):
host, port, username, password, sender e-mail address, sender name.

**Template body — use one of these two links.** `app/auth/callback/route.ts` handles both:

```html
<!-- A. default: goes to Supabase first, then back to /auth/callback?code=… -->
<a href="{{ .ConfirmationURL }}">Confirm email address</a>

<!-- B. no PKCE cookie needed, so it also works from another browser or a phone -->
<a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=signup">Confirm email address</a>
```

- Link **A** is the default and fine while you test in the same browser.
- Link **B** is the one to ship. `{{ .RedirectTo }}` is already `…/auth/callback` because
  `lib/auth-redirect.ts` passes `emailRedirectTo` on every sign-up, so the query string is
  appended directly. If you invite users from the dashboard instead, use
  `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=signup`.

Link A stores a PKCE verifier in the browser that started the sign-up, so opening the mail on
a different device (or after clearing storage) fails with
`PKCE code verifier not found in storage` — link B avoids that entirely.

**Add the 6-digit code too, so nobody depends on a link at all.** `/auth/sign-up` shows a code
box that calls `verifyOtp({ email, token, type: 'signup' })` (falling back to `type: 'email'`)
and then applies the approval gate before letting the visitor into `/progress`:

```html
<p>Or enter this code: <strong style="font-size:22px;letter-spacing:3px">{{ .Token }}</strong></p>
```

The built-in default template carries only the link, so add this line as soon as the template
becomes editable (i.e. once custom SMTP is on).

#### Do NOT switch on Authentication → Auth Hooks → Send Email

That hook **replaces** Supabase's e-mail templates: while it is enabled every auth e-mail
(confirmation, magic link, password reset) is POSTed to your URL and your templates are
ignored — the dashboard says so in its own banner. Point it at a placeholder such as
`https://www.example.com` and every auth e-mail silently stops. It also needs a publicly
reachable HTTPS endpoint, so `localhost` can never receive it and this app has no route for it,
which means a broken endpoint takes the whole sign-up flow down. It exists for teams that want
their own templating engine, queuing or multi-provider fallback. Use custom SMTP instead.

#### Provider values for the SMTP form

| Field | Brevo (no domain required) | Resend (verified domain required) |
| --- | --- | --- |
| Host | `smtp-relay.brevo.com` | `smtp.resend.com` |
| Port | `587` (no encryption) or `465` + SSL/TLS | `465` (SSL/TLS) or `587` (STARTTLS) |
| Username | the SMTP login shown on Brevo's **SMTP** page (your account e-mail, or `NNN@smtp-brevo.com`) | `resend` |
| Password | an **SMTP key** (not the API key) | your API key (`re_…`) |
| Sender | an address you verified under **Senders** | `onboarding@resend.dev` for testing only |

Brevo's free tier allows **300 transactional e-mails per day** and only needs a *sender address*
verified, so it is the quickest option before you own a domain. Resend refuses recipients other
than your own account address until a domain is verified.

> **Brevo gotcha — start here.** A new Brevo account is **manually approved by Brevo before it
> can send anything** ("once we approve your account for sending…"). Until that lands, every
> message fails silently. Create the account first and wait for the approval e-mail before
> debugging anything else. The **sender address** is a separate, later step: Brevo sends a
> verification link to that address, and you cannot send until it is clicked.

#### Turn it on and prove it works

1. Paste the six values, **Save**, then send a first message from the same page. To check it
   from the terminal instead:

   ```bash
   pnpm email:check you@example.com     # mailbox must already have an account
   ```

   - `200` → Supabase accepted the message: check the inbox, then the spam folder.
   - `429` or *Email address not authorized* → you are still on the built-in mailer.
   - `534` / *SMTP refused* → the host, username, password or sender address is wrong.
     (`--dry` validates the environment without sending anything.)

2. **Raise the e-mail ceiling.** The built-in provider is hard-capped at **2 e-mails per hour**,
   and that limit only becomes configurable once custom SMTP (or the Send Email hook) is active:
   **Authentication → Rate Limits → "Rate limit for sending emails"** — `rate_limit_email_sent`
   in the Management API. Without this step you keep the 2-per-hour ceiling even after your
   provider is connected, and `pnpm email:check` will keep reporting `429`.

3. Re-enable **Confirm email** (Step 3 "Sign In / Providers → Email") only after 1 and 2 pass,
   then paste the template from the section above so the link **and** the 6-digit code work.

#### Custom SMTP is also worth wiring up on its own, with Confirm email OFF

Steps 1–2 are useful **even if you never turn Confirm email back on**. The repo's recommended
mode (Step 3c) sends no sign-up e-mail at all, but **password reset still needs SMTP** — and
there is no reset screen in this app:

- `app/progress/page.tsx` offers sign-in/sign-out only, and there is no `/auth/reset-password`
  route (routes are `auth/callback`, `auth/sign-up`, `progress`, `dashboard`, `admin/*`,
  `diagnostics`). Nothing in the codebase calls `resetPasswordForEmail` or `updateUser`.

So once custom SMTP is live a client *can* recover a forgotten password, but the link lands on
**Supabase's own hosted "Set new password" page**, not on your domain, because no route of ours
catches it. That is fine and secure — just not branded. A branded flow means adding an
`/auth/reset-password` route plus a "Forgot password?" link that calls
`supabaseEmailRedirect()` (already in `lib/auth-redirect.ts`); that is a feature, not a setup step.

**Add the recovery redirect URL.** Authentication → URL Configuration → Redirect URLs should
list `http://localhost:3000/auth/callback` *and* `https://bum-squad-project-dwcj.vercel.app/auth/callback`,
or the reset link has nowhere valid to return to.

Keep Confirm email **OFF** even with Brevo connected: sign-up keeps returning a session
instantly, so no visitor ever waits on a mail server or trips the rate limit, while recovery is
available. Turning it back on reintroduces an e-mail dependency at sign-up for no benefit here.

### Step 3c — Approval-only mode (no confirmation e-mails) — the recommended setup

**This is how this app should run.** It needs no SMTP provider, no service-role key and no
template work: turn **Confirm email** OFF and let the reviewer approval queue be the only gate.
No e-mail is sent during sign-up, so the 2-per-hour mail cap never applies.

1. **Authentication → Sign In / Providers → Email → Confirm email OFF → Save.** Sign-up then
   returns a session straight away and `/auth/sign-up` sends the new account to `/progress`.
2. **Run `sql/supabase_verify.sql`** so `user_profiles`, the `handle_new_user()` trigger and the
   reviewer policies exist. Without the trigger no profile row is created and the gate has
   nothing to check.
3. **Promote your own account to reviewer** (App metadata `{"role": "reviewer"}`, or the SQL the
   app prints on its access-denied screen), then sign in at `/admin/users`.
4. **Test with a second account:** sign it up, watch `/progress` sign it back out with
   *"Your account is awaiting admin approval"*, approve it in `/admin/users`, then sign in again.

What this mode does and does not do:

- A pending/rejected/suspended account is signed out **in the browser** (`lib/approval.ts`). It
  still holds a valid Supabase session, so anything that must be blocked for real also needs an
  RLS rule, not just this gate.
- `getApprovalStatus()` treats a missing `user_profiles` row as `unmanaged` and **fails open** on
  purpose, so a half-migrated project never locks everybody out. Keep the trigger applied.
- Anyone can create an account without proving the address is theirs, so **approve only addresses
  you recognise** — the approval queue is the real gate, not e-mail verification. To require
  inbox proof instead, turn Confirm email back ON and finish Step 3b (custom SMTP + raise the
  e-mail rate limit), accepting the mail cap that comes with it.
- Password **resets need e-mail**, so a client cannot recover a forgotten password without
  Step 3b. Until then, reset it for them from **Authentication → Users**.

### Step 3d — Create client accounts from `/admin/users` (no e-mail at all)

`/admin/users` ships a **Create client account** form: type the name and e-mail, and the app
does the rest. It calls `app/api/admin/create-user`, which uses the service-role key to create
the user **already confirmed**, approves their `user_profiles` row and returns a one-time
password for you to hand over.

1. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Supabase → **Project Settings → API →
   service_role / secret key**) and to Vercel → Settings → Environment Variables, then restart
   `pnpm dev`. It is **server-only** — never give it a `NEXT_PUBLIC_` prefix. Until it is set,
   the route returns that instruction instead of failing silently.
2. Sign in as a reviewer at `/admin/users` and use the form. No confirmation e-mail is sent,
   so the 2-per-hour mail cap never applies and the client never waits.
3. Optional, for an invite-only site: turn **Sign In / Providers → "Allow new users to sign
   up" OFF**. Public sign-up then stops creating accounts and this coach-created route is the
   only way in. Leave it on if the public application form should stay a funnel.

Password **resets still need e-mail**, so keep the one-time password somewhere safe: without
custom SMTP (Step 3b) a client cannot reset a lost password by themselves.

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
  body_fat_pct   numeric check (body_fat_pct is null or (body_fat_pct >= 1 and body_fat_pct <= 100)),
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
```

> **Already on an existing database?** Skipping this block is the usual reason
> `/dashboard` shows *"00 total"* while rows are visible in the Table Editor —
> a missing `SELECT` policy makes PostgREST return an empty list with **no**
> error. [`sql/supabase_verify.sql`](./sql/supabase_verify.sql) section 8 re-applies
> exactly the `applications` + `application_images` policies above, so you can
> repair an existing project without re-running the whole schema.

```sql

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

Run [`sql/setup_approval_system.sql`](./sql/setup_approval_system.sql) in Supabase → **SQL Editor → New query → Run** (safe to re-run). It creates:

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
| Photos never appear for reviewers | The `application-images` bucket or its storage policies are missing — run `sql/supabase_verify.sql` (section 6 creates the bucket). The application form now lists any photo that failed to upload instead of ignoring it. |
| The public forms show a red message with a Supabase error in brackets | That is the real error text surfaced on purpose (missing table/column, blocked RLS, offline). Run `pnpm db:check` to see which check fails. |
| Confirmation e-mail never arrives for a client or test address | **Confirm email** is ON. The built-in SMTP server only sends to **Organization → Team** members (2/hour) and fails with `Email address not authorized` for everyone else. Turn **Confirm email OFF** (Step 3c), or configure custom SMTP (Step 3b). |
| Template edits on *Confirm sign up* will not save | The template editor stays read-only until custom SMTP is configured — that is the dashboard banner, not a bug. |
| `PKCE code verifier not found in storage` after clicking the link | The link was opened in a different browser or device than the sign-up. Switch the template to the `token_hash` link from Step 3b, or open the link in the same browser. |
| Sign-up succeeds but sign-in fails | **Confirm email** is enabled — turn it OFF (Step 3c) so sign-up returns a session immediately, or click the confirmation link first. |
| Sign-up shows *"The confirmation e-mail service is rate limited"* | **Confirm email** is still ON, so sign-up asks Supabase to mail a confirmation and hits the 2-per-hour cap. Turn **Confirm email OFF** (Step 3c) — no e-mail, no cap. |
| Sign-up says *"Check your inbox"* but no e-mail arrives | **Confirm email** is ON. Turn it OFF (Step 3c), or configure custom SMTP (Step 3b). |
| A new account signs in but is signed straight back out | Expected with Confirm email OFF: the account is **pending** until a reviewer approves it at `/admin/users`. |
| Homepage says *"The team is preparing the first answers."* | No `community_questions` row has an `answer` yet — that is the expected empty state. |

## Production (Vercel) checklist

- Add the same variables in **Vercel → Project → Settings → Environment Variables**.
  From the screenshot on 2026-09-28 the project has `NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  scoped to **Production only** — extend each of them to **Preview + Development**
  too, or preview deployments will boot with missing Supabase env vars.
- **Confirm email OFF** in Supabase is the production setting for this app (Step 3c): no
  confirmation e-mail means the 2-per-hour mail cap can never rate-limit a real client. It is a
  dashboard setting, so nothing needs to be added to Vercel for it.
- **Do not** set `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` in production (it would force the
  localhost callback); the app automatically falls back to the deployed origin
  (`lib/auth-redirect.ts` additionally ignores that override on non-local hosts).
- Add the production callback URL `https://bum-squad-project-dwcj.vercel.app/auth/callback`,
  to Supabase → Authentication → URL Configuration → Redirect URLs.
- After this audit the app ships a `proxy.ts` (`lib/supabase/middleware.ts`)
  that refreshes auth cookies on every request — required for the PKCE
  email-confirmation flow (`PKCE code verifier not found in storage` in dev.log).
  (Next.js 16 renamed `middleware.ts` → `proxy.ts`; the old filename now only
  emits a deprecation warning.) Redeploy after merging so the proxy goes live.
- If `/admin/users` shows "Approval tables missing", run `sql/supabase_verify.sql`
  (Supabase → **SQL Editor → New query → Run**). It re-applies
  `sql/setup_approval_system.sql` idempotently (no data deleted) and prints a
  verification report of tables, policies, bucket, and row counts.
- Never commit `.env.local` (already covered by `.gitignore` → `.env*.local`).


