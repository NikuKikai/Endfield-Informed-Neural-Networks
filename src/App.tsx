import { useMemo, useRef, useState } from 'react'
import Canvas from './Canvas'
import { formatRate, producerMap, targetRegistry } from './model'
import { defaultSupplies } from './defaultSupplies'
import registryData from './data/registry.json'
import type { Registry, Solution, Supply, Target } from './types'

const registry = registryData as Registry
const producers = producerMap(registry.recipes)

export default function App() {
  const [query, setQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'all' | 'targets'>('all')
  const [targets, setTargets] = useState<Target[]>([])
  const [supplies, setSupplies] = useState<Supply[]>(() => defaultSupplies.map((entry) => ({ ...entry })))
  const [powerWeight, setPowerWeight] = useState(1)
  const [solution, setSolution] = useState<Solution | null>(null)
  const [status, setStatus] = useState('设置目标后开始求解')
  const [running, setRunning] = useState(false)
  const worker = useRef<Worker | null>(null)
  const filteredItems = useMemo(() => registry.items.filter((item) => item.name.includes(query) || item.id.includes(query)).slice(0, 80), [query])
  const selected = registry.items.find((item) => item.id === selectedId)
  const targetKey = targets.map((target) => target.itemId).join('|')
  const focusedRegistry = useMemo(() => targetRegistry(registry, targetKey ? targetKey.split('|') : []), [targetKey])
  const graphRegistry = viewMode === 'targets' ? focusedRegistry : registry
  const graphSelectedId = viewMode === 'all' && graphRegistry.items.some((item) => item.id === selectedId) ? selectedId : null

  function addTarget(id: string) {
    setSelectedId(id)
    setTargets((old) => old.some((target) => target.itemId === id) ? old : [...old, { itemId: id, value: 60, mode: 'minimum' }])
    setSolution(null)
  }

  function solve() {
    worker.current?.terminate()
    const next = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    worker.current = next
    setRunning(true)
    setStatus('初始化计算图…')
    next.onmessage = (event: MessageEvent<{ type: string; iterations?: number; loss?: number; result?: Solution; message?: string }>) => {
      const data = event.data
      if (data.type === 'progress') setStatus(`迭代 ${data.iterations} / 1800 · 损失 ${data.loss?.toFixed(3)}`)
      if (data.type === 'done' && data.result) {
        setSolution(data.result)
        const unmet = targets.filter((target) => target.mode === 'exact'
          ? Math.abs(data.result!.net[target.itemId] - target.value) > 0.1
          : data.result!.net[target.itemId] < target.value - 0.1)
        const supplyErrors = supplies.filter((supply) => supply.limit !== null
          && (data.result!.sources[supply.itemId] ?? 0) > supply.limit + 0.1)
        const targetIds = new Set(targets.map((target) => target.itemId))
        const imbalances = registry.items.filter((item) => !targetIds.has(item.id) && Math.abs(data.result!.net[item.id]) > 0.1)
        const violations = unmet.length + supplyErrors.length + imbalances.length
        setStatus(violations ? `已结束；${violations} 项约束未满足` : '求解完成 · 约束已满足')
        setRunning(false)
        next.terminate()
      }
      if (data.type === 'error') { setStatus(`求解失败：${data.message}`); setRunning(false); next.terminate() }
    }
    next.postMessage({ registry, targets, supplies, powerWeight })
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand"><span className="brand-mark">▦</span><strong>终末地工厂配平</strong><span className="brand-sub">稳态计算图</span></div><div className="top-stats">{registry.items.length} 产物 <span>·</span> {registry.recipes.length} 配方 <span>·</span> 单位 / 分</div></header>
    <div className="workspace">
      <aside className="sidebar">
        <section className="panel-section">
          <div className="section-title">产物索引 <span>{registry.items.length}</span></div>
          <input className="search" placeholder="搜索产物名称或 ID" value={query} onChange={(event) => setQuery(event.target.value)} />
          <div className="item-list">{filteredItems.map((item) => <button key={item.id} className={`item-row ${selectedId === item.id ? 'chosen' : ''}`} onClick={() => setSelectedId(item.id)}><span>{item.name}</span><small>{item.type === 'raw' ? '原料' : `${producers.get(item.id)?.length ?? 0} 配方`}</small></button>)}</div>
        </section>
        <section className="panel-section controls">
          <div className="section-title">目标净输出 <span>数量 / 分</span></div>
          <p className="muted">未设目标的产物净输出为 0。</p>
          {selected && <button className="add-button" onClick={() => addTarget(selected.id)}>＋ 添加「{selected.name}」为目标</button>}
          {targets.length === 0 && <p className="muted">从上方选择产物并添加目标。</p>}
          {targets.map((target) => <div className="constraint-row" key={target.itemId}><span title={target.itemId}>{registry.items.find((item) => item.id === target.itemId)?.name}</span><select aria-label="目标约束" value={target.mode} onChange={(event) => { setTargets((old) => old.map((entry) => entry.itemId === target.itemId ? { ...entry, mode: event.target.value as Target['mode'] } : entry)); setSolution(null) }}><option value="minimum">≥</option><option value="exact">=</option></select><input type="number" min="0" step="1" value={target.value} onChange={(event) => { setTargets((old) => old.map((entry) => entry.itemId === target.itemId ? { ...entry, value: Number(event.target.value) } : entry)); setSolution(null) }} /><button title="移除" onClick={() => { setTargets((old) => old.filter((entry) => entry.itemId !== target.itemId)); setSolution(null) }}>×</button></div>)}
        </section>
        <section className="panel-section controls">
          <div className="section-title">原料输入上限 <span>数量 / 分</span></div>
          <p className="muted">可少用；留空表示无限。</p>
          {supplies.map((supply) => <div className="constraint-row" key={supply.itemId}><span title={supply.itemId}>{registry.items.find((item) => item.id === supply.itemId)?.name}</span><input aria-label={`${registry.items.find((item) => item.id === supply.itemId)?.name}输入上限`} type="number" min="0" step="1" placeholder="∞" value={supply.limit ?? ''} onChange={(event) => { const limit = event.target.value === '' ? null : Math.max(0, Number(event.target.value)); setSupplies((old) => old.map((entry) => entry.itemId === supply.itemId ? { ...entry, limit } : entry)); setSolution(null) }} /></div>)}
        </section>
        <section className="panel-section controls">
          <div className="section-title">优化目标</div>
          <div className="constraint-row"><span>总耗电最小化权重</span><input aria-label="总耗电最小化权重" type="number" min="0" step="0.1" value={powerWeight} onChange={(event) => { setPowerWeight(Math.max(0, Number(event.target.value))); setSolution(null) }} /></div>
          <p className="muted">当前每份配方耗电均为 1；设为 0 可关闭此项。</p>
        </section>
        <section className="panel-section solve-section">
          <button className="solve-button" disabled={targets.length === 0 || running} onClick={solve}>{running ? '计算中…' : '开始配平'}</button>
          <div className="status">{status}</div>
          {solution && <div className="result-summary"><strong>目标结果</strong>{targets.map((target) => <div key={target.itemId}><span>{registry.items.find((item) => item.id === target.itemId)?.name}</span><b>{formatRate(solution.net[target.itemId])} {target.mode === 'exact' ? '=' : '≥'} {formatRate(target.value)}</b></div>)}<div><span>总耗电</span><b>{formatRate(solution.power)}</b></div></div>}
        </section>
      </aside>
      <main className="main-area"><div className="canvas-toolbar"><div className="view-tabs"><button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>全图</button><button className={viewMode === 'targets' ? 'active' : ''} onClick={() => setViewMode('targets')}>目标相关</button></div><span className="toolbar-title">{graphSelectedId ? `${selected?.name} · 上游高亮` : viewMode === 'all' ? '完整配方网络' : `${graphRegistry.items.length} 产物 · ${graphRegistry.recipes.length} 配方`}</span>{graphSelectedId && <button onClick={() => setSelectedId(null)}>清除聚焦</button>}</div>{viewMode === 'targets' && targets.length === 0 ? <div className="empty-graph">添加目标后显示相关产线</div> : <Canvas key={`${viewMode}:${targetKey}`} registry={graphRegistry} flowRecipes={registry.recipes} targetId={graphSelectedId} solution={solution} fitOnLoad={viewMode === 'targets'} onSelectItem={setSelectedId} />}</main>
    </div>
  </div>
}
