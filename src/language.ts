export type Language = 'zh' | 'en' | 'ja'

export function detectLanguage(): Language {
  const preferred = typeof navigator === 'undefined' ? [] : navigator.languages?.length ? navigator.languages : [navigator.language]
  for (const entry of preferred) {
    if (entry.toLowerCase().startsWith('zh')) return 'zh'
    if (entry.toLowerCase().startsWith('ja')) return 'ja'
    if (entry.toLowerCase().startsWith('en')) return 'en'
  }
  return 'en'
}
