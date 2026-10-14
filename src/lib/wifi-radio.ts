export type ApBand = '2.4' | '5'
type RadioStatus = { ap_channels?: number[] }

// Only an absent field belongs to an older API; an empty list means unavailable.
export function apChannels(status: RadioStatus | null | undefined): number[] {
  return status?.ap_channels ?? [1, 6, 11]
}

export function apBands(status: RadioStatus): ApBand[] {
  const channels = apChannels(status)
  return (['2.4', '5'] as const).filter((band) => channels.some((channel) => channelBand(channel) === band))
}

export function channelBand(channel: number): ApBand {
  return channel > 14 ? '5' : '2.4'
}

export function validApChannel(status: RadioStatus | null, band: ApBand, channel: number): boolean {
  const channels = apChannels(status)
  return channel === 0
    ? channels.some((candidate) => channelBand(candidate) === band)
    : channels.includes(channel) && channelBand(channel) === band
}

export function normalizeApChannel(status: RadioStatus, band: ApBand, channel: number): { band: ApBand; channel: number } {
  if (validApChannel(status, band, channel)) return { band, channel }
  return { band: apBands(status).includes(band) ? band : apBands(status)[0] ?? band, channel: 0 }
}
