import assert from 'node:assert/strict'

import { extensionHostErrorText } from '../src/lib/extension-host-error.ts'

const en = (path: string, fallback: string) => fallback
const zh = (path: string) => ({
  'settings.plugins.startRejected': '插件无法启动，系统拒绝了这项服务配置（错误 {code}）。',
  'settings.plugins.exitedDuringStartup': '{name} 在启动后立即退出，目前没有在运行。',
}[path] || path)

const stderr = [
  'extension screen-display: preparing legacy service',
  'extension screen-display: submitting transient service',
  'onekvm-extension-host: extension screen-display exited during startup',
].join('\n')

assert.equal(
  extensionHostErrorText('onekvm-extension-host: StartTransientUnit failed (-22)', en),
  'The plugin could not be started. The system rejected the service setup (error -22).',
)
assert.equal(
  extensionHostErrorText('onekvm-extension: StartTransientUnit failed (-22)', zh),
  '插件无法启动，系统拒绝了这项服务配置（错误 -22）。',
)
assert.equal(
  extensionHostErrorText(stderr, zh, (id) => id === 'screen-display' ? '屏幕显示设置' : id),
  '屏幕显示设置 在启动后立即退出，目前没有在运行。',
)
assert.equal(
  extensionHostErrorText('onekvm-extension-host: extension frp exited during startup', en, () => 'FRP'),
  'FRP exited immediately after starting and is not running.',
)

const unknown = 'onekvm-extension-host: memory budget is insufficient: required=1 available=0 used=1 total=1'
assert.equal(extensionHostErrorText(unknown, en), unknown)

console.log('extension-host-error tests passed')
