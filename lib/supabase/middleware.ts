import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

// Shared Supabase SSR session handler used by middleware.ts.
// Must run on every non-static request so:
//  1. auth.getUser() on the server always sees fresh cookies,
//  2. supabase.auth.exchangeCodeForSession() in /auth/callback can read
//     the PKCE code verifier that the browser client stored in cookies.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Missing env vars must never crash the middleware chain —
  // pages surface a friendly message instead (see lib/supabase/client.ts).
  if (!url || !key) return supabaseResponse

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        )
      },
    },
  })

  // Refresh the session when expired; also propagates set-cookie headers.
  await supabase.auth.getUser()

  return supabaseResponse
}
