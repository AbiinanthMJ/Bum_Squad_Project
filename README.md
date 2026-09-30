# Team Yuva — personal coaching site (Next.js + Supabase)

Live deploy: https://bum-squad.vercel.app (Vercel project `bum_squad`, Production from `main`).

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
- `pnpm email:check you@example.com` — proves whether confirmation e-mails actually send (200 = accepted, 429 / *Email address not authorized* = still the built-in mailer). See [SUPABASE_SETUP.md](./SUPABASE_SETUP.md) Step 3b.
- Run [`supabase_verify.sql`](./supabase_verify.sql) in Supabase → SQL Editor if any check fails; it is idempotent and never deletes data.
## Deploying to Vercel

1. Push to GitHub (`main` branch).
2. Vercel → Add New → Project → Import the repo (Framework Preset: Next.js).
3. Add the two `NEXT_PUBLIC_*` env vars above to all environments.
4. Deploy. Every push to `main` redeploys production; pull requests get preview URLs.
5. In Supabase → Authentication → URL Configuration → Redirect URLs, add `https://<your-app>.vercel.app/auth/callback` (keep the localhost one for dev).

