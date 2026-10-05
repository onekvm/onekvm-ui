import { reactive } from 'vue'

export type UninstallExtensionTarget = {
  id: string
  name: string
}

type UninstallWaiter = {
  resolve: (uninstalled: boolean) => void
}

const waiter: { current: UninstallWaiter | null } = { current: null }

export const uninstallDialog = reactive({
  show: false,
  loading: false,
  id: '',
  name: '',
  deleteData: false,
})

export function uninstallExtension(target: UninstallExtensionTarget): Promise<boolean> {
  if (!target.id) {
    return Promise.reject(new Error('extension id is required'))
  }
  waiter.current?.resolve(false)
  uninstallDialog.id = target.id
  uninstallDialog.name = target.name
  uninstallDialog.deleteData = false
  uninstallDialog.loading = false
  uninstallDialog.show = true
  return new Promise((resolve) => {
    waiter.current = { resolve }
  })
}

export function settleUninstall(uninstalled: boolean) {
  uninstallDialog.show = false
  uninstallDialog.loading = false
  const pending = waiter.current
  waiter.current = null
  pending?.resolve(uninstalled)
}
