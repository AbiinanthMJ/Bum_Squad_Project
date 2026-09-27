// Account approval gate: users sign up → a trigger writes a `user_profiles` row
// with status "pending" → an admin approves it from /admin/users → only then can
// the user keep a session. If the migration (setup_approval_system.sql) has not
// run yet the gate fails OPEN so the app keeps working.
import { createClient } from '@/lib/supabase/client'

export type ApprovalStatus = 'approved' | 'pending' | 'rejected' | 'suspended' | 'unmanaged'

export function approvalMessage(status: ApprovalStatus): string {
  if (status === 'pending') return 'Your account is awaiting admin approval. You can sign in as soon as an admin approves it.'
  if (status === 'rejected') return 'This application was not approved. Please contact your coach for details.'
  if (status === 'suspended') return 'This account has been suspended. Please contact your coach to restore access.'
  return ''
}

export async function getApprovalStatus(userId: string): Promise<ApprovalStatus> {
  try {
    const supabase = createClient()
    const { data, error } = await supabase.from('user_profiles').select('status').eq('id', userId).maybeSingle()
    if (error || !data) return 'unmanaged' // migration not applied yet → do not block
    return (data.status as ApprovalStatus) || 'unmanaged'
  } catch {
    return 'unmanaged'
  }
}

// Returns { ok:false, message } when the signed-in user must be signed out again.
export async function enforceApproval(userId: string): Promise<{ ok: boolean; message?: string }> {
  const status = await getApprovalStatus(userId)
  if (status === 'approved' || status === 'unmanaged') return { ok: true }
  await createClient().auth.signOut()
  return { ok: false, message: approvalMessage(status) }
}
