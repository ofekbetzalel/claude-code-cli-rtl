import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { layoutParagraph, type Arabic, type Row, type Run } from '../src/layout.ts'
import { joiningType, needsShaping, shape } from '../src/shape.ts'
import { FORMS, LAM_ALEF } from '../src/arabic-tables.ts'
import { textWidth } from '../src/width.ts'

const rowText = (r: Row) => r.spans.map(s => s.text).join('')
// the shaping tests below draw presentation forms (`arabic: 'forms'`); the default is `letters`
const layRuns = (runs: Run[], width = 60, mode: 'visual' | 'logical' = 'visual', arabic: Arabic = 'forms') =>
  layoutParagraph(runs, { width, base: 'rtl-share', mode, arabic })!
const lay = (text: string, width = 60, mode: 'visual' | 'logical' = 'visual') => layRuns([{ text, style: 0 }], width, mode)

test('Arabic letters take their contextual forms', () => {
  // meem initial, reh final, hah initial, beh medial, alef final
  assert.equal(shape('مرحبا').text, 'ﻣﺮﺣﺒﺎ')
  // a right-joining letter (alef) does not join the letter after it
  assert.equal(shape('كتاب').text, 'ﻛﺘﺎﺏ')
  // hamza does not join at all
  assert.equal(shape('بءب').text, 'ﺏﺀﺏ')
})

test('lam-alef becomes one ligature, isolated or final', () => {
  assert.equal(shape('لا لأ لإ لآ').text, 'ﻻ ﻷ ﻹ ﻵ')
  assert.equal(shape('بلا بلأ بلإ بلآ').text, 'ﺑﻼ ﺑﻸ ﺑﻺ ﺑﻶ')
  assert.equal(shape('ل').text, 'ﻝ')
})

test('a mark on the lam keeps lam and alef apart, joined to each other', () => {
  // a ligature would carry the fatha over the alef, where the source does not put it
  assert.equal(shape('لَا').text, 'ﻟَﺎ')
  // a mark on the alef follows the ligature
  assert.equal(shape('لاَ').text, 'ﻻَ')
})

test('lam and alef in different styles stay two joined letters', () => {
  assert.equal(shape('لا', { styles: Int32Array.from([0, 1]) }).text, 'ﻟﺎ')
  const rows = layRuns([{ text: 'ل', style: 0 }, { text: 'ا', style: 1 }])
  assert.ok(rows[0].spans.some(s => s.style === 1))
})

test('harakat and shadda stay on their letter and do not break joining', () => {
  assert.equal(shape('مُحَمَّد').text, 'ﻣُﺤَﻤَّﺪ')
})

test('tatweel and ZWJ cause joining; ZWJ is not drawn', () => {
  assert.equal(shape('بـب').text, 'ﺑـﺐ')
  assert.equal(shape('ب‍ب').text, 'ﺑﺐ')
})

test('Persian ZWNJ breaks joining and is not drawn', () => {
  assert.equal(shape('می‌خواهم').text, 'ﻣﯽﺧﻮﺍﻫﻢ')
  assert.equal(shape('ل‌ا').text, 'ﻝﺍ')
})

test('Persian letters use their own forms', () => {
  // peh, tcheh, gaf, keheh, farsi yeh (initial and final)
  assert.equal(shape('پچ گک یی').text, 'ﭘﭻ ﮔﮏ ﯾﯽ')
})

test('joining never crosses a line break, inline code, or a bidi isolate control', () => {
  assert.equal(shape('ل\nا').text, 'ﻝ\nﺍ')
  assert.equal(shape('ببب', { isolated: Uint8Array.from([0, 1, 0]) }).text, 'ﺏﺏﺏ')
  assert.equal(shape('ب⁦ب⁩ب').text, 'ﺏ⁦ﺏ⁩ﺏ')
})

test('letters without presentation forms keep their Unicode joining type for their neighbours', () => {
  // U+06D5 AE is right-joining: the beh before it joins it, the beh after it does not
  assert.equal(joiningType(0x06d5), 2)
  assert.equal(shape('بەب').text, 'ﺑەﺏ')
})

