#!/usr/bin/env node
// Responsive audit: measure overflow, clipped text and tap targets across viewports.
const list = await (await fetch('http://localhost:9333/json/list')).json()
const page = list.find((t) => t.type === 'page' && /localhost:3000/.test(t.url)) || list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const send = (method, params = {}) => new Promise((res, rej) => {
  const mid = ++id
  pending.set(mid, { res, rej })
  ws.send(JSON.stringify({ id: mid, method, params }))
})
ws.onmessage = (e) => {
  const m = JSON.parse(e.data)
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result) }
}
await new Promise((r) => { ws.onopen = r })
const ev = async (expression, awaitPromise = false) =>
  (await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })).result.value

const routes = process.argv[2] ? [process.argv[2]] : ['/']
const widths = [360, 390, 414, 768, 1024, 1440]

const AUDIT = `(() => {
  const vw = document.documentElement.clientWidth
  const out = { vw, scrollW: document.documentElement.scrollWidth }
  out.hOverflow = out.scrollW > vw + 1
  // Elements sticking out of the viewport horizontally
  const wide = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    if (r.right > vw + 1 || r.left < -1) {
      wide.push({ t: el.tagName, c: String(el.className || '').slice(0, 40), l: Math.round(r.left), r: Math.round(r.right), w: Math.round(r.width) })
    }
  }
  out.overflowing = wide.slice(0, 12)
  // Text clipped by its own box (overflow:hidden + nowrap)
  const clipped = []
  for (const el of document.querySelectorAll('h1,h2,h3,p,a,span,strong,summary,button,label')) {
    if (el.children.length > 0 && el.textContent.trim() === '') continue
    if (el.scrollWidth > el.clientWidth + 2 && el.clientWidth > 0) {
      const cs = getComputedStyle(el)
      if (cs.overflow !== 'visible' || cs.textOverflow === 'ellipsis') {
        clipped.push({ t: el.tagName, c: String(el.className || '').slice(0, 34), txt: (el.textContent || '').trim().slice(0, 32), sw: el.scrollWidth, cw: el.clientWidth })
      }
    }
  }
  out.clipped = clipped.slice(0, 10)
  // Nav: hamburger visible? links hidden?
  const menu = document.querySelector('.menu-button')
  const navLinks = document.querySelector('.nav-links')
  out.menuButton = menu ? { display: getComputedStyle(menu).display, w: Math.round(menu.getBoundingClientRect().width), inViewport: menu.getBoundingClientRect().right <= vw + 1 } : 'MISSING'
  out.navLinksDisplay = navLinks ? getComputedStyle(navLinks).display : 'MISSING'
  // Tiny tap targets
  const small = []
  for (const el of document.querySelectorAll('a,button,summary,input,select')) {
    const r = el.getBoundingClientRect()
    if (r.width > 0 && r.height > 0 && (r.height < 32 || r.width < 32)) {
      small.push({ t: el.tagName, c: String(el.className || '').slice(0, 30), txt: (el.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) })
    }
  }
  out.smallTargets = small.slice(0, 8)
  // Sections with fixed px widths that can't shrink
  const hero = document.querySelector('.hero h1')
  if (hero) out.heroH1 = { fs: getComputedStyle(hero).fontSize, sw: hero.scrollWidth, cw: hero.clientWidth }
  return out
})()`

for (const route of routes) {
  await send('Page.navigate', { url: 'http://localhost:3000' + route })
  await new Promise((r) => setTimeout(r, 4500))
  for (const w of widths) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 })
    await new Promise((r) => setTimeout(r, 900))
    await ev(`document.documentElement.style.scrollBehavior='auto'`)
    const res = await ev(AUDIT)
    const flag = res.hOverflow ? 'H-OVERFLOW' : 'ok'
    console.log(`\n=== ${route} @ ${w}px :: ${flag} (scrollW=${res.scrollW} vw=${res.vw}) ===`)
    if (res.overflowing.length) console.log('  overflowing:', JSON.stringify(res.overflowing))
    if (res.clipped.length) console.log('  clippedText:', JSON.stringify(res.clipped))
    console.log('  menuButton:', JSON.stringify(res.menuButton), '| navLinks:', res.navLinksDisplay)
    if (res.smallTargets.length) console.log('  smallTargets:', JSON.stringify(res.smallTargets))
    if (res.heroH1) console.log('  heroH1:', JSON.stringify(res.heroH1))
  }
}
await send('Emulation.clearDeviceMetricsOverride')
ws.close()
