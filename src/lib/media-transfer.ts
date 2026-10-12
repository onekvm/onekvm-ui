export interface MediaTransferState {
  minimized: boolean
  uploading: boolean
  name: string
  progress: number
  transferred: number
  total: number
  speed: number
  remainingSeconds: number
  title: string
  action: 'upload' | 'download'
}

export function emptyMediaTransfer(): MediaTransferState {
  return {
    minimized: false, uploading: false, name: '', progress: 0,
    transferred: 0, total: 0, speed: 0, remainingSeconds: 0,
    title: '', action: 'upload',
  }
}
