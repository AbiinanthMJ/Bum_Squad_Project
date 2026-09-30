'use client'

import { FormEvent, useState } from 'react'
import { ArrowLeft, ArrowUpRight, Mail, UserPlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { supabaseEmailRedirect } from '@/lib/auth-redirect'
import { ThemeToggle } from '@/components/theme-toggle'
import { otpErrorCopy, resendErrorCopy, signUpErrorCopy } from '@/lib/auth-messages'
import { enforceApproval } from '@/lib/approval'

export default function SignUpPage() {
  const [form, setForm] = useState({ email: '', password: '', confirm: '' })
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')
  const [code, setCode] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [codeError, setCodeError] = useState('')

  const redirectTo = () => supabaseEmailRedirect('/auth/callback')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setMessage(''); setResendMessage('')
    if (form.password.length < 8) { setStatus('error'); setMessage('Use at least 8 characters for your password.'); return }
    if (form.password !== form.confirm) { setStatus('error'); setMessage('Passwords do not match.'); return }
    setStatus('sending')
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.password, options: { emailRedirectTo: redirectTo() } })
    if (error) { setStatus('error'); setMessage(signUpErrorCopy(error)); return }
    // With "Confirm email" switched off Supabase returns a session and the new
    // client can walk straight into the progress workspace.
    if (data.session) { window.location.href = '/progress'; return }
    setStatus('done')
  }

  const resend = async () => {
    if (resending || !form.email) return
    setResending(true); setResendMessage('')
    const { error } = await createClient().auth.resend({ type: 'signup', email: form.email, options: { emailRedirectTo: redirectTo() } })
    setResendMessage(error ? resendErrorCopy(error) : 'Confirmation e-mail sent again. It can take a minute - check spam too.')
    setResending(false)
  }

  // Confirm with the 6-digit code instead of the link. This works from any
  // browser or device because it never needs the PKCE verifier cookie that the
  // link flow stores (the "code verifier not found in storage" failure).
  // The confirmation e-mail mints the OTP as type "signup"; older projects mint
  // type "email", so fall back once rather than making the user guess.
  const confirmCode = async (event: FormEvent) => {
    event.preventDefault()
    if (confirming) return
    setCodeError('')
    const token = code.replace(/\D/g, '')
    if (token.length !== 6) { setCodeError('Enter the six digits from the confirmation e-mail.'); return }
    setConfirming(true)
    const supabase = createClient()
    let result = await supabase.auth.verifyOtp({ email: form.email, token, type: 'signup' })
    if (result.error) result = await supabase.auth.verifyOtp({ email: form.email, token, type: 'email' })
    const confirmed = result.data?.user
    if (result.error || !confirmed) { setCodeError(otpErrorCopy(result.error || {})); setConfirming(false); return }
    // Same approval gate as /progress: a pending account is signed out again.
    const gate = await enforceApproval(confirmed.id)
    if (!gate.ok) { setCodeError(gate.message || ''); setConfirming(false); return }
    window.location.href = '/progress'
  }

  const resendLabel = resending ? 'Sending…' : 'Resend confirmation e-mail'
  const resendDisabled = resending || !form.email

  if (status === 'done') return <main className="progress-login"><ThemeToggle className="auth-theme" /><a href="/" className="dashboard-back"><ArrowLeft size={16} /> Back to Team Yuva</a><div className="login-panel auth-success"><div className="success-icon"><Mail /></div><p className="eyebrow">Account created</p><h1>Check your inbox.</h1><p>We sent a confirmation e-mail to <strong>{form.email}</strong>. Open the link inside it, or type the 6-digit code from that e-mail below. After confirming, an admin approves your account — then you can sign in.</p><form onSubmit={confirmCode}><label>6-digit confirmation code<input className="form-input" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="000000" value={code} onChange={(e) => setCode(e.target.value)} /></label>{codeError && <p className="error-text">{codeError}</p>}<button className="button button-lime" disabled={confirming}>{confirming ? 'Confirming…' : 'Confirm code'} <ArrowUpRight size={16} /></button></form>{resendMessage && <p className="login-footnote">{resendMessage}</p>}<div className="auth-actions"><a className="button button-lime" href="/progress">Go to client progress <ArrowUpRight size={16} /></a><button className="button button-outline" type="button" onClick={resend} disabled={resendDisabled}>{resendLabel}</button></div></div></main>

  return <main className="progress-login"><ThemeToggle className="auth-theme" /><a href="/" className="dashboard-back"><ArrowLeft size={16} /> Back to Team Yuva</a><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><UserPlus size={30} /><p className="eyebrow">Client access</p><h1>Create your account.</h1><p>Every new account is approved by an admin before it can sign in.</p><form onSubmit={submit}><label>Email<input className="form-input" type="email" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Password<input className="form-input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label><label>Confirm password<input className="form-input" type="password" required minLength={8} autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></label>{status === 'error' && <p className="error-text">{message}</p>}{resendMessage && <p className="login-footnote">{resendMessage}</p>}<button className="button button-lime" disabled={status === 'sending'}>{status === 'sending' ? 'Creating account…' : 'Create account'} <ArrowUpRight size={16} /></button></form><p className="login-footnote">Already have access? <a href="/progress">Sign in to your progress</a> · <button className="link-button" type="button" onClick={resend} disabled={resendDisabled}>{resendLabel}</button></p></div></main>
}
