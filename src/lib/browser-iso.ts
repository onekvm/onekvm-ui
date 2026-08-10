const FRAME_MOUNT = 0x01
const FRAME_EJECT = 0x02
const FRAME_STATUS = 0x03
const FRAME_READ_DATA_BATCH = 0x12

const FRAME_STATUS_REPLY = 0x81
const FRAME_EJECTED = 0x82
const FRAME_READ_BATCH = 0x91
const FRAME_ERROR = 0xff

const STATE_MOUNTED = 2
const MAX_READ = 1 << 20
const MAX_READ_BATCH = 8

export interface BrowserISOProgress {
  name: string
  size: number
  transferred: number
  bytesPerSecond: number
}

interface BrowserISOCallbacks {
  progress: (progress: BrowserISOProgress) => void
  disconnected: (message: string) => void
}

export class BrowserISO {
  private socket: WebSocket | null = null
  private file: File | null = null
  private closed = false
  private mounted = false
  private transferred = 0
  private sampleBytes = 0
  private sampleStartedAt = 0
  private lastProgressAt = 0
  private connectResolve: (() => void) | null = null
  private connectReject: ((error: Error) => void) | null = null
  private ejectResolve: (() => void) | null = null
  private ejectReject: ((error: Error) => void) | null = null
  private ejectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly url: string,
    private readonly callbacks: BrowserISOCallbacks,
  ) {}

  async mount(file: File) {
    if (this.socket || this.file) return Promise.reject(new Error('A browser ISO session is already active'))
    const nameBytes = new TextEncoder().encode(file.name)
    if (!file.name.toLowerCase().endsWith('.iso') || nameBytes.length === 0 || nameBytes.length > 255 || file.size < 17 * 2048 || file.size % 2048 !== 0) {
      throw new Error('Invalid ISO file')
    }
    const descriptor = new Uint8Array(await file.slice(16 * 2048, 17 * 2048).arrayBuffer())
    if (descriptor.length !== 2048 || new TextDecoder('ascii').decode(descriptor.subarray(1, 6)) !== 'CD001') {
      throw new Error('The selected file is not an ISO 9660 image')
    }
    this.file = file
    this.closed = false
    this.mounted = false
    this.transferred = 0
    this.sampleBytes = 0
    this.sampleStartedAt = performance.now()

    return new Promise<void>((resolve, reject) => {
      this.connectResolve = resolve
      this.connectReject = reject
      const socket = new WebSocket(this.url, 'onekvm.msd.v2')
      socket.binaryType = 'arraybuffer'
      this.socket = socket
      socket.onopen = () => {
        if (this.socket !== socket || this.closed) {
          socket.close()
          return
        }
        const payload = new Uint8Array(11 + nameBytes.length)
        const view = new DataView(payload.buffer)
        payload[0] = FRAME_MOUNT
        view.setBigUint64(1, BigInt(file.size))
        view.setUint16(9, nameBytes.length)
        payload.set(nameBytes, 11)
        socket.send(payload)
      }
      socket.onmessage = (event) => {
        if (this.socket === socket && event.data instanceof ArrayBuffer) void this.handleFrame(socket, event.data)
      }
      socket.onerror = () => {
        if (!this.mounted) this.rejectConnect(new Error('Virtual-media WebSocket connection failed'))
      }
      socket.onclose = () => {
        if (this.socket === socket) this.socket = null
        const wasMounted = this.mounted
        this.mounted = false
        this.file = null
        if (!this.closed) {
          const error = new Error('Virtual-media WebSocket connection closed')
          if (!wasMounted) this.rejectConnect(error)
          else this.callbacks.disconnected('Browser ISO connection closed and the media was ejected')
          this.rejectEject(error)
        }
      }
    })
  }

  eject() {
    const socket = this.socket
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      this.destroy()
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      this.ejectResolve = resolve
      this.ejectReject = reject
      this.ejectTimer = setTimeout(() => {
        const error = new Error('Timed out while ejecting the browser ISO')
        this.rejectEject(error)
        this.closed = true
        socket.close()
      }, 10_000)
      try {
        socket.send(new Uint8Array([FRAME_EJECT]))
      } catch (error) {
        this.rejectEject(error instanceof Error ? error : new Error(String(error)))
        this.closed = true
        socket.close()
      }
    })
  }

  requestStatus() {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(new Uint8Array([FRAME_STATUS]))
  }

  destroy() {
    this.closed = true
    this.mounted = false
    this.file = null
    const socket = this.socket
    this.socket = null
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
    this.rejectConnect(new Error('Browser ISO session closed'))
    this.rejectEject(new Error('Browser ISO session closed'))
  }

  private async handleFrame(socket: WebSocket, buffer: ArrayBuffer) {
    const bytes = new Uint8Array(buffer)
    if (!bytes.length) return
    const view = new DataView(buffer)
    switch (bytes[0]) {
      case FRAME_STATUS_REPLY: {
        if (bytes.length < 20) return this.failProtocol(socket, 'Invalid virtual-media status')
        const nameLength = view.getUint16(18)
        if (bytes.length !== 20 + nameLength) return this.failProtocol(socket, 'Invalid virtual-media status')
        if (bytes[1] === STATE_MOUNTED) {
          this.mounted = true
          this.resolveConnect()
          this.emitProgress(true)
        }
        break
      }
      case FRAME_READ_BATCH:
        this.handleReadBatch(socket, bytes, view)
        break
      case FRAME_EJECTED:
        if (bytes.length < 5) return this.failProtocol(socket, 'Invalid virtual-media eject message')
        let ejectFailure = ''
        const wasMounted = this.mounted
        const ejectPending = this.ejectReject !== null
        {
          const reasonCode = view.getUint16(1)
          const messageLength = view.getUint16(3)
          if (bytes.length !== 5 + messageLength) return this.failProtocol(socket, 'Invalid virtual-media eject message')
          const reason = new TextDecoder().decode(bytes.subarray(5))
          if (reasonCode !== 0) {
            ejectFailure = reason || 'Browser ISO was ejected after a backend failure'
            this.rejectConnect(new Error(ejectFailure))
            if (wasMounted && !ejectPending) this.callbacks.disconnected(ejectFailure)
          }
        }
        this.closed = true
        this.mounted = false
        this.file = null
        if (ejectFailure) this.rejectEject(new Error(ejectFailure))
        else {
          this.ejectResolve?.()
          this.ejectResolve = null
          this.ejectReject = null
          this.clearEjectTimer()
        }
        socket.close()
        break
      case FRAME_ERROR: {
        if (bytes.length < 5) return this.failProtocol(socket, 'Invalid virtual-media error')
        const messageLength = view.getUint16(3)
        if (bytes.length !== 5 + messageLength) return this.failProtocol(socket, 'Invalid virtual-media error')
        const message = new TextDecoder().decode(bytes.subarray(5)) || 'Virtual-media request failed'
        const wasMounted = this.mounted
        this.rejectConnect(new Error(message))
        this.rejectEject(new Error(message))
        if (wasMounted) this.callbacks.disconnected(message)
        this.closed = true
        socket.close()
        break
      }
      default:
        this.failProtocol(socket, 'Unknown virtual-media message')
    }
  }

  private handleReadBatch(socket: WebSocket, bytes: Uint8Array, view: DataView) {
    const file = this.file
    if (!file || bytes.length < 2) return this.failProtocol(socket, 'Invalid ISO read request batch')
    const count = bytes[1]
    if (count === 0 || count > MAX_READ_BATCH || bytes.length !== 2 + count * 16) {
      return this.failProtocol(socket, 'Invalid ISO read request batch')
    }

    try {
      const prefix = new Uint8Array([FRAME_READ_DATA_BATCH, count])
      const parts: BlobPart[] = [prefix]
      let transferred = 0
      for (let index = 0; index < count; index++) {
        const base = 2 + index * 16
        const requestID = view.getUint32(base)
        const offset = view.getBigUint64(base + 4)
        const length = view.getUint32(base + 12)
        if (length === 0 || length > MAX_READ || offset > BigInt(Number.MAX_SAFE_INTEGER) || offset + BigInt(length) > BigInt(file.size)) {
          return this.failProtocol(socket, 'ISO read request is out of range')
        }
        const metadata = new Uint8Array(8)
        const metadataView = new DataView(metadata.buffer)
        metadataView.setUint32(0, requestID)
        metadataView.setUint32(4, length)
        parts.push(metadata, file.slice(Number(offset), Number(offset) + length))
        transferred += length
      }
      if (this.socket !== socket || socket.readyState !== WebSocket.OPEN) return
      // Passing File slices as Blob parts lets Chromium stream file-backed
      // ranges into the socket without materialising and copying every range
      // through an intermediate ArrayBuffer in JavaScript.
      socket.send(new Blob(parts, { type: 'application/octet-stream' }))
      this.transferred += transferred
      this.sampleBytes += transferred
      this.emitProgress(false)
    } catch (error) {
      this.failProtocol(socket, error instanceof Error ? error.message : String(error))
    }
  }

  private emitProgress(force: boolean) {
    const file = this.file
    if (!file) return
    const now = performance.now()
    if (!force && now - this.lastProgressAt < 250) return
    const elapsed = Math.max(1, now - this.sampleStartedAt)
    this.callbacks.progress({
      name: file.name,
      size: file.size,
      transferred: this.transferred,
      bytesPerSecond: Math.round(this.sampleBytes * 1000 / elapsed),
    })
    this.lastProgressAt = now
    if (elapsed >= 1000) {
      this.sampleStartedAt = now
      this.sampleBytes = 0
    }
  }

  private resolveConnect() {
    this.connectResolve?.()
    this.connectResolve = null
    this.connectReject = null
  }

  private rejectConnect(error: Error) {
    this.connectReject?.(error)
    this.connectResolve = null
    this.connectReject = null
  }

  private rejectEject(error: Error) {
    this.ejectReject?.(error)
    this.ejectResolve = null
    this.ejectReject = null
    this.clearEjectTimer()
  }

  private clearEjectTimer() {
    if (this.ejectTimer !== null) clearTimeout(this.ejectTimer)
    this.ejectTimer = null
  }

  private failProtocol(socket: WebSocket, message: string) {
    const wasMounted = this.mounted
    this.rejectConnect(new Error(message))
    this.rejectEject(new Error(message))
    if (wasMounted) this.callbacks.disconnected(message)
    this.closed = true
    socket.close(1003, message.slice(0, 120))
  }
}
