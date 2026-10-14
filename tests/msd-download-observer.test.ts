import assert from 'node:assert/strict'
import { createDownloadObserver, type DownloadTask } from '../src/lib/msd-download-observer.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function fixture(rememberedID = '') {
  let calls = 0
  let tasks: DownloadTask[] = []
  let load: (signal: AbortSignal) => Promise<DownloadTask[]> = async () => tasks
  const timers = new Map<number, { callback: () => void; delay: number }>()
  let sequence = 0
  const updates: DownloadTask[] = []
  const remembered: string[] = []
  const reconnecting: boolean[] = []
  let startResult = { id: 'new', state: 'running' }
  let cancelResult = { id: 'new', state: 'cancelling' }
  let cancelError: Error | undefined
  let startError: Error | undefined
  const observer = createDownloadObserver({
    load: signal => { calls++; return load(signal) },
    start: async () => { if (startError) throw startError; return startResult },
    cancel: async () => { if (cancelError) throw cancelError; return cancelResult },
    rememberedID,
    remember: id => remembered.push(id),
    update: task => updates.push(task),
    reconnecting: value => reconnecting.push(value),
    schedule: (callback, delay) => { const id = ++sequence; timers.set(id, { callback, delay }); return id as unknown as ReturnType<typeof setTimeout> },
    unschedule: id => { timers.delete(id as unknown as number) },
  })
  return {
    observer, timers, updates, remembered, reconnecting,
    get calls() { return calls },
    setTasks(value: DownloadTask[]) { tasks = value },
    setLoad(value: typeof load) { load = value },
    setStart(value: typeof startResult) { startResult = value },
    setCancel(value: typeof cancelResult) { cancelResult = value },
    failStart() { startError = new Error("lost POST response") },
    failCancel() { cancelError = new Error("cancel failed") },
    async tick() {
      assert.equal(timers.size, 1)
      const [id, timer] = [...timers][0]!
      timers.delete(id); timer.callback()
      await new Promise(resolve => setImmediate(resolve))
    },
  }
}

const idle = fixture()
await idle.observer.discover()
assert.equal(idle.calls, 1)
assert.equal(idle.timers.size, 0)
// Opening the panel discovers downloads created by another client.
idle.setTasks([{ id: 'other', state: 'running' }])
await idle.observer.discover()
assert.equal(idle.updates.at(-1)?.id, 'other')
assert.equal([...idle.timers.values()][0]?.delay, 1000)
idle.setTasks([{ id: 'other', state: 'completed' }])
await idle.tick()
assert.equal(idle.timers.size, 0)
assert.equal(idle.remembered.at(-1), '')

const started = fixture()
await started.observer.discover()
await started.observer.start('https://example.test/image.iso', 'image.iso')
assert.equal(started.timers.size, 1)
await started.observer.cancel()
assert.equal(started.updates.at(-1)?.state, 'cancelling')
assert.equal(started.timers.size, 1)
started.setTasks([{ id: 'new', state: 'cancelled' }])
await started.tick()
assert.equal(started.timers.size, 0)
// A task already complete in the POST response requires no poll.
started.setStart({ id: 'instant', state: 'completed' })
await started.observer.start('https://example.test/image.iso', 'image.iso')
assert.equal(started.timers.size, 0)

const restored = fixture('previous')
restored.setLoad(async () => { throw new Error('offline') })
await restored.observer.discover()
assert.equal(restored.reconnecting.at(-1), true)
assert.equal([...restored.timers.values()][0]?.delay, 5000)
restored.setLoad(async () => [{ id: 'previous', state: 'running' }])
await restored.tick()
assert.equal(restored.updates.at(-1)?.id, 'previous')
restored.setTasks([])
restored.setLoad(async () => [])
await restored.tick()
assert.equal(restored.updates.at(-1)?.state, 'failed')
assert.equal(restored.timers.size, 0)

const race = fixture()
const pending = deferred<DownloadTask[]>()
let signal!: AbortSignal
race.setLoad(async value => { signal = value; return pending.promise })
const old = race.observer.discover()
await race.observer.discover()
assert.equal(race.calls, 1) // concurrent discoveries share the current observation
await race.observer.start('https://example.test/image.iso', 'image.iso')
assert.equal(signal.aborted, true)
pending.resolve([{ id: 'stale', state: 'running' }])
await old
assert.equal(race.updates.at(-1)?.id, 'new')
assert.equal(race.timers.size, 1)
race.observer.dispose()
assert.equal(race.timers.size, 0)

const unmount = fixture()
const unfinished = deferred<DownloadTask[]>()
unmount.setLoad(async value => { signal = value; return unfinished.promise })
const observing = unmount.observer.discover()
unmount.observer.dispose()
assert.equal(signal.aborted, true)
unfinished.resolve([{ id: 'existing', state: 'running' }])
await observing
assert.equal(unmount.updates.length, 0)
assert.equal(unmount.timers.size, 0)
const offlineIdle = fixture()
offlineIdle.setLoad(async () => { throw new Error('offline') })
await offlineIdle.observer.discover()
assert.equal(offlineIdle.timers.size, 0)


const failedCancel = fixture()
await failedCancel.observer.start('https://example.test/image.iso', 'image.iso')
failedCancel.failCancel()
await assert.rejects(failedCancel.observer.cancel())
assert.equal(failedCancel.timers.size, 1)
failedCancel.setLoad(async () => { throw new Error('temporary disconnect') })
await failedCancel.tick()
assert.equal(failedCancel.reconnecting.at(-1), true)
assert.equal(failedCancel.timers.size, 1)
failedCancel.setLoad(async () => [{ id: 'new', state: 'completed' }])
await failedCancel.tick()
assert.equal(failedCancel.timers.size, 0)

const lostStart = fixture()
lostStart.failStart()
lostStart.setTasks([{ id: 'accepted', state: 'running' }])
await assert.rejects(lostStart.observer.start('https://example.test/image.iso', 'image.iso'))
await new Promise(resolve => setImmediate(resolve))
assert.equal(lostStart.updates.at(-1)?.id, 'accepted')
assert.equal(lostStart.timers.size, 1)

console.log('Download observer lifecycle and mutation recovery checks passed')
