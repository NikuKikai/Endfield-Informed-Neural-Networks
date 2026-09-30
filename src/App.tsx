import Sidebar from './Sidebar'
import GraphPane from './GraphPane'
import registryData from './data/registry.json'
import type { Registry } from './types'

export const registry = registryData as Registry

export default function App() {
  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">▦</span><strong>终末地工厂配平</strong><span className="brand-sub">稳态计算图</span></div><div className="top-stats">{registry.items.length} 产物 <span>·</span> {registry.recipes.length} 配方 <span>·</span> 单位 / 分</div></header>
    <div className="workspace"><Sidebar registry={registry} /><GraphPane registry={registry} /></div>
  </div>
}
