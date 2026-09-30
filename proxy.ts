import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Refreshes the Supabase auth cookies on every request so the PKCE
// code verifier survives the email-confirmation round-trip
// (fixes "PKCE code verifier not found in storage" seen in dev.log)
// and SSR pages always see a fresh session.
//
// NOTE (Next.js 16): the `middleware.ts` convention is deprecated in favour
// of `proxy.ts` with a `proxy()` export (Node.js runtime by default).
// This file replaces the old middleware.ts.
export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (metadata)
     * - public assets (svg/png/jpg)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
