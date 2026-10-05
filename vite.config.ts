import { fileURLToPath, URL } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

function proxyOptions(target: string): ProxyOptions {
  return {
    target,
    changeOrigin: true,
    secure: false,
    ws: true,
  }
}

function normalizeProxyTarget(value: string) {
  const configured = value.trim()
  if (!configured) return ''
  const target = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(configured) ? configured : `http://${configured}`)
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('ONEKVM_DEV_PROXY_TARGET must use http or https')
  }
  return target.origin
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = normalizeProxyTarget(env.ONEKVM_DEV_PROXY_TARGET || '')
  const proxy = proxyTarget
    ? {
        '/api': proxyOptions(proxyTarget),
        '/plugins': proxyOptions(proxyTarget),
      }
    : undefined

  return {
    plugins: [vue()],
    base: mode === 'cloud' ? './' : '/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 3001,
      proxy,
    },
    build: {
      chunkSizeWarningLimit: 1024,
    },
  }
})
