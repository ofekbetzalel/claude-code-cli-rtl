// Engine suites for the recap band (`recap: on`): the engine's idle notification, three minutes on a
// mocked clock, the session's fork answered by the test, and the band drawn above the engine's own.

import type { On } from 'claude-code'
import { expect, mock, test, type Engine } from 'claude-code/testing'

const NATIVE = 'NATIVE-BAND'
const VIEW = { columns: 80, rows: 40 }
const ON = { options: { recap: 'on' } }
const HEBREW = 'מתכננים טיול לגליל; הצעד הבא: לבדוק את מזג האוויר.'

const above = {
  plugin: 'rtl',
  surface: 'terminal' as const,
  component: 'AbovePrompt' as const,
  props: { hasSurvey: false, isWorking: false, maxRows: 12, bodyColumns: 75, scroll: { offset: 0, bodyRows: 0 }, view: {} },
  viewport: VIEW,
}

// The world beneath the mod: the native recap off (`forks.native`; `forks.unreadable` makes `/config`
// throw), an empty prompt, no agents, and a fork that answers `reply` and counts its calls; with
// `held`, it answers only at `forks.release()`.
// A prompt whose text starts with DROP is dropped, as a blocking hook drops it.
function world(on: On, reply = HEBREW, nativeRecap = false, held = false) {
  const forks = { count: 0, native: nativeRecap, unreadable: false, release: () => {}, session: 'session-1' }
  on('session.surface', () => ({ value: 'terminal' as const }))
  on('config.list', () => {
    if (forks.unreadable) throw new Error('config unreadable')
    return { value: [{ key: 'recap', label: 'Session recap', kind: 'boolean', value: forks.native }] as never }
  })
  on('prompt.read', () => ({ value: { text: '', cursor: 0 } as never }))
  on('agent.list', () => ({ value: [] }))
  on('model.fork', async () => {
    forks.count++
    if (held) await new Promise<void>(resolve => (forks.release = resolve))
    return { value: { isAnswered: true, text: reply, usage: {} } as never }
  })
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }) as never)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.id', () => ({ value: forks.session }) as never)
  on('prompt.submit', (_$, e) => (e.text.startsWith('DROP') ? { drop: 'blocked' } : { text: e.text }) as never)
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('classic.Notification', () => ({}) as never)
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{NATIVE}</Text>
  })
  return forks
}

// A prompt from the person and the main turn it starts.
async function exchange($: Engine, n: number) {
  await $.prompt.submit({ text: `prompt ${n}`, origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: `prompt ${n}`, turnId: `t${n}` })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: `t${n}`, reason: 'completed' } as never)
}

const idle = ($: Engine) => $.classic.Notification({ message: 'Claude is waiting for your input', notification_type: 'idle_prompt' } as never)

function text(node: unknown): string {
  if (typeof node === 'string') return node
  if (!node || typeof node !== 'object') return ''
  return ((node as { children?: unknown[] }).children ?? []).map(text).join('')
}

test('the band is drawn three minutes after the idle notification, above the engine\'s own', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on)
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await idle($)
  await clock.advance(179_000)
  expect(forks.count).toBe(0)
  expect(text(await (await $.ui.mount(above)).drawn())).toBe(NATIVE)
  await clock.advance(1_000)
  expect(forks.count).toBe(1)
  const drawn = text(await (await $.ui.mount(above)).drawn())
  expect(drawn).toContain('recap')
  // the Hebrew summary in visual order
  expect(drawn).toContain('ריוואה')
  expect(drawn).toContain(NATIVE)
  // the next prompt clears it
  await $.prompt.submit({ text: 'next', origin: { kind: 'composer' } } as never)
  expect(text(await (await $.ui.mount(above)).drawn())).toBe(NATIVE)
})

// A key in the prompt (`prompt.edit`) is not an engine call a test can make; the gate's own suite
// covers it. A new main turn stands for it here.
test('a new turn after the idle notification cancels the recap, and no request is made', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on)
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await idle($)
  await clock.advance(60_000)
  await $.turn.start({ text: '', turnId: 'wake' })
  await clock.advance(200_000)
  expect(forks.count).toBe(0)
  expect(text(await (await $.ui.mount(above)).drawn())).toBe(NATIVE)
})

