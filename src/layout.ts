import type { Point, Registry } from './types'
import { itemNode, recipeNode } from './model'

const LEFT = 80
const TOP = 100
const COLUMN = 150
const LANE = 100
const RECIPE_SIZE = 18

export function routePositions(registry: Registry): Record<string, Point> {
  const next = new Map<string, string[]>()
  const produced = new Set<string>()
  for (const recipe of registry.recipes) {
    for (const output of recipe.outputs) produced.add(output.itemId)
    for (const input of recipe.inputs) {
      const outputs = next.get(input.itemId) ?? []
      for (const output of recipe.outputs) if (!outputs.includes(output.itemId)) outputs.push(output.itemId)
      next.set(input.itemId, outputs)
    }
  }

  const depth = new Map<string, number>()
  const children = new Map<string, string[]>()
  const roots: string[] = []
  const queue: string[] = []
  const addRoot = (id: string, level: number) => {
    if (depth.has(id)) return
    depth.set(id, level)
    roots.push(id)
    queue.push(id)
  }
  const visitQueue = () => {
    for (let head = 0; head < queue.length; head++) {
      const id = queue[head]
      for (const output of next.get(id) ?? []) {
        if (depth.has(output)) continue
        depth.set(output, depth.get(id)! + 1)
        children.set(id, [...(children.get(id) ?? []), output])
        queue.push(output)
      }
    }
    queue.length = 0
  }

  for (const item of registry.items) if (item.canExternalInput) addRoot(item.id, 0)
  visitQueue()
  for (const item of registry.items) {
    if (depth.has(item.id) || produced.has(item.id)) continue
    addRoot(item.id, 1)
  }
  visitQueue()
  for (const item of registry.items) {
    if (depth.has(item.id)) continue
    addRoot(item.id, 1)
    visitQueue()
  }

  const row = new Map<string, number>()
  let nextRow = 0
  const placeTree = (id: string): number => {
    const descendants = children.get(id) ?? []
    const y = descendants.length
      ? descendants.reduce((sum, child) => sum + placeTree(child), 0) / descendants.length
      : nextRow++ * LANE
    row.set(id, y)
    return y
  }
  for (const root of roots) placeTree(root)

  const columns = new Map<number, string[]>()
  for (const item of registry.items) {
    const level = depth.get(item.id)!
    columns.set(level, [...(columns.get(level) ?? []), item.id])
  }
  const largestColumn = Math.max(0, ...[...columns.values()].map((ids) => ids.length))
  const positionY = new Map<string, number>()
  for (const ids of columns.values()) {
    ids.sort((a, b) => row.get(a)! - row.get(b)!)
    ids.forEach((id, index) => positionY.set(id, TOP + (index + (largestColumn - ids.length) / 2) * LANE))
  }

  return Object.fromEntries(registry.items.map((item) => [itemNode(item.id), {
    x: LEFT + depth.get(item.id)! * COLUMN,
    y: positionY.get(item.id)!,
  }]))
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
