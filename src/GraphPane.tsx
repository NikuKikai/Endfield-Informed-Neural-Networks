import { useCallback, useEffect, useMemo, useRef } from 'react'
import Canvas, { type View } from './Canvas'
import { displayedPower, enabledRegistry, formatRate, targetRegistry } from './model'
import { useI18n } from './i18n'
import { usePlannerStore, type LayoutView } from './store'
import type { Registry } from './types'

export default function GraphPane({ registry }: { registry: Registry }) {
  const { t, itemName } = useI18n()
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
  const focusNames = Object.fromEntries(registry.items.map((item) => [item.id, itemName(item)]))
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
      <div className="view-tabs"><button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>{t('allGraph')}</button><button className={viewMode === 'targets' ? 'active' : ''} onClick={() => setViewMode('targets')}>{t('targetGraph')}</button></div>
      <span className="toolbar-title">{t('currentGraph')} {graphRegistry.items.length} {t('products')} · {graphRegistry.recipes.length} {t('recipes')}</span>
      <span className="toolbar-power">{t('power')} {solution ? formatRate(powerTotals.consumption) : '—'} · {t('generation')} {solution ? formatRate(powerTotals.generation) : '—'} · {t('vouchers')} {solution ? formatRate(solution.vouchers) : '—'} {t('perMinute')}</span>
    </div>
    {viewMode === 'targets' && activeTargets.length === 0 ? <div className="empty-graph">{t('emptyGraph')}</div>
      : <Canvas key={viewMode} layoutView={viewMode} savedView={cameras.current[viewMode]} onViewChange={rememberCamera} registry={graphRegistry} flowRecipes={enabled.recipes} focusNames={focusNames} targetIds={targetIds} solution={solution} fitOnLoad={viewMode === 'targets'} />}
  </main>
}
