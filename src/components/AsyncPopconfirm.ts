import { defineComponent, h, shallowRef } from 'vue'
import { NPopconfirm, popconfirmProps, useMessage, type PopconfirmInst } from 'naive-ui'
import { createAsyncConfirmation } from '@/lib/async-confirmation'

export default defineComponent({
  name: 'Popconfirm',
  inheritAttrs: false,
  props: popconfirmProps,
  setup(props, { attrs, slots, expose }) {
    const message = useMessage()
    const pending = shallowRef(false)
    const visible = shallowRef(props.defaultShow)
    const instance = shallowRef<PopconfirmInst | null>(null)
    const onPositiveClick = createAsyncConfirmation(
      (event) => props.onPositiveClick?.(event),
      (value) => { pending.value = value },
      (reason) => { message.error(reason instanceof Error ? reason.message : String(reason)) },
    )
    function updateShow(value: boolean) {
      if (pending.value) return
      visible.value = value
      for (const handler of [props['onUpdate:show'], props.onUpdateShow]) {
        for (const callback of Array.isArray(handler) ? handler : [handler]) callback?.(value)
      }
    }
    expose({
      setShow: (value: boolean) => { if (!pending.value) instance.value?.setShow(value) },
      syncPosition: () => instance.value?.syncPosition(),
    })
    return () => h(NPopconfirm, {
      ...attrs,
      ...props,
      ref: instance,
      show: pending.value || (props.show ?? visible.value),
      positiveButtonProps: pending.value
        ? { ...props.positiveButtonProps, loading: true, disabled: true }
        : props.positiveButtonProps,
      negativeButtonProps: pending.value
        ? { ...props.negativeButtonProps, disabled: true }
        : props.negativeButtonProps,
      onPositiveClick,
      onNegativeClick: (event: MouseEvent) => pending.value ? false : props.onNegativeClick?.(event),
      onUpdateShow: undefined,
      'onUpdate:show': updateShow,
    }, slots)
  },
})
