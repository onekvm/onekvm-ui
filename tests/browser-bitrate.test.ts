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
    bytes += kbps * (options.gap ?? 1000) / 8; packets += 300; lost += loss; frames += options.frames ?? 60
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
assert.equal(loss.sample(1800, 40), 3000, 'one heavy-loss second keeps the recovery ceiling')
assert.ok(loss.sample(1800, 40) < 1800, 'repeated severe loss should reduce below delivered throughput')
assert.equal(loss.controller.cap, 3000, 'unacknowledged request is not displayed')
assert.equal(loss.modes.at(-1), 0x4f4b4250, 'congestion requests a wire budget')
const reduced = loss.commands.at(-1)!
loss.status(10000, reduced)
assert.equal(loss.sample(1450), reduced, 'reassert unchanged cap after a lost command')
assert.equal(loss.modes.at(-1), 0x4f4b4250, 'reassert constrained-path mode')
for (let i = 0; i < 8; i++) loss.sample(1450)
assert.ok(loss.commands.slice(3).some(cap => cap > reduced), 'clean busy traffic should recover')

const staticDesktop = harness()
for (let i = 0; i < 25; i++) staticDesktop.sample(150)
assert.ok(staticDesktop.commands.every(cap => cap === 0 || cap === 3000), 'application-limited traffic must hold its cap')

const queue = harness()
queue.sample()
queue.sample(2800, 0, 120)
queue.sample(2800, 0, 140)
assert.equal(queue.sample(2800, 0, 140), 3000, 'a brief RTT spike keeps the recovery ceiling')
assert.ok(queue.sample(2800, 0, 140) < 3000, 'sustained RTT growth should reduce cap')

const blip = harness()
blip.status(10000, 8000)
for (let i = 0; i < 10; i++) blip.sample(450)
blip.sample(450, 0, 120)
assert.ok(blip.sample(450, 0, 140) >= 6000, 'an RTT spike on an application-limited stream must not cut to its idle rate')

// Wi-Fi drops a few packets and spikes RTT; a static desktop using a tenth of
// its cap is not what fills the path, and its cap must keep motion headroom.
const wifi = harness()
wifi.status(10000, 10000)
for (let i = 0; i < 9; i++) wifi.sample(1100, 0, 3, { gap: 1000 })
for (let i = 0; i < 40; i++) {
  const cap = wifi.sample(1100, i % 3 === 0 ? 9 : 2, i % 4 === 0 ? 60 : 3)
  if (cap && cap !== wifi.controller.cap) wifi.status(10000, cap)
}
assert.ok(wifi.commands.every(cap => cap === 0 || cap >= 3000), 'link loss must not ratchet an application-limited cap to its idle rate')

// Measured on Wi-Fi: RTT +60 ms for three samples every six, with the encoder
// using most of its cap. Each spike must not cut the cap further.
const spikes = harness()
spikes.status(10000, 10000)
for (let i = 0; i < 60; i++) {
  const cap = spikes.controller.cap!
  const sent = spikes.sample(Math.min(4000, cap * 0.8), i % 6 < 3 ? 2 : 0, i % 6 < 3 ? 65 : 5, { gap: i < 16 ? 500 : 1000 })
  if (sent && sent !== cap) spikes.status(10000, sent)
}
assert.ok(spikes.commands.every(cap => cap === 0 || cap >= 3000), 'delay spikes must not ratchet the cap below the recovery ceiling')

// A path slower than even the idle stream keeps losing heavily: cut below it.
const slowPath = harness()
slowPath.status(10000, 10000)
for (let i = 0; i < 9; i++) slowPath.sample(1100)
const burst = slowPath.sample(700, 120)
assert.equal(burst, 3000, 'one heavy-loss burst keeps the recovery ceiling')
slowPath.status(10000, burst)
slowPath.sample(700, 120)
assert.ok(slowPath.sample(700, 120) < 700, 'sustained heavy loss cuts below delivery')

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

const startup = harness()
startup.controller.start()
assert.equal(startup.commands.at(-1), 0xfffffffe, 'start requests the server-clamped automatic maximum, not release')
startup.status(20000, 20000)
assert.equal(startup.controller.sampleIntervalMs, 500)
startup.sample(19000, 0, 2, { gap: 500 })
const firstBackoff = startup.sample(2000, 20, 120, { gap: 500 })
assert.ok(firstBackoff <= 1700, 'the first congested startup interval backs off below delivery rate')
assert.equal(startup.controller.cap, 20000, 'only acknowledgements update the displayed cap')
startup.status(20000, 20000) // Server encoder throttle has not accepted it yet.
assert.equal(startup.sample(2000, 20, 120, { gap: 500 }), firstBackoff, 'retry a throttled reduction until acknowledged')
startup.status(20000, firstBackoff)
assert.equal(startup.controller.sampleIntervalMs, 1000, 'the first confirmed reduction ends the fast probe')
assert.equal(startup.sample(1000, 20, 120, { gap: 500 }), firstBackoff, 'residual startup loss uses normal congestion hysteresis')
for (let i = 0; i < 16; i++) startup.sample(1000, 0, 2, { gap: 500 })
assert.equal(startup.controller.sampleIntervalMs, 1000, 'fast sampling ends after the bounded startup window')

const quietStartup = harness()
quietStartup.status(10000, 10000)
for (let i = 0; i < 20; i++) quietStartup.sample(80, 0, 2, { gap: 500 })
assert.ok(quietStartup.commands.every(cap => cap === 0 || cap === 10000), 'static desktops keep the high ceiling without fake congestion')
quietStartup.status(0, 0)
assert.equal(quietStartup.controller.sampleIntervalMs, 1000, 'manual mode does not retain startup polling')
assert.equal(quietStartup.sample(), 0)

const probeQueue = harness()
probeQueue.status(10000, 10000)
probeQueue.sample(9000, 0, 2, { gap: 500 })
assert.ok(probeQueue.sample(9000, 0, 100, { gap: 500 }) <= 5000, 'startup reacts to growing queues before packet loss')

console.log('browser bitrate policy tests passed')
