import { test } from 'node:test'
import assert from 'node:assert/strict'

import bidiFactory from '../vendor/bidi.mjs'
import { charClass } from '../src/bidi.ts'
import { isolateRow, nudge, paletteFor, pieceProps, propsKey, type Piece } from '../src/isolate.ts'
import { BOLD, CODE, ITALIC, LINK, STRIKE, parseBlocks, parseInline } from '../src/markdown.ts'
import { COMMAND_PREFIX, LEAF_MAX, Memo, modelAssistant, modelCommand, modelUser, type RowModel, type Settings } from '../src/render.ts'
import { graphemes, textWidth } from '../src/width.ts'

const S: Settings = { mode: 'visual', base: 'rtl-share', share: 0.3 }
const rowText = (r: RowModel) =>
  r.kind === 'text' ? (r.rtl ? [...r.spans, ...r.lead] : [...r.lead, ...r.spans]).map(s => s.text).join('') : `<${r.kind}>`
const texts = (rows: RowModel[]) => rows.map(rowText)
const model = (text: string, columns = 80, first = false) => {
  const m = modelAssistant(text, columns, first, S)
  assert.ok(m !== null)
  return m
}
const styled = (s: string) => parseInline(s).map(r => [r.text, r.style])

test('inline styles become runs', () => {
  assert.deepEqual(styled('a **b** *c* `d` ~~f~~'), [['a ', 0], ['b', BOLD], [' ', 0], ['c', ITALIC], [' ', 0], ['d', CODE], [' ', 0], ['f', STRIKE]])
})

test('inline code runs are LTR isolates', () => {
  assert.equal(parseInline('x `a/b` y')[1].isolate, true)
})

test('links show their text and destination as Claude Code does without hyperlinks', () => {
  assert.equal(parseInline('[דף](https://x.test/a)').map(r => r.text).join(''), 'דף (https://x.test/a)')
  assert.equal(parseInline('[https://x.test](https://x.test)').map(r => r.text).join(''), 'https://x.test')
  assert.equal(parseInline('<https://x.test/a>').map(r => r.text).join(''), 'https://x.test/a')
})

test('a link destination with balanced parentheses', () => {
  assert.equal(parseInline('[דף](https://x.test/a_(b)) סוף').map(r => r.text).join(''), 'דף (https://x.test/a_(b)) סוף')
})

test('nested emphasis follows the CommonMark delimiter rules', () => {
  assert.deepEqual(styled('***מודגש ונטוי***'), [['מודגש ונטוי', BOLD | ITALIC]])
  assert.deepEqual(styled('**חזק *ונטוי***'), [['חזק ', BOLD], ['ונטוי', BOLD | ITALIC]])
  assert.deepEqual(styled('*a **b** c*'), [['a ', ITALIC], ['b', BOLD | ITALIC], [' c', ITALIC]])
})

test('every streaming prefix parses without throwing, and unclosed markers stay literal', () => {
  const full = '**חזק *ונטוי*** ו-`code` עם [קישור](https://x.test/a_(b)) ~~מחוק~~ סוף'
  for (let i = 0; i <= full.length; i++) parseInline(full.slice(0, i))
  assert.deepEqual(styled('שלום **עול'), [['שלום **עול', 0]])
  assert.deepEqual(styled('a `code'), [['a `code', 0]])
})

test('snake_case and Hebrew intraword underscores are not emphasis', () => {
  assert.deepEqual(styled('my_var_name'), [['my_var_name', 0]])
  assert.deepEqual(styled('שם_משתנה_ארוך'), [['שם_משתנה_ארוך', 0]])
})

test('block kinds', () => {
  const kinds = parseBlocks('# כותרת\n\nפסקה\n- פריט\n1. צעד\n> ציטוט\n\n---\n```ts\nx\n```\n| a | b |\n|---|---|\n| 1 | 2 |').map(b => b.kind)
  assert.deepEqual(kinds, ['para', 'space', 'para', 'list', 'list', 'quote', 'space', 'rule', 'code', 'table'])
})

