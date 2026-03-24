'use client'

import { ReviewItem } from '@/lib/api'

const PRIORITY_STYLES: Record<number, { label: string; color: string; icon: string }> = {
  1: { label: 'Novel Argument', color: '#f85149', icon: 'M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z' },
  2: { label: 'Low Confidence', color: '#f59e0b', icon: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z' },
  3: { label: 'High Impact', color: '#f97316', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  4: { label: 'Inconsistency', color: '#6b7280', icon: 'M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
}

export default function ReviewQueue({ items, onSelectComment }: {
  items: ReviewItem[]
  onSelectComment?: (id: string) => void
}) {
  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="section-label">Human Review Queue</div>
        <p className="mt-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
          Priority-ordered for analyst review. All AI outputs are recommendations &mdash; human reviewers make final determinations.
        </p>

        <div className="mt-4 flex gap-5">
          {Object.entries(PRIORITY_STYLES).map(([p, { label, color }]) => (
            <span key={p} className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              P{p} {label}
            </span>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No items currently in the review queue.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item, i) => {
            const pri = PRIORITY_STYLES[item.priority] || PRIORITY_STYLES[4]
            return (
              <div
                key={item.comment_id}
                onClick={() => onSelectComment?.(item.comment_id)}
                className="card cursor-pointer p-4 transition-all hover:translate-x-1 animate-fade-up"
                style={{ animationDelay: `${i * 0.04}s`, borderLeftColor: pri.color, borderLeftWidth: 3 }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke={pri.color} strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={pri.icon} />
                    </svg>
                    <span className="text-[12px] font-semibold" style={{ color: pri.color }}>{pri.label}</span>
                    <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{item.comment_id}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {item.label && <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium label-${item.label}`}>{item.label}</span>}
                    {item.impact_score != null && (
                      <span className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold tier-${(item.tier || '').toLowerCase()}`}>
                        {item.impact_score}
                      </span>
                    )}
                    <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                      {((item.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-[13px] line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                  {item.excerpt || '(no text)'}
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
