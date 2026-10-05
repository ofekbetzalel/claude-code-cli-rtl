// Unit tests for the pure layout core: `node --test 'mod/rtl/tests/*.spec.ts'`.
// Named *.spec.ts so that `claude plugin test` (which runs *.test.ts in the hooks VM) skips them.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { layoutParagraph, type Mode, type Row, type Run } from '../src/layout.ts'
import { reorderLine, resolveParagraph, type Base } from '../src/bidi.ts'
import { clusterWidth, textWidth } from '../src/width.ts'

const rowText = (r: Row) => r.spans.map(s => s.text).join('')
const layRuns = (runs: Run[], width = 80, base: Base = 'rtl', mode: Mode = 'visual') => {
  const rows = layoutParagraph(runs, { width, base, mode })
  assert.ok(rows !== null)
  return rows
}
const lay = (text: string, width = 80, base: Base = 'rtl', mode: Mode = 'visual') => layRuns([{ text, style: 0 }], width, base, mode)
const one = (text: string, base: Base = 'rtl') => {
  const rows = lay(text, 200, base)
  assert.equal(rows.length, 1)
  return rowText(rows[0])
}
const code = (text: string): Run => ({ text, style: 4, isolate: true })
const plain = (text: string): Run => ({ text, style: 0 })
const isRtl = (text: string, base: Base) => (resolveParagraph(text, null, base).level & 1) === 1

test('pure Hebrew is reversed into visual order', () => {
  assert.equal(one('שלום עולם'), 'םלוע םולש')
})

test('mixed sentence keeps English, paths and numbers intact', () => {
  assert.equal(one('אני בודק את src/app.ts ומוסיף 12 בדיקות.'), '.תוקידב 12 ףיסומו src/app.ts תא קדוב ינא')
})

test('hyphen-joined prefixes stay attached', () => {
  assert.equal(one('להריץ לפני ה-commit?'), '?commit-ה ינפל ץירהל')
})

test('English-leading paragraph laid out RTL when told so', () => {
  assert.equal(one('Claude Code הוא כלי'), 'ילכ אוה Claude Code')
})

test('brackets are mirrored on RTL levels', () => {
  assert.equal(one('(שלום)'), '(םולש)')
  assert.equal(one('ראה [כאן] עכשיו'), 'וישכע [ןאכ] האר')
})

test('a bracket carrying a combining mark is mirrored and keeps the mark', () => {
  assert.equal(one('שלום (́עולם)'), '(םלוע)́ םולש')
})

test('version numbers inside Hebrew', () => {
  assert.equal(one('גרסה 2.1.288 יצאה'), 'האצי 2.1.288 הסרג')
})

test('supplementary scalars get their own bidi class', () => {
  // An emoji is ON: it stays between the Hebrew letters, the number keeps its place.
  assert.equal(one('א😀123ב'), 'ב123😀א')
  // Cypriot U+10800/U+10801 are R: reversed inside an LTR paragraph.
  assert.equal(one('a \u{10800}\u{10801} b', 'ltr'), 'a \u{10801}\u{10800} b')
  assert.ok(isRtl('\u{10800} abc', 'first-strong'))
})

test('wrapped rows never exceed their width and lose no words', () => {
  const text = 'זו פסקה ארוכה במיוחד שנועדה לבדוק איך שבירת שורות עובדת כשהטקסט עברי ויש בו גם מילים באנגלית כמו Claude Code ו-Mods'
  for (const width of [10, 17, 24, 40]) {
    const rows = lay(text, width)
    for (const r of rows) assert.ok(r.width <= width, `row ${r.width} > ${width}`)
    const words = rows.flatMap(r => rowText(r).split(' ')).filter(Boolean)
    assert.equal(words.length, text.split(' ').length, `width ${width}`)
  }
})

test('the first logical words land on the first row (rightmost)', () => {
  const rows = lay('אחת שתיים שלוש ארבע חמש שש שבע', 15)
  assert.equal(rowText(rows[0]), 'שולש םייתש תחא')
})

test('an English-leading continuation line keeps the paragraph RTL base', () => {
  // line 2 starts with "Code"; a per-line first-strong restart would put it on the left
  const rows = lay('שלום Claude Code עולם', 11)
  assert.equal(rows.length, 2)
  assert.equal(rowText(rows[0]), 'Claude םולש')
  assert.equal(rowText(rows[1]), 'םלוע Code')
  assert.ok(rows.every(r => r.rtl))
})

