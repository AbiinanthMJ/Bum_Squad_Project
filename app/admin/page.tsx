import { ArrowUpRight, Shield } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

export const metadata = { title: 'Admin — Team Yuva' }

// Admin entry point: applications live on the reviewer desk (/dashboard),
// site copy in the content studio (/admin/content). Both read/write Supabase.
export default function AdminPage() {
  return <main className="progress-login"><ThemeToggle className="auth-theme" /><div className="login-panel"><div className="brand"><span className="brand-mark">Y</span> TEAM YUVA</div><Shield size={30} /><p className="eyebrow">Owner tools</p><h1>Admin.</h1><p>Approvals, applications and site content are behind the reviewer login.</p><div className="admin-links"><a className="button button-lime" href="/admin/users">Approve new users <ArrowUpRight size={16} /></a><a className="button button-outline" href="/dashboard">View applications <ArrowUpRight size={16} /></a><a className="button button-outline" href="/admin/content">Content studio <ArrowUpRight size={16} /></a></div></div></main>
}