test('a paragraph spans its soft-broken lines; a list item keeps its continuation', () => {
  const [p] = parseBlocks('שלום **abc\ndef** עולם')
  assert.ok(p.kind === 'para')
  assert.deepEqual(styled(p.text), [['שלום ', 0], ['abc\ndef', BOLD], [' עולם', 0]])
  const [l] = parseBlocks('- פריט ראשון\n  English continuation\n- שני')
  assert.ok(l.kind === 'list')
  assert.equal(l.items.length, 2)
  assert.deepEqual(l.items[0].blocks.map(b => (b.kind === 'para' ? b.text : b.kind)), ['פריט ראשון\nEnglish continuation'])
})

test('hard breaks lose their markers', () => {
  const [p] = parseBlocks('שורה  \nעוד\\\nסוף')
  assert.ok(p.kind === 'para')
  assert.equal(p.text, 'שורה\nעוד\nסוף')
})

test('setext headings, a lazy quote line, nested lists', () => {
  const b = parseBlocks('כותרת\n===\n> שורה\nהמשך עצל\n\n- א\n  - ב')
  assert.ok(b[0].kind === 'para' && b[0].heading === 1)
  assert.ok(b[1].kind === 'quote' && b[1].blocks[0].kind === 'para' && b[1].blocks[0].text === 'שורה\nהמשך עצל')
  assert.ok(b[3].kind === 'list' && b[3].items[0].blocks[1].kind === 'list')
})

test('an unclosed fence (streaming) takes the rest as code', () => {
  const b = parseBlocks('שלום\n```py\nprint(1)')
  assert.ok(b[1].kind === 'code' && b[1].text === 'print(1)')
})

test('mermaid leaves the whole message to the engine', () => {
  assert.equal(modelAssistant('שלום\n```mermaid\ngraph TD\n```', 80, true, S), null)
})

test('an RTL table runs its columns from the right, header centered, cells at their start', () => {
  const m = model('| שם | תפקיד |\n|---|---|\n| עדה | ראש צוות |\n| בוב | 42 |', 80, true)
  assert.deepEqual(texts(m.rows), [
    '┌──────────┬─────┐ ●',
    '│  דיקפת   │ םש  │  ',
    '├──────────┼─────┤  ',
    '│ תווצ שאר │ הדע │  ',
    '├──────────┼─────┤  ',
    '│       42 │ בוב │  ',
    '└──────────┴─────┘  ',
  ])
  assert.ok(m.rows.every(r => r.kind === 'text' && r.rtl && r.paint))
})

test('in an English reply, a table whose header is English stays LTR, with its Hebrew cells in visual order', () => {
  const m = model('The team:\n\n| Name | Role |\n|:--|--:|\n| Ada | ראש צוות |\n| Bob | QA |', 80, true)
  assert.deepEqual(texts(m.rows).slice(1, 6), ['<blank>', '  ┌──────┬──────────┐', '  │ Name │   Role   │', '  ├──────┼──────────┤', '  │ Ada  │ תווצ שאר │'])
  assert.equal(texts(m.rows)[7], '  │ Bob  │       QA │')
})

test('in an RTL reply, a table whose header is English runs from the right', () => {
  const table = '| | git merge | git rebase |\n|---|---|---|\n| الفكرة | يدمج الفرعين | يعيد تطبيق commits |\n| الأمان | آمن | يعيد كتابة التاريخ |'
  const after = texts(model(table + '\n\nقاعدة ذهبية: لا تعمل rebase على فرع مشترك.', 100, true).rows)
  const before = texts(model('الفرق باختصار:\n\n' + table, 100, true).rows)
  for (const t of [after, before]) {
    const head = t.find(x => x.includes('git merge'))!
    // columns from the right: the label column on the right, then merge, then rebase
    assert.ok(head.indexOf('git rebase') < head.indexOf('git merge'))
    assert.ok(t.some(x => /ةركفلا\s*│\s*$/.test(x)))
  }
  // a reply that is only the table: the whole table's text decides (rtl-share)
  const alone = texts(model(table, 100, true).rows)
  const head = alone.find(x => x.includes('git merge'))!
  assert.ok(head.indexOf('git rebase') < head.indexOf('git merge'))
})

