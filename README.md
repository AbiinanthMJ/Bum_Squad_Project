# BUM. (Team Yuva) — personal coaching platform

A production coaching site built with **Next.js 16 (App Router) + Supabase**: a public marketing
site with an application funnel, a gated client progress dashboard, and a reviewer back office
for approvals, applications and site copy.

Live deploy: **https://bum-squad.vercel.app** (Vercel project `bum_squad`, Production from `main`).

---

## Features

### Public site (`/`)

Single-page marketing site with five sections — *Our method*, *The BUM. cycle*, *Apply to BUM.*,
*Good to know* (FAQ) and *Ask the team* — plus a 3D hero built with React Three Fiber.

Two **write** flows run straight from the homepage, both with open RLS insert policies so no
session is needed:

| Flow | Behaviour |
| --- | --- |
| **Application form** | Collects contact details, body metrics (age, height, weight, optional body-fat %), goals and concerns, and submits to `applications`. Up to **5 progress photos** upload to the private `application-images` bucket and are linked through `application_images`. Failed uploads are listed back to the applicant instead of being swallowed. |
| **Ask the team** | Public question form writing to `community_questions`. Answered questions render on the homepage (newest 4). |

### Client area (approval-gated)

| Route | Purpose |
| --- | --- |
| `/auth/sign-up` | Email + password (min 8 chars). With Confirm email **off** Supabase returns a session immediately, so there is no inbox step. Also supports resend and a 6-digit code box. |
| `/progress` | Client dashboard: sign-in, weekly metrics, KPI tiles and a trend chart from `client_progress`. |
| `/auth/callback` | OTP/PKCE return route. Accepts both `?code=` and `?token_hash=…&type=signup`; `next` is validated same-origin to prevent open redirect. |

### Reviewer back office

| Route | Purpose |
| --- | --- |
| `/dashboard` | **Reviewer desk.** Lists applications newest-first with filter + search, per-application status (`new` / `reviewing` / `accepted` / `rejected`) and reviewer notes. Opens applicant photos via **30-minute signed URLs**. |
| `/admin/users` | **Approval queue.** Filter pending/approved/all; approve, reject or suspend. Can also **create a client account** already-confirmed via the service-role key and return a one-time password. |
| `/admin/users/[id]` | Per-client detail: profile plus coach weekly-metric entry and trend. |
| `/admin/content` | **Content studio.** Edit `site_content` rows (hero, manifesto, application) without touching code. |
| `/admin` | Landing page linking the three tools above. |
| `/diagnostics` | Live troubleshooting: current session, `app_metadata.role`, what `is_reviewer()` returns, RLS-filtered counts per table, bucket status. |

### How access control works

Enforced with **row level security**, not just in the UI.

- `public.is_reviewer()` reads `app_metadata.role === 'reviewer'` from the JWT — the same
  function the RLS policies call.
- Visitors may **insert** into `applications`, `application_images` and `community_questions`.
  Only reviewers may **read** or **update** them.
- A `handle_new_user()` trigger on `auth.users` writes a `user_profiles` row with
  `status = 'pending'`. The client is signed straight back out with *"awaiting admin approval"*
  until a reviewer approves them.
- **Fail-open by design:** a *missing* `user_profiles` row is treated as `unmanaged` and allowed
  through, so a half-applied migration can never lock every client out.

---

## Tech stack

| | |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack), React 19, TypeScript strict |
| Styling | Tailwind CSS 4 + hand-written CSS (`app/globals.css`), light/dark theme |
| Backend | Supabase (Postgres + Auth + Storage + RLS) |
| 3D | three.js via `@react-three/fiber` + `@react-three/drei` |
| Icons / UI | `lucide-react`, Vercel Analytics |

## Project structure

```
app/
  page.tsx                  public site + application & question forms
  layout.tsx  globals.css   root layout, metadata, theme boot script
  progress/                 client dashboard (approval gated)
  dashboard/                reviewer desk: applications + photos
  admin/                    users, users/[id], content, index
  diagnostics/              connection troubleshooting page
  auth/sign-up/  auth/callback/
  api/admin/create-user/    reviewer-only account creation (service role)
components/                 analytics, logo, reviewer-gate, theme-toggle
lib/                        supabase client/server/middleware, approval, reviewer,
                            auth-messages, auth-redirect, theme
scripts/                    db-check.mjs, email-check.mjs
  probes/                   Chrome DevTools UI checks (dark, overflow, responsive, ticker)
sql/                        setup_approval_system.sql
  supabase_verify.sql       idempotent schema + policy + bucket repair
proxy.ts                    session refresh (Next 16 renamed middleware.ts)
```

