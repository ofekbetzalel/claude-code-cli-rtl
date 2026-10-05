// Engine suites for the prompt preview: Claude Code's suggestion through `prompt.suggest`, the box
// read at drawing time, and the band drawn above the engine's own.

import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'

const NATIVE = 'NATIVE-BAND'
const VIEW = { columns: 80, rows: 40 }
// the engine's own guess after a turn
const SUGGESTION = { kind: 'suggestion' as const }

const above = {
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 75, scroll: { offset: 0, bodyRows: 0 }, view: {} },
  viewport: VIEW,
}

// The world beneath the mod: the box holds `box.text`; a suggestion is shown when the box is empty;
// the clock moves when the test moves it. With `box.held` set, a read of the box answers (with the
// text it had when asked) only once the test calls `box.release()`, oldest first.
function world(on: On) {
  const waiting: (() => void)[] = []
  const box = {
    text: '',
    clock: mock.clock(on),
    held: false,
    // reads held now
    pending: () => waiting.length,
    release: () => {
      box.held = false
      for (const go of waiting.splice(0)) go()
    },
  }
  on('prompt.read', async () => {
    const text = box.text
    if (box.held) await new Promise<void>(resolve => waiting.push(resolve))
    return { value: { text, cursor: text.length } as never }
  })
  on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
  on('prompt.suggest', () => ({ isShown: box.text === '' }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{NATIVE}</Text>
  })
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{e.props.hint}</Text>
  })
  return box
}

function text(node: unknown): string {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  return ((node as { children?: unknown[] }).children ?? []).map(text).join('')
}

test('a Hebrew suggestion is previewed in visual order above the engine\'s band', async ($, on) => {
  world(on)
  expect((await $.prompt.suggest({ text: 'כן, הוסף בדיקות', origin: SUGGESTION })).isShown).toBe(true)
  const drawn = text(await (await $.ui.mount(above)).drawn())
  expect(drawn).toContain('תוקידב ףסוה ,ןכ')
  expect(drawn).toContain('»')
  expect(drawn).toContain(NATIVE)
})

test('a suggestion taken with Tab (no edit event) is previewed as the draft', async ($, on) => {
  const box = world(on)
  await $.prompt.suggest({ text: 'כן, הוסף בדיקות', origin: SUGGESTION })
  box.text = 'כן, הוסף בדיקות'
  const drawn = text(await (await $.ui.mount(above)).drawn())
  expect(drawn).toContain('תוקידב ףסוה ,ןכ')
  expect(drawn).toContain('✎')
})

test('an English suggestion leaves the band to the engine', async ($, on) => {
  world(on)
  await $.prompt.suggest({ text: 'run the tests', origin: SUGGESTION })
  expect(text(await (await $.ui.mount(above)).drawn())).toBe(NATIVE)
})

test('preview off: no band', { options: { preview: 'off' } }, async ($, on) => {
  world(on)
  await $.prompt.suggest({ text: 'כן, הוסף בדיקות', origin: SUGGESTION })
  expect(text(await (await $.ui.mount(above)).drawn())).toBe(NATIVE)
})

const hint = (isDraft: boolean) => ({
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'PromptHint' as const,
  props: { isDraft, isWorking: false, hint: '? for shortcuts' },
  viewport: VIEW,
})

test('a prompt recalled from history (no edit event) is previewed once the hint line says the box holds text', async ($, on) => {
  const box = world(on)
  box.text = 'ענה במילה אחת: תודה'
  expect(text(await (await $.ui.mount(above)).drawn())).toBe(NATIVE)
  expect(text(await (await $.ui.mount(hint(true))).drawn())).toBe('? for shortcuts')
  const drawn = text(await (await $.ui.mount(above)).drawn())
  expect(drawn).toContain('הדות :תחא הלימב הנע')
  expect(drawn).toContain('✎')
})

