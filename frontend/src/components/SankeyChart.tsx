'use client'

import { useMemo } from 'react'
import { SankeyFlow } from '@/lib/api'

const STAKEHOLDER_COLORS: Record<string, string> = {
  individual: '#6b7280',
  government: '#00a5e0',
  trade_association: '#a78bfa',
  organization: '#3fb950',
  academic: '#f59e0b',
  law_firm: '#db6d28',
  anonymous: '#4b5563',
}

const STAKEHOLDER_LABELS: Record<string, string> = {
  individual: 'Individual',
  government: "Gov't",
  trade_association: 'Trade Assoc.',
  organization: 'Organization',
  academic: 'Academic',
  law_firm: 'Law Firm',
  anonymous: 'Anonymous',
}

const CAT_COLORS = ['#00a5e0', '#a78bfa', '#3fb950', '#f59e0b', '#ec4899']

export default function SankeyChart({ data }: { data: SankeyFlow[] }) {
  const { leftNodes, rightNodes, links } = useMemo(() => {
    if (!data.length) return { leftNodes: [], rightNodes: [], links: [] }

    const leftMap: Record<string, number> = {}
    const rightMap: Record<string, number> = {}
    for (const f of data) {
      leftMap[f.source] = (leftMap[f.source] || 0) + f.value
      rightMap[f.target] = (rightMap[f.target] || 0) + f.value
    }

    const leftNodes = Object.entries(leftMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
    const rightNodes = Object.entries(rightMap).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }))
    const rightSet = new Set(rightNodes.map(n => n.name))
    const links = data.filter(f => rightSet.has(f.target) && f.value > 0)

    return { leftNodes, rightNodes, links }
  }, [data])

  if (!data.length) return <p className="text-[12px]" style={{ color: 'var(--text-muted)' }}>No flow data.</p>

  const W = 950
  const H = Math.max(280, Math.max(leftNodes.length, rightNodes.length) * 50 + 50)
  const nodeW = 16
  const pad = 10
  const leftX = 180  // More room for labels
  const rightX = W - 220

  const totalLeft = leftNodes.reduce((s, n) => s + n.value, 0)
  const totalRight = rightNodes.reduce((s, n) => s + n.value, 0)

  function layoutNodes(nodes: { name: string; value: number }[], total: number) {
    const usableH = H - 40
    let y = 20
    return nodes.map(n => {
      const h = Math.max(12, (n.value / total) * usableH * 0.85)
      const node = { ...n, y, h }
      y += h + pad
      return node
    })
  }

  const leftLayout = layoutNodes(leftNodes, totalLeft)
  const rightLayout = layoutNodes(rightNodes, totalRight)

  const linkPaths = links.map(link => {
    const left = leftLayout.find(n => n.name === link.source)
    const right = rightLayout.find(n => n.name === link.target)
    if (!left || !right) return null

    const leftTotal = links.filter(l => l.source === link.source).reduce((s, l) => s + l.value, 0)
    const rightTotal = links.filter(l => l.target === link.target).reduce((s, l) => s + l.value, 0)

    const leftBefore = links.filter(l => l.source === link.source).reduce((s, l) => {
      if (l.target === link.target) return s
      if (l.target < link.target) return s + l.value
      return s
    }, 0)

    const rightBefore = links.filter(l => l.target === link.target).reduce((s, l) => {
      if (l.source === link.source) return s
      if (l.source < link.source) return s + l.value
      return s
    }, 0)

    const lh = (link.value / leftTotal) * left.h
    const rh = (link.value / rightTotal) * right.h
    const ly = left.y + (leftBefore / leftTotal) * left.h
    const ry = right.y + (rightBefore / rightTotal) * right.h
    const color = STAKEHOLDER_COLORS[link.source] || '#6b7280'

    return { link, ly, lh, ry, rh, color }
  }).filter(Boolean)

  return (
    <div className="card p-6">
      <div className="section-label">Stakeholder &rarr; AI Category Flow</div>
      <p className="mt-2 mb-4 text-[12px]" style={{ color: 'var(--text-muted)' }}>
        Which stakeholder types are commenting on which categories. Flow width = comment volume.
      </p>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ maxHeight: 480 }}>
        {/* Links */}
        {linkPaths.map((lp, i) => {
          if (!lp) return null
          const { ly, lh, ry, rh, color } = lp
          const x1 = leftX + nodeW
          const x2 = rightX
          const cx = (x1 + x2) / 2
          return (
            <path key={i}
              d={`M${x1},${ly} C${cx},${ly} ${cx},${ry} ${x2},${ry} L${x2},${ry + rh} C${cx},${ry + rh} ${cx},${ly + lh} ${x1},${ly + lh} Z`}
              fill={color} fillOpacity={0.18} stroke={color} strokeOpacity={0.35} strokeWidth={0.5}
            />
          )
        })}

        {/* Left: Stakeholders */}
        {leftLayout.map((n, i) => {
          const color = STAKEHOLDER_COLORS[n.name] || '#6b7280'
          const label = STAKEHOLDER_LABELS[n.name] || n.name.replace('_', ' ')
          return (
            <g key={`l-${i}`}>
              <rect x={leftX} y={n.y} width={nodeW} height={n.h} rx={4} fill={color} />
              <text x={leftX - 10} y={n.y + n.h / 2 - 1} textAnchor="end" dominantBaseline="middle"
                fontSize={10} fontWeight={600} fontFamily="DM Sans" fill="#e6edf3">
                {label}
              </text>
              <text x={leftX - 10} y={n.y + n.h / 2 + 14} textAnchor="end" dominantBaseline="middle"
                fontSize={8} fontWeight={700} fontFamily="JetBrains Mono" fill={color}>
                {n.value.toLocaleString()}
              </text>
            </g>
          )
        })}

        {/* Right: AI Categories */}
        {rightLayout.map((n, i) => {
          const color = CAT_COLORS[i % CAT_COLORS.length]
          return (
            <g key={`r-${i}`}>
              <rect x={rightX} y={n.y} width={nodeW} height={n.h} rx={4} fill={color} />
              <text x={rightX + nodeW + 10} y={n.y + n.h / 2 - 1} textAnchor="start" dominantBaseline="middle"
                fontSize={10} fontWeight={600} fontFamily="DM Sans" fill="#e6edf3">
                {n.name}
              </text>
              <text x={rightX + nodeW + 10} y={n.y + n.h / 2 + 14} textAnchor="start" dominantBaseline="middle"
                fontSize={8} fontWeight={700} fontFamily="JetBrains Mono" fill={color}>
                {n.value.toLocaleString()}
              </text>
            </g>
          )
        })}

        {/* Column headers */}
        <text x={leftX + nodeW / 2} y={12} textAnchor="middle" fontSize={10} fontWeight={700} fontFamily="JetBrains Mono" fill="#8b949e" letterSpacing="0.08em">
          STAKEHOLDERS
        </text>
        <text x={rightX + nodeW / 2} y={12} textAnchor="middle" fontSize={10} fontWeight={700} fontFamily="JetBrains Mono" fill="#8b949e" letterSpacing="0.08em">
          AI CATEGORIES
        </text>
      </svg>
    </div>
  )
}
