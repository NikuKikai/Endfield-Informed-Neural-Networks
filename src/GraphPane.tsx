import { useCallback, useEffect, useMemo, useRef } from 'react'
import Canvas, { type View } from './Canvas'
import { displayedPower, enabledRegistry, formatRate, targetRegistry } from './model'
import { usePlannerStore, type LayoutView } from './store'
import type { Registry } from './types'

export default function GraphPane({ registry }: { registry: Registry }) {
  const cameras = useRef<Partial<Record<LayoutView, View>>>({})
  const rememberCamera = useCallback((mode: LayoutView, camera: View) => { cameras.current[mode] = camera }, [])
  const viewMode = usePlannerStore((state) => state.viewMode)
  const targets = usePlannerStore((state) => state.targets)
  const disabledIds = usePlannerStore((state) => state.disabledIds)
  const supplies = usePlannerStore((state) => state.supplies)
  const solution = usePlannerStore((state) => state.solution)
  const setViewMode = usePlannerStore((state) => state.setViewMode)
  const ensureLayout = usePlannerStore((state) => state.ensureLayout)
  const enabled = useMemo(() => enabledRegistry(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const powerTotals = useMemo(() => displayedPower(enabled.recipes, solution), [enabled, solution])
  const focusNames = useMemo(() => Object.fromEntries(registry.items.map((item) => [item.id, item.name])), [registry])
  const enabledIds = useMemo(() => new Set(enabled.items.map((item) => item.id)), [enabled])
  const activeTargets = useMemo(() => targets.filter((target) => enabledIds.has(target.itemId)), [targets, enabledIds])
  const targetIds = useMemo(() => activeTargets.map((target) => target.itemId), [activeTargets])
  const targetKey = targetIds.join('|')
  const focused = useMemo(() => targetRegistry(enabled, targetIds), [enabled, targetKey])
  const graphRegistry = viewMode === 'targets' ? focused : enabled
  useEffect(() => {
    if (viewMode === 'targets' && activeTargets.length === 0) ensureLayout('targets', focused)
  }, [viewMode, activeTargets.length, focused, ensureLayout])

  return <main className="main-area">
    <div className="canvas-toolbar">
      <div className="view-tabs"><button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>全图</button><button className={viewMode === 'targets' ? 'active' : ''} onClick={() => setViewMode('targets')}>目标相关</button></div>
      <span className="toolbar-title">当前图 {graphRegistry.items.length} 产物 · {graphRegistry.recipes.length} 配方</span>
      <span className="toolbar-power">耗电 {solution ? formatRate(powerTotals.consumption) : '—'} · 发电 {solution ? formatRate(powerTotals.generation) : '—'} · 武陵调度券 {solution ? formatRate(solution.vouchers) : '—'} / 分</span>
    </div>
    {viewMode === 'targets' && activeTargets.length === 0 ? <div className="empty-graph">添加并启用目标后显示相关产线</div>
      : <Canvas key={viewMode} layoutView={viewMode} savedView={cameras.current[viewMode]} onViewChange={rememberCamera} registry={graphRegistry} flowRecipes={enabled.recipes} focusNames={focusNames} targetIds={targetIds} solution={solution} fitOnLoad={viewMode === 'targets'} />}
  </main>
}
