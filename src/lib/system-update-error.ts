/** Recognize stable helper codes and diagnostics returned by older images. */
export function systemUpdateErrorText(raw: string, translate: (key: string, fallback: string) => string): string {
  const text = raw.toLowerCase()
  let kind: string
  let fallback: string
  if (text.includes('[update_payload_corrupted]') || text.includes('bundle payload is corrupted') || text.includes('verification of data area failed')) {
    kind = 'payloadCorrupted'
    fallback = 'Update file data verification failed. Download the firmware again, compare its SHA-256 with the published checksum, then upload it again.'
  } else if (text.includes('[update_signature_invalid]') || text.includes('signature verification failed') || text.includes('failed to verify signature') || text.includes('no matching key found')) {
    kind = 'signatureInvalid'
    fallback = 'Update signature verification failed. Use firmware signed for this device and check the device date and time.'
  } else if (text.includes('target-kernel-metadata') || text.includes('target image is missing kernel magic metadata')) {
    kind = 'kernelMetadataMissing'
    fallback = 'The upgrade plan is missing target kernel compatibility metadata. Cancel this update and upload the latest complete firmware again. If this persists, export diagnostics. This cannot be fixed by uploading a plugin package.'
  } else if (text.includes('[update_extract_failed]') || text.includes('extract verified update bundle:')) {
    kind = 'extractFailed'
    fallback = 'Could not verify or extract the update file. Check available storage and upload a complete firmware file again.'
  } else return raw
  return translate(`settings.advancedSettings.systemPage.updateErrors.${kind}`, fallback)
}
