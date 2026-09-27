'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { Float, Environment, OrbitControls, Sphere, Torus } from '@react-three/drei'
import { ArrowDown, ArrowUpRight, Check, Camera, FileImage, Menu, Send, Sparkles, Upload, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { ThemeToggle } from '@/components/theme-toggle'
import { BrandLogo } from '@/components/logo'

function OrbitingCore({ viewportWidth }: { viewportWidth: number }) {
  const group = useMemo(() => ({ rotation: 0, scroll: 0 }), [])
  const target = useRef(0)
  useEffect(() => {
    const update = () => { target.current = window.scrollY / Math.max(document.body.scrollHeight - window.innerHeight, 1) }
    update()
    window.addEventListener('scroll', update, { passive: true })
    return () => window.removeEventListener('scroll', update)
  }, [])
  useFrame((_, delta) => {
    group.rotation += delta * (0.28 + group.scroll * 0.45)
    group.scroll += (target.current - group.scroll) * Math.min(delta * 4, 1)
  })

  // Responsive scale and position so the core fits mobile, tablet and desktop
  // without clipping, overflowing, or running over the hero text.
  const isMobile = viewportWidth < 700
  const isTablet = viewportWidth >= 700 && viewportWidth < 1024
  const baseScale = isMobile ? 0.32 : isTablet ? 0.4 : 0.48
  const posX = isMobile ? 0 : group.scroll * -0.7
  const posY = isMobile ? -0.2 : group.scroll * 0.35
  const posZ = isMobile ? -0.3 : group.scroll * -0.5

  return <group rotation={[0.2 + group.scroll * 1.15, group.scroll * 3.8, group.scroll * 0.4]} position={[posX, posY, posZ]} scale={baseScale + group.scroll * 0.08}>
    <Float speed={1.3 + group.scroll * 1.4} rotationIntensity={0.35 + group.scroll * 0.25} floatIntensity={0.7 + group.scroll * 0.35}>
      <mesh rotation={[0.4, group.rotation, 0.3]}>
        <icosahedronGeometry args={[1.5, 1]} />
        <meshStandardMaterial color="#c5ff3d" roughness={0.25} metalness={0.7} wireframe />
      </mesh>
      <Sphere args={[0.73, 32, 32]}>
        <meshStandardMaterial color="#f7f7f2" roughness={0.18} metalness={0.2} />
      </Sphere>
      <Torus args={[1.95, 0.018, 12, 96]} rotation={[Math.PI / 2, 0.2, 0]}>
        <meshStandardMaterial color="#c5ff3d" emissive="#789900" emissiveIntensity={0.8} />
      </Torus>
      <Torus args={[2.18, 0.012, 12, 96]} rotation={[0.35, Math.PI / 2, 0.8]}>
        <meshStandardMaterial color="#f7f7f2" transparent opacity={0.65} />
      </Torus>
    </Float>
  </group>
}

function HeroScene() {
  const [width, setWidth] = useState(1200)
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize, { passive: true })
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Camera pulls back on narrower viewports so the ball never clips its canvas.
  const cameraZ = width < 500 ? 7.2 : width < 800 ? 6.2 : 5.5
  return (
    <div className="hero-scene" aria-hidden="true">
      <Canvas camera={{ position: [0, 0, cameraZ], fov: 42 }} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={1.4} />
        <directionalLight position={[3, 4, 5]} intensity={3} color="#c5ff3d" />
        <OrbitingCore viewportWidth={width} />
        <Environment preset="studio" />
        <OrbitControls enableZoom={false} enablePan={false} autoRotate autoRotateSpeed={0.35} />
      </Canvas>
    </div>
  )
}

type FormState = { email: string; full_name: string; age: string; location: string; occupation: string; phone: string; height_cm: string; weight_kg: string; body_fat_pct: string; goals: string; concerns: string; consent: boolean }
const initialForm: FormState = { email: '', full_name: '', age: '', location: '', occupation: '', phone: '', height_cm: '', weight_kg: '', body_fat_pct: '', goals: '', concerns: '', consent: false }

