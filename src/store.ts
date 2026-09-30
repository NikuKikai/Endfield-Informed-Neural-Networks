import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { defaultSupplies } from './defaultSupplies'
import { routePositions } from './layout'
import { itemNode } from './model'
import { optimizeItemPositions } from './optimizeLayout'
import type { Point, Registry, Solution, Supply, Target } from './types'

export type LayoutView = 'all' | 'targets'
type Layouts = Record<LayoutView, Record<string, Point>>
type VisibleItems = Record<LayoutView, string[]>

type PlannerState = {
  selectedId: string | null
  viewMode: LayoutView
  targets: Target[]
  supplies: Supply[]
  powerWeight: number
  lowFlowOpacity: number
  disabledIds: string[]
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
  setLowFlowOpacity: (opacity: number) => void
  toggleDisabled: (id: string) => void
  setRunState: (running: boolean, status: string, solution?: Solution | null) => void
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
  lowFlowOpacity: 0.5,
  disabledIds: [],
  layouts: { all: {}, targets: {} },
  visibleItems: { all: [], targets: [] },
  solution: null,
  status: '设置目标后开始求解',
  running: false,
  setSelectedId: (selectedId) => set({ selectedId }),
  setViewMode: (viewMode) => set({ viewMode }),
  addTarget: (id) => set((state) => ({
    selectedId: id,
    targets: state.targets.some((target) => target.itemId === id) ? state.targets : [...state.targets, { itemId: id, value: 60 }],
    solution: null,
  })),
  setTargetValue: (id, value) => set((state) => ({ targets: state.targets.map((target) => target.itemId === id ? { ...target, value } : target), solution: null })),
  removeTarget: (id) => set((state) => ({ targets: state.targets.filter((target) => target.itemId !== id), solution: null })),
  setSupplyLimit: (id, limit) => set((state) => ({ supplies: state.supplies.some((entry) => entry.itemId === id)
    ? state.supplies.map((entry) => entry.itemId === id ? { ...entry, limit } : entry)
    : [...state.supplies, { itemId: id, limit }], solution: null })),
  setPowerWeight: (weight) => set({ powerWeight: Math.max(0, weight), solution: null }),
  setLowFlowOpacity: (opacity) => set({ lowFlowOpacity: Math.min(1, Math.max(0, opacity)) }),
  toggleDisabled: (id) => set((state) => ({
    disabledIds: state.disabledIds.includes(id) ? state.disabledIds.filter((itemId) => itemId !== id) : [...state.disabledIds, id],
    solution: null,
  })),
  setRunState: (running, status, solution) => set({ running, status, ...(solution !== undefined ? { solution } : {}) }),
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
    const positions = positionsFor(registry, get().layouts[view])
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
    lowFlowOpacity: state.lowFlowOpacity,
    disabledIds: state.disabledIds,
    layouts: state.layouts,
    visibleItems: state.visibleItems,
  }),
}))
