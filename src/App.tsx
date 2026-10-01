import Sidebar from './Sidebar'
import GraphPane from './GraphPane'
import registryData from './data/registry.json'
import { useI18n } from './i18n'
import { usePlannerStore } from './store'
import { useEffect } from 'react'
import type { Registry } from './types'

export const registry = registryData as Registry

export default function App() {
  const { language, t } = useI18n()
  const setLanguage = usePlannerStore((state) => state.setLanguage)
  useEffect(() => { document.documentElement.lang = { zh: 'zh-CN', en: 'en', ja: 'ja' }[language]; document.title = t('appName') }, [language])
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">▦</span><strong>{t('appName')}</strong><span className="brand-sub">{t('appSubtitle')}</span></div><div className="topbar-right"><div className="top-stats">{registry.items.length} {t('products')} <span>·</span> {registry.recipes.length} {t('recipes')} <span>·</span> {t('unitMinute')}</div><select className="language-select" aria-label="Language / 语言 / 言語" value={language} onChange={(event) => setLanguage(event.target.value as typeof language)}><option value="zh">中文</option><option value="en">English</option><option value="ja">日本語</option></select></div></header>
    <div className="workspace"><Sidebar registry={registry} /><GraphPane registry={registry} /></div>
  </div>
}
