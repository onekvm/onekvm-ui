import assert from 'node:assert/strict'

import {
  CONNECTION_TRACE,
  connectionTraceBannerMs,
  connectionTraceFadeMs,
  connectionTraceFrame,
  connectionTraceHidden,
  connectionTraceHoldMs,
  connectionTraceLogoText,
  connectionTracePlayMs,
  connectionTraceSettled,
} from '../src/lib/connection-trace.ts'

const usb = CONNECTION_TRACE[0]
const video = CONNECTION_TRACE[1]
const textOf = (id: string) => CONNECTION_TRACE.find(call => call.id === id)!.tokens.map(token => token.text).join('')

assert.equal(textOf('usb'), 'onekvm.usb.connect()')
assert.equal(textOf('video'), 'onekvm.video.connect()')
assert.equal(usb.output.length, 1)
assert.equal(usb.output[0].value, 'connected')
assert.equal(video.output.length, 1)
assert.equal(video.output[0].value, 'connected')

const logo = connectionTraceLogoText()
assert.equal(logo.length, 9)
assert.equal(new Set(logo.map(row => row.length)).size, 1)
assert.equal(logo.every(row => /^[\x20-\x7e]+$/.test(row)), true)
assert.equal(logo[0].includes('####'), true)
assert.equal(logo[0].includes('+++++'), true)
assert.equal(logo[0].includes('OneKVM'), true)
assert.equal(logo[1].includes('Remote KVM console'), true)
assert.equal(logo.some(row => row.includes('########')), true)

const banner = connectionTraceBannerMs()
assert.equal(banner, 0)
const opening = connectionTraceFrame(0)
assert.equal(opening.settled, false)
assert.equal(opening.hidden, false)
assert.equal(opening.opacity, 1)
assert.equal(opening.logoCursor, false)
assert.deepEqual(opening.logo.map(row => row.map(run => run.text).join('')), logo)
assert.equal(opening.logo[0][0].color, 'one')
assert.equal(opening.logo[0].at(-1)?.color, 'kvm')
assert.equal(opening.calls.length, 1)
assert.equal(opening.calls[0].id, 'usb')
assert.equal(opening.calls[0].status, 'running')

const start = connectionTraceFrame(banner)
assert.equal(start.settled, false)
assert.equal(start.calls.length, 1)
assert.equal(start.calls[0].id, 'usb')
assert.equal(start.calls[0].status, 'running')
assert.equal(start.calls[0].tokens.length, 0)
assert.equal(start.calls[0].cursor, true)

const typed = connectionTraceFrame(banner + 22 * 7)
assert.equal(typed.calls[0].tokens.map(token => token.text).join(''), 'onekvm.')
assert.deepEqual(typed.calls[0].tokens.map(token => token.kind), ['ident', 'punct'])

const callReady = connectionTraceFrame(banner + textOf('usb').length * 22)
assert.equal(callReady.calls[0].tokens.map(token => token.text).join(''), 'onekvm.usb.connect()')
assert.equal(callReady.calls[0].outputs.length, 0)
assert.equal(callReady.calls[0].status, 'running')
assert.equal(callReady.calls[0].cursor, true)

const firstLine = connectionTraceFrame(banner + textOf('usb').length * 22 + 220)
assert.equal(firstLine.calls[0].outputs.length, 1)
assert.equal(firstLine.calls[0].outputs[0].value, 'connected')
assert.equal(firstLine.calls[0].outputs[0].key, '')
assert.equal(firstLine.calls[0].status, 'done')
assert.equal(firstLine.calls[0].cursor, false)
assert.equal(firstLine.calls.length, 1)

const usbDoneAt = textOf('usb').length * 22 + 220
const usbDone = connectionTraceFrame(banner + usbDoneAt)
assert.equal(usbDone.calls.length, 1)
assert.equal(usbDone.calls[0].status, 'done')
assert.equal(usbDone.calls[0].outputs.length, 1)

const between = connectionTraceFrame(banner + usbDoneAt + 459)
assert.equal(between.calls.length, 1)

const videoStart = connectionTraceFrame(banner + usbDoneAt + 460)
assert.equal(videoStart.calls.length, 2)
assert.equal(videoStart.calls[0].status, 'done')
assert.equal(videoStart.calls[1].id, 'video')
assert.equal(videoStart.calls[1].status, 'running')
assert.equal(videoStart.calls[1].tokens.length, 0)

