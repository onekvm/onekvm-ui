import { useDialog, useMessage } from 'naive-ui'
import { createAsyncDialogApi } from '@/lib/async-confirmation'

export function useAsyncDialog() {
  const message = useMessage()
  return createAsyncDialogApi(useDialog(), (reason) => {
    message.error(reason instanceof Error ? reason.message : String(reason))
  })
}
