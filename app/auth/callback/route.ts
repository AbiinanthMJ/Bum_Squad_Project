import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Supabase sends people back here from the confirmation e-mail (or with an
// `error`/`error_description` when the link expired). Failures are handed to the
// destination page as `?authError=` so the login screen can explain what happened
// instead of the visitor landing on a broken session.
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/progress'
  const denied = url.searchParams.get('error_description') || url.searchParams.get('error')
  if (denied) return NextResponse.redirect(new URL(`${next}?authError=${encodeURIComponent(denied)}`, url.origin))
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) return NextResponse.redirect(new URL(`${next}?authError=${encodeURIComponent(error.message)}`, url.origin))
  }
  return NextResponse.redirect(new URL(next, url.origin))
}

