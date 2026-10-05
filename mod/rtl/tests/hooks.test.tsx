// Engine suites: the hooks module under the engine's own render chain (`claude plugin test mod/rtl`).
// The test's hooks sit beneath the plugin and stand for the engine, so a passthrough draws the
// test's NATIVE marker.

import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

const NATIVE = 'NATIVE-DRAWING'
const VIEW = { columns: 80, rows: 40 }

const assistant = (text: string, columns = 80) => ({
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'AssistantMessage' as const,
  props: { text, isFirstOfReply: true },
  viewport: { ...VIEW, columns },
})

function native(on: On) {
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{NATIVE}</Text>
  })
  on('ui.render', { component: 'UserMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{NATIVE}</Text>
  })
  on('ui.render', { component: 'CommandOutput' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{NATIVE}</Text>
  })
}

const command = (text: string, isErrored = false) => ({
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'CommandOutput' as const,
  props: { command: 'recap', args: '', text, isErrored },
  viewport: VIEW,
})

// Every string in a drawn tree, and every color prop.
function walk(node: unknown, out: { text: string[]; colors: string[] }): void {
  if (typeof node === 'string') {
    out.text.push(node)
    return
  }
  if (!node || typeof node !== 'object') return
  const n = node as { props?: Record<string, unknown>; children?: unknown[] }
  const color = n.props?.color
  if (typeof color === 'string') out.colors.push(color)
  for (const c of n.children ?? []) walk(c, out)
}
// The drawn leaves in order, each string with the color it inherits.
function leaves(node: unknown, color: string | undefined, out: { text: string; color: string | undefined }[]): void {
  if (typeof node === 'string') {
    out.push({ text: node, color })
    return
  }
  if (!node || typeof node !== 'object') return
  const n = node as { props?: Record<string, unknown>; children?: unknown[] }
  const c = typeof n.props?.color === 'string' ? (n.props.color as string) : color
  for (const k of n.children ?? []) leaves(k, c, out)
}
const flat = (tree: unknown) => {
  const out = { text: [] as string[], colors: [] as string[] }
  walk(tree, out)
  return { text: out.text.join(''), colors: out.colors }
}

test('a reply without RTL text is the engine\'s own', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('Hello, world.'))
  expect(flat(await ui.drawn()).text).toContain(NATIVE)
})

test('a Hebrew reply is drawn by the mod, right-aligned, in visual order', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('שלום עולם'))
  const drawn = flat(await ui.drawn())
  expect(drawn.text).not.toContain(NATIVE)
  expect(drawn.text).toContain('ם')
  expect(drawn.text.replace(/\s+/g, ' ')).toContain('םלוע םולש')
})

test('a Hebrew reply alternates its text color per letter (span isolation)', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('שלום עולם'))
  const { colors } = flat(await ui.drawn())
  expect(colors).toContain('#ffffff')
  expect(colors).toContain('#fefefe')
})

test('a reply with mermaid is the engine\'s own', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('שלום\n\n```mermaid\ngraph TD\n```'))
  expect(flat(await ui.drawn()).text).toContain(NATIVE)
})

test('a Hebrew table is drawn by the mod', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('| שם | תפקיד |\n|---|---|\n| עדה | ראש צוות |'))
  const drawn = flat(await ui.drawn())
  expect(drawn.text).not.toContain(NATIVE)
  expect(drawn.text).toContain('┌')
})

test('order off leaves every reply to the engine', { options: { order: 'off' } }, async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('שלום עולם'))
  expect(flat(await ui.drawn()).text).toContain(NATIVE)
})

test('a reply past the node budget is still drawn, without ticks', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('שלום עולם '.repeat(2400)))
  const drawn = flat(await ui.drawn())
  expect(drawn.text).not.toContain(NATIVE)
  expect(drawn.colors).not.toContain('#fefefe')
})

test('a reply past the text budget is the engine\'s own', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('שלום עולם '.repeat(10000)))
  expect(flat(await ui.drawn()).text).toContain(NATIVE)
})

test('the person\'s Hebrew prompt is drawn by the mod; a task notification is not', async ($, on) => {
  native(on)
  const mine = await $.ui.mount({
    plugin: 'rtl',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'שלום עולם', origin: { kind: 'composer' }, isExpanded: false },
    viewport: VIEW,
  })
  const drawn = flat(await mine.drawn())
  expect(drawn.text).toContain('❯')
  expect(drawn.text).not.toContain(NATIVE)
  const note = await $.ui.mount({
    plugin: 'rtl',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'שלום עולם', origin: { kind: 'task-notification' }, isExpanded: false },
    viewport: VIEW,
  })
  expect(flat(await note.drawn()).text).toContain(NATIVE)
})

test('a light theme draws RTL rows in black', async ($, on) => {
  native(on)
  on('config.set', async (_$, e) => ({ value: e.value }))
  await $.config.set({ key: 'theme', value: 'light', previous: 'dark', provider: { plugin: 'engine', tier: 'core' }, origin: { kind: 'composer' } })
  const ui = await $.ui.mount(assistant('שלום עולם'))
  const { colors } = flat(await ui.drawn())
  expect(colors).toContain('#000000')
  expect(colors).toContain('#010101')
})

test('a reply past the node budget is still drawn without ticks, and says so', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('שלום עולם '.repeat(2400)))
  const drawn = flat(await ui.drawn())
  expect(drawn.text).not.toContain(NATIVE)
  expect(drawn.text).toContain('rtl: too long to isolate')
})

