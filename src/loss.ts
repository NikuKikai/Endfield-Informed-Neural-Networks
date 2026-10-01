import { xiraniteOven } from './data/machineLimits'
import { wulingVoucherPrices } from './data/wulingVouchers'
import { wulingVoucherRate } from './model'
import type { LossBreakdown, Registry, Solution, Supply, Target } from './types'

export const ovenLimitPenalty = 50000

export function evaluateLoss(registry: Registry, solution: Solution, targets: Target[], supplies: Supply[], powerWeight: number, voucherWeight: number): { breakdown: LossBreakdown; total: number } {
  const voucherFactor = Math.min(1, Math.max(0, voucherWeight)) * 0.1
  const targetIds = new Set(targets.map((target) => target.itemId))
  const sourceIds = registry.items.filter((item) => item.canExternalInput).map((item) => item.id)
  const supplyLimits = new Map(supplies.map((supply) => [supply.itemId, supply.limit]))
  const flowScale = targets.length
    ? Math.max(1, ...targets.map((target) => target.value))
    : Math.max(1, ...supplies.map((supply) => supply.limit ?? 0))
  const rateScale = Math.max(0.1, flowScale / 30)
  const power = registry.recipes.reduce((sum, recipe) => sum + recipe.power * (solution.rates[recipe.id] ?? 0), 0)
  const ovenUsage = registry.recipes.reduce((sum, recipe) => sum + (recipe.machineId === xiraniteOven.machineId ? solution.rates[recipe.id] ?? 0 : 0), 0)
  const breakdown: LossBreakdown = { targets: {}, power: 0, vouchers: 0, balance: 0, shortage: 0, supply: 0, oven: 0, other: 0 }

  for (const target of targets) breakdown.targets[target.itemId] = (target.value - (solution.net[target.itemId] ?? 0)) ** 2
  breakdown.power = Math.min(1, Math.max(0, powerWeight)) * 0.1 * power
  breakdown.vouchers = -voucherFactor * wulingVoucherRate(solution.net)
  breakdown.oven = ovenLimitPenalty * Math.max(0, ovenUsage - xiraniteOven.limit) ** 2
  breakdown.balance = registry.items.reduce((sum, item) => item.isEffect || targetIds.has(item.id) || voucherFactor > 0 && item.id in wulingVoucherPrices
    ? sum : sum + (solution.net[item.id] ?? 0) ** 2, 0)
  breakdown.shortage = registry.items.reduce((sum, item) => item.isEffect || !targetIds.has(item.id) && voucherFactor > 0 && item.id in wulingVoucherPrices
    ? sum + 5000 * Math.max(0, -(solution.net[item.id] ?? 0)) ** 2 : sum, 0)
  breakdown.supply = sourceIds.reduce((sum, id) => {
    const limit = supplyLimits.get(id)
    return sum + (limit === null || limit === undefined ? 0 : 5000 * Math.max(0, (solution.sources[id] ?? 0) - limit) ** 2)
  }, 0)
  breakdown.other = registry.recipes.reduce((sum, recipe) => sum + 0.01 * (solution.rates[recipe.id] ?? 0) / rateScale, 0)
    + sourceIds.reduce((sum, id) => sum + 0.15 * (solution.sources[id] ?? 0) / flowScale, 0)
  const total = Object.values(breakdown.targets).reduce((sum, value) => sum + value, 0)
    + breakdown.power + breakdown.vouchers + breakdown.balance + breakdown.shortage
    + breakdown.supply + breakdown.oven + breakdown.other
  return { breakdown, total }
}
