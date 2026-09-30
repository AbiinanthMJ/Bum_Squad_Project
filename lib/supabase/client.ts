import { createBrowserClient } from '@supabase/ssr'

function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  // Publishable key wins; anon JWT is the legacy fallback. `||` (not `??`)
  // so an empty-string variable still falls through to the other key.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    // Thrown at call-time (not import-time) so static pages that never touch
    // Supabase can still prerender, while auth/forms fail with a clear message
    // instead of the cryptic "supabaseKey is required".
    throw new Error(
      'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL plus ' +
        'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) ' +
        'in .env.local and in Vercel → Settings → Environment Variables.',
    )
  }
  return { url, key }
}

export function createClient() {
  const { url, key } = getSupabaseEnv()
  return createBrowserClient(url, key)
}

// Cheap guard for UI that wants to show a setup hint instead of crashing.
export function isSupabaseConfigured() {
  try {
    getSupabaseEnv()
    return true
  } catch {
    return false
  }
}

