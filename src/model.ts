import type { Item, NodeId, Recipe, Registry, Solution } from './types'

export const itemNode = (id: string): NodeId => `item:${id}`
export const recipeNode = (id: string): NodeId => `recipe:${id}`

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
  const rawItems = new Set(registry.items.filter((item) => item.type === 'raw').map((item) => item.id))
  const seen = new Set<NodeId>()
  const walked = new Set<string>()
  const walk = (itemId: string) => {
    const id = itemNode(itemId)
    seen.add(id)
    if (walked.has(itemId) || rawItems.has(itemId)) return
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
    const multiplier = 60 / recipe.duration * rate
    for (const entry of recipe.outputs) if (entry.itemId === item.id) produced += entry.amount * multiplier
    for (const entry of recipe.inputs) if (entry.itemId === item.id) consumed += entry.amount * multiplier
  }
  const source = solution?.sources[item.id] ?? 0
  return { produced, consumed, source, net: produced + source - consumed }
}

export function formatRate(value: number) {
  if (Math.abs(value) < 0.005) return '0'
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}