test('the source map follows astral characters and styles', () => {
  const s = shape('😀بلا😀', { isolated: Uint8Array.from([1, 1, 0, 0, 0, 1, 1]) })
  assert.equal(s.text, '😀ﺑﻼ😀')
  assert.deepEqual([...s.from], [0, 0, 2, 3, 5, 5])
  const rows = layRuns([{ text: '😀', style: 4, isolate: true }, { text: 'بلا', style: 1 }, { text: '😀', style: 4, isolate: true }])
  assert.deepEqual(rows[0].spans, [{ text: '😀', style: 4 }, { text: 'ﻼﺑ', style: 1 }, { text: '😀', style: 4 }])
  assert.equal(rows[0].width, 6)
})

test('a sentence is shaped, then reordered', () => {
  assert.equal(rowText(lay('مرحبا بالعالم')[0]), 'ﻢﻟﺎﻌﻟﺎﺑ ﺎﺒﺣﺮﻣ')
})

test('the paragraph direction is chosen on the logical letters, before ligatures', () => {
  // two Arabic letters of six: RTL under rtl-share, although the ligature is one letter
  assert.equal(lay('abcd لا')[0].rtl, true)
  assert.equal(rowText(lay('abcd لا')[0]), 'ﻻ abcd')
})

test('a hard wrap re-shapes each row on its own', () => {
  assert.deepEqual(lay('بب', 1).map(rowText), ['ﺏ', 'ﺏ'])
  assert.deepEqual(lay('ببب ببب', 3).map(rowText), ['ﺐﺒﺑ', 'ﺐﺒﺑ'])
})

test('a lam-alef ligature takes one cell, and rows are measured after shaping', () => {
  const rows = lay('لا لا لا', 60)
  assert.equal(rows[0].width, 5)
  for (const w of [1, 2, 3, 4, 7]) for (const r of lay('السلام عليكم ورحمة الله وبركاته', w)) assert.ok(r.width <= w)
})

test('every presentation form the shaper can emit is one cell wide', () => {
  const emitted = new Set<number>()
  for (let i = 0; i < FORMS.length; i += 5) for (let k = 1; k < 5; k++) if (FORMS[i + k]) emitted.add(FORMS[i + k])
  for (let i = 0; i < LAM_ALEF.length; i += 3) emitted.add(LAM_ALEF[i + 1]).add(LAM_ALEF[i + 2])
  for (const cp of emitted) assert.equal(textWidth(String.fromCodePoint(cp)), 1, cp.toString(16))
})

test('logical mode, and text without Arabic script, are not shaped', () => {
  assert.equal(needsShaping('שלום עולם'), false)
  assert.equal(rowText(lay('مرحبا', 60, 'logical')[0]), 'مرحبا')
})

test('edge cases stay bounded', () => {
  assert.equal(shape('').text, '')
  assert.deepEqual([...shape('').from], [])
  const s = shape('ب' + 'َ'.repeat(1000) + 'ب')
  assert.equal(s.from.length, s.text.length)
  const t0 = performance.now()
  shape('ب' + 'َ'.repeat(20000) + 'ب')
  assert.ok(performance.now() - t0 < 200, 'a long run of marks shapes in linear time')
})

test('a dropped ZWNJ or ZWJ stays dropped when a wrap cuts beside it', () => {
  assert.deepEqual(lay('aa ‌ببب', 1).map(rowText), ['a', 'a', 'ﺏ', 'ﺏ', 'ﺏ'])
  assert.deepEqual(lay('بب\n‌بب', 1).map(rowText), ['ﺏ', 'ﺏ', 'ﺏ', 'ﺏ'])
  assert.deepEqual(lay('بببب‌‌ب', 1).map(rowText), Array(5).fill('ﺏ'))
  // cuts change forms, never the display text's length
  const t = 'aa ‌ببب ‍ب لا'
  assert.equal(shape(t, { cuts: [4, 5, 6, 10] }).text.length, shape(t).text.length)
})

test('widths of the emitted forms match the live Claude Code renderer', () => {
  const fixture = JSON.parse(readFileSync(new URL('./fixtures/arabic-widths-2.1.288.json', import.meta.url), 'utf8'))
  assert.equal(fixture.widths.length, 260)
  for (const [s, w] of fixture.widths as [string, number][]) assert.equal(textWidth(s), w, [...s].map(c => c.codePointAt(0)!.toString(16)).join(' '))
})

// `letters` (the default): the plain letters in visual order, joined by a terminal that shapes
// with its font. Windows Terminal 1.24 with Cascadia Mono, which has none of the presentation
// forms, draws these bytes like a browser's dir="rtl" reference (compared on screenshots).
const letters = (text: string, width = 60) =>
  layoutParagraph([{ text, style: 0 }], { width, base: 'rtl-share', mode: 'visual' })!
