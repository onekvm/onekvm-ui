export const recoveryLocales = ['en', 'zh', 'zh_tw'] as const

export type RecoveryLocale = (typeof recoveryLocales)[number]

export const recoveryMessages = {
  en: {
    title: 'OneKVM Recovery',
    sub: 'The device is in recovery. This page can flash firmware, reset the default user, or reboot.',
    waitingAddr: 'Waiting for a network address…',
    language: 'Language',
    fwTitle: 'Firmware',
    fwHelp: 'Upload an OneKVM .fwup bundle. It is written to the inactive A/B slot, then that slot is selected.',
    fwLimit: 'The upload stays in tmpfs RAM, so the file cannot be larger than {size}.',
    fwTooBig: 'This file is {size}, larger than the {max} tmpfs limit.',
    fwBtn: 'Flash firmware',
    fwChoose: 'Choose .fwup',
    userTitle: 'Reset default user',
    userHelp: 'Clear the Web login account so first-boot setup runs again. This does not erase all userdata.',
    userBtn: 'Reset default user',
    rebootTitle: 'Reboot',
    rebootHelp: 'Reboot immediately. Flash and user-reset changes take effect after reboot.',
    rebootBtn: 'Reboot',
    confirmUser: 'Clear the login account and return to setup?',
    confirmReboot: 'Reboot now?',
    confirm: 'Continue',
    cancel: 'Cancel',
    choose: 'Choose a .fwup file first',
    uploading: 'Uploading {percent}%',
    extracting: 'Extracting firmware…',
    writingRoot: 'Writing rootfs {percent}%',
    writingBoot: 'Writing boot files…',
    switching: 'Switching boot slot…',
    resetting: 'Resetting the default user…',
    rebooting: 'Rebooting…',
    ok: 'Done.',
    fail: 'Failed: ',
  },
  zh: {
    title: 'OneKVM Recovery',
    sub: '设备处于恢复模式。这里只提供固件刷写、重置默认用户和重启。',
    waitingAddr: '正在获取网络地址…',
    language: '语言',
    fwTitle: '固件刷写',
    fwHelp: '上传 OneKVM 的 .fwup 包。会写入当前未启动的 A/B 槽，然后把启动切过去。',
    fwLimit: '上传会先放进 tmpfs 内存，所以文件不能超过 {size}。',
    fwTooBig: '这个文件有 {size}，超过 tmpfs 上限 {max}。',
    fwBtn: '刷写固件',
    fwChoose: '选择 .fwup',
    userTitle: '重置默认用户',
    userHelp: '清除 Web 登录帐号，下次进入系统会重新走初始化。不会擦除整个 userdata。',
    userBtn: '重置默认用户',
    rebootTitle: '重启',
    rebootHelp: '立即重启设备。如果已经刷写或重置用户，重启后生效。',
    rebootBtn: '重启',
    confirmUser: '确定清除登录帐号并回到初始化？',
    confirmReboot: '确定立即重启？',
    confirm: '继续',
    cancel: '取消',
    choose: '请先选择 .fwup 文件',
    uploading: '正在上传 {percent}%',
    extracting: '正在解包固件…',
    writingRoot: '正在写入 rootfs {percent}%',
    writingBoot: '正在写入启动文件…',
    switching: '正在切换启动槽…',
    resetting: '正在重置默认用户…',
    rebooting: '正在重启…',
    ok: '完成。',
    fail: '失败：',
  },
  zh_tw: {
    title: 'OneKVM Recovery',
    sub: '裝置處於復原模式。這裡只提供韌體刷寫、重設預設使用者和重新啟動。',
    waitingAddr: '正在取得網路位址…',
    language: '語言',
    fwTitle: '韌體刷寫',
    fwHelp: '上傳 OneKVM 的 .fwup 套件。會寫入目前未啟動的 A/B 槽，然後切換到該槽。',
    fwLimit: '上傳會先放進 tmpfs 記憶體，所以檔案不能超過 {size}。',
    fwTooBig: '這個檔案有 {size}，超過 tmpfs 上限 {max}。',
    fwBtn: '刷寫韌體',
    fwChoose: '選擇 .fwup',
    userTitle: '重設預設使用者',
    userHelp: '清除 Web 登入帳號，下次進入系統會重新走初始化。不會清除整個 userdata。',
    userBtn: '重設預設使用者',
    rebootTitle: '重新啟動',
    rebootHelp: '立即重新啟動裝置。若已刷寫或重設使用者，重啟後生效。',
    rebootBtn: '重新啟動',
    confirmUser: '確定清除登入帳號並回到初始化？',
    confirmReboot: '確定立即重新啟動？',
    confirm: '繼續',
    cancel: '取消',
    choose: '請先選擇 .fwup 檔案',
    uploading: '正在上傳 {percent}%',
    extracting: '正在解包韌體…',
    writingRoot: '正在寫入 rootfs {percent}%',
    writingBoot: '正在寫入啟動檔…',
    switching: '正在切換啟動槽…',
    resetting: '正在重設預設使用者…',
    rebooting: '正在重新啟動…',
    ok: '完成。',
    fail: '失敗：',
  },
} as const

export type RecoveryMessageKey = keyof (typeof recoveryMessages)['en']

const aliases: Record<string, RecoveryLocale> = {
  'zh-cn': 'zh',
  'zh-sg': 'zh',
  zh: 'zh',
  'zh-tw': 'zh_tw',
  'zh-hk': 'zh_tw',
  zh_tw: 'zh_tw',
  en: 'en',
}

export function isRecoveryLocale(value: string): value is RecoveryLocale {
  return recoveryLocales.includes(value as RecoveryLocale)
}

export function detectRecoveryLocale(languages: readonly string[]): RecoveryLocale {
  for (const raw of languages) {
    if (!raw) continue
    const lower = raw.toLowerCase()
    const aliased = aliases[lower]
    if (aliased) return aliased
    const prefix = lower.split(/[-_]/)[0]
    if (isRecoveryLocale(prefix)) return prefix
  }
  return 'en'
}

export function recoveryDocumentLang(locale: RecoveryLocale) {
  if (locale === 'zh') return 'zh-CN'
  if (locale === 'zh_tw') return 'zh-TW'
  return 'en'
}
