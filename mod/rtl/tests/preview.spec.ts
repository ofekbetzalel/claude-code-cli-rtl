import { test } from 'node:test'
import assert from 'node:assert/strict'

import { DIM, ITALIC } from '../src/markdown.ts'
import { BAND_PREFIX, BoxMirror, CUT_MARK, DRAFT_MARK, GHOST_MARK, modelPreview, PREVIEW_MAX, PREVIEW_ROWS, TOO_LONG } from '../src/preview.ts'
import type { Settings } from '../src/render.ts'
import { textWidth } from '../src/width.ts'

const S: Settings = { mode: 'visual', base: 'rtl-share', share: 0.3 }
const show = (rows: NonNullable<ReturnType<typeof modelPreview>>) => rows.map(r => r.spans.map(s => s.text).join(''))

test('a Hebrew draft is one RTL row in visual order, marked as being written', () => {
  const rows = modelPreview('שלום user עולם', false, 80, 20, S)!
  assert.deepEqual(show(rows), ['םלוע user םולש'])
  assert.equal(rows[0].rtl, true)
  assert.equal(rows[0].mark, DRAFT_MARK)
  assert.ok(rows[0].spans.every(s => s.style === 0))
})

test('a draft without RTL letters is not previewed', () => {
  assert.equal(modelPreview('run the tests', false, 80, 20, S), null)
  assert.equal(modelPreview('', false, 80, 20, S), null)
})

test('the suggestion is dim italic and marked as a next prompt on offer', () => {
  const rows = modelPreview('כן, הוסף בדיקות', true, 80, 20, S)!
  assert.deepEqual(show(rows), ['תוקידב ףסוה ,ןכ'])
  assert.equal(rows[0].mark, GHOST_MARK)
  assert.ok(rows[0].spans.every(s => s.style === (DIM | ITALIC)))
})

test('each line of a draft keeps its own direction; an empty line stays', () => {
  const rows = modelPreview('שלום עולם\n\nrun the tests', false, 80, 20, S)!
  assert.deepEqual(show(rows), ['םלוע םולש', '', 'run the tests'])
  assert.deepEqual(rows.map(r => r.rtl), [true, false, false])
  assert.deepEqual(rows.map(r => r.mark), [DRAFT_MARK, ' ', ' '])
})

test('a long draft wraps inside the band and shows its last rows, the cut marked', () => {
  const text = 'מילה '.repeat(200).trim()
  const rows = modelPreview(text, false, 30, 50, S)!
  assert.equal(rows.length, PREVIEW_ROWS)
  assert.equal(rows[0].mark, CUT_MARK)
  for (const r of rows) assert.ok(textWidth(r.spans.map(s => s.text).join('')) <= 28)
  assert.equal(modelPreview(text, false, 30, 3, S)!.length, 3)
})

test('a draft past the limit gets one row that says so; no room, no rows', () => {
  assert.deepEqual(show(modelPreview('א'.repeat(PREVIEW_MAX + 1), false, 80, 20, S)!), [TOO_LONG])
  assert.equal(modelPreview('שלום', false, 9, 20, S), null)
  assert.equal(modelPreview('שלום', false, 80, 0, S), null)
})

// The box as the band knows it (BoxMirror), step by step as Claude Code 2.1.289 was seen to act.
const HE = 'כן, הוסף בדיקות'
const offered = () => {
  const box = new BoxMirror()
  assert.equal(box.suggested(box.offer(), HE), true)
  return box
}
const edit = (box: BoxMirror, text: string) => {
  box.editEnd(box.editStart(), text)
}

test('the suggestion shows again when an edit empties the box', () => {
  const box = offered()
  assert.equal(box.shows(), true)
  edit(box, 'x')
  assert.equal(box.shows(), false)
  edit(box, '')
  assert.equal(box.shows(), true)
  assert.equal(box.ghost, HE)
})

test('a box emptied without an edit was sent: the suggestion is dropped', () => {
  const box = offered()
  edit(box, '/cost')
  assert.equal(box.hint(true), true)
  assert.equal(box.hint(false), true)
  assert.equal(box.ghost, null)
  assert.equal(box.shows(), false)
})

test('a box emptied by an edit under way keeps the suggestion, though the hint line turns first', () => {
  const box = offered()
  edit(box, 'שלום')
  box.hint(true)
  const generation = box.editStart()
  box.hint(false)
  box.editEnd(generation, '')
  assert.equal(box.ghost, HE)
  assert.equal(box.shows(), true)
})

test('Tab, then Ctrl+U: the taken suggestion is read as the draft, then shows again', () => {
  const box = offered()
  box.hint(true)
  assert.equal(box.read(box.readStart(), HE), true)
  assert.equal(box.draft, HE)
  edit(box, '')
  box.hint(false)
  assert.equal(box.ghost, HE)
})

