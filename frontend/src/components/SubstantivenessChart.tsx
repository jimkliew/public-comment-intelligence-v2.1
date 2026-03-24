'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'

const COLORS: Record<string, string> = {
  legal: '#a78bfa',
  policy: '#58a6ff',
  economic: '#3fb950',
  technical: '#39d2c0',
  anecdotal: '#f59e0b',
}

const LABELS: Record<string, string> = {
  legal: 'Legal Argument',
  policy: 'Policy Critique',
  economic: 'Economic Impact',
  technical: 'Technical/Scientific',
  anecdotal: 'Personal Experience',
}

export default function SubstantivenessChart({ data }: { data: { label: string; count: number }[] }) {
  // Filter out non_substantive — only show substantive categories
  const substantiveOnly = data.filter(d => d.label !== 'non_substantive')
  const nonSubCount = data.find(d => d.label === 'non_substantive')?.count || 0
  const total = substantiveOnly.reduce((s, d) => s + d.count, 0)

  const chartData = substantiveOnly.map(d => ({
    name: LABELS[d.label] || d.label,
    value: d.count,
    color: COLORS[d.label] || '#6e7681',
    pct: total > 0 ? Math.round((d.count / total) * 100) : 0,
  }))

  return (
    <div className="card p-6">
      <div className="section-label">Substantive Comment Breakdown</div>
      <p className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Each comment is classified using a{' '}
        <strong style={{ color: 'var(--text-primary)' }}>CIS Agentic Pipeline</strong>{' '}
        procedure (GPT-4o). The system evaluates HOW arguments are made, not WHAT position is taken.
        See the <span style={{ color: 'var(--amber)' }}>Details &rarr; Classification Rubric</span> for the full methodology.
      </p>
      <div className="mt-4 flex items-center gap-6">
        <div className="w-[180px] h-[180px] flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
                strokeWidth={0}
              >
                {chartData.map((entry, i) => (
                  <Cell key={i} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: 'var(--bg-surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '8px',
                  fontSize: '12px',
                  fontFamily: 'JetBrains Mono',
                }}
                itemStyle={{ color: 'var(--text-primary)' }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex-1 space-y-2">
          {chartData.map((d) => (
            <div key={d.name} className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
              <span className="flex-1 text-[13px]" style={{ color: 'var(--text-secondary)' }}>{d.name}</span>
              <span className="font-mono text-[13px] font-semibold" style={{ color: 'var(--text-primary)' }}>{d.value}</span>
              <span className="font-mono text-[11px] w-10 text-right" style={{ color: 'var(--text-muted)' }}>{d.pct}%</span>
            </div>
          ))}
          {nonSubCount > 0 && (
            <div className="pt-2 mt-2" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                {nonSubCount} non-substantive comments excluded (form letters, general opinions without specifics)
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
