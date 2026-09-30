'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Save, Shield } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'
import { checkReviewer, reviewerReasonCopy, type ReviewerDenied } from '@/lib/reviewer'
import { ReviewerGate } from '@/components/reviewer-gate'

type Content = { id: string; content_key: string; title: string | null; body: string | null }

export default function ContentAdminPage() {
  const [items, setItems] = useState<Content[]>([])
  const [active, setActive] = useState<Content | null>(null)
  const [login, setLogin] = useState({ email: '', password: '' })
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [gate, setGate] = useState<ReviewerDenied | null>(null)

  useEffect(() => { const boot = async () => { const supabase = createClient(); const check = await checkReviewer(); if (!check.ok) { if (check.reason !== 'signed-out') setGate(check); else setMessage(reviewerReasonCopy(check)); setLoading(false); return } setGate(null); const { data, error } = await supabase.from('site_content').select('id, content_key, title, body').order('content_key'); if (error) setMessage('Could not load the content rows: ' + error.message); setItems(data || []); setAuthorized(Boolean(data)); setLoading(false) }; boot() }, [])
  const signIn = async (event: React.FormEvent) => { event.preventDefault(); const supabase = createClient(); const { error } = await supabase.auth.signInWithPassword(login); if (error) setMessage('Could not sign in: ' + error.message); else window.location.reload() }
  const save = async () => { if (!active) return; const supabase = createClient(); const { data, error } = await supabase.from('site_content').update({ title: active.title, body: active.body, updated_at: new Date().toISOString() }).eq('id', active.id).select('id'); const saved = !error && Boolean(data?.length); setMessage(saved ? 'Saved. The public story is updated.' : 'Only approved reviewers can edit content.'); if (saved) setItems(items.map((item) => item.id === active.id ? active : item)) }

  if (loading) return <main className="progress-shell"><p className="eyebrow">Loading content studio…</p></main>
  if (gate) return <ReviewerGate check={gate} area="Content studio" onRetry={() => window.location.reload()} />

  if (!authorized) return <main className="progress-login"><ThemeToggle className="auth-theme" /><a href="/dashboard" className="dashboard-back"><ArrowLeft size={16} /> Back to reviewer desk</a><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><Shield size={30} /><p className="eyebrow">Content studio</p><h1>Shape the story.</h1><p>Edit the words your clients see without touching code.</p><form onSubmit={signIn}><label>Email<input className="form-input" type="email" required value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label><label>Password<input className="form-input" type="password" required value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{message && <p className="error-text">{message}</p>}<button className="button button-lime">Open content studio</button></form></div></main>

  return <main className="cms-shell"><header className="dashboard-header"><div><a href="/" className="brand"><span className="brand-mark">Y</span> TEAM YUVA</a><span className="dashboard-title">CONTENT STUDIO</span></div><div className="dashboard-header-actions"><ThemeToggle /><a href="/dashboard" className="dashboard-logout">Reviewer desk <ArrowLeft size={15} /></a></div></header><section className="cms-body"><div className="cms-heading"><div><p className="eyebrow">Owner tools</p><h1>Make the story yours.</h1><p>Update the public voice, one section at a time.</p></div><span className="cms-live"><Check size={14} /> Live content</span></div><div className="cms-layout"><aside className="cms-nav">{items.map((item) => <button key={item.id} className={active?.id === item.id ? 'active' : ''} onClick={() => { setActive(item); setMessage('') }}>{item.content_key}</button>)}</aside><section className="cms-editor">{active ? <><div className="editor-top"><div><p className="eyebrow">Editing section</p><h2>{active.content_key}</h2></div><button className="button button-lime" onClick={save}><Save size={16} /> Save changes</button></div><label>Section title<input className="form-input" value={active.title || ''} onChange={(e) => setActive({ ...active, title: e.target.value })} /></label><label>Body copy<textarea className="form-input" rows={8} value={active.body || ''} onChange={(e) => setActive({ ...active, body: e.target.value })} /></label>{message && <p className="cms-message">{message}</p>}</> : <div className="cms-empty"><p className="eyebrow">Select a section</p><h2>Your content, in your voice.</h2><p>Choose a section from the left to start editing.</p></div>}</section></div></section></main>
}
