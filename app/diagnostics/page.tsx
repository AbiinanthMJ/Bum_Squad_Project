'use client'

import { useEffect, useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { createClient } from '@/lib/supabase/client'

// Why this page exists: when rows are visible in the Supabase Table Editor but
// nothing shows up in the app, the cause is one of four things that all look
// identical ("empty") in the UI:
//   1. no session in this browser,
//   2. a session without the reviewer role in app_metadata,
//   3. a missing RLS SELECT policy - PostgREST answers 200 with an empty list,
//   4. a missing storage bucket for photos.
// This page prints the raw answer to each check so nobody has to guess.

type Line = { status: 'OK' | 'FAIL' | 'INFO'; text: string }

export default function DiagnosticsPage() {
  const [lines, setLines] = useState<Line[]>([])
  const [verdict, setVerdict] = useState('Running checks…')

  useEffect(() => {
    const run = async () => {
      const out: Line[] = []
      const add = (status: Line['status'], text: string) => out.push({ status, text })
      const supabase = createClient()
      const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

      // 1. Is there a session, and what does its token say?
      const { data: userData, error: userError } = await supabase.auth.getUser()
      const user = userData?.user
      if (!user) add('FAIL', 'session: none - no Supabase user in this browser' + (userError ? ' (' + userError.message + ')' : ''))
      else {
        add('OK', 'session: ' + (user.email || user.id))
        const role = (user.app_metadata as { role?: string } | undefined)?.role
        add(role === 'reviewer' ? 'OK' : 'FAIL', 'app_metadata.role: ' + (role || '(missing)') + (role === 'reviewer' ? '' : ' - promote this account to see /dashboard'))
      }

      // 2. Does the database agree that this token is a reviewer? This runs the
      //    same function the RLS policies call.
      let reviewerFn = false
      const rpc = await supabase.rpc('is_reviewer')
      if (rpc.error) add('FAIL', 'is_reviewer(): ' + rpc.error.message)
      else { reviewerFn = rpc.data === true; add(reviewerFn ? 'OK' : 'FAIL', 'is_reviewer(): ' + String(rpc.data)) }

      // 3. What can this token actually read? Counts are RLS-filtered, so a 0
      //    here with a reviewer role means the SELECT policy is missing.
      let appCount = 0
      for (const table of ['applications', 'application_images', 'user_profiles', 'site_content', 'client_progress']) {
        const { count, error } = await supabase.from(table).select('id', { count: 'exact', head: true })
        if (error) add('FAIL', 'read ' + table + ': ' + error.message)
        else { add(count ? 'OK' : 'INFO', 'read ' + table + ': ' + count + ' row(s) visible to this token'); if (table === 'applications') appCount = count || 0 }
      }

      // 4. Storage bucket (bucket metadata is readable with the public key).
      if (url && key) {
        try {
          const res = await fetch(url + '/storage/v1/bucket/application-images', { headers: { apikey: key, Authorization: 'Bearer ' + key } })
          add(res.ok ? 'OK' : 'FAIL', 'bucket application-images: HTTP ' + res.status + (res.ok ? '' : ' - run sql/supabase_verify.sql section 6'))
        } catch (error) {
          add('FAIL', 'bucket application-images: ' + (error instanceof Error ? error.message : String(error)))
        }
      }

      setLines(out)
      if (!user) setVerdict('No session here. Sign in at /dashboard, then reload this page.')
      else if ((user.app_metadata as { role?: string } | undefined)?.role !== 'reviewer') setVerdict('Gate closed: this account has no reviewer role. Run the promotion SQL that /dashboard shows, then reload.')
      else if (!reviewerFn) setVerdict('Gate closed: the token says reviewer but is_reviewer() disagrees - the token is stale. Sign out and back in at /dashboard.')
      else if (appCount === 0) setVerdict('Gate closed: role is valid but reading `applications` returned 0 rows, so the SELECT policy is missing. Run sql/supabase_verify.sql section 8.')
      else setVerdict('All gates open: this token can read ' + appCount + ' application row(s), so /dashboard should list them.')
    }
    run().catch((error: unknown) => setVerdict('Diagnostics crashed: ' + (error instanceof Error ? error.message : String(error))))
  }, [])

  return <main className="progress-shell">
    <header className="progress-header"><a href="/" className="brand"><span className="brand-mark">Y</span> TEAM YUVA</a><div className="progress-actions"><a href="/dashboard" className="dashboard-logout">Reviewer desk</a><ThemeToggle /></div></header>
    <section className="progress-content">
      <p className="eyebrow">Support</p>
      <h1>Connection diagnostics.</h1>
      <p className="eyebrow">{verdict}</p>
      <pre>{lines.map((line) => '[' + line.status.padEnd(4) + '] ' + line.text).join('\n') || 'Running checks…'}</pre>
    </section>
  </main>
}
