import { useCallback, useEffect, useMemo, useRef } from 'react'
import Canvas, { type View } from './Canvas'
import { enabledRegistry, targetRegistry } from './model'
import { usePlannerStore, type LayoutView } from './store'
import type { Registry } from './types'

export default function GraphPane({ registry }: { registry: Registry }) {
  const cameras = useRef<Partial<Record<LayoutView, View>>>({})
  const rememberCamera = useCallback((mode: LayoutView, camera: View) => { cameras.current[mode] = camera }, [])
  const viewMode = usePlannerStore((state) => state.viewMode)
  const selectedId = usePlannerStore((state) => state.selectedId)
  const targets = usePlannerStore((state) => state.targets)
  const disabledIds = usePlannerStore((state) => state.disabledIds)
  const supplies = usePlannerStore((state) => state.supplies)
  const solution = usePlannerStore((state) => state.solution)
  const setViewMode = usePlannerStore((state) => state.setViewMode)
  const setSelectedId = usePlannerStore((state) => state.setSelectedId)
  const ensureLayout = usePlannerStore((state) => state.ensureLayout)
  const enabled = useMemo(() => enabledRegistry(registry, disabledIds, supplies), [registry, disabledIds, supplies])
  const enabledIds = useMemo(() => new Set(enabled.items.map((item) => item.id)), [enabled])
  const activeTargets = useMemo(() => targets.filter((target) => enabledIds.has(target.itemId)), [targets, enabledIds])
  const targetIds = useMemo(() => activeTargets.map((target) => target.itemId), [activeTargets])
  const targetKey = targetIds.join('|')
  const focused = useMemo(() => targetRegistry(enabled, targetIds), [enabled, targetKey])
  const graphRegistry = viewMode === 'targets' ? focused : enabled
  const graphSelectedId = viewMode === 'all' && graphRegistry.items.some((item) => item.id === selectedId) ? selectedId : null
  const selectedName = registry.items.find((item) => item.id === selectedId)?.name

  useEffect(() => {
    if (viewMode === 'targets' && activeTargets.length === 0) ensureLayout('targets', focused)
  }, [viewMode, activeTargets.length, focused, ensureLayout])

  return <main className="main-area">
    <div className="canvas-toolbar">
      <div className="view-tabs"><button className={viewMode === 'all' ? 'active' : ''} onClick={() => setViewMode('all')}>全图</button><button className={viewMode === 'targets' ? 'active' : ''} onClick={() => setViewMode('targets')}>目标相关</button></div>
      <span className="toolbar-title">{graphSelectedId ? `${selectedName} · 上游高亮` : viewMode === 'all' ? '完整配方网络' : `${graphRegistry.items.length} 产物 · ${graphRegistry.recipes.length} 配方`}</span>
      {graphSelectedId && <button onClick={() => setSelectedId(null)}>清除聚焦</button>}
    </div>
    {viewMode === 'targets' && activeTargets.length === 0 ? <div className="empty-graph">添加并启用目标后显示相关产线</div>
      : <Canvas key={viewMode} layoutView={viewMode} savedView={cameras.current[viewMode]} onViewChange={rememberCamera} registry={graphRegistry} flowRecipes={enabled.recipes} targetId={graphSelectedId} targetIds={targetIds} solution={solution} fitOnLoad={viewMode === 'targets'} onSelectItem={setSelectedId} />}
  </main>
}
