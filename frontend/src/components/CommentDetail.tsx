'use client'

import { useEffect, useState } from 'react'
import { api, CommentDetail as CommentDetailType } from '@/lib/api'
import { AGENT_FACTORS, PEER_FACTORS, parseFactors } from '@/lib/cis'

function FactorBar({ factorKey, label, weight, color, score }: {
  factorKey: string; label: string; weight: number; color: string; score: number
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 font-mono text-[11px] font-bold" style={{ color }}>{factorKey}</span>
      <span className="w-36 text-[11px]" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <div className="flex-1 h-3 rounded-full overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
        <div className="h-full rounded-full" style={{ width: `${score * 100}%`, background: color, opacity: 0.8 }} />
      </div>
      <span className="w-8 text-right font-mono text-[11px] font-semibold" style={{ color: 'var(--text-primary)' }}>{(score * 100).toFixed(0)}</span>
      <span className="w-10 text-right font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>w={weight}</span>
    </div>
  )
}

export default function CommentDetail({ commentId, onClose }: { commentId: string; onClose: () => void }) {
  const [data, setData] = useState<CommentDetailType | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    api.getCommentDetail(commentId).then(setData).catch(() => setData(null)).finally(() => setLoading(false))
  }, [commentId])

  const comment = data?.comment || {}
  const commenter = data?.commenter || {}

  const cisFactors = comment.cis_factors ? parseFactors(comment.cis_factors) : {} as Record<string, number>

  let cot: Record<string, any> = {}
  try { if (comment.chain_of_thought) cot = JSON.parse(comment.chain_of_thought) } catch {}

  // Compute sub-totals
  const agentScore = AGENT_FACTORS.reduce((s, f) => s + (cisFactors[f.key] || 0) * f.weight, 0)
  const peerScore = PEER_FACTORS.reduce((s, f) => s + (cisFactors[f.key] || 0) * f.weight, 0)

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={onClose} />
      <div className="w-full max-w-2xl overflow-y-auto animate-slide-in" style={{ background: 'var(--bg-raised)', borderLeft: '1px solid var(--border)' }}>
        <div className="sticky top-0 z-10 flex items-center justify-between px-6 py-4" style={{ background: 'var(--bg-raised)', borderBottom: '1px solid var(--border)' }}>
          <div className="section-label">Comment Card</div>
          <button onClick={onClose} className="rounded-lg w-8 h-8 flex items-center justify-center transition-colors" style={{ color: 'var(--text-muted)' }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="px-6 py-5">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--amber)' }} />
            </div>
          ) : !data ? (
            <p style={{ color: 'var(--accent-red)' }}>Failed to load comment.</p>
          ) : (
            <div className="space-y-5">
              {/* Header badges */}
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{comment.comment_id}</span>
                  {comment.primary_label && <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium label-${comment.primary_label}`}>{comment.primary_label}</span>}
                  {comment.impact_tier && <span className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-bold tier-${comment.impact_tier?.toLowerCase()}`}>CIS {comment.impact_score}</span>}
                  {comment.stance && (
                    <span className="rounded-md px-2 py-0.5 text-[11px] font-medium capitalize" style={{
                      background: comment.stance === 'support' ? 'rgba(63,185,80,0.15)' : comment.stance === 'oppose' ? 'rgba(248,81,73,0.15)' : 'rgba(245,158,11,0.15)',
                      color: comment.stance === 'support' ? '#3fb950' : comment.stance === 'oppose' ? '#f85149' : '#f59e0b',
                    }}>{comment.stance}</span>
                  )}
                  {comment.ai_category && (
                    <span className="rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ background: 'rgba(0,165,224,0.1)', color: 'var(--amber)', border: '1px solid rgba(0,165,224,0.2)' }}>
                      {comment.ai_category}
                    </span>
                  )}
                  {comment.needs_human_review && (
                    <span className="rounded-md px-2 py-0.5 text-[11px] font-medium" style={{ background: 'rgba(0,165,224,0.15)', color: 'var(--amber)' }}>Review</span>
                  )}
                </div>
                {comment.impact_score_ci_low != null && (
                  <p className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>90% CI: [{comment.impact_score_ci_low}, {comment.impact_score_ci_high}]</p>
                )}
              </div>

              {/* Commenter */}
              <div className="rounded-lg p-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                <div className="section-label mb-1.5">Commenter</div>
                <div className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                  {commenter.name || 'Anonymous'}{commenter.organization ? ` \u2014 ${commenter.organization}` : ''}
                </div>
                <div className="font-mono text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {commenter.commenter_type || 'unknown'}{commenter.city ? ` \u00B7 ${commenter.city}, ${commenter.state}` : ''}
                </div>
              </div>

              {/* Comment Text */}
              <div>
                <div className="section-label mb-2">Comment Text</div>
                <div className="rounded-lg p-4 text-[13px] leading-relaxed whitespace-pre-wrap max-h-48 overflow-y-auto" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
                  {comment.body || '(no text)'}
                </div>
              </div>

              {/* CIS Factor Breakdown — grouped */}
              {Object.keys(cisFactors).length > 0 && (
                <div>
                  <div className="section-label mb-3">Comment Impact Score Breakdown</div>

                  {/* AI Agent Assessment */}
                  <div className="rounded-lg p-4 mb-3" style={{ background: 'rgba(167,139,250,0.04)', border: '1px solid rgba(167,139,250,0.12)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[10px] font-bold" style={{ color: '#a78bfa' }}>AI AGENT ASSESSMENT</span>
                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Weight: 0.60 (60%) &middot; Subtotal: <span style={{ color: 'var(--text-primary)' }}>{(agentScore * 100).toFixed(1)}</span>
                      </span>
                    </div>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                      GPT-4o reads the comment, follows the CIS Agentic Pipeline, and scores these factors.
                    </p>
                    <div className="space-y-1.5">
                      {AGENT_FACTORS.map(f => (
                        <FactorBar key={f.key} factorKey={f.key} label={f.label} weight={f.weight} color={f.color} score={cisFactors[f.key] || 0} />
                      ))}
                    </div>
                  </div>

                  {/* Peer-Based Numerical */}
                  <div className="rounded-lg p-4" style={{ background: 'rgba(0,165,224,0.04)', border: '1px solid rgba(0,165,224,0.12)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--amber)' }}>PEER-BASED NUMERICAL</span>
                      <span className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Weight: 0.40 (40%) &middot; Subtotal: <span style={{ color: 'var(--text-primary)' }}>{(peerScore * 100).toFixed(1)}</span>
                      </span>
                    </div>
                    <p className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>
                      Computed from corpus statistics (embeddings, clusters). No AI judgment. Deterministic.
                    </p>
                    <div className="space-y-1.5">
                      {PEER_FACTORS.map(f => (
                        <FactorBar key={f.key} factorKey={f.key} label={f.label} weight={f.weight} color={f.color} score={cisFactors[f.key] || 0} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* AI Category Scores */}
              {comment.ai_category && (
                <div className="rounded-lg p-4" style={{ background: 'rgba(0,165,224,0.04)', border: '1px solid rgba(0,165,224,0.12)' }}>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] font-bold" style={{ color: 'var(--amber)' }}>AI CATEGORY</span>
                    <span className="text-[12px] font-semibold" style={{ color: 'var(--text-primary)' }}>{comment.ai_category}</span>
                  </div>
                  <div className="flex gap-6">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Support</span>
                      <div className="flex gap-[2px]">
                        {[1,2,3,4,5,6,7,8,9,10].map(i => (
                          <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{
                            background: i <= (comment.ai_support || 0)
                              ? ((comment.ai_support || 0) >= 7 ? '#3fb950' : (comment.ai_support || 0) >= 4 ? '#f59e0b' : '#f85149')
                              : 'var(--bg-hover)',
                            opacity: i <= (comment.ai_support || 0) ? 0.9 : 0.3,
                          }} />
                        ))}
                      </div>
                      <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{comment.ai_support || '—'}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Credibility</span>
                      <div className="flex gap-[2px]">
                        {[1,2,3,4,5,6,7,8,9,10].map(i => (
                          <div key={i} className="w-2.5 h-2.5 rounded-sm" style={{
                            background: i <= (comment.ai_credibility || 0) ? 'var(--amber)' : 'var(--bg-hover)',
                            opacity: i <= (comment.ai_credibility || 0) ? 0.9 : 0.3,
                          }} />
                        ))}
                      </div>
                      <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--text-primary)' }}>{comment.ai_credibility || '—'}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* CIS Agentic Pipeline Reasoning */}
              {Object.keys(cot).length > 0 && (
                <div>
                  <div className="section-label mb-2">CIS Agentic Pipeline Reasoning</div>
                  <div className="space-y-2 rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                    {Object.entries(cot).map(([step, value]) => (
                      <div key={step}>
                        <span className="font-mono text-[10px] font-semibold" style={{ color: 'var(--amber-dim)' }}>
                          {step.replace(/_/g, ' ').toUpperCase()}
                        </span>
                        <p className="text-[12px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                          {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Themes */}
              {data.themes?.length > 0 && (
                <div>
                  <div className="section-label mb-2">Themes</div>
                  <div className="flex flex-wrap gap-2">
                    {data.themes.map(t => (
                      <span key={t.theme_id} className="rounded-md px-2.5 py-1 text-[11px]" style={{ background: 'rgba(0,165,224,0.1)', color: 'var(--amber)', border: '1px solid rgba(0,165,224,0.2)' }}>
                        {t.label} &middot; {(t.probability * 100).toFixed(0)}%
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Legal Citations */}
              {data.legal_citations?.length > 0 && (
                <div>
                  <div className="section-label mb-2">Legal Citations</div>
                  {data.legal_citations.map((lc, i) => (
                    <div key={i} className="rounded-lg p-3 mb-1.5" style={{ background: 'rgba(167,139,250,0.06)', borderLeft: '2px solid rgba(167,139,250,0.4)' }}>
                      <span className="font-mono text-[12px] font-semibold" style={{ color: '#a78bfa' }}>{lc.citation}</span>
                      <span className="ml-2 text-[11px]" style={{ color: 'var(--text-muted)' }}>({lc.type})</span>
                      {lc.context && <p className="mt-1 text-[12px] italic" style={{ color: 'var(--text-muted)' }}>{lc.context}</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* Economic Claims */}
              {data.economic_claims?.length > 0 && (
                <div>
                  <div className="section-label mb-2">Economic Claims</div>
                  {data.economic_claims.map((ec, i) => (
                    <div key={i} className="rounded-lg p-3 mb-1.5" style={{ background: 'rgba(63,185,80,0.06)', borderLeft: '2px solid rgba(63,185,80,0.4)' }}>
                      <span className="text-[12px]" style={{ color: '#3fb950' }}>{ec.claim}</span>
                      {ec.amount && <span className="ml-2 font-mono font-bold text-[12px]" style={{ color: '#3fb950' }}>{ec.amount}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* Footer */}
              <div className="pt-3 text-[10px]" style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}>
                AI Agent (L, E, R, C) = 60% of CIS &middot; Peer Numerical (N, T, V) = 40% &middot; All outputs subject to human review
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