test('code in the reply does not count toward a table\'s flow: double-backtick spans, fences in lists', () => {
  const table = '| | git merge | git rebase |\n|---|---|---|\n| الفكرة | دمج | تغيير |'
  const runsRight = (t: string[]) => {
    const head = t.find(x => x.includes('git merge'))!
    return head.indexOf('git rebase') < head.indexOf('git merge')
  }
  const a = '``' + 'English code '.repeat(20) + '`` שלום עולם זהו הסבר בעברית\n\n' + table
  assert.ok(runsRight(texts(model(a, 100, true).rows)))
  const b = 'Intro.\n\n- שלום עולם כאן קצת הסבר בעברית\n\n  ```text\n  ' + 'English words '.repeat(20) + '\n  ```\n\n' + table
  assert.ok(runsRight(texts(model(b, 100, true).rows)))
})

test('a table whose header reads RTL is RTL in an English reply; inline code does not count', () => {
  const t = texts(model('Here:\n\n| שם | `name` |\n|---|---|\n| עדה | `ada` |', 80, true).rows)
  assert.ok(t.includes('│ name │ םש  │  '))
  // code-only header and body in an English reply: the reply decides
  const c = texts(model('Commands:\n\n| `a` | `b` |\n|---|---|\n| `x` | שלום |', 80, true).rows)
  assert.ok(c.includes('  │  a  │  b   │'))
})

test('table cells wrap and center vertically; a narrow table falls to the vertical form', () => {
  const long = '| שם | הערות |\n|---|---|\n| עדה | כותבת קוד כל יום ובודקת רשימה ארוכה מאוד של בקשות משיכה בכל בוקר |'
  const wide = texts(model(long, 40, true).rows)
  assert.equal(wide.length, 7)
  assert.ok(wide[4].includes('הדע'))
  const narrow = texts(model(long, 24, true).rows)
  assert.ok(narrow.every(t => !t.includes('│')))
  assert.ok(narrow.some(t => t.includes(':םש')))
})

test('every drawn table row fits the width, the 200-row note included', () => {
  const body = Array.from({ length: 201 }, (_, i) => `| שורה ${i} | ${i} |`).join('\n')
  const table = '| שם | מספר |\n|---|---|\n' + body
  for (const cols of [10, 15, 20, 40, 80]) {
    const m = modelAssistant(table, cols, true, S)
    if (m === null) continue
    for (const r of m.rows) if (r.kind === 'text') assert.ok(textWidth(rowText(r)) <= m.width, `${cols}: ${rowText(r)}`)
    assert.ok(texts(m.rows).some(t => t.includes('more')), String(cols))
  }
})

test('a header-only table keeps its header in the vertical form', () => {
  for (const cols of [10, 20]) {
    const m = model('שלום\n\n| כותרתארוכהמאוד | אחר |\n|---|---|', cols, true)
    // logical order back: each RTL row reversed, rows in order
    const logical = texts(m.rows).map(t => [...t.trim()].reverse().join('')).join('')
    assert.ok(logical.includes('כותרתארוכהמאוד') && logical.includes('אחר'), logical)
  }
})

test('a table row with a different cell count than its delimiter row is a paragraph', () => {
  const m = model('| א | `x|y` |\n|---|---|\n| 1 | 2 |', 40, true)
  assert.ok(texts(m.rows).every(t => !t.includes('┌')))
})

