import { defineComponent, h } from 'vue'
import { NDropdown, dropdownProps } from 'naive-ui'
import { useOverlayMount } from '@/composables/useOverlayMount'

// Extension menus share the host's popup layer and fullscreen mount target.
export default defineComponent({
  name: 'ExtensionDropdown',
  inheritAttrs: false,
  props: { ...dropdownProps, zIndex: { type: Number, default: 4000 } },
  setup(props, { attrs, slots }) {
    const overlayTo = useOverlayMount()
    return () => h(NDropdown, { ...attrs, ...props, to: props.to ?? overlayTo.value }, slots)
  },
})
