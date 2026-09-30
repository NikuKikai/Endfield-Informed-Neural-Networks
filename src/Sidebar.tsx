import { useEffect, useMemo, useRef, useState } from 'react'
import searchIndex from './data/searchIndex.json'
import { unavailableItemIds, enabledRegistry, formatRate, producerMap } from './model'
import { usePlannerStore } from './store'
import type { Registry, Solution, Target } from './types'

const itemSearchIndex = searchIndex as Record<string, { initials: string; fullPinyin: string }>

function Section({ title, meta, className = '', children }: { title: string; meta?: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return <section className={`panel-section ${className} ${open ? '' : 'collapsed'}`}>
    <button className="section-title section-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}><strong>{title}</strong><span>{meta}</span><i aria-hidden="true">⌄</i></button>
    {open && <div className="section-body">{children}</div>}
  </section>
}

function ItemIndex({ registry }: { registry: Registry }) {
  const [query, setQuery] = useState('')
  const selectedId = usePlannerStore((state) => state.selectedId)
  const disabledIds = usePlannerStore((state) => state.disabledIds)
  const supplies = usePlannerStore((state) => state.supplies)
  const setSelectedId = usePlannerStore((state) => state.setSelectedId)
  const toggleDisabled = usePlannerStore((state) => state.toggleDisabled)
  const producers = useMemo(() => producerMap(registry.recipes), [registry])
  const indexed = useMemo(() => registry.items.filter((item) => item.canProduce).map((item) => ({
    item,
    initials: itemSearchIndex[item.id]?.initials ?? item.name,
    fullPinyin: itemSearchIndex[item.id]?.fullPinyin ?? item.name,
  })).sort((a, b) => a.initials.localeCompare(b.initials, 'en') || a.fullPinyin.localeCompare(b.fullPinyin, 'en') || a.item.name.localeCompare(b.item.name, 'zh-CN')), [registry])
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return indexed
    const rank = ({ item, initials, fullPinyin }: typeof indexed[number]) => {
      const name = item.name.toLowerCase()
      const id = item.id.toLowerCase()
      if (name === text || initials === text || fullPinyin === text || id === text) return 0
      if (name.startsWith(text) || initials.startsWith(text) || fullPinyin.startsWith(text) || id.startsWith(text)) return 1
      return 2
    }
    return indexed.filter(({ item, initials, fullPinyin }) => item.name.toLowerCase().includes(text) || item.id.toLowerCase().includes(text) || initials.includes(text) || fullPinyin.includes(text))
      .sort((a, b) => rank(a) - rank(b))
  }, [indexed, query])
  const unavailable = useMemo(() => unavailableItemIds(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const manualDisabled = useMemo(() => new Set(disabledIds), [disabledIds])
  return <Section title="产物索引" meta={String(indexed.length)} className="index-panel">
    <input className="search" placeholder="搜索名称、拼音首字母或 ID" value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="item-list">{filtered.map(({ item }) => <div key={item.id} className={`item-entry ${unavailable.has(item.id) || manualDisabled.has(item.id) ? 'disabled' : ''}`}>
      <button className={`item-row ${selectedId === item.id ? 'chosen' : ''}`} onClick={() => setSelectedId(item.id)}><span>{item.name}</span><small>{producers.get(item.id)?.length ?? 0} 配方</small></button>
      <button className="disable-toggle" aria-label={`禁用 ${item.name}的生产`} aria-pressed={manualDisabled.has(item.id)} title={manualDisabled.has(item.id) ? '已禁止生产，点击恢复' : '点击禁止生产'} onClick={() => toggleDisabled(item.id)}>禁</button>
    </div>)}</div>
  </Section>
}

function GoalsSection({ registry }: { registry: Registry }) {
  const selectedId = usePlannerStore((state) => state.selectedId)
  const targets = usePlannerStore((state) => state.targets)
  const disabledIds = usePlannerStore((state) => state.disabledIds)
  const supplies = usePlannerStore((state) => state.supplies)
  const powerWeight = usePlannerStore((state) => state.powerWeight)
  const addTarget = usePlannerStore((state) => state.addTarget)
  const setTargetValue = usePlannerStore((state) => state.setTargetValue)
  const removeTarget = usePlannerStore((state) => state.removeTarget)
  const setPowerWeight = usePlannerStore((state) => state.setPowerWeight)
  const names = useMemo(() => new Map(registry.items.map((item) => [item.id, item.name])), [registry])
  const unavailable = useMemo(() => unavailableItemIds(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const selected = selectedId && !unavailable.has(selectedId) ? names.get(selectedId) : null
  return <Section title="优化目标" className="controls">
    <div className="field-label">目标净输出 <span>等于 · 数量 / 分</span></div>
    <p className="muted">未设目标的产物净输出为 0。</p>
    {selected && <button className="add-button" onClick={() => addTarget(selectedId!)}>＋ 添加「{selected}」为目标</button>}
    {targets.length === 0 && <p className="muted">从上方选择产物并添加目标。</p>}
    {targets.map((target) => {
      const inactive = unavailable.has(target.itemId)
      return <div className={`constraint-row ${inactive ? 'disabled-target' : ''}`} key={target.itemId} title={inactive ? '当前无可用来源，暂不参与求解' : undefined}>
        <span>{names.get(target.itemId)}{inactive ? '（不可用）' : ''}</span>
        <span className="equals-sign">=</span>
        <input aria-label={`${names.get(target.itemId)}目标净输出`} type="number" min="0" step="1" value={target.value} onChange={(event) => setTargetValue(target.itemId, Math.max(0, Number(event.target.value)))} />
        <button aria-label={`移除 ${names.get(target.itemId)}目标`} title="移除" onClick={() => removeTarget(target.itemId)}>×</button>
      </div>
    })}
    <div className="field-label power-label">总耗电最小化权重</div>
    <div className="constraint-row"><span>权重</span><input aria-label="总耗电最小化权重" type="number" min="0" step="0.1" value={powerWeight} onChange={(event) => setPowerWeight(Number(event.target.value))} /></div>
    <p className="muted">当前每份配方耗电均为 1；设为 0 可关闭此项。</p>
  </Section>
}

function SuppliesSection({ registry }: { registry: Registry }) {
  const supplies = usePlannerStore((state) => state.supplies)
  const setSupplyLimit = usePlannerStore((state) => state.setSupplyLimit)
  const limits = useMemo(() => new Map(supplies.map((supply) => [supply.itemId, supply.limit])), [supplies])
  return <Section title="外部输入上限" meta="数量 / 分" className="controls">
    <p className="muted">可少用；留空表示无限。</p>
    {registry.items.filter((item) => item.canExternalInput).map((item) => <div className="constraint-row" key={item.id}><span title={item.id}>{item.name}</span><input aria-label={`${item.name}输入上限`} type="number" min="0" step="1" placeholder="∞" value={limits.get(item.id) ?? ''} onChange={(event) => setSupplyLimit(item.id, event.target.value === '' ? null : Math.max(0, Number(event.target.value)))} /></div>)}
  </Section>
}

function SolveSection({ registry }: { registry: Registry }) {
  const targets = usePlannerStore((state) => state.targets)
  const disabledIds = usePlannerStore((state) => state.disabledIds)
  const supplies = usePlannerStore((state) => state.supplies)
  const powerWeight = usePlannerStore((state) => state.powerWeight)
  const solution = usePlannerStore((state) => state.solution)
  const status = usePlannerStore((state) => state.status)
  const running = usePlannerStore((state) => state.running)
  const setRunState = usePlannerStore((state) => state.setRunState)
  const worker = useRef<Worker | null>(null)
  const enabled = useMemo(() => enabledRegistry(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const enabledIds = useMemo(() => new Set(enabled.items.map((item) => item.id)), [enabled])
  const activeTargets = useMemo(() => targets.filter((target) => enabledIds.has(target.itemId)), [targets, enabledIds])

  useEffect(() => () => {
    if (!worker.current) return
    worker.current.terminate()
    worker.current = null
    usePlannerStore.getState().setRunState(false, '设置已更改，请重新配平', null)
  }, [targets, disabledIds, supplies, powerWeight])

  function solve() {
    worker.current?.terminate()
    const next = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    worker.current = next
    setRunState(true, '初始化计算图…', null)
    next.onmessage = (event: MessageEvent<{ type: string; iterations?: number; loss?: number; result?: Solution; message?: string }>) => {
      if (worker.current !== next) return
      const data = event.data
      if (data.type === 'progress') setRunState(true, `迭代 ${data.iterations} / 1800 · 损失 ${data.loss?.toFixed(3)}`)
      if (data.type === 'done' && data.result) {
        const result = data.result
        const unmet = activeTargets.filter((target) => Math.abs(result.net[target.itemId] - target.value) > 0.1)
        const supplyErrors = supplies.filter((supply) => supply.limit !== null && (result.sources[supply.itemId] ?? 0) > supply.limit + 0.1)
        const targetIds = new Set(activeTargets.map((target) => target.itemId))
        const imbalances = enabled.items.filter((item) => !targetIds.has(item.id) && Math.abs(result.net[item.id]) > 0.1)
        const violations = unmet.length + supplyErrors.length + imbalances.length
        setRunState(false, violations ? `已结束；${violations} 项约束未满足` : '求解完成 · 约束已满足', result)
        next.terminate()
        worker.current = null
      }
      if (data.type === 'error') {
        setRunState(false, `求解失败：${data.message}`)
        next.terminate()
        worker.current = null
      }
    }
    next.postMessage({ registry: enabled, targets: activeTargets, supplies, powerWeight })
  }

  return <Section title="配平" className="solve-section">
    <button className="solve-button" disabled={activeTargets.length === 0 || running} onClick={solve}>{running ? '计算中…' : '开始配平'}</button>
    <div className="status">{status}</div>
    {solution && <div className="result-summary"><strong>目标结果</strong>{activeTargets.map((target: Target) => <div key={target.itemId}><span>{registry.items.find((item) => item.id === target.itemId)?.name}</span><b>{formatRate(solution.net[target.itemId])} = {formatRate(target.value)}</b></div>)}<div><span>总耗电</span><b>{formatRate(solution.power)}</b></div></div>}
  </Section>
}

export default function Sidebar({ registry }: { registry: Registry }) {
  return <aside className="sidebar">
    <ItemIndex registry={registry} />
    <GoalsSection registry={registry} />
    <SuppliesSection registry={registry} />
    <SolveSection registry={registry} />
  </aside>
}
