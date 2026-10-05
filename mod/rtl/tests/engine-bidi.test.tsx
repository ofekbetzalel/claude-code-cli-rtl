// Engine suites for terminals where Claude Code reorders RTL text itself (WT_SESSION set, or
// TERM_PROGRAM=vscode), and for the draft pane (`/rtl-draft`).

import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'

import { engineReorder } from '../src/bidi.ts'
import { CURSOR } from '../src/preview.ts'

const NATIVE = 'NATIVE-DRAWING'
const VIEW = { columns: 80, rows: 40 }

const assistant = (text: string) => ({
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'AssistantMessage' as const,
  props: { text, isFirstOfReply: true },
  viewport: VIEW,
})
const above = {
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 75, scroll: { offset: 0, bodyRows: 0 }, view: {} },
  viewport: VIEW,
}
const pane = {
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'Pane' as const,
  requestId: 'rtl-draft',
  props: { title: 'Draft', isFocused: false, bodyColumns: 40, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 10 }, view: {} },
  viewport: VIEW,
}

// The world beneath the mod. `box`: the prompt box; with `box.held`, a read answers (with what the box
// held when asked) once `release` is called. `placed`: the draft pane is open, and placed or not
// (`narrow`: the engine opens it unplaced). `fail`: the next open or close of the pane throws.
type Box = { text: string; cursor: number; held?: boolean; placed?: boolean; narrow?: boolean; fail?: 'open' | 'close' }
const waiting: (() => void)[] = []
const release = (box: Box) => {
  box.held = false
  for (const go of waiting.splice(0)) go()
}
function world(on: On, box: Box) {
  const clock = mock.clock(on)
  on('ui.panes', () => ({ value: (box.placed === undefined ? [] : [{ id: 'rtl-draft', title: 'Draft', isShown: true, isFocused: false, isPlaced: box.placed }]) as never }))
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{NATIVE}</Text>
  })
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{NATIVE}</Text>
  })
  on('prompt.read', async () => {
    const seen = { text: box.text, cursor: box.cursor }
    if (box.held) await new Promise<void>(resolve => waiting.push(resolve))
    return { value: seen as never }
  })
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
  on('config.list', () => ({ value: [] as never }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: 's1' }) as never)
  on('ui.open', () => {
    if (box.fail === 'open') return { deny: 'open failed' } as never
    box.placed = !box.narrow
    return { value: (box.placed ? { isPlaced: true } : { isPlaced: false, reason: 'narrow' }) as never }
  })
  on('ui.close', () => {
    if (box.fail === 'close') return { deny: 'close failed' } as never
    box.placed = undefined
    return { value: undefined } as never
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  return clock
}

type Node = { type?: string; children?: unknown[] }
function text(node: unknown): string {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  return ((node as Node).children ?? []).map(text).join('')
}
// The cells as Claude Code draws them where it reorders: each outermost Text reordered on its own.
function cells(node: unknown): string {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  if ((node as Node).type === 'Text') return engineReorder(text(node))
  return ((node as Node).children ?? []).map(cells).join('')
}

const hint = {
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'PromptHint' as const,
  props: { isDraft: true, isWorking: false, hint: '? for shortcuts' },
  viewport: VIEW,
}

const START = { cwd: '/', surface: 'terminal' as const, isInteractive: true }
const REPLY = 'שלום (עולם), זו גרסה 2.1.289 של abc.'
const VISUAL = '.abc לש 2.1.289 הסרג וז ,(םלוע) םולש'

test('in Windows Terminal (WT_SESSION) each Text turns back into the visual row', async ($, on) => {
  mock.env(on, { WT_SESSION: 'x' })
  world(on, { text: '', cursor: 0 })
  await $.session.start(START)
  const drawn = await (await $.ui.mount(assistant(REPLY))).drawn()
  expect(cells(drawn)).toContain(VISUAL)
  // drawn as one Text, the engine would reverse it
  expect(text(drawn)).not.toContain(VISUAL)
})

test('in the VS Code terminal too', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'vscode' })
  world(on, { text: '', cursor: 0 })
  await $.session.start(START)
  expect(cells(await (await $.ui.mount(assistant(REPLY))).drawn())).toContain(VISUAL)
})

test('elsewhere a row is one Text in visual order, as before', async ($, on) => {
  mock.env(on, { TERM_PROGRAM: 'herdr' })
  world(on, { text: '', cursor: 0 })
  await $.session.start(START)
  expect(text(await (await $.ui.mount(assistant(REPLY))).drawn())).toContain(VISUAL)
})

test('/rtl-draft opens the pane with a cursor, the band leaves the draft to it, and closes it again', async ($, on) => {
  mock.env(on, {})
  const box = { text: 'שלום עולם', cursor: 4 }
  world(on, box)
  await $.session.start(START)
  // the box turned from empty to holding text: the band reads it
  await (await $.ui.mount(hint)).drawn()
  expect(text(await (await $.ui.mount(above)).drawn())).toContain('םלוע םולש')
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  const drawnPane = text(await (await $.ui.mount(pane)).drawn())
  expect(drawnPane).toContain(`םלוע ${CURSOR}םולש`)
  expect(text(await (await $.ui.mount(above)).drawn())).not.toContain('םולש')
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  expect(text(await (await $.ui.mount(above)).drawn())).toContain('םלוע םולש')
})

