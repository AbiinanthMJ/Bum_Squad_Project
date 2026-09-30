'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Check, LogOut, Target, TrendingUp } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { supabaseEmailRedirect } from '@/lib/auth-redirect'
import { ThemeToggle } from '@/components/theme-toggle'
import { authLinkErrorCopy, resendErrorCopy, signInErrorCopy } from '@/lib/auth-messages'
import { approvalMessage, getApprovalStatus } from '@/lib/approval'
import { Kpi, TrendChart, buildTrend } from '@/components/analytics'

type Metric = { id: string; metric: string; value: number; target: number; note: string | null; week_start: string }

const demoMetrics = [
  { metric: 'Training', value: 4, target: 5, note: 'One more session to hit your weekly target.' },
  { metric: 'Nutrition', value: 86, target: 100, note: 'Protein consistency is trending upward.' },
  { metric: 'Recovery', value: 7.4, target: 8, note: 'Protect your sleep window tonight.' },
]

export default function ProgressPage() {
  const [user, setUser] = useState<{ email?: string } | null>(null)
  const [login, setLogin] = useState({ email: '', password: '' })
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [resending, setResending] = useState(false)
  const [resendMessage, setResendMessage] = useState('')

  useEffect(() => {
    // Show errors forwarded by the auth callback (e.g. expired or invalid confirmation link).
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search)
      const authErr = params.get('authError')
      if (authErr) setError(authLinkErrorCopy(authErr))
    }
    const boot = async () => {
      const supabase = createClient()
      const { data } = await supabase.auth.getUser()
      if (data.user) {
        // Approval gate: a pending/rejected/suspended account is signed out again.
        const status = await getApprovalStatus(data.user.id)
        if (status !== 'approved' && status !== 'unmanaged') {
          await supabase.auth.signOut()
          setError(approvalMessage(status))
          setLoading(false)
          return
        }
        setUser(data.user)
        const { data: rows } = await supabase.from('client_progress').select('id, metric, value, target, note, week_start').eq('user_id', data.user.id).order('week_start', { ascending: false }).limit(12)
        setMetrics(rows || [])
      }
      setLoading(false)
    }
    boot()
  }, [])

  // Analytics derived from the same client_progress rows: one point per week,
  // each carrying the per-metric breakdown the hover tooltip shows.
  const trend = useMemo(() => buildTrend(metrics), [metrics])

  const redirectTo = () => supabaseEmailRedirect('/auth/callback')

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setResendMessage('')
    const supabase = createClient()
    const { data, error: authError } = await supabase.auth.signInWithPassword(login)
    if (authError) { setError(signInErrorCopy(authError)); return }
    // Approval gate: only approved accounts keep their session.
    const status = data.user ? await getApprovalStatus(data.user.id) : 'unmanaged'
    if (status !== 'approved' && status !== 'unmanaged') {
      await supabase.auth.signOut()
      setError(approvalMessage(status))
      return
    }
    window.location.reload()
  }

  const resend = async () => {
    if (!login.email) { setError('Enter your email address above first, then click resend.'); return }
    setResending(true); setResendMessage('')
    const { error: resendErr } = await createClient().auth.resend({ type: 'signup', email: login.email, options: { emailRedirectTo: redirectTo() } })
    setResendMessage(resendErr ? resendErrorCopy(resendErr) : 'Confirmation e-mail sent. It may take a minute - check spam too.')
    setResending(false)
  }
  const signOut = async () => { await createClient().auth.signOut(); setUser(null) }
  const cards = metrics.length ? metrics : demoMetrics
  const average = useMemo(() => Math.round(cards.reduce((sum, item) => sum + (Number(item.value) / Number(item.target)) * 100, 0) / cards.length), [cards])

  if (loading) return <main className="progress-shell"><p className="eyebrow">Loading your workspace…</p></main>
  if (!user) return <main className="progress-login"><ThemeToggle className="auth-theme" /><a href="/" className="dashboard-back"><ArrowLeft size={16} /> Back to Team Yuva</a><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><Target size={30} /><p className="eyebrow">Client progress</p><h1>Enter your next week.</h1><p>Sign in with your client account to see your personal coaching rhythm.</p><form onSubmit={signIn}><label>Email<input className="form-input" type="email" required autoComplete="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label><label>Password<input className="form-input" type="password" required autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{error && <p className="error-text">{error}</p>}{resendMessage && <p className="login-footnote">{resendMessage}</p>}<button className="button button-lime">Open my progress <TrendingUp size={16} /></button></form><p className="login-footnote">New client? <a href="/auth/sign-up">Create your client account</a> · <button className="link-button" type="button" onClick={resend} disabled={resending}>{resending ? 'Sending…' : 'Resend confirmation e-mail'}</button></p></div></main>

  return <main className="progress-shell"><header className="progress-header"><a href="/" className="brand"><span className="brand-mark">Y</span> TEAM YUVA</a><div className="progress-actions"><ThemeToggle /><button className="dashboard-logout" onClick={signOut}><LogOut size={16} /> Sign out</button></div></header><section className="progress-hero"><div><p className="eyebrow">Week of 09 September 2026</p><h1>Keep the<br /><em>promise.</em></h1><p>Small evidence, repeated. Here is your current signal.</p></div><div className="progress-ring"><strong>{average}%</strong><span>weekly<br />signal</span></div></section><section className="progress-content"><div className="progress-section-head"><div><p className="eyebrow">Your weekly dashboard</p><h2>Momentum, made visible.</h2></div><span className="streak"><Check size={14} /> {metrics.length ? `${trend.length} week${trend.length === 1 ? '' : 's'} tracked` : 'Getting started'}</span></div>
        <div className="kpi-grid">
          <Kpi label="Weekly signal" value={`${average}%`} hint="value ÷ target, all metrics" />
          <Kpi label="Weeks logged" value={trend.length} hint="check-ins stored for you" />
          <Kpi label="Metrics tracked" value={metrics.length} hint="rows in your history" />
          <Kpi label="On target" value={metrics.filter((m) => Number(m.value) >= Number(m.target)).length} hint="metrics at or above target" />
        </div>
        <div className="analytics-panel">
          <div className="analytics-panel-head"><div><p className="eyebrow">Trend</p><h2>Your performance by week</h2></div><TrendingUp size={18} /></div>
          <TrendChart points={trend} />
        </div>
        <div className="metric-cards">{cards.map((item) => { const percentage = Math.min(100, Math.round((Number(item.value) / Number(item.target)) * 100)); return <article className="metric-card" key={item.metric}><div className="metric-card-top"><span>{item.metric}</span><strong>{percentage}%</strong></div><div className="metric-bar"><i style={{ width: `${percentage}%` }} /></div><p>{item.note}</p><small>{item.value} / {item.target} target</small></article> })}</div><div className="progress-timeline"><p className="eyebrow">The long game</p><h2>Consistency compounds.</h2><div className="timeline-line"><span className="timeline-dot active" /><span className="timeline-dot active" /><span className="timeline-dot active" /><span className="timeline-dot" /><span className="timeline-dot" /></div><div className="timeline-labels"><span>Start</span><span>Today</span><span>Next standard</span></div></div></section></main>
}
