'use client'

const TIER_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Moderate: '#eab308',
  Low: '#22c55e',
  Minimal: '#6b7280',
}

const TIER_DESCRIPTIONS: Record<string, string> = {
  Critical: 'Requires direct response in final rule',
  High: 'Likely requires response; significant issues',
  Moderate: 'Contains substantive elements; should be reviewed',
  Low: 'Limited substance; address in aggregate',
  Minimal: 'Non-substantive; acknowledge in bulk',
}

const TIER_ORDER = ['Critical', 'High', 'Moderate', 'Low', 'Minimal']

export default function ImpactTierChart({ data }: { data: { tier: string; count: number }[] }) {
  const maxCount = Math.max(...data.map(d => d.count), 1)

  const sorted = TIER_ORDER.map(tier => {
    const found = data.find(d => d.tier === tier)
    return { tier, count: found?.count || 0 }
  })

  const total = sorted.reduce((s, d) => s + d.count, 0)

  return (
    <div className="card p-6">
      <div className="section-label">Comment Impact Score Distribution</div>
      <p className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        7-factor transparent scoring: Volume, Legal, Economic, Thematic, Novelty, Regulatory, Credibility
      </p>
      <div className="mt-5 space-y-3">
        {sorted.map((d) => {
          const pct = total > 0 ? (d.count / total) * 100 : 0
          const barWidth = maxCount > 0 ? (d.count / maxCount) * 100 : 0
          return (
            <div key={d.tier} className="group">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: TIER_COLORS[d.tier] }} />
                  <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>{d.tier}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{d.count}</span>
                  <span className="font-mono text-[11px] w-10 text-right" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
                </div>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
                <div
                  className="h-full rounded-full transition-all duration-700 ease-out"
                  style={{
                    width: `${barWidth}%`,
                    background: `linear-gradient(90deg, ${TIER_COLORS[d.tier]}cc, ${TIER_COLORS[d.tier]})`,
                  }}
                />
              </div>
              <p className="mt-0.5 text-[11px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-muted)' }}>
                {TIER_DESCRIPTIONS[d.tier]}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
