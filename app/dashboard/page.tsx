'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check, Download, FileImage, LogOut, Search, Shield, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'
import { checkReviewer, explainEmptyBoard, reviewerReasonCopy, type ReviewerDenied } from '@/lib/reviewer'
import { ReviewerGate } from '@/components/reviewer-gate'

type Application = { id: string; full_name: string; email: string; age: number; location: string; occupation: string; phone: string; height_cm: number; weight_kg: number; body_fat_pct: number | null; goals: string; concerns: string | null; status: string; reviewer_notes: string | null; created_at: string }
type AppPhoto = { id: string; original_name: string | null; storage_path: string; signedUrl?: string | null }
const statuses = ['new', 'reviewing', 'accepted', 'rejected']

export default function DashboardPage() {
  const [session, setSession] = useState(false)
  const [login, setLogin] = useState({ email: '', password: '' })
  const [apps, setApps] = useState<Application[]>([])
  const [selected, setSelected] = useState<Application | null>(null)
  const [photos, setPhotos] = useState<AppPhoto[]>([])
  const [loadingPhotos, setLoadingPhotos] = useState(false)
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [gate, setGate] = useState<ReviewerDenied | null>(null)
  const [diag, setDiag] = useState('')

  const load = async (explainSignedOut = false) => {
    setLoading(true)
    const check = await checkReviewer()
    if (!check.ok) {
      // Say exactly why access was refused instead of silently returning to the login form.
      if (check.reason !== 'signed-out' || explainSignedOut) setGate(check)
      else setError(reviewerReasonCopy(check))
      setLoading(false)
      return
    }
    setGate(null); setError(''); setSession(true)
    const supabase = createClient()
    const { data, error: fetchError } = await supabase.from('applications').select('id, full_name, email, age, location, occupation, phone, height_cm, weight_kg, body_fat_pct, goals, concerns, status, reviewer_notes, created_at').order('created_at', { ascending: false })
    if (fetchError) { setError('Signed in as ' + check.email + ', but reading applications failed: ' + fetchError.message); setDiag('') }
    else {
      const fetched = data || []
      setApps(fetched)
      // Zero rows is not proof of an empty table: a missing SELECT policy also
      // answers 200 with `[]`, so ask the database which of the two it is.
      setDiag(fetched.length === 0 ? await explainEmptyBoard() : '')
    }
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // When a reviewer opens an application, pull its linked photo records from
  // `application_images` and generate signed download URLs from the private
  // `application-images` storage bucket.
  useEffect(() => {
    if (!selected) { setPhotos([]); return }
    let cancelled = false
    const fetchPhotos = async () => {
      setLoadingPhotos(true)
      const supabase = createClient()
      const { data: rows } = await supabase.from('application_images').select('id, original_name, storage_path').eq('application_id', selected.id)
      if (cancelled) return
      if (!rows || rows.length === 0) { setPhotos([]); setLoadingPhotos(false); return }
      const withUrls = await Promise.all(rows.map(async (p) => {
        const { data: signed } = await supabase.storage.from('application-images').createSignedUrl(p.storage_path, 60 * 30)
        return { ...p, signedUrl: signed?.signedUrl ?? null }
      }))
      if (!cancelled) { setPhotos(withUrls); setLoadingPhotos(false) }
    }
    fetchPhotos()
    return () => { cancelled = true }
  }, [selected])

  const signIn = async (event: React.FormEvent) => {
    const supabase = createClient()
    event.preventDefault(); setError('')
    const { error: authError } = await supabase.auth.signInWithPassword(login)
    if (authError) setError('Could not sign in: ' + authError.message)
    else load(true)
  }
  const signOut = async () => { const supabase = createClient(); await supabase.auth.signOut(); setSession(false); setApps([]); setSelected(null) }
  const update = async (status: string, notes: string) => { const supabase = createClient(); if (!selected) return; const { data, error: updateError } = await supabase.from('applications').update({ status, reviewer_notes: notes, updated_at: new Date().toISOString() }).eq('id', selected.id).select('id'); if (updateError || !data?.length) { setError('Could not update this application.'); return } const next = { ...selected, status, reviewer_notes: notes }; setApps((items) => items.map((item) => item.id === selected.id ? next : item)); setSelected(next) }
  const visible = apps.filter((app) => (filter === 'all' || app.status === filter) && `${app.full_name} ${app.email} ${app.location}`.toLowerCase().includes(query.toLowerCase()))
  if (gate) return <ReviewerGate check={gate} area="Reviewer desk" onRetry={() => load(true)} />

  if (!session && !loading) return <main className="dashboard-login"><a href="/" className="dashboard-back"><ArrowLeft size={16} /> Back to Team Yuva</a><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><Shield size={30} /><p className="eyebrow">Private workspace</p><h1>Reviewer login</h1><p>Access is limited to approved Team Yuva reviewers.</p><form onSubmit={signIn}><label>Email<input className="form-input" type="email" required value={login.email} onChange={(e) => setLogin({ ...login, email: e.target.value })} /></label><label>Password<input className="form-input" type="password" required value={login.password} onChange={(e) => setLogin({ ...login, password: e.target.value })} /></label>{error && <p className="error-text">{error}</p>}<button className="button button-lime">Sign in</button></form></div></main>
  return <main className="dashboard">
    <header className="dashboard-header">
      <div><a href="/" className="brand"><span className="brand-mark">Y</span> TEAM YUVA</a><span className="dashboard-title">REVIEWER DESK</span></div>
      <div className="dashboard-header-actions"><a href="/admin/content" className="dashboard-logout">Content studio <ArrowLeft size={14} style={{ transform: 'rotate(180deg)' }} /></a><ThemeToggle /><button className="dashboard-logout" onClick={signOut}><LogOut size={16} /> Sign out</button></div>
    </header>
    <section className="dashboard-body">
      <div className="dashboard-top"><div><p className="eyebrow">Applications</p><h1>People ready to begin.</h1></div><div className="dashboard-count">{apps.length.toString().padStart(2, '0')} <span>total</span></div></div>
      <div className="dashboard-tools">
        <div className="search"><Search size={16} /><input placeholder="Search applicants" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="filter-tabs">{['all', ...statuses].map((item) => <button key={item} className={filter === item ? 'active' : ''} onClick={() => setFilter(item)}>{item}</button>)}</div>
      </div>
      <div className="application-table">
        <div className="table-head"><span>Applicant</span><span>Details</span><span>Applied</span><span>Status</span></div>
        {loading ? <p className="empty">Loading applications…</p> : visible.length === 0 ? <p className="empty">{diag || 'No applications match this view.'}</p> : visible.map((app) => <button className="table-row" key={app.id} onClick={() => setSelected(app)}><span><strong>{app.full_name}</strong><small>{app.email}</small></span><span>{app.location}<small>{app.occupation}</small></span><span>{new Date(app.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</span><span className={`status status-${app.status}`}>{app.status}</span></button>)}
      </div>
    </section>
    {selected && <div className="review-overlay" role="dialog" aria-modal="true">
      <div className="review-panel">
        <button className="close-review" onClick={() => setSelected(null)} aria-label="Close"><X /></button>
        <p className="eyebrow">Application review</p>
        <h2>{selected.full_name}</h2>
        <p className="review-meta">{selected.email} · {selected.phone} · {selected.age} years · {selected.location}</p>
        <div className="review-grid">
          <div><span>Occupation</span><strong>{selected.occupation}</strong></div>
          <div><span>Body metrics</span><strong>{selected.height_cm} cm / {selected.weight_kg} kg {selected.body_fat_pct ? ` / ${selected.body_fat_pct}% fat` : ''}</strong></div>
        </div>
        <div className="review-copy">
          <span>Goals</span><p>{selected.goals}</p>
          {selected.concerns && <><span>Concerns</span><p>{selected.concerns}</p></>}
        </div>
        <div className="review-photos">
          <span className="review-photos-label"><FileImage size={13} /> Uploaded photos ({loadingPhotos ? 'loading…' : photos.length})</span>
          {loadingPhotos ? <p className="review-photos-empty">Retrieving photos from private storage…</p> : photos.length === 0 ? <p className="review-photos-empty">No photos uploaded with this application.</p> : <div className="review-photos-grid">
            {photos.map((p, idx) => (
              <figure key={p.id} className="review-photo-item">
                {p.signedUrl ? (
                  <a href={p.signedUrl} target="_blank" rel="noopener noreferrer" title="Open full-size in new tab">
                    <img src={p.signedUrl} alt={p.original_name || `Photo ${idx + 1}`} />
                  </a>
                ) : <div className="review-photo-placeholder"><FileImage size={24} /><span>Signed URL expired</span></div>}
                <figcaption>
                  <span>{p.original_name || `Photo ${idx + 1}`}</span>
                  {p.signedUrl && <a href={p.signedUrl} download={p.original_name || 'photo'} title="Download photo"><Download size={13} /></a>}
                </figcaption>
              </figure>
            ))}
          </div>}
        </div>
        <label className="notes-label">Reviewer notes<textarea className="form-input" rows={4} defaultValue={selected.reviewer_notes || ''} id="review-notes" /></label>
        <div className="review-actions">
          {statuses.map((status) => <button key={status} className={`review-status status-${status}`} onClick={() => update(status, (document.getElementById('review-notes') as HTMLTextAreaElement)?.value || '')}>{status === selected.status && <Check size={14} />}{status}</button>)}
        </div>
      </div>
    </div>}
  </main>
}
