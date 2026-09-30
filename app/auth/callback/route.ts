import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Supabase sends people back here from the confirmation e-mail (or with an
// `error`/`error_description` when the link expired). Failures are handed to the
// destination page as `?authError=` so the login screen can explain what happened
// instead of the visitor landing on a broken session.
//
// Both e-mail link styles are accepted, so either template works:
//   ?code=...                     the default {{ .ConfirmationURL }} link (PKCE)
//   ?token_hash=...&type=signup   a link written against {{ .RedirectTo }}
// The token_hash form needs no PKCE code-verifier cookie, which is what makes it
// survive being opened in another browser or on a phone.
type EmailOtpType = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const tokenHash = url.searchParams.get('token_hash')
  const type = url.searchParams.get('type')
  const requestedNext = url.searchParams.get('next') || '/progress'
  // Only allow same-origin relative destinations — prevents open-redirect abuse
  // via a crafted `?next=https://evil.example` link.
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/progress'
  const denied = url.searchParams.get('error_description') || url.searchParams.get('error')
  if (denied) return NextResponse.redirect(new URL(`${next}?authError=${encodeURIComponent(denied)}`, url.origin))
  if (code || (tokenHash && type)) {
    const supabase = await createClient()
    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash as string, type: type as EmailOtpType })
    if (error) return NextResponse.redirect(new URL(`${next}?authError=${encodeURIComponent(error.message)}`, url.origin))
  }
  return NextResponse.redirect(new URL(next, url.origin))
}

