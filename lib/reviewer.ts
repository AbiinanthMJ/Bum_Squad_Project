// Reviewer access check shared by /dashboard, /admin/users, /admin/content and
// /admin/users/[id]. The role lives in the JWT (`app_metadata.role`), so a role
// granted in the Supabase dashboard only takes effect after the token is
// refreshed - which is why "I added the role but nothing loads" happens. This
// helper refreshes the session once before declaring the account un-authorized.
import { createClient } from '@/lib/supabase/client'

export type ReviewerCheck =
  | { ok: true; userId: string; email: string }
  | { ok: false; reason: 'signed-out' | 'not-reviewer' | 'network'; userId?: string; email?: string; detail?: string }

export type ReviewerDenied = Extract<ReviewerCheck, { ok: false }>

// Copy-paste fix shown in the UI when an account is signed in but lacks the role.
export const reviewerPromotionSql = (email: string) => [
  '-- Run in Supabase -> SQL Editor -> New query -> Run, then press Re-check access',
  'update auth.users',
  `   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb) || '{"role":"reviewer"}'::jsonb`,
  ` where email = '${email}';`,
  '',
  `update public.user_profiles set status = 'approved', is_reviewer = true`,
  ` where email = '${email}';`,
].join('\n')

// A missing SELECT policy and a genuinely empty table look identical in the UI:
// PostgREST answers 200 with `[]` and no error either way. `is_reviewer()` reads
// the very JWT claim the policies test, so if it returns true while a reviewer
// read came back empty, the table itself has no reviewer SELECT policy.
export async function explainEmptyBoard(): Promise<string> {
  try {
    const { data } = await createClient().rpc('is_reviewer')
    if (data !== true) return ''
    return 'Your reviewer role is active, so this is a row level security gap rather than an empty table: no SELECT policy exists for reviewers here. Run supabase_verify.sql (section 8) in the Supabase SQL editor, then reload this page.'
  } catch {
    return ''
  }
}

export function reviewerReasonCopy(check: ReviewerDenied): string {
  if (check.reason === 'signed-out') return 'No Supabase session was found, so this page stayed locked. Sign in again - if it repeats, your browser may be blocking cookies or local storage.'
  if (check.reason === 'not-reviewer') return 'Signed in as ' + (check.email || 'this account') + ', but this account is not a reviewer yet. The data stays hidden until the role is granted (Supabase protects it with row level security).'
  return 'Could not reach Supabase to check your role. ' + (check.detail || '')
}

export async function checkReviewer(): Promise<ReviewerCheck> {
  try {
    const supabase = createClient()
    const { data } = await supabase.auth.getUser()
    if (!data.user) return { ok: false, reason: 'signed-out' }
    let user = data.user
    if (user.app_metadata?.role !== 'reviewer') {
      // Stale token? Ask Supabase for fresh claims before giving up.
      const { data: refreshed } = await supabase.auth.refreshSession()
      if (refreshed?.user) user = refreshed.user
    }
    if (user.app_metadata?.role !== 'reviewer') return { ok: false, reason: 'not-reviewer', userId: user.id, email: user.email ?? '' }
    return { ok: true, userId: user.id, email: user.email ?? '' }
  } catch (error) {
    return { ok: false, reason: 'network', detail: error instanceof Error ? error.message : String(error) }
  }
}