import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'

const sourceRoot = path.resolve(process.argv[2] ?? '.source-IndustrialPlanner')
const outputPath = path.resolve('src/data/registry.json')
const purifierSource = fs.readFileSync(path.join(sourceRoot, 'src/shared/water-purifier-node.ts'), 'utf8')
const dynamicStrings = Object.fromEntries([...purifierSource.matchAll(/export const (WATER_PURIFIER_\w+)\s*=\s*"([^"]+)"/g)].map((match) => [match[1], match[2]]))

function readAst(relativePath) {
  const source = fs.readFileSync(path.join(sourceRoot, relativePath), 'utf8')
  return ts.createSourceFile(relativePath, source, ts.ScriptTarget.Latest, true)
}

function property(node, key) {
  return node?.properties?.find((entry) => ts.isPropertyAssignment(entry) && entry.name.getText().replaceAll('"', '') === key)?.initializer
}

function string(node) {
  if (node && ts.isStringLiteral(node)) return node.text
  if (node && ts.isIdentifier(node)) return dynamicStrings[node.text] ?? null
  return null
}

function number(node) {
  return node && ts.isNumericLiteral(node) ? Number(node.text) : null
}

function array(node) {
  return node && ts.isArrayLiteralExpression(node) ? node.elements : []
}

function definitionArray(ast, name) {
  for (const statement of ast.statements) {
    if (!ts.isVariableStatement(statement)) continue
    const declaration = statement.declarationList.declarations.find((entry) => entry.name.getText() === name)
    if (declaration && declaration.initializer && ts.isArrayLiteralExpression(declaration.initializer)) return declaration.initializer.elements
  }
  throw new Error(`Cannot find ${name}`)
}

const localeSource = fs.readFileSync(path.join(sourceRoot, 'src/shared/i18n/zh-cn/registry.ts'), 'utf8')
const names = Object.fromEntries([...localeSource.matchAll(/"(registry\.[^"]+)":\s*"([^"]*)"/g)].map((match) => [match[1], match[2]]))
const allItems = definitionArray(readAst('src/registry/item-definition.ts'), 'ITEM_DEFINITIONS')
  .filter(ts.isObjectLiteralExpression)
  .map((node) => {
    const id = string(property(node, 'id'))
    const key = string(property(node, 'nameKey'))
    const tags = array(property(node, 'tags')).map(string).filter(Boolean)
    return { id, name: names[key] ?? id, tags }
  })
  .filter((item) => item.id)

const containers = new Map(allItems.filter((item) => item.tags.some((tag) => tag.startsWith('container-item:'))).map((item) => [item.id, {
  vessel: item.tags.find((tag) => tag.startsWith('container:'))?.slice('container:'.length),
  content: item.tags.find((tag) => tag.startsWith('container-item:'))?.slice('container-item:'.length),
}]))
const sourceRecipes = definitionArray(readAst('src/registry/recipe-definition.ts'), 'RECIPE_DEFINITIONS')
const diffusionGases = [...new Set(sourceRecipes.filter(ts.isObjectLiteralExpression)
  .map((node) => string(property(property(node, 'gasDiffusionOutput'), 'gasItemId'))).filter(Boolean))]
const effectId = (gasId) => `effect:${gasId}`
const items = [
  ...allItems.filter((item) => !containers.has(item.id)),
  ...diffusionGases.map((gasId) => ({ id: effectId(gasId), name: `${allItems.find((item) => item.id === gasId)?.name ?? gasId}效果`, isEffect: true })),
]
const rawItemIds = new Set([
  'item_originium_ore', 'item_quartz_sand', 'item_iron_ore', 'item_copper_ore',
  'item_liquid_water', 'item_gas_inert', 'item_liquid_acid', 'item_gas_xiranite',
  'item_plant_tundra_wood', 'item_muck_feces_1',
])

const allowedItems = new Set(items.map((item) => item.id))
const itemNames = new Map(items.map((item) => [item.id, item.name]))
const entityNodes = definitionArray(readAst('src/registry/entity-definition.ts'), 'ENTITY_DEFINITIONS')
const machinePower = new Map(entityNodes.flatMap((node) => {
  if (!ts.isCallExpression(node) || !node.arguments.length || !ts.isObjectLiteralExpression(node.arguments[0])) return []
  const definition = node.arguments[0]
  const id = string(property(definition, 'id'))
  if (!id) return []
  return [[id, number(property(definition, 'powerDemand')) ?? 0]]
}))
const excludedMachineIds = new Set([dynamicStrings.WATER_PURIFIER_NODE_ENTITY_ID, 'mix_pool_2'])
const directGasMachines = new Map([
  ['transmuter_2_gastrans', 'item_gas_xiranite'],
  ['transmuter_2_solidtrans', 'item_gas_xiranite'],
])
const candidateRecipes = sourceRecipes.filter(ts.isObjectLiteralExpression)
  .filter((node) => !array(property(node, 'tags')).map(string).includes('自然资源采集'))
  .filter((node) => !excludedMachineIds.has(string(property(node, 'machineId'))))
  .filter((node) => !String(string(property(node, 'id'))).endsWith('_xiranite_consumption_internal') || !directGasMachines.has(string(property(node, 'machineId'))))
  .map((node) => {
    const id = string(property(node, 'id'))
    const key = string(property(node, 'nameKey'))
    const diffusionGas = string(property(property(node, 'gasDiffusionOutput'), 'gasItemId'))
    const duration = diffusionGas ? 60 : number(property(node, 'durationSeconds'))
    const machineId = string(property(node, 'machineId'))
    const machineName = names[`registry.entity.${machineId}.name`]
    const ingredients = (keyName) => array(property(node, keyName)).map((entry) => ({
      itemId: string(property(entry, 'itemId')),
      amount: number(property(entry, 'amount')),
    }))
    const inputs = diffusionGas ? [{ itemId: diffusionGas, amount: 30 }]
      : ingredients('inputs')
    const outputs = diffusionGas ? [{ itemId: effectId(diffusionGas), amount: 30 }]
      : ingredients('outputs')
    const requiredEffect = string(property(node, 'requiredGasDiffusion'))
    if (requiredEffect) inputs.push({ itemId: effectId(requiredEffect), amount: 7.5, perMinute: true, condition: true })
    if (directGasMachines.has(machineId) && !diffusionGas) inputs.push({ itemId: directGasMachines.get(machineId), amount: 6, perMinute: true, condition: true })
    const inputNames = inputs.map((entry) => itemNames.get(entry.itemId) ?? entry.itemId).join(' + ')
    const outputNames = outputs.map((entry) => itemNames.get(entry.itemId) ?? entry.itemId).join(' + ')
    return { id, name: names[key] ?? (outputs.length ? `${outputNames} ← ${inputNames || '采集'}` : `处理 ${inputNames}`), duration, machineId, machineName, power: machinePower.get(machineId), powerOutput: number(property(node, 'powerOutput')) ?? 0, inputs, outputs }
  })
const flattenedRecipes = candidateRecipes.map((recipe) => ({ ...recipe, inputs: recipe.inputs.flatMap((entry) => {
  const container = containers.get(entry.itemId)
  return container?.vessel && container.content
    ? [{ itemId: container.vessel, amount: entry.amount }, { itemId: container.content, amount: entry.amount }]
    : [entry]
}) })).map((recipe) => recipe.name.includes('item_') ? {
  ...recipe,
  name: `${recipe.outputs.map((entry) => itemNames.get(entry.itemId) ?? entry.itemId).join(' + ')} ← ${recipe.inputs.map((entry) => itemNames.get(entry.itemId) ?? entry.itemId).join(' + ')}`,
} : recipe)
function hasMaterialChange(recipe) {
  const balance = new Map()
  for (const entry of recipe.inputs) balance.set(entry.itemId, (balance.get(entry.itemId) ?? 0) - entry.amount)
  for (const entry of recipe.outputs) balance.set(entry.itemId, (balance.get(entry.itemId) ?? 0) + entry.amount)
  return [...balance.values()].some((value) => value !== 0)
}
const recipes = flattenedRecipes.filter((recipe) => recipe.id && recipe.duration > 0 && recipe.inputs.length > 0
  && hasMaterialChange(recipe)
  && [...recipe.inputs, ...recipe.outputs].every((entry) => entry.itemId && entry.amount !== null && allowedItems.has(entry.itemId)))
const missingMachines = [...new Set(recipes.filter((recipe) => recipe.power === undefined).map((recipe) => recipe.machineId))]
if (missingMachines.length) throw new Error(`Missing power definitions for machines: ${missingMachines.join(', ')}`)
const missingMachineNames = [...new Set(recipes.filter((recipe) => !recipe.machineName).map((recipe) => recipe.machineId))]
if (missingMachineNames.length) throw new Error(`Missing names for machines: ${missingMachineNames.join(', ')}`)

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
const producedItemIds = new Set(recipes.flatMap((recipe) => recipe.outputs.map((entry) => entry.itemId)))
fs.writeFileSync(outputPath, `${JSON.stringify({ source: 'hsyhhssyy/IndustrialPlanner', items: items.map(({ id, name, isEffect }) => ({ id, name, canExternalInput: rawItemIds.has(id), canProduce: !rawItemIds.has(id) || producedItemIds.has(id), ...(isEffect ? { isEffect: true } : {}) })), recipes }, null, 2)}\n`)
const dynamic = candidateRecipes.filter((recipe) => !recipe.id || !recipe.duration || [...recipe.inputs, ...recipe.outputs].some((entry) => !entry.itemId || entry.amount === null)).length
console.log(`Imported ${items.length} items and ${recipes.length} recipes; skipped ${dynamic} dynamic and ${sourceRecipes.length - recipes.length - dynamic} filtered recipes.`)
