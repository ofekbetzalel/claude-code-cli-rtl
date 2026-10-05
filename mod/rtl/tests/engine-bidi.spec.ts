import { test } from 'node:test'
import assert from 'node:assert/strict'

import { engineReorder, engineSegments } from '../src/bidi.ts'
import { CURSOR, CURSOR_STYLE, modelDraft } from '../src/preview.ts'
import type { Settings } from '../src/render.ts'

const S: Settings = { mode: 'visual', base: 'rtl-share', share: 0.3, arabic: 'letters' }

// Read off the cells of Claude Code 2.1.289 run with WT_SESSION set: each input a Text of its own
// (a nested Text merged into its parent), each output the row as drawn, left to right.
test('engineReorder: what Claude Code draws with WT_SESSION set', () => {
  const seen: [string, string][] = [
    ['R1|שלום (עולם) abc 123.|', 'R1|)םלוע( םולש abc 123.|'],
    ['R2|abc שלום def|', 'R2|abc םולש def|'],
    ['שלום', 'םולש'],
    ['(עולם)', ')םלוע('],
    ['R4|שלום עולם סוף|', 'R4|ףוס םלוע םולש|'],
    ['• שלום עולם', 'םלוע םולש •'],
    ['   שלום', 'םולש   '],
    ['גרסה 2.1.289 עכשיו', 'וישכע 2.1.289 הסרג'],
    ['שלום עולם', 'םלוע םולש'],
  ]
  for (const [input, drawn] of seen) assert.equal(engineReorder(input), drawn, input)
})

test('engineSegments: the engine turns each segment back into the row', () => {
  const rows = [
    'abc (םלוע) םולש',
    'םולש abc',
    'וישכע 2.1.289 הסרג',
    '• םלוע םולש',
    '│ םולש │ abc │ 12 │',
    'abc def',
    '',
    'ابحرم ١٢٣ abc',
    'םוֹלָשׁ 👍🏽 "x" (y)',
    '  ← םולש ←  ',
  ]
  for (const row of rows) {
    const segs = engineSegments(row)
    assert.equal(segs.map(engineReorder).join(''), row, row)
    // nothing moves between segments: each one keeps its length
    assert.equal(segs.join('').length, row.length, row)
  }
})

test('engineSegments: LTR text alone is one segment, as it is', () => {
  assert.deepEqual(engineSegments('plain text, 123.'), ['plain text, 123.'])
})

test('modelDraft: a bar where the cursor stands, on the RTL side', () => {
  const at = (text: string, cursor: number) => modelDraft(text, cursor, 30, S)!.rows.map(r => r.spans.map(s => s.text).join(''))
  assert.deepEqual(at('שלום', 4), [`${CURSOR}םולש`])
  assert.deepEqual(at('שלום', 0), [`םולש${CURSOR}`])
  assert.deepEqual(at('שלום', 2), [`םו${CURSOR}לש`])
  assert.deepEqual(at('', 0), [CURSOR])
  assert.equal(modelDraft('', 0, 30, S)!.rows[0].rtl, true)
  const two = modelDraft('שלום\nעולם', 7, 30, S)!
  assert.equal(two.cursorRow, 1)
  assert.equal(modelDraft('שלום', 0, 4, S), null)
})

test('modelDraft: the cursor inside a cluster moves to its start', () => {
  // שׁ is two code units: a cursor between them stands before the letter
  const rows = modelDraft('אשׁ', 2, 30, S)!.rows.map(r => r.spans.map(s => s.text).join(''))
  assert.deepEqual(rows, [`שׁ${CURSOR}א`])
})

test('modelDraft: a bar typed in the draft is text; the cursor is the styled one', () => {
  const m = modelDraft('שלום\n│', 0, 30, S)!
  assert.equal(m.cursorRow, 0)
  const styled = m.rows.flatMap(r => r.spans.filter(sp => sp.style & CURSOR_STYLE))
  assert.equal(styled.length, 1)
  assert.deepEqual(m.rows.map(r => r.spans.map(s => s.text).join('')), [`םולש${CURSOR}`, CURSOR])
  // the cursor at the start of the second line
  assert.equal(modelDraft('שלום\nעולם', 5, 30, S)!.cursorRow, 1)
  assert.equal(modelDraft('שלום\n', 5, 30, S)!.cursorRow, 1)
})

test('modelDraft: a paragraph that cannot be laid out fails the whole draft', () => {
  // one cluster wider than the pane: no row can hold it, wherever it stands
  const wide = '\u0d4e'.repeat(12) + 'א'
  for (const text of [wide + '\nשלום\nעולם', 'שלום\n' + wide + '\nעולם', 'שלום\nעולם\n' + wide]) {
    for (const cursor of [0, text.length]) assert.equal(modelDraft(text, cursor, 8, S), null)
  }
})
