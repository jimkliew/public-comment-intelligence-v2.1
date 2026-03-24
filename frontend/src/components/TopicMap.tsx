'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { TopicMapData } from '@/lib/api'

// Same palette as ThemeHeatmap for consistency
const THEME_PALETTE = [
  '#00a5e0', '#a78bfa', '#3fb950', '#f59e0b', '#2dd4bf',
  '#ec4899', '#60a5fa', '#fb923c', '#34d399', '#c084fc',
  '#38bdf8', '#fbbf24',
]

const NOISE_COLOR = '#3a3f4b'

export default function TopicMap({
  data,
  onSelectComment,
}: {
  data: TopicMapData
  onSelectComment?: (id: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [tooltip, setTooltip] = useState<{ x: number; y: number; point: typeof data.points[0] } | null>(null)
  const [transform, setTransform] = useState<d3.ZoomTransform>(d3.zoomIdentity)

  // Build theme color map
  const themeColorMap: Record<string, string> = {}
  data.themes.forEach((t, i) => {
    themeColorMap[t.theme_id] = THEME_PALETTE[i % THEME_PALETTE.length]
  })

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || data.points.length === 0) return

    const width = container.clientWidth
    const height = 600
    canvas.width = width * 2  // Retina
    canvas.height = height * 2
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const ctx = canvas.getContext('2d')!
    ctx.scale(2, 2)

    // Compute scales from data bounds
    const xs = data.points.map(p => p.x)
    const ys = data.points.map(p => p.y)
    const pad = 0.05
    const xExtent = [Math.min(...xs), Math.max(...xs)]
    const yExtent = [Math.min(...ys), Math.max(...ys)]
    const xRange = xExtent[1] - xExtent[0] || 1
    const yRange = yExtent[1] - yExtent[0] || 1

    const scaleX = (v: number) => ((v - xExtent[0]) / xRange) * (width * (1 - 2 * pad)) + width * pad
    const scaleY = (v: number) => ((v - yExtent[0]) / yRange) * (height * (1 - 2 * pad)) + height * pad

    function draw(t: d3.ZoomTransform) {
      ctx.clearRect(0, 0, width, height)

      // Background
      ctx.fillStyle = '#0d1117'
      ctx.fillRect(0, 0, width, height)

      // Draw points
      for (const p of data.points) {
        const px = t.applyX(scaleX(p.x))
        const py = t.applyY(scaleY(p.y))
        const color = p.theme_id ? (themeColorMap[p.theme_id] || NOISE_COLOR) : NOISE_COLOR
        const r = p.theme_id ? 3 : 1.5

        // Glow for themed points
        if (p.theme_id) {
          ctx.beginPath()
          ctx.arc(px, py, r + 3, 0, Math.PI * 2)
          ctx.fillStyle = color + '15'
          ctx.fill()
        }

        // Point
        ctx.beginPath()
        ctx.arc(px, py, r, 0, Math.PI * 2)
        ctx.fillStyle = p.theme_id ? color + 'cc' : NOISE_COLOR + '60'
        ctx.fill()
      }

      // Draw theme labels with leader lines
      for (const theme of data.themes) {
        const color = themeColorMap[theme.theme_id] || '#6b7280'
        const cx = t.applyX(scaleX(theme.center_x))
        const cy = t.applyY(scaleY(theme.center_y))

        // Find a good label position (offset from center)
        const angle = Math.atan2(cy - height / 2, cx - width / 2)
        const labelDist = 60 + theme.label.length * 2
        const lx = cx + Math.cos(angle) * labelDist
        const ly = cy + Math.sin(angle) * labelDist

        // Leader line
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(lx, ly)
        ctx.strokeStyle = color + '60'
        ctx.lineWidth = 1
        ctx.stroke()

        // Label background
        ctx.font = '600 11px "DM Sans", sans-serif'
        const metrics = ctx.measureText(theme.label)
        const textW = metrics.width + 12
        const textH = 20

        ctx.fillStyle = '#0d1117ee'
        ctx.beginPath()
        ctx.roundRect(lx - textW / 2, ly - textH / 2, textW, textH, 4)
        ctx.fill()
        ctx.strokeStyle = color + '40'
        ctx.lineWidth = 1
        ctx.stroke()

        // Label text
        ctx.fillStyle = color
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(theme.label, lx, ly)

        // Count badge
        ctx.font = '700 9px "JetBrains Mono", monospace'
        const countText = `${theme.size}`
        const cw = ctx.measureText(countText).width + 8
        ctx.fillStyle = color + '30'
        ctx.beginPath()
        ctx.roundRect(lx - cw / 2, ly + 12, cw, 14, 3)
        ctx.fill()
        ctx.fillStyle = color
        ctx.fillText(countText, lx, ly + 19)
      }
    }

    draw(transform)

    // Zoom
    const sel = d3.select(canvas)
    const zoom = d3.zoom<HTMLCanvasElement, unknown>()
      .scaleExtent([0.3, 8])
      .on('zoom', (event) => {
        setTransform(event.transform)
        draw(event.transform)
      })
    sel.call(zoom)

    // Hover / click
    function handleMouse(event: MouseEvent) {
      const rect = canvas!.getBoundingClientRect()
      const mx = event.clientX - rect.left
      const my = event.clientY - rect.top

      let closest: typeof data.points[0] | null = null
      let closestDist = 15  // pixel threshold

      for (const p of data.points) {
        const px = transform.applyX(scaleX(p.x))
        const py = transform.applyY(scaleY(p.y))
        const d = Math.sqrt((mx - px) ** 2 + (my - py) ** 2)
        if (d < closestDist) {
          closestDist = d
          closest = p
        }
      }

      if (closest) {
        setTooltip({ x: event.clientX, y: event.clientY, point: closest })
      } else {
        setTooltip(null)
      }
    }

    canvas.addEventListener('mousemove', handleMouse)
    canvas.addEventListener('click', (e) => {
      handleMouse(e)
      if (tooltip?.point) {
        onSelectComment?.(tooltip.point.id)
      }
    })

    return () => {
      canvas.removeEventListener('mousemove', handleMouse)
    }
  }, [data, transform, themeColorMap, onSelectComment])

  if (data.points.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
          Topic map requires UMAP coordinates. Re-run the pipeline to generate them.
        </p>
      </div>
    )
  }

  return (
    <div className="card p-6">
      <div className="section-label">Topic Map</div>
      <p className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Each dot is a comment, positioned by semantic similarity (UMAP 2D projection). Comments close together discuss similar topics.
        Colors match the theme palette. Gray dots are unclustered (potential novel arguments). Scroll to zoom, drag to pan, click a dot for details.
      </p>

      {/* Legend */}
      <div className="mt-3 flex flex-wrap gap-3">
        {data.themes.map((t, i) => (
          <span key={t.theme_id} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: THEME_PALETTE[i % THEME_PALETTE.length], boxShadow: `0 0 6px ${THEME_PALETTE[i % THEME_PALETTE.length]}40` }} />
            {t.label} ({t.size})
          </span>
        ))}
        <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
          <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NOISE_COLOR }} />
          Unclustered
        </span>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="mt-4 relative rounded-lg overflow-hidden" style={{ background: '#0d1117' }}>
        <canvas ref={canvasRef} style={{ cursor: 'crosshair' }} />

        {/* Tooltip */}
        {tooltip && (
          <div
            className="fixed z-50 rounded-lg p-3 shadow-xl pointer-events-none max-w-xs"
            style={{
              left: tooltip.x + 16,
              top: tooltip.y - 10,
              background: 'var(--bg-raised)',
              border: `1px solid ${tooltip.point.theme_id ? (themeColorMap[tooltip.point.theme_id] || 'var(--border)') : 'var(--border)'}`,
            }}
          >
            <div className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{tooltip.point.id}</div>
            {tooltip.point.theme_label && (
              <div className="text-[12px] font-semibold mt-0.5" style={{ color: themeColorMap[tooltip.point.theme_id || ''] || 'var(--text-primary)' }}>
                {tooltip.point.theme_label}
              </div>
            )}
            {tooltip.point.excerpt && (
              <p className="text-[11px] mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                {tooltip.point.excerpt}
              </p>
            )}
            <div className="flex gap-2 mt-1">
              {tooltip.point.label && <span className={`rounded px-1.5 py-0.5 text-[9px] label-${tooltip.point.label}`}>{tooltip.point.label}</span>}
              {tooltip.point.cis && <span className="font-mono text-[10px]" style={{ color: 'var(--amber)' }}>CIS {tooltip.point.cis}</span>}
              {tooltip.point.stance && <span className="text-[10px] capitalize" style={{ color: 'var(--text-muted)' }}>{tooltip.point.stance}</span>}
            </div>
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {data.points.length} comments &middot; {data.themes.length} themes &middot; {data.points.filter(p => !p.theme_id).length} unclustered
      </p>
    </div>
  )
}
