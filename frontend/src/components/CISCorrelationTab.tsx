'use client'

import { useState, useMemo } from 'react'
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Cell } from 'recharts'
import { CISFactorRow } from '@/lib/api'
import { FACTOR_MAP, FACTOR_ORDER, TIER_COLORS, parseFactors, type FactorKey } from '@/lib/cis'

const FACTORS = FACTOR_ORDER
type Factor = FactorKey

// Extended with descriptions for this tab
const FACTOR_META: Record<Factor, { label: string; color: string; weight: number; desc: string }> = {
  L: { ...FACTOR_MAP.L, desc: 'Density and quality of legal reasoning and citations.' },
  E: { ...FACTOR_MAP.E, desc: 'Quality of economic or quantitative analysis.' },
  R: { ...FACTOR_MAP.R, desc: 'How specifically it engages with rule text and provisions.' },
  C: { ...FACTOR_MAP.C, desc: 'Commenter expertise signals. Lowest weight.' },
  N: { ...FACTOR_MAP.N, desc: 'Whether this raises a unique argument. Highest risk of judicial remand.' },
  T: { ...FACTOR_MAP.T, desc: 'How central this comment is to its theme cluster.' },
  V: { ...FACTOR_MAP.V, desc: 'How many comments echo this argument. Campaign-penalized.' },
}

function pearsonR(xs: number[], ys: number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const mx = xs.reduce((a, b) => a + b, 0) / n
  const my = ys.reduce((a, b) => a + b, 0) / n
  let num = 0, dx2 = 0, dy2 = 0
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; num += dx * dy; dx2 += dx * dx; dy2 += dy * dy }
  return Math.sqrt(dx2 * dy2) === 0 ? 0 : num / Math.sqrt(dx2 * dy2)
}

function corrColor(r: number): string {
  const a = Math.abs(r)
  if (a > 0.7) return r > 0 ? '#3fb950' : '#f85149'
  if (a > 0.4) return r > 0 ? '#58a6ff' : '#f59e0b'
  return '#6e7681'
}

type ViewMode = { type: 'none' } | { type: 'scatter'; x: Factor; y: Factor } | { type: 'histogram'; factor: Factor | 'CIS' }