const settled = connectionTraceSettled()
assert.equal(settled.settled, true)
assert.equal(settled.hidden, false)
assert.equal(settled.opacity, 1)
assert.equal(settled.logoCursor, false)
assert.deepEqual(settled.logo.map(row => row.map(run => run.text).join('')), logo)
assert.equal(settled.calls.length, 2)
assert.equal(settled.calls.every(call => call.status === 'done' && !call.cursor), true)

const play = connectionTracePlayMs()
const hold = connectionTraceHoldMs()
const fade = connectionTraceFadeMs()
assert.equal(connectionTraceFrame(play).signature, settled.signature)
assert.equal(connectionTraceFrame(play + hold - 1).opacity, 1)
assert.equal(connectionTraceFrame(play + hold - 1).hidden, false)

const mid = connectionTraceFrame(play + hold + fade / 2)
assert.equal(mid.settled, true)
assert.equal(mid.hidden, false)
assert.ok(Math.abs(mid.opacity - 0.5) < 0.02)
assert.equal(mid.calls.length, 2)

const hidden = connectionTraceHidden()
assert.equal(hidden.hidden, true)
assert.equal(hidden.opacity, 0)
assert.equal(connectionTraceFrame(play + hold + fade).signature, hidden.signature)
assert.equal(connectionTraceFrame(play + 10_000).signature, hidden.signature)

const usbText = textOf('usb')
const videoText = textOf('video')
const instant = connectionTraceFrame(0, CONNECTION_TRACE, { readyAt: { usb: 0, video: 0 } })
assert.equal(instant.calls.length, 2)
assert.equal(instant.calls.every(call => call.status === 'done' && call.outputs[0]?.value === 'connected'), true)
assert.equal(instant.calls[0].tokens.map(token => token.text).join(''), usbText)
assert.equal(instant.calls[1].tokens.map(token => token.text).join(''), videoText)
assert.equal(instant.settled, true)
assert.equal(instant.opacity, 1)
assert.equal(instant.hidden, false)

const waiting = connectionTraceFrame(usbDoneAt, CONNECTION_TRACE, { readyAt: {} })
assert.equal(waiting.calls[0].status, 'running')
assert.equal(waiting.calls[0].outputs.length, 0)
assert.equal(waiting.calls[0].tokens.map(token => token.text).join(''), usbText)
assert.equal(waiting.hidden, false)
assert.equal(waiting.settled, false)

const usbEarly = connectionTraceFrame(40, CONNECTION_TRACE, { readyAt: { usb: 40 } })
assert.equal(usbEarly.calls.length, 1)
assert.equal(usbEarly.calls[0].status, 'done')
assert.equal(usbEarly.calls[0].outputs[0].value, 'connected')
assert.equal(usbEarly.settled, false)

const videoFirst = connectionTraceFrame(80, CONNECTION_TRACE, { readyAt: { video: 80 } })
assert.equal(videoFirst.calls[0].id, 'usb')
assert.equal(videoFirst.calls[0].status, 'running')
assert.equal(videoFirst.calls[1].id, 'video')
assert.equal(videoFirst.calls[1].status, 'done')
assert.equal(videoFirst.calls[1].outputs[0].value, 'connected')
assert.equal(videoFirst.settled, false)

const slowUsb = connectionTraceFrame(4000, CONNECTION_TRACE, { readyAt: { usb: 4000 } })
assert.equal(slowUsb.calls.find(call => call.id === 'usb')?.status, 'done')
assert.equal(slowUsb.settled, false)

const live = { readyAt: { usb: 10, video: 40 } }
const doneAt = 40
assert.equal(connectionTraceFrame(doneAt - 1, CONNECTION_TRACE, live).settled, false)
assert.equal(connectionTraceFrame(doneAt, CONNECTION_TRACE, live).settled, true)
assert.equal(connectionTraceFrame(doneAt, CONNECTION_TRACE, live).opacity, 1)
assert.equal(connectionTraceFrame(doneAt + hold - 1, CONNECTION_TRACE, live).opacity, 1)
assert.equal(connectionTraceFrame(doneAt + hold - 1, CONNECTION_TRACE, live).hidden, false)
const liveMid = connectionTraceFrame(doneAt + hold + fade / 2, CONNECTION_TRACE, live)
assert.ok(Math.abs(liveMid.opacity - 0.5) < 0.02)
assert.equal(connectionTraceFrame(doneAt + hold + fade, CONNECTION_TRACE, live).hidden, true)
