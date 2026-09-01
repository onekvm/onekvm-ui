export const recoveryLocales = ['en', 'zh', 'zh_tw'] as const

export type RecoveryLocale = (typeof recoveryLocales)[number]

export const recoveryMessages = {
  en: {
    title: 'Recovery',
    sub: 'The device is in recovery. Flash firmware, reset the login user, restore factory defaults, or reboot.',
    waitingAddr: 'Waiting for a network address…',
    storage: 'Storage',
    language: 'Language',
    theme: 'Appearance',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
    fwTitle: 'Firmware image',
    fwHelp: 'Accepts a OneKVM update bundle (.fwup) or a complete installer image (.img). An update writes the inactive A/B slot and switches to it. A complete image restores the boot partition and slot A. Neither path rewrites U-Boot/FIP or erases userdata.',
    fwLimit: 'Uploads use a dedicated tmpfs (80% of RAM). The file cannot be larger than {size}.',
    fwTooBig: 'This file is {size}, larger than the {max} firmware tmpfs limit.',
    fwBtn: 'Flash image',
    fwChoose: 'Choose image',
    fwDrop: 'or drop a .fwup / .img file here',
    userTitle: 'Reset default user',
    userHelp: 'Clear the Web login account so first-boot setup runs again. Other userdata is kept.',
    userBtn: 'Reset default user',
    factoryTitle: 'Factory reset',
    factoryHelp: 'Erase userdata (accounts, network, extensions, and local data). The system partitions stay intact. The device reboots and runs first-boot setup.',
    factoryBtn: 'Factory reset',
    rebootTitle: 'Reboot',
    rebootHelp: 'Leave recovery and reboot. A firmware flash takes effect after reboot.',
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
    sub: '设备已进入恢复模式。可以刷写固件、重置登录用户、恢复出厂设置，或重启。',
    waitingAddr: '正在获取网络地址…',
    storage: '存储',
    language: '语言',
    theme: '外观',
    themeSystem: '跟随系统',
    themeLight: '浅色',
    themeDark: '深色',
    fwTitle: '刷写镜像',
    fwHelp: '支持 OneKVM 更新包（.fwup）和完整安装镜像（.img）。更新包写入未启动的 A/B 槽并切换启动。完整镜像会恢复启动分区和 A 槽。两种方式都不会改写 U-Boot/FIP，也不会擦除用户数据。',
    fwLimit: '上传使用单独的 tmpfs（内存的 80%），文件不能超过 {size}。',
    fwTooBig: '这个文件有 {size}，超过固件 tmpfs 上限 {max}。',
    fwBtn: '开始刷写',
    fwChoose: '选择镜像',
    fwDrop: '或把 .fwup / .img 拖到这里',
    userTitle: '重置默认用户',
    userHelp: '清除 Web 登录帐号，下次进入系统会重新初始化。不会擦除其它用户数据。',
    userBtn: '重置默认用户',
    factoryTitle: '恢复出厂设置',
    factoryHelp: '擦除 userdata（帐号、网络、扩展和本地数据）。系统分区保持不变。完成后设备会重启并重新初始化。',
    factoryBtn: '恢复出厂设置',
    rebootTitle: '重启',
    rebootHelp: '退出恢复模式并重启。刷写完成后需要重启才会从新槽启动。',
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
    sub: '裝置已進入復原模式。可以刷寫韌體、重設登入使用者、恢復原廠設定，或重新啟動。',
    waitingAddr: '正在取得網路位址…',
    storage: '儲存',
    language: '語言',
    theme: '外觀',
    themeSystem: '跟隨系統',
    themeLight: '淺色',
    themeDark: '深色',
    fwTitle: '刷寫映像',
    fwHelp: '支援 OneKVM 更新套件（.fwup）和完整安裝映像（.img）。更新套件寫入未啟動的 A/B 槽並切換啟動。完整映像會恢復啟動分割區和 A 槽。兩種方式都不會改寫 U-Boot/FIP，也不會清除使用者資料。',
    fwLimit: '上傳使用單獨的 tmpfs（記憶體的 80%），檔案不能超過 {size}。',
    fwTooBig: '這個檔案有 {size}，超過韌體 tmpfs 上限 {max}。',
    fwBtn: '開始刷寫',
    fwChoose: '選擇映像',
    fwDrop: '或把 .fwup / .img 拖到這裡',
    userTitle: '重設預設使用者',
    userHelp: '清除 Web 登入帳號，下次進入系統會重新初始化。不會清除其它使用者資料。',
    userBtn: '重設預設使用者',
    factoryTitle: '恢復原廠設定',
    factoryHelp: '清除 userdata（帳號、網路、擴充和本機資料）。系統分割區保持不變。完成後裝置會重新啟動並重新初始化。',
    factoryBtn: '恢復原廠設定',
    rebootTitle: '重新啟動',
    rebootHelp: '離開復原模式並重新啟動。刷寫完成後需要重新啟動才會從新槽啟動。',
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
