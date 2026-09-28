import { useEffect, useMemo, useRef, useState } from 'react'
import { formatRate, itemFlows, itemNode, recipeNode, visibleNodes } from './model'
import { initialPositions, recipePositions } from './layout'
import { optimizeItemPositions } from './optimizeLayout'
import type { NodeId, Point, Recipe, Registry, Solution } from './types'

type Props = { registry: Registry; flowRecipes: Recipe[]; targetId: string | null; solution: Solution | null; fitOnLoad?: boolean; onSelectItem: (id: string) => void }
type View = { x: number; y: number; scale: number }
type Edge = { key: string; from: NodeId; to: NodeId; x1: number; y1: number; x2: number; y2: number; recipeId: string; kind: 'input' | 'output'; unitRate: number; actualRate: number; labelX: number; labelY: number; unitX: number; unitY: number; unitAnchor: 'start' | 'end' }

const ITEM_WIDTH = 54
const RECIPE_SIZE = 18
const ITEM_HEIGHT = 54

function formatPortRate(value: number) {
  return value >= 1000 ? `${formatRate(value / 1000)}k` : formatRate(value)
}

function formatEdgeRate(value: number) {
  const fixed = (rate: number) => rate.toLocaleString('zh-CN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  return value >= 1000 ? `${fixed(value / 1000)}k` : fixed(value)
}

export default function Canvas({ registry, flowRecipes, targetId, solution, fitOnLoad = false, onSelectItem }: Props) {
  const viewport = useRef<HTMLDivElement>(null)
  const drag = useRef<{ type: 'pan' | 'node'; id?: NodeId; x: number; y: number } | null>(null)
  const initialCentered = useRef(false)
  const [view, setView] = useState<View>({ x: 60, y: 60, scale: 0.7 })
  const [overrides, setOverrides] = useState<Record<string, Point>>({})
  const [hoveredRecipe, setHoveredRecipe] = useState<string | null>(null)
  const focused = useMemo(() => targetId ? visibleNodes(registry, targetId) : null, [registry, targetId])
  const defaults = useMemo(() => initialPositions(registry), [registry])
  const itemPositions = useMemo(() => ({ ...defaults, ...overrides }), [defaults, overrides])
  const positions = useMemo(() => ({ ...itemPositions, ...recipePositions(registry, itemPositions) }), [registry, itemPositions])
  const names = useMemo(() => new Map(registry.items.map((item) => [item.id, item.name])), [registry])

  useEffect(() => { setOverrides({}); initialCentered.current = false }, [registry])

  useEffect(() => {
    if (!targetId && initialCentered.current) return
    initialCentered.current = true
    if (fitOnLoad) {
      const points = Object.values(positions)
      if (!points.length) return
      const minX = Math.min(...points.map((point) => point.x))
      const maxX = Math.max(...points.map((point) => point.x)) + ITEM_WIDTH
      const minY = Math.min(...points.map((point) => point.y))
      const maxY = Math.max(...points.map((point) => point.y)) + ITEM_HEIGHT
      const width = viewport.current?.clientWidth ?? 1000
      const height = viewport.current?.clientHeight ?? 700
      const scale = Math.min(1, Math.max(0.05, Math.min((width - 80) / (maxX - minX), (height - 80) / (maxY - minY))))
      setView({ x: (width - (maxX - minX) * scale) / 2 - minX * scale, y: (height - (maxY - minY) * scale) / 2 - minY * scale, scale })
      return
    }
    const top = Object.values(defaults).sort((a, b) => a.y - b.y).slice(0, 20).sort((a, b) => a.x - b.x)
    const target = targetId ? positions[itemNode(targetId)] : top[Math.floor(top.length / 2)]
    if (!target) return
    const width = viewport.current?.clientWidth ?? 1000
    const height = viewport.current?.clientHeight ?? 700
    const scale = targetId ? 0.8 : 0.7
    setView({ x: width * 0.58 - (target.x + ITEM_WIDTH / 2) * scale, y: height * (targetId ? 0.48 : 0.28) - (target.y + ITEM_HEIGHT / 2) * scale, scale })
  }, [targetId, defaults, fitOnLoad])

  function fitAll() {
    const points = Object.values(positions)
    if (!points.length) return
    const minX = Math.min(...points.map((point) => point.x))
    const maxX = Math.max(...points.map((point) => point.x)) + ITEM_WIDTH
    const minY = Math.min(...points.map((point) => point.y))
    const maxY = Math.max(...points.map((point) => point.y)) + 64
    const width = viewport.current?.clientWidth ?? 1000
    const height = viewport.current?.clientHeight ?? 700
    const scale = Math.min(1, Math.max(0.05, Math.min((width - 80) / (maxX - minX), (height - 100) / (maxY - minY))))
    setView({ x: (width - (maxX - minX) * scale) / 2 - minX * scale, y: (height - (maxY - minY) * scale) / 2 - minY * scale, scale })
  }

  function pointerMove(event: React.PointerEvent) {
    if (!drag.current) return
    const dx = event.clientX - drag.current.x
    const dy = event.clientY - drag.current.y
    if (drag.current.type === 'pan') setView((old) => ({ ...old, x: old.x + dx, y: old.y + dy }))
    else if (drag.current.id) {
      const id = drag.current.id
      setOverrides((old) => ({ ...old, [id]: { x: (old[id] ?? defaults[id]).x + dx / view.scale, y: (old[id] ?? defaults[id]).y + dy / view.scale } }))
    }
    drag.current.x = event.clientX
    drag.current.y = event.clientY
  }

  function zoom(event: React.WheelEvent) {
    event.preventDefault()
    const rect = viewport.current!.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    setView((old) => {
      const scale = Math.min(2, Math.max(0.05, old.scale * Math.exp(-event.deltaY * 0.001)))
      return { scale, x: px - (px - old.x) * scale / old.scale, y: py - (py - old.y) * scale / old.scale }
    })
  }

  const edges: Edge[] = []
  const addEdge = (edge: Omit<Edge, 'labelX' | 'labelY' | 'unitX' | 'unitY' | 'unitAnchor'>) => {
    const center = edge.kind === 'input' ? { x: edge.x2, y: edge.y2 } : { x: edge.x1, y: edge.y1 }
    const item = edge.kind === 'input' ? { x: edge.x1, y: edge.y1 } : { x: edge.x2, y: edge.y2 }
    const dx = item.x - center.x
    const dy = item.y - center.y
    const distance = Math.max(1, Math.hypot(dx, dy))
    edges.push({ ...edge, labelX: (edge.x1 + edge.x2) / 2, labelY: (edge.y1 + edge.y2) / 2 - 6,
      unitX: center.x + dx / distance * 17, unitY: center.y + dy / distance * 17 + 4,
      unitAnchor: dx >= 0 ? 'start' : 'end' })
  }
  for (const recipe of registry.recipes) {
    const recipeId = recipeNode(recipe.id)
    const pos = positions[recipeId]
    const center = { x: pos.x + RECIPE_SIZE / 2, y: pos.y + RECIPE_SIZE / 2 }
    for (const [index, entry] of recipe.inputs.entries()) {
      const from = itemNode(entry.itemId)
      const source = positions[from]
      if (source) {
        const itemCenter = { x: source.x + ITEM_WIDTH / 2, y: source.y + ITEM_HEIGHT / 2 }
        const unitRate = entry.amount * 60 / recipe.duration
        addEdge({ key: `${recipe.id}-in-${index}`, from, to: recipeId, x1: itemCenter.x, y1: itemCenter.y, x2: center.x, y2: center.y, recipeId: recipe.id, kind: 'input', unitRate, actualRate: unitRate * (solution?.rates[recipe.id] ?? 0) })
      }
    }
    for (const [index, entry] of recipe.outputs.entries()) {
      const to = itemNode(entry.itemId)
      const destination = positions[to]
      if (destination) {
        const itemCenter = { x: destination.x + ITEM_WIDTH / 2, y: destination.y + ITEM_HEIGHT / 2 }
        const unitRate = entry.amount * 60 / recipe.duration
        addEdge({ key: `${recipe.id}-out-${index}`, from: recipeId, to, x1: center.x, y1: center.y, x2: itemCenter.x, y2: itemCenter.y, recipeId: recipe.id, kind: 'output', unitRate, actualRate: unitRate * (solution?.rates[recipe.id] ?? 0) })
      }
    }
  }

  return <div className={`canvas ${focused ? 'has-focus' : ''}`} ref={viewport} onWheel={zoom} onPointerMove={pointerMove}
    onPointerDown={(event) => { drag.current = { type: 'pan', x: event.clientX, y: event.clientY }; event.currentTarget.setPointerCapture(event.pointerId) }}
    onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
    <div className="canvas-grid" style={{ backgroundSize: `${24 * view.scale}px ${24 * view.scale}px`, backgroundPosition: `${view.x}px ${view.y}px`, opacity: view.scale < 0.3 ? 0 : 1 }} />
    <div className="canvas-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}>
      <svg className="edge-layer" width="100%" height="100%">
        {edges.map((edge) => <g key={edge.key} className={`edge-group ${focused && (!focused.has(edge.from) || !focused.has(edge.to)) ? 'faded' : ''}`}>
          <line x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2} className={`edge ${edge.kind} ${(solution?.rates[edge.recipeId] ?? 0) > 0.005 ? 'active' : ''}`}
            style={solution ? { strokeWidth: Math.max(1, Math.ceil(edge.actualRate / 30)), opacity: edge.actualRate < 1 ? 0.5 : 1 } : undefined} />
          <text x={edge.unitX} y={edge.unitY} textAnchor={edge.unitAnchor} className={`edge-label recipe-rate ${edge.kind} ${hoveredRecipe === edge.recipeId ? 'revealed' : ''}`}>{formatEdgeRate(edge.unitRate)}</text>
          {solution && <text x={edge.labelX} y={edge.labelY} textAnchor="middle" className={`edge-label flow-rate ${edge.kind}`}>{formatEdgeRate(edge.actualRate)}</text>}
        </g>)}
      </svg>
      {registry.items.map((item) => {
        const pos = positions[itemNode(item.id)]
        const flow = itemFlows(item, flowRecipes, solution)
        return <div key={item.id} className={`graph-node item-node ${item.type === 'raw' ? 'raw' : ''} ${targetId === item.id ? 'selected' : ''} ${focused && !focused.has(itemNode(item.id)) ? 'faded' : ''}`} style={{ left: pos.x, top: pos.y }} title={`${item.name} · 输入 ${formatRate(flow.produced + flow.source)}（含外部输入 ${formatRate(flow.source)}）· 输出 ${formatRate(flow.consumed)} · 净 ${formatRate(flow.net)} / 分`}
          onPointerDown={(event) => { event.stopPropagation(); drag.current = { type: 'node', id: itemNode(item.id), x: event.clientX, y: event.clientY }; viewport.current?.setPointerCapture(event.pointerId) }}
          onDoubleClick={() => onSelectItem(item.id)}>
          <div className="item-title">{item.name}</div>
          <div className="item-rates"><div className="item-in">入 {formatPortRate(flow.produced + flow.source)}</div><div className="item-out">出 {formatPortRate(flow.consumed)}</div><div className={`item-net ${flow.net < -0.01 ? 'negative' : ''}`}>净 {formatPortRate(flow.net)}</div></div>
        </div>
      })}
      {registry.recipes.map((recipe) => {
        const pos = positions[recipeNode(recipe.id)]
        const rate = solution?.rates[recipe.id] ?? 0
        return <div key={recipe.id} className={`graph-node recipe-node ${rate > 0.005 ? 'running' : ''} ${focused && !focused.has(recipeNode(recipe.id)) ? 'faded' : ''}`} style={{ left: pos.x, top: pos.y }} title={`${recipe.name} · ${formatRate(rate)} 份配方效率 · 耗电 ${recipe.power}/份 · ${recipe.duration} 秒/次 · 输入 ${recipe.inputs.map((entry) => `${names.get(entry.itemId)} ${formatPortRate(entry.amount * 60 / recipe.duration)}`).join('、')} · 输出 ${recipe.outputs.map((entry) => `${names.get(entry.itemId)} ${formatPortRate(entry.amount * 60 / recipe.duration)}`).join('、')}`}
          onPointerEnter={() => setHoveredRecipe(recipe.id)} onPointerLeave={() => setHoveredRecipe(null)}
          onPointerDown={(event) => event.stopPropagation()}>
          <span className="recipe-factor">{rate.toFixed(1)}</span>
        </div>
      })}
    </div>
    <div className="canvas-hint">{fitOnLoad ? '仅显示目标上游 · 节点速率按全图计算 · 拖动平移与产物' : '拖动平移 · 滚轮缩放 · 拖动产物 · 双击产物聚焦'}</div>
    <button className="layout-button" onPointerDown={(event) => event.stopPropagation()} onClick={() => setOverrides(optimizeItemPositions(registry, itemPositions))}>优化排布</button>
    <button className="fit-button" onPointerDown={(event) => event.stopPropagation()} onClick={fitAll}>适配全图</button>
    <div className="zoom-badge">{Math.round(view.scale * 100)}% · {registry.items.length} 产物 · {registry.recipes.length} 配方</div>
  </div>
}
