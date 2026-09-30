import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

// Coach-side onboarding, so a client never waits on the e-mail service.
//
// The public sign-up form has to ask Supabase to send a confirmation message,
// and the built-in mailer caps that at ~2 messages per hour (and only to your own
// team's addresses). This route instead creates the account **already confirmed**
// with the service-role key, approves its profile row and hands back a one-time
// password the coach can pass on - no e-mail, nothing to wait for.
//
// Security: the caller must be a signed-in reviewer (same claim /admin/users
// checks), and the service-role key stays on the server. Only the publishable
// pair is ever sent to the browser, so this secret must never be a NEXT_PUBLIC_*
// variable.
type Body = { email?: string; fullName?: string }

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function POST(request: Request) {
  // 1. Only a reviewer may create accounts. Checked before anything else so an
  //    anonymous caller learns nothing about how the route is configured.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in as a reviewer first.' }, { status: 401 })
  if (user.app_metadata?.role !== 'reviewer') return NextResponse.json({ error: 'This account is not a reviewer, so it cannot create accounts.' }, { status: 403 })

  // 2. The service-role key is what makes the account skip the confirmation e-mail.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    return NextResponse.json({
      error: 'Add SUPABASE_SERVICE_ROLE_KEY to .env.local and to Vercel → Settings → Environment Variables (Supabase → Project Settings → API → service_role / secret key), then restart the dev server. Until then invite people from Supabase → Authentication → Users → Add user.',
    }, { status: 501 })
  }

  // 3. Validate the input.
  const body = (await request.json().catch(() => ({}))) as Body
  const email = (body.email || '').trim().toLowerCase()
  const fullName = (body.fullName || '').trim()
  if (!emailPattern.test(email)) return NextResponse.json({ error: 'Enter a valid e-mail address for the client.' }, { status: 400 })

  // 4. A readable one-time password the coach can share.
  const password = 'yuva-' + crypto.randomUUID().replace(/-/g, '').slice(0, 10)

  // 5. Create the account with the address already confirmed.
  const admin = createSupabaseClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    ...(fullName ? { user_metadata: { full_name: fullName } } : {}),
  })
  if (createError || !created.user) {
    return NextResponse.json({ error: createError?.message || 'Could not create that account.' }, { status: 400 })
  }

  // 6. Upsert (not update) the profile row, so the account is approved even if
  //    the sign-up trigger has not been applied to this database yet.
  const { error: profileError } = await admin.from('user_profiles').upsert({
    id: created.user.id,
    email,
    full_name: fullName || null,
    status: 'approved',
    approved_at: new Date().toISOString(),
    approved_by: user.id,
  })
  if (profileError) {
    // The account exists and can sign in - say so instead of pretending it failed.
    return NextResponse.json({ email, password, warning: 'Account created, but its profile row could not be approved (' + profileError.message + '). Approve it from the list below.' }, { status: 201 })
  }

  return NextResponse.json({ email, password, userId: created.user.id }, { status: 201 })
}
