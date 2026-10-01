import * as tf from '@tensorflow/tfjs'
import { xiraniteOven } from './data/machineLimits'
import { wulingVoucherPrices } from './data/wulingVouchers'
import { historyPoint } from './history'
import { evaluateLoss, ovenLimitPenalty } from './loss'
import { ingredientRate, wulingVoucherRate } from './model'
import type { Registry, Solution, Supply, Target } from './types'

type Request = { registry: Registry; targets: Target[]; supplies: Supply[]; powerWeight: number; voucherWeight: number; learningRate: number; steps: number; previousIterations: number; initial: Solution | null }

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    await tf.setBackend('cpu')
    await tf.ready()
    const { registry, targets, supplies, powerWeight, voucherWeight, learningRate, steps, previousIterations, initial } = event.data
    const voucherFactor = Math.min(1, Math.max(0, voucherWeight)) * 0.1
    const items = registry.items
    const recipes = registry.recipes
    const itemIndex = new Map(items.map((item, index) => [item.id, index]))
    const sourceIds = items.filter((item) => item.canExternalInput).map((item) => item.id)
    const sourceIndex = new Map(sourceIds.map((id, index) => [id, index]))
    const supplyLimits = new Map(supplies.map((supply) => [supply.itemId, supply.limit]))
    const flowScale = targets.length
      ? Math.max(1, ...targets.map((target) => target.value))
      : Math.max(1, ...supplies.map((supply) => supply.limit ?? 0))
    const rateScale = Math.max(0.1, flowScale / 30)
    const matrix = new Float32Array(recipes.length * items.length)
    for (const [row, recipe] of recipes.entries()) {
      const multiplier = 60 / recipe.duration
      for (const output of recipe.outputs) matrix[row * items.length + itemIndex.get(output.itemId)!] += output.amount * multiplier
      for (const input of recipe.inputs) matrix[row * items.length + itemIndex.get(input.itemId)!] -= ingredientRate(input, recipe)
    }
    const sourceMatrix = new Float32Array(sourceIds.length * items.length)
    for (const [row, id] of sourceIds.entries()) sourceMatrix[row * items.length + itemIndex.get(id)!] = 1
    const goal = new Float32Array(items.length)
    for (const target of targets) goal[itemIndex.get(target.itemId)!] = Math.max(0, target.value)
    const exactMask = new Float32Array(items.length)
    for (const target of targets) {
      const itemPosition = itemIndex.get(target.itemId)!
      exactMask[itemPosition] = 1
    }
    const goalMask = Float32Array.from(items, (item) => item.isEffect ? 0 : 1)
    if (voucherFactor > 0) for (const itemId of Object.keys(wulingVoucherPrices)) {
      const index = itemIndex.get(itemId)
      if (index !== undefined && exactMask[index] === 0) goalMask[index] = 0
    }
    const shortageMask = Float32Array.from(items, (item, index) => item.isEffect || voucherFactor > 0 && item.id in wulingVoucherPrices && exactMask[index] === 0 ? 1 : 0)
    const limits = new Float32Array(sourceIds.length)
    const limitMask = new Float32Array(sourceIds.length)
    for (const supply of supplies) {
      const index = sourceIndex.get(supply.itemId)
      if (index !== undefined && supply.limit !== null) {
        limits[index] = Math.max(0, supply.limit)
        limitMask[index] = 1
      }
    }
    const coefficients = tf.tensor2d(matrix, [recipes.length, items.length])
    const powers = tf.tensor1d(recipes.map((recipe) => recipe.power))
    const ovenMask = tf.tensor1d(recipes.map((recipe) => recipe.machineId === xiraniteOven.machineId ? 1 : 0))
    const voucherPrices = tf.tensor1d(items.map((item) => wulingVoucherPrices[item.id as keyof typeof wulingVoucherPrices] ?? 0))
    const sourceCoefficients = tf.tensor2d(sourceMatrix, [sourceIds.length, items.length])
    const sourceEnabled = tf.tensor1d(sourceIds.map((id) => supplyLimits.get(id) === 0 ? 0 : 1))
    const goals = tf.tensor1d(goal)
    const goalMasks = tf.tensor1d(goalMask)
    const shortageMasks = tf.tensor1d(shortageMask)
    const caps = tf.tensor1d(limits)
    const capMasks = tf.tensor1d(limitMask)
    const rates = tf.variable(tf.tensor1d(recipes.map((recipe) => (initial?.rates[recipe.id] ?? 0) / rateScale)))
    const sources = tf.variable(tf.tensor1d(sourceIds.map((id) => (initial?.sources[id] ?? 0) / flowScale)))
    const capture = async (currentIterations: number): Promise<Solution> => {
      const ratesArray = await rates.data()
      const sourcesArray = await sources.data()
      const snapshot: Solution = { rates: {}, sources: {}, net: {}, power: 0, generation: 0, vouchers: 0, ovenUsage: 0, loss: 0, iterations: currentIterations, lossBreakdown: { targets: {}, power: 0, vouchers: 0, balance: 0, shortage: 0, supply: 0, oven: 0, other: 0 } }
      recipes.forEach((recipe, index) => { snapshot.rates[recipe.id] = ratesArray[index] * rateScale })
      snapshot.ovenUsage = recipes.reduce((total, recipe) => total + (recipe.machineId === xiraniteOven.machineId ? snapshot.rates[recipe.id] : 0), 0)
      snapshot.power = recipes.reduce((total, recipe) => total + recipe.power * snapshot.rates[recipe.id], 0)
      snapshot.generation = recipes.reduce((total, recipe) => total + recipe.powerOutput * snapshot.rates[recipe.id], 0)
      sourceIds.forEach((id, index) => { snapshot.sources[id] = supplyLimits.get(id) === 0 ? 0 : sourcesArray[index] * flowScale })
      items.forEach((item, index) => {
        let net = snapshot.sources[item.id] ?? 0
        recipes.forEach((_, recipeIndex) => { net += matrix[recipeIndex * items.length + index] * snapshot.rates[recipes[recipeIndex].id] })
        snapshot.net[item.id] = net
      })
      snapshot.vouchers = wulingVoucherRate(snapshot.net)
      const evaluated = evaluateLoss(registry, snapshot, targets, supplies, powerWeight, voucherWeight)
      snapshot.lossBreakdown = evaluated.breakdown
      snapshot.loss = evaluated.total
      return snapshot
    }
    const optimizer = tf.train.adam(Math.min(0.05, Math.max(0.0001, learningRate)))
    let loss = Infinity
    let iterations = previousIterations
    for (let step = 0; step < steps; step++) {
      const cost = optimizer.minimize(() => {
        const net = tf.matMul(rates.mul(rateScale).reshape([1, -1]), coefficients).reshape([-1])
          .add(tf.matMul(sources.mul(sourceEnabled).mul(flowScale).reshape([1, -1]), sourceCoefficients).reshape([-1]))
        const shortage = tf.relu(net.neg()).mul(shortageMasks).square().sum()
        const goalError = goals.sub(net).mul(goalMasks).square().sum()
        const exceeded = tf.relu(sources.mul(flowScale).sub(caps)).mul(capMasks).square().sum()
        const ovenExceeded = tf.relu(rates.mul(ovenMask).sum().mul(rateScale).sub(xiraniteOven.limit)).square()
        return shortage.mul(5000).add(goalError).add(exceeded.mul(5000)).add(ovenExceeded.mul(ovenLimitPenalty))
          .add(rates.sum().mul(0.01)).add(sources.sum().mul(0.15))
          .add(rates.mul(powers).sum().mul(rateScale * Math.min(1, Math.max(0, powerWeight)) * 0.1))
          .sub(net.mul(voucherPrices).sum().mul(voucherFactor))
      }, true, [rates, sources])
      tf.tidy(() => {
        rates.assign(tf.maximum(rates, 0))
        sources.assign(tf.maximum(sources, 0))
      })
      if ((step + 1) % 100 === 0 || step === steps - 1) {
        loss = (await cost!.data())[0]
        iterations = previousIterations + step + 1
        self.postMessage({ type: 'progress', iterations, loss })
        if (iterations % 1000 === 0) self.postMessage({ type: 'history', point: historyPoint(registry, await capture(iterations), targets) })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      cost?.dispose()
    }
    const result = await capture(iterations)
    self.postMessage({ type: 'done', result })
    tf.dispose([coefficients, powers, ovenMask, voucherPrices, sourceCoefficients, sourceEnabled, goals, goalMasks, shortageMasks, caps, capMasks, rates, sources])
    optimizer.dispose()
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
