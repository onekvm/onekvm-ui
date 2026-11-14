import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { builtinLanguages, loadTranslation } from './l10n-catalog.mjs'

const codePattern = /^[a-z]{2,8}(_[a-z0-9]{2,8})?$/

function sendJson(res, value) {
  const body = JSON.stringify(value)
  res.statusCode = 200
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache')
  res.end(body)
}

export function l10nDevPlugin(root) {
  const cache = new Map()
  return {
    name: 'onekvm-l10n',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] || ''
        if (req.method !== 'GET' && req.method !== 'HEAD') return next()
        if (url === '/l10n/index.json') {
          const languages = builtinLanguages.map((language) => ({ ...language }))
          const extras = []
          const output = path.join(root, 'l10n-out')
          if (existsSync(output)) {
            for (const name of readdirSync(output, { withFileTypes: true })) {
              if (!name.isDirectory() || !codePattern.test(name.name)) continue
              if (languages.some((language) => language.code === name.name)) continue
              const manifest = path.join(output, name.name, 'manifest.json')
              if (!existsSync(manifest)) continue
              try {
                const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
                if (parsed.code === name.name && typeof parsed.name === 'string' && parsed.name) {
                  extras.push({ code: parsed.code, name: parsed.name })
                }
              } catch {
                /* Skip a pack whose manifest cannot be read. */
              }
            }
          }
          extras.sort((left, right) => left.code.localeCompare(right.code))
          sendJson(res, { languages: [...languages, ...extras] })
          return
        }
        const match = url.match(/^\/l10n\/([a-z]{2,8}(?:_[a-z0-9]{2,8})?)\/messages\.json$/)
        if (!match) return next()
        const code = match[1]
        const packed = path.join(root, 'l10n-out', code, 'messages.json')
        if (existsSync(packed)) {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-cache')
          res.end(readFileSync(packed))
          return
        }
        if (!builtinLanguages.some((language) => language.code === code)) return next()
        try {
          if (!cache.has(code)) cache.set(code, await loadTranslation(root, code))
          sendJson(res, cache.get(code))
        } catch (error) {
          server.config.logger.error(`l10n ${code}: ${error}`)
          next()
        }
      })
    },
  }
}