test('no band and no request before three prompts, or while the native recap is on', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on, HEBREW, true)
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await idle($)
  await clock.advance(200_000)
  expect(forks.count).toBe(0)
})

test('off by default: the idle notification starts nothing', async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on)
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await idle($)
  await clock.advance(200_000)
  expect(forks.count).toBe(0)
})

// The fork asked and still out when something happens: its answer must not be shown.
async function late($: Engine, on: On, act: (forks: ReturnType<typeof world>) => Promise<unknown>) {
  const clock = mock.clock(on)
  const forks = world(on, HEBREW, false, true)
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await idle($)
  await clock.advance(180_000)
  expect(forks.count).toBe(1)
  await act(forks)
  forks.release()
  await clock.advance(1_000)
  return text(await (await $.ui.mount(above)).drawn())
}

test('an answer that arrives after a new main turn is dropped', ON, async ($, on) => {
  expect(await late($, on, () => $.turn.start({ text: '', turnId: 'auto' }))).toBe(NATIVE)
})

test('an answer that arrives after a prompt from elsewhere is dropped', ON, async ($, on) => {
  expect(await late($, on, () => $.prompt.submit({ text: 'from a plugin', origin: { kind: 'plugin', plugin: 'other' } } as never))).toBe(NATIVE)
})

test('an answer that arrives after the native recap was turned on is dropped', ON, async ($, on) => {
  expect(await late($, on, async forks => (forks.native = true))).toBe(NATIVE)
})

test('an answer that arrives after the session ended is dropped', ON, async ($, on) => {
  expect(await late($, on, () => $.session.end({ reason: 'clear', sessionId: 's', resume: {} } as never))).toBe(NATIVE)
})

test('the same answer, with nothing in between, is shown', ON, async ($, on) => {
  expect(await late($, on, async () => {})).toContain('ריוואה')
})

test('a dropped prompt does not count toward the three', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on)
  await exchange($, 1)
  await exchange($, 2)
  await $.prompt.submit({ text: 'DROP this', origin: { kind: 'composer' } } as never)
  await $.turn.start({ text: '', turnId: 'auto' })
  await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: 'auto', reason: 'completed' } as never)
  await idle($)
  await clock.advance(200_000)
  expect(forks.count).toBe(0)
})

test('the band steps back while the model works', ON, async ($, on) => {
  const clock = mock.clock(on)
  world(on)
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await idle($)
  await clock.advance(180_000)
  expect(text(await (await $.ui.mount(above)).drawn())).toContain('ריוואה')
  expect(text(await (await $.ui.mount({ ...above, props: { ...above.props, isWorking: true } })).drawn())).toBe(NATIVE)
})

test('the counts outlive a reload: after one recap, two more prompts bring the next', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on)
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await idle($)
  await clock.advance(180_000)
  expect(forks.count).toBe(1)
  // what a reload raises: the counts come back from the session
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  for (let n = 4; n <= 5; n++) await exchange($, n)
  await idle($)
  await clock.advance(180_000)
  expect(forks.count).toBe(2)
})

test('a resume to another conversation starts the counts over', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on)
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await $.session.end({ reason: 'resume', sessionId: 'session-1', resume: {} } as never)
  forks.session = 'session-2'
  await exchange($, 4)
  await idle($)
  await clock.advance(180_000)
  expect(forks.count).toBe(0)
})

test('a prompt counted while the kept counts are read is added to them', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on)
  // the kept counts answer late
  let answer = () => {}
  const late = new Promise<void>(resolve => (answer = resolve))
  let holding = false
  on('state.get', async (_$, e, next) => {
    if (holding) await late
    return next(e)
  })
  await exchange($, 1)
  await exchange($, 2)
  holding = true
  const starting = $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await exchange($, 3)
  answer()
  await starting
  await idle($)
  await clock.advance(180_000)
  expect(forks.count).toBe(1)
})

