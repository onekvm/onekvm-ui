import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig, type Plugin } from 'vite'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
const outDir = path.join(rootDir, 'dist-recovery')

function escapeInline(source: string, tag: 'script' | 'style') {
  return source.replaceAll(new RegExp(`</${tag}`, 'gi'), `<\\/${tag}`)
}

function resolveBuiltAsset(href: string) {
  const relative = href.replace(/^\//, '')
  if (relative.includes('..') || path.isAbsolute(relative)) {
    throw new Error(`unsafe recovery asset path: ${href}`)
  }
  return path.join(outDir, relative)
}

function recoveryDevMock(): Plugin {
  return {
    name: 'onekvm-recovery-dev-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (req.method === 'GET' && (url === '/' || url === '/index.html')) {
          req.url = '/recovery.html'
        }
        if (req.method === 'GET' && url === '/status') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            addresses: ['10.100.99.107'],
            firmwareMax: 120 * 1024 * 1024,
          }))
          return
        }
        if (req.method === 'GET' && url === '/progress') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end('{"phase":"idle"}\n')
          return
        }
        if (req.method === 'POST' && (url === '/reset-user' || url === '/factory-reset' || url === '/reboot' || url === '/firmware')) {
          req.resume()
          req.on('end', () => {
            res.setHeader('Content-Type', 'text/plain; charset=utf-8')
            res.end('ok\n')
          })
          return
        }
        next()
      })
    },
  }
}

function inlineRecoveryHtml(): Plugin {
  return {
    name: 'onekvm-inline-recovery-html',
    apply: 'build',
    enforce: 'post',
    closeBundle() {
      const builtHtml = fs.existsSync(path.join(outDir, 'recovery.html'))
        ? 'recovery.html'
        : 'index.html'
      const htmlPath = path.join(outDir, builtHtml)
      if (!fs.existsSync(htmlPath)) {
        throw new Error(`recovery HTML missing: ${htmlPath}`)
      }

      const referenced = new Set<string>()
      let html = fs.readFileSync(htmlPath, 'utf8')
      html = html.replace(/<link rel="modulepreload"[^>]*>/g, '')
      html = html.replace(
        /<script type="module"[^>]*src="([^"]+)"[^>]*><\/script>/g,
        (_match, src: string) => {
          const file = resolveBuiltAsset(src)
          if (!fs.existsSync(file)) throw new Error(`missing recovery script: ${file}`)
          referenced.add(file)
          return `<script type="module">${escapeInline(fs.readFileSync(file, 'utf8'), 'script')}</script>`
        },
      )
      html = html.replace(
        /<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g,
        (_match, href: string) => {
          const file = resolveBuiltAsset(href)
          if (!fs.existsSync(file)) throw new Error(`missing recovery stylesheet: ${file}`)
          referenced.add(file)
          return `<style>${escapeInline(fs.readFileSync(file, 'utf8'), 'style')}</style>`
        },
      )

      if (/src="\/assets\//.test(html) || /href="\/assets\//.test(html)) {
        throw new Error('recovery HTML still references hashed assets')
      }
      if (!html.includes('/firmware') || !html.includes('/reset-user') || !html.includes('/factory-reset') || !html.includes('/reboot')) {
        throw new Error('recovery HTML is missing firmware, reset-user, factory-reset, or reboot')
      }

      fs.writeFileSync(path.join(outDir, 'index.html'), html)
      if (builtHtml !== 'index.html') fs.unlinkSync(htmlPath)
      for (const file of referenced) fs.unlinkSync(file)
      const assetsDir = path.join(outDir, 'assets')
      if (fs.existsSync(assetsDir) && fs.readdirSync(assetsDir).length === 0) {
        fs.rmdirSync(assetsDir)
      }
    },
  }
}

export default defineConfig({
  plugins: [vue(), recoveryDevMock(), inlineRecoveryHtml()],
  publicDir: false,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3002,
  },
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 1024 * 1024,
    chunkSizeWarningLimit: 256,
    rollupOptions: {
      input: path.join(rootDir, 'recovery.html'),
      output: {
        inlineDynamicImports: true,
      },
    },
  },
})