test('blocks without RTL text stay native: merged Markdown leaves', () => {
  const m = model('Intro in English.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\nשלום עולם\n\nOutro.', 80, true)
  assert.deepEqual(texts(m.rows), ['<markdown>', '<blank>', 'םלוע םולש  ', '<blank>', '<markdown>'])
  const first = m.rows[0]
  assert.ok(first.kind === 'markdown' && first.bullet && first.text === 'Intro in English.\n\n| a | b |\n|---|---|\n| 1 | 2 |')
})

test('the reply bullet sits on the start side of the first row', () => {
  const rtl = model('שלום עולם', 80, true)
  assert.equal(rowText(rtl.rows[0]), 'םלוע םולש ●')
  const ltr = model('Hello שלום world and more English words here', 80, true)
  assert.equal(rowText(ltr.rows[0]).slice(0, 2), '● ')
})

test('list markers as Claude Code prints them, mirrored on RTL rows, with a hanging indent', () => {
  const m = model('- פריט ארוך מאוד שעובר את רוחב השורה בהחלט\n- שני', 24)
  const rows = m.rows.filter(r => r.kind === 'text')
  assert.ok(rowText(rows[0]).endsWith(' -  '), rowText(rows[0]))
  assert.ok(rowText(rows[1]).endsWith('    '), rowText(rows[1]))
  const o = model('1. ראשון\n2. שני\n10. עשירי', 40)
  assert.deepEqual(texts(o.rows).map(t => t.trimEnd()), ['ןושאר .1', 'ינש .2', 'ירישע .3'])
})

test('nested ordered lists use letters, then roman numerals', () => {
  const m = model('1. א\n   1. ב\n      1. ג', 40)
  assert.deepEqual(texts(m.rows).map(t => t.trim()), ['א .1', 'ב .a', 'ג .i'])
})

test('quotes get a bar on the start side and italic text', () => {
  const m = model('> שלום עולם', 40)
  const r = m.rows[0]
  assert.ok(r.kind === 'text')
  assert.equal(rowText(r).trimEnd(), 'םלוע םולש ▕')
  assert.ok(r.spans.every(s => s.style & ITALIC))
})

test('headings: level 1 bold italic underline, an empty line after', () => {
  const m = model('# כותרת\nפסקה', 40)
  assert.deepEqual(texts(m.rows).map(t => t.trim()), ['תרתוכ', '<blank>', 'הקספ'])
})

test('a list continuation that starts with English keeps the item RTL', () => {
  const m = model('- פריט ראשון\n  English continuation here', 60)
  const rows = m.rows.filter(r => r.kind === 'text')
  assert.equal(rows.length, 2)
  assert.ok(rows.every(r => r.kind === 'text' && r.rtl))
})

test('no text row is wider than the model width, at any viewport', () => {
  const text = 'זו פסקה ארוכה במיוחד עם `src/very/long/path/to/some/file/name.tsx` ועוד מילים\n\n> - ציטוט עם רשימה מקוננת\n>   - ועוד רמה אחת למטה עם טקסט ארוך'
  for (const columns of [8, 12, 20, 41, 80, 131]) {
    const m = modelAssistant(text, columns, true, S)
    if (m === null) continue
    assert.ok(m.width <= columns)
    for (const r of m.rows) {
      if (r.kind !== 'text') continue
      const w = textWidth([...r.lead, ...r.spans].map(s => s.text).join(''))
      assert.ok(w <= m.width - 2, `columns ${columns}: ${w} > ${m.width - 2}`)
    }
  }
})

test('too narrow a viewport, or deep indentation that leaves no room, falls back', () => {
  assert.equal(modelAssistant('שלום', 0, true, S), null)
  assert.equal(modelAssistant('שלום', 4, true, S), null)
  assert.equal(modelAssistant('- א\n  - ב\n    - ג\n      - ד\n        - ה', 12, true, S), null)
  assert.equal(modelAssistant('א😀', 6, true, S), null)
})

