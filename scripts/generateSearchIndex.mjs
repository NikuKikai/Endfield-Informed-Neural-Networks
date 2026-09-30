import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { pinyin } from 'pinyin-pro'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const registry = JSON.parse(await readFile(resolve(root, 'src/data/registry.json'), 'utf8'))
const index = Object.fromEntries(registry.items.filter((item) => item.canProduce).map((item) => [item.id, {
  initials: pinyin(item.name, { pattern: 'first', toneType: 'none', type: 'array' }).join('').toLowerCase(),
  fullPinyin: pinyin(item.name, { toneType: 'none', separator: '' }).toLowerCase(),
}]))

await writeFile(resolve(root, 'src/data/searchIndex.json'), `${JSON.stringify(index, null, 2)}\n`)
