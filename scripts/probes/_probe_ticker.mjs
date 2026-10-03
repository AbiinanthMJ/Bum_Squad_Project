// Temporary diagnostic: inspect the .ticker marquee computed styles via CDP.
const list = await (await fetch('http://localhost:9333/json/list')).json()
const page = list.find((t) => t.type === 'page' && /localhost:3000/.test(t.url)) || list.find((t) => t.type === 'page')
if (!page) { console.error('no page target'); process.exit(1) }

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

// Navigate the target to the app (it starts at about:blank).
await send('Page.enable')
const cur = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true })
if (!/localhost:3000/.test(cur.result.value)) {
  await send('Page.navigate', { url: 'http://localhost:3000/' })
  await new Promise((r) => setTimeout(r, 7000))
}

const expr = `(() => {
  const out = {}
  const lum = (c) => { const [r,g,b] = c.match(/\\d+(\\.\\d+)?/g).slice(0,3).map(Number).map(v => { v/=255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4) }); return 0.2126*r + 0.7152*g + 0.0722*b }
  const ratio = (a,b) => { const l1 = Math.max(lum(a), lum(b)), l2 = Math.min(lum(a), lum(b)); return Math.round(((l1+0.05)/(l2+0.05))*100)/100 }
  const t = document.querySelector('.ticker')
  const cs = getComputedStyle(t)
  const bg = cs.backgroundColor
  const fg = cs.color
  out.theme = document.documentElement.className
  out.tickerColor = fg
  out.tickerBg = bg
  out.contrast = ratio(fg, bg)
  out.visible = ratio(fg, bg) >= 4.5
  // Horizontal overflow check
  out.winW = window.innerWidth
  out.docScrollW = document.documentElement.scrollWidth
  out.bodyScrollW = document.body.scrollWidth
  out.horizontalOverflow = document.documentElement.scrollWidth > window.innerWidth
  // Find elements wider than the viewport
  const wide = []
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width > window.innerWidth + 2 && r.height > 0) {
      wide.push({ tag: el.tagName, cls: (el.className || '').toString().slice(0,45), w: Math.round(r.width), x: Math.round(r.x) })
    }
  }
  out.tooWide = wide.slice(0, 14)
  return out
})()`

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true })
console.log(JSON.stringify(r.result.value, null, 2))

// Sample real rendered pixels of the ticker band via canvas.
const info = await send('Runtime.evaluate', { expression: `(() => { const c=getComputedStyle(document.querySelector('.ticker')); return { color:c.color, bg:c.backgroundColor, text: getComputedStyle(document.documentElement).getPropertyValue('--text').trim(), theme: document.documentElement.className } })()`, returnByValue: true })
console.log('THEME INFO:', JSON.stringify(info.result.value))

const rect = await send('Runtime.evaluate', { expression: `(() => { const r=document.querySelector('.ticker').getBoundingClientRect(); return {x:0,y:Math.round(r.top+window.scrollY),w:Math.round(innerWidth),h:Math.round(r.height),vTop:Math.round(r.top)} })()`, returnByValue: true })
const rr = rect.result.value
// Scroll it into view first
await send('Runtime.evaluate', { expression: `document.querySelector('.ticker').scrollIntoView({block:'center'})` })
await new Promise((r) => setTimeout(r, 600))
const rect2 = await send('Runtime.evaluate', { expression: `(() => { const r=document.querySelector('.ticker').getBoundingClientRect(); return {x:Math.max(0,Math.round(r.left)),y:Math.max(0,Math.round(r.top)),w:Math.round(r.width),h:Math.round(r.height)} })()`, returnByValue: true })
const c2 = rect2.result.value
const shot = await send('Page.captureScreenshot', { format: 'png', clip: { x: c2.x, y: c2.y, width: c2.w, height: c2.h, scale: 1 }, captureBeyondViewport: false })
const b64 = shot.data

// Load the strip into a canvas and sample distinct colors.
const samp = await send('Runtime.evaluate', { expression: `
new Promise((res) => {
  const img = new Image()
  img.onload = () => {
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
    const cx = cv.getContext('2d'); cx.drawImage(img, 0, 0)
    const d = cx.getImageData(0, 0, cv.width, cv.height).data
    const counts = {}
    for (let i = 0; i < d.length; i += 4) { const k = d[i]+','+d[i+1]+','+d[i+2]; counts[k] = (counts[k]||0)+1 }
    const top = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0,6)
    res({ w: img.width, h: img.height, top })
  }
  img.onerror = () => res('img error')
  img.src = 'data:image/png;base64,${b64}'
})`, awaitPromise: true, returnByValue: true })
console.log('TICKER PIXELS:', JSON.stringify(samp.result.value, null, 2))
ws.close()
