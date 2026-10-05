import { test } from 'node:test'
import assert from 'node:assert/strict'

import { capRecap, modelRecap, RECAP_ASK, RECAP_HINT, RECAP_MAX, RECAP_PROMPT, RecapGate } from '../src/recap.ts'
import { ITALIC } from '../src/markdown.ts'
import type { Settings } from '../src/render.ts'
import { textWidth } from '../src/width.ts'

const S: Settings = { mode: 'visual', base: 'rtl-share', share: 0.3 }

// a person's exchange: a prompt submitted and entered, and the main turn it starts
const exchange = (g: RecapGate) => {
  g.submit()
  g.prompt()
  g.turnStart()
  g.turnEnd()
}

test('no recap before three prompts, then not again before two more', () => {
  const g = new RecapGate()
  exchange(g)
  exchange(g)
  assert.equal(g.idle(), false)
  exchange(g)
  assert.equal(g.idle(), true)
  assert.equal(g.live(g.revision), true)
  assert.equal(g.shown(), true)
  exchange(g)
  assert.equal(g.idle(), false)
  exchange(g)
  assert.equal(g.idle(), true)
})

test('the idle notification arms once per completed turn, never mid-turn', () => {
  const g = new RecapGate()
  for (let i = 0; i < 3; i++) exchange(g)
  g.turnStart()
  assert.equal(g.idle(), false)
  g.turnEnd()
  assert.equal(g.idle(), true)
  assert.equal(g.idle(), false)
})

test('any sign of the person, a prompt or a new turn cancels the armed recap', () => {
  for (const act of [(g: RecapGate) => g.touch(), (g: RecapGate) => g.submit(), (g: RecapGate) => g.turnStart(), (g: RecapGate) => g.reset(false)]) {
    const g = new RecapGate()
    for (let i = 0; i < 3; i++) exchange(g)
    assert.equal(g.idle(), true)
    const rev = g.revision
    act(g)
    assert.equal(g.live(rev), false)
  }
  // a touch before the notification: that turn gets no recap
  const g = new RecapGate()
  for (let i = 0; i < 3; i++) exchange(g)
  g.touch()
  assert.equal(g.idle(), false)
})

test('the hint shows on the first three recaps only; a failed fork leaves that turn without one', () => {
  const g = new RecapGate()
  for (let i = 0; i < 3; i++) exchange(g)
  const hints: boolean[] = []
  for (let i = 0; i < 4; i++) {
    assert.equal(g.idle(), true)
    hints.push(g.shown())
    exchange(g)
    exchange(g)
  }
  assert.deepEqual(hints, [true, true, true, false])
  assert.equal(g.idle(), true)
  const rev = g.revision
  g.failed()
  assert.equal(g.live(rev), false)
  assert.equal(g.idle(), false)
})

test('a dropped prompt, or one from elsewhere, voids what waits but does not count', () => {
  const g = new RecapGate()
  exchange(g)
  exchange(g)
  // submitted, then dropped by a hook: no prompt() for it; a continuation turn follows
  g.submit()
  g.turnStart()
  g.turnEnd()
  assert.equal(g.idle(), false)
  exchange(g)
  assert.equal(g.idle(), true)
})

test('a reset (new session, reload, end) never reuses a revision, and waits for a completed turn', () => {
  const g = new RecapGate()
  for (let i = 0; i < 3; i++) exchange(g)
  assert.equal(g.idle(), true)
  const old = g.revision
  g.reset(false)
  assert.equal(g.live(old), false)
  // no completed main turn since the reset (and the counts start over): no recap yet
  assert.equal(g.idle(), false)
  for (let i = 0; i < 3; i++) exchange(g)
  assert.ok(g.revision > old)
  assert.equal(g.idle(), true)
  assert.equal(g.live(old), false)
})

test('the counts come back for the same session only, added to what was counted meanwhile', () => {
  const g = new RecapGate()
  for (let i = 0; i < 3; i++) exchange(g)
  assert.equal(g.idle(), true)
  assert.equal(g.shown(), true)
  const kept = { session: 's1', ...g.counts() }
  assert.deepEqual(kept, { session: 's1', prompts: 3, promptsAtRecap: 3, recaps: 1 })
  // a reload: the counts are read while a prompt is already counted
  const reloaded = new RecapGate()
  reloaded.reset(true)
  const epoch = reloaded.epoch
  assert.equal(reloaded.loading, true)
  exchange(reloaded)
  assert.equal(reloaded.restore(kept, 's1', epoch), true)
  assert.equal(reloaded.loading, false)
  assert.deepEqual(reloaded.counts(), { prompts: 4, promptsAtRecap: 3, recaps: 1 })
  // one more prompt since the last recap is still needed
  assert.equal(reloaded.idle(), false)
  exchange(reloaded)
  assert.equal(reloaded.idle(), true)
  assert.equal(reloaded.shown(), true)
  const other = new RecapGate()
  other.reset(true)
  assert.equal(other.restore(kept, 's2', other.epoch), true)
  assert.deepEqual(other.counts(), { prompts: 0, promptsAtRecap: 0, recaps: 0 })
})