test('a forced line break stays inside one paragraph resolution', () => {
  const rows = lay('שלום\nabc אבג', 80, 'rtl-share')
  assert.equal(rows.length, 2)
  assert.ok(rows.every(r => r.rtl))
  assert.equal(rowText(rows[0]), 'םולש')
  assert.equal(rowText(rows[1]), 'גבא abc')
})

test('leading spaces after a forced break are kept; after a soft wrap they are dropped', () => {
  const rows = lay('ab\n  cd', 80, 'ltr')
  assert.deepEqual(rows.map(rowText), ['ab', '  cd'])
})

test('niqqud stays attached to its letter', () => {
  const word = 'שָׁלוֹם'
  assert.equal(one(word), 'ם' + 'וֹ' + 'ל' + 'שָׁ')
})

test('emoji stay whole', () => {
  const rows = lay('שלום 👍🏽', 80)
  assert.equal(rowText(rows[0]), '👍🏽 םולש')
  assert.equal(rows[0].width, textWidth('👍🏽 םולש'))
})

test('overlong tokens are hard-broken, never truncated', () => {
  const rows = lay('abcdefghij', 4, 'ltr')
  assert.deepEqual(rows.map(rowText), ['abcd', 'efgh', 'ij'])
})

test('a cluster wider than the line, or no width at all, cannot be laid out', () => {
  assert.equal(layoutParagraph([plain('😀')], { width: 1, base: 'rtl', mode: 'visual' }), null)
  assert.equal(layoutParagraph([plain('א')], { width: 0, base: 'rtl', mode: 'visual' }), null)
  assert.equal(layoutParagraph([plain('א')], { width: 5, restWidth: 0, base: 'rtl', mode: 'visual' }), null)
})

test('logical mode keeps order and only wraps', () => {
  const rows = lay('שלום עולם', 80, 'rtl', 'logical')
  assert.equal(rowText(rows[0]), 'שלום עולם')
  assert.ok(rows[0].rtl)
})

test('styles follow their characters through the reorder', () => {
  const rows = layRuns([plain('שלום '), { text: 'עולם', style: 1 }])
  assert.deepEqual(rows[0].spans, [{ text: 'םלוע', style: 1 }, { text: ' םולש', style: 0 }])
})

test('bidi controls and C0/C1 controls are dropped from the output', () => {
  // NEL is a line break (two rows); the CSI C1 control is removed
  const out = lay('\u2067שלום\u2069 \u200Fעולם\u0085\u009bסוף').map(rowText).join('|')
  assert.equal(out, 'םלוע םולש|ףוס')
  assert.ok(!/[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069\u0080-\u009F]/u.test(out), JSON.stringify(out))
})

test('tabs expand to the next tab stop from the source line start', () => {
  assert.equal(rowText(lay('ab\tc', 80, 'ltr')[0]), 'ab  c')
  assert.equal(rowText(lay('א\tב   ', 80)[0]), 'ב   א') // the tab after one cell advances to column 4
})

test('paragraph direction: P2/P3, marks, isolates, and the share rule', () => {
  assert.ok(isRtl('שלום world', 'first-strong'))
  assert.ok(!isRtl('Claude Code הוא כלי מצוין לעבודה', 'first-strong'))
  assert.ok(isRtl('Claude Code הוא כלי מצוין לעבודה', 'rtl-share'))
  assert.ok(!isRtl('This is English with one word שלום inside', 'rtl-share'))
  assert.ok(isRtl('\u200Fabc שלום', 'first-strong'))
  assert.ok(!isRtl('\u200Eשלום abc', 'first-strong'))
  assert.ok(!isRtl('\u2067שלום\u2069abc', 'first-strong'))
})

test('inline code is an LTR isolate: skipped by P2, its order kept', () => {
  const first = layRuns([code('src/app.ts'), plain(' הוא הקובץ')], 80, 'first-strong')
  assert.ok(first[0].rtl)
  const t = (c: string) => rowText(layRuns([plain('שלום '), code(c), plain(' עולם')])[0])
  assert.equal(t('../src/app.ts'), 'םלוע ../src/app.ts םולש')
  assert.equal(t('/tmp/a.ts'), 'םלוע /tmp/a.ts םולש')
  assert.equal(t('-flag'), 'םלוע -flag םולש')
  assert.equal(t('f(x) [y]'), 'םלוע f(x) [y] םולש')
  // the share rule does not count code letters
  assert.ok(layRuns([code('averyveryverylongidentifier'), plain(' שלום abc')], 80, 'rtl-share')[0].rtl)
})

