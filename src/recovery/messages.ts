export const recoveryLocales = ['en', 'zh', 'zh_tw'] as const

export type RecoveryLocale = (typeof recoveryLocales)[number]

export const recoveryMessages = {
  en: {
    title: 'Recovery',
    waitingAddr: 'Waiting for a network address…',
    storage: 'Storage',
    language: 'Language',
    theme: 'Appearance',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    fwTitle: 'Firmware image',
    fwHelp: 'Supports update packages (.fwup) and complete installer images (.img).',
    fwTooBig: 'This file is {size}, larger than the {max} limit.',
    fwBtn: 'Flash image',
    fwChoose: 'Choose image',
    fwDrop: 'or drop a .fwup / .img file here',
    userTitle: 'Reset default user',
    userHelp: 'Clear the Web login. Setup runs again on next boot.',
    userBtn: 'Reset',
    factoryTitle: 'Factory reset',
    factoryHelp: 'Erase userdata and reboot into setup.',
    factoryBtn: 'Erase',
    rebootTitle: 'Reboot',
    rebootHelp: 'Leave recovery and reboot.',
    rebootBtn: 'Reboot',
    confirmUser: 'Clear the login account and return to setup?',
    confirmFactory: 'Erase all userdata and reboot? This cannot be undone.',
    confirmReboot: 'Leave recovery and reboot now?',
    confirm: 'Continue',
    cancel: 'Cancel',
    choose: 'Choose a .fwup or .img file first',
    uploading: 'Uploading {percent}%',
    extracting: 'Extracting firmware…',
    verifying: 'Checking SHA-256…',
    writingRoot: 'Writing rootfs {percent}%',
    writingBoot: 'Writing boot files…',
    switching: 'Switching boot slot…',
    resetting: 'Resetting the default user…',
    factoryResetting: 'Erasing userdata…',
    rebooting: 'Rebooting…',
    ok: 'Done.',
    fail: 'Failed: ',
  },
  zh: {
    title: '恢复模式',
    waitingAddr: '正在获取网络地址…',
    storage: '存储',
    language: '语言',
    theme: '外观',
    themeSystem: '跟随系统',
    themeLight: '浅色',
    themeDark: '深色',
    fwTitle: '刷写镜像',
    fwHelp: '支持更新包（.fwup）和完整安装镜像（.img）。',
    fwTooBig: '这个文件有 {size}，超过上限 {max}。',
    fwBtn: '开始刷写',
    fwChoose: '选择镜像',
    fwDrop: '或把 .fwup / .img 拖到这里',
    userTitle: '重置默认用户',
    userHelp: '清除 Web 登录帐号，下次启动会重新初始化。',
    userBtn: '重置',
    factoryTitle: '恢复出厂设置',
    factoryHelp: '擦除用户数据并重启，进入初始化。',
    factoryBtn: '擦除',
    rebootTitle: '重启',
    rebootHelp: '退出恢复模式并重启。',
    rebootBtn: '重启',
    confirmUser: '确定清除登录帐号并回到初始化？',
    confirmFactory: '确定擦除全部用户数据并重启？此操作不可撤销。',
    confirmReboot: '确定退出恢复模式并重启？',
    confirm: '继续',
    cancel: '取消',
    choose: '请先选择 .fwup 或 .img 文件',
    uploading: '正在上传 {percent}%',
    extracting: '正在解包固件…',
    verifying: '正在校验 SHA-256…',
    writingRoot: '正在写入 rootfs {percent}%',
    writingBoot: '正在写入启动文件…',
    switching: '正在切换启动槽…',
    resetting: '正在重置默认用户…',
    factoryResetting: '正在擦除用户数据…',
    rebooting: '正在重启…',
    ok: '完成。',
    fail: '失败：',
  },
  zh_tw: {
    title: '復原模式',
    waitingAddr: '正在取得網路位址…',
    storage: '儲存',
    language: '語言',
    theme: '外觀',
    themeSystem: '跟隨系統',
    themeLight: '淺色',
    themeDark: '深色',
    fwTitle: '刷寫映像',
    fwHelp: '支援更新套件（.fwup）和完整安裝映像（.img）。',
    fwTooBig: '這個檔案有 {size}，超過上限 {max}。',
    fwBtn: '開始刷寫',
    fwChoose: '選擇映像',
    fwDrop: '或把 .fwup / .img 拖到這裡',
    userTitle: '重設預設使用者',
    userHelp: '清除 Web 登入帳號，下次啟動會重新初始化。',
    userBtn: '重設',
    factoryTitle: '恢復原廠設定',
    factoryHelp: '清除使用者資料並重新啟動，進入初始化。',
    factoryBtn: '清除',
    rebootTitle: '重新啟動',
    rebootHelp: '離開復原模式並重新啟動。',
    rebootBtn: '重新啟動',
    confirmUser: '確定清除登入帳號並回到初始化？',
    confirmFactory: '確定清除全部使用者資料並重新啟動？此操作無法復原。',
    confirmReboot: '確定離開復原模式並重新啟動？',
    confirm: '繼續',
    cancel: '取消',
    choose: '請先選擇 .fwup 或 .img 檔案',
    uploading: '正在上傳 {percent}%',
    extracting: '正在解包韌體…',
    verifying: '正在校驗 SHA-256…',
    writingRoot: '正在寫入 rootfs {percent}%',
    writingBoot: '正在寫入啟動檔…',
    switching: '正在切換啟動槽…',
    resetting: '正在重設預設使用者…',
    factoryResetting: '正在清除使用者資料…',
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

export const RECOVERY_LOCALE_KEY = 'onekvm-recovery-locale'

export function isRecoveryLocale(value: string): value is RecoveryLocale {
  return recoveryLocales.includes(value as RecoveryLocale)
}

export function readRecoveryLocale(stored: string | null, languages: readonly string[]): RecoveryLocale {
  if (stored && isRecoveryLocale(stored)) return stored
  return detectRecoveryLocale(languages)
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