test('no recap while the kept counts are read; once whole, they set the baseline and the hint', () => {
  const g = new RecapGate()
  g.reset(true)
  const epoch = g.epoch
  for (let i = 0; i < 3; i++) exchange(g)
  // three prompts counted, but the kept ones are not known yet
  assert.equal(g.idle(), false)
  assert.equal(g.restore({ session: 's1', prompts: 5, promptsAtRecap: 3, recaps: 3 }, 's1', epoch), true)
  assert.equal(g.idle(), true)
  // the fourth recap of the session: no hint, and its baseline is all 8 prompts
  assert.equal(g.shown(), false)
  assert.deepEqual(g.counts(), { prompts: 8, promptsAtRecap: 8, recaps: 4 })
  g.turnStart()
  g.turnEnd()
  assert.equal(g.idle(), false)
})

test('a read of the kept counts from before a session ended is not taken', () => {
  const g = new RecapGate()
  g.reset(true)
  const epoch = g.epoch
  g.reset(false)
  assert.equal(g.restore({ session: 's1', prompts: 9, promptsAtRecap: 0, recaps: 0 }, 's1', epoch), false)
  assert.deepEqual(g.counts(), { prompts: 0, promptsAtRecap: 0, recaps: 0 })
})

test('a session end (a resume, /clear) starts the counts over', () => {
  const g = new RecapGate()
  for (let i = 0; i < 3; i++) exchange(g)
  assert.equal(g.idle(), true)
  g.shown()
  g.reset(false)
  assert.deepEqual(g.counts(), { prompts: 0, promptsAtRecap: 0, recaps: 0 })
  exchange(g)
  assert.equal(g.idle(), false)
})

test('the summary is cut as the native recap cuts it', () => {
  assert.equal(capRecap('  short recap.  '), 'short recap.')
  const words = ('word '.repeat(120)).trim()
  const cut = capRecap(words)
  assert.ok(cut.length <= RECAP_MAX && cut.endsWith('…') && !cut.includes('wor…'))
  const long = 'x'.repeat(500)
  assert.equal(capRecap(long), 'x'.repeat(RECAP_MAX - 1) + '…')
  const astral = '😀'.repeat(300)
  assert.ok(!/[\uD800-\uDBFF]…$/.test(capRecap(astral)))
})

const show = (m: NonNullable<ReturnType<typeof modelRecap>>) => m.rows.map(r => r.spans.map(s => s.text).join(''))

test('an English recap reads as the native row; a Hebrew one runs from the right in visual order', () => {
  const en = modelRecap('Fixing the list layout; next, run the tests.', false, 80, S)!
  assert.equal(en.rtl, false)
  assert.deepEqual(show(en), ['recap: Fixing the list layout; next, run the tests.'])
  const he = modelRecap('מתקנים את הרשימות; הצעד הבא: להריץ בדיקות.', false, 80, S)!
  assert.equal(he.rtl, true)
  assert.deepEqual(show(he), ['.תוקידב ץירהל :אבה דעצה ;תומישרה תא םינקתמ :recap'])
  // the hint is a row of its own, left to right, on the summary's side
  const hinted = modelRecap('שלום', true, 80, S)!
  assert.deepEqual(show(hinted), ['םולש :recap', RECAP_HINT.trim()])
  assert.equal(hinted.rtl, true)
})

test('the hint never wraps inside the summary, and its brackets keep their order', () => {
  const text = 'دانشجو در حال بررسی نمایش متن فارسی در ترمینال است؛ گام بعدی: آزمایش دوباره.'
  for (const columns of [30, 50, 80]) {
    const m = modelRecap(text, true, columns, S)!
    const rows = show(m)
    const hint = rows.slice(rows.findIndex(r => r.startsWith('(turn off')))
    assert.equal(hint.join(' '), RECAP_HINT.trim(), rows.join('\n'))
    assert.ok(!rows.some(r => r.includes(')turn') || r.includes('band(')), rows.join('\n'))
  }
})

test('an Arabic-script summary is dim but not italic; a Hebrew one keeps the native italic', () => {
  const ar = modelRecap('نعمل على عرض النص العربي؛ الخطوة التالية: الاختبار.', true, 80, { ...S, arabic: 'letters' })!
  const arSummary = ar.rows.flatMap(r => r.spans).filter(sp => /[\u0600-\u06FF]/.test(sp.text))
  assert.ok(arSummary.length > 0 && arSummary.every(sp => (sp.style & ITALIC) === 0))
  const he = modelRecap('שלום עולם', false, 80, S)!
  assert.ok(he.rows.flatMap(r => r.spans).filter(sp => /[\u05D0-\u05EA]/.test(sp.text)).every(sp => (sp.style & ITALIC) !== 0))
})

test('the band asks the native recap\'s words, and for the language of the person\'s messages', () => {
  assert.ok(RECAP_ASK.startsWith(RECAP_PROMPT))
  assert.match(RECAP_ASK, /language of the user's own messages/)
})

test('a long recap wraps inside the band, every row within its width', () => {
  const text = 'מתקנים את כיוון הרשימות במוד ומוסיפים בדיקות לכל מקרה, כולל רשימות מקוננות ובלוקי קוד בתוך פריטים; הצעד הבא הוא בדיקה חיה.'
  for (const columns of [20, 40, 75]) {
    const m = modelRecap(text, true, columns, S)!
    assert.ok(m.rows.length > 1)
    for (const r of m.rows) assert.ok(textWidth(r.spans.map(s => s.text).join('')) <= m.content)
  }
  assert.equal(modelRecap(text, false, 6, S), null)
})