test('a read of the box finds it empty without an edit: sent, the suggestion is dropped', () => {
  const box = offered()
  box.hint(true)
  box.read(box.readStart(), 'שלום')
  assert.equal(box.read(box.readStart(), ''), true)
  assert.equal(box.ghost, null)
})

test('a read that began before an edit is not taken', () => {
  const box = new BoxMirror()
  const at = box.readStart()
  edit(box, 'שלום')
  assert.equal(box.read(at, 'של'), false)
  assert.equal(box.draft, 'שלום')
  box.editStart()
  assert.equal(box.read(box.readStart(), 'ש'), false)
})

test('a suggestion answered after a later one, a prompt or a turn is not shown', () => {
  const box = new BoxMirror()
  const first = box.offer()
  const second = box.offer()
  assert.equal(box.suggested(second, 'שני'), true)
  assert.equal(box.suggested(first, 'ראשון'), false)
  assert.equal(box.ghost, 'שני')
  const late = box.offer()
  box.dropGhost()
  assert.equal(box.suggested(late, 'מאוחר'), false)
  assert.equal(box.ghost, null)
})

test('the hint line drawn again without turning changes nothing', () => {
  const box = offered()
  assert.equal(box.hint(false), false)
  assert.equal(box.ghost, HE)
})

test('the too-long note fits the band or is left out', () => {
  const long = 'א'.repeat(PREVIEW_MAX + 1)
  for (const columns of [10, 12, 20, 26, 40]) {
    const rows = modelPreview(long, false, columns, 1, S)
    if (rows === null) {
      assert.ok(textWidth(TOO_LONG) > columns - BAND_PREFIX)
      continue
    }
    for (const r of rows) {
      assert.ok(textWidth(r.spans.map(s => s.text).join('')) <= columns - BAND_PREFIX)
      assert.equal(textWidth(r.mark), 1)
    }
  }
})

test('every row and mark fits the band, at any width', () => {
  const draft = 'שלום עולם, זו טיוטה ארוכה עם English words ומספרים 12345 שנמשכת על כמה שורות.\nשורה שנייה'
  for (const ghost of [false, true]) {
    for (let columns = 10; columns <= 40; columns++) {
      for (const r of modelPreview(draft, ghost, columns, 3, S) ?? []) {
        assert.ok(textWidth(r.spans.map(s => s.text).join('')) <= columns - BAND_PREFIX, `${columns}`)
        assert.ok(textWidth(r.mark) <= 1)
      }
    }
  }
})

test('Tab, then the box sent before it was read: the suggestion is dropped', () => {
  const box = offered()
  // Tab writes the box with no edit; the hint line turns before any read
  box.hint(true)
  box.hint(false)
  assert.equal(box.ghost, null)
})

test('a read that began before a send, or a new session, is not taken after it', () => {
  for (const end of [(b: BoxMirror) => b.sent(), (b: BoxMirror) => b.reset()]) {
    const box = new BoxMirror()
    box.hint(true)
    const old = box.readStart()
    end(box)
    assert.equal(box.read(old, 'טיוטה ישנה'), false)
    assert.equal(box.draft, '')
  }
})

test('an edit that ends after a send leaves the mirror as the send left it', () => {
  const box = new BoxMirror()
  const generation = box.editStart()
  box.sent()
  box.editEnd(generation, 'שלום')
  assert.equal(box.draft, '')
})

test('of two reads, the older one answered last is not taken', () => {
  const box = new BoxMirror()
  box.hint(true)
  const first = box.readStart()
  const second = box.readStart()
  assert.equal(box.read(second, 'חדש'), true)
  assert.equal(box.read(first, 'ישן'), false)
  assert.equal(box.draft, 'חדש')
})

test('a read is current until an edit, a send, a new session or a later read is taken', () => {
  const box = new BoxMirror()
  box.hint(true)
  const read = box.readStart()
  assert.equal(box.read(read, 'שלום'), true)
  assert.equal(box.current(read), true)
  // the same text read again is current, though nothing changed
  const again = box.readStart()
  assert.equal(box.read(again, 'שלום'), false)
  assert.equal(box.current(again), true)
  const older = box.readStart()
  const newer = box.readStart()
  box.read(newer, 'שלום עולם')
  assert.equal(box.current(older), false)
  for (const act of [(b: BoxMirror) => b.editEnd(b.editStart(), 'x'), (b: BoxMirror) => b.sent(), (b: BoxMirror) => b.reset()]) {
    const token = box.readStart()
    act(box)
    assert.equal(box.current(token), false)
  }
})