test('a later step through history (the hint line already says the box holds text) shows at the next read', async ($, on) => {
  const box = world(on)
  const band = await $.ui.mount(above)
  box.text = 'ענה במילה אחת: תודה'
  await $.ui.mount(hint(true))
  expect(text(await band.drawn())).toContain('הדות :תחא הלימב הנע')
  box.text = 'ענה במילה אחת: שלום'
  await box.clock.advance(400)
  expect(text(await band.drawn())).toContain('םולש :תחא הלימב הנע')
  box.text = '/sugg'
  await box.clock.advance(400)
  expect(text(await band.drawn())).toBe(NATIVE)
})

test('a box sent without prompt.submit (a slash command) drops the suggestion', async ($, on) => {
  const box = world(on)
  await $.prompt.suggest({ text: 'כן, הוסף בדיקות', origin: SUGGESTION })
  const band = await $.ui.mount(above)
  // typed: the band reads it (prompt.edit is the engine's to raise)
  box.text = '/cost'
  await $.ui.mount(hint(true))
  await box.clock.advance(400)
  box.text = ''
  await $.ui.mount(hint(false))
  expect(text(await band.drawn())).toBe(NATIVE)
})

test('preview draft: the draft only, never the suggestion', { options: { preview: 'draft' } }, async ($, on) => {
  const box = world(on)
  await $.prompt.suggest({ text: 'כן, הוסף בדיקות', origin: SUGGESTION })
  expect(text(await (await $.ui.mount(above)).drawn())).toBe(NATIVE)
  box.text = 'שלום'
  await $.ui.mount(hint(true))
  expect(text(await (await $.ui.mount(above)).drawn())).toContain('םולש')
})

test('a suggestion taken with Tab and sent at once (no read in between) is dropped', async ($, on) => {
  const box = world(on)
  await $.prompt.suggest({ text: '/cost שלום', origin: SUGGESTION })
  const band = await $.ui.mount(above)
  box.text = '/cost שלום'
  await $.ui.mount(hint(true))
  expect(text(await band.drawn())).toContain('✎')
  box.text = ''
  await $.ui.mount(hint(false))
  expect(text(await band.drawn())).toBe(NATIVE)
})

const working = { ...above, props: { ...above.props, isWorking: true } }

test('while Claude Code works: no suggestion, but a draft typed meanwhile is shown', async ($, on) => {
  const box = world(on)
  await $.prompt.suggest({ text: 'כן, הוסף בדיקות', origin: SUGGESTION })
  expect(text(await (await $.ui.mount(working)).drawn())).toBe(NATIVE)
  box.text = 'שלום'
  await $.ui.mount(hint(true))
  expect(text(await (await $.ui.mount(working)).drawn())).toContain('םולש')
})

// A drawing whose read of the box answers late, after `act`.
async function lateDraw($: Engine, box: ReturnType<typeof world>, act: () => Promise<unknown>) {
  box.text = 'טיוטה ישנה'
  await $.ui.mount(hint(true))
  box.held = true
  const drawing = $.ui.mount(above)
  // the drawing's read is out before anything happens
  for (let i = 0; i < 50 && box.pending() === 0; i++) await box.clock.advance(0)
  expect(box.pending()).toBe(1)
  await act()
  box.release()
  const band = await drawing
  // whatever the send redrew has settled
  await box.clock.advance(1)
  return text(await band.drawn())
}

test('a drawing whose read is overtaken by a sent prompt draws no old draft', async ($, on) => {
  const box = world(on)
  expect(await lateDraw($, box, async () => {
    box.text = ''
    await $.prompt.submit({ text: 'טיוטה ישנה', origin: { kind: 'composer' } } as never)
  })).toBe(NATIVE)
})

test('a drawing whose read is overtaken by /clear draws no old draft', async ($, on) => {
  const box = world(on)
  expect(await lateDraw($, box, async () => {
    box.text = ''
    await $.session.end({ reason: 'clear', sessionId: 's', resume: {} } as never)
  })).toBe(NATIVE)
})

test('a drawing whose read answers late with nothing in between draws the draft', async ($, on) => {
  const box = world(on)
  expect(await lateDraw($, box, async () => {})).toContain('הנשי הטויט')
})