test('long fences are cut into Code leaves at line boundaries; a longer single line falls back', () => {
  const body = Array.from({ length: 2000 }, (_, i) => `line ${i} xxxxxxxx`).join('\n')
  const m = model('שלום\n\n```\n' + body + '\n```', 80)
  const codes = m.rows.filter(r => r.kind === 'code')
  assert.ok(codes.length >= 2)
  for (const c of codes) assert.ok(c.kind === 'code' && c.source.length <= LEAF_MAX)
  assert.equal(codes.map(c => (c.kind === 'code' ? c.source : '')).join('\n'), body)
  assert.equal(modelAssistant('שלום\n\n```\n' + 'x'.repeat(LEAF_MAX + 1) + '\n```', 80, true, S), null)
})

test('command output rows: one paragraph per line, with inline styles, five cells for the prefix', () => {
  const m = modelCommand('כתבנו **פונקציה** ב-`Python`.\nsecond line', 40, S)!
  assert.equal(m.content, 40 - 1 - COMMAND_PREFIX - 1)
  assert.deepEqual(m.rows.map(r => [r.spans.map(x => x.text).join(''), r.rtl, r.first]), [['.Python-ב היצקנופ ונבתכ', true, true], ['second line', false, false]])
  assert.ok(m.rows[0].spans.some(x => x.style === BOLD) && m.rows[0].spans.some(x => x.style === CODE))
  assert.equal(modelCommand('שלום', 6, S), null)
})

test('user rows: one paragraph per line, literal', () => {
  const m = modelUser('שלום **עולם**\nsecond line', 40, S)!
  assert.deepEqual(
    m.rows.map(r => r.spans.map(s => s.text).join('')),
    ['**םלוע** םולש', 'second line'],
  )
  assert.ok(m.rows[0].first && !m.rows[1].first)
  assert.equal(modelUser('שלום', 2, S), null)
})

test('isolation: every RTL letter starts a new attribute run after an RTL letter or a number', () => {
  const pieces = isolateRow([{ text: 'םולש abc 12 ןב', style: 0 }])
  assert.deepEqual(pieces.map(p => p.text), ['ם', 'ו', 'ל', 'ש abc ', '12 ', 'ן', 'ב'])
  for (let i = 1; i < pieces.length; i++) assert.notEqual(pieces[i].tick, pieces[i - 1].tick)
})

test('isolation follows the final attributes across style spans', () => {
  const spans = [{ text: 'אב', style: 0 }, { text: 'ג', style: 1 }]
  // a style whose attributes differ starts its own run: no split needed
  assert.deepEqual(isolateRow(spans).map(p => [p.text, p.tick]), [['א', false], ['ב', true], ['ג', true]])
  // a style drawn with the same attributes continues the run: split
  assert.deepEqual(isolateRow(spans, (_s, t) => String(t)).map(p => [p.text, p.tick]), [['א', false], ['ב', true], ['ג', false]])
})

test('isolation: a text color override equal to the code tick still splits', () => {
  const palette = paletteFor('dark', '#b2bafa')!
  assert.equal(nudge(palette.text), palette.code)
  const attr = (style: number, tick: boolean) => propsKey(pieceProps(style, tick, palette))
  const m = modelAssistant('א`ב`', 40, true, S)!
  const row = m.rows.find(r => r.kind === 'text') as Extract<RowModel, { kind: 'text' }>
  const spans = row.rtl ? [...row.spans, ...row.lead] : [...row.lead, ...row.spans]
  const pieces = isolateRow(spans, attr)
  const runs: string[] = []
  let last = ''
  for (const p of pieces) {
    const k = attr(p.style, p.tick)
    if (runs.length && k === last) runs[runs.length - 1] += p.text
    else runs.push(p.text)
    last = k
  }
  for (const run of runs) assert.ok(stableUnderLtr(run), run)
})

