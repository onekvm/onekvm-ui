// Acknowledges bounded download batches over the current media connection.
// The server owns timings and applies the result only while bitrate is Auto.
export const BANDWIDTH_CHANNEL = 'onekvm-bandwidth-v1'

export class StartupBandwidthProbe {
  private batch = 0
  private expected = 0
  private received = 0
  capKbps: number | null = null

  private readonly send: (data: ArrayBuffer) => void

  constructor(send: (data: ArrayBuffer) => void) { this.send = send }

  receive(data: ArrayBuffer): boolean {
    if (data.byteLength < 4) return false
    const bytes = new Uint8Array(data)
    const magic = String.fromCharCode(...bytes.subarray(0, 4))
    if (magic === 'OKBE' && data.byteLength === 8) {
      const cap = new DataView(data).getUint32(4, true)
      this.capKbps = cap > 0 ? cap : null
      return true
    }
    if (magic !== 'OKBP') return false
    if (data.byteLength < 12) return true
    const view = new DataView(data)
    const batch = view.getUint32(4, true)
    const expected = view.getUint32(8, true)
    if (!batch || expected < data.byteLength || expected > 512 * 1024) return true
    if (batch !== this.batch) {
      if (batch < this.batch) return true
      this.batch = batch
      this.expected = expected
      this.received = 0
    }
    if (expected !== this.expected) return true
    this.received += data.byteLength
    if (this.received === this.expected) {
      const ack = new ArrayBuffer(12)
      new Uint8Array(ack).set([0x4f, 0x4b, 0x42, 0x41])
      const reply = new DataView(ack)
      reply.setUint32(4, batch, true)
      reply.setUint32(8, this.received, true)
      this.send(ack)
    }
    return true
  }
}
