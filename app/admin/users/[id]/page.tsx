'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Save, Shield, Target } from 'lucide-react'
import { useParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'
import { Kpi, TrendChart, buildTrend } from '@/components/analytics'

type Profile = { id: string; email: string; full_name: string | null; status: string; is_reviewer: boolean; created_at: string }
type Metric = { id: string; metric: string; value: number; target: number; note: string | null; week_start: string }
type MetricDraft = { metric: string; value: string; target: string; week_start: string; note: string }
const draftEmpty: MetricDraft = { metric: 'Training', value: '', target: '', week_start: new Date().toISOString().slice(0, 10), note: '' }

export default function AdminUserDashboardPage() {
  const params = useParams<{ id: string }>()
  const userId = params?.id || ''
  const [profile, setProfile] = useState<Profile | null>(null)
  const [rows, setRows] = useState<Metric[]>([])
  const [draft, setDraft] = useState<MetricDraft>(draftEmpty)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const [session, setSession] = useState(false)
  const [login, setLogin] = useState({ email: '', password: '' })

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword(login)
    if (authError) setError('Invalid email or password.')
    else load()
  }

  const load = async () => {
    const supabase = createClient()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    if (user.app_metadata?.role !== 'reviewer') { setError('This account is not authorized as an admin.'); setLoading(false); return }
    setSession(true)
    const { data: prof } = await supabase.from('user_profiles').select('id, email, full_name, status, is_reviewer, created_at').eq('id', userId).maybeSingle()
    setProfile(prof || null)
    const { data: metrics, error: fetchError } = await supabase.from('client_progress').select('id, metric, value, target, note, week_start').eq('user_id', userId).order('week_start', { ascending: true })
    if (fetchError) setError('Could not load this user\'s progress rows.')
    else setRows(metrics || [])
    setLoading(false)
  }
  useEffect(() => { if (userId) load() }, [userId])

  // Weekly trend: average completion % across every metric logged that week,
  // each point carrying the per-metric breakdown the hover tooltip shows.
  const trend = useMemo(() => buildTrend(rows), [rows])

  const kpis = useMemo(() => {
    if (rows.length === 0) return { weeks: 0, avg: '0%', latest: '', logged: 0 }
    const avg = Math.round(rows.reduce((sum, r) => sum + Math.min(150, (Number(r.value) / Math.max(Number(r.target), 1)) * 100), 0) / rows.length)
    const latest = [...rows].sort((a, b) => b.week_start.localeCompare(a.week_start))[0]
    return { weeks: new Set(rows.map((r) => r.week_start)).size, avg: `${avg}%`, latest: latest.week_start, logged: rows.length }
  }, [rows])

  const saveMetric = async (event: React.FormEvent) => {
    event.preventDefault(); setError(''); setNotice('')
    const value = Number(draft.value); const target = Number(draft.target)
    if (!draft.metric.trim() || !Number.isFinite(value) || !Number.isFinite(target) || target <= 0) { setError('Enter a metric name with a valid value and a target greater than zero.'); return }
    setSaving(true)
    const supabase = createClient()
    const { error: insertError } = await supabase.from('client_progress').insert({ user_id: userId, metric: draft.metric.trim(), value, target, note: draft.note.trim() || null, week_start: draft.week_start })
    if (insertError) { setError('Could not save this metric. Check that setup_approval_system.sql has been run.'); setSaving(false); return }
    setNotice(`Saved ${draft.metric.trim()} for week of ${draft.week_start}.`)
    setDraft({ ...draft, value: '', target: '', note: '' })
    const { data: fresh } = await supabase.from('client_progress').select('id, metric, value, target, note, week_start').eq('user_id', userId).order('week_start', { ascending: true })
    setRows(fresh || [])
    setSaving(false)
  }

  if (loading) return <main className="progress-shell"><p className="eyebrow">Loading user dashboard…</p></main>

  if (!session) return <main className="dashboard-login"><a href="/admin/users" className="dashboard-back"><ArrowLeft size={16} /> Back to accounts</a><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><Shield size={30} /><p className="eyebrow">Admin access</p><h1>Sign in required.</h1><p>Sign in with an approved admin account to view this dashboard.</p><form onSubmit={signIn}><label>Email<input className="form-input" type="email" required autoComplete="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label><label>Password<input className="form-input" type="password" required autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{error && <p className="error-text">{error}</p>}<button className="button button-lime">Sign in</button></form></div></main>

  return <main className="dashboard">
    <header className="dashboard-header">
      <div><a href="/admin/users" className="brand"><span className="brand-mark">Y</span> TEAM YUVA</a><span className="dashboard-title">USER DASHBOARD</span></div>
      <div className="dashboard-header-actions"><a href="/admin/users" className="dashboard-logout">Accounts <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} /></a><ThemeToggle /></div>
    </header>
    <section className="dashboard-body">
      <div className="dashboard-top"><div><p className="eyebrow">Individual analytics</p><h1>{profile?.full_name || profile?.email?.split('@')[0] || 'User'}</h1></div><em className={`user-status user-status-${profile?.status || 'pending'}`}>{profile?.status || 'unknown'}</em></div>
      <p className="user-detail-line">{profile?.email}{profile?.is_reviewer ? ' · admin' : ' · client'} · joined {profile ? new Date(profile.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</p>
      <div className="kpi-grid">
        <Kpi label="Weekly average" value={kpis.avg} hint="value ÷ target across all check-ins" />
        <Kpi label="Weeks logged" value={kpis.weeks} hint="distinct week_start values" />
        <Kpi label="Check-in rows" value={kpis.logged} hint="stored in client_progress" />
        <Kpi label="Latest week" value={kpis.latest ? new Date(kpis.latest).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'} hint="most recent entry" />
      </div>
      <div className="analytics-panel">
        <div className="analytics-panel-head"><div><p className="eyebrow">Trend</p><h2>Performance by week</h2></div><Target size={18} /></div>
        <TrendChart points={trend} emptyNote="No check-ins yet. Use the form below to log this user's first metric." />
      </div>
      <div className="analytics-split">
        <form className="entry-form" onSubmit={saveMetric}>
          <div className="analytics-panel-head"><div><p className="eyebrow">Data entry</p><h2>Log a weekly metric</h2></div><Plus size={18} /></div>
          <label>Metric name<input className="form-input" required value={draft.metric} onChange={(e) => setDraft({ ...draft, metric: e.target.value })} placeholder="e.g. Training" /></label>
          <div className="entry-grid">
            <label>Value<input className="form-input" type="number" step="0.1" required value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} /></label>
            <label>Target<input className="form-input" type="number" step="0.1" required value={draft.target} onChange={(e) => setDraft({ ...draft, target: e.target.value })} /></label>
          </div>
          <label>Week of<input className="form-input" type="date" required value={draft.week_start} onChange={(e) => setDraft({ ...draft, week_start: e.target.value })} /></label>
          <label>Note <span>(optional)</span><input className="form-input" value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>
          {notice && <p className="success-text">{notice}</p>}
          {error && <p className="error-text">{error}</p>}
          <button className="button button-lime" disabled={saving}>{saving ? 'Saving…' : 'Save metric'} <Save size={15} /></button>
        </form>
        <div className="history-table">
          <div className="analytics-panel-head"><div><p className="eyebrow">History</p><h2>All check-ins ({rows.length})</h2></div></div>
          <div className="history-row history-head"><span>Week</span><span>Metric</span><span>Result</span></div>
          {rows.length === 0 ? <p className="empty">Nothing logged yet.</p> : [...rows].reverse().map((row) => {
            const pct = Math.min(150, Math.round((Number(row.value) / Math.max(Number(row.target), 1)) * 100))
            return <div className="history-row" key={row.id}><span>{new Date(row.week_start).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span><span><strong>{row.metric}</strong>{row.note && <small>{row.note}</small>}</span><span className={`history-pct ${pct >= 100 ? 'is-good' : pct >= 70 ? 'is-mid' : 'is-low'}`}>{pct}%<small>{row.value} / {row.target}</small></span></div>
          })}
        </div>
      </div>
    </section>
  </main>
}
