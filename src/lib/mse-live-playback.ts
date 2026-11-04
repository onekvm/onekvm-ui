/** Keep small live-stream backlogs without resetting the decoder's reference chain. */
export class MseLivePlayback {
  private timer: ReturnType<typeof setInterval> | undefined
  private mediaMs = 0
  private keyframeTime: number | null = null
  private catchingUp = false
  private recoveryRequestedAt = -Infinity
  private recoveryAfterKeyframe: number | null = null
  private previousTime = 0
  private progressedAt = 0

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly requestKeyframe: () => void,
  ) {}

  start() {
    this.stop()
    this.progressedAt = performance.now()
    this.timer = setInterval(() => this.update(performance.now()), 100)
  }

  reset() {
    this.mediaMs = 0
    this.keyframeTime = null
    this.catchingUp = false
    this.recoveryRequestedAt = -Infinity
    this.recoveryAfterKeyframe = null
    this.previousTime = 0
    this.progressedAt = performance.now()
    this.video.playbackRate = 1
  }

  fed(durationMs: number, keyframe: boolean) {
    if (keyframe) this.keyframeTime = this.mediaMs / 1000
    this.mediaMs += durationMs
  }

  stop() {
    clearInterval(this.timer)
    this.timer = undefined
    this.video.playbackRate = 1
  }

  private update(now: number) {
    const video = this.video
    if (video.paused || video.seeking || !video.buffered.length) {
      this.progressedAt = now
      return
    }
    const time = video.currentTime
    if (time !== this.previousTime) {
      this.previousTime = time
      this.progressedAt = now
    }
    // Use the range containing the playhead; a disjoint future range is a
    // recovery target, not playable headroom at the current position.
    let end: number | null = null
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= time && time <= video.buffered.end(i)) {
        end = video.buffered.end(i)
        break
      }
    }
    const lead = end === null ? 0 : end - time
    if (lead > 0.12) this.catchingUp = true
    else if (lead < 0.09) this.catchingUp = false
    video.playbackRate = this.catchingUp ? 1.1 : 1

    if (lead > 0.75 || now - this.progressedAt >= 1000 || end === null) {
      if (now - this.recoveryRequestedAt >= 2000) {
        this.recoveryRequestedAt = now
        this.recoveryAfterKeyframe = this.keyframeTime ?? -1
        this.requestKeyframe()
      }
    }
    const key = this.keyframeTime
    if (this.recoveryAfterKeyframe === null || key === null
      || key <= this.recoveryAfterKeyframe || key <= time) return
    for (let i = 0; i < video.buffered.length; i++) {
      const start = video.buffered.start(i), edge = video.buffered.end(i)
      // Only seek onto a newly requested random-access point, with several
      // frames already appended. Seeking near the end of a long GOP replays
      // that GOP and can create hundreds of milliseconds of new backlog.
      if (start <= key && edge - key >= 0.04 && edge - key <= 0.25) {
        video.currentTime = key + 0.001
        video.playbackRate = 1
        this.catchingUp = false
        this.recoveryAfterKeyframe = null
        this.progressedAt = now
        break
      }
    }
  }
}