function CommunitySection() {
  const [form, setForm] = useState({ name: '', email: '', question: '' })
  const [questions, setQuestions] = useState<{ id: string; name: string; question: string; answer: string | null }[]>([])
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  useEffect(() => {
    const supabase = createClient()
    if (!supabase) return
    supabase.from('community_questions').select('id, name, question, answer').not('answer', 'is', null).order('created_at', { ascending: false }).limit(4).then(({ data }) => setQuestions(data || []))
  }, [])
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const supabase = createClient()
    if (!supabase) { setStatus('error'); return }
    setStatus('sending')
    const { error } = await supabase.from('community_questions').insert(form)
    if (error) { setStatus('error'); return }
    setForm({ name: '', email: '', question: '' }); setStatus('done')
  }
  return <section className="community-section section" id="community"><div className="section-label"><span>04</span><span>Ask the team</span></div><div className="community-layout"><div><p className="eyebrow lime-text"><Sparkles size={15} /> Real answers, no noise</p><h2>Bring the<br /><em>question.</em></h2><p className="body-copy">Wondering how to start, what to eat, or whether coaching is right for you? Ask the team. We answer the questions that help you move with more clarity.</p><div className="question-list">{questions.length > 0 ? questions.map((item) => <article key={item.id}><p>&ldquo;{item.question}&rdquo;</p><small>{item.name} · BUM. reply</small><strong>{item.answer}</strong></article>) : <p className="empty">The team is preparing the first answers. Your question can be first.</p>}</div></div><form className="question-form" onSubmit={submit}><p className="eyebrow">Open channel</p><h3>What&apos;s on your mind?</h3><label>Your name<input className="form-input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label><label>Email address<input className="form-input" required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label><label>Your question<textarea className="form-input" required minLength={10} rows={5} value={form.question} onChange={(e) => setForm({ ...form, question: e.target.value })} /></label>{status === 'done' && <p className="success-text">Question received. The team will reply soon.</p>}{status === 'error' && <p className="error-text">We could not send that yet. Please try again.</p>}<button className="button button-lime" disabled={status === 'sending'}>{status === 'sending' ? 'Sending…' : 'Send question'} <Send size={16} /></button></form></div></section>
}

function ApplicationForm() {
  const [form, setForm] = useState(initialForm)
  const [files, setFiles] = useState<File[]>([])
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const update = (key: keyof FormState, value: string | boolean) => setForm((current) => ({ ...current, [key]: value }))
  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setStatus('sending'); setMessage('')
    const supabase = createClient()
    if (!supabase) { setStatus('error'); setMessage('Applications are temporarily unavailable. Please try again later.'); return }
    const applicationId = crypto.randomUUID()
    const { error } = await supabase.from('applications').insert({ id: applicationId, ...form, age: Number(form.age), height_cm: Number(form.height_cm), weight_kg: Number(form.weight_kg), body_fat_pct: form.body_fat_pct ? Number(form.body_fat_pct) : null })
    if (error) { setStatus('error'); setMessage('We could not save your application. Please check your details and try again.'); return }
    for (const file of files) {
      const path = `${applicationId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`
      const uploaded = await supabase.storage.from('application-images').upload(path, file)
      if (!uploaded.error) await supabase.from('application_images').insert({ application_id: applicationId, storage_path: path, original_name: file.name })
    }
    setStatus('done')
  }
  const inputClass = 'form-input'
  if (status === 'done') return <div className="success-card"><div className="success-icon"><Check /></div><p className="eyebrow">Application received</p><h3>You are on the right track.</h3><p>Thanks for trusting BUM. with your next chapter. Our coaching team will review your details and get in touch soon.</p><a className="button button-dark" href="#top">Back to top <ArrowUpRight size={16} /></a></div>
  return <form className="application-form" onSubmit={submit}>
    <div className="form-heading"><p className="eyebrow">The first step</p><h3>Tell us where you&apos;re starting.</h3><p>Be honest, be specific. Better inputs create better coaching.</p></div>
    <div className="form-grid"><label>Email address<input className={inputClass} required type="email" value={form.email} onChange={(e) => update('email', e.target.value)} /></label><label>Full name<input className={inputClass} required value={form.full_name} onChange={(e) => update('full_name', e.target.value)} /></label><label>Age<input className={inputClass} required type="number" min="13" max="100" value={form.age} onChange={(e) => update('age', e.target.value)} /></label><label>Location<input className={inputClass} required value={form.location} onChange={(e) => update('location', e.target.value)} /></label><label>Occupation<input className={inputClass} required value={form.occupation} onChange={(e) => update('occupation', e.target.value)} /></label><label>Contact number<input className={inputClass} required type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)} /></label><label>Height <span>(cm)</span><input className={inputClass} required type="number" value={form.height_cm} onChange={(e) => update('height_cm', e.target.value)} /></label><label>Weight <span>(kg)</span><input className={inputClass} required type="number" value={form.weight_kg} onChange={(e) => update('weight_kg', e.target.value)} /></label><label>Body fat <span>(optional)</span><input className={inputClass} type="number" value={form.body_fat_pct} onChange={(e) => update('body_fat_pct', e.target.value)} /></label></div>
    <label>What are your goals?<textarea className={inputClass} required rows={4} value={form.goals} onChange={(e) => update('goals', e.target.value)} /></label><label>Any concerns? <span>(optional)</span><textarea className={inputClass} rows={3} value={form.concerns} onChange={(e) => update('concerns', e.target.value)} /></label>
    <label className="upload-box"><input type="file" accept="image/*" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))} /><Upload size={20} /><strong>Upload progress pictures</strong><span>Shirtless / swimwear / gymwear · up to 5 images, 10 MB each</span>{files.length > 0 && <small><FileImage size={14} /> {files.length} file{files.length > 1 ? 's' : ''} selected</small>}</label>
    <label className="consent"><input type="checkbox" required checked={form.consent} onChange={(e) => update('consent', e.target.checked)} /><span>I confirm these details are accurate and consent to BUM. using them to assess my coaching application.</span></label>
    {status === 'error' && <p className="error-text">{message}</p>}<button className="button button-lime" disabled={status === 'sending'}>{status === 'sending' ? 'Submitting…' : 'Submit application'} <ArrowUpRight size={17} /></button>
  </form>
}

