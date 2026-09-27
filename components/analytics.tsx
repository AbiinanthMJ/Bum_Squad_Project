// Lightweight analytics building blocks shared by the client dashboard (/progress)
// and the per-user admin dashboard (/admin/users/[id]). Charts are hand-rolled
// SVG so no extra dependency is introduced.
'use client'

import { useId, useMemo, useState } from 'react'

export type TrendPointDetail = { metric: string; value: number; target: number; pct: number }
export type TrendPoint = { label: string; value: number; week: string; count: number; details: TrendPointDetail[] }

export function buildTrend<T extends { metric: string; value: number; target: number; week_start: string }>(rows: T[]): TrendPoint[] {
  const byWeek = new Map<string, { sum: number; count: number; details: TrendPointDetail[] }>()
  for (const row of rows) {
    const value = Number(row.value)
    const target = Math.max(Number(row.target), 1)
    const pct = Math.min(150, (value / target) * 100)
    const bucket = byWeek.get(row.week_start) || { sum: 0, count: 0, details: [] }
    bucket.sum += pct
    bucket.count += 1
    bucket.details.push({ metric: row.metric, value, target: Number(row.target), pct: Math.round(pct) })
    byWeek.set(row.week_start, bucket)
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, bucket]) => ({
      label: new Date(week).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
      value: Math.round(bucket.sum / bucket.count),
      week,
      count: bucket.count,
      details: bucket.details.sort((a, b) => b.pct - a.pct),
    }))
}

export function Kpi({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="kpi">
      <span className="kpi-label">{label}</span>
      <strong className="kpi-value">{value}</strong>
      {hint && <small className="kpi-hint">{hint}</small>}
    </div>
  )
}

export function TrendChart({ points, emptyNote = 'Not enough check-ins yet — the trend line appears once your coach logs data for two different weeks.' }: { points: TrendPoint[]; emptyNote?: string }) {
  const gradientId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const active = hover ?? points.length - 1
  // Keep derived values memoized for clarity even though the computation is cheap.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const safeActive = useMemo(() => Math.max(0, Math.min(active, points.length - 1)), [active, points.length])
  if (points.length === 0) return <p className="chart-empty">{emptyNote}</p>

  const w = 640
  const h = 220
  const padX = 34
  const padTop = 18
  const padBottom = 36
  const max = 100
  const plotH = h - padTop - padBottom
  const plotW = w - padX * 2
  const step = points.length > 1 ? plotW / (points.length - 1) : 0
  const xFor = (i: number) => (points.length > 1 ? padX + i * step : padX + plotW / 2)
  const coords = points.map((p, i) => ({
    x: xFor(i),
    y: padTop + plotH - (Math.min(p.value, max) / max) * plotH,
    p,
  }))
  const line = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')
  const baseline = h - padBottom
  const area = coords.length > 1
    ? `M${coords[0].x.toFixed(1)},${baseline.toFixed(1)} L${line.replace(/ /g, ' L')} L${coords[coords.length - 1].x.toFixed(1)},${baseline.toFixed(1)} Z`
    : ''
  const grid = [0, 25, 50, 75, 100].map((v) => ({ v, y: padTop + plotH - (v / max) * plotH }))
  const current = coords[safeActive]

  return (
    <div className="chart-frame">
      <svg className="trend-svg" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Weekly performance trend">
        <defs>
          <linearGradient id={`trend-fill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--lime)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--lime)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {grid.map((g) => (
          <g key={g.v}>
            <line className="chart-grid" x1={padX} x2={w - padX + 6} y1={g.y} y2={g.y} />
            <text className="chart-axis" x={4} y={g.y + 3}>{g.v}</text>
          </g>
        ))}
        {area && <path className="trend-area" d={area} fill={`url(#trend-fill-${gradientId})`} />}
        {coords.length > 1 && <polyline className="trend-line" points={line} />}
        <line className="trend-crosshair" x1={current.x} x2={current.x} y1={padTop} y2={baseline} />
        {coords.map((c, i) => (
          <g key={`${c.p.week}-${i}`}>
            <circle
              className={`trend-hit${i === safeActive ? ' is-active' : ''}`}
              cx={c.x}
              cy={c.y}
              r={16}
              tabIndex={0}
              role="img"
              aria-label={`${c.p.label}: ${c.p.value}% across ${c.p.count} metric${c.p.count === 1 ? '' : 's'}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onClick={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onBlur={() => setHover(null)}
            >
              <title>{c.p.label}: {c.p.value}%</title>
            </circle>
            <circle className={`trend-dot${i === safeActive ? ' is-active' : ''}`} cx={c.x} cy={c.y} r={i === safeActive ? 6 : 4} />
            {(i === 0 || i === coords.length - 1 || coords.length <= 6) && (
              <text className="chart-axis chart-x-label" x={c.x} y={h - 12} textAnchor="middle">{c.p.label}</text>
            )}
          </g>
        ))}
      </svg>
      <div className="trend-tooltip" role="status" aria-live="polite">
        <strong>{current.p.label} · {current.p.value}% avg</strong>
        <span>{new Date(current.p.week).toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })} · {current.p.count} metric{current.p.count === 1 ? '' : 's'}</span>
        <ul>
          {current.p.details.map((detail) => (
            <li key={detail.metric}><span>{detail.metric}</span><em className={detail.pct >= 100 ? 'is-good' : detail.pct < 70 ? 'is-low' : ''}>{detail.pct}%</em><small>{detail.value} / {detail.target}</small></li>
          ))}
        </ul>
      </div>
    </div>
  )
}
