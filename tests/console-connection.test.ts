import assert from 'node:assert/strict'
import { computed, reactive } from 'vue'
import { consoleConnectionProblem } from '../src/lib/console-connection.ts'
import type { TransportState } from '../src/lib/onekvm.ts'

const input = reactive({
  state: { connection: 'connecting', fallbackPrompt: '' } as Pick<TransportState, 'connection' | 'fallbackPrompt'>,
  serverUnavailable: false,
  mediaError: false,
  signalConnected: true as boolean | null,
})
const show = computed(() => consoleConnectionProblem(input))

assert.equal(show.value, false, 'Initial negotiation uses the loading indicator')
input.serverUnavailable = true
assert.equal(show.value, true, 'Losing the server before connecting still reports interruption')
input.state.connection = 'connected'
assert.equal(show.value, false, 'A successful connection must dismiss a stale SSE error')
input.serverUnavailable = false
input.serverUnavailable = true
assert.equal(show.value, false, 'A status-only failure must not block an active console')
input.state.connection = 'failed'
assert.equal(show.value, true, 'A real transport failure must still interrupt the console')
input.serverUnavailable = false
assert.equal(show.value, true, 'A reachable status API must not hide a media transport failure')
input.state.fallbackPrompt = 'webrtc-failed'
assert.equal(show.value, false, 'The fallback dialog takes priority')
input.state.fallbackPrompt = ''
input.state.connection = 'disconnected'
assert.equal(show.value, true)
input.state.connection = 'connected'
assert.equal(show.value, false, 'Recovered transport clears the failure without a page reload')
input.mediaError = true
assert.equal(show.value, true, 'A real MJPEG failure must remain visible while HID is connected')
input.signalConnected = false
assert.equal(show.value, false, 'Missing HDMI uses the no-signal state')
console.log('console connection tests passed')
