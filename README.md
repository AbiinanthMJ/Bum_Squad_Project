# Team Yuva — personal coaching site (Next.js + Supabase)

Live deploy: https://bum-squad.vercel.app (Vercel project `bum_squad`, Production from `main`).

## Quick start

```bash
pnpm install
cp .env.example .env.local   # then fill in your Supabase values
pnpm dev                     # http://localhost:3000
```

## Environment variables

| Variable | Where to set locally | Where to set in Vercel |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `.env.local` | Production + Preview + Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`) | `.env.local` | Production + Preview + Development |
| `NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL` | `.env.local` only | **Do NOT set in Vercel** (it would force the localhost callback) |

Full walkthrough (keys, database schema, approval SQL, auth settings): [SUPABASE_SETUP.md](./SUPABASE_SETUP.md).

## Deploying to Vercel

1. Push to GitHub (`main` branch).
2. Vercel → Add New → Project → Import the repo (Framework Preset: Next.js).
3. Add the two `NEXT_PUBLIC_*` env vars above to all environments.
4. Deploy. Every push to `main` redeploys production; pull requests get preview URLs.
5. In Supabase → Authentication → URL Configuration → Redirect URLs, add `https://<your-app>.vercel.app/auth/callback` (keep the localhost one for dev).

