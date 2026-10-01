import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultSupplies } from './defaultSupplies'
import { routePositions } from './layout'
import { itemNode } from './model'
import { optimizeItemPositions } from './optimizeLayout'
import type { HistoryPoint, Point, Registry, Solution, Supply, Target } from './types'

export type LayoutView = 'all' | 'targets'
type Layouts = Record<LayoutView, Record<string, Point>>
type VisibleItems = Record<LayoutView, string[]>

type PlannerState = {
  selectedId: string | null
  viewMode: LayoutView
  targets: Target[]
  supplies: Supply[]
  powerWeight: number
  voucherWeight: number
  learningRate: number
  runSteps: number
  completedSteps: number
  lowFlowOpacity: number
  lowFlowThreshold: number
  disabledIds: string[]
  focusIds: string[]
  history: HistoryPoint[]
  visibleHistoryMetrics: string[]
  layouts: Layouts
  visibleItems: VisibleItems
  solution: Solution | null
  status: string
  running: boolean
  setSelectedId: (id: string | null) => void
  setViewMode: (view: LayoutView) => void
  addTarget: (id: string) => void
  setTargetValue: (id: string, value: number) => void
  removeTarget: (id: string) => void
  setSupplyLimit: (id: string, limit: number | null) => void
  setPowerWeight: (weight: number) => void
  setVoucherWeight: (weight: number) => void
  setLearningRate: (rate: number) => void
  setRunSteps: (steps: number) => void
  setLowFlowOpacity: (opacity: number) => void
  setLowFlowThreshold: (threshold: number) => void
  toggleDisabled: (id: string) => void
  toggleFocus: (id: string) => void
  clearFocus: () => void
  addHistoryPoint: (point: HistoryPoint) => void
  toggleHistoryMetric: (key: string) => void
  setRunState: (running: boolean, status: string, solution?: Solution | null, completedSteps?: number) => void
  ensureLayout: (view: LayoutView, registry: Registry) => void
  optimizeLayout: (view: LayoutView, registry: Registry) => void
  setNodePosition: (view: LayoutView, id: string, point: Point) => void
}

function positionsFor(registry: Registry, saved: Record<string, Point>) {
  const defaults = routePositions(registry)
  return Object.fromEntries(registry.items.map((item) => {
    const key = itemNode(item.id)
    return [key, saved[key] ?? defaults[key]]
  })) as Record<string, Point>
}

function seedNewItems(registry: Registry, positions: Record<string, Point>, previous: Set<string>, newIds: Set<string>) {
  for (const item of registry.items) {
    if (!newIds.has(item.id) || item.canExternalInput) continue
    const anchors: Point[] = []
    for (const recipe of registry.recipes) {
      const input = recipe.inputs.some((entry) => entry.itemId === item.id)
      const output = recipe.outputs.some((entry) => entry.itemId === item.id)
      if (!input && !output) continue
      const opposite = output ? recipe.inputs : recipe.outputs
      for (const entry of opposite) {
        if (!previous.has(entry.itemId)) continue
        const point = positions[itemNode(entry.itemId)]
        if (point) anchors.push({ x: point.x + (output ? 150 : -150), y: point.y })
      }
    }
    if (anchors.length) {
      positions[itemNode(item.id)] = {
        x: Math.max(230, anchors.reduce((sum, point) => sum + point.x, 0) / anchors.length),
        y: Math.max(0, anchors.reduce((sum, point) => sum + point.y, 0) / anchors.length),
      }
    }
  }
}

