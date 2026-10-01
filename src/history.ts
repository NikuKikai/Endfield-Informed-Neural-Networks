import { displayedPower } from './model'
import type { HistoryPoint, Registry, Solution, Target } from './types'

export function historyPoint(registry: Registry, solution: Solution, targets: Target[]): HistoryPoint {
  const power = displayedPower(registry.recipes, solution)
  const metrics: Record<string, number> = {
    'power:consumption': power.consumption,
    'power:generation': power.generation,
    vouchers: solution.vouchers,
    ovenUsage: solution.ovenUsage,
    'loss:total': solution.loss,
    'loss:power': solution.lossBreakdown.power,
    'loss:vouchers': solution.lossBreakdown.vouchers,
    'loss:balance': solution.lossBreakdown.balance,
    'loss:shortage': solution.lossBreakdown.shortage,
    'loss:supply': solution.lossBreakdown.supply,
    'loss:oven': solution.lossBreakdown.oven,
    'loss:other': solution.lossBreakdown.other,
  }
  for (const target of targets) {
    metrics[`net:${target.itemId}`] = solution.net[target.itemId] ?? 0
    metrics[`loss:target:${target.itemId}`] = solution.lossBreakdown.targets[target.itemId] ?? 0
  }
  return { iterations: solution.iterations, metrics }
}
