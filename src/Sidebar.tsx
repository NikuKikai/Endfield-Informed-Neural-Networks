import { useEffect, useMemo, useRef, useState } from 'react'
import searchIndex from './data/searchIndex.json'
import { xiraniteOven } from './data/machineLimits'
import { wulingVoucherPrices } from './data/wulingVouchers'
import { evaluateLoss } from './loss'
import { localizeStatus, useI18n } from './i18n'
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
  const { language, t, itemName } = useI18n()
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
    name: itemName(item),
    initials: itemSearchIndex[item.id]?.initials ?? item.name,
    fullPinyin: itemSearchIndex[item.id]?.fullPinyin ?? item.name,
  })).sort((a, b) => language === 'zh'
    ? a.initials.localeCompare(b.initials, 'en') || a.fullPinyin.localeCompare(b.fullPinyin, 'en') || a.name.localeCompare(b.name, 'zh-CN')
    : a.name.localeCompare(b.name, language === 'ja' ? 'ja-JP' : 'en-US')), [registry, language])
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase()
    if (!text) return indexed
    const rank = ({ item, name: localized, initials, fullPinyin }: typeof indexed[number]) => {
      const name = localized.toLowerCase()
      const id = item.id.toLowerCase()
      if (name === text || initials === text || fullPinyin === text || id === text) return 0
      if (name.startsWith(text) || initials.startsWith(text) || fullPinyin.startsWith(text) || id.startsWith(text)) return 1
      return 2
    }
    return indexed.filter(({ item, name, initials, fullPinyin }) => name.toLowerCase().includes(text) || item.name.toLowerCase().includes(text) || item.id.toLowerCase().includes(text) || initials.includes(text) || fullPinyin.includes(text))
      .sort((a, b) => rank(a) - rank(b))
  }, [indexed, query])
  const unavailable = useMemo(() => unavailableItemIds(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const manualDisabled = useMemo(() => new Set(disabledIds), [disabledIds])
  return <Section title={t('productIndex')} meta={String(indexed.length)} className="index-panel">
    <input className="search" placeholder={t('searchPlaceholder')} value={query} onChange={(event) => setQuery(event.target.value)} />
    <div className="item-list">{filtered.map(({ item, name }) => <div key={item.id} className={`item-entry ${unavailable.has(item.id) || manualDisabled.has(item.id) ? 'disabled' : ''}`}>
      <button className={`item-row ${selectedId === item.id ? 'chosen' : ''} ${focusIds.includes(item.id) ? 'focused' : ''}`} onClick={() => setSelectedId(item.id)} onDoubleClick={() => toggleFocus(item.id)}><span>{name}</span><small>{producers.get(item.id)?.length ?? 0} {t('recipes')}</small></button>
      <button className="disable-toggle" aria-label={`${t(manualDisabled.has(item.id) ? 'enableProduction' : 'disableProduction')} ${name}`} aria-pressed={manualDisabled.has(item.id)} title={t(manualDisabled.has(item.id) ? 'enableProduction' : 'disableProduction')} onClick={() => toggleDisabled(item.id)}>{t('disabledMark')}</button>
    </div>)}</div>
  </Section>
}

function GoalsSection({ registry }: { registry: Registry }) {
  const { t, itemName } = useI18n()
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
  const names = new Map(registry.items.map((item) => [item.id, itemName(item)]))
  const unavailable = useMemo(() => unavailableItemIds(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const selected = selectedId && !unavailable.has(selectedId) ? names.get(selectedId) : null
  return <Section title={t('goals')} className="controls goals-section">
    <div className="field-label">{t('targetNet')} <span>{t('equalsPerMinute')}</span></div>
    {selected && <button className="add-button" onClick={() => addTarget(selectedId!)}>＋ {t('addTarget')} · {selected}</button>}
    {targets.map((target) => {
      const inactive = unavailable.has(target.itemId)
      return <div className={`constraint-row ${inactive ? 'disabled-target' : ''}`} key={target.itemId} title={inactive ? t('unavailableTitle') : undefined}>
        <span>{names.get(target.itemId)}{inactive ? ` (${t('unavailable')})` : ''}</span>
        <span className="equals-sign">=</span>
        <input aria-label={`${names.get(target.itemId)} ${t('targetNet')}`} type="number" min="0" step="1" value={target.value} onChange={(event) => setTargetValue(target.itemId, Math.max(0, Number(event.target.value)))} />
        <button aria-label={`${t('removeTarget')} ${names.get(target.itemId)}`} title={t('removeTarget')} onClick={() => removeTarget(target.itemId)}>×</button>
      </div>
    })}
    <label className="power-row"><span>{t('powerWeight')}</span><input aria-label={t('powerWeightTitle')} type="range" min="0" max="1" step="any" value={Math.min(1, powerWeight)} onChange={(event) => setPowerWeight(Number(event.target.value))} /><output>{Math.min(1, powerWeight).toFixed(2)}</output></label>
    <label className="power-row"><span>{t('voucherWeight')}</span><input aria-label={t('voucherWeightTitle')} type="range" min="0" max="1" step="any" value={voucherWeight} onChange={(event) => setVoucherWeight(Number(event.target.value))} /><output>{voucherWeight.toFixed(2)}</output></label>
  </Section>
}

function SuppliesSection({ registry }: { registry: Registry }) {
  const { t, itemName } = useI18n()
  const supplies = usePlannerStore((state) => state.supplies)
  const setSupplyLimit = usePlannerStore((state) => state.setSupplyLimit)
  const limits = useMemo(() => new Map(supplies.map((supply) => [supply.itemId, supply.limit])), [supplies])
  return <Section title={t('externalLimits')} meta={t('amountPerMinute')} className="controls supplies-section">
    {registry.items.filter((item) => item.canExternalInput).map((item) => <div className="constraint-row" key={item.id}><span title={item.id}>{itemName(item)}</span><input aria-label={`${itemName(item)} ${t('inputLimit')}`} type="number" min="0" step="1" placeholder="∞" value={limits.get(item.id) ?? ''} onChange={(event) => setSupplyLimit(item.id, event.target.value === '' ? null : Math.max(0, Number(event.target.value)))} /></div>)}
  </Section>
}

function SolveSection({ registry }: { registry: Registry }) {
  const { language, t, itemName, machineName } = useI18n()
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
  const targetName = (id: string) => {
    const item = registry.items.find((entry) => entry.id === id)
    return item ? itemName(item) : id
  }
  const ovenName = machineName({ machineId: xiraniteOven.machineId, machineName: '天有洪炉' })
  const historySeries = [
    ...activeTargets.map((target) => ({ key: `net:${target.itemId}`, label: targetName(target.itemId) })),
    { key: 'power:consumption', label: t('totalPower') }, { key: 'power:generation', label: t('totalGeneration') },
    { key: 'vouchers', label: t('vouchers') }, { key: 'ovenUsage', label: ovenName },
    { key: 'loss:total', label: t('totalLoss') },
    ...activeTargets.map((target) => ({ key: `loss:target:${target.itemId}`, label: `${targetName(target.itemId)} ${t('loss')}` })),
    { key: 'loss:power', label: t('powerLoss') }, { key: 'loss:vouchers', label: t('voucherGain') },
    { key: 'loss:balance', label: t('implicitBalance') }, { key: 'loss:shortage', label: t('shortage') },
    { key: 'loss:supply', label: t('supplyOver') }, { key: 'loss:oven', label: t('ovenOver') },
    { key: 'loss:other', label: t('otherPenalty') },
  ]
  const metricRow = (key: string, label: string, value: string) => <label key={key} className="metric-row"><input type="checkbox" aria-label={`${t('chartMetric')} ${label}`} checked={visibleHistoryMetrics.includes(key)} onChange={() => toggleHistoryMetric(key)} /><span>{label}</span><b>{value}</b></label>

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
    <div className="section-title"><strong>{t('balance')}</strong></div>
    <div className="section-body">
      <div className="run-buttons"><button className="reset-button" disabled={completedSteps === 0} onClick={reset}>{t('reset')}</button><button className="solve-button" disabled={activeTargets.length === 0 && voucherWeight === 0 || running} onClick={solve}>{running ? t('running') : t('run')}</button></div>
      <div className="step-controls"><label className="steps-row"><span>{t('steps')}</span><input aria-label={t('runSteps')} type="range" min="100" max="10000" step="100" value={runSteps} onChange={(event) => setRunSteps(Number(event.target.value))} /><output>{formatSteps(runSteps)}</output></label><span className="run-total">{t('cumulative')} {formatSteps(completedSteps)}</span></div>
      <div className="step-controls"><label className="steps-row learning-rate-row"><span>{t('learningRate')}</span><input aria-label={t('learningRate')} type="range" min="-4" max={Math.log10(0.05)} step="any" value={Math.log10(learningRate)} onChange={(event) => setLearningRate(10 ** Number(event.target.value))} /><output>{learningRate.toFixed(4)}</output></label></div>
      <div className="status">{localizeStatus(status, language)}</div>
      {solution && <>
        <ResultGroup title={t('targetResults')}>
          {activeTargets.map((target: Target) => metricRow(`net:${target.itemId}`, targetName(target.itemId), `${formatRate(solution.net[target.itemId])} = ${formatRate(target.value)}`))}
          {metricRow('power:consumption', t('totalPower'), formatRate(powerTotals.consumption))}
          {metricRow('power:generation', t('totalGeneration'), formatRate(powerTotals.generation))}
          {metricRow('vouchers', `${t('vouchers')} ${t('perMinute')}`, formatRate(solution.vouchers))}
          {metricRow('ovenUsage', ovenName, `${formatRate(solution.ovenUsage)} / ${xiraniteOven.limit}`)}
        </ResultGroup>
        {currentLoss && <ResultGroup title={`${t('lossDetails')} · ${t('total')} ${formatLoss(currentLoss.total)}`} className="loss-summary">
          {metricRow('loss:total', t('totalLoss'), formatLoss(currentLoss.total))}
          {activeTargets.map((target) => metricRow(`loss:target:${target.itemId}`, targetName(target.itemId), formatLoss(currentLoss.breakdown.targets[target.itemId] ?? 0)))}
          {metricRow('loss:power', t('powerLoss'), formatLoss(currentLoss.breakdown.power))}
          {metricRow('loss:vouchers', t('voucherGain'), formatLoss(currentLoss.breakdown.vouchers))}
          {metricRow('loss:balance', t('implicitBalance'), formatLoss(currentLoss.breakdown.balance))}
          {metricRow('loss:shortage', t('shortage'), formatLoss(currentLoss.breakdown.shortage))}
          {metricRow('loss:supply', t('supplyOver'), formatLoss(currentLoss.breakdown.supply))}
          {metricRow('loss:oven', t('ovenOver'), formatLoss(currentLoss.breakdown.oven))}
          {metricRow('loss:other', t('otherPenalty'), formatLoss(currentLoss.breakdown.other))}
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
