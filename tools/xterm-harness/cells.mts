// Cell check in xterm.js: every row of the layout, written as a right-aligned row reaches
// the terminal (padding spaces, then one color piece per cluster), must fill exactly its own line
// in xterm.js's buffer, with nothing wrapped onto the line below. A zero-width control at the start
// of a row takes a buffer position of its own and pushes the row's last letter down; `textWidth`
// alone cannot see that.
// Usage: node tools/xterm-harness/cells.mts [letters|forms]
// Needs tools/xterm-harness/fetch.sh run once, `npm install` (playwright-core), and a Chromium
// (CHROMIUM_PATH, or Playwright's own). Exits 1 on any mismatch.
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'
import { layoutParagraph, type Arabic } from '../../mod/rtl/src/layout.ts'
import { graphemes } from '../../mod/rtl/src/width.ts'

const arabic = (process.argv[2] ?? 'letters') as Arabic
const COLS = 60
const here = dirname(fileURLToPath(import.meta.url))
const texts = [
  'می‌',
  'نمی‌',
  'نمی‌دانم',
  'می‌خواهم',
  'ب‌َب',
  'میَ‌خواهم',
  'برنامه‌ها را نمی‌دانم و می‌خواهند',
  'من می‌خواهم برای نصب کمک بگیرم',
  'لا بأس، الإصدار ٢٫١ – السلام عليكم',
  'שלום עולם, עם src/app.ts ו-42',
]
const rows: { id: string; text: string; width: number }[] = []
for (const t of texts)
  for (const w of [2, 3, 4, 5, 7, 12, 59]) {
    const laid = layoutParagraph([{ text: t, style: 0 }], { width: w, base: 'rtl-share', mode: 'visual', arabic })!
    laid.forEach((r, i) => rows.push({ id: `${t} @${w} #${i}`, text: r.spans.map(s => s.text).join(''), width: r.width }))
  }
// each row on an odd line; the line below stays empty unless the row wrapped
let ansi = ''
rows.forEach((r, i) => {
  const pieces = graphemes(r.text).map((g, k) => `\x1b[38;2;${k % 2 ? '254;254;254' : '255;255;255'}m${g}`)
  ansi += `\x1b[${2 * i + 1};1H\x1b[0m` + ' '.repeat(COLS - r.width) + pieces.join('') + '\x1b[0m'
})

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {})
let bad = 0
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(resolve(here, 'index.html')).href + `?cols=${COLS}`)
  const lines: { text: string; last: number }[] = await page.evaluate(async ({ ansi, n, cols }) => {
    const term = new (window as any).Terminal({ cols, rows: n, scrollback: 0 })
    term.open(document.createElement('div'))
    await new Promise(r => term.write(ansi, r))
    const out = []
    for (let y = 0; y < n; y++) {
      const line = term.buffer.active.getLine(y)
      let text = ''
      let last = 0
      for (let x = 0; x < cols; x++) {
        const c = line.getCell(x)
        if (c.getChars() && c.getChars() !== ' ') last = x + 1
        text += c.getChars() || (c.getWidth() ? ' ' : '')
      }
      out.push({ text: text.trimStart(), last })
    }
    return out
  }, { ansi, n: 2 * rows.length + 1, cols: COLS })
  rows.forEach((r, i) => {
    const got = lines[2 * i]
    const below = lines[2 * i + 1]
    if (got.text === r.text && below.text === '' && (r.width === 0 || got.last === COLS)) return
    bad++
    console.log('MISMATCH', r.id, JSON.stringify({ want: r.text, got: got.text, last: got.last, below: below.text.trim() }))
  })
  console.log(`${arabic}: ${rows.length - bad}/${rows.length} rows fill their own line exactly; nothing wrapped`)
} finally {
  await browser.close()
}
process.exit(bad ? 1 : 0)
