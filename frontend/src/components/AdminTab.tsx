'use client'

import { useEffect, useState } from 'react'
import { api, AdminStatus } from '@/lib/api'

export default function AdminTab() {
  const [status, setStatus] = useState<AdminStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)

  function refresh() {
    setLoading(true)
    api.getAdminStatus().then(setStatus).catch(() => {}).finally(() => setLoading(false))
  }

  useEffect(() => {
    refresh()
    if (!autoRefresh) return
    const interval = setInterval(refresh, 5000) // Refresh every 5s
    return () => clearInterval(interval)
  }, [autoRefresh])

  if (loading && !status) {
    return <div className="card p-8 text-center"><p className="text-sm" style={{ color: 'var(--text-muted)' }}>Loading system status...</p></div>
  }

  if (!status) {
    return <div className="card p-8 text-center"><p className="text-sm" style={{ color: 'var(--accent-red)' }}>Failed to load admin status. Is the backend running?</p></div>
  }

  const totalNodes = Object.values(status.node_counts).reduce((s, n) => s + n, 0)
  const totalEdges = Object.values(status.edge_counts).reduce((s, n) => s + n, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="section-label">System Administration</div>
            <p className="mt-2 text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              Pipeline status, data counts, model configuration, and system health.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className="rounded-md px-3 py-1.5 text-[11px] font-mono font-medium"
              style={{
                background: autoRefresh ? 'rgba(63,185,80,0.1)' : 'var(--bg-surface)',
                color: autoRefresh ? '#3fb950' : 'var(--text-muted)',
                border: `1px solid ${autoRefresh ? 'rgba(63,185,80,0.3)' : 'var(--border)'}`,
              }}
            >
              {autoRefresh ? 'LIVE (5s)' : 'PAUSED'}
            </button>
            <button onClick={refresh} className="rounded-md px-3 py-1.5 text-[11px] font-medium" style={{ background: 'var(--bg-surface)', color: 'var(--amber)', border: '1px solid var(--border)' }}>
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Docket Pipeline Status */}
      <div className="card p-6">
        <div className="section-label mb-4">Data Pipeline Status</div>
        {status.dockets.length === 0 ? (
          <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>No dockets ingested yet.</p>
        ) : (
          <div className="space-y-4">
            {status.dockets.map(d => {
              const pctClassified = d.total_comments > 0 ? Math.round((d.classified / d.total_comments) * 100) : 0
              const pctScored = d.total_comments > 0 ? Math.round((d.scored / d.total_comments) * 100) : 0
              const uniqueWithBody = d.after_dedup - d.stubs

              return (
                <div key={d.docket_id} className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="font-mono text-[12px] font-bold" style={{ color: 'var(--amber)' }}>{d.docket_id}</span>
                      <p className="text-[11px] mt-0.5 truncate max-w-lg" style={{ color: 'var(--text-muted)' }}>{d.title}</p>
                    </div>
                  </div>

                  {/* Funnel visualization */}
                  <div className="space-y-2">
                    {[
                      { label: 'Downloaded', value: d.total_comments, color: 'var(--text-primary)', desc: 'Total comments fetched from Regulations.gov API' },
                      { label: 'After Dedup', value: d.after_dedup, color: 'var(--amber)', desc: `${d.duplicates} exact duplicates removed (SHA-256 hash match)` },
                      { label: 'With Body Text', value: uniqueWithBody, color: '#3fb950', desc: `${d.stubs} stub comments excluded ("See Attached" with no extractable text)` },
                      { label: 'Classified', value: d.classified, color: '#a78bfa', desc: `Processed through CIS Agentic Pipeline (GPT-4o)` },
                      { label: 'Scored', value: d.scored, color: '#00a5e0', desc: `CIS computed with all 7 factors` },
                    ].map((step, i) => {
                      const maxW = d.total_comments || 1
                      const w = (step.value / maxW) * 100
                      return (
                        <div key={step.label}>
                          <div className="flex items-center gap-3">
                            <span className="w-28 text-[11px] font-mono" style={{ color: 'var(--text-muted)' }}>{step.label}</span>
                            <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: 'var(--bg-hover)' }}>
                              <div className="h-full rounded transition-all duration-500" style={{ width: `${w}%`, background: step.color, opacity: 0.6 }} />
                            </div>
                            <span className="font-mono text-[12px] font-bold w-14 text-right" style={{ color: step.color }}>{step.value.toLocaleString()}</span>
                          </div>
                          <p className="ml-[7.5rem] text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{step.desc}</p>
                        </div>
                      )
                    })}
                  </div>

                  {/* Progress indicators */}
                  <div className="mt-3 flex gap-4 text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                    <span>Classification: <span style={{ color: pctClassified > 50 ? '#3fb950' : 'var(--text-primary)' }}>{pctClassified}%</span></span>
                    <span>Scoring: <span style={{ color: pctScored > 50 ? '#3fb950' : 'var(--text-primary)' }}>{pctScored}%</span></span>
                    <span>Remaining to classify: <span style={{ color: 'var(--text-primary)' }}>{Math.max(0, uniqueWithBody - d.classified).toLocaleString()}</span></span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Neo4j Graph Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card p-6">
          <div className="section-label mb-3">Knowledge Graph — Nodes</div>
          <div className="text-right font-mono text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            Total: <span style={{ color: 'var(--text-primary)' }}>{totalNodes.toLocaleString()}</span>
          </div>
          <div className="space-y-1.5">
            {Object.entries(status.node_counts).map(([type, count]) => {
              const w = totalNodes > 0 ? (count / totalNodes) * 100 : 0
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-32 text-[11px] font-mono" style={{ color: 'var(--text-secondary)' }}>{type}</span>
                  <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
                    <div className="h-full rounded" style={{ width: `${Math.max(w, 1)}%`, background: 'rgba(0,165,224,0.5)' }} />
                  </div>
                  <span className="font-mono text-[11px] w-12 text-right" style={{ color: 'var(--text-primary)' }}>{count.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>

        <div className="card p-6">
          <div className="section-label mb-3">Knowledge Graph — Edges</div>
          <div className="text-right font-mono text-sm mb-3" style={{ color: 'var(--text-muted)' }}>
            Total: <span style={{ color: 'var(--text-primary)' }}>{totalEdges.toLocaleString()}</span>
          </div>
          <div className="space-y-1.5">
            {Object.entries(status.edge_counts).map(([type, count]) => {
              const w = totalEdges > 0 ? (count / totalEdges) * 100 : 0
              return (
                <div key={type} className="flex items-center gap-2">
                  <span className="w-40 text-[11px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{type}</span>
                  <div className="flex-1 h-3 rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
                    <div className="h-full rounded" style={{ width: `${Math.max(w, 1)}%`, background: 'rgba(167,139,250,0.5)' }} />
                  </div>
                  <span className="font-mono text-[11px] w-12 text-right" style={{ color: 'var(--text-primary)' }}>{count.toLocaleString()}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="card p-6">
        <div className="section-label mb-3">System Configuration</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {Object.entries(status.config).map(([key, value]) => (
            <div key={key} className="rounded-lg p-3" style={{ background: 'var(--bg-surface)' }}>
              <div className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>{key}</div>
              <div className="font-mono text-[12px] font-semibold mt-1" style={{
                color: typeof value === 'boolean'
                  ? (value ? '#3fb950' : 'var(--accent-red)')
                  : 'var(--text-primary)'
              }}>
                {typeof value === 'boolean' ? (value ? 'YES' : 'NO') : String(value)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
