#!/usr/bin/env node
// Find exactly which element overflows horizontally on a route at a given width.
const route = process.argv[2] || '/'
const vw = Number(process.argv[3] || 390)
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

await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:3000' + route })
await new Promise((r) => setTimeout(r, 5000))
await send('Emulation.setDeviceMetricsOverride', { width: vw, height: 900, deviceScaleFactor: 1, mobile: vw < 500 })
await new Promise((r) => setTimeout(r, 1200))

const probe = await ev(`(() => {
  const out = {}
  const mb = document.querySelector('.menu-button')
  if (mb) { const c = getComputedStyle(mb); const r = mb.getBoundingClientRect()
    out.menu = { display: c.display, color: c.color, bg: c.backgroundColor, border: c.borderColor, opacity: c.opacity, rect: {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}, html: mb.outerHTML.slice(0,160) } }
  else out.menu = 'MISSING'
  const pre = document.querySelector('pre')
  if (pre) { const c = getComputedStyle(pre); out.pre = { ovx: c.overflowX, ws: c.whiteSpace, w: Math.round(pre.getBoundingClientRect().width), sw: pre.scrollWidth } }
  const h1 = document.querySelector('.progress-content h1, h1')
  if (h1) { const c = getComputedStyle(h1); out.h1 = { fs: c.fontSize, w: Math.round(h1.getBoundingClientRect().width), sw: h1.scrollWidth, cw: h1.clientWidth } }
  return out
})()`)
console.log(JSON.stringify(probe, null, 2))
await send('Emulation.clearDeviceMetricsOverride')
ws.close()