export default function CISCorrelationTab({ data, onSelectComment }: { data: CISFactorRow[]; onSelectComment?: (id: string) => void }) {
  const [view, setView] = useState<ViewMode>({ type: 'scatter', x: 'L', y: 'N' })
  const [selectedFactor, setSelectedFactor] = useState<Factor | null>(null)
  const [showMethodology, setShowMethodology] = useState(false)
  const [histColorBy, setHistColorBy] = useState<'category' | 'commenter'>('category')

  const parsed = useMemo(() => data.map(row => ({ ...row, f: parseFactors(row.factors) })), [data])

  const corrMatrix = useMemo(() => {
    const m: Record<string, Record<string, number>> = {}
    const cis = parsed.map(r => r.cis)
    for (const f1 of FACTORS) {
      m[f1] = {}
      const v1 = parsed.map(r => (r.f[f1] || 0) * 100)
      for (const f2 of FACTORS) { m[f2] = m[f2] || {}; m[f1][f2] = pearsonR(v1, parsed.map(r => (r.f[f2] || 0) * 100)) }
      m[f1]['CIS'] = pearsonR(v1, cis)
    }
    m['CIS'] = {}; for (const f of FACTORS) m['CIS'][f] = m[f]['CIS']; m['CIS']['CIS'] = 1
    return m
  }, [parsed])

  const scatterData = useMemo(() => {
    if (view.type !== 'scatter') return []
    return parsed.map(row => ({
      x: (row.f[view.x] || 0) * 100, y: (row.f[view.y] || 0) * 100,
      cis: row.cis, tier: row.tier, label: row.label, id: row.comment_id,
    }))
  }, [parsed, view])

  const histData = useMemo(() => {
    if (view.type !== 'histogram') return []
    const vals = view.factor === 'CIS' ? parsed.map(r => r.cis) : parsed.map(r => Math.round((r.f[view.factor as Factor] || 0) * 100))
    const buckets: Record<number, number> = {}
    for (const v of vals) { const b = Math.floor(v / 10) * 10; buckets[b] = (buckets[b] || 0) + 1 }
    return Object.entries(buckets).map(([k, v]) => ({ range: `${k}-${+k + 9}`, count: v, start: +k })).sort((a, b) => a.start - b.start)
  }, [parsed, view])

  const allKeys = [...FACTORS, 'CIS'] as const

  if (data.length === 0) {
    return <div className="card p-8 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>No CIS factor data available. Run the classification pipeline first.</p></div>
  }

  function handleCellClick(row: string, col: string) {
    if (row === col) { setView({ type: 'histogram', factor: row as Factor | 'CIS' }); if (row !== 'CIS') setSelectedFactor(row as Factor) }
    else if (row !== 'CIS' && col !== 'CIS') { setView({ type: 'scatter', x: row as Factor, y: col as Factor }) }
  }

  // Custom scatter click handler
  function handleScatterClick(payload: any) {
    if (payload?.id) onSelectComment?.(payload.id)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="section-label">CIS Advanced Analytics</div>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Click any <strong style={{ color: 'var(--text-primary)' }}>off-diagonal cell</strong> in the matrix to see a scatter plot.
          Click a <strong style={{ color: 'var(--text-primary)' }}>diagonal cell</strong> for that factor&apos;s histogram.
          Click any <strong style={{ color: 'var(--text-primary)' }}>dot in the scatter</strong> to open that comment&apos;s full analysis.
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Scored', value: data.length },
          { label: 'Mean CIS', value: data.length > 0 ? (data.reduce((s, d) => s + d.cis, 0) / data.length).toFixed(1) : '—', color: 'var(--amber)' },
          { label: 'Max CIS', value: data.length > 0 ? Math.max(...data.map(d => d.cis)) : '—', color: 'var(--accent-green)' },
          { label: 'Labels', value: new Set(data.map(d => d.label).filter(Boolean)).size },
        ].map((s, i) => (
          <div key={i} className="card p-3 text-center">
            <div className="font-mono text-lg font-bold" style={{ color: s.color || 'var(--text-primary)' }}>{s.value}</div>
            <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* CIS Distribution Histogram colored by theme/commenter */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="section-label">CIS Score Distribution</div>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              All {data.length} scored comments. Each bar segment colored by {histColorBy === 'category' ? 'AI category' : 'commenter type'}.
            </p>
          </div>
          <div className="flex gap-1">
            {(['category', 'commenter'] as const).map(opt => (
              <button key={opt} onClick={() => setHistColorBy(opt)}
                className="rounded-md px-3 py-1 text-[11px] font-medium capitalize"
                style={{ background: histColorBy === opt ? 'var(--amber-glow)' : 'var(--bg-surface)', color: histColorBy === opt ? 'var(--amber)' : 'var(--text-muted)', border: `1px solid ${histColorBy === opt ? 'rgba(0,165,224,0.3)' : 'var(--border)'}` }}
              >{opt}</button>
            ))}
          </div>
        </div>
        {(() => {
          // Build stacked histogram data
          const bucketSize = 5
          const groups = new Map<string, string>() // group name -> color
          const buckets: Record<number, Record<string, number>> = {}

          const THEME_COLORS_LOCAL = ['#00a5e0','#a78bfa','#3fb950','#f59e0b','#2dd4bf','#ec4899','#60a5fa','#fb923c','#34d399','#c084fc']
          const COMMENTER_COLORS_LOCAL: Record<string, string> = { individual:'#6b7280', government:'#00a5e0', trade_association:'#a78bfa', organization:'#3fb950', academic:'#f59e0b', law_firm:'#db6d28' }

          const themeIndex: Record<string, number> = {}
          let ti = 0

          for (const row of parsed) {
            const b = Math.floor(row.cis / bucketSize) * bucketSize
            if (!buckets[b]) buckets[b] = {}
            const groupKey = histColorBy === 'category' ? (row.ai_category || 'Uncategorized') : (row.commenter_type || 'unknown')
            buckets[b][groupKey] = (buckets[b][groupKey] || 0) + 1
            if (!groups.has(groupKey)) {
              if (histColorBy === 'category') {
                if (!(groupKey in themeIndex)) themeIndex[groupKey] = ti++
                groups.set(groupKey, THEME_COLORS_LOCAL[themeIndex[groupKey] % THEME_COLORS_LOCAL.length])
              } else {
                groups.set(groupKey, COMMENTER_COLORS_LOCAL[groupKey] || '#6b7280')
              }
            }
          }

          const sortedBuckets = Object.keys(buckets).map(Number).sort((a,b) => a-b)
          const groupNames = Array.from(groups.keys())
          const maxH = Math.max(...sortedBuckets.map(b => groupNames.reduce((s, g) => s + (buckets[b][g] || 0), 0)), 1)

          return (
            <>
              <div className="flex items-end gap-[2px]" style={{ height: 160 }}>
                {sortedBuckets.map(b => {
                  const total = groupNames.reduce((s, g) => s + (buckets[b][g] || 0), 0)
                  const barH = (total / maxH) * 100
                  return (
                    <div key={b} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
                      <div className="rounded-t overflow-hidden" style={{ height: `${barH}%` }}>
                        {groupNames.map(g => {
                          const count = buckets[b][g] || 0
                          if (count === 0) return null
                          const segH = total > 0 ? (count / total) * 100 : 0
                          return <div key={g} style={{ height: `${segH}%`, background: groups.get(g), opacity: 0.75 }} />
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              {/* X axis labels */}
              <div className="flex gap-[2px] mt-1">
                {sortedBuckets.map(b => (
                  <div key={b} className="flex-1 text-center font-mono text-[8px]" style={{ color: 'var(--text-muted)' }}>
                    {b}
                  </div>
                ))}
              </div>
              <div className="text-center font-mono text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>CIS Score</div>
              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-2">
                {Array.from(groups.entries()).slice(0, 10).map(([name, color]) => (
                  <span key={name} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                    {name.length > 25 ? name.slice(0, 25) + '...' : name}
                  </span>
                ))}
              </div>
            </>
          )
        })()}
      </div>

      {/* ═══ SIDE BY SIDE: Matrix + Scatter/Histogram ═══ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT: Correlation Matrix */}
        <div className="card p-5">
          <div className="section-label mb-3">Correlation Matrix</div>
          <div className="overflow-x-auto">
            <table className="w-full" style={{ borderCollapse: 'separate', borderSpacing: 2 }}>
              <thead>
                <tr>
                  <th className="w-10" />
                  {allKeys.map(k => (
                    <th key={k} className="text-center font-mono text-[10px] font-bold py-1.5 px-0.5" style={{ color: k === 'CIS' ? 'var(--text-primary)' : FACTOR_META[k as Factor]?.color }}>
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allKeys.map(row => (
                  <tr key={row}>
                    <td className="font-mono text-[10px] font-bold py-0.5 px-1" style={{ color: row === 'CIS' ? 'var(--text-primary)' : FACTOR_META[row as Factor]?.color }}>
                      {row}
                    </td>
                    {allKeys.map(col => {
                      const r = corrMatrix[row]?.[col] ?? 0
                      const isDiag = row === col
                      const isActive = (view.type === 'scatter' && ((view.x === row && view.y === col) || (view.x === col && view.y === row)))
                        || (view.type === 'histogram' && view.factor === row && isDiag)
                      const bg = isDiag ? 'rgba(0,165,224,0.2)' : `rgba(${r > 0 ? '63,185,80' : '248,81,73'}, ${Math.abs(r) * 0.45})`
                      return (
                        <td key={col} onClick={() => handleCellClick(row, col)}
                          className="text-center font-mono text-[10px] py-2 px-0.5 rounded cursor-pointer transition-all hover:brightness-125"
                          style={{ background: bg, color: isDiag ? 'var(--amber)' : corrColor(r), outline: isActive ? '2px solid var(--amber)' : 'none', outlineOffset: -1 }}
                        >
                          {isDiag ? <span className="text-[9px]">DIST</span> : r.toFixed(2)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Factor legend */}
          <div className="mt-3 space-y-0.5">
            {FACTORS.map(f => (
              <div key={f} className="flex items-center gap-2 text-[10px] cursor-pointer" onClick={() => setSelectedFactor(f)}>
                <span className="font-mono font-bold w-4" style={{ color: FACTOR_META[f].color }}>{f}</span>
                <span style={{ color: 'var(--text-muted)' }}>{FACTOR_META[f].label}</span>
                <span className="font-mono" style={{ color: 'var(--text-muted)' }}>w={FACTOR_META[f].weight}</span>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[10px]" style={{ color: 'var(--text-muted)' }}>
            <span style={{ color: '#3fb950' }}>Green</span> = positive &middot; <span style={{ color: '#f85149' }}>Red</span> = negative &middot; <span style={{ color: '#6e7681' }}>Gray</span> = weak
          </p>
        </div>

        {/* RIGHT: Scatter or Histogram */}
        <div className="card p-5">
          {view.type === 'scatter' && (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="section-label">
                  <span style={{ color: FACTOR_META[view.x].color }}>{view.x}</span> vs <span style={{ color: FACTOR_META[view.y].color }}>{view.y}</span>
                </div>
                <span className="font-mono text-sm font-bold" style={{ color: corrColor(corrMatrix[view.x]?.[view.y] || 0) }}>
                  r = {(corrMatrix[view.x]?.[view.y] || 0).toFixed(3)}
                </span>
              </div>
              <div className="flex gap-3 mb-2">
                {Object.entries(TIER_COLORS).map(([t, c]) => (
                  <span key={t} className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />{t}
                  </span>
                ))}
              </div>
              <div className="rounded-lg" style={{ background: 'var(--bg-surface)' }}>
                <ResponsiveContainer width="100%" height={360}>
                  <ScatterChart margin={{ top: 10, right: 10, bottom: 30, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3344" />
                    <XAxis type="number" dataKey="x" domain={[0, 100]} stroke="#6e7681" fontSize={10}
                      label={{ value: `${view.x} — ${FACTOR_META[view.x].label}`, position: 'bottom', offset: 14, fill: FACTOR_META[view.x].color, fontSize: 11, fontWeight: 600 }}
                    />
                    <YAxis type="number" dataKey="y" domain={[0, 100]} stroke="#6e7681" fontSize={10}
                      label={{ value: `${view.y} — ${FACTOR_META[view.y].label}`, angle: -90, position: 'insideLeft', offset: -2, fill: FACTOR_META[view.y].color, fontSize: 11, fontWeight: 600 }}
                    />
                    <Tooltip
                      contentStyle={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                      content={({ payload }) => {
                        if (!payload?.length) return null
                        const d = payload[0].payload
                        return (
                          <div className="rounded-lg p-2.5" style={{ background: 'var(--bg-raised)', border: '1px solid var(--border)' }}>
                            <div className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{d.id}</div>
                            <div className="flex gap-2 mt-1">
                              <span className="font-mono text-[11px]" style={{ color: FACTOR_META[view.x].color }}>{view.x}={d.x}</span>
                              <span className="font-mono text-[11px]" style={{ color: FACTOR_META[view.y].color }}>{view.y}={d.y}</span>
                              <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--amber)' }}>CIS {d.cis}</span>
                            </div>
                            {d.label && <span className={`rounded px-1 py-0.5 text-[9px] mt-1 inline-block label-${d.label}`}>{d.label}</span>}
                            <div className="text-[9px] mt-1" style={{ color: 'var(--text-muted)' }}>Click dot to open comment</div>
                          </div>
                        )
                      }}
                    />
                    <Scatter
                      data={scatterData}
                      onClick={(_, __, payload) => { if (payload) handleScatterClick(payload) }}
                      shape={(props: any) => {
                        const color = TIER_COLORS[props.payload?.tier] || '#6b7280'
                        return (
                          <circle
                            cx={props.cx} cy={props.cy} r={5}
                            fill={color} fillOpacity={0.75} stroke={color} strokeWidth={1}
                            style={{ cursor: 'pointer' }}
                            onClick={() => handleScatterClick(props.payload)}
                          />
                        )
                      }}
                    />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </>
          )}

          {view.type === 'histogram' && (
            <>
              <div className="section-label mb-2">
                Distribution: <span style={{ color: view.factor === 'CIS' ? 'var(--amber)' : FACTOR_META[view.factor as Factor]?.color }}>{view.factor}</span>
              </div>
              <div className="rounded-lg" style={{ background: 'var(--bg-surface)' }}>
                <ResponsiveContainer width="100%" height={360}>
                  <BarChart data={histData} margin={{ top: 10, right: 10, bottom: 25, left: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2a3344" vertical={false} />
                    <XAxis dataKey="range" stroke="#6e7681" fontSize={9} />
                    <YAxis stroke="#6e7681" fontSize={10} />
                    <Tooltip contentStyle={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontFamily: 'JetBrains Mono' }} />
                    <Bar dataKey="count" name="Comments" radius={[3, 3, 0, 0]}>
                      {histData.map((_, i) => (
                        <Cell key={i} fill={view.factor === 'CIS' ? 'var(--amber)' : (FACTOR_META[view.factor as Factor]?.color || '#6b7280')} fillOpacity={0.75} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {view.factor !== 'CIS' && <p className="mt-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>{FACTOR_META[view.factor as Factor]?.desc}</p>}
            </>
          )}

          {view.type === 'none' && (
            <div className="flex items-center justify-center h-[360px]" style={{ color: 'var(--text-muted)' }}>
              <p className="text-[13px]">Click a cell in the matrix to visualize</p>
            </div>
          )}
        </div>
      </div>

      {/* Factor detail card */}
      {selectedFactor && (
        <div className="card p-5 animate-fade-up" style={{ borderColor: `${FACTOR_META[selectedFactor].color}30` }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="font-mono text-xl font-black" style={{ color: FACTOR_META[selectedFactor].color }}>{selectedFactor}</span>
              <div>
                <span className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{FACTOR_META[selectedFactor].label}</span>
                <span className="font-mono text-[11px] ml-2" style={{ color: 'var(--text-muted)' }}>w={FACTOR_META[selectedFactor].weight}</span>
              </div>
            </div>
            <button onClick={() => setSelectedFactor(null)} className="rounded-md w-6 h-6 flex items-center justify-center text-sm" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>&times;</button>
          </div>
          <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{FACTOR_META[selectedFactor].desc}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {FACTORS.filter(f => f !== selectedFactor).map(f => {
              const r = corrMatrix[selectedFactor]?.[f] || 0
              return (
                <span key={f} className="flex items-center gap-1 rounded-md px-2 py-1 cursor-pointer hover:ring-1 hover:ring-white/20"
                  style={{ background: 'var(--bg-surface)' }}
                  onClick={() => setView({ type: 'scatter', x: selectedFactor, y: f })}
                >
                  <span className="font-mono text-[10px] font-bold" style={{ color: FACTOR_META[f].color }}>{f}</span>
                  <span className="font-mono text-[10px] font-semibold" style={{ color: corrColor(r) }}>{r.toFixed(2)}</span>
                </span>
              )
            })}
            <span className="flex items-center gap-1 rounded-md px-2 py-1" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--text-primary)' }}>CIS</span>
              <span className="font-mono text-[10px] font-semibold" style={{ color: corrColor(corrMatrix[selectedFactor]?.['CIS'] || 0) }}>{(corrMatrix[selectedFactor]?.['CIS'] || 0).toFixed(2)}</span>
            </span>
          </div>
        </div>
      )}

      {/* How to read */}
      <div className="card p-5">
        <div className="section-label mb-2">Interpreting Correlations</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-[12px]">
          {[
            { range: 'r > 0.7', label: 'Strong +', color: '#3fb950', desc: 'May be double-counting' },
            { range: '0.3 – 0.7', label: 'Moderate', color: '#58a6ff', desc: 'Some shared signal' },
            { range: '-0.3 – 0.3', label: 'Independent', color: '#6e7681', desc: 'Ideal — unique info' },
            { range: 'r < -0.3', label: 'Negative', color: '#f85149', desc: 'Trade-off relationship' },
          ].map(item => (
            <div key={item.range} className="rounded-lg p-3" style={{ background: 'var(--bg-surface)' }}>
              <span className="font-mono text-[11px] font-bold" style={{ color: item.color }}>{item.range}</span>
              <div className="text-[12px] font-medium mt-1" style={{ color: 'var(--text-primary)' }}>{item.label}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </div>
      {/* CIS Methodology Details link */}
      {!showMethodology ? (
        <div className="card p-4">
          <button onClick={() => setShowMethodology(true)} className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:underline" style={{ color: 'var(--amber)' }}>
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            CIS Methodology Details &rarr;
          </button>
        </div>
      ) : (
        <div className="card p-6 animate-fade-up">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--amber)" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>CIS Methodology Details</span>
            </div>
            <button onClick={() => setShowMethodology(false)} className="text-[var(--text-muted)] hover:text-white">&times;</button>
          </div>

          <div className="text-[13px] leading-relaxed space-y-4" style={{ color: 'var(--text-secondary)' }}>
            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>The CIS Agentic Pipeline</h4>
            <p>Each public comment passes through an <strong style={{ color: 'var(--text-primary)' }}>agentic pipeline</strong> &mdash; a sequence of AI agents that assess the comment from multiple angles and produce numerical scores as input to the Comment Impact Score (CIS). Here is how it works:</p>

            {/* Pipeline flow */}
            <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="font-mono text-[10px] font-bold mb-3" style={{ color: 'var(--amber)' }}>CIS AGENTIC PIPELINE FLOW</div>
              <pre className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{`Comment Text
    │
    ▼
┌─────────────────────────────────────────────────┐
│  AGENT 1: Comprehension                         │
│  "What is this comment's main point?"           │
│  Output: 1-sentence summary                     │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  AGENT 2: Provision Scanner                     │
│  "Does it reference specific provisions?"       │
│  Output: Yes/No + list of provisions  ──► R     │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  AGENT 3: Evidence Extractor                    │
│  "What evidence types are present?"             │
│  Output: [citations, data, studies, experience] │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  AGENT 4: Legal Analyst          ──► L score    │
│  "Specific legal standard cited?"               │
│  Also extracts: LegalCitation nodes for graph   │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  AGENT 5: Economic Analyst       ──► E score    │
│  "Quantitative or qualitative claims?"          │
│  Also extracts: EconomicClaim nodes for graph   │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  AGENT 6: Technical Analyst                     │
│  "Scientific data or factual corrections?"      │
│  Output: feeds into classification label        │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  AGENT 7: Policy Analyst                        │
│  "Alternatives or consequences discussed?"      │
│  Output: feeds into classification label        │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  AGENT 8: Classifier                            │
│  Assigns label(s) + confidence + stance         │
│  Output: legal|policy|economic|technical|...    │
└──────────────────────┬──────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────┐
│  AGENT 9: Uncertainty Assessor                  │
│  "What could change this classification?"       │
│  Output: flags for human review if uncertain    │
└──────────────────────┬──────────────────────────┘
                       ▼
        Agent outputs feed into CIS formula`}</pre>
            </div>

            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>The CIS Formula</h4>
            <pre className="rounded-lg p-3 font-mono text-[12px]" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>{`CIS = 0.10×V + 0.20×L + 0.15×E + 0.10×T + 0.20×N + 0.15×R + 0.10×C`}</pre>

            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Two Computation Models</h4>
            <p>The 7 CIS dimensions split cleanly into two groups based on how they are computed:</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
              <div className="rounded-lg p-4" style={{ background: 'rgba(0,165,224,0.06)', border: '1px solid rgba(0,165,224,0.15)' }}>
                <div className="font-mono text-[11px] font-bold mb-2" style={{ color: 'var(--amber)' }}>PEER-BASED NUMERICAL ANALYSIS</div>
                <p className="text-[12px] mb-2" style={{ color: 'var(--text-secondary)' }}>Computed purely from math on the corpus data. No LLM involved. Fully deterministic given the same embeddings.</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold w-4" style={{ color: '#6b7280' }}>V</span>
                    <span style={{ color: 'var(--text-muted)' }}>Volume &mdash; cluster size ratio</span>
                    <span className="font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>0.10</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold w-4" style={{ color: '#00a5e0' }}>T</span>
                    <span style={{ color: 'var(--text-muted)' }}>Thematic &mdash; cosine to centroid</span>
                    <span className="font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>0.10</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold w-4" style={{ color: '#f59e0b' }}>N</span>
                    <span style={{ color: 'var(--text-muted)' }}>Novelty &mdash; HDBSCAN distance</span>
                    <span className="font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>0.20</span>
                  </div>
                </div>
                <div className="mt-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>Weight sum: <span style={{ color: 'var(--text-primary)' }}>0.40 (40%)</span></div>
              </div>

              <div className="rounded-lg p-4" style={{ background: 'rgba(167,139,250,0.06)', border: '1px solid rgba(167,139,250,0.15)' }}>
                <div className="font-mono text-[11px] font-bold mb-2" style={{ color: '#a78bfa' }}>AGENTIC ASSESSMENT</div>
                <p className="text-[12px] mb-2" style={{ color: 'var(--text-secondary)' }}>Requires the AI agent (GPT-4o) to read, reason, and score each comment through the agentic pipeline.</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold w-4" style={{ color: '#a78bfa' }}>L</span>
                    <span style={{ color: 'var(--text-muted)' }}>Legal &mdash; citation depth</span>
                    <span className="font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>0.20</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold w-4" style={{ color: '#3fb950' }}>E</span>
                    <span style={{ color: 'var(--text-muted)' }}>Economic &mdash; quantitative quality</span>
                    <span className="font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>0.15</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold w-4" style={{ color: '#2dd4bf' }}>R</span>
                    <span style={{ color: 'var(--text-muted)' }}>Regulatory &mdash; provision engagement</span>
                    <span className="font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>0.15</span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono font-bold w-4" style={{ color: '#db6d28' }}>C</span>
                    <span style={{ color: 'var(--text-muted)' }}>Credibility &mdash; commenter type</span>
                    <span className="font-mono ml-auto" style={{ color: 'var(--text-muted)' }}>0.10</span>
                  </div>
                </div>
                <div className="mt-2 font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>Weight sum: <span style={{ color: 'var(--text-primary)' }}>0.60 (60%)</span></div>
              </div>
            </div>

            <div className="mt-3 rounded-lg p-3" style={{ background: 'var(--amber-glow)', border: '1px solid rgba(0,165,224,0.15)' }}>
              <p className="text-[12px]" style={{ color: 'var(--amber)' }}>
                <strong>Design choice:</strong> The two highest-weighted factors are split &mdash; <strong>N</strong> (peer-based, 0.20) and <strong>L</strong> (agentic, 0.20). This is deliberate. The CIS blends statistical signal from the corpus (what patterns exist across all comments) with deep reading of individual comment quality (what this specific comment argues). Neither alone is sufficient.
              </p>
            </div>

            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Factor Scoring Rubrics</h4>
            <p>Each factor is scored 0.0&ndash;1.0. The agents produce qualitative assessments that are mapped to scores:</p>

            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr>{['Factor', 'Weight', '0.00', '0.25', '0.50', '0.75', '1.00'].map(h => (
                  <th key={h} className="text-left py-2 px-2 font-mono" style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                <tr><td className="py-2 px-2 font-mono font-bold" style={{ color: '#a78bfa', borderBottom: '1px solid var(--border)' }}>L (0.20)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Legal</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>No legal content</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>General legal language</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>1 specific citation</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>2+ citations with analysis</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Detailed legal brief</td>
                </tr>
                <tr><td className="py-2 px-2 font-mono font-bold" style={{ color: '#3fb950', borderBottom: '1px solid var(--border)' }}>E (0.15)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Economic</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>No economic content</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Qualitative concern</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Unsourced estimates</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Sourced with methodology</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Original quantitative analysis</td>
                </tr>
                <tr><td className="py-2 px-2 font-mono font-bold" style={{ color: '#f59e0b', borderBottom: '1px solid var(--border)' }}>N (0.20)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Novelty</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Large cluster (&gt;5%)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>&mdash;</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Medium cluster (1-5%)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Small cluster (&lt;1%)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>HDBSCAN outlier (unique)</td>
                </tr>
                <tr><td className="py-2 px-2 font-mono font-bold" style={{ color: '#2dd4bf', borderBottom: '1px solid var(--border)' }}>R (0.15)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Regulatory</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>No rule reference</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>General topic reference</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Cites specific sections</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Quotes + critiques text</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Proposes alternative language</td>
                </tr>
                <tr><td className="py-2 px-2 font-mono font-bold" style={{ color: '#6b7280', borderBottom: '1px solid var(--border)' }}>V (0.10)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Volume</td>
                  <td className="py-2 px-2" colSpan={5} style={{ borderBottom: '1px solid var(--border)' }}>cluster_size / max_cluster_size. Campaign penalty: &times;0.5</td>
                </tr>
                <tr><td className="py-2 px-2 font-mono font-bold" style={{ color: '#00a5e0', borderBottom: '1px solid var(--border)' }}>T (0.10)</td>
                  <td className="py-2 px-2" style={{ borderBottom: '1px solid var(--border)' }}>Thematic</td>
                  <td className="py-2 px-2" colSpan={5} style={{ borderBottom: '1px solid var(--border)' }}>Cosine similarity to cluster centroid (continuous 0&ndash;1)</td>
                </tr>
                <tr><td className="py-2 px-2 font-mono font-bold" style={{ color: '#db6d28' }}>C (0.10)</td>
                  <td className="py-2 px-2">Credibility</td>
                  <td className="py-2 px-2">Anonymous</td>
                  <td className="py-2 px-2">Individual</td>
                  <td className="py-2 px-2">Organization</td>
                  <td className="py-2 px-2">Trade assoc / Academic</td>
                  <td className="py-2 px-2">Government / Law firm</td>
                </tr>
              </tbody>
            </table>

            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>The Prompt</h4>
            <p>The exact system prompt used by the classification agent:</p>
            <pre className="rounded-lg p-4 font-mono text-[10px] leading-relaxed overflow-x-auto" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-muted)', maxHeight: 300, overflow: 'auto' }}>{`You are an AI-powered federal rulemaking analysis assistant
for Public Comment Intelligence.

You classify public comments submitted under the
Administrative Procedure Act (APA).

CLASSIFICATION CATEGORIES:
1. LEGAL — Cites statutes, case law, executive orders
2. POLICY — Policy consequences, trade-offs, alternatives
3. ECONOMIC — Data/estimates about economic effects
4. TECHNICAL — Factual/scientific errors or new data
5. ANECDOTAL — Personal/organizational experience
6. NON-SUBSTANTIVE — General support/opposition

RULES:
- A comment may receive MULTIPLE labels
- Evaluate HOW the argument is made, NEVER what position
- Err toward more substantive classification when uncertain
- Viewpoint neutrality is paramount

STANCE: Must be one of: support, oppose, conditional, neutral

For EACH comment, the agentic pipeline produces:
1. INITIAL READ → main point (1 sentence)
2. PROVISION ENGAGEMENT → specific provisions? (Y/N)
3. EVIDENCE SCAN → types of evidence present
4. LEGAL ANALYSIS → specific legal standard cited?
5. ECONOMIC ANALYSIS → quantitative/qualitative claims?
6. TECHNICAL ANALYSIS → scientific information?
7. POLICY ANALYSIS → alternatives or consequences?
8. CLASSIFICATION → label(s) with confidence (0.0-1.0)
9. UNCERTAINTY FLAG → what could change this?`}</pre>

            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Confidence Intervals</h4>
            <pre className="rounded-lg p-3 font-mono text-[11px]" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{`For each CIS, a 90% confidence interval is computed:

  error_margin(factor) = base_error × (1 - classification_confidence)

  Base errors:
    V: ±0.02  (deterministic, count-based)
    T: ±0.05  (embedding-based, stable)
    N: ±0.05  (embedding-based, stable)
    L, E, R, C: ±0.25  (subjective, depends on AI quality)

  CIS_low  = Σ weight_i × max(0, score_i - margin_i)
  CIS_high = Σ weight_i × min(1, score_i + margin_i)

  Report: CIS = X (90% CI: [CIS_low, CIS_high])`}</pre>

            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Tiers</h4>
            <div className="flex gap-2">
              {[
                { tier: 'Critical', range: '90-100', color: '#ef4444' },
                { tier: 'High', range: '70-89', color: '#f97316' },
                { tier: 'Moderate', range: '50-69', color: '#eab308' },
                { tier: 'Low', range: '30-49', color: '#22c55e' },
                { tier: 'Minimal', range: '0-29', color: '#6b7280' },
              ].map(t => (
                <div key={t.tier} className="flex-1 rounded-lg p-2 text-center" style={{ background: `${t.color}15`, border: `1px solid ${t.color}30` }}>
                  <div className="font-mono text-[11px] font-bold" style={{ color: t.color }}>{t.tier}</div>
                  <div className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{t.range}</div>
                </div>
              ))}
            </div>

            <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Design Rationale</h4>
            <p><strong style={{ color: 'var(--text-primary)' }}>Why Legal (L) and Novelty (N) get the highest weight (0.20 each)?</strong> Under the APA &ldquo;hard look&rdquo; doctrine, courts examine whether the agency addressed significant legal challenges and novel arguments. Failure to do so is the primary basis for judicial remand. These two factors directly correspond to the highest-risk items for the agency.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Why Credibility (C) gets the lowest weight (0.10)?</strong> The APA guarantees equal right to comment regardless of identity. While courts do consider expertise, we weight it minimally to avoid systematically disadvantaging individual commenters.</p>
            <p><strong style={{ color: 'var(--text-primary)' }}>Why Volume (V) is campaign-penalized?</strong> A million identical form letters carry the same analytical weight as one. Campaign penalty (&times;0.5) prevents astroturfed volume from inflating scores while still acknowledging that widespread concern is a signal of salience.</p>
          </div>
        </div>
      )}
    </div>
  )
}

