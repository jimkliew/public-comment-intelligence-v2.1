'use client'

import { useEffect, useRef, useState } from 'react'
import * as d3 from 'd3'
import { GraphData } from '@/lib/api'

const NODE_COLORS: Record<string, string> = {
  docket: '#00a5e0',
  category: '#a78bfa',
  theme: '#a78bfa',  // fallback
  comment: '#3fb950',
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

interface ArgData {
  supporting: { id: string; excerpt: string; support: number; cis: number }[]
  opposing: { id: string; excerpt: string; support: number; cis: number }[]
}

export default function KnowledgeGraph({ data, onSelectComment, docketId }: {
  data: GraphData
  onSelectComment?: (id: string) => void
  docketId?: string
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [selectedNode, setSelectedNode] = useState<any>(null)
  const [filter, setFilter] = useState<'all' | 'themes-only'>('themes-only')
  const [args, setArgs] = useState<ArgData | null>(null)
  const [loadingArgs, setLoadingArgs] = useState(false)

  // Filter to only docket, theme, comment nodes + their links
  const filtered = (() => {
    const coreTypes = new Set(['docket', 'category', 'theme', 'comment'])
    const nodes = data.nodes.filter(n => coreTypes.has(n.type))
    const nodeIds = new Set(nodes.map(n => n.id))
    const links = data.links.filter(l =>
      nodeIds.has(l.source as string) && nodeIds.has(l.target as string)
    )

    if (filter === 'themes-only') {
      const themeAndDocket = new Set(nodes.filter(n => n.type !== 'comment').map(n => n.id))
      // Keep themes, docket, and top 5 comments per theme
      const commentsByTheme: Record<string, string[]> = {}
      for (const l of links) {
        if (l.type === 'has_theme' || l.type === 'has_category') {
          const theme = l.target as string
          if (!commentsByTheme[theme]) commentsByTheme[theme] = []
          commentsByTheme[theme].push(l.source as string)
        }
      }
      const keepComments = new Set<string>()
      for (const [, ids] of Object.entries(commentsByTheme)) {
        ids.slice(0, 5).forEach(id => keepComments.add(id))
      }
      const filteredNodes = nodes.filter(n => themeAndDocket.has(n.id) || keepComments.has(n.id))
      const filteredIds = new Set(filteredNodes.map(n => n.id))
      return {
        nodes: filteredNodes,
        links: links.filter(l => filteredIds.has(l.source as string) && filteredIds.has(l.target as string)),
      }
    }

    return { nodes, links }
  })()

  useEffect(() => {
    if (!svgRef.current || !filtered.nodes.length) return

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const width = svgRef.current.clientWidth
    const height = 550

    const defs = svg.append('defs')
    const glow = defs.append('filter').attr('id', 'node-glow')
    glow.append('feGaussianBlur').attr('stdDeviation', '4').attr('result', 'blur')
    const merge = glow.append('feMerge')
    merge.append('feMergeNode').attr('in', 'blur')
    merge.append('feMergeNode').attr('in', 'SourceGraphic')

    const g = svg.append('g')

    svg.call(d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on('zoom', (event) => g.attr('transform', event.transform))
    )

    // Clone data for d3 mutation
    const simNodes = filtered.nodes.map(d => ({ ...d }))
    const simLinks = filtered.links.map(d => ({ ...d }))

    const simulation = d3.forceSimulation(simNodes as any)
      .force('link', d3.forceLink(simLinks as any).id((d: any) => d.id).distance((d: any) => {
        // Shorter links between themes and docket, longer for comments
        if (d.type === 'belongs_to') return 60
        return 100
      }))
      .force('charge', d3.forceManyBody().strength((d: any) => d.type === 'docket' ? -400 : (d.type === 'category' || d.type === 'theme') ? -300 : -80))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius((d: any) => nodeRadius(d) + 8))

    function nodeRadius(d: any) {
      if (d.type === 'docket') return 28
      if (d.type === 'category' || d.type === 'theme') return d.size ? Math.max(16, Math.sqrt(d.size) * 3) : 16
      return d.score ? Math.max(4, d.score / 12) : 5
    }

    // Links
    const link = g.append('g')
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d: any) => d.type === 'has_theme' ? '#a78bfa30' : '#00a5e040')
      .attr('stroke-width', (d: any) => d.type === 'belongs_to' ? 2 : 0.8)

    // Nodes
    const node = g.append('g')
      .selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag<any, any>()
        .on('start', (event: any, d: any) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y })
        .on('drag', (event: any, d: any) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event: any, d: any) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null })
      )

    // Circles
    node.append('circle')
      .attr('r', (d: any) => nodeRadius(d))
      .attr('fill', (d: any) => {
        if (d.type === 'comment' && d.tier) {
          const tierColors: Record<string, string> = { Critical: '#ef4444', High: '#f97316', Moderate: '#eab308', Low: '#22c55e', Minimal: '#6b7280' }
          return tierColors[d.tier] || '#3fb950'
        }
        return NODE_COLORS[d.type] || '#6b7280'
      })
      .attr('fill-opacity', (d: any) => d.type === 'comment' ? 0.7 : 0.9)
      .attr('stroke', (d: any) => NODE_COLORS[d.type] || '#6b7280')
      .attr('stroke-width', (d: any) => d.type === 'docket' ? 3 : 1.5)
      .attr('stroke-opacity', 0.4)
      .attr('filter', (d: any) => d.type === 'docket' || d.type === 'theme' ? 'url(#node-glow)' : '')

    // Labels for docket and themes
    node.filter((d: any) => d.type !== 'comment')
      .append('text')
      .text((d: any) => {
        const label = d.label || d.id
        return label.length > 30 ? label.slice(0, 30) + '...' : label
      })
      .attr('text-anchor', 'middle')
      .attr('dy', (d: any) => nodeRadius(d) + 14)
      .attr('font-family', 'DM Sans')
      .attr('font-size', (d: any) => d.type === 'docket' ? 12 : 11)
      .attr('font-weight', (d: any) => d.type === 'docket' ? 700 : 600)
      .attr('fill', (d: any) => d.type === 'docket' ? '#00a5e0' : '#a78bfa')

    // CIS score labels on comment nodes (only for Moderate+)
    node.filter((d: any) => d.type === 'comment' && d.score && d.score >= 50)
      .append('text')
      .text((d: any) => d.score)
      .attr('text-anchor', 'middle')
      .attr('dy', 3)
      .attr('font-family', 'JetBrains Mono')
      .attr('font-size', 8)
      .attr('font-weight', 700)
      .attr('fill', 'white')

    // Click handler
    node.on('click', (_: any, d: any) => {
      if (d.type === 'comment') {
        onSelectComment?.(d.id)
      }
      setSelectedNode(d)
      // Fetch arguments for category nodes
      if ((d.type === 'category' || d.type === 'theme') && docketId) {
        setLoadingArgs(true)
        setArgs(null)
        fetch(`${API_URL}/api/dockets/${docketId}/category-arguments/${encodeURIComponent(d.id)}`)
          .then(r => r.json())
          .then(setArgs)
          .catch(() => setArgs(null))
          .finally(() => setLoadingArgs(false))
      } else {
        setArgs(null)
      }
    })

    // Hover
    node.on('mouseenter', function(this: any) {
      d3.select(this).select('circle').transition().duration(150).attr('stroke-opacity', 1).attr('stroke-width', 3)
    }).on('mouseleave', function(this: any, _: any, d: any) {
      d3.select(this).select('circle').transition().duration(150).attr('stroke-opacity', 0.4).attr('stroke-width', (d: any) => d.type === 'docket' ? 3 : 1.5)
    })

    simulation.on('tick', () => {
      link.attr('x1', (d: any) => d.source.x).attr('y1', (d: any) => d.source.y)
          .attr('x2', (d: any) => d.target.x).attr('y2', (d: any) => d.target.y)
      node.attr('transform', (d: any) => `translate(${d.x},${d.y})`)
    })

    return () => { simulation.stop() }
  }, [filtered, onSelectComment])

  // Separate stats for campaigns and commenter types
  const campaignNodes = data.nodes.filter(n => n.type === 'campaign')
  const commenterTypes = data.nodes.filter(n => n.type === 'commenter_type')

  return (
    <div className="space-y-6">
      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="section-label">Knowledge Graph</div>
            <p className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
              Shows how comments connect to AI categories and the docket. Comment size reflects CIS score. Color reflects impact tier.
              Click any comment node to see its full analysis.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('themes-only')}
              className="rounded-md px-3 py-1.5 text-[11px] font-medium transition-all"
              style={{ background: filter === 'themes-only' ? 'var(--amber-glow)' : 'var(--bg-surface)', color: filter === 'themes-only' ? 'var(--amber)' : 'var(--text-muted)', border: `1px solid ${filter === 'themes-only' ? 'rgba(0,165,224,0.3)' : 'var(--border)'}` }}
            >AI Categories + Top 5</button>
            <button
              onClick={() => setFilter('all')}
              className="rounded-md px-3 py-1.5 text-[11px] font-medium transition-all"
              style={{ background: filter === 'all' ? 'var(--amber-glow)' : 'var(--bg-surface)', color: filter === 'all' ? 'var(--amber)' : 'var(--text-muted)', border: `1px solid ${filter === 'all' ? 'rgba(0,165,224,0.3)' : 'var(--border)'}` }}
            >AI Categories + All Comments</button>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-4">
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="w-4 h-4 rounded-full" style={{ backgroundColor: '#00a5e0', boxShadow: '0 0 8px rgba(0,165,224,0.4)' }} /> Docket
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="w-3.5 h-3.5 rounded-full" style={{ backgroundColor: '#a78bfa', boxShadow: '0 0 6px rgba(167,139,250,0.4)' }} /> AI Category
          </span>
          <span className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#3fb950' }} /> Comment
          </span>
        </div>

        <svg ref={svgRef} width="100%" height={550} className="mt-4 rounded-lg" style={{ background: 'var(--bg-surface)' }} />

        {/* Selected node info */}
        {selectedNode && (
          <div className="mt-3 rounded-lg p-3 animate-fade-up" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full" style={{ backgroundColor: NODE_COLORS[selectedNode.type] || '#6b7280' }} />
                <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{selectedNode.type}</span>
                <span className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
                  {(selectedNode.label || selectedNode.id || '').slice(0, 80)}
                </span>
              </div>
              <button onClick={() => setSelectedNode(null)} className="text-[var(--text-muted)]">&times;</button>
            </div>
            {selectedNode.score && (
              <div className="mt-1 flex gap-3 font-mono text-[11px]">
                <span style={{ color: 'var(--text-muted)' }}>CIS: <span style={{ color: 'var(--text-primary)' }}>{selectedNode.score}</span></span>
                <span style={{ color: 'var(--text-muted)' }}>Tier: <span style={{ color: 'var(--text-primary)' }}>{selectedNode.tier}</span></span>
              </div>
            )}
            {selectedNode.size && (
              <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{selectedNode.size} comments</span>
            )}
            {selectedNode.type === 'comment' && (
              <button
                onClick={() => onSelectComment?.(selectedNode.id)}
                className="mt-2 rounded-md px-3 py-1.5 text-[11px] font-medium"
                style={{ background: 'var(--amber-glow)', color: 'var(--amber)', border: '1px solid rgba(0,165,224,0.3)' }}
              >View Full Analysis &rarr;</button>
            )}

            {/* Arguments for/against (category nodes) */}
            {(selectedNode.type === 'category' || selectedNode.type === 'theme') && (
              <div className="mt-3">
                {loadingArgs ? (
                  <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Loading arguments...</p>
                ) : args ? (
                  <div className="grid grid-cols-2 gap-3">
                    {/* Supporting */}
                    <div>
                      <div className="text-[10px] font-mono font-bold mb-1.5" style={{ color: '#3fb950' }}>FOR THE RULE</div>
                      {args.supporting.length > 0 ? args.supporting.map(a => (
                        <button key={a.id} onClick={() => onSelectComment?.(a.id)}
                          className="w-full text-left rounded-md p-2 mb-1.5 transition-all hover:translate-x-0.5"
                          style={{ background: 'rgba(63,185,80,0.06)', border: '1px solid rgba(63,185,80,0.15)' }}>
                          <p className="text-[11px] line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                            &ldquo;{a.excerpt}&rdquo;
                          </p>
                          <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>{a.id.split('-').pop()}</span>
                        </button>
                      )) : <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>None found</p>}
                    </div>
                    {/* Opposing */}
                    <div>
                      <div className="text-[10px] font-mono font-bold mb-1.5" style={{ color: '#f85149' }}>AGAINST THE RULE</div>
                      {args.opposing.length > 0 ? args.opposing.map(a => (
                        <button key={a.id} onClick={() => onSelectComment?.(a.id)}
                          className="w-full text-left rounded-md p-2 mb-1.5 transition-all hover:translate-x-0.5"
                          style={{ background: 'rgba(248,81,73,0.06)', border: '1px solid rgba(248,81,73,0.15)' }}>
                          <p className="text-[11px] line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                            &ldquo;{a.excerpt}&rdquo;
                          </p>
                          <span className="font-mono text-[9px]" style={{ color: 'var(--text-muted)' }}>{a.id.split('-').pop()}</span>
                        </button>
                      )) : <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>None found</p>}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Commenter Types */}
      {commenterTypes.length > 0 && (
        <div className="card p-5">
          <div className="section-label mb-3">Commenter Types</div>
          <div className="space-y-2">
            {commenterTypes.sort((a, b) => (b.size || 0) - (a.size || 0)).map(ct => {
              const maxSize = Math.max(...commenterTypes.map(c => c.size || 0), 1)
              const w = ((ct.size || 0) / maxSize) * 100
              return (
                <div key={ct.id} className="flex items-center gap-3">
                  <span className="w-24 text-[12px] font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{ct.label}</span>
                  <div className="flex-1 h-4 rounded overflow-hidden" style={{ background: 'var(--bg-surface)' }}>
                    <div className="h-full rounded" style={{ width: `${w}%`, background: 'rgba(0,165,224,0.5)' }} />
                  </div>
                  <span className="font-mono text-[11px] w-8 text-right" style={{ color: 'var(--text-primary)' }}>{ct.size || 0}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
