import type { Ingredient, Item, NodeId, Recipe, Registry, Solution, Supply } from './types'
import { wulingVoucherPrices } from './data/wulingVouchers'

export const itemNode = (id: string): NodeId => `item:${id}`
export const recipeNode = (id: string): NodeId => `recipe:${id}`
export const ingredientRate = (entry: Ingredient, recipe: Recipe) => entry.amount * (entry.perMinute ? 1 : 60 / recipe.duration)

export function unavailableItemIds(registry: Registry, disabledIds: string[], supplies: Supply[]): Set<string> {
  const productionDisabled = new Set(disabledIds)
  const limits = new Map(supplies.map((supply) => [supply.itemId, supply.limit]))
  const hasExternalInput = (item: Item) => item.canExternalInput && limits.get(item.id) !== 0
  const unavailable = new Set(registry.items.filter((item) => !hasExternalInput(item) && (!item.canProduce || productionDisabled.has(item.id))).map((item) => item.id))
  const producers = producerMap(registry.recipes)
  let changed = true
  while (changed) {
    changed = false
    for (const item of registry.items) {
      if (hasExternalInput(item) || unavailable.has(item.id)) continue
      const producingRecipes = producers.get(item.id) ?? []
      if (!producingRecipes.length || producingRecipes.some((recipe) => recipe.inputs.every((entry) => !unavailable.has(entry.itemId)) && recipe.outputs.every((entry) => !unavailable.has(entry.itemId) && !productionDisabled.has(entry.itemId)))) continue
      unavailable.add(item.id)
      changed = true
    }
  }
  return unavailable
}

export function enabledRegistry(registry: Registry, disabledIds: string[], supplies: Supply[]): Registry {
  const unavailable = unavailableItemIds(registry, disabledIds, supplies)
  const productionDisabled = new Set(disabledIds)
  return {
    ...registry,
    items: registry.items.filter((item) => !unavailable.has(item.id)),
    recipes: registry.recipes.filter((recipe) => recipe.outputs.every((entry) => !productionDisabled.has(entry.itemId)) && [...recipe.inputs, ...recipe.outputs].every((entry) => !unavailable.has(entry.itemId))),
  }
}

export function producerMap(recipes: Recipe[]) {
  const map = new Map<string, Recipe[]>()
  for (const recipe of recipes) for (const output of recipe.outputs) {
    const list = map.get(output.itemId) ?? []
    list.push(recipe)
    map.set(output.itemId, list)
  }
  return map
}

export function visibleNodes(registry: Registry, targetId: string | null): Set<NodeId> {
  if (!targetId) return new Set<NodeId>([
    ...registry.items.map((item) => itemNode(item.id)),
    ...registry.recipes.map((recipe) => recipeNode(recipe.id)),
  ])
  const producers = producerMap(registry.recipes)
  const sourceOnlyItems = new Set(registry.items.filter((item) => !item.canProduce).map((item) => item.id))
  const seen = new Set<NodeId>()
  const walked = new Set<string>()
  const walk = (itemId: string) => {
    const id = itemNode(itemId)
    seen.add(id)
    if (walked.has(itemId) || sourceOnlyItems.has(itemId)) return
    walked.add(itemId)
    for (const recipe of producers.get(itemId) ?? []) {
      seen.add(recipeNode(recipe.id))
      for (const input of recipe.inputs) walk(input.itemId)
      for (const output of recipe.outputs) seen.add(itemNode(output.itemId))
    }
  }
  walk(targetId)
  return seen
}

export function targetRegistry(registry: Registry, targetIds: string[]): Registry {
  const visible = new Set<NodeId>()
  for (const id of targetIds) for (const node of visibleNodes(registry, id)) visible.add(node)
  return {
    ...registry,
    items: registry.items.filter((item) => visible.has(itemNode(item.id))),
    recipes: registry.recipes.filter((recipe) => visible.has(recipeNode(recipe.id))),
  }
}

export function itemFlows(item: Item, recipes: Recipe[], solution: Solution | null) {
  let produced = 0
  let consumed = 0
  for (const recipe of recipes) {
    const rate = solution?.rates[recipe.id] ?? 0
    for (const entry of recipe.outputs) if (entry.itemId === item.id) produced += ingredientRate(entry, recipe) * rate
    for (const entry of recipe.inputs) if (entry.itemId === item.id) consumed += ingredientRate(entry, recipe) * rate
  }
  const source = solution?.sources[item.id] ?? 0
  return { produced, consumed, source, net: produced + source - consumed }
}

export function displayedPower(recipes: Recipe[], solution: Solution | null) {
  if (!solution) return { consumption: 0, generation: 0 }
  return recipes.reduce((totals, recipe) => {
    const rate = Math.max(0, solution.rates[recipe.id] ?? 0)
    totals.consumption += Math.ceil(rate) * recipe.power
    totals.generation += rate * recipe.powerOutput
    return totals
  }, { consumption: 0, generation: 0 })
}

export function wulingVoucherRate(net: Record<string, number>) {
  return Object.entries(wulingVoucherPrices).reduce((total, [itemId, price]) => total + (net[itemId] ?? 0) * price, 0)
}

export function formatRate(value: number) {
  if (Math.abs(value) < 0.005) return '0'
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
