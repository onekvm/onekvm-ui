export type TraceKind = 'ident' | 'punct' | 'prop' | 'fn'

export type TraceToken = {
  text: string
  kind: TraceKind
}

export type TraceLine = {
  key: string
  value: string
}

export type TraceCall = {
  id: string
  tokens: TraceToken[]
  output: TraceLine[]
}

export type ShownCall = {
  id: string
  status: 'running' | 'done'
  tokens: TraceToken[]
  outputs: TraceLine[]
  cursor: boolean
}

export type LogoColor = 'one' | 'kvm' | 'meta'

export type LogoRun = {
  text: string
  color: LogoColor
}

export type ConnectionTraceFrame = {
  settled: boolean
  hidden: boolean
  opacity: number
  signature: string
  logo: LogoRun[][]
  logoCursor: boolean
  calls: ShownCall[]
}

/** Elapsed ms when each call's real connection succeeded. Absent until then. */
export type ConnectionTraceLive = {
  readyAt: Partial<Record<string, number>>
}

const CHAR_MS = 22
const AFTER_CALL_MS = 220
const BETWEEN_MS = 460
const SUCCESS_HOLD_MS = 1100
const FADE_MS = 700

// Same banner as /etc/motd: # is the 1, + is the K. One is white, KVM is brand blue.
const MOTD_LOGO: LogoRun[][] = [
  [
    { text: '    ####      ', color: 'one' },
    { text: '+++++', color: 'kvm' },
    { text: '      One', color: 'one' },
    { text: 'KVM', color: 'kvm' },
  ],
  [
    { text: '  ######    ', color: 'one' },
    { text: '++++++', color: 'kvm' },
    { text: '       Remote ', color: 'meta' },
    { text: 'KVM', color: 'kvm' },
    { text: ' console', color: 'meta' },
  ],
  [
    { text: '########   ', color: 'one' },
    { text: '+++++', color: 'kvm' },
  ],
  [
    { text: '    ####  ', color: 'one' },
    { text: '+++++', color: 'kvm' },
  ],
  [
    { text: '    #### ', color: 'one' },
    { text: '+++++', color: 'kvm' },
  ],
  [
    { text: '    ####  ', color: 'one' },
    { text: '+++++', color: 'kvm' },
  ],
  [
    { text: '    ####   ', color: 'one' },
    { text: '++++++', color: 'kvm' },
  ],
  [
    { text: '    ####    ', color: 'one' },
    { text: '++++++', color: 'kvm' },
  ],
  [
    { text: '    ####      ', color: 'one' },
    { text: '+++++', color: 'kvm' },
  ],
]

function logoSource(): LogoRun[][] {
  const width = Math.max(...MOTD_LOGO.map(row => row.reduce((sum, run) => sum + run.text.length, 0)))
  return MOTD_LOGO.map(row => {
    const copy = row.map(run => ({ ...run }))
    const length = copy.reduce((sum, run) => sum + run.text.length, 0)
    if (length < width) copy[copy.length - 1].text += ' '.repeat(width - length)
    return copy
  })
}

export function connectionTraceLogoText() {
  return logoSource().map(row => row.map(run => run.text).join(''))
}

export function connectionTraceBannerMs() {
  return 0
}

export function connectionTraceHoldMs() {
  return SUCCESS_HOLD_MS
}

export function connectionTraceFadeMs() {
  return FADE_MS
}

function callText(tokens: TraceToken[]) {
  return tokens.map(token => token.text).join('')
}

function sliceTokens(tokens: TraceToken[], count: number): TraceToken[] {
  const shown: TraceToken[] = []
  let left = count
  for (const token of tokens) {
    if (left <= 0) break
    const text = token.text.slice(0, left)
    shown.push({ text, kind: token.kind })
    left -= text.length
  }
  return shown
}

function callDuration(call: TraceCall) {
  return callText(call.tokens).length * CHAR_MS + AFTER_CALL_MS
}

export const CONNECTION_TRACE: TraceCall[] = [
  {
    id: 'usb',
    tokens: [
      { text: 'onekvm', kind: 'ident' },
      { text: '.', kind: 'punct' },
      { text: 'usb', kind: 'prop' },
      { text: '.', kind: 'punct' },
      { text: 'connect', kind: 'fn' },
      { text: '()', kind: 'punct' },
    ],
    output: [
      { key: '', value: 'connected' },
    ],
  },
  {
    id: 'video',
    tokens: [
      { text: 'onekvm', kind: 'ident' },
      { text: '.', kind: 'punct' },
      { text: 'video', kind: 'prop' },
      { text: '.', kind: 'punct' },
      { text: 'connect', kind: 'fn' },
      { text: '()', kind: 'punct' },
    ],
    output: [
      { key: '', value: 'connected' },
    ],
  },
]

function callPlayMs(script: TraceCall[]) {
  return script.reduce((sum, call, index) => {
    return sum + callDuration(call) + (index > 0 ? BETWEEN_MS : 0)
  }, 0)
}

export function connectionTracePlayMs(script: TraceCall[] = CONNECTION_TRACE) {
  return connectionTraceBannerMs() + callPlayMs(script)
}

function doneCall(call: TraceCall): ShownCall {
  return {
    id: call.id,
    status: 'done',
    tokens: call.tokens,
    outputs: call.output,
    cursor: false,
  }
}

