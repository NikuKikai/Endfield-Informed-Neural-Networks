import { useEffect, useMemo, useRef, useState } from 'react'
import searchIndex from './data/searchIndex.json'
import { xiraniteOven } from './data/machineLimits'
import { wulingVoucherPrices } from './data/wulingVouchers'
import { evaluateLoss } from './loss'
import HistoryChart from './HistoryChart'
import { unavailableItemIds, enabledRegistry, displayedPower, formatRate, producerMap } from './model'
import { usePlannerStore } from './store'
import type { HistoryPoint, Registry, Solution, Target } from './types'

const itemSearchIndex = searchIndex as Record<string, { initials: string; fullPinyin: string }>
const formatSteps = (steps: number) => `${Number((steps / 1000).toFixed(1))}k`
const formatLoss = (value: number) => value > 0 && value < 0.001 ? value.toExponential(2) : value.toLocaleString('zh-CN', { maximumFractionDigits: 3 })

function Section({ title, meta, className = '', children }: { title: string; meta?: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return <section className={`panel-section ${className} ${open ? '' : 'collapsed'}`}>
    <button className="section-title section-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}><strong>{title}</strong><span>{meta}</span><i aria-hidden="true">⌄</i></button>
    {open && <div className="section-body">{children}</div>}
  </section>
}

function ResultGroup({ title, className = '', children }: { title: string; className?: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true)
  return <div className={`result-summary ${className}`}><button className="result-toggle" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{title}<span>{open ? '⌄' : '›'}</span></button>{open && children}</div>
}

function ItemIndex({ registry }: { registry: Registry }) {
  const [query, setQuery] = useState('')
  const selectedId = usePlannerStore((state) => state.selectedId)
  const disabledIds = usePlannerStore((state) => state.disabledIds)
  const supplies = usePlannerStore((state) => state.supplies)
  const setSelectedId = usePlannerStore((state) => state.setSelectedId)
  const focusIds = usePlannerStore((state) => state.focusIds)
  const toggleFocus = usePlannerStore((state) => state.toggleFocus)
  const toggleDisabled = usePlannerStore((state) => state.toggleDisabled)
  const producers = useMemo(() => producerMap(registry.recipes), [registry])
  const indexed = useMemo(() => registry.items.filter((item) => item.canProduce && !item.isEffect).map((item) => ({
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
      <button className={`item-row ${selectedId === item.id ? 'chosen' : ''} ${focusIds.includes(item.id) ? 'focused' : ''}`} onClick={() => setSelectedId(item.id)} onDoubleClick={() => toggleFocus(item.id)}><span>{item.name}</span><small>{producers.get(item.id)?.length ?? 0} 配方</small></button>
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
  const voucherWeight = usePlannerStore((state) => state.voucherWeight)
  const addTarget = usePlannerStore((state) => state.addTarget)
  const setTargetValue = usePlannerStore((state) => state.setTargetValue)
  const removeTarget = usePlannerStore((state) => state.removeTarget)
  const setPowerWeight = usePlannerStore((state) => state.setPowerWeight)
  const setVoucherWeight = usePlannerStore((state) => state.setVoucherWeight)
  const names = useMemo(() => new Map(registry.items.map((item) => [item.id, item.name])), [registry])
  const unavailable = useMemo(() => unavailableItemIds(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const selected = selectedId && !unavailable.has(selectedId) ? names.get(selectedId) : null
  return <Section title="优化目标" className="controls goals-section">
    <div className="field-label">目标净输出 <span>等于 · 数量 / 分</span></div>
    {selected && <button className="add-button" onClick={() => addTarget(selectedId!)}>＋ 添加「{selected}」为目标</button>}
    {targets.map((target) => {
      const inactive = unavailable.has(target.itemId)
      return <div className={`constraint-row ${inactive ? 'disabled-target' : ''}`} key={target.itemId} title={inactive ? '当前无可用来源，暂不参与求解' : undefined}>
        <span>{names.get(target.itemId)}{inactive ? '（不可用）' : ''}</span>
        <span className="equals-sign">=</span>
        <input aria-label={`${names.get(target.itemId)}目标净输出`} type="number" min="0" step="1" value={target.value} onChange={(event) => setTargetValue(target.itemId, Math.max(0, Number(event.target.value)))} />
        <button aria-label={`移除 ${names.get(target.itemId)}目标`} title="移除" onClick={() => removeTarget(target.itemId)}>×</button>
      </div>
    })}
    <label className="power-row"><span>耗电权重</span><input aria-label="总耗电最小化权重" type="range" min="0" max="1" step="any" value={Math.min(1, powerWeight)} onChange={(event) => setPowerWeight(Number(event.target.value))} /><output>{Math.min(1, powerWeight).toFixed(2)}</output></label>
    <label className="power-row"><span>调度券权重</span><input aria-label="武陵调度券最大化权重" type="range" min="0" max="1" step="any" value={voucherWeight} onChange={(event) => setVoucherWeight(Number(event.target.value))} /><output>{voucherWeight.toFixed(2)}</output></label>
  </Section>
}

function SuppliesSection({ registry }: { registry: Registry }) {
  const supplies = usePlannerStore((state) => state.supplies)
  const setSupplyLimit = usePlannerStore((state) => state.setSupplyLimit)
  const limits = useMemo(() => new Map(supplies.map((supply) => [supply.itemId, supply.limit])), [supplies])
  return <Section title="外部输入上限" meta="数量 / 分" className="controls supplies-section">
    {registry.items.filter((item) => item.canExternalInput).map((item) => <div className="constraint-row" key={item.id}><span title={item.id}>{item.name}</span><input aria-label={`${item.name}输入上限`} type="number" min="0" step="1" placeholder="∞" value={limits.get(item.id) ?? ''} onChange={(event) => setSupplyLimit(item.id, event.target.value === '' ? null : Math.max(0, Number(event.target.value)))} /></div>)}
  </Section>
}

function SolveSection({ registry }: { registry: Registry }) {
  const targets = usePlannerStore((state) => state.targets)
  const disabledIds = usePlannerStore((state) => state.disabledIds)
  const supplies = usePlannerStore((state) => state.supplies)
  const powerWeight = usePlannerStore((state) => state.powerWeight)
  const voucherWeight = usePlannerStore((state) => state.voucherWeight)
  const learningRate = usePlannerStore((state) => state.learningRate)
  const runSteps = usePlannerStore((state) => state.runSteps)
  const completedSteps = usePlannerStore((state) => state.completedSteps)
  const solution = usePlannerStore((state) => state.solution)
  const history = usePlannerStore((state) => state.history)
  const visibleHistoryMetrics = usePlannerStore((state) => state.visibleHistoryMetrics)
  const status = usePlannerStore((state) => state.status)
  const running = usePlannerStore((state) => state.running)
  const setRunState = usePlannerStore((state) => state.setRunState)
  const setRunSteps = usePlannerStore((state) => state.setRunSteps)
  const setLearningRate = usePlannerStore((state) => state.setLearningRate)
  const addHistoryPoint = usePlannerStore((state) => state.addHistoryPoint)
  const toggleHistoryMetric = usePlannerStore((state) => state.toggleHistoryMetric)
  const worker = useRef<Worker | null>(null)
  const enabled = useMemo(() => enabledRegistry(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const enabledIds = useMemo(() => new Set(enabled.items.map((item) => item.id)), [enabled])
  const activeTargets = useMemo(() => targets.filter((target) => enabledIds.has(target.itemId)), [targets, enabledIds])
  const powerTotals = useMemo(() => displayedPower(enabled.recipes, solution), [enabled, solution])
  const currentLoss = useMemo(() => solution ? evaluateLoss(enabled, solution, activeTargets, supplies, powerWeight, voucherWeight) : null,
    [enabled, solution, activeTargets, supplies, powerWeight, voucherWeight])
  const targetName = (id: string) => registry.items.find((item) => item.id === id)?.name ?? id
  const historySeries = [
    ...activeTargets.map((target) => ({ key: `net:${target.itemId}`, label: targetName(target.itemId) })),
    { key: 'power:consumption', label: '总耗电' }, { key: 'power:generation', label: '总发电' },
    { key: 'vouchers', label: '武陵调度券' }, { key: 'ovenUsage', label: '天有洪炉' },
    { key: 'loss:total', label: '总损失' },
    ...activeTargets.map((target) => ({ key: `loss:target:${target.itemId}`, label: `${targetName(target.itemId)}损失` })),
    { key: 'loss:power', label: '耗电量损失' }, { key: 'loss:vouchers', label: '调度券收益' },
    { key: 'loss:balance', label: '未设目标净输出' }, { key: 'loss:shortage', label: '供料不足' },
    { key: 'loss:supply', label: '外部输入超限' }, { key: 'loss:oven', label: '天有洪炉超限' },
    { key: 'loss:other', label: '其他惩罚' },
  ]
  const metricRow = (key: string, label: string, value: string) => <label key={key} className="metric-row"><input type="checkbox" aria-label={`绘制${label}`} checked={visibleHistoryMetrics.includes(key)} onChange={() => toggleHistoryMetric(key)} /><span>{label}</span><b>{value}</b></label>

  useEffect(() => () => {
    if (!worker.current) return
    worker.current.terminate()
    worker.current = null
    const state = usePlannerStore.getState()
    state.setRunState(false, '设置已更改，可继续配平', undefined, state.solution?.iterations ?? 0)
  }, [targets, disabledIds, supplies, powerWeight, voucherWeight, learningRate])

  function solve() {
    worker.current?.terminate()
    const initial = solution
    const previousIterations = completedSteps
    const next = new Worker(new URL('./solver.worker.ts', import.meta.url), { type: 'module' })
    worker.current = next
    setRunState(true, '运行中…')
    next.onmessage = (event: MessageEvent<{ type: string; iterations?: number; loss?: number; result?: Solution; point?: HistoryPoint; message?: string }>) => {
      if (worker.current !== next) return
      const data = event.data
      if (data.type === 'progress' && data.iterations !== undefined) setRunState(true, `迭代 ${formatSteps(data.iterations)} / ${formatSteps(previousIterations + runSteps)} · 损失 ${formatLoss(data.loss ?? 0)}`, undefined, data.iterations)
      if (data.type === 'history' && data.point) addHistoryPoint(data.point)
      if (data.type === 'done' && data.result) {
        const result = data.result
        const unmet = activeTargets.filter((target) => Math.abs(result.net[target.itemId] - target.value) > 0.1)
        const supplyErrors = supplies.filter((supply) => supply.limit !== null && (result.sources[supply.itemId] ?? 0) > supply.limit + 0.1)
        const targetIds = new Set(activeTargets.map((target) => target.itemId))
        const imbalances = enabled.items.filter((item) => !item.isEffect && !targetIds.has(item.id) && !(voucherWeight > 0 && item.id in wulingVoucherPrices) && Math.abs(result.net[item.id]) > 0.1)
        const violations = unmet.length + supplyErrors.length + imbalances.length + (result.ovenUsage > xiraniteOven.limit + 0.1 ? 1 : 0)
        setRunState(false, violations ? `已结束；${violations} 项约束未满足` : '求解完成 · 约束已满足', result, result.iterations)
        next.terminate()
        worker.current = null
      }
      if (data.type === 'error') {
        setRunState(false, `求解失败：${data.message}`, undefined, initial?.iterations ?? 0)
        next.terminate()
        worker.current = null
      }
    }
    next.postMessage({ registry: enabled, targets: activeTargets, supplies, powerWeight, voucherWeight, learningRate, steps: runSteps, previousIterations, initial })
  }

  function reset() {
    worker.current?.terminate()
    worker.current = null
    setRunState(false, '已重置', null, 0)
  }

  return <section className="panel-section solve-section">
    <div className="section-title"><strong>配平</strong></div>
    <div className="section-body">
      <div className="run-buttons"><button className="reset-button" disabled={completedSteps === 0} onClick={reset}>重置</button><button className="solve-button" disabled={activeTargets.length === 0 && voucherWeight === 0 || running} onClick={solve}>{running ? '运行中…' : '运行'}</button></div>
      <div className="step-controls"><label className="steps-row"><span>步数</span><input aria-label="本次运行步数" type="range" min="100" max="10000" step="100" value={runSteps} onChange={(event) => setRunSteps(Number(event.target.value))} /><output>{formatSteps(runSteps)}</output></label><span className="run-total">累计 {formatSteps(completedSteps)}</span></div>
      <div className="step-controls"><label className="steps-row learning-rate-row"><span>学习率</span><input aria-label="学习率" type="range" min="-4" max={Math.log10(0.05)} step="any" value={Math.log10(learningRate)} onChange={(event) => setLearningRate(10 ** Number(event.target.value))} /><output>{learningRate.toFixed(4)}</output></label></div>
      <div className="status">{status}</div>
      {solution && <>
        <ResultGroup title="目标结果">
          {activeTargets.map((target: Target) => metricRow(`net:${target.itemId}`, targetName(target.itemId), `${formatRate(solution.net[target.itemId])} = ${formatRate(target.value)}`))}
          {metricRow('power:consumption', '总耗电', formatRate(powerTotals.consumption))}
          {metricRow('power:generation', '总发电', formatRate(powerTotals.generation))}
          {metricRow('vouchers', '武陵调度券 / 分', formatRate(solution.vouchers))}
          {metricRow('ovenUsage', '天有洪炉', `${formatRate(solution.ovenUsage)} / ${xiraniteOven.limit}`)}
        </ResultGroup>
        {currentLoss && <ResultGroup title={`损失明细 · 总计 ${formatLoss(currentLoss.total)}`} className="loss-summary">
          {metricRow('loss:total', '总损失', formatLoss(currentLoss.total))}
          {activeTargets.map((target) => metricRow(`loss:target:${target.itemId}`, targetName(target.itemId), formatLoss(currentLoss.breakdown.targets[target.itemId] ?? 0)))}
          {metricRow('loss:power', '耗电量', formatLoss(currentLoss.breakdown.power))}
          {metricRow('loss:vouchers', '调度券收益', formatLoss(currentLoss.breakdown.vouchers))}
          {metricRow('loss:balance', '未设目标净输出 = 0', formatLoss(currentLoss.breakdown.balance))}
          {metricRow('loss:shortage', '供料不足', formatLoss(currentLoss.breakdown.shortage))}
          {metricRow('loss:supply', '外部输入超限', formatLoss(currentLoss.breakdown.supply))}
          {metricRow('loss:oven', '天有洪炉超限', formatLoss(currentLoss.breakdown.oven))}
          {metricRow('loss:other', '其他惩罚', formatLoss(currentLoss.breakdown.other))}
        </ResultGroup>}
      </>}
      <HistoryChart points={history} series={historySeries} visibleKeys={visibleHistoryMetrics} />
    </div>
  </section>
}

export default function Sidebar({ registry }: { registry: Registry }) {
  return <aside className="sidebar">
    <ItemIndex registry={registry} />
    <GoalsSection registry={registry} />
    <SuppliesSection registry={registry} />
    <SolveSection registry={registry} />
  </aside>
}
