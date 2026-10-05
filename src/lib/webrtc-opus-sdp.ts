const OPUS_RTPMAP = /^a=rtpmap:(\d+)\s+opus\/48000/i
const FMTP = /^a=fmtp:(\d+)\s+(.*)$/i

export function applyOpusStereoPreference(sdp: string, stereo: boolean): string {
  if (!sdp) return sdp
  const newline = sdp.includes('\r\n') ? '\r\n' : '\n'
  const lines = sdp.replace(/\r\n/g, '\n').split('\n')
  const opusPts = new Set<string>()
  for (const line of lines) {
    const match = line.match(OPUS_RTPMAP)
    if (match) opusPts.add(match[1])
  }
  if (opusPts.size === 0) return sdp

  const haveFmtp = new Set<string>()
  const rewritten = lines.map((line) => {
    const match = line.match(FMTP)
    if (!match || !opusPts.has(match[1])) return line
    haveFmtp.add(match[1])
    return `a=fmtp:${match[1]} ${setOpusStereoParams(match[2], stereo)}`
  })

  const withFmtp: string[] = []
  for (const line of rewritten) {
    withFmtp.push(line)
    const match = line.match(OPUS_RTPMAP)
    if (!match || haveFmtp.has(match[1])) continue
    haveFmtp.add(match[1])
    withFmtp.push(`a=fmtp:${match[1]} ${setOpusStereoParams('minptime=10;useinbandfec=1', stereo)}`)
  }
  return withFmtp.join(newline)
}

/* Chrome NetEq waits for in-band FEC before playing. KVM is a LAN console:
 * FEC mainly inflates the audio jitter buffer. Strip it on offer and answer. */
export function preferLowDelayOpus(sdp: string): string {
  if (!sdp) return sdp
  return sdp.replace(/useinbandfec=1/gi, 'useinbandfec=0')
}

export function setOpusStereoParams(params: string, stereo: boolean): string {
  const parts = params.split(';').map((part) => part.trim()).filter(Boolean)
  const kept = parts.filter((part) => {
    const key = part.split('=')[0]?.trim().toLowerCase()
    return key !== 'stereo' && key !== 'sprop-stereo'
  })
  if (stereo) {
    kept.push('stereo=1', 'sprop-stereo=1')
  }
  return kept.join(';')
}
