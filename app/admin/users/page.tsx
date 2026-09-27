'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Shield, UserCheck, Users, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'

type Profile = { id: string; email: string; full_name: string | null; status: string; is_reviewer: boolean; created_at: string; approved_at: string | null }
type Filter = 'pending' | 'approved' | 'all'

export default function AdminUsersPage() {
  const [session, setSession] = useState(false)
  const [login, setLogin] = useState({ email: '', password: '' })
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [filter, setFilter] = useState<Filter>('pending')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [migrationNeeded, setMigrationNeeded] = useState(false)

  const load = async () => {
    const supabase = createClient()
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }
    if (user.app_metadata?.role !== 'reviewer') { setError('This account is not authorized as an admin.'); setLoading(false); return }
    setSession(true)
    const { data, error: fetchError } = await supabase.from('user_profiles').select('id, email, full_name, status, is_reviewer, created_at, approved_at').order('created_at', { ascending: false })
    if (fetchError) {
      if (fetchError.code === 'PGRST205' || (fetchError.message || '').includes('user_profiles')) { setMigrationNeeded(true); setError(''); setLoading(false); return }
      setError('Could not load user profiles.')
    } else setProfiles(data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setStatus = async (id: string, status: 'approved' | 'rejected' | 'suspended') => {
    const supabase = createClient()
    setBusyId(id)
    const { data: { user } } = await supabase.auth.getUser()
    const { data, error: updateError } = await supabase.from('user_profiles')
      .update({ status, approved_at: status === 'approved' ? new Date().toISOString() : null, approved_by: status === 'approved' ? user?.id ?? null : null })
      .eq('id', id)
      .select('id, email, full_name, status, is_reviewer, created_at, approved_at')
    if (updateError || !data?.length) setError('Could not update this account.')
    else { setError(''); setProfiles((items) => items.map((p) => (p.id === id ? data[0] : p))) }
    setBusyId(null)
  }

  const signIn = async (event: React.FormEvent) => {
    event.preventDefault(); setError('')
    const supabase = createClient()
    const { error: authError } = await supabase.auth.signInWithPassword(login)
    if (authError) setError('Invalid email or password.')
    else load()
  }

  const pending = profiles.filter((p) => p.status === 'pending')
  const visible = filter === 'all' ? profiles : profiles.filter((p) => p.status === filter)

  if (loading) return <main className="progress-shell"><p className="eyebrow">Loading accounts…</p></main>

  if (!session) return <main className="dashboard-login"><a href="/admin" className="dashboard-back"><ArrowLeft size={16} /> Back to admin</a><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><Shield size={30} /><p className="eyebrow">Admin access</p><h1>Approve accounts.</h1><p>Sign in with an approved admin account.</p><form onSubmit={signIn}><label>Email<input className="form-input" type="email" required autoComplete="email" value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label><label>Password<input className="form-input" type="password" required autoComplete="current-password" value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{error && <p className="error-text">{error}</p>}<button className="button button-lime">Sign in</button></form></div></main>

  if (migrationNeeded) return <main className="progress-shell"><header className="progress-header"><a href="/admin" className="brand"><span className="brand-mark">Y</span> TEAM YUVA</a><div className="progress-actions"><ThemeToggle /></div></header><section className="progress-content"><div className="approval-empty"><Shield size={30} /><p className="eyebrow">Setup required</p><h1>Approval tables missing.</h1><p>Run <code>setup_approval_system.sql</code> in the Supabase SQL editor, then reload this page.</p></div></section></main>

  return <main className="dashboard">
    <header className="dashboard-header">
      <div><a href="/admin" className="brand"><span className="brand-mark">Y</span> TEAM YUVA</a><span className="dashboard-title">USER APPROVALS</span></div>
      <div className="dashboard-header-actions"><a href="/admin/content" className="dashboard-logout">Content studio <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} /></a><ThemeToggle /></div>
    </header>
    <section className="dashboard-body">
      <div className="dashboard-top"><div><p className="eyebrow">Accounts</p><h1>{pending.length > 0 ? `${pending.length} waiting for approval.` : 'Everyone is approved.'}</h1></div><div className="dashboard-count">{profiles.length.toString().padStart(2, '0')} <span>total</span></div></div>
      <div className="dashboard-tools">
        <div className="approval-hint"><Users size={15} /> New sign-ups land here automatically.</div>
        <div className="filter-tabs">{(['pending', 'approved', 'all'] as Filter[]).map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}{item === 'pending' && pending.length > 0 ? ` (${pending.length})` : ''}</button>)}</div>
      </div>
      {error && <p className="error-text approval-error">{error}</p>}
      <div className="user-table">
        <div className="table-head"><span>Account</span><span>Joined</span><span>Status</span><span>Actions</span></div>
        {visible.length === 0 ? <p className="empty">No accounts in this view.</p> : visible.map((p) => (
          <div className="user-row" key={p.id}>
            <span><strong>{p.full_name || p.email.split('@')[0]}</strong><small>{p.email}</small></span>
            <span>{new Date(p.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}<small>{p.is_reviewer ? 'admin' : 'client'}</small></span>
            <span><em className={`user-status user-status-${p.status}`}>{p.status}</em></span>
            <span className="user-actions">
              {p.status === 'pending' ? <>
                <button className="user-approve" disabled={busyId === p.id} onClick={() => setStatus(p.id, 'approved')}><UserCheck size={13} /> Approve</button>
                <button className="user-reject" disabled={busyId === p.id} onClick={() => setStatus(p.id, 'rejected')}><X size={13} /> Reject</button>
              </> : p.status === 'approved' ? <>
                <a className="user-view" href={`/admin/users/${p.id}`}>Dashboard</a>
                <button className="user-reject" disabled={busyId === p.id} onClick={() => setStatus(p.id, 'suspended')}><X size={13} /> Suspend</button>
              </> : <button className="user-approve" disabled={busyId === p.id} onClick={() => setStatus(p.id, 'approved')}><Check size={13} /> Restore</button>}
            </span>
          </div>
        ))}
      </div>
      <p className="approval-note">Approved accounts can sign in at <a href="/progress">/progress</a>. Open <strong>Dashboard</strong> on an approved account to see that user&apos;s individual analytical dashboard and log their weekly metrics.</p>
    </section>
  </main>
}