// What a browser terminal does with the pieces: equal attributes merge into one span, and each
// span is laid out as its own LTR paragraph. Every span must come out in cell order, with no
// bracket mirrored by an odd level.
const uba = bidiFactory()
function domRuns(pieces: Piece[], attr: (style: number, tick: boolean) => string = (st, t) => `${st}|${t}`): string[] {
  const out: { text: string; key: string }[] = []
  for (const p of pieces) {
    const key = attr(p.style, p.tick)
    const prev = out[out.length - 1]
    if (prev && prev.key === key) prev.text += p.text
    else out.push({ text: p.text, key })
  }
  return out.map(r => r.text)
}
// Compared by grapheme cluster: a browser shapes a base and its marks as one unit, whatever order
// the marks' levels give them.
function stableUnderLtr(text: string): boolean {
  const levels = uba.getEmbeddingLevels(text, 'ltr')
  const cluster: number[] = []
  let c = 0
  for (const g of graphemes(text)) {
    for (let k = 0; k < g.length; k++) cluster.push(c)
    c++
  }
  const units = Array.from({ length: text.length }, (_, i) => i)
  for (const [start, end] of uba.getReorderSegments(text, levels)) {
    const seg = units.slice(start, end + 1).reverse()
    units.splice(start, seg.length, ...seg)
  }
  let next = 0
  for (const u of units) {
    if (cluster[u] === next) next++
    else if (cluster[u] !== next - 1) return false
  }
  let start = 0
  for (const g of graphemes(text)) {
    if (levels.levels[start] & 1 && uba.getMirroredCharacter(String.fromCodePoint(g.codePointAt(0)!))) return false
    start += g.length
  }
  return true
}

test('isolation: Arabic numbers form one group; a neutral between two groups splits them', () => {
  assert.equal(charClass('\u0661'), 'A')
  assert.equal(charClass('\u06F1'), 'D')
  for (const row of ['\u0661-\u0662', '\u0661 \u0662', '\u05DD\u05DC\u05D5\u05E2 \u0662-\u0661 \u05DD\u05D5\u05DC\u05E9', '\u0661\u066C\u0662\u0663\u0664']) {
    for (const run of domRuns(isolateRow([{ text: row, style: 0 }]))) assert.ok(stableUnderLtr(run), `${row}: ${run}`)
  }
  assert.deepEqual(isolateRow([{ text: '\u0661\u066C\u0662', style: 0 }]).map(p => p.text), ['\u0661\u066C\u0662'])
})

test('isolation: a cluster is classed by every scalar it holds (Prepend + letter)', () => {
  assert.equal(charClass('\u0600\u05D0'), 'R')
  const pieces = isolateRow([{ text: '\u0600\u05D0\u0600\u05D1', style: 0 }])
  assert.equal(pieces.length, 2)
})

test('isolation: a row\'s prefix and body are one row (a list number beside a word)', () => {
  const pieces = isolateRow([{ text: '\u05DD\u05D5\u05DC\u05E9', style: 0 }, { text: ' .1', style: 0 }])
  for (const run of domRuns(pieces)) assert.ok(stableUnderLtr(run), run)
})