const FORM = /[ﭐ-﷿ﹰ-﻿]/u

test('by default Arabic and Persian keep their plain letters, in visual order', () => {
  const logical = 'كيف تبدأ نصب للتثبيت برای می‌خواهم'
  // the bytes of the probe row that Windows Terminal drew right: each word reversed by code point
  const probe = logical.split(' ').reverse().map(w => [...w].reverse().join('')).join(' ')
  const rows = letters(logical)
  assert.equal(rowText(rows[0]), probe)
  assert.equal(rows[0].rtl, true)
  assert.ok(!FORM.test(rowText(rows[0])))
  // lam-alef stays two letters, two cells: the terminal's font makes the ligature
  assert.equal(letters('لا')[0].width, 2)
})

test('a ZWNJ or ZWJ is written between the two letters it separates', () => {
  // `ی` + ZWNJ is one cluster; drawn right to left, the ZWNJ goes before it, after `خ`
  assert.equal(rowText(letters('می‌خواهم')[0]), 'مهاوخ‌یم')
  assert.equal(rowText(letters('ب‍ب')[0]), 'ب‍ب')
  // marks stay after their letter
  assert.equal(rowText(letters('بَب')[0]), 'ببَ')
  // a ZWJ inside a cluster (an emoji sequence) does not move
  assert.ok(rowText(letters('שלום 👨‍👩‍👧')[0]).includes('👨‍👩‍👧'))
})

test('the setting changes Arabic script only', () => {
  for (const text of ['שלום עולם, hello 123', 'עברית (בסוגריים) ו-src/app.ts']) {
    const a = layoutParagraph([{ text, style: 0 }], { width: 20, base: 'rtl-share', mode: 'visual', arabic: 'letters' })
    const b = layoutParagraph([{ text, style: 0 }], { width: 20, base: 'rtl-share', mode: 'visual', arabic: 'forms' })
    assert.deepEqual(a, b)
  }
  assert.ok(FORM.test(rowText(lay('مرحبا')[0])))
  assert.ok(!FORM.test(rowText(letters('مرحبا')[0])))
})


// The joiner move is for Arabic-script letters under `letters` only, carries
// marks on either side of the joiner, and never leaves a joiner at a row's edge.
const one = (text: string, arabic: Arabic = 'letters', width = 60) =>
  layoutParagraph([{ text, style: 0 }], { width, base: 'rtl-share', mode: 'visual', arabic })!.map(rowText)

test('Hebrew and emoji clusters keep their bytes in both settings', () => {
  for (const arabic of ['letters', 'forms'] as const) {
    assert.deepEqual(one('א‌ב', arabic), ['בא‌'])
    assert.deepEqual(one('א‍ב', arabic), ['בא‍'])
    assert.deepEqual(one('אָ‌ב', arabic), ['באָ‌'])
    // a streaming emoji prefix that ends in ZWJ stays one cluster
    assert.ok(one('שלום 👨‍👩‍', arabic)[0].includes('👨‍👩‍'))
  }
})

test('forms output is not touched by the joiner move', () => {
  assert.deepEqual(one('می‌خواهم', 'forms'), lay('می‌خواهم').map(rowText))
  assert.ok(!one('می‌خواهم', 'forms')[0].includes('‌'))
})

test('a joiner moves with the marks on either side of it, and the marks stay on their letter', () => {
  assert.deepEqual(one('ب‌َب'), ['ب‌بَ'])
  assert.deepEqual(one('ب‌َب'), one('بَ‌ب'))
  assert.deepEqual(one('می‌َخواهم'), ['مهاوخ‌یَم'])
  assert.deepEqual(one('می‌َخواهم'), one('میَ‌خواهم'))
})

test('a joiner whose other neighbour is not on the row is dropped', () => {
  // a reply still streaming: the next letter has not arrived
  assert.deepEqual(one('می‌'), ['یم'])
  // a wrap right after the joiner: the next letter is on the next row
  const rows = one('نمی‌دانم', 'letters', 3)
  assert.equal(rows[0], 'یمن')
  for (const r of rows) assert.ok(!/^[‌‍]|[‌‍]$/u.test(r), JSON.stringify(r))
  // inside a row the joiner stays, between the two letters
  assert.deepEqual(one('نمی‌دانم'), ['مناد‌یمن'])
})
