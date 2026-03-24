'use client'

import { useState, useMemo } from 'react'
import { BiasAudit, CISFactorRow } from '@/lib/api'
import { AGENT_FACTORS, PEER_FACTORS, parseFactors } from '@/lib/cis'

const ALL_SCORES = [
  { key: 'CIS', label: 'CIS (Composite Score)', color: '#00a5e0', group: 'composite' },
  ...AGENT_FACTORS.map(f => ({ key: f.key, label: f.label, color: f.color, group: 'agent' })),
  ...PEER_FACTORS.map(f => ({ key: f.key, label: f.label, color: f.color, group: 'peer' })),
]

function computePercentiles(values: number[]): { p1_5: number; p98_5: number; mean: number; sd: number } {
  if (values.length < 5) return { p1_5: 0, p98_5: 100, mean: 0, sd: 0 }
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const p1_5 = sorted[Math.floor(n * 0.015)]   // Bottom 1.5% (3% two-tailed → 1.5% each side)
  const p98_5 = sorted[Math.ceil(n * 0.985) - 1] // Top 1.5%
  const mean = values.reduce((s, v) => s + v, 0) / n
  const sd = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / n)
  return { p1_5, p98_5, mean, sd }
}

interface HistBin {
  start: number
  count: number
  outlierLow: number
  outlierHigh: number
  normal: number
}

function buildHistogram(values: number[], p1_5: number, p98_5: number, binSize: number = 5): HistBin[] {
  const bins: Record<number, { count: number; outlierLow: number; outlierHigh: number }> = {}
  for (const v of values) {
    const b = Math.floor(v / binSize) * binSize
    if (!bins[b]) bins[b] = { count: 0, outlierLow: 0, outlierHigh: 0 }
    bins[b].count++
    if (v <= p1_5) bins[b].outlierLow++
    else if (v >= p98_5) bins[b].outlierHigh++
  }
  const allBins = Object.entries(bins)
    .map(([k, v]) => ({ start: +k, ...v, normal: v.count - v.outlierLow - v.outlierHigh }))
    .sort((a, b) => a.start - b.start)
  return allBins
}

