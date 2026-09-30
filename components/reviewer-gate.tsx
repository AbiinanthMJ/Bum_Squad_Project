'use client'

import { KeyRound, LogOut, ShieldAlert } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { reviewerPromotionSql, reviewerReasonCopy, type ReviewerDenied } from '@/lib/reviewer'

// Explains exactly why a reviewer page refused to load instead of silently
// bouncing the visitor back to an empty login form.
export function ReviewerGate({ check, area, onRetry }: { check: ReviewerDenied; area: string; onRetry: () => void }) {
  const signOut = async () => { await createClient().auth.signOut(); window.location.reload() }
  return <main className="dashboard-login"><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><ShieldAlert size={30} /><p className="eyebrow">{area} access</p><h1>Access not granted yet.</h1><p>{reviewerReasonCopy(check)}</p>{check.reason === 'not-reviewer' && <code className="gate-sql">{reviewerPromotionSql(check.email || 'your-reviewer@email')}</code>}{check.reason === 'not-reviewer' && <p className="login-footnote">Run that SQL in Supabase, then press <strong>Re-check access</strong> - the app refreshes your token for you, so you do not need to sign out.</p>}<div className="gate-actions"><button className="button button-lime" type="button" onClick={onRetry}><KeyRound size={16} /> Re-check access</button><button className="button button-outline" type="button" onClick={() => signOut()}><LogOut size={16} /> Sign out</button></div></div></main>
}