export default function Page() {
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [active, setActive] = useState('top')

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const sections = ['method', 'experience', 'application', 'faq'].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[]
    if (sections.length === 0) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id)
    }, { rootMargin: '-40% 0px -55% 0px' })
    sections.forEach((section) => observer.observe(section))
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const links = [
    { href: '#method', label: 'Method', id: 'method' },
    { href: '#experience', label: 'Experience', id: 'experience' },
    { href: '#application', label: 'Apply', id: 'application' },
    { href: '#faq', label: 'FAQ', id: 'faq' },
  ]
  return <main className="home" id="top">
    <nav className={`site-nav${scrolled ? ' is-scrolled' : ''}`} aria-label="Primary">
      <a className="brand" href="#top" onClick={() => { setActive('top'); setMenuOpen(false) }}><BrandLogo /></a>
      <div className={`nav-links ${menuOpen ? 'is-open' : ''}`}>
        {links.map((link) => <a key={link.id} href={link.href} className={active === link.id ? 'is-active' : ''} onClick={() => { setActive(link.id); setMenuOpen(false) }}>{link.label}</a>)}
        <a href="/progress" onClick={() => setMenuOpen(false)}>Client progress</a>
        <a className="nav-admin" href="/dashboard" onClick={() => setMenuOpen(false)}>Reviewer login <ArrowUpRight size={14} /></a>
        <ThemeToggle className="nav-theme" />
        <a className="nav-cta" href="#application" onClick={() => setMenuOpen(false)}>Start application</a>
      </div>
      <button className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? 'Close menu' : 'Open menu'} aria-expanded={menuOpen}>{menuOpen ? <X /> : <Menu />}</button>
    </nav>
    <section className="hero"><div className="hero-copy"><p className="eyebrow lime-text"><Sparkles size={15} /> PERSONAL COACHING, RE-IMAGINED</p><h1>Your body.<br /><em>Your edge.</em></h1><p className="hero-lede">BUM. is a disciplined, human-first system for building a body and mindset that can keep up with the life you want.</p><div className="hero-actions"><a className="button button-lime" href="#application">Start your application <ArrowDown size={17} /></a><a className="text-link" href="#method">See how we work <ArrowDown size={15} /></a></div></div><HeroScene /><div className="hero-note">01 / 04<br /><span>Built for the long game</span></div></section>
    <section className="ticker" aria-label="BUM. principles"><div className="ticker-track"><span>DISCIPLINE</span><span>CLARITY</span><span>CONSISTENCY</span><span>SELF-RESPECT</span><span>DISCIPLINE</span><span aria-hidden="true">DISCIPLINE</span><span aria-hidden="true">CLARITY</span><span aria-hidden="true">CONSISTENCY</span><span aria-hidden="true">SELF-RESPECT</span><span aria-hidden="true">DISCIPLINE</span></div></section>
    <section className="manifesto section" id="method"><div className="section-label"><span>01</span><span>Our method</span></div><div className="manifesto-content"><p className="eyebrow">More than a workout plan</p><h2>The strongest version of you is built in the details.</h2><p className="body-copy">No shortcuts. No noise. Just considered training, practical nutrition and the accountability to keep showing up. We meet you where you are, then build forward.</p><div className="principles"><div><b>01</b><h3>Assess deeply</h3><p>We start with context, not assumptions. Your schedule, your story, your goals.</p></div><div><b>02</b><h3>Build simply</h3><p>Clear systems you can repeat until progress becomes part of your identity.</p></div><div><b>03</b><h3>Stay accountable</h3><p>Real coaching, real feedback, and a team that notices when you disappear.</p></div></div></div></section>
    <section className="quote-section"><img className="quote-art" src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/WhatsApp%20Image%202026-09-13%20at%205.11.45%20PM-XkUaQMGr6jESRCDLUqKPsWIwNmkOmx.jpeg" alt="Graphite illustration of a bodybuilder" /><div className="quote-overlay" /><div className="quote-mark">“</div><blockquote>Don&apos;t chase motivation.<br /><span>Build evidence.</span></blockquote><p>— BUM. PRINCIPLE</p></section>
    <section className="cycle-section section" id="experience"><div className="section-label"><span>02</span><span>The BUM. cycle</span></div><div className="cycle-intro"><p className="eyebrow">Progress with a pulse</p><h2>Small moves.<br /><em>Compounded.</em></h2><p className="body-copy">Your plan should move with your life. We turn the messy middle into a repeatable rhythm that gets stronger every week.</p></div><div className="cycle-grid"><div className="cycle-card"><span>01</span><h3>Observe</h3><p>We look at your real routines, energy and environment before prescribing a single change.</p></div><div className="cycle-card cycle-card-dark"><span>02</span><h3>Adjust</h3><p>Training and nutrition flex around the week you actually have, not an imaginary perfect one.</p></div><div className="cycle-card"><span>03</span><h3>Repeat</h3><p>Simple wins become proof. Proof becomes confidence. Confidence becomes your new baseline.</p></div></div></section>
    <section className="experience-section"><div className="experience-copy"><p className="eyebrow lime-text">What coaching feels like</p><h2>A clearer head.<br />A stronger <em>standard.</em></h2><p>Weekly check-ins, intentional programming and a coach who knows when to push, when to simplify and when to listen.</p><a className="text-link" href="#application">Meet your next standard <ArrowDown size={15} /></a></div><div className="experience-stat"><strong>52</strong><span>weeks of<br />showing up</span></div></section>
    <section className="application-section section" id="application"><div className="section-label"><span>02</span><span>Apply to BUM.</span></div><div className="application-layout"><div className="application-intro"><p className="eyebrow">Ready when you are</p><h2>Make the decision<br /><em>real.</em></h2><p>Applications take 5 minutes. The next version of your life deserves that much attention.</p><div className="application-points"><span><Check size={15} /> No account required</span><span><Check size={15} /> Personal review</span><span><Check size={15} /> 100% confidential</span></div></div><ApplicationForm /></div></section>
    <section className="faq-section section" id="faq"><div className="section-label"><span>03</span><span>Good to know</span></div><div className="faq-content"><h2>Questions before<br /><em>you begin?</em></h2><details open><summary>Who is BUM. for?</summary><p>People who are ready to stop restarting. Whether you are brand new to training or experienced but stuck, we build from your actual starting point.</p></details><details><summary>What happens after I apply?</summary><p>A member of our coaching team reviews your application. If we are a good fit, we will contact you to talk through your goals and the next step.</p></details><details><summary>Do I need to be “fit” already?</summary><p>Not at all. Your current fitness is information, not a prerequisite.</p></details></div></section>
    <CommunitySection />
    <footer><div className="brand"><BrandLogo /></div><p>Build the body. Keep the promise.</p><a href="https://instagram.com" aria-label="Instagram"><Camera size={18} /></a><small>© 2026 BUM.. All rights reserved.</small></footer>
  </main>
}
