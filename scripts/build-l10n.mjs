import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { builtinLanguages, loadTranslation, writeJson } from './l10n-catalog.mjs'

const root = fileURLToPath(new URL('..', import.meta.url))

for (const language of builtinLanguages) {
  const translation = await loadTranslation(root, language.code)
  const directory = path.join(root, 'l10n-out', language.code)
  const artwork = path.join(directory, 'no-signal')
  mkdirSync(artwork, { recursive: true })
  writeJson(path.join(directory, 'manifest.json'), { code: language.code, name: language.name })
  writeJson(path.join(directory, 'messages.json'), translation)
  const screen = translation.screen || {}
  writeJson(path.join(artwork, 'copy.json'), {
    code: language.code,
    title: screen.noSignal,
    check: screen.checkIfTitle,
    lines: [screen.checkCableSimple, screen.checkSourceSimple, screen.checkSleepSimple],
  })
}

function pythonWithPillow() {
  for (const command of ['python3', '/usr/bin/python3']) {
    const probe = spawnSync(command, ['-c', 'import PIL'], { stdio: 'ignore' })
    if (probe.status === 0) return command
  }
  return 'python3'
}

const render = spawnSync(pythonWithPillow(), [path.join(root, 'scripts/render-no-signal.py'), path.join(root, 'l10n-out')], {
  stdio: 'inherit',
})
if (render.status !== 0) process.exit(render.status || 1)
