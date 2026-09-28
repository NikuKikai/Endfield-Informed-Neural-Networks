import * as tf from '@tensorflow/tfjs'
import type { Registry, Solution, Supply, Target } from './types'

type Request = { registry: Registry; targets: Target[]; supplies: Supply[]; powerWeight: number }

self.onmessage = async (event: MessageEvent<Request>) => {
  try {
    await tf.setBackend('cpu')
    await tf.ready()
    const { registry, targets, supplies, powerWeight } = event.data
    const items = registry.items
    const recipes = registry.recipes
    const itemIndex = new Map(items.map((item, index) => [item.id, index]))
    const sourceIds = items.filter((item) => item.type === 'raw').map((item) => item.id)
    const sourceIndex = new Map(sourceIds.map((id, index) => [id, index]))
    const targetScale = Math.max(1, ...targets.map((target) => target.value))
    const rateScale = Math.max(0.1, targetScale / 30)
    const matrix = new Float32Array(recipes.length * items.length)
    for (const [row, recipe] of recipes.entries()) {
      const multiplier = 60 / recipe.duration
      for (const output of recipe.outputs) matrix[row * items.length + itemIndex.get(output.itemId)!] += output.amount * multiplier
      for (const input of recipe.inputs) matrix[row * items.length + itemIndex.get(input.itemId)!] -= input.amount * multiplier
    }
    const sourceMatrix = new Float32Array(sourceIds.length * items.length)
    for (const [row, id] of sourceIds.entries()) sourceMatrix[row * items.length + itemIndex.get(id)!] = 1
    const goal = new Float32Array(items.length)
    for (const target of targets) goal[itemIndex.get(target.itemId)!] = Math.max(0, target.value)
    const minimumMask = new Float32Array(items.length)
    const exactMask = new Float32Array(items.length)
    const balanceMask = new Float32Array(items.length).fill(1)
    for (const target of targets) {
      const itemPosition = itemIndex.get(target.itemId)!
      if (target.mode === 'exact') exactMask[itemPosition] = 1
      else minimumMask[itemPosition] = 1
      balanceMask[itemPosition] = 0
    }
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
    const sourceCoefficients = tf.tensor2d(sourceMatrix, [sourceIds.length, items.length])
    const goals = tf.tensor1d(goal.map((value) => value / targetScale))
    const minimumMasks = tf.tensor1d(minimumMask)
    const exactMasks = tf.tensor1d(exactMask)
    const balanceMasks = tf.tensor1d(balanceMask)
    const caps = tf.tensor1d(limits.map((value) => value / targetScale))
    const capMasks = tf.tensor1d(limitMask)
    const rates = tf.variable(tf.zeros([recipes.length]))
    const sources = tf.variable(tf.zeros([sourceIds.length]))
    let optimizer = tf.train.adam(0.025)
    let loss = Infinity
    let iterations = 0
    for (let step = 0; step < 1800; step++) {
      if (step === 500) {
        optimizer.dispose()
        optimizer = tf.train.adam(0.002)
      }
      const cost = optimizer.minimize(() => {
        const net = tf.matMul(rates.mul(rateScale).reshape([1, -1]), coefficients).reshape([-1])
          .add(tf.matMul(sources.mul(targetScale).reshape([1, -1]), sourceCoefficients).reshape([-1]))
          .div(targetScale)
        const shortage = tf.relu(net.neg()).square().sum()
        const unmet = tf.relu(goals.sub(net)).mul(minimumMasks).square().sum()
        const exactError = goals.sub(net).mul(exactMasks).square().sum()
        const imbalance = net.mul(balanceMasks).square().sum()
        const exceeded = tf.relu(sources.sub(caps)).mul(capMasks).square().sum()
        return shortage.mul(5000).add(unmet.mul(7000)).add(exactError.mul(7000)).add(imbalance.mul(50000)).add(exceeded.mul(5000))
          .add(rates.sum().mul(0.01)).add(sources.sum().mul(0.15))
          .add(rates.mul(powers).sum().mul(rateScale * Math.max(0, powerWeight)))
      }, true, [rates, sources])
      tf.tidy(() => {
        rates.assign(tf.maximum(rates, 0))
        sources.assign(tf.maximum(sources, 0))
      })
      if (step % 100 === 0 || step === 1799) {
        loss = (await cost!.data())[0]
        iterations = step + 1
        self.postMessage({ type: 'progress', iterations, loss })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
      cost?.dispose()
    }
    const ratesArray = await rates.data()
    const sourcesArray = await sources.data()
    const result: Solution = { rates: {}, sources: {}, net: {}, power: 0, loss, iterations }
    recipes.forEach((recipe, index) => { result.rates[recipe.id] = ratesArray[index] * rateScale })
    result.power = recipes.reduce((total, recipe) => total + recipe.power * result.rates[recipe.id], 0)
    sourceIds.forEach((id, index) => { result.sources[id] = sourcesArray[index] * targetScale })
    items.forEach((item, index) => {
      let net = result.sources[item.id] ?? 0
      recipes.forEach((_, recipeIndex) => { net += matrix[recipeIndex * items.length + index] * result.rates[recipes[recipeIndex].id] })
      result.net[item.id] = net
    })
    self.postMessage({ type: 'done', result })
    tf.dispose([coefficients, powers, sourceCoefficients, goals, minimumMasks, exactMasks, balanceMasks, caps, capMasks, rates, sources])
    optimizer.dispose()
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
