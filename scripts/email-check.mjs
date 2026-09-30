#!/usr/bin/env node
// Supabase e-mail delivery probe.  Usage: pnpm email:check you@example.com
//
// It calls the password-reset endpoint - the only "send mail" call that never
// creates a user - and reports what Supabase Auth answers, which is the quickest
// way to tell whether custom SMTP is really live or you are still on the built-in
// mailer (2 messages per hour, team addresses only).  Nothing is written to your
// database; the side effect is one real reset e-mail to the address you pass, so
// use your own mailbox.  `--dry` only validates the environment.
//
// Point it at an address that already has an account: Supabase answers 200 for
// unknown addresses without sending anything (anti-enumeration), so a 200 on a
// made-up address proves nothing about delivery.

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
const args = process.argv.slice(2)
const dryRun = args.includes('--dry')
const target = args.find((arg) => !arg.startsWith('--')) || env.EMAIL_CHECK_TO

const rows = []
let failures = 0
function add(status, area, detail) {
  if (status === 'FAIL') failures += 1
  rows.push({ status, area, detail })
}

async function main() {
  if (!url || !key) {
    console.error('[FAIL] .env.local needs NEXT_PUBLIC_SUPABASE_URL plus a client key.')
    process.exit(1)
  }
  if (!target && !dryRun) {
    console.error('[FAIL] Pass the mailbox to test, e.g. `pnpm email:check you@example.com` (or set EMAIL_CHECK_TO).')
    process.exit(1)
  }

  add('INFO', 'project', url.replace(/^https:\/\//, '').replace(/\.supabase\.co$/, '') + '.supabase.co')
  add('INFO', 'mailbox tested', target || '(dry run)')

  if (dryRun) {
    add('INFO', 'dry run', 'environment is complete - re-run without --dry to actually probe delivery')
  } else {
    let status = 0
    let body = ''
    try {
      const res = await fetch(url + '/auth/v1/recover', {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      })
      status = res.status
      body = (await res.text()).slice(0, 220)
    } catch (error) {
      add('FAIL', 'auth reachable', String((error && error.message) || error))
    }

    if (status === 200) {
      add('OK', 'delivery accepted', 'Supabase queued the message - check the inbox and the spam folder')
      add('INFO', 'nothing arrived?', 'the SMTP host/user/password or the sender address is wrong, or the provider blocked that recipient')
    } else if (status === 429 || /over_email_send_rate_limit/.test(body)) {
      add('FAIL', 'rate limited', 'the built-in mailer is still in use (2 e-mails per hour) - configure custom SMTP, then raise Authentication -> Rate Limits')
    } else if (/email_address_not_authorized|Email address not authorized/i.test(body)) {
      add('FAIL', 'sender blocked', 'still the built-in mailer: it only delivers to addresses on your Supabase organisation team')
    } else if (status >= 500 || /unexpected_failure|error sending|535|554/i.test(body)) {
      add('FAIL', 'SMTP refused the message', 'custom SMTP is configured but rejected it - re-check host, port, username, password and the sender address. Raw: ' + body)
    } else {
      add('FAIL', 'unexpected answer', 'HTTP ' + status + ' ' + body)
    }
  }

  add('INFO', 'inside Supabase', 'Authentication -> Emails shows the templates; Authentication -> Rate Limits raises the e-mail ceiling once custom SMTP is on')

  const width = rows.reduce((max, row) => Math.max(max, row.area.length), 0)
  console.log('')
  for (const row of rows) console.log('[' + row.status + '] ' + row.area.padEnd(width) + '  ' + row.detail)
  console.log('')
  console.log(failures === 0 ? 'Probe finished with no failures.' : failures + ' check(s) need attention (see SUPABASE_SETUP.md Step 3b).')
  process.exit(failures === 0 ? 0 : 1)
}

main()