function projectCall(call: TraceCall, localMs: number, connected?: boolean): ShownCall {
  const text = callText(call.tokens)
  const typingEnd = text.length * CHAR_MS
  // Live mode prints the result when the real link is up, and refuses to
  // claim success on the typewriter clock alone.
  if (connected === true || (connected === undefined && localMs >= typingEnd + AFTER_CALL_MS)) {
    return doneCall(call)
  }
  if (localMs < typingEnd) {
    const typed = Math.max(0, Math.floor(localMs / CHAR_MS))
    return {
      id: call.id,
      status: 'running',
      tokens: sliceTokens(call.tokens, typed),
      outputs: [],
      cursor: true,
    }
  }
  return {
    id: call.id,
    status: 'running',
    tokens: call.tokens,
    outputs: [],
    cursor: true,
  }
}

function signatureOf(frame: Pick<ConnectionTraceFrame, 'settled' | 'hidden' | 'opacity' | 'logo' | 'logoCursor' | 'calls'>) {
  const body = frame.calls.map(call => {
    const text = callText(call.tokens)
    const lines = call.outputs.map(line => `${line.key}=${line.value}`).join(',')
    return `${call.id}:${call.status}:${text}:${lines}:${call.cursor ? '1' : '0'}`
  }).join('|')
  const banner = frame.logo.map(row => row.map(run => `${run.color}:${run.text}`).join(',')).join('/')
  return `${frame.hidden ? '1' : '0'}|${frame.opacity.toFixed(2)}|${frame.settled ? '1' : '0'}|${frame.logoCursor ? '1' : '0'}|${banner}|${body}`
}

function roundOpacity(value: number) {
  return Math.round(value * 100) / 100
}

function fadeAt(elapsedMs: number, script: TraceCall[]) {
  const play = connectionTracePlayMs(script)
  if (elapsedMs < play) return { settled: false, hidden: false, opacity: 1 }
  const held = elapsedMs - play
  if (held < SUCCESS_HOLD_MS) return { settled: true, hidden: false, opacity: 1 }
  const fade = held - SUCCESS_HOLD_MS
  if (fade >= FADE_MS) return { settled: true, hidden: true, opacity: 0 }
  return { settled: true, hidden: false, opacity: roundOpacity(1 - fade / FADE_MS) }
}

function logoAt() {
  return { logo: logoSource(), logoCursor: false }
}

function projectScript(elapsedMs: number, script: TraceCall[]) {
  const shownMs = Math.min(Math.max(0, elapsedMs), connectionTracePlayMs(script))
  const { logo, logoCursor } = logoAt()
  const banner = connectionTraceBannerMs()
  if (shownMs < banner) return { logo, logoCursor, calls: [] as ShownCall[] }
  const callElapsed = shownMs - banner
  const calls: ShownCall[] = []
  let offset = 0
  for (const call of script) {
    const duration = callDuration(call)
    if (callElapsed < offset) break
    calls.push(projectCall(call, Math.min(callElapsed, offset + duration) - offset))
    offset += duration + BETWEEN_MS
  }
  return { logo, logoCursor, calls }
}

function projectLive(elapsedMs: number, script: TraceCall[], readyAt: Partial<Record<string, number>>) {
  const { logo, logoCursor } = logoAt()
  const calls: ShownCall[] = []
  let gate = connectionTraceBannerMs()
  for (const call of script) {
    const ready = readyAt[call.id]
    const connected = ready !== undefined && elapsedMs >= ready
    const duration = callDuration(call)
    if (elapsedMs >= gate || connected) {
      const local = connected ? duration : Math.min(duration, Math.max(0, elapsedMs - gate))
      calls.push(projectCall(call, local, connected))
    }
    if (connected) {
      const finished = Math.min(gate + duration, Math.max(gate, ready ?? gate))
      gate = Math.min(gate + duration + BETWEEN_MS, finished + BETWEEN_MS)
    } else {
      gate += duration + BETWEEN_MS
    }
  }
  return { logo, logoCursor, calls }
}

function liveFade(elapsedMs: number, script: TraceCall[], readyAt: Partial<Record<string, number>>) {
  let doneAt = 0
  for (const call of script) {
    const ready = readyAt[call.id]
    if (ready === undefined || elapsedMs < ready) return { settled: false, hidden: false, opacity: 1 }
    if (ready > doneAt) doneAt = ready
  }
  const held = elapsedMs - doneAt
  if (held < SUCCESS_HOLD_MS) return { settled: true, hidden: false, opacity: 1 }
  const fade = held - SUCCESS_HOLD_MS
  if (fade >= FADE_MS) return { settled: true, hidden: true, opacity: 0 }
  return { settled: true, hidden: false, opacity: roundOpacity(1 - fade / FADE_MS) }
}

function assemble(elapsedMs: number, script: TraceCall[], live?: ConnectionTraceLive): ConnectionTraceFrame {
  const readyAt = live?.readyAt
  const fade = readyAt ? liveFade(elapsedMs, script, readyAt) : fadeAt(elapsedMs, script)
  const { logo, logoCursor, calls } = readyAt ? projectLive(elapsedMs, script, readyAt) : projectScript(elapsedMs, script)
  const frame = { ...fade, logo, logoCursor, calls, signature: '' }
  frame.signature = signatureOf(frame)
  return frame
}

export function connectionTraceSettled(script: TraceCall[] = CONNECTION_TRACE): ConnectionTraceFrame {
  return assemble(connectionTracePlayMs(script), script)
}

export function connectionTraceHidden(script: TraceCall[] = CONNECTION_TRACE): ConnectionTraceFrame {
  return assemble(connectionTracePlayMs(script) + SUCCESS_HOLD_MS + FADE_MS, script)
}

export function connectionTraceFrame(
  elapsedMs: number,
  script: TraceCall[] = CONNECTION_TRACE,
  live?: ConnectionTraceLive,
): ConnectionTraceFrame {
  return assemble(elapsedMs, script, live)
}