test('in Windows Terminal the pane\'s cells show the bar where the cursor stands', async ($, on) => {
  mock.env(on, { WT_SESSION: 'x' })
  const box = { text: 'שלום, זה טקסט עם Claude Code (כך)', cursor: 0 }
  world(on, box)
  await $.session.start(START)
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  const mounted = await $.ui.mount(pane)
  expect(cells(await mounted.drawn())).toContain(`Claude Code םע טסקט הז ,םולש${CURSOR}`)
  box.cursor = 1
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  expect(cells(await mounted.drawn())).toContain(`Claude Code םע טסקט הז ,םול${CURSOR}ש`)
})

test('a pane read overtaken by a cleared session does not bring the old draft back', async ($, on) => {
  const box: Box = { text: 'טיוטה ישנה', cursor: 10 }
  world(on, box)
  await $.session.start(START)
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  box.held = true
  const mounted = $.ui.mount(pane)
  box.text = ''
  box.cursor = 0
  await $.session.end({ sessionId: 's1', reason: 'clear' } as never)
  release(box)
  expect(text(await (await mounted).drawn())).not.toContain('הנשי')
})

test('an empty line of the draft keeps its row in the pane', async ($, on) => {
  world(on, { text: 'שלום\n\nעולם', cursor: 10 })
  await $.session.start(START)
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  const root = (await (await $.ui.mount(pane)).drawn()) as Node
  const rows = (root.children ?? []).filter(c => c && typeof c === 'object') as Node[]
  expect(rows.map(text)).toEqual(['םולש', ' ', `${CURSOR}םלוע`])
})

test('a bar typed in the draft is text, and only the cursor scrolls the pane', async ($, on) => {
  const box: Box = { text: 'שלום\n│', cursor: 0 }
  world(on, box)
  await $.session.start(START)
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  const drawn = text(await (await $.ui.mount(pane)).drawn())
  expect(drawn).toContain(`םולש${CURSOR}`)
  expect(drawn.split(CURSOR).length).toBe(3)
})

const VARIANTS: Record<string, string>[] = [{}, { preview: 'off' }]
for (const options of VARIANTS) {
  test(`an English draft recalled from history (no edit event) shows in the pane (${JSON.stringify(options)})`, { options }, async ($, on) => {
    const box: Box = { text: 'alpha', cursor: 5 }
    const clock = world(on, box)
    await $.session.start(START)
    await $.command.run({ command: 'rtl-draft', args: '' } as never)
    const mounted = await $.ui.mount(pane)
    await (await $.ui.mount(hint)).drawn()
    expect(text(await mounted.drawn())).toContain(`alpha${CURSOR}`)
    box.text = 'beta'
    box.cursor = 4
    await clock.advance(400)
    expect(text(await mounted.drawn())).toContain(`beta${CURSOR}`)
  })
}

test('/rtl-draft runs at once while a turn is in flight', async ($, on) => {
  const registered: { name: string; immediate?: true }[] = []
  on('command.register', (_$, e) => {
    registered.push(e)
    return { value: { command: e.name } } as never
  })
  world(on, { text: '', cursor: 0 })
  await $.session.start(START)
  expect(registered.find(c => c.name === 'rtl-draft')?.immediate).toBe(true)
})

test('an open or close of the pane that fails answers in text and changes nothing', async ($, on) => {
  const box: Box = { text: 'שלום עולם', cursor: 9 }
  world(on, box)
  await $.session.start(START)
  await (await $.ui.mount(hint)).drawn()
  const band = async () => text(await (await $.ui.mount(above)).drawn())
  box.fail = 'open'
  expect(JSON.stringify(await $.command.run({ command: 'rtl-draft', args: '' } as never))).toContain('could not be opened')
  expect(await band()).toContain('םלוע םולש')
  box.fail = undefined
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  expect(text(await (await $.ui.mount(pane)).drawn())).toContain(CURSOR)
  expect(await band()).not.toContain('םולש')
  box.fail = 'close'
  expect(JSON.stringify(await $.command.run({ command: 'rtl-draft', args: '' } as never))).toContain('could not be closed')
  expect(await band()).not.toContain('םולש')
  box.fail = undefined
  expect(JSON.stringify(await $.command.run({ command: 'rtl-draft', args: '' } as never))).toContain('Draft pane closed.')
  expect(await band()).toContain('םלוע םולש')
})

test('a pane the engine has not placed leaves the draft to the band until it is drawn', async ($, on) => {
  const box: Box = { text: 'שלום עולם', cursor: 9, narrow: true }
  const clock = world(on, box)
  await $.session.start(START)
  await (await $.ui.mount(hint)).drawn()
  await $.command.run({ command: 'rtl-draft', args: '' } as never)
  expect(text(await (await $.ui.mount(above)).drawn())).toContain('םלוע םולש')
  // the terminal widens and the engine places the pane; the harness draws no unplaced pane, so the
  // band is redrawn here by a cursor move the poll sees
  box.placed = true
  box.cursor = 8
  await clock.advance(400)
  expect(text(await (await $.ui.mount(above)).drawn())).not.toContain('םולש')
})
