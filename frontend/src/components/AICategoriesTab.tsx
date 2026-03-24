'use client'

import { useEffect, useState } from 'react'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

const CAT_COLORS = ['#00a5e0', '#a78bfa', '#3fb950', '#f59e0b', '#ec4899']

interface AICat {
  name: string
  emoji: string
  description: string
  count: number
  avg_support: number
  avg_credibility: number
  min_support: number
  max_support: number
}

function ScoreDot({ value, label, color }: { value: number; label: string; color: string }) {
  // 1-10 scale rendered as a horizontal gauge
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] w-16" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex gap-[2px]">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(i => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{
            background: i <= Math.round(value) ? color : 'var(--bg-hover)',
            opacity: i <= Math.round(value) ? 0.9 : 0.3,
          }} />
        ))}
      </div>
      <span className="font-mono text-[11px] font-bold w-6" style={{ color }}>{value.toFixed(1)}</span>
    </div>
  )
}

export default function AICategoriesTab({ docketId }: { docketId: string }) {
  const [categories, setCategories] = useState<AICat[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  useEffect(() => { fetchCategories() }, [docketId])

  async function fetchCategories() {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/dockets/${docketId}/ai-categories`)
      setCategories(await res.json())
    } catch {}
    setLoading(false)
  }

  async function generate() {
    setGenerating(true)
    try {
      await (await fetch(`${API_URL}/api/dockets/${docketId}/run-ai-categories`, { method: 'POST' })).json()
      await fetchCategories()
    } catch {}
    setGenerating(false)
  }

  const total = categories.reduce((s, c) => s + (c.count || 0), 0)

  if (loading) return <div className="card p-8 text-center"><p style={{ color: 'var(--text-muted)' }}>Loading...</p></div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="section-label">AI Categories</div>
            <p className="mt-2 text-[13px]" style={{ color: 'var(--text-primary)' }}>
              GPT-4o reads every comment and assigns it to one of 5 categories, then scores it on <strong>Support</strong> (does the commenter support the rule?) and <strong>Credibility</strong> (how well-supported is their argument?).
            </p>
          </div>
          <button onClick={generate} disabled={generating}
            className="rounded-md px-4 py-2 text-[12px] font-medium flex-shrink-0 ml-4"
            style={{ background: generating ? 'var(--bg-surface)' : 'var(--amber-glow)', color: generating ? 'var(--text-muted)' : 'var(--amber)', border: `1px solid ${generating ? 'var(--border)' : 'rgba(0,165,224,0.3)'}` }}>
            {generating ? 'Generating...' : categories.length > 0 ? 'Regenerate' : 'Generate'}
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="text-[15px] font-medium" style={{ color: 'var(--text-primary)' }}>No AI categories yet</p>
          <p className="text-[13px] mt-2" style={{ color: 'var(--text-muted)' }}>Click Generate to have GPT-4o analyze all comments.</p>
        </div>
      ) : (
        <>
          {/* Category cards — the main view */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {categories.map((cat, i) => {
              const color = CAT_COLORS[i % CAT_COLORS.length]
              const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0
              const supportLabel = cat.avg_support >= 7 ? 'Supportive' : cat.avg_support >= 4 ? 'Mixed' : 'Opposing'
              const supportColor = cat.avg_support >= 7 ? '#3fb950' : cat.avg_support >= 4 ? '#f59e0b' : '#f85149'

              return (
                <div key={cat.name} className="card overflow-hidden" style={{ borderTop: `3px solid ${color}` }}>
                  {/* Header */}
                  <div className="p-4 pb-3">
                    <div className="text-2xl mb-1">{cat.emoji}</div>
                    <h3 className="text-[14px] font-semibold" style={{ color: 'var(--text-primary)' }}>{cat.name}</h3>
                    <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{cat.description}</p>
                  </div>

                  {/* Count */}
                  <div className="px-4 py-2" style={{ background: 'var(--bg-surface)' }}>
                    <div className="flex items-baseline gap-1">
                      <span className="font-mono text-2xl font-bold" style={{ color }}>{cat.count}</span>
                      <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>comments</span>
                      <span className="font-mono text-[11px] ml-auto" style={{ color: 'var(--text-muted)' }}>{pct}%</span>
                    </div>
                    {/* Mini bar */}
                    <div className="h-1.5 rounded-full mt-1.5 overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>

                  {/* Scores */}
                  <div className="p-4 pt-3 space-y-2">
                    <ScoreDot value={cat.avg_support} label="Support" color={supportColor} />
                    <ScoreDot value={cat.avg_credibility} label="Credibility" color={color} />
                  </div>

                  {/* Stance summary */}
                  <div className="px-4 pb-3">
                    <span className="rounded-md px-2 py-0.5 text-[10px] font-semibold" style={{ background: `${supportColor}15`, color: supportColor }}>
                      {supportLabel}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Cross-category comparison */}
          <div className="card p-6">
            <div className="section-label mb-4">Cross-Category Comparison</div>

            {/* Support vs Credibility scatter-like view */}
            <div className="relative rounded-lg p-6" style={{ background: 'var(--bg-surface)', height: 300 }}>
              {/* Grid lines */}
              <div className="absolute inset-6">
                {/* Y axis label */}
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 -rotate-90 text-[10px] font-mono" style={{ color: 'var(--text-muted)', transformOrigin: 'center' }}>
                  Credibility &rarr;
                </div>
                {/* X axis label */}
                <div className="absolute bottom-[-18px] left-1/2 -translate-x-1/2 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                  Opposes &larr; Support &rarr; Supports
                </div>
                {/* Center lines */}
                <div className="absolute left-1/2 top-0 bottom-0 w-px" style={{ background: 'var(--border)' }} />
                <div className="absolute top-1/2 left-0 right-0 h-px" style={{ background: 'var(--border)' }} />

                {/* Quadrant labels */}
                <div className="absolute top-1 left-1 text-[9px] font-mono" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Credible Opposition</div>
                <div className="absolute top-1 right-1 text-[9px] font-mono text-right" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Credible Support</div>
                <div className="absolute bottom-1 left-1 text-[9px] font-mono" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Low-Cred Opposition</div>
                <div className="absolute bottom-1 right-1 text-[9px] font-mono text-right" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>Low-Cred Support</div>

                {/* Category bubbles */}
                {categories.map((cat, i) => {
                  const color = CAT_COLORS[i % CAT_COLORS.length]
                  // Map support 1-10 to x 0-100%, credibility 1-10 to y (inverted) 0-100%
                  const x = ((cat.avg_support - 1) / 9) * 100
                  const y = (1 - (cat.avg_credibility - 1) / 9) * 100
                  const size = Math.max(40, Math.sqrt(cat.count) * 4)

                  return (
                    <div key={cat.name} className="absolute flex flex-col items-center" style={{
                      left: `${x}%`, top: `${y}%`,
                      transform: 'translate(-50%, -50%)',
                    }}>
                      <div className="rounded-full flex items-center justify-center transition-all hover:scale-110" style={{
                        width: size, height: size,
                        background: `radial-gradient(circle at 35% 35%, ${color}50, ${color}20)`,
                        border: `2px solid ${color}80`,
                        boxShadow: `0 0 20px ${color}30`,
                      }}>
                        <span className="text-lg">{cat.emoji}</span>
                      </div>
                      <span className="mt-1 text-[10px] font-medium text-center whitespace-nowrap" style={{ color: 'var(--text-primary)' }}>
                        {cat.name}
                      </span>
                      <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>{cat.count}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <p className="mt-3 text-[11px] text-center" style={{ color: 'var(--text-muted)' }}>
              Bubble position = avg support &times; avg credibility. Size = comment count. Upper-right = credible supporters. Lower-left = low-credibility opposition.
            </p>
          </div>

          {/* How it works */}
          <div className="card p-5">
            <div className="section-label mb-2">How This Works</div>
            <div className="grid grid-cols-3 gap-4 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-surface)' }}>
                <div className="font-mono text-[10px] font-bold mb-1" style={{ color: 'var(--amber)' }}>1. CATEGORIZE</div>
                <p>GPT-4o reads 200 comments and proposes 5 categories. Then GPT-4o-mini assigns every comment to one.</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-surface)' }}>
                <div className="font-mono text-[10px] font-bold mb-1" style={{ color: 'var(--amber)' }}>2. SCORE</div>
                <p><strong style={{ color: 'var(--text-secondary)' }}>Support (1-10):</strong> Does the commenter support or oppose the rule? <strong style={{ color: 'var(--text-secondary)' }}>Credibility (1-10):</strong> How well-supported is their argument?</p>
              </div>
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-surface)' }}>
                <div className="font-mono text-[10px] font-bold mb-1" style={{ color: 'var(--amber)' }}>3. COMPARE</div>
                <p>The bubble chart plots categories by their average support vs credibility. Top-right = credible supporters. Bottom-left = weak opposition.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
