'use client'

import { useEffect, useState, useMemo } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts'
import { Campaign, TimelineDay, api } from '@/lib/api'

export default function CampaignList({ campaigns, docketId }: { campaigns: Campaign[]; docketId?: string }) {
  const [timeline, setTimeline] = useState<TimelineDay[]>([])

  useEffect(() => {
    if (docketId) api.getTimeline(docketId).then(setTimeline).catch(() => setTimeline([]))
  }, [docketId])

  const chartData = useMemo(() => {
    let cumAll = 0
    let cumDeduped = 0
    let cumUnique = 0
    return timeline.map(day => {
      cumAll += day.total
      cumDeduped += Math.max(0, day.total - day.exact_dupes)
      cumUnique += Math.max(0, day.total - day.exact_dupes - day.near_dupes)
      return {
        date: day.date,
        all: cumAll,
        deduped: cumDeduped,
        unique: Math.max(cumUnique, 0),
      }
    })
  }, [timeline])

  const last = chartData.length > 0 ? chartData[chartData.length - 1] : { all: 0, deduped: 0, unique: 0 }

  return (
    <div className="space-y-6">
      {chartData.length > 1 && (
        <div className="card p-6">
          <div className="section-label">Cumulative Comments Over Time</div>
          <p className="mt-2 mb-4 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Three views of the comment volume: all received, after removing exact duplicates, and after removing highly similar comments.
          </p>

          {/* Legend stats */}
          <div className="flex gap-6 mb-4">
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 rounded" style={{ background: '#00a5e0' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>All Comments</span>
              <span className="font-mono text-[11px] font-bold" style={{ color: '#00a5e0' }}>{last.all.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 rounded" style={{ background: '#3fb950' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>After Dedup</span>
              <span className="font-mono text-[11px] font-bold" style={{ color: '#3fb950' }}>{last.deduped.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-1 rounded" style={{ background: '#f59e0b' }} />
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>After Similar Removed</span>
              <span className="font-mono text-[11px] font-bold" style={{ color: '#f59e0b' }}>{last.unique.toLocaleString()}</span>
            </div>
          </div>

          <div className="rounded-lg" style={{ background: 'var(--bg-surface)' }}>
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, bottom: 5, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a3344" />
                <XAxis dataKey="date" stroke="#6e7681" fontSize={10}
                  tickFormatter={(d: string) => { const p = d.split('-'); return `${p[1]}/${p[2]}` }}
                />
                <YAxis stroke="#6e7681" fontSize={10} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-raised)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11, fontFamily: 'JetBrains Mono' }}
                  itemStyle={{ color: 'var(--text-primary)' }}
                  labelFormatter={(d: string) => d}
                />
                <Area type="monotone" dataKey="all" name="All Comments" stroke="#00a5e0" fill="rgba(0,165,224,0.10)" strokeWidth={2} />
                <Area type="monotone" dataKey="deduped" name="After Dedup" stroke="#3fb950" fill="rgba(63,185,80,0.10)" strokeWidth={2} />
                <Area type="monotone" dataKey="unique" name="After Similar Removed" stroke="#f59e0b" fill="rgba(245,158,11,0.10)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Definition */}
      <div className="card p-5">
        <div className="section-label mb-2">Highly Similar Comments: Definition</div>
        <div className="text-[12px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
          <p>Two comments are &ldquo;highly similar&rdquo; if their <strong style={{ color: 'var(--text-primary)' }}>cosine similarity &ge; 0.92</strong> (on a 0&ndash;1 scale where 1.0 = identical meaning).</p>
          <p className="mt-2">The computation:</p>
          <ol className="mt-1 ml-4 space-y-1 list-decimal">
            <li>Each comment is converted to a 384-dimensional vector using the <span className="font-mono text-[11px]" style={{ color: 'var(--amber)' }}>all-MiniLM-L6-v2</span> sentence-transformer model.</li>
            <li>Vectors are L2-normalized so cosine similarity equals the dot product.</li>
            <li>Every pair of comments is compared. If <span className="font-mono" style={{ color: 'var(--text-primary)' }}>cos(a, b) &ge; 0.92</span>, they are flagged as near-duplicates.</li>
            <li>Connected groups of near-duplicates form campaigns (e.g., 50+ similar comments = Organized Campaign).</li>
          </ol>
          <p className="mt-2">The 0.92 threshold was chosen empirically &mdash; it catches template letters with minor word substitutions (name, city) while preserving comments that discuss the same topic but make distinct arguments.</p>
        </div>
      </div>
    </div>
  )
}
