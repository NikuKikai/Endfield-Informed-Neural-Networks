import type { HistoryPoint } from './types'
import { useI18n } from './i18n'

type Series = { key: string; label: string }
type Props = { points: HistoryPoint[]; series: Series[]; visibleKeys: string[] }

const colors = ['#82d7bd', '#f0b46d', '#a6a9f0', '#e58d9b', '#84bde8', '#d0b1e7', '#d5d480', '#70c7cf']
const short = (value: number) => Math.abs(value) >= 1000 ? `${Number((value / 1000).toFixed(1))}k` : Number(value.toFixed(1)).toString()

export default function HistoryChart({ points, series, visibleKeys }: Props) {
  const { t, number } = useI18n()
  const active = series.filter((entry) => visibleKeys.includes(entry.key) && points.some((point) => Number.isFinite(point.metrics[entry.key])))
  const values = active.flatMap((entry) => points.map((point) => point.metrics[entry.key]).filter(Number.isFinite))
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const spread = max - min || 1
  const first = points[0]?.iterations ?? 0
  const last = points.at(-1)?.iterations ?? first
  const x = (step: number) => last === first ? 124 : 28 + (step - first) / (last - first) * 200
  const y = (value: number) => 116 - (value - min) / spread * 94

  return <div className="history-chart">
    <div className="history-heading">{t('history')} <span>{t('every1k')}</span></div>
    {points.length && active.length ? <svg viewBox="0 0 240 145" role="img" aria-label={t('chartLabel')}>
      <line x1="28" y1="22" x2="228" y2="22" className="chart-grid" />
      <line x1="28" y1="69" x2="228" y2="69" className="chart-grid" />
      <line x1="28" y1="116" x2="228" y2="116" className="chart-grid" />
      <text x="2" y="25" className="chart-axis">{short(max)}</text>
      <text x="2" y="118" className="chart-axis">{short(min)}</text>
      <text x="28" y="137" className="chart-axis">{short(first)}</text>
      <text x="228" y="137" textAnchor="end" className="chart-axis">{short(last)} {t('stepUnit')}</text>
      {active.map((entry) => {
        const color = colors[series.findIndex((candidate) => candidate.key === entry.key) % colors.length]
        const samples = points.filter((point) => Number.isFinite(point.metrics[entry.key]))
        return <g key={entry.key}>
          {samples.length > 1 && <polyline points={samples.map((point) => `${x(point.iterations)},${y(point.metrics[entry.key])}`).join(' ')} fill="none" stroke={color} strokeWidth="2" />}
          {samples.map((point) => <circle key={point.iterations} cx={x(point.iterations)} cy={y(point.metrics[entry.key])} r="2.5" fill={color}><title>{entry.label} · {short(point.iterations)} {t('stepUnit')} · {number(point.metrics[entry.key], { maximumFractionDigits: 3 })}</title></circle>)}
        </g>
      })}
    </svg> : <div className="chart-empty">{points.length ? t('selectChart') : t('chartAfter1k')}</div>}
  </div>
}
