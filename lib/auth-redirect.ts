// Shared e-mail redirect for every auth flow. The localhost override only
// applies on a local host — otherwise a Production build that accidentally
// inherits NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL would send Vercel users
// back to localhost (the bug noted in README / SUPABASE_SETUP).
export function supabaseEmailRedirect(path: string = '/auth/callback'): string {
  if (typeof window === 'undefined') return path
  const host = window.location.hostname
  const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  const devOverride = process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL
  if (isLocal && devOverride) return devOverride
  return `${window.location.origin}${path}`
}
