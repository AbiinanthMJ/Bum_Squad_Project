#!/usr/bin/env node
// Definitive check: force DARK theme, sample real rendered pixels of the ticker.
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

const ev = async (expression, awaitPromise = false) =>
  (await send('Runtime.evaluate', { expression, awaitPromise, returnByValue: true })).result.value

// Make sure we are on the home page (the ticker only exists there).
await send('Page.enable')
await send('Page.navigate', { url: 'http://localhost:3000/' })
await new Promise((r) => setTimeout(r, 6000))

// Force dark theme the same way the app boot script does.
await ev(`(function(){var r=document.documentElement;r.classList.add('theme-dark','dark');r.classList.remove('theme-light');try{localStorage.setItem('bum-theme','dark')}catch(e){};return 1})()`)
await new Promise((r) => setTimeout(r, 800))

const info = await ev(`(function(){var c=getComputedStyle(document.querySelector('.ticker'));return {color:c.color,bg:c.backgroundColor,text:getComputedStyle(document.documentElement).getPropertyValue('--text').trim(),theme:document.documentElement.className}})()`)
console.log('DARK THEME COMPUTED:', JSON.stringify(info))

// Smooth-scroll off, then position the band for an exact capture.
await ev(`document.documentElement.style.scrollBehavior='auto'`)
await ev(`(function(){var t=document.querySelector('.ticker');window.scrollTo(0, t.getBoundingClientRect().top+window.scrollY-100);return 1})()`)
await new Promise((r) => setTimeout(r, 500))

const box = await ev(`(function(){var r=document.querySelector('.ticker').getBoundingClientRect();return {x:Math.round(r.left+window.scrollX),y:Math.round(r.top+window.scrollY),width:Math.round(r.width),height:Math.round(r.height)}})()`)
console.log('TICKER BOX (document coords):', JSON.stringify(box))

const shot = await send('Page.captureScreenshot', { format: 'png', clip: { ...box, scale: 1 }, captureBeyondViewport: false })

const pixels = await ev(`
new Promise(function(res){
  var img=new Image();
  img.onload=function(){
    var cv=document.createElement('canvas');cv.width=img.width;cv.height=img.height;
    var cx=cv.getContext('2d');cx.drawImage(img,0,0);
    var d=cx.getImageData(0,0,cv.width,cv.height).data;
    var counts={};
    for(var i=0;i<d.length;i+=4){var k=d[i]+','+d[i+1]+','+d[i+2];counts[k]=(counts[k]||0)+1;}
    res({w:img.width,h:img.height,px:img.width*img.height,colors:Object.entries(counts).sort(function(a,b){return b[1]-a[1]}).slice(0,8)});
  };
  img.onerror=function(){res('img error')};
  img.src='data:image/png;base64,${shot.data}';
})`, true)
console.log('RENDERED PIXELS:', JSON.stringify(pixels, null, 2))

// Also save a real screenshot of the band for visual confirmation.
const fs = await import('node:fs')
fs.writeFileSync('C:/temp/ticker_dark.png', Buffer.from(shot.data, 'base64'))
console.log('saved C:/temp/ticker_dark.png')

// Full-page captures at key widths for a visual responsiveness review.
for (const w of [390, 1440]) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: 900, deviceScaleFactor: 1, mobile: w < 500 })
  await new Promise((r) => setTimeout(r, 1200))
  await ev(`window.scrollTo(0,0)`)
  await new Promise((r) => setTimeout(r, 400))
  const m = await send('Page.getLayoutMetrics')
  const cs = m.cssContentSize || m.contentSize
  const cap = await send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: Math.ceil(cs.width), height: Math.min(Math.ceil(cs.height), 12000), scale: 1 },
  })
  const file = `C:/temp/full_${w}.png`
  fs.writeFileSync(file, Buffer.from(cap.data, 'base64'))
  console.log('saved', file, 'pageHeight=', Math.round(cs.height))
}
// Scroll step by step, measuring opacity AT each position (captured at the same
// moment) to tell a real reveal failure apart from a synthetic-capture artifact.
const fs3 = await import('node:fs')
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false })
await ev(`document.documentElement.style.scrollBehavior='auto'; window.scrollTo(0,0)`)
await new Promise((r) => setTimeout(r, 700))

const SEL = '.manifesto-content,.quote-section blockquote,.cycle-intro,.experience-copy,.application-intro,.faq-content'
const height2 = await ev(`document.documentElement.scrollHeight`)
const report = []
let s = 0
for (let y = 0; y < height2; y += 850) {
  await ev(`window.scrollTo(0, ${y})`)
  await new Promise((r) => setTimeout(r, 1100))
  const op = await ev(`(() => [ ...document.querySelectorAll('${SEL}') ].map(el => ({ c: String(el.className).slice(0,20), op: getComputedStyle(el).opacity, t: Math.round(el.getBoundingClientRect().top) })).filter(x => x.t > -700 && x.t < 900))()`)
  report.push({ y, visible: op })
  const cap = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  fs3.writeFileSync(`C:/temp/step_${String(s).padStart(2, '0')}.png`, Buffer.from(cap.data, 'base64'))
  s++
}
console.log(JSON.stringify(report, null, 2))
await send('Emulation.clearDeviceMetricsOverride')
ws.close()