## Database tables

| Table | Purpose |
| --- | --- |
| `user_profiles` | One row per auth user: status, reviewer flag, approval audit. |
| `applications` | Public coaching applications + reviewer status/notes. |
| `application_images` | Links an application to its photos in Storage. |
| `client_progress` | Weekly per-client metrics (metric, value, target, note, week_start). |
| `community_questions` | Public Q&A; a row becomes visible once it has an `answer`. |
| `site_content` | Editable homepage copy (`content_key` = hero / manifesto / application). |
| `storage` bucket `application-images` | Private bucket for applicant photos. |

---

## Quick start

```bash
pnpm install
cp .env.example .env.local   # then fill in your Supabase values
pnpm db:check                # verify Supabase tables, bucket and write policies
pnpm dev                     # http://localhost:3000
```

## Environment variables

| Variable | Where to set locally | Where to set in Vercel |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Production + Preview + Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | `.env.local` | Production + Preview + Development |
| `SUPABASE_SERVICE_ROLE_KEY` (optional — lets the coach create accounts from `/admin/users`) | `.env.local` | Production + Preview, **server-only: never `NEXT_PUBLIC_`** |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | `.env.local` only | **Do NOT set in Vercel** (it would force the localhost callback) |

Full walkthrough (keys, database schema, approval SQL, auth settings): [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

Database/setup one-liners:

- `pnpm db:check` — read-only readiness report (tables, `application-images` bucket, public-write RLS, content rows).
- `pnpm email:check you@example.com` — proves whether e-mails actually send. Point it at an address that **already has an account**: Supabase returns `200` for unknown addresses (anti-enumeration), so a made-up address proves nothing. `429` / *Email address not authorized* = still the built-in mailer (capped at 2/hour); *SMTP refused* = custom SMTP is connected but rejecting — check host, port, username, key and sender.
- Run [`sql/supabase_verify.sql`](./sql/supabase_verify.sql) in Supabase → SQL Editor if any check fails; it is idempotent and never deletes data.

## Auth configuration that matters

- **Confirm email → OFF**, Email provider → **ON**. That combination is the supported setup:
  sign-up returns a session instantly, so no visitor ever waits on a mail server. Turning the
  *provider* off instead (not just the confirm toggle) makes Supabase reject e-mail signups
  outright with `400 Email signups are disabled`.
- **Custom SMTP** (e.g. Brevo) is only needed for **password reset** — there is no
  `/auth/reset-password` route in this app, so the recovery link lands on Supabase's own hosted
  page. After connecting a provider, raise **Authentication → Rate Limits → "Rate limit for
  sending emails"**, otherwise you stay capped at 2 messages per hour.
- Promote a reviewer: Supabase → **Authentication → Users → Edit → App metadata** → `{"role": "reviewer"}`.

## Scripts

| Command | Does |
| --- | --- |
| `pnpm dev` | Development server |
| `pnpm build` / `pnpm start` | Production build and serve |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm db:check` | Read-only Supabase readiness report |
| `pnpm email:check <email>` | Auth mail-delivery probe |
| `node scripts/probes/*.mjs` | Dev-only Chrome DevTools UI checks — needs the app on :3000 and Chrome on :9333 ([details](./scripts/probes/README.md)) |

## Deploying to Vercel

1. Push to GitHub (`main` branch).
2. Vercel → Add New → Project → Import the repo (Framework Preset: Next.js).
3. Add the `NEXT_PUBLIC_*` env vars above to **all** environments (Production + Preview +
   Development) — the anon/publishable key is safe in the browser because RLS protects the data.
4. Deploy. Every push to `main` redeploys production; pull requests get preview URLs.
5. In Supabase → **Authentication → URL Configuration → Redirect URLs**, add
   `https://<your-app>.vercel.app/auth/callback` (keep the localhost one for dev).