test('a wrapped code span keeps its own order on each line', () => {
  const rows = layRuns([plain('הרץ '), code('npm run build --watch'), plain(' עכשיו')], 12)
  for (const r of rows) assert.ok(r.width <= 12)
  const text = rows.map(rowText).join('|')
  assert.ok(text.includes('npm run') && text.includes('build') && text.includes('--watch'), text)
})

test('L1 resets trailing whitespace on a line that does not start the paragraph', () => {
  // bidi-js applies L1 with absolute indices on a line slice. Line "abc " of
  // "אב abc def ghi" has levels [2,2,2,2]; with the trailing space reset to level 1 it reads " abc".
  const { order, final } = reorderLine([2, 2, 2, 2], [0, 0, 0, 1], 1)
  assert.deepEqual(final, [2, 2, 2, 1])
  assert.deepEqual(order.map(i => 'abc '[i]).join(''), ' abc')
})

test('L1 resets a segment separator and the whitespace before it', () => {
  const { final } = reorderLine([2, 2, 2, 2, 2], [0, 1, 2, 0, 0], 1)
  assert.deepEqual(final, [2, 1, 1, 2, 2])
})

test('emoji sequences stay whole', () => {
  for (const e of ['❤️', '👍🏽', '👨\u200D👩\u200D👧', '🇮🇱', '1️⃣', '😀']) {
    const rows = lay(`שלום ${e} עולם`, 80)
    assert.equal(rowText(rows[0]), `םלוע ${e} םולש`, e)
  }
})

test("a cluster crossing a style boundary keeps its first unit's style and is not split", () => {
  const rows = layRuns([{ text: 'אש', style: 1 }, { text: 'ָב', style: 0 }])
  assert.deepEqual(rows[0].spans, [{ text: 'ב', style: 0 }, { text: 'שָ' + 'א', style: 1 }])
})

test('standalone format characters are not drawn and take no cell', () => {
  const rows = lay('של\u200Bום\u00AD', 80)
  assert.equal(rowText(rows[0]), 'םולש')
  assert.equal(rows[0].width, 4)
})

test('cluster widths', () => {
  assert.equal(clusterWidth('a'), 1)
  assert.equal(clusterWidth('😀'), 2)
})

test('widths match the live 2.1.288 renderer (fixture); only unassigned emoji points run wider', async () => {
  const { readFileSync } = await import('node:fs')
  const doc = JSON.parse(readFileSync(new URL('./fixtures/ink-widths-2.1.288.json', import.meta.url), 'utf8')) as { widths: [string, number][] }
  const wider: string[] = []
  for (const [s, ink] of doc.widths) {
    const ours = textWidth(s)
    assert.ok(ours >= ink, `${[...s].map(c => c.codePointAt(0)!.toString(16)).join(' ')}: ours ${ours} < ink ${ink}`)
    if (ours > ink) wider.push([...s].map(c => c.codePointAt(0)!.toString(16)).join(' '))
  }
  assert.deepEqual(wider, ['1f6db', '1fa7d', '1fa7f', '1faf9'])
})

test('neutrals glued to a Latin token stay with it (cases from real Hebrew replies)', () => {
  assert.equal(one('הטוקנים github_pat_, ghp_ ו-gho_ נחסמים'), 'םימסחנ gho_-ו github_pat_, ghp_ םינקוטה')
  assert.equal(one('הוסף את הקובץ ל-.gitignore, ואז הרץ שוב'), 'בוש ץרה זאו ,.gitignore-ל ץבוקה תא ףסוה')
  assert.equal(one('הקובץ נמצא ב-src/app/ ולא ב-lib/'), 'lib/-ב אלו src/app/-ב אצמנ ץבוקה')
  assert.equal(one('הרץ את --dry-run קודם'), 'םדוק --dry-run תא ץרה')
  assert.equal(one('כש-X מוגדר (hash): src/a.ts = "System" זה עובד'), 'דבוע הז src/a.ts = "System" :(hash) רדגומ X-שכ')
  // unchanged UAX #9 results: sentence punctuation, brackets, a numeric range, a question mark
  assert.equal(one('המודל Claude (Sonnet 4) ענה'), 'הנע Claude (Sonnet 4) לדומה')
  assert.equal(one('עמודים 8–10 בספר'), 'רפסב 10–8 םידומע')
  assert.equal(one('מה זה X?'), '?X הז המ')
  assert.equal(one('ראה את README.md.'), '.README.md תא האר')
})
