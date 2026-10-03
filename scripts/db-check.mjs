#!/usr/bin/env node
// Supabase readiness check for this project.  Usage: pnpm db:check
// Reads .env.local, then makes read-only requests. Nothing is ever written:
// the INSERT probe sends a deliberately invalid uuid, so Postgres aborts on the
// type cast before a row exists - it only reveals whether RLS would allow it.

import fs from 'node:fs'
import path from 'node:path'

const envFile = path.join(process.cwd(), '.env.local')

function readEnv(file) {
  if (!fs.existsSync(file)) return {}
  const out = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const name = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    out[name] = value
  }
  return out
}

const env = { ...readEnv(envFile), ...process.env }
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!url || !key) {
  console.error('[FAIL] .env.local needs NEXT_PUBLIC_SUPABASE_URL plus NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY).')
  process.exit(1)
}

const headers = { apikey: key, Authorization: 'Bearer ' + key }
const rows = []
let failures = 0
function add(status, area, detail) {
  if (status === 'FAIL') failures += 1
  rows.push({ status, area, detail })
}

async function call(pathname, init = {}) {
  try {
    const res = await fetch(url + pathname, { ...init, headers: { ...headers, ...(init.headers || {}) }, cache: 'no-store' })
    const text = await res.text()
    return { status: res.status, text }
  } catch (error) {
    return { status: 0, text: String(error && error.message) }
  }
}

const tables = ['community_questions', 'applications', 'application_images', 'client_progress', 'site_content', 'user_profiles']

async function main() {
  add('INFO', 'project', url.replace(/^https:\/\//, '').replace(/\.supabase\.co$/, '') + '.supabase.co')
  add(key.startsWith('sb_publishable_') ? 'OK' : 'INFO', 'client key', key.startsWith('sb_publishable_') ? 'publishable key' : 'legacy anon JWT')

  const health = await call('/auth/v1/health')
  add(health.status === 200 ? 'OK' : 'FAIL', 'auth reachable', 'HTTP ' + health.status)

  for (const table of tables) {
    const res = await call('/rest/v1/' + table + '?select=id&limit=1')
    if (res.status === 200) add('OK', 'table ' + table, 'exists')
    else add('FAIL', 'table ' + table, 'HTTP ' + res.status + ' ' + res.text.slice(0, 90))
  }

  const content = await call('/rest/v1/site_content?select=content_key')
  if (content.status === 200) {
    const keys = JSON.parse(content.text || '[]').map((row) => row.content_key)
    add(keys.length ? 'OK' : 'WARN', 'content studio rows', keys.length ? keys.join(', ') : 'none - run sql/supabase_verify.sql')
  } else add('FAIL', 'content studio rows', 'HTTP ' + content.status)

  const answered = await call('/rest/v1/community_questions?select=id&answer=not.is.null')
  if (answered.status === 200) {
    const count = JSON.parse(answered.text || '[]').length
    add('INFO', 'answered questions', count + ' visible on the homepage')
  } else add('WARN', 'answered questions', 'HTTP ' + answered.status)

  const bucket = await call('/storage/v1/bucket/application-images')
  if (bucket.status === 200) {
    let visibility = 'private'
    try { visibility = JSON.parse(bucket.text).public ? 'PUBLIC (should be private)' : 'private' } catch {}
    add('OK', 'bucket application-images', 'exists, ' + visibility)
  } else add('FAIL', 'bucket application-images', 'missing - run sql/supabase_verify.sql section 6')

  const probes = [
    ['community_questions', { id: 'not-a-uuid', name: 'db-check', email: 'db-check@example.com', question: 'db-check' }],
    ['applications', { id: 'not-a-uuid', full_name: 'db-check', email: 'db-check@example.com' }],
    ['application_images', { id: 'not-a-uuid', storage_path: 'db-check' }],
  ]
  for (const [table, payload] of probes) {
    const res = await call('/rest/v1/' + table, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(payload),
    })
    if (/22P02|22p02/.test(res.text)) add('OK', 'public write ' + table, 'allowed by RLS (no row created)')
    else if (/42501|row-level security|permission denied/i.test(res.text)) add('FAIL', 'public write ' + table, 'blocked: ' + res.text.slice(0, 120))
    else add('WARN', 'public write ' + table, 'HTTP ' + res.status + ' ' + res.text.slice(0, 120))
  }

  const width = rows.reduce((max, row) => Math.max(max, row.area.length), 0)
  console.log('')
  for (const row of rows) console.log('[' + row.status + '] ' + row.area.padEnd(width) + '  ' + row.detail)
  console.log('')
  console.log(failures === 0 ? 'All required checks passed.' : failures + ' check(s) need attention (see sql/supabase_verify.sql / SUPABASE_SETUP.md).')
  console.log('Reviewer-only policies (is_reviewer) cannot be probed with the public key; verify them by signing in at /dashboard.')
  process.exit(failures === 0 ? 0 : 1)
}

main()