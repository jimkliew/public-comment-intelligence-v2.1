'use client'

import { useEffect, useState, useCallback } from 'react'
import { api, DocketSummary, DocketDetail, DocketStats, Theme, Campaign, ReviewItem, BiasAudit, GraphData, CISFactorRow, TopicMapData, SankeyFlow } from '@/lib/api'
import StatsCards from '@/components/StatsCards'
import SubstantivenessChart from '@/components/SubstantivenessChart'
import ImpactTierChart from '@/components/ImpactTierChart'
import ThemeHeatmap from '@/components/ThemeHeatmap'
import CampaignList from '@/components/CampaignList'
import ReviewQueue from '@/components/ReviewQueue'
import BiasAuditPanel from '@/components/BiasAuditPanel'
import KnowledgeGraph from '@/components/KnowledgeGraph'
import CommentDetail from '@/components/CommentDetail'
import DetailsTab from '@/components/DetailsTab'
import CISCorrelationTab from '@/components/CISCorrelationTab'
import TopicMap from '@/components/TopicMap'
import AdminTab from '@/components/AdminTab'
import SankeyChart from '@/components/SankeyChart'
import AICategoriesTab from '@/components/AICategoriesTab'

const DEFAULT_DOCKET = 'EPA-HQ-OW-2022-0114'

type Tab = 'overview' | 'themes' | 'ai-cats' | 'campaigns' | 'bias' | 'graph' | 'cis-corr' | 'details' | 'admin'

const TAB_ICONS: Record<Tab, string> = {
  overview: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4',
  themes: 'M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01',
  campaigns: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z',
  bias: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
  graph: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  'ai-cats': 'M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z',
  'cis-corr': 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z',
  details: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253',
  admin: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z',
}

