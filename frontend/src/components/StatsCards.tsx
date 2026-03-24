'use client'

import { DocketStats } from '@/lib/api'

function Card({ label, value, sub, accent, delay }: {
  label: string; value: string | number; sub?: string; accent?: boolean; delay: number
}) {
  return (
    <div
      className={`card p-5 animate-fade-up ${accent ? 'card-amber' : ''}`}
      style={{ animationDelay: `${delay * 0.06}s` }}
    >
      <div className="section-label">{label}</div>
      <div className="mt-2 font-mono text-3xl font-bold" style={{ color: accent ? 'var(--amber)' : 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-[12px]" style={{ color: 'var(--text-muted)' }}>{sub}</div>}
    </div>
  )
}

export default function StatsCards({ stats }: { stats: DocketStats }) {
  const uniqueComments = (stats.total || 0) - (stats.duplicates || 0)
  const substantiveCount = (stats.substantiveness || [])
    .filter(s => s.label !== 'non_substantive')
    .reduce((sum, s) => sum + s.count, 0)
  const totalClassified = (stats.substantiveness || []).reduce((sum, s) => sum + s.count, 0)
  const substantivePct = totalClassified > 0 ? Math.round((substantiveCount / totalClassified) * 100) : 0

  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
      <Card delay={1} label="Total Comments" value={(stats.total || 0).toLocaleString()} />
      <Card delay={2} label="Unique" value={uniqueComments.toLocaleString()} sub={`${stats.duplicates || 0} duplicates removed`} />
      <Card delay={3} label="Themes" value={stats.theme_count || 0} />
      <Card delay={4} label="Campaigns" value={stats.campaign_count || 0} sub={`${(stats.campaign_comments || 0).toLocaleString()} affiliated`} />
      <Card delay={5} accent label="Substantive" value={`${substantivePct}%`} sub={`${substantiveCount} of ${totalClassified}`} />
      <Card delay={6} label="Needs Review" value={stats.needs_review || 0} sub="Flagged for analyst" />
    </div>
  )
}