export const usePlannerStore = create<PlannerState>()(persist((set, get) => ({
  selectedId: null,
  viewMode: 'all',
  targets: [],
  supplies: defaultSupplies.map((entry) => ({ ...entry })),
  powerWeight: 1,
  voucherWeight: 0,
  learningRate: 0.005,
  runSteps: 1800,
  completedSteps: 0,
  lowFlowOpacity: 0.5,
  lowFlowThreshold: 1,
  disabledIds: [],
  focusIds: [],
  history: [],
  visibleHistoryMetrics: ['loss:total'],
  layouts: { all: {}, targets: {} },
  visibleItems: { all: [], targets: [] },
  solution: null,
  status: '设置目标后开始求解',
  running: false,
  setSelectedId: (selectedId) => set({ selectedId }),
  setViewMode: (viewMode) => set({ viewMode }),
  addTarget: (id) => set((state) => {
    if (state.targets.some((target) => target.itemId === id)) return { selectedId: id }
    return { selectedId: id, targets: [...state.targets, { itemId: id, value: 60 }], status: state.solution ? '目标已更改，可继续配平' : state.status }
  }),
  setTargetValue: (id, value) => set((state) => ({ targets: state.targets.map((target) => target.itemId === id ? { ...target, value } : target), status: state.solution ? '目标已更改，可继续配平' : state.status })),
  removeTarget: (id) => set((state) => ({ targets: state.targets.filter((target) => target.itemId !== id), status: state.solution ? '目标已更改，可继续配平' : state.status })),
  setSupplyLimit: (id, limit) => set((state) => ({ supplies: state.supplies.some((entry) => entry.itemId === id)
    ? state.supplies.map((entry) => entry.itemId === id ? { ...entry, limit } : entry)
    : [...state.supplies, { itemId: id, limit }], solution: null, completedSteps: 0, history: [] })),
  setPowerWeight: (weight) => set((state) => ({ powerWeight: Math.min(1, Math.max(0, weight)), status: state.solution ? '目标已更改，可继续配平' : state.status })),
  setVoucherWeight: (weight) => set((state) => ({ voucherWeight: Math.min(1, Math.max(0, weight)), status: state.solution ? '目标已更改，可继续配平' : state.status })),
  setLearningRate: (rate) => set({ learningRate: Math.min(0.05, Math.max(0.0001, rate)) }),
  setRunSteps: (steps) => set({ runSteps: Math.min(10000, Math.max(100, Math.round(steps / 100) * 100)) }),
  setLowFlowOpacity: (opacity) => set({ lowFlowOpacity: Math.min(1, Math.max(0, opacity)) }),
  setLowFlowThreshold: (threshold) => set({ lowFlowThreshold: Math.min(30, Math.max(0, threshold)) }),
  toggleDisabled: (id) => set((state) => ({
    disabledIds: state.disabledIds.includes(id) ? state.disabledIds.filter((itemId) => itemId !== id) : [...state.disabledIds, id],
    solution: null,
    completedSteps: 0,
    history: [],
  })),
  toggleFocus: (id) => set((state) => ({ focusIds: state.focusIds.includes(id) ? state.focusIds.filter((itemId) => itemId !== id) : [...state.focusIds, id] })),
  clearFocus: () => set({ focusIds: [] }),
  addHistoryPoint: (point) => set((state) => ({ history: [...state.history.filter((entry) => entry.iterations !== point.iterations), point].sort((a, b) => a.iterations - b.iterations) })),
  toggleHistoryMetric: (key) => set((state) => ({ visibleHistoryMetrics: state.visibleHistoryMetrics.includes(key) ? state.visibleHistoryMetrics.filter((entry) => entry !== key) : [...state.visibleHistoryMetrics, key] })),
  setRunState: (running, status, solution, completedSteps) => set({ running, status, ...(solution !== undefined ? { solution, ...(solution === null ? { history: [] } : {}) } : {}), ...(completedSteps !== undefined ? { completedSteps } : {}) }),
  ensureLayout: (view, registry) => {
    const state = get()
    const ids = registry.items.map((item) => item.id)
    const previous = new Set(state.visibleItems[view])
    const newIds = new Set(ids.filter((id) => !previous.has(id)))
    if (!newIds.size && ids.length === previous.size) return
    const positions = positionsFor(registry, state.layouts[view])
    if (newIds.size) seedNewItems(registry, positions, previous, newIds)
    const optimized = newIds.size ? optimizeItemPositions(registry, positions, newIds) : positions
    set((current) => ({
      layouts: { ...current.layouts, [view]: { ...current.layouts[view], ...optimized } },
      visibleItems: { ...current.visibleItems, [view]: ids },
    }))
  },
  optimizeLayout: (view, registry) => {
    const positions = routePositions(registry)
    const optimized = optimizeItemPositions(registry, positions)
    set((state) => ({ layouts: { ...state.layouts, [view]: { ...state.layouts[view], ...optimized } } }))
  },
  setNodePosition: (view, id, point) => set((state) => ({ layouts: {
    ...state.layouts,
    [view]: { ...state.layouts[view], [id]: point },
  } })),
}), {
  name: 'zmdbalance-planner-v1',
  storage: createJSONStorage(() => localStorage),
  partialize: (state) => ({
    targets: state.targets,
    supplies: state.supplies,
    powerWeight: state.powerWeight,
    voucherWeight: state.voucherWeight,
    learningRate: state.learningRate,
    runSteps: state.runSteps,
    lowFlowOpacity: state.lowFlowOpacity,
    lowFlowThreshold: state.lowFlowThreshold,
    disabledIds: state.disabledIds,
    focusIds: state.focusIds,
    visibleHistoryMetrics: state.visibleHistoryMetrics,
    layouts: state.layouts,
    visibleItems: state.visibleItems,
  }),
}))
