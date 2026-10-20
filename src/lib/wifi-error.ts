/** Translate known Wi-Fi failures while preserving unexpected diagnostic details. */
export function wifiErrorText(raw: string, translate: (path: string, fallback: string) => string): string {
  if (raw === 'Wi-Fi association timed out; previous saved networks restored') {
    return translate('network.wifi.connectionTimeout', 'Could not connect to Wi-Fi in time. Previous saved network settings have been restored. Check the password and signal, then try again.')
  }
  if (raw === 'Wi-Fi connection already in progress') {
    return translate('network.wifi.connectionInProgress', 'A Wi-Fi connection is already in progress. Please wait.')
  }
  return raw
}