export default function Dashboard() {
  const [docketId, setDocketId] = useState(DEFAULT_DOCKET)
  const [allDockets, setAllDockets] = useState<DocketSummary[]>([])
  const [docket, setDocket] = useState<DocketDetail | null>(null)
  const [stats, setStats] = useState<DocketStats | null>(null)
  const [themes, setThemes] = useState<Theme[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [reviewQueue, setReviewQueue] = useState<ReviewItem[]>([])
  const [biasAudit, setBiasAudit] = useState<BiasAudit | null>(null)
  const [graphData, setGraphData] = useState<GraphData | null>(null)
  const [cisFactors, setCisFactors] = useState<CISFactorRow[]>([])
  const [topicMap, setTopicMap] = useState<TopicMapData | null>(null)
  const [sankeyData, setSankeyData] = useState<SankeyFlow[]>([])
  const [selectedComment, setSelectedComment] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)

  // Load list of analyzed dockets on mount
  useEffect(() => {
    api.getDockets().then(setAllDockets).catch(() => {})
  }, [])

  useEffect(() => {
    loadDocket(docketId)
  }, [docketId])

  const loadDocket = useCallback(async (id: string) => {
    setLoading(true)
    setError(null)
    try {
      const [d, s, t, c, r, b, g, f, tm, sk] = await Promise.all([
        api.getDocket(id),
        api.getDocketStats(id),
        api.getThemes(id),
        api.getCampaigns(id),
        api.getReviewQueue(id),
        api.getBiasAudit(id),
        api.getGraph(id, 150),
        api.getCISFactors(id),
        api.getTopicMap(id).catch(() => null),
        api.getSankeyFlow(id).catch(() => []),
      ])
      setDocket(d)
      setStats(s)
      setThemes(t)
      setCampaigns(c)
      setReviewQueue(r)
      setBiasAudit(b)
      setGraphData(g)
      setCisFactors(f)
      setTopicMap(tm)
      setSankeyData(sk as SankeyFlow[])
    } catch (e: any) {
      setError(e.message || 'Failed to load docket data')
    } finally {
      setLoading(false)
    }
  }, [])

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Executive Overview' },
    { key: 'ai-cats', label: 'Categories' },
    { key: 'graph', label: 'Knowledge Graph' },
    { key: 'cis-corr', label: 'CIS Analytics' },
    { key: 'campaigns', label: 'Campaigns' },
    { key: 'bias', label: 'Bias Audit' },
    { key: 'details', label: 'Details' },
    { key: 'admin', label: 'Admin' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top bar glow */}
      <div className="h-[2px] w-full" style={{ background: 'linear-gradient(90deg, transparent 5%, var(--amber) 30%, var(--amber-bright) 50%, var(--amber) 70%, transparent 95%)' }} />

      {/* Header */}
      <header className="relative px-8 pt-6 pb-0" style={{ background: 'linear-gradient(180deg, var(--bg-raised) 0%, var(--bg-deep) 100%)' }}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5 animate-fade-up">
            {/* SoKat Logo — links to sokat.com */}
            <a href="https://www.sokat.com" target="_blank" rel="noopener noreferrer" className="flex-shrink-0 hover:opacity-80 transition-opacity">
              <img src="/sokat-logo.jpg" alt="SoKat" className="h-12 w-auto rounded" style={{ filter: 'brightness(1.1)' }} />
            </a>
            <div>
              <div className="flex items-baseline gap-3">
                <h1 className="font-display text-3xl font-black tracking-tight" style={{ color: 'var(--amber)' }}>
                  Public Comment Intelligence
                </h1>
                <span className="font-mono text-[10px] font-semibold tracking-widest uppercase" style={{ color: 'var(--text-muted)' }}>v2.1</span>
              </div>
              <p className="mt-1 text-[13px]" style={{ color: 'var(--text-muted)' }}>
                Public Comment Intelligence & Substantiveness Analysis
              </p>
            </div>
          </div>

          {/* Docket Dropdown */}
          <div className="relative animate-fade-up stagger-2">
            <div className="section-label mb-1.5">docket</div>
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-mono min-w-[280px] text-left transition-all"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            >
              <span className="flex-1 truncate">{docketId}</span>
              <svg className={`w-4 h-4 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1 w-full rounded-lg shadow-xl z-50 overflow-hidden" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                {allDockets.map(d => (
                  <button
                    key={d.docket_id}
                    onClick={() => { setDocketId(d.docket_id); setDropdownOpen(false) }}
                    className="w-full text-left px-3 py-2.5 transition-colors"
                    style={{ borderBottom: '1px solid var(--border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <div className="font-mono text-[12px]" style={{ color: d.docket_id === docketId ? 'var(--amber)' : 'var(--text-primary)' }}>
                      {d.docket_id}
                    </div>
                    <div className="text-[11px] truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {d.title?.slice(0, 60)}{d.title && d.title.length > 60 ? '...' : ''} &middot; {d.comment_count} comments
                    </div>
                  </button>
                ))}
                {allDockets.length === 0 && (
                  <div className="px-3 py-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>No dockets loaded yet</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <nav className="mt-6 flex gap-0.5 overflow-x-auto" style={{ marginBottom: -1 }}>
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className="group flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium rounded-t-lg transition-all relative"
                style={{
                  background: isActive ? 'var(--bg-deep)' : 'transparent',
                  color: isActive ? 'var(--amber)' : 'var(--text-muted)',
                  borderTop: isActive ? '2px solid var(--amber)' : '2px solid transparent',
                  borderLeft: isActive ? '1px solid var(--border)' : '1px solid transparent',
                  borderRight: isActive ? '1px solid var(--border)' : '1px solid transparent',
                }}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={TAB_ICONS[tab.key]} />
                </svg>
                {tab.label}
              </button>
            )
          })}
        </nav>
      </header>

      <div className="glow-line" />

      {/* Content */}
      <main className="flex-1 px-8 py-6" onClick={() => dropdownOpen && setDropdownOpen(false)}>
        {loading && (
          <div className="flex flex-col items-center justify-center py-24 gap-4 animate-fade-in">
            <div className="w-8 h-8 rounded-full border-2 border-transparent animate-spin" style={{ borderTopColor: 'var(--amber)', borderRightColor: 'var(--amber-dim)' }} />
            <p className="text-sm font-mono" style={{ color: 'var(--text-muted)' }}>Loading analysis...</p>
          </div>
        )}

        {error && (
          <div className="card p-5 animate-fade-up" style={{ borderColor: 'rgba(248, 81, 73, 0.3)', background: 'rgba(248, 81, 73, 0.06)' }}>
            <p className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</p>
          </div>
        )}

        {!loading && !error && (
          <div className="animate-fade-up">
            {activeTab === 'overview' && stats && (
              <div className="space-y-6">
                {/* Combined Executive Overview — everything in one card */}
                <div className="card overflow-hidden">
                  {/* Top section: title + stats strip */}
                  <div className="px-6 pt-5 pb-4" style={{ background: 'linear-gradient(135deg, rgba(0,165,224,0.08), rgba(0,165,224,0.02))' }}>
                    <div className="section-label">Executive Overview</div>
                    <p className="mt-2 text-[15px] font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {docket?.title || docketId}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {docket?.agency_name && (
                        <span className="rounded-md px-2 py-0.5 text-[10px] font-mono" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                          {docket.agency_name}
                        </span>
                      )}
                      {docket?.rin && (
                        <span className="rounded-md px-2 py-0.5 text-[10px] font-mono" style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                          RIN {docket.rin}
                        </span>
                      )}
                      <span className="rounded-md px-2 py-0.5 text-[10px] font-mono" style={{ background: 'var(--bg-surface)', color: 'var(--amber)', border: '1px solid rgba(0,165,224,0.2)' }}>
                        {docketId}
                      </span>
                    </div>

                    {/* Stats strip */}
                    {(() => {
                      const unique = (stats.total || 0) - (stats.duplicates || 0)
                      const substantive = (stats.substantiveness || []).filter(s => s.label !== 'non_substantive').reduce((sum, s) => sum + s.count, 0)
                      const classified = (stats.substantiveness || []).reduce((sum, s) => sum + s.count, 0)
                      const substantivePct = classified > 0 ? Math.round((substantive / classified) * 100) : 0
                      return (
                        <div className="mt-4 grid grid-cols-3 md:grid-cols-6 gap-3">
                          {[
                            { label: 'Total Comments', value: (stats.total || 0).toLocaleString(), sub: null },
                            { label: 'Unique', value: unique.toLocaleString(), sub: `${stats.duplicates || 0} duplicates removed` },
                            { label: 'AI Categories', value: '5', sub: 'GPT-4o classified' },
                            { label: 'Campaigns', value: String(stats.campaign_count || 0), sub: `${(stats.campaign_comments || 0).toLocaleString()} affiliated` },
                            { label: 'Substantive', value: `${substantivePct}%`, sub: `${substantive} of ${classified}`, accent: true },
                            { label: 'Needs Review', value: String(stats.needs_review || 0), sub: 'Flagged for analyst' },
                          ].map(s => (
                            <div key={s.label} className="rounded-lg p-2.5 text-center" style={{ background: 'var(--bg-surface)', border: (s as any).accent ? '1px solid rgba(0,165,224,0.2)' : '1px solid var(--border)' }}>
                              <div className="font-mono text-lg font-bold" style={{ color: (s as any).accent ? 'var(--amber)' : 'var(--text-primary)' }}>{s.value}</div>
                              <div className="text-[9px] font-medium uppercase tracking-wide" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
                              {s.sub && <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.sub}</div>}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>

                  {/* Summary body */}
                  <div className="px-6 py-5">
                    {docket?.executive_summary ? (
                      <div className="text-[13px] leading-[1.8]" style={{ color: 'var(--text-primary)' }}>
                        {/* SUMMARY header — matching ACTION ITEMS style */}
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-1 h-4 rounded-full" style={{ background: 'var(--amber)' }} />
                          <h4 style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>
                            SUMMARY
                          </h4>
                        </div>
                        {docket.executive_summary.split('\n').map((line, i) => {
                          const trimmed = line.trim()
                          if (!trimmed) return <div key={i} className="h-2" />
                          const headerMatch = trimmed.match(/^\*\*(.+?)\*\*\s*$/)
                          if (headerMatch) {
                            return (
                              <div key={i} className="flex items-center gap-2 mt-4 mb-1.5 first:mt-0">
                                <div className="w-1 h-4 rounded-full" style={{ background: 'var(--amber)' }} />
                                <h4 style={{ color: 'var(--text-primary)', fontFamily: 'JetBrains Mono', fontSize: 10, letterSpacing: '0.08em', fontWeight: 700 }}>
                                  {headerMatch[1]}
                                </h4>
                              </div>
                            )
                          }
                          // Split by bold **text** and comment links [[id]]
                          const parts = trimmed.split(/(\*\*.*?\*\*|\[\[.*?\]\])/g)
                          return (
                            <p key={i} className="mb-1.5">
                              {parts.map((part, j) => {
                                const boldMatch = part.match(/^\*\*(.+?)\*\*$/)
                                if (boldMatch) return <strong key={j} style={{ color: 'var(--text-primary)' }}>{boldMatch[1]}</strong>
                                const linkMatch = part.match(/^\[\[(.+?)\]\]$/)
                                if (linkMatch) return (
                                  <button key={j} onClick={() => setSelectedComment(linkMatch[1])}
                                    className="font-mono text-[12px] underline underline-offset-2 decoration-dotted mx-0.5"
                                    style={{ color: 'var(--amber)' }}>
                                    {linkMatch[1]}
                                  </button>
                                )
                                return <span key={j}>{part}</span>
                              })}
                            </p>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-[13px]" style={{ color: 'var(--text-muted)' }}>
                        Executive summary will be generated after the classification pipeline completes.
                      </p>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-2" style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-surface)' }}>
                    <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {docket?.executive_summary ? 'Generated by GPT-4o \u00B7 Subject to human review' : ''}
                    </span>
                  </div>
                </div>

                {/* Stance + Substantiveness side by side */}
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  {/* Stance Analysis */}
                  <div className="card p-6">
                    <div className="section-label">Stance Analysis</div>
                    <p className="mt-2 mb-4 text-[12px]" style={{ color: 'var(--text-muted)' }}>
                      Position of classified commenters on the proposed rule.
                    </p>
                    {(stats.stance || []).length > 0 ? (
                      <div className="space-y-2">
                        {(stats.stance || []).map(s => {
                          const total = (stats.stance || []).reduce((sum, x) => sum + x.count, 0)
                          const pct = total > 0 ? (s.count / total) * 100 : 0
                          const colors: Record<string, string> = { support: '#3fb950', oppose: '#f85149', conditional: '#f59e0b', neutral: '#6b7280' }
                          const icons: Record<string, string> = { support: '+', oppose: '\u2212', conditional: '~', neutral: '\u2022' }
                          return (
                            <div key={s.stance} className="flex items-center gap-3">
                              <span className="w-6 h-6 rounded-full flex items-center justify-center font-mono text-[14px] font-bold" style={{ background: `${colors[s.stance] || '#6b7280'}20`, color: colors[s.stance] || '#6b7280' }}>
                                {icons[s.stance] || '?'}
                              </span>
                              <span className="w-24 text-[13px] font-medium capitalize" style={{ color: 'var(--text-primary)' }}>{s.stance}</span>
                              <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
                                <div className="h-full rounded" style={{ width: `${pct}%`, background: colors[s.stance] || '#6b7280', opacity: 0.7 }} />
                              </div>
                              <span className="font-mono text-[13px] font-bold w-10 text-right" style={{ color: colors[s.stance] }}>{s.count}</span>
                              <span className="font-mono text-[11px] w-12 text-right" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(0)}%</span>
                            </div>
                          )
                        })}
                        <p className="text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>
                          Based on {(stats.stance || []).reduce((s, x) => s + x.count, 0)} classified comments.
                          Stance is inferred by the CIS Agentic Pipeline during classification.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>Stance data available after classification pipeline runs.</p>
                    )}
                  </div>

                  <SubstantivenessChart data={stats.substantiveness || []} />
                </div>

                {/* Sankey: Stakeholder → Theme */}
                {sankeyData.length > 0 && <SankeyChart data={sankeyData} />}

              </div>
            )}
            {activeTab === 'ai-cats' && <AICategoriesTab docketId={docketId} />}
            {activeTab === 'campaigns' && <CampaignList campaigns={campaigns} docketId={docketId} />}
            {activeTab === 'admin' && <AdminTab />}
            {activeTab === 'bias' && biasAudit && <BiasAuditPanel audit={biasAudit} cisData={cisFactors} onSelectComment={(id) => setSelectedComment(id)} />}
            {activeTab === 'graph' && graphData && <KnowledgeGraph data={graphData} onSelectComment={(id) => setSelectedComment(id)} docketId={docketId} />}
            {activeTab === 'cis-corr' && <CISCorrelationTab data={cisFactors} onSelectComment={(id) => setSelectedComment(id)} />}
            {activeTab === 'details' && <DetailsTab stats={stats} />}
          </div>
        )}
      </main>

      {selectedComment && <CommentDetail commentId={selectedComment} onClose={() => setSelectedComment(null)} />}

      <footer className="px-8 py-3" style={{ borderTop: '1px solid var(--border)' }}>
        <p className="text-[11px] font-mono text-center" style={{ color: 'var(--text-muted)' }}>
          Public Comment Intelligence v2.1 by <a href="https://www.sokat.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--amber)' }}>SoKat</a>
        </p>
      </footer>
    </div>
  )
}