test('a reply of many short Hebrew lines past the node budget falls back, and says so', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('א\n'.repeat(6000)))
  const drawn = flat(await ui.drawn())
  expect(drawn.text).toContain(NATIVE)
  expect(drawn.text).toContain('rtl: too long to draw right-to-left')
})

test('a prompt of many short Hebrew lines past the node budget falls back, and says so', async ($, on) => {
  native(on)
  const ui = await $.ui.mount({
    plugin: 'rtl',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'א\n'.repeat(3000), origin: { kind: 'composer' }, isExpanded: false },
    viewport: VIEW,
  })
  const drawn = flat(await ui.drawn())
  expect(drawn.text).toContain(NATIVE)
  expect(drawn.text).toContain('rtl:')
})

test('a cluster longer than a string child falls back', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('א' + '\u05B0'.repeat(10001)))
  expect(flat(await ui.drawn()).text).toContain(NATIVE)
})

test('a C1 control in a fence beside Hebrew prose is dropped from the Code leaf', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('שלום\n\n```\na\u0085b\u0007c\n```'))
  const code = await ui.find({ type: 'Code' })
  expect(code).toBeDefined()
  expect(code!.text).not.toContain('\u0085')
  expect(code!.text).not.toContain('\u0007')
})

test('a fence with a Hebrew comment: its English lines stay in Code, the comment is drawn in visual order and green', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('```python\ndef f():\n    # הערה\n    return "שלום"\n```'))
  const codes = await ui.findAll({ type: 'Code' })
  expect(codes.length).toBe(1)
  expect(codes[0].text).toContain('def f():')
  const drawn = flat(await ui.drawn())
  expect(drawn.text).not.toContain(NATIVE)
  expect(drawn.text).toContain('return "')
  const out: { text: string; color: string | undefined }[] = []
  leaves(await ui.drawn(), undefined, out)
  const letters = out.filter(l => /[\u05D0-\u05EA]/.test(l.text))
  expect(letters.map(l => l.text.replace(/[^\u05D0-\u05EA]/g, '')).join('')).toBe('הרעהםולש')
  expect(letters.slice(0, 4).every(l => l.color === '#46a758' || l.color === '#47a659')).toBe(true)
  expect(letters.slice(4).every(l => l.color === '#e5484d' || l.color === '#e4494e')).toBe(true)
})

test('a command\'s Hebrew output (/recap) is drawn by the mod in visual order; English and error rows are the engine\'s', async ($, on) => {
  native(on)
  const he = flat(await (await $.ui.mount(command('כתבנו פונקציה ב-Python. מחכה לפקודה הבאה.'))).drawn())
  expect(he.text).not.toContain(NATIVE)
  expect(he.text).toContain('⎿')
  expect(he.text.replace(/\s+/g, ' ')).toContain('.האבה הדוקפל הכחמ .Python-ב היצקנופ ונבתכ')
  expect(he.colors).toContain('#ffffff')
  expect(flat(await (await $.ui.mount(command('Total cost: $0.01'))).drawn()).text).toContain(NATIVE)
  expect(flat(await (await $.ui.mount(command('שגיאה', true))).drawn()).text).toContain(NATIVE)
})

test('a text color override that equals a tick still alternates the drawn colors', { options: { textColor: '#b2bafa' } }, async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('א`ב`'))
  const out: { text: string; color: string | undefined }[] = []
  leaves(await ui.drawn(), undefined, out)
  const letters = out.filter(l => /[\u05D0-\u05EA]/.test(l.text))
  expect(letters.length).toBe(2)
  expect(letters[0].color).not.toBe(letters[1].color)
})

for (const isExpanded of [false, true]) {
  test(`the person's Hebrew prompt is drawn by the mod with isExpanded ${isExpanded}`, async ($, on) => {
    native(on)
    const ui = await $.ui.mount({
      plugin: 'rtl',
      surface: 'terminal',
      component: 'UserMessage',
      props: { text: 'שלום עולם', origin: { kind: 'composer' }, isExpanded },
      viewport: VIEW,
    })
    expect(flat(await ui.drawn()).text).not.toContain(NATIVE)
  })
}

test('a Hebrew message from another agent keeps the engine\'s drawing', async ($, on) => {
  native(on)
  const ui = await $.ui.mount({
    plugin: 'rtl',
    surface: 'terminal',
    component: 'UserMessage',
    props: { text: 'שלום עולם', origin: { kind: 'peer' } as never, isExpanded: false },
    viewport: VIEW,
  })
  expect(flat(await ui.drawn()).text).toContain(NATIVE)
})

test('Arabic is drawn in plain letters by default', async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('مرحبا بالعالم'))
  const drawn = flat(await ui.drawn()).text
  expect(drawn).not.toContain(NATIVE)
  expect(drawn).toContain('م')
  expect(/[ﭐ-﷿ﹰ-﻿]/u.test(drawn)).toBe(false)
})

test('arabic forms draws presentation forms', { options: { arabic: 'forms' } }, async ($, on) => {
  native(on)
  const ui = await $.ui.mount(assistant('مرحبا بالعالم'))
  expect(/[ﭐ-﷿ﹰ-﻿]/u.test(flat(await ui.drawn()).text)).toBe(true)
})