test('saves land in order: an older one held back never overwrites a newer one', ON, async ($, on) => {
  world(on)
  let release = () => {}
  const held = new Promise<void>(resolve => (release = resolve))
  let first = true
  // the prompt counts of the saves, in the order they reach the session
  const landed: number[] = []
  on('state.set', async (_$, e, next) => {
    if (first) {
      first = false
      await held
    }
    const result = await next(e)
    landed.push((e.value as { prompts: number }).prompts)
    return result
  })
  const one = exchange($, 1)
  await exchange($, 2)
  release()
  await one
  for (let i = 0; i < 20 && landed.length < 2; i++) await (await $.ui.mount(above)).drawn()
  expect(landed).toEqual([1, 2])
})

test('no recap while the kept counts are read; the kept recaps set the baseline and the hint', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on)
  // the kept counts answer late while `holding`
  let answer = () => {}
  const late = new Promise<void>(resolve => (answer = resolve))
  let holding = false
  on('state.get', async (_$, e, next) => {
    if (holding) await late
    return next(e)
  })
  const auto = async (id: string) => {
    await $.turn.start({ text: '', turnId: id })
    await $.turn.complete({ answer: 'ok', durationMs: 1, isAborted: false, turnId: id, reason: 'completed' } as never)
  }
  const recapAfter = async (from: number, to: number) => {
    for (let n = from; n <= to; n++) await exchange($, n)
    await idle($)
    await clock.advance(180_000)
  }
  // three recaps (at 3, 5 and 7 prompts), then two prompts more: 9 prompts, the last recap at 7
  await recapAfter(1, 3)
  await recapAfter(4, 5)
  await recapAfter(6, 7)
  expect(forks.count).toBe(3)
  for (let n = 8; n <= 9; n++) await exchange($, n)
  // a reload whose kept counts answer late
  holding = true
  const starting = $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  // due by the prompts counted so far, but the kept counts are not whole yet: no recap
  await recapAfter(10, 12)
  expect(forks.count).toBe(3)
  holding = false
  answer()
  await starting
  // 12 prompts, the last recap at 7: due once a main turn completes
  await auto('auto-1')
  await idle($)
  await clock.advance(180_000)
  expect(forks.count).toBe(4)
  // the fourth recap of the session: no hint
  const drawn = text(await (await $.ui.mount(above)).drawn())
  expect(drawn).toContain('ריוואה')
  expect(drawn).not.toContain('/config')
  // its baseline is all 12 prompts: a turn with no new prompt brings no other
  await auto('auto-2')
  await idle($)
  await clock.advance(180_000)
  expect(forks.count).toBe(4)
})

test('with the native recap on, the band says so at the start and when it is turned on again', ON, async ($, on) => {
  const forks = world(on, HEBREW, true)
  const toasts: string[] = []
  on('ui.toast', (_$, e, next) => {
    toasts.push(e.text)
    return next(e)
  })
  on('config.set', (_$, e) => ({ value: e.value }) as never)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(toasts.length).toBe(1)
  expect(toasts[0]).toContain('Session recap')
  // turned off: no word; turned on again under the band: said again
  forks.native = false
  await $.config.set({ key: 'awaySummaryEnabled', value: false } as never)
  expect(toasts.length).toBe(1)
  forks.native = true
  await $.config.set({ key: 'awaySummaryEnabled', value: true } as never)
  expect(toasts.length).toBe(2)
})

test('with the native recap off, nothing is said', ON, async ($, on) => {
  world(on)
  const toasts: string[] = []
  on('ui.toast', (_$, e, next) => {
    toasts.push(e.text)
    return next(e)
  })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(toasts.length).toBe(0)
})

test('an unreadable /config says nothing, the setting keeps its result, and the session still gets recaps', ON, async ($, on) => {
  const clock = mock.clock(on)
  const forks = world(on, HEBREW, true)
  forks.unreadable = true
  const toasts: string[] = []
  on('ui.toast', (_$, e, next) => {
    toasts.push(e.text)
    return next(e)
  })
  on('config.set', (_$, e) => ({ value: e.value }) as never)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const result = await $.config.set({ key: 'rtl.recap', value: 'on' } as never)
  expect((result as { value: unknown }).value).toBe('on')
  expect(toasts.length).toBe(0)
  // the start went on past the failed read and restored the counts, so a recap comes once /config
  // reads again with the native recap off
  forks.unreadable = false
  forks.native = false
  for (let n = 1; n <= 3; n++) await exchange($, n)
  await idle($)
  await clock.advance(180_000)
  expect(forks.count).toBe(1)
})
