import type { Point, Recipe, Registry } from './types'
import { itemNode, recipeNode } from './model'
import { optimizeItemPositions } from './optimizeLayout'

const LEFT = 80
const TOP = 100
const COLUMN = 150
const LANE = 108
const RECIPE_SIZE = 18

type Route = { items: string[]; terminal: boolean }

export function routePositions(registry: Registry): Record<string, Point> {
  const producers = new Map<string, Recipe[]>()
  const consumers = new Map<string, string[]>()
  const raw = new Set(registry.items.filter((item) => item.type === 'raw').map((item) => item.id))
  for (const recipe of registry.recipes) {
    for (const output of recipe.outputs) producers.set(output.itemId, [...(producers.get(output.itemId) ?? []), recipe])
    for (const input of recipe.inputs) consumers.set(input.itemId, [...(consumers.get(input.itemId) ?? []), ...recipe.outputs.map((output) => output.itemId)])
  }

  const cache = new Map<string, string[]>()
  const longestRoute = (id: string, visiting: Set<string>): string[] => {
    if (raw.has(id)) return [id]
    if (visiting.has(id)) return []
    const cached = cache.get(id)
    if (cached) return cached
    visiting.add(id)
    let best: string[] = []
    for (const recipe of producers.get(id) ?? []) for (const input of recipe.inputs) {
      const prefix = longestRoute(input.itemId, visiting)
      if (prefix.length > best.length) best = prefix
    }
    visiting.delete(id)
    const path = [...best, id]
    cache.set(id, path)
    return path
  }

  const routes: Route[] = registry.items.filter((item) => !raw.has(item.id)).map((item) => ({
    items: longestRoute(item.id, new Set()),
    terminal: !(consumers.get(item.id)?.length),
  })).sort((a, b) => Number(b.terminal) - Number(a.terminal) || b.items.length - a.items.length)

  const positions: Record<string, Point> = {}
  const occupied = new Set<string>()
  let nextTerminalLane = 0
  const slot = (column: number, lane: number) => `${column}:${lane}`
  const place = (id: string, column: number, desiredLane: number) => {
    if (positions[itemNode(id)]) return
    const col = raw.has(id) ? 0 : Math.max(1, column)
    let lane = Math.max(0, desiredLane)
    for (let distance = 0; occupied.has(slot(col, lane)); distance++) {
      const below = Math.max(0, desiredLane + distance + 1)
      const above = desiredLane - distance - 1
      lane = above >= 0 && !occupied.has(slot(col, above)) ? above : below
    }
    occupied.add(slot(col, lane))
    positions[itemNode(id)] = { x: LEFT + col * COLUMN, y: TOP + lane * LANE }
  }

  for (const route of routes) {
    const unplaced = route.items.filter((id) => !positions[itemNode(id)])
    if (!unplaced.length) continue
    const anchorIndex = route.items.findIndex((id) => positions[itemNode(id)] && !raw.has(id))
    const anchor = anchorIndex >= 0 ? positions[itemNode(route.items[anchorIndex])] : null
    const columnOffset = anchor ? Math.round((anchor.x - LEFT) / COLUMN) - anchorIndex : 0
    let baseLane = route.terminal ? nextTerminalLane++ : anchor ? Math.round((anchor.y - TOP) / LANE) : 0
    if (!route.terminal && !anchor) while (route.items.some((id, index) => !positions[itemNode(id)] && occupied.has(slot(raw.has(id) ? 0 : Math.max(1, index), baseLane)))) baseLane++
    route.items.forEach((id, index) => place(id, index + columnOffset, baseLane))
  }
  for (const item of registry.items) place(item.id, raw.has(item.id) ? 0 : 1, 0)
  return positions
}

export function initialPositions(registry: Registry): Record<string, Point> {
  return optimizeItemPositions(registry, routePositions(registry))
}

function average(points: Point[]): Point | null {
  if (!points.length) return null
  return { x: points.reduce((sum, point) => sum + point.x, 0) / points.length, y: points.reduce((sum, point) => sum + point.y, 0) / points.length }
}

export function recipePositions(registry: Registry, items: Record<string, Point>): Record<string, Point> {
  const centers: Record<string, Point> = {}
  const edgeCounts = new Map<string, number>()
  for (const recipe of registry.recipes) for (const entry of [...recipe.inputs, ...recipe.outputs]) edgeCounts.set(entry.itemId, (edgeCounts.get(entry.itemId) ?? 0) + 1)
  for (const recipe of registry.recipes) {
    const input = average(recipe.inputs.map((entry) => items[itemNode(entry.itemId)]).filter(Boolean).map((point) => ({ x: point.x + 27, y: point.y + 27 })))
    const output = average(recipe.outputs.map((entry) => items[itemNode(entry.itemId)]).filter(Boolean).map((point) => ({ x: point.x + 27, y: point.y + 27 })))
    centers[recipe.id] = input && output ? { x: (input.x + output.x) / 2, y: (input.y + output.y) / 2 }
      : input ? { x: input.x + COLUMN / 2, y: input.y }
        : output ? { x: output.x - COLUMN / 2, y: output.y } : { x: LEFT, y: TOP }
  }
  const itemBoxes = Object.values(items)
  const placed: Point[] = []
  const offsets: Point[] = [{ x: 0, y: 0 }]
  for (let x = -8; x <= 8; x++) for (let y = -8; y <= 8; y++) if (x || y) offsets.push({ x: x * 20, y: y * 20 })
  offsets.sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y))
  for (const recipe of registry.recipes) {
    const ideal = centers[recipe.id]
    const endpoints = [...recipe.inputs, ...recipe.outputs].map((entry) => {
      const point = items[itemNode(entry.itemId)]
      return { x: point.x + 27, y: point.y + 27, weight: edgeCounts.get(entry.itemId) === 1 ? 10 : 1 }
    })
    let best = ideal
    let bestScore = Infinity
    for (const offset of offsets) {
      const candidate = { x: ideal.x + offset.x, y: ideal.y + offset.y }
      if (placed.some((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y) < 24)) continue
      if (itemBoxes.some((box) => candidate.x > box.x - 9 && candidate.x < box.x + 63 && candidate.y > box.y - 9 && candidate.y < box.y + 63)) continue
      const score = offset.x ** 2 + offset.y ** 2 + endpoints.reduce((sum, point) => {
        const deviation = Math.hypot(point.x - candidate.x, point.y - candidate.y) - 85
        return sum + point.weight * deviation ** 2
      }, 0)
      if (score < bestScore) { best = candidate; bestScore = score }
    }
    centers[recipe.id] = best
    placed.push(centers[recipe.id])
  }
  return Object.fromEntries(registry.recipes.map((recipe) => [recipeNode(recipe.id), {
    x: centers[recipe.id].x - RECIPE_SIZE / 2,
    y: centers[recipe.id].y - RECIPE_SIZE / 2,
  }]))
}
