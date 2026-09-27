'use client'

import { FormEvent, useEffect, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Mail, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'
import { isRateLimited, resendErrorCopy, signUpErrorCopy } from '@/lib/auth-messages'

const PENDING_EMAIL_KEY = 'bum-pending-email'
const RESEND_COOLDOWN_SECONDS = 60

export default function SignUpPage() {
  const [form, setForm] = useState({ email: '', password: '', confirm: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [rateLimited, setRateLimited] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  // Keep the pending e-mail across refreshes so a rate-limit never loses the flow.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PENDING_EMAIL_KEY)
      if (saved) setForm((current) => ({ ...current, email: current.email || saved }))
    } catch { /* private mode — the form still works without storage */ }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  const redirectTo = () => process.env.NEXT_PUBLIC_DEV_SUPABASE_REDIRECT_URL ?? `${window.location.origin}/auth/callback`

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(''); setResendMessage(''); setRateLimited(false)
    if (form.password.length < 8) { setStatus('error'); setMessage('Use at least 8 characters for your password.'); return }
    if (form.password !== form.confirm) { setStatus('error'); setMessage('Passwords do not match.'); return }
    setStatus('sending')
    try { localStorage.setItem(PENDING_EMAIL_KEY, form.email) } catch { /* ignore */ }
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password, options: { emailRedirectTo: redirectTo() } })
    if (error) {
      setStatus('error'); setMessage(signUpErrorCopy(error))
      if (isRateLimited(error)) { setRateLimited(true); setCooldown(RESEND_COOLDOWN_SECONDS) }
      return
    }
    // With "Confirm email" switched off Supabase returns a session and the new
    // client can walk straight into the progress workspace.
    if (data.session) { window.location.href = '/progress'; return }
    setStatus('done')
  }

  const resend = async () => {
    if (cooldown > 0 || !form.email) return
    setResending(true); setResendMessage('')
    const { error } = await createClient().auth.resend({ type: 'signup', email: form.email, options: { emailRedirectTo: redirectTo() } })
    if (error && isRateLimited(error)) setCooldown(RESEND_COOLDOWN_SECONDS)
    setResendMessage(error ? resendErrorCopy(error) : 'Confirmation e-mail sent again. It can take a minute - check spam too.')
    setResending(false)
  }

  const resendLabel = resending ? 'Sending…' : cooldown > 0 ? `Resend available in ${cooldown}s` : 'Resend confirmation e-mail'
  const resendDisabled = resending || cooldown > 0 || !form.email

  if (status === 'done') return <main className="progress-login"><ThemeToggle className="auth-theme" /><a href="/" className="dashboard-back"><ArrowLeft size={16} /> Back to Team Yuva</a><div className="login-panel auth-success"><div className="success-icon"><Mail /></div><p className="eyebrow">Account created</p><h1>Check your inbox.</h1><p>We sent a confirmation link to <strong>{form.email}</strong>. After confirming, an admin approves your account — then you can sign in.</p>{rateLimited && <p className="rate-note">Rate limited — your e-mail is saved. Wait for the timer, then press resend.</p>}{resendMessage && <p className="login-footnote">{resendMessage}</p>}<div className="auth-actions"><a className="button button-lime" href="/progress">Go to client progress <ArrowUpRight size={16} /></a><button className="button button-outline" type="button" onClick={resend} disabled={resendDisabled}>{resendLabel}</button></div></div></main>

  return <main className="progress-login"><ThemeToggle className="auth-theme" /><a href="/" className="dashboard-back"><ArrowLeft size={16} /> Back to Team Yuva</a><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><UserPlus size={30} /><p className="eyebrow">Client access</p><h1>Create your account.</h1><p>Confirm your e-mail, then an admin approves your account — you can sign in right after that.</p>{rateLimited && <p className="rate-note">Rate limited — nothing to retype. Your e-mail is saved; wait for the timer, then resend.</p>}<form onSubmit={submit}><label>Email<input className="form-input" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Password<input className="form-input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><label>Confirm password<input className="form-input" type="password" required minLength={8} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></label>{status === 'error' && <p className="error-text">{message}</p>}{resendMessage && <p className="login-footnote">{resendMessage}</p>}<button className="button button-lime" disabled={status === 'sending'}>{status === 'sending' ? 'Creating account…' : 'Create account'} <ArrowUpRight size={16} /></button></form><p className="login-footnote">Already have access? <a href="/progress">Sign in to your progress</a> · <button className="link-button" type="button" onClick={resend} disabled={resendDisabled}>{resendLabel}</button></p></div></main>
}
