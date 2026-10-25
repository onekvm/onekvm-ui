import assert from 'node:assert/strict'
import { BrowserBitrate } from '../src/lib/browser-bitrate.ts'

function harness() {
  const commands: number[] = []
  const modes: number[] = []
  const controller = new BrowserBitrate({ readyState: 'open', bufferedAmount: 0,
    send(message: ArrayBuffer) { commands.push(new DataView(message).getUint32(4)); modes.push(new DataView(message).getUint32(0)) },
  } as unknown as RTCDataChannel)
  let time = 0, bytes = 0, packets = 0, lost = 0, frames = 0, decode = 0, delay = 0
  function status(maximum: number, cap: number) {
    const message = new ArrayBuffer(12)
    const view = new DataView(message)
    view.setUint32(0, 0x4f4b4253); view.setUint32(4, maximum); view.setUint32(8, cap)
    controller.status(message)
  }
  function sample(kbps = 2800, loss = 0, rtt = 2, options: { gap?: number; hidden?: boolean; decodeMs?: number; frames?: number; route?: string } = {}) {
    time += options.gap ?? 1000
    bytes += kbps * 125; packets += 300; lost += loss; frames += options.frames ?? 60
    decode += (options.decodeMs ?? 1) * (options.frames ?? 60) / 1000; delay += 0.002 * 60
    controller.sample([{ id: 'video', type: 'inbound-rtp', kind: 'video', timestamp: time,
      bytesReceived: bytes, packetsReceived: packets, packetsLost: lost, framesDecoded: frames,
      totalDecodeTime: decode, jitterBufferDelay: delay, jitterBufferEmittedCount: frames,
    } as unknown as RTCStats], rtt, options.route ?? 'lan', !options.hidden)
    return commands.at(-1)!
  }
  status(10000, 3000)
  return { controller, commands, modes, status, sample }
}
const loss = harness()
loss.sample()
assert.ok(loss.sample(1800, 40) < 1800, 'severe loss should reduce below delivered throughput')
assert.equal(loss.controller.cap, 3000, 'unacknowledged request is not displayed')
assert.equal(loss.modes.at(-1), 0x4f4b4250, 'congestion requests a wire budget')
loss.status(10000, 1530)
assert.equal(loss.sample(1450), 1530, 'reassert unchanged cap after a lost command')
assert.equal(loss.modes.at(-1), 0x4f4b4250, 'reassert constrained-path mode')
for (let i = 0; i < 8; i++) loss.sample(1450)
assert.ok(loss.commands.some(cap => cap > 1530), 'clean busy traffic should recover')

const staticDesktop = harness()
for (let i = 0; i < 25; i++) staticDesktop.sample(150)
assert.ok(staticDesktop.commands.every(cap => cap === 0 || cap === 3000), 'application-limited traffic must hold its cap')

const queue = harness()
queue.sample()
queue.sample(2800, 0, 120)
assert.ok(queue.sample(2800, 0, 140) < 3000, 'sustained RTT growth should reduce cap')

const decoder = harness()
for (let i = 0; i < 15; i++) decoder.sample(2800, 0, 2, { decodeMs: 40 })
assert.ok(decoder.commands.every(cap => cap === 0 || cap === 3000), 'decoder load alone must not change bitrate')

const paused = harness()
paused.sample()
assert.equal(paused.sample(2800, 100, 100, { gap: 15000 }), 0, 'discard background-sized interval')
assert.equal(paused.sample(2800, 100, 100, { hidden: true }), 0)
assert.equal(paused.sample(2800, 100, 100), 0, 'resume starts fresh')
assert.equal(paused.sample(2800, 100, 100, { route: 'new-route' }), 0, 'new route starts fresh')
paused.status(0, 0)
assert.equal(paused.controller.cap, null)
assert.equal(paused.sample(), 0, 'manual setting disables requests')
paused.status(200, 0)
assert.equal(paused.sample(), 200, 'small backend maximum is respected')
paused.controller.status(new ArrayBuffer(5))
assert.equal(paused.controller.cap, null)

const keyframeWait = harness()
keyframeWait.sample()
for (let i = 0; i < 8; i++) keyframeWait.sample(2800, 0, 2, { frames: 0 })
assert.ok(keyframeWait.commands.some(cap => cap > 3000), 'healthy utilized path must recover while awaiting decodable frames')
const busyStall = harness()
busyStall.sample()
busyStall.sample(2800, 0, 2, { decodeMs: 40 })
for (let i = 0; i < 8; i++) busyStall.sample(2800, 0, 2, { frames: 0 })
assert.ok(busyStall.commands.every(cap => cap === 0 || cap === 3000), 'remember decoder pressure through stalled samples')

const budgetStall = harness()
budgetStall.sample()
budgetStall.sample(1800, 40)
budgetStall.status(10000, 300)
for (let i = 0; i < 8; i++) budgetStall.sample(50, 0, 2, { frames: 0 })
assert.ok(budgetStall.commands.some(cap => cap >= 700 && cap <= 3000), 'healthy low-budget GOP stall should restore bounded startup headroom')
const decoderBudget = harness()
decoderBudget.sample()
decoderBudget.sample(1800, 40, 2, { decodeMs: 40 })
decoderBudget.status(10000, 300)
for (let i = 0; i < 8; i++) decoderBudget.sample(50, 0, 2, { frames: 0 })
assert.ok(decoderBudget.commands.slice(2).every(cap => cap === 0 || cap === 300), 'CPU-bound decoder must not trigger budget recovery')

console.log('browser bitrate policy tests passed')
