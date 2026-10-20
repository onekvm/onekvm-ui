/** Upgrade an online media source to HTTPS before it reaches the device. */
export function httpsDownloadURL(value: string) {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:') return url.toString()
    url.protocol = 'https:'
    if (url.port === '80') url.port = ''
    return url.toString()
  } catch {
    return value.trim()
  }
}