function Histogram({ values, color, label, factorKey, onSelectOutlier, cisData }: {
  values: number[]; color: string; label: string; factorKey: string;
  onSelectOutlier?: (id: string) => void; cisData: CISFactorRow[]
}) {
  const [showOutliers, setShowOutliers] = useState(false)
  const stats = useMemo(() => computePercentiles(values), [values])
  const bins = useMemo(() => buildHistogram(values, stats.p1_5, stats.p98_5), [values, stats])
  const maxCount = Math.max(...bins.map(b => b.count), 1)
  const outlierCount = values.filter(v => v <= stats.p1_5 || v >= stats.p98_5).length

  // Find actual outlier comments
  const outlierComments = useMemo(() => {
    if (!showOutliers) return []
    return cisData.filter(row => {
      const v = factorKey === 'CIS' ? row.cis : ((parseFactors(row.factors)[factorKey as keyof ReturnType<typeof parseFactors>] || 0) * 100)
      return v <= stats.p1_5 || v >= stats.p98_5
    }).slice(0, 5)
  }, [showOutliers, cisData, factorKey, stats])

  return (
    <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[12px] font-bold" style={{ color }}>{factorKey}</span>
          <span className="text-[12px] font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
          <span>{'\u03BC'}={stats.mean.toFixed(1)}</span>
          <span>{'\u03C3'}={stats.sd.toFixed(1)}</span>
          <span>n={values.length}</span>
          {outlierCount > 0 && (
            <button onClick={() => setShowOutliers(!showOutliers)}
              className="rounded px-1.5 py-0.5 font-semibold"
              style={{ background: 'rgba(248,81,73,0.15)', color: '#f85149' }}>
              {outlierCount} outlier{outlierCount > 1 ? 's' : ''}
            </button>
          )}
        </div>
      </div>

      {/* Histogram bars */}
      <div className="flex items-end gap-[1px]" style={{ height: 80 }}>
        {bins.map(bin => {
          const h = (bin.count / maxCount) * 100
          const isLowTail = bin.start + 5 <= stats.p1_5
          const isHighTail = bin.start >= stats.p98_5
          return (
            <div key={bin.start} className="flex-1 flex flex-col justify-end" style={{ height: '100%' }}>
              {/* Stacked bar: normal + outliers */}
              <div className="rounded-t overflow-hidden" style={{ height: `${h}%`, minHeight: bin.count > 0 ? 2 : 0 }}>
                {bin.outlierHigh > 0 && (
                  <div style={{ height: `${(bin.outlierHigh / bin.count) * 100}%`, background: '#f85149', opacity: 0.9 }} />
                )}
                {bin.normal > 0 && (
                  <div style={{ height: `${(bin.normal / bin.count) * 100}%`, background: color, opacity: 0.6 }} />
                )}
                {bin.outlierLow > 0 && (
                  <div style={{ height: `${(bin.outlierLow / bin.count) * 100}%`, background: '#f85149', opacity: 0.9 }} />
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* X-axis with percentile markers */}
      <div className="relative h-4 mt-0.5">
        <div className="flex gap-[1px]">
          {bins.map(bin => (
            <div key={bin.start} className="flex-1 text-center font-mono text-[7px]" style={{ color: 'var(--text-muted)' }}>
              {bin.start % 10 === 0 ? bin.start : ''}
            </div>
          ))}
        </div>
        {/* Percentile markers */}
        {bins.length > 0 && (() => {
          const minVal = bins[0].start
          const maxVal = bins[bins.length - 1].start + 5
          const range = maxVal - minVal || 1
          const lowPct = ((stats.p1_5 - minVal) / range) * 100
          const highPct = ((stats.p98_5 - minVal) / range) * 100
          return (
            <>
              <div className="absolute top-0 h-3 w-px" style={{ left: `${lowPct}%`, background: '#f85149' }}>
                <span className="absolute -top-0.5 -translate-x-1/2 text-[7px] font-mono" style={{ color: '#f85149' }}>3%</span>
              </div>
              <div className="absolute top-0 h-3 w-px" style={{ left: `${highPct}%`, background: '#f85149' }}>
                <span className="absolute -top-0.5 -translate-x-1/2 text-[7px] font-mono" style={{ color: '#f85149' }}>97%</span>
              </div>
              {/* Mean marker */}
              <div className="absolute top-0 h-2 w-px" style={{ left: `${((stats.mean - minVal) / range) * 100}%`, background: color }}>
                <span className="absolute top-2 -translate-x-1/2 text-[7px] font-mono" style={{ color }}>{'\u03BC'}</span>
              </div>
            </>
          )
        })()}
      </div>

      {/* Outlier comments */}
      {showOutliers && outlierComments.length > 0 && (
        <div className="mt-3 space-y-1">
          <div className="text-[9px] font-mono font-bold" style={{ color: '#f85149' }}>OUTLIERS (outside 3% tails)</div>
          {outlierComments.map(o => (
            <button key={o.comment_id} onClick={() => onSelectOutlier?.(o.comment_id)}
              className="w-full text-left rounded-md p-2 transition-all hover:translate-x-0.5"
              style={{ background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.15)' }}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{o.comment_id.split('-').slice(-1)[0]}</span>
                <span className="font-mono text-[10px] font-bold" style={{ color: '#f85149' }}>CIS {o.cis}</span>
              </div>
              {o.excerpt && <p className="text-[10px] line-clamp-1 mt-0.5" style={{ color: 'var(--text-secondary)' }}>{o.excerpt}</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function BiasAuditPanel({ audit, cisData, onSelectComment }: {
  audit: BiasAudit; cisData: CISFactorRow[]; onSelectComment?: (id: string) => void
}) {
  const parsed = useMemo(() => cisData.map(row => ({
    ...row, f: parseFactors(row.factors),
  })), [cisData])

  // Extract value arrays for each score
  const scoreValues = useMemo(() => {
    const result: Record<string, number[]> = {}
    result['CIS'] = parsed.map(r => r.cis)
    for (const f of [...AGENT_FACTORS, ...PEER_FACTORS]) {
      result[f.key] = parsed.map(r => (r.f[f.key as keyof typeof r.f] || 0) * 100)
    }
    return result
  }, [parsed])

  const totalOutliers = useMemo(() => {
    let count = 0
    for (const [key, values] of Object.entries(scoreValues)) {
      const stats = computePercentiles(values)
      count += values.filter(v => v <= stats.p1_5 || v >= stats.p98_5).length
    }
    return count
  }, [scoreValues])

  if (cisData.length === 0) {
    return <div className="card p-8 text-center"><p style={{ color: 'var(--text-muted)' }}>No scored comments available.</p></div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="section-label">Bias Audit</div>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--text-primary)' }}>
          Score distributions for CIS and all 7 factors. Red regions mark the <strong>3% tails</strong> (1.5% each side) — comments with unusually high or low scores that may indicate scoring anomalies or genuinely exceptional submissions.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-surface)' }}>
            <div className="font-mono text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{cisData.length}</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Comments Scored</div>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-surface)' }}>
            <div className="font-mono text-xl font-bold" style={{ color: 'var(--amber)' }}>
              {(scoreValues['CIS']?.reduce((s, v) => s + v, 0) / (scoreValues['CIS']?.length || 1)).toFixed(1)}
            </div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Mean CIS</div>
          </div>
          <div className="rounded-lg p-3 text-center" style={{ background: 'var(--bg-surface)' }}>
            <div className="font-mono text-xl font-bold" style={{ color: totalOutliers > 0 ? '#f85149' : '#3fb950' }}>{totalOutliers}</div>
            <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Total Outliers (3% tails)</div>
          </div>
        </div>
      </div>

      {/* CIS Composite — large */}
      <div className="card p-6">
        <div className="section-label mb-3">Composite Score</div>
        <Histogram values={scoreValues['CIS'] || []} color="#00a5e0" label="Comment Impact Score" factorKey="CIS" onSelectOutlier={onSelectComment} cisData={cisData} />
      </div>

      {/* AI Agent Factors */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="section-label">AI Agent Factors</div>
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>60% of CIS</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {AGENT_FACTORS.map(f => (
            <Histogram key={f.key} values={scoreValues[f.key] || []} color={f.color} label={f.label} factorKey={f.key} onSelectOutlier={onSelectComment} cisData={cisData} />
          ))}
        </div>
      </div>

      {/* Peer-Based Factors */}
      <div className="card p-6">
        <div className="flex items-center gap-2 mb-3">
          <div className="section-label">Peer-Based Numerical Factors</div>
          <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>40% of CIS</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {PEER_FACTORS.map(f => (
            <Histogram key={f.key} values={scoreValues[f.key] || []} color={f.color} label={f.label} factorKey={f.key} onSelectOutlier={onSelectComment} cisData={cisData} />
          ))}
        </div>
      </div>

      {/* Methodology */}
      <div className="card p-5">
        <div className="section-label mb-2">Outlier Detection Method</div>
        <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>
          Outliers are comments in the <strong style={{ color: 'var(--text-secondary)' }}>3% tails</strong> of each score distribution — the bottom 1.5% and top 1.5% by percentile rank. This is a non-parametric method that makes no assumption about the shape of the distribution. For CIS with n=1,127, the tails capture approximately {Math.round(cisData.length * 0.03)} comments total. Click any red outlier badge to inspect the flagged comments.
        </p>
      </div>
    </div>
  )
}