// (A cluster that mixes an RTL letter with an Arabic number, U+0600 + a letter, can still reorder
// inside itself, a rare case the plugin accepts; left out here.)
const palettes = [paletteFor('dark')!, paletteFor('light')!, paletteFor('dark', '#b2bafa')!, paletteFor('dark', '#b0b8f8')!, paletteFor('light', '#5668f6')!]
test('isolation: every merged run of random mixed rows keeps its order under an LTR pass', () => {
  const alphabet = [...'\u05D0\u05D1\u05D2\u05E9\u05B0\u05BCab12\u0661\u0662\u06F5\u0628\u064E -.,()/:%+$#"']
  let seed = 7
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let n = 0; n < 4000; n++) {
    let row = ''
    const len = 1 + Math.floor(rand() * 14)
    for (let i = 0; i < len; i++) row += alphabet[Math.floor(rand() * alphabet.length)]
    const spans = rand() < 0.5 ? [{ text: row, style: 0 }] : [{ text: row.slice(0, len >> 1), style: 0 }, { text: row.slice(len >> 1), style: 1 }]
    for (const run of domRuns(isolateRow(spans))) assert.ok(stableUnderLtr(run), JSON.stringify({ row, run }))
    // the same rows under real palettes, overrides that collide with a tick included
    const palette = palettes[n % palettes.length]
    const attr = (st: number, t: boolean) => propsKey(pieceProps(st, t, palette))
    const styled = spans.map((sp, k) => ({ ...sp, style: k ? CODE : 0 }))
    for (const run of domRuns(isolateRow(styled, attr), attr)) assert.ok(stableUnderLtr(run), JSON.stringify({ row, run, palette }))
  }
})

test('palette and tick colors', () => {
  assert.equal(nudge('#ffffff'), '#fefefe')
  assert.equal(nudge('#000000'), '#010101')
  assert.equal(paletteFor('dark')!.text, '#ffffff')
  assert.equal(paletteFor('light')!.text, '#000000')
  assert.equal(paletteFor('dark-ansi'), null)
  assert.equal(paletteFor(undefined)!.text, '#ffffff')
  assert.equal(paletteFor('dark', '#d4d4d4')!.text, '#d4d4d4')
})

test('kept block rows give the same model as a first layout (streaming prefixes)', () => {
  const full = '## כותרת\n\nשלום **עולם** עם `src/app.ts`.\n\n- פריט 1\n- פריט 2\n\n| א | ב |\n|---|---|\n| 1 | 2 |\n\nסוף.'
  const first = modelAssistant(full, 70, true, S)
  for (let n = 1; n <= full.length; n += 7) modelAssistant(full.slice(0, n), 70, true, S)
  assert.deepEqual(modelAssistant(full, 70, true, S), first)
  assert.deepEqual(modelAssistant(full, 70, false, S)!.rows.length, first!.rows.length)
})

test('the memo is bounded by entries and by key length', () => {
  const m = new Memo<number>(3, 10)
  m.get('aaaaa', () => 1)
  m.get('bbbbb', () => 2)
  m.get('ccccc', () => 3)
  let calls = 0
  m.get('aaaaa', () => ++calls)
  assert.equal(calls, 1) // evicted by the character bound
})

test('the arabic setting reaches every row, and the block memo keeps the two apart', () => {
  const FORM = /[ﭐ-﷿ﹰ-﻿]/u
  const reply = 'مرحبا بالعالم\n\n| الاسم | الدور |\n|---|---|\n| علي | مهندس |'
  const all = (m: ReturnType<typeof modelAssistant>) => texts(m!.rows).join('\n')
  // the same text and width, one after the other: a memo keyed without the setting would reuse rows
  const letters = all(modelAssistant(reply, 40, true, S))
  const forms = all(modelAssistant(reply, 40, true, { ...S, arabic: 'forms' }))
  assert.ok(!FORM.test(letters))
  assert.ok(FORM.test(forms))
  assert.equal(all(modelAssistant(reply, 40, true, { ...S, arabic: 'letters' })), letters)
  const user = (s: Settings) => modelUser('سلام دنیا', 40, s)!.rows.map(r => r.spans.map(x => x.text).join('')).join('\n')
  assert.ok(!FORM.test(user(S)))
  assert.ok(FORM.test(user({ ...S, arabic: 'forms' })))
})

// List side: the outermost list places all its rows; each paragraph keeps its own text direction.
const textRows = (m: { rows: RowModel[] }) => m.rows.filter((r): r is Extract<RowModel, { kind: 'text' }> => r.kind === 'text')
const markerCol = (t: string) => t.length - t.trimEnd().length

