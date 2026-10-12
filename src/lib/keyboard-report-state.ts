type KeyboardState = { keys: number[]; modifiers: number }

// A report describes the whole keyboard. Keep each input source's held state so
// releasing a virtual key cannot release a key still held on the physical one.
export class KeyboardReportState {
  private sources = new Map<string, KeyboardState>()
  private send: (keys: number[], modifiers: number) => void

  constructor(send: (keys: number[], modifiers: number) => void) {
    this.send = send
  }

  set(source: string, keys: number[], modifiers = 0) {
    if (keys.length || modifiers) this.sources.set(source, { keys: [...keys], modifiers })
    else this.sources.delete(source)
    this.sendCurrent()
  }

  release(...sources: string[]) {
    sources.forEach((source) => this.sources.delete(source))
    this.sendCurrent()
  }

  private sendCurrent() {
    const keys = new Set<number>()
    let modifiers = 0
    for (const state of this.sources.values()) {
      state.keys.forEach((key) => keys.add(key))
      modifiers |= state.modifiers
    }
    this.send([...keys], modifiers)
  }
}
