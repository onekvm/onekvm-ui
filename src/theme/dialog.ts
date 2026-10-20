import { h } from 'vue'
import type { DialogApi, DialogOptions } from 'naive-ui'

/** Add host skin hooks while retaining Naive's dialog and dismissal behavior. */
export function hostDialogApi(api: DialogApi): DialogApi {
  const host = { ...api }
  for (const method of ['create', 'warning', 'error', 'info', 'success'] as const) {
    host[method] = (options: DialogOptions = {}) => {
      const title = options.title
      const type = method === 'create' ? options.type ?? 'default' : method
      return api[method]({
        ...options,
        class: [
          'host-confirm-dialog host-dialog host-window-frame',
          `host-confirm-${type}`,
          options.icon ? 'host-confirm-custom-icon' : '',
          options.class,
        ],
        title: () => h('span', { class: 'host-confirm-title' }, [typeof title === 'function' ? title() : title]),
      })
    }
  }
  return host
}