test('an English item of a Hebrew list stays with its siblings: right side, marker on the right, LTR text', () => {
  const src = '- נקודה אחת\n  - תת-נקודה בעברית\n  - sub-item in English\n- נקודה שתיים'
  for (const columns of [80, 30]) {
    const rows = textRows(model(src, columns))
    assert.ok(rows.every(r => r.rtl), `${columns}`)
    const t = rows.map(rowText)
    const en = t.find(x => x.includes('sub-item'))!
    assert.ok(en.includes('sub-item in English -'), en)
    const he = t.find(x => x.includes('תירבעב'))!
    // both sub-items' markers in the same column from the right
    assert.equal(en.length - en.lastIndexOf('-'), he.length - he.lastIndexOf('-'))
  }
})

test('a long English item wraps right-aligned under one marker, its words in order', () => {
  const rows = textRows(model('- פריט\n- this English item is long enough to wrap over several rows here', 30))
  assert.ok(rows.every(r => r.rtl))
  const en = rows.slice(1).map(rowText)
  assert.ok(en[0].trimEnd().endsWith('-'), en[0])
  assert.ok(en.slice(1).every(x => !x.includes('-')))
  assert.equal(en.map(x => x.replace(/-\s*$/, '').trim()).join(' '), 'this English item is long enough to wrap over several rows here')
})

test('an English list keeps a Hebrew item on its left side; an English nested list inherits RTL', () => {
  const ltr = textRows(model('- first item in English\n- second English item\n- פריט בעברית', 60))
  assert.ok(ltr.every(r => !r.rtl))
  assert.ok(rowText(ltr[2]).startsWith('  - '), rowText(ltr[2]))
  const nested = textRows(model('- פריט בעברית\n  - nested one\n  - nested two', 60))
  assert.ok(nested.every(r => r.rtl))
})

test('ordered markers of English items in an RTL list keep their digits on the right', () => {
  const t = texts(model('1. ראשון\n2. second\n10. third', 40).rows).map(x => x.trimEnd())
  assert.deepEqual(t, ['ןושאר .1', 'second .2', 'third .3'])
})

test('what decides: code spans do not vote; no prose falls back to the reply, then LTR', () => {
  assert.ok(textRows(model('- `שלום` English words here', 60)).every(r => !r.rtl))
  const onlyCode = '- `שלום`\n- `עולם`'
  assert.ok(textRows(model(onlyCode, 60)).every(r => !r.rtl))
  const withReply = textRows(model('פסקה בעברית לפני הרשימה\n\n' + onlyCode, 60))
  assert.ok(withReply.slice(1).every(r => r.rtl))
})

test('a fence in an RTL list: marker row on the right, code at the margin with the prefix kept free', () => {
  const m = model('- פריט\n- ```js\n  const x = 1\n  ```', 40)
  const marker = m.rows.find(r => r.kind === 'text' && r.spans.length === 0)
  assert.ok(marker && marker.kind === 'text' && marker.rtl)
  const code = m.rows.find(r => r.kind === 'code')
  assert.ok(code && code.kind === 'code')
  assert.equal(code.indent, 2)
  assert.equal(code.inset, 4)
  const drawn = model('- פריט\n- ```py\n  x = "שלום"\n  ```', 40).rows.find(r => r.kind === 'text' && r.paint)
  assert.ok(drawn && drawn.kind === 'text' && !drawn.rtl && rowText(drawn).startsWith('  x = '))
})

test('every list row fits, at any width', () => {
  const src = '- נקודה\n  - sub item in English that is fairly long\n    1. עוד רמה\n- ```py\n  x = "שלום"\n  ```\n- > ציטוט'
  for (const columns of [12, 20, 33, 80]) {
    const m = modelAssistant(src, columns, true, S)
    if (m === null) continue
    for (const r of m.rows) if (r.kind === 'text') assert.ok(textWidth(rowText(r)) <= m.width, `${columns}: ${rowText(r)}`)
  }
})
