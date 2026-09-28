import type { Point, Registry } from './types'
import { itemNode } from './model'

const IDEAL_LENGTH = 85
const ITEM_SPACING = 160
const RAW_X = 80
const PRODUCT_MIN_X = 180
const FIRST_STAGE_MIN_STEPS = 350
const FIRST_STAGE_MAX_STEPS = 6000
const CONVERGENCE_INTERVAL = 100
const CONVERGENCE_TOLERANCE = 1e-4

type RecipeGeometry = { indices: number[]; weights: number[]; biasX: number; edges: number[] }

export function optimizeItemPositions(registry: Registry, initial: Record<string, Point>): Record<string, Point> {
  const items = registry.items
  const index = new Map(items.map((item, position) => [item.id, position]))
  const edgeCounts = new Uint16Array(items.length)
  for (const recipe of registry.recipes) for (const entry of [...recipe.inputs, ...recipe.outputs]) edgeCounts[index.get(entry.itemId)!]++
  const x = items.map((item) => initial[itemNode(item.id)].x + 27)
  const y = items.map((item) => initial[itemNode(item.id)].y + 27)
  const recipes: RecipeGeometry[] = registry.recipes.map((recipe) => {
    const weights = new Map<number, number>()
    const add = (entries: typeof recipe.inputs, share: number) => {
      for (const entry of entries) {
        const id = index.get(entry.itemId)!
        weights.set(id, (weights.get(id) ?? 0) + share / entries.length)
      }
    }
    if (recipe.inputs.length && recipe.outputs.length) {
      add(recipe.inputs, 0.5)
      add(recipe.outputs, 0.5)
    } else {
      add(recipe.inputs.length ? recipe.inputs : recipe.outputs, 1)
    }
    return {
      indices: [...weights.keys()],
      weights: [...weights.values()],
      biasX: recipe.outputs.length ? recipe.inputs.length ? 0 : -75 : 75,
      edges: [...recipe.inputs, ...recipe.outputs].map((entry) => index.get(entry.itemId)!),
    }
  })

  const lineLoss = () => {
    let loss = 0
    for (const recipe of recipes) {
      let cx = recipe.biasX
      let cy = 0
      recipe.indices.forEach((id, offset) => {
        cx += x[id] * recipe.weights[offset]
        cy += y[id] * recipe.weights[offset]
      })
      for (const id of recipe.edges) {
        const delta = Math.hypot(x[id] - cx, y[id] - cy) - IDEAL_LENGTH
        loss += delta * delta
      }
    }
    return loss
  }

  const optimize = (steps: number, stepSize: number, collisions: boolean) => {
    const mx = new Float64Array(items.length)
    const my = new Float64Array(items.length)
    const vx = new Float64Array(items.length)
    const vy = new Float64Array(items.length)
    let previousLoss: number | null = null
    let stableWindows = 0
    for (let step = 1; step <= steps; step++) {
      const gx = new Float64Array(items.length)
      const gy = new Float64Array(items.length)
      for (const recipe of recipes) {
        let cx = recipe.biasX
        let cy = 0
        recipe.indices.forEach((id, offset) => {
          cx += x[id] * recipe.weights[offset]
          cy += y[id] * recipe.weights[offset]
        })
        let centerGx = 0
        let centerGy = 0
        for (const id of recipe.edges) {
          const dx = x[id] - cx
          const dy = y[id] - cy
          const distance = Math.max(0.001, Math.hypot(dx, dy))
          const factor = 2 * (distance - IDEAL_LENGTH) / distance
          const fx = factor * dx
          const fy = factor * dy
          gx[id] += fx
          gy[id] += fy
          centerGx -= fx
          centerGy -= fy
        }
        recipe.indices.forEach((id, offset) => {
          gx[id] += centerGx * recipe.weights[offset]
          gy[id] += centerGy * recipe.weights[offset]
        })
      }
      if (collisions) {
        const strength = Math.min(1, step / 250) * 50
        for (let a = 0; a < items.length; a++) for (let b = a + 1; b < items.length; b++) {
          let dx = x[a] - x[b]
          let dy = y[a] - y[b]
          let distance = Math.hypot(dx, dy)
          if (distance >= ITEM_SPACING) continue
          if (distance < 0.001) { dx = a % 2 ? 0.7 : -0.7; dy = 0.7; distance = Math.hypot(dx, dy) }
          const factor = -2 * strength * (ITEM_SPACING - distance) / distance
          const fx = factor * dx
          const fy = factor * dy
          gx[a] += fx
          gy[a] += fy
          gx[b] -= fx
          gy[b] -= fy
        }
      }
      const beta1 = 0.9
      const beta2 = 0.999
      const correction1 = 1 - beta1 ** step
      const correction2 = 1 - beta2 ** step
      for (let id = 0; id < items.length; id++) {
        mx[id] = beta1 * mx[id] + (1 - beta1) * gx[id]
        my[id] = beta1 * my[id] + (1 - beta1) * gy[id]
        vx[id] = beta2 * vx[id] + (1 - beta2) * gx[id] ** 2
        vy[id] = beta2 * vy[id] + (1 - beta2) * gy[id] ** 2
        if (items[id].type !== 'raw') x[id] = Math.max(PRODUCT_MIN_X + 27, x[id] - stepSize * mx[id] / correction1 / (Math.sqrt(vx[id] / correction2) + 1e-8))
        else x[id] = RAW_X + 27
        y[id] = Math.max(27, y[id] - stepSize * my[id] / correction1 / (Math.sqrt(vy[id] / correction2) + 1e-8))
      }
      if (!collisions && step % CONVERGENCE_INTERVAL === 0) {
        const loss = lineLoss()
        const relativeChange = previousLoss === null ? Infinity : Math.abs(previousLoss - loss) / Math.max(previousLoss, 1)
        stableWindows = relativeChange < CONVERGENCE_TOLERANCE ? stableWindows + 1 : 0
        if (step >= FIRST_STAGE_MIN_STEPS && stableWindows >= 2) break
        previousLoss = loss
      }
    }
  }

  const placeOnRing = (id: number, anchorX: number, anchorY: number, radius: number, extraCost: (nextX: number, nextY: number) => number) => {
    const direction = Math.atan2(y[id] - anchorY, x[id] - anchorX)
    let bestScore = Infinity
    let bestX = x[id]
    let bestY = y[id]
    for (let sample = 0; sample < 96; sample++) {
      const angle = direction + sample * 2 * Math.PI / 96
      const nextX = anchorX + radius * Math.cos(angle)
      const nextY = anchorY + radius * Math.sin(angle)
      if (nextX < PRODUCT_MIN_X + 27 || nextY < 27) continue
      let score = 0.1 * ((nextX - x[id]) ** 2 + (nextY - y[id]) ** 2)
      for (let other = 0; other < items.length; other++) {
        if (other === id) continue
        if (Math.abs(nextX - x[other]) < 54 && Math.abs(nextY - y[other]) < 54) { score = Infinity; break }
        const gap = Math.max(0, ITEM_SPACING - Math.hypot(nextX - x[other], nextY - y[other]))
        score += 50 * gap * gap
      }
      if (!Number.isFinite(score)) continue
      score += extraCost(nextX, nextY)
      if (score < bestScore) { bestScore = score; bestX = nextX; bestY = nextY }
    }
    x[id] = bestX
    y[id] = bestY
  }

  const placeLeaves = () => {
    const leaves = recipes.flatMap((recipe) => recipe.edges.filter((id) => items[id].type !== 'raw' && edgeCounts[id] === 1).map((id) => ({ recipe, id })))
    for (let pass = 0; pass < 4; pass++) for (const { recipe, id } of leaves) {
      const offset = recipe.indices.indexOf(id)
      const weight = recipe.weights[offset]
      if (weight >= 1) continue
      let anchorX = recipe.biasX
      let anchorY = 0
      recipe.indices.forEach((other, position) => {
        if (other === id) return
        anchorX += x[other] * recipe.weights[position]
        anchorY += y[other] * recipe.weights[position]
      })
      anchorX /= 1 - weight
      anchorY /= 1 - weight
      placeOnRing(id, anchorX, anchorY, IDEAL_LENGTH / (1 - weight), (nextX, nextY) => {
        const centerX = (1 - weight) * anchorX + weight * nextX
        const centerY = (1 - weight) * anchorY + weight * nextY
        return recipe.edges.reduce((score, other) => {
          if (other === id) return score
          const deviation = Math.hypot(x[other] - centerX, y[other] - centerY) - IDEAL_LENGTH
          return score + deviation * deviation
        }, 0)
      })
    }
  }

  const placeSatellites = () => {
    const neighbors = items.map(() => new Set<number>())
    const eligible = items.map(() => true)
    for (const recipe of recipes) {
      if (recipe.indices.length === 1) continue
      for (const id of recipe.indices) {
        if (recipe.indices.length !== 2 || recipe.biasX !== 0 || recipe.weights.some((weight) => weight !== 0.5)) eligible[id] = false
        else neighbors[id].add(recipe.indices.find((other) => other !== id)!)
      }
    }
    for (let id = 0; id < items.length; id++) {
      if (items[id].type === 'raw' || !eligible[id] || neighbors[id].size !== 1) continue
      const anchor = [...neighbors[id]][0]
      if (eligible[anchor] && neighbors[anchor].size === 1 && id > anchor) continue
      placeOnRing(id, x[anchor], y[anchor], IDEAL_LENGTH * 2, () => 0)
    }
  }

  optimize(FIRST_STAGE_MAX_STEPS, 2.5, false)
  optimize(1000, 2, true)
  placeLeaves()
  placeSatellites()
  return Object.fromEntries(items.map((item, id) => [itemNode(item.id), { x: x[id] - 27, y: y[id] - 27 }]))
}
