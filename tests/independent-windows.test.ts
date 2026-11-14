import assert from 'node:assert/strict'
import { computed } from 'vue'
import type { ExtensionStatus } from '../src/api/client.ts'
import {
  independentWindows, openIndependentWindow, reconcileIndependentWindows, registerIndependentWindowHost,
  removeIndependentWindow, setIndependentWindowsAvailable,
} from '../src/extensions/independentWindows.ts'

const styles = new Set<object>()
globalThis.document = {
  createElement: () => ({ dataset: {}, textContent: '', remove() { styles.delete(this) } }),
  head: { append: (style: object) => styles.add(style) },
} as unknown as Document
const extension = { id: 'container', version: '1.0.10', enabled: true, installed: true } as ExtensionStatus
const host = { apiVersion: 1 as const, extension: computed(() => extension) }
const unregister = registerIndependentWindowHost(host)
const definition = { component: { name: 'Terminal' }, props: { name: 'demo' }, styles: ['.terminal { color: white }'] }
setIndependentWindowsAvailable(true)
openIndependentWindow(host, 'terminal-demo', definition)
assert.equal(independentWindows.value.length, 1)
assert.equal(styles.size, 1)
const first = independentWindows.value[0]!
let focusCount = 0
first.instance.value = { focus: () => { focusCount++ } }
openIndependentWindow(host, 'terminal-demo', definition)
assert.equal(independentWindows.value.length, 1)
assert.equal(focusCount, 1)
assert.equal(styles.size, 1)
openIndependentWindow(host, 'terminal-second', { ...definition, props: { name: 'second' } })
assert.equal(independentWindows.value.length, 2, 'different containers have independent terminals')
removeIndependentWindow(independentWindows.value[1]!.key)
assert.equal(independentWindows.value[0], first, 'closing one terminal leaves the other alive')
assert.equal(styles.size, 1)
// Disposing the manager's host leaves its existing terminal and stylesheet alive.
unregister()
assert.equal(independentWindows.value.length, 1)
assert.equal(styles.size, 1)
assert.throws(() => openIndependentWindow(host, 'stale-manager', definition), /unavailable/)
const nextHost = { ...host }
registerIndependentWindowHost(nextHost)
first.open.value = false
openIndependentWindow(nextHost, 'terminal-demo', definition)
assert.notEqual(independentWindows.value[0]!.instanceId, first.instanceId)
assert.equal(styles.size, 1)
removeIndependentWindow(first.key, first.instanceId)
assert.equal(independentWindows.value.length, 1, 'a retired close callback must not remove the replacement window')
reconcileIndependentWindows([{ ...extension, enabled: false }])
assert.equal(independentWindows.value.length, 0)
assert.equal(styles.size, 0)
openIndependentWindow(nextHost, 'terminal-demo', definition)
reconcileIndependentWindows([{ ...extension, version: '1.0.11' }])
assert.equal(independentWindows.value.length, 0)
openIndependentWindow(nextHost, 'terminal-demo', definition)
removeIndependentWindow(independentWindows.value[0]!.key)
assert.equal(styles.size, 0)
openIndependentWindow(nextHost, 'terminal-demo', definition)
setIndependentWindowsAvailable(false)
assert.equal(independentWindows.value.length, 0)
assert.equal(styles.size, 0)
assert.throws(() => openIndependentWindow(nextHost, 'logged-out', definition), /unavailable/)
console.log('independent window lifecycle tests passed')
