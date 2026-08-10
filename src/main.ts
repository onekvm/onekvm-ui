import { createApp } from 'vue'
import {
  create,
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NCheckboxGroup,
  NCollapse,
  NCollapseItem,
  NCollapseTransition,
  NConfigProvider,
  NDescriptions,
  NDescriptionsItem,
  NDialogProvider,
  NDivider,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NEmpty,
  NForm,
  NFormItem,
  NGlobalStyle,
  NInput,
  NInputNumber,
  NMenu,
  NMessageProvider,
  NModal,
  NPopconfirm,
  NPopover,
  NProgress,
  NRadioButton,
  NRadioGroup,
  NSelect,
  NSlider,
  NSpin,
  NStep,
  NSteps,
  NSwitch,
  NTab,
  NTabPane,
  NTabs,
  NTag,
  NTooltip,
} from 'naive-ui'

import App from './App.vue'
import { api, APIError } from './api/client'
import { initializeLanguage } from './i18n/runtime'
import './style.css'

const naive = create({
  components: [
    NAlert,
    NButton,
    NCard,
    NCheckbox,
    NCheckboxGroup,
    NCollapse,
    NCollapseItem,
    NCollapseTransition,
    NConfigProvider,
    NDescriptions,
    NDescriptionsItem,
    NDialogProvider,
    NDivider,
    NDrawer,
    NDrawerContent,
    NDropdown,
    NEmpty,
    NForm,
    NFormItem,
    NGlobalStyle,
    NInput,
    NInputNumber,
    NMenu,
    NMessageProvider,
    NModal,
    NPopconfirm,
    NPopover,
    NProgress,
    NRadioButton,
    NRadioGroup,
    NSelect,
    NSlider,
    NSpin,
    NStep,
    NSteps,
    NSwitch,
    NTab,
    NTabPane,
    NTabs,
    NTag,
    NTooltip,
  ],
})

function dismissHTMLLoading() {
  const loading = document.getElementById('onekvm-html-loading')
  if (!loading) return
  const remove = () => loading.remove()
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        remove()
        return
      }
      loading.addEventListener('transitionend', remove, { once: true })
      loading.classList.add('onekvm-html-loading-leave')
      window.setTimeout(remove, 500)
    })
  })
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))
}

async function confirmNetworkAddressChange(token: string) {
	const expiresAt = Date.now() + 12_000
	while (Date.now() < expiresAt) {
		try {
			await api.confirmNetworkApplyToken(token)
			return true
		} catch (reason) {
			// 425 means networkd has not finished switching addresses yet. A
			// transport failure is also expected while the new address settles.
			if (reason instanceof APIError && reason.status !== 425 && reason.status < 500) return true
			await wait(500)
		}
	}
	return false
}

async function bootstrap() {
	const url = new URL(window.location.href)
	const networkConfirmToken = url.searchParams.get('network-confirm')
	if (networkConfirmToken) {
		const completed = await confirmNetworkAddressChange(networkConfirmToken)
		if (completed) {
			url.searchParams.delete('network-confirm')
			window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
		}
	}
  const auth = await api.authStatus().catch(() => null)
  await initializeLanguage(auth?.language, !auth?.configured)
  createApp(App).use(naive).mount('#app')
  dismissHTMLLoading()
}

void bootstrap()
