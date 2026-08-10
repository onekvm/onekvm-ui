import type { KeyboardLayout } from '@/api/client'

const printableASCII = Array.from({ length: 0x7f - 0x20 }, (_, index) => String.fromCharCode(0x20 + index)).join('')
const baseCharacters = `${printableASCII}\n\r\t`

const layoutCharacters: Record<KeyboardLayout, string> = {
  us: '',
  uk: '£',
  de: 'äÄöÖüÜß€°´',
  fr: 'éèçàù£µ§€¨',
  es: 'ñÑ·¡¿çÇ´¨',
  it: '£ìèéù§òçà°',
  ru: 'ёйцукенгшщзхъфывапролджэячсмитьбюЁЙЦУКЕНГШЩЗХЪФЫВАПРОЛДЖЭЯЧСМИТЬБЮ№',
  jp: '',
  ko: 'ㅂㅈㄷㄱㅅㅛㅕㅑㅐㅔㅁㄴㅇㄹㅎㅗㅓㅏㅣㅋㅌㅊㅍㅠㅜㅡㅃㅉㄸㄲㅆ',
}

const supportedCharacters = Object.fromEntries(
  Object.entries(layoutCharacters).map(([layout, characters]) => {
    const allowed = new Set(`${baseCharacters}${characters}`)
    if (layout === 'ru') {
      for (const character of 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ') allowed.delete(character)
    }
    return [layout, allowed]
  }),
) as Record<KeyboardLayout, Set<string>>

export function filterKeyboardText(value: string, layout: KeyboardLayout) {
  const allowed = supportedCharacters[layout]
  let filtered = ''
  let removed = 0
  for (const character of value) {
    if (allowed.has(character)) filtered += character
    else removed++
  }
  return { value: filtered, removed }
}
