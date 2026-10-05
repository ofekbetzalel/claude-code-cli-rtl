// Render ANSI text in xterm.js (DOM renderer) inside headless Chromium and screenshot it.
// Usage: node tools/xterm-harness/shot.mjs <ansi-file> <out.png> [cols] [font-family]
// Needs tools/xterm-harness/fetch.sh run once, and `npm install` (playwright-core).
// PLAIN=1 draws every character as its own block, in the order received: no bidi and no joining,
// the way a terminal without bidi shows the same bytes. CROP=1 cuts the image to the
// rows and columns that hold text.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const [ansiFile, out, cols = '100', font = ''] = process.argv.slice(2)
const here = dirname(fileURLToPath(import.meta.url))
// Chromium: CHROMIUM_PATH if set, else Playwright's own (`npx playwright-core install chromium-headless-shell`).
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
const page = await browser.newPage({ viewport: { width: Math.max(1100, Number(cols) * 10 + 40), height: 700 } })
await page.goto(pathToFileURL(resolve(here, 'index.html')).href + `?cols=${cols}&font=${encodeURIComponent(font)}`)
const data = readFileSync(ansiFile, 'utf8').replace(/\r?\n/g, '\r\n')
await page.evaluate(d => new Promise(r => window.term.write(d, r)), data)
await page.waitForTimeout(300)
const spans = await page.evaluate(() => [...document.querySelectorAll('.xterm-rows > div')].slice(0, 12).map(d => d.querySelectorAll('span').length))
if (process.env.PLAIN) await page.evaluate(() => {
  // one inline block per character: no bidi reordering and no joining across cells
  const walker = document.createTreeWalker(document.querySelector('.xterm-rows'), NodeFilter.SHOW_TEXT)
  const nodes = []
  while (walker.nextNode()) nodes.push(walker.currentNode)
  for (const node of nodes) {
    const cells = [...new Intl.Segmenter().segment(node.data)].map(g => {
      const b = document.createElement('span'); b.style.display = 'inline-block'; b.textContent = g.segment; return b
    })
    node.replaceWith(...cells)
  }
})
let clip = await page.locator('#t').boundingBox()
if (process.env.CROP) {
  // the screen's own size, cut after the last row that holds text, with the same 8px margin
  const scr = (await page.locator('.xterm-screen').boundingBox())
  const used = await page.evaluate(() => {
    const b = window.term.buffer.active; let last = 0
    for (let y = 0; y < b.length; y++) if (b.getLine(y)?.translateToString(true).trim()) last = y
    return last + 1
  })
  clip = { x: scr.x - 8, y: scr.y - 8, width: scr.width + 16, height: Math.ceil(used * scr.height / 30) + 16 }
}
await page.screenshot({ path: out, clip })
console.log(JSON.stringify({ out, spansPerRow: spans }))
await browser.close()
