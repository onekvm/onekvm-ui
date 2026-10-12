import type { DialogApi, DialogOptions, DialogReactive } from 'naive-ui'

export function createAsyncConfirmation(
  action: (event: MouseEvent) => unknown,
  setPending: (pending: boolean) => void,
  reportError: (reason: unknown) => void,
) {
  let pending = false
  return (event: MouseEvent): unknown => {
    if (pending) return false
    pending = true
    try {
      const result = action(event)
      if (!result || typeof (result as PromiseLike<unknown>).then !== 'function') {
        pending = false
        return result
      }
      setPending(true)
      return Promise.resolve(result).catch((reason: unknown) => {
        reportError(reason)
        return false
      }).finally(() => {
        pending = false
        setPending(false)
      })
    } catch (reason) {
      pending = false
      reportError(reason)
      return false
    }
  }
}

export function createAsyncDialogApi(api: DialogApi, reportError: (reason: unknown) => void): DialogApi {
  const wrapped = { ...api }
  for (const method of ['create', 'warning', 'error', 'info', 'success'] as const) {
    wrapped[method] = (options: DialogOptions) => {
      if (!options.onPositiveClick) return api[method](options)
      let prompt: DialogReactive
      let busy = false
      const onPositiveClick = createAsyncConfirmation(options.onPositiveClick, (pending) => {
        busy = pending
        prompt.loading = pending ? true : options.loading
        prompt.negativeButtonProps = pending
          ? { ...options.negativeButtonProps, disabled: true }
          : options.negativeButtonProps
        prompt.closable = pending ? false : options.closable
        prompt.maskClosable = pending ? false : options.maskClosable
        prompt.closeOnEsc = pending ? false : options.closeOnEsc
      }, reportError)
      prompt = api[method]({
        ...options,
        onPositiveClick,
        onNegativeClick: (event) => busy ? false : options.onNegativeClick?.(event),
        onClose: () => busy ? false : options.onClose?.(),
        onMaskClick: (event) => { if (!busy) options.onMaskClick?.(event) },
        onEsc: () => { if (!busy) options.onEsc?.() },
      })
      return prompt
    }
  }
  return wrapped
}
