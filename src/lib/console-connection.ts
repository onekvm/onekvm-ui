import type { TransportState } from './onekvm'

export function consoleConnectionProblem({
  state,
  serverUnavailable,
  mediaError,
  signalConnected,
}: {
  state: Pick<TransportState, 'connection' | 'fallbackPrompt'>
  serverUnavailable: boolean
  mediaError: boolean
  signalConnected: boolean | null
}) {
  return !state.fallbackPrompt && (
    // Status telemetry can reconnect independently of the live console.
    (serverUnavailable && state.connection !== 'connected')
    || ['failed', 'disconnected'].includes(state.connection)
    || (mediaError && signalConnected !== false)
  )
}
