import { useDialog, useMessage } from 'naive-ui'
import { createAsyncDialogApi } from '@/lib/async-confirmation'
import { hostDialogApi } from '@/theme/dialog'

export function useAsyncDialog() {
  const message = useMessage()
  return createAsyncDialogApi(hostDialogApi(useDialog()), (reason) => {
    message.error(reason instanceof Error ? reason.message : String(reason))
  })
}
