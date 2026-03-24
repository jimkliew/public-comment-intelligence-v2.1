'use client'

import { useState, useMemo } from 'react'
import { Theme, Comment, api } from '@/lib/api'

// Consistent, distinct theme palette — no red (red = danger, not appropriate for themes)
const THEME_PALETTE = [
  '#00a5e0', // SoKat blue
  '#a78bfa', // purple
  '#3fb950', // green
  '#f59e0b', // amber
  '#2dd4bf', // teal
  '#ec4899', // pink
  '#60a5fa', // light blue
  '#fb923c', // orange
  '#34d399', // emerald
  '#c084fc', // lavender
  '#38bdf8', // sky
  '#fbbf24', // yellow
]

function getThemeColor(index: number): string {
  return THEME_PALETTE[index % THEME_PALETTE.length]
}

export default function ThemeHeatmap({
  themes,
  expanded = false,
  onSelectTheme,
  onSelectComment,
}: {
  themes: Theme[]
  expanded?: boolean
  onSelectTheme?: (id: string) => void
  onSelectComment?: (id: string) => void
}) {
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null)
  const [themeComments, setThemeComments] = useState<Comment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [hoveredTheme, setHoveredTheme] = useState<string | null>(null)
  const [showMethodology, setShowMethodology] = useState(false)

  const totalComments = themes.reduce((s, t) => s + t.comment_count, 0)
  const maxCount = Math.max(...themes.map(t => t.comment_count), 1)

  // Sort themes by comment count descending, limit to 5
  const sorted = useMemo(() =>
    [...themes].sort((a, b) => b.comment_count - a.comment_count).slice(0, 5),
    [themes]
  )

  async function selectTheme(themeId: string) {
    setSelectedTheme(themeId)
    onSelectTheme?.(themeId)
    if (expanded) {
      setLoadingComments(true)
      try {
        const comments = await api.getThemeComments(themeId, 20)
        setThemeComments(comments)
      } catch {
        setThemeComments([])
      } finally {
        setLoadingComments(false)
      }
    }
  }

  return (
    <div className="card p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="section-label">Theme Analysis</div>
          <p className="mt-2 text-[12px]" style={{ color: 'var(--text-muted)' }}>
            Discovered via{' '}
            <button
              onClick={() => setShowMethodology(!showMethodology)}
              className="font-semibold underline underline-offset-2 decoration-dotted transition-colors"
              style={{ color: 'var(--amber)' }}
            >BERTopic</button>
            . {sorted.length} themes from {totalComments} comments.
          </p>
        </div>
        <div className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
          {sorted.length} themes &middot; {totalComments} comments
        </div>
      </div>

      {/* ── Horizontal Bar Visualization (inspired by BERTopic barchart_) ── */}
      <div className="mt-5 space-y-1.5">
        {sorted.map((theme, i) => {
          const color = getThemeColor(i)
          const pct = totalComments > 0 ? (theme.comment_count / totalComments) * 100 : 0
          const barWidth = (theme.comment_count / maxCount) * 100
          const isSelected = selectedTheme === theme.theme_id
          const isHovered = hoveredTheme === theme.theme_id

          return (
            <div key={theme.theme_id} className="relative">
              <button
                onClick={() => selectTheme(theme.theme_id)}
                onMouseEnter={() => setHoveredTheme(theme.theme_id)}
                onMouseLeave={() => setHoveredTheme(null)}
                className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all"
                style={{
                  background: isSelected ? `${color}15` : isHovered ? 'var(--bg-hover)' : 'transparent',
                  border: isSelected ? `1px solid ${color}40` : '1px solid transparent',
                }}
              >
                {/* Color dot */}
                <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}40` }} />

                {/* Theme label */}
                <span className="w-44 flex-shrink-0 text-[13px] font-medium truncate" style={{ color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                  {theme.label}
                </span>

                {/* Bar */}
                <div className="flex-1 h-6 rounded overflow-hidden relative" style={{ background: 'var(--bg-surface)' }}>
                  <div
                    className="h-full rounded transition-all duration-500"
                    style={{
                      width: `${barWidth}%`,
                      background: `linear-gradient(90deg, ${color}99, ${color}cc)`,
                    }}
                  />
                  {/* Bar label inside */}
                  {barWidth > 15 && (
                    <span className="absolute inset-y-0 left-2 flex items-center font-mono text-[11px] font-bold text-white">
                      {theme.comment_count}
                    </span>
                  )}
                </div>

                {/* Count + percentage */}
                <div className="w-20 flex-shrink-0 text-right">
                  <span className="font-mono text-[13px] font-bold" style={{ color }}>{theme.comment_count}</span>
                  <span className="font-mono text-[10px] ml-1" style={{ color: 'var(--text-muted)' }}>{pct.toFixed(1)}%</span>
                </div>
              </button>

              {/* Hover tooltip with keywords */}
              {isHovered && !isSelected && (
                <div
                  className="absolute left-48 top-0 z-20 rounded-lg p-3 shadow-xl animate-fade-in"
                  style={{
                    background: 'var(--bg-raised)',
                    border: `1px solid ${color}40`,
                    maxWidth: 320,
                    pointerEvents: 'none',
                  }}
                >
                  <div className="text-[12px] font-semibold mb-1" style={{ color }}>{theme.label}</div>
                  <div className="flex flex-wrap gap-1 mb-1.5">
                    {(theme.keywords || []).slice(0, 6).map((kw, j) => (
                      <span key={j} className="rounded px-1.5 py-0.5 text-[10px] font-mono" style={{ background: `${color}15`, color }}>
                        {kw}
                      </span>
                    ))}
                  </div>
                  <div className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    {theme.comment_count} comments &middot; {pct.toFixed(1)}% of total &middot; Click to explore
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Bubble visualization (inspired by BERTopic visualize_topics) ── */}
      {!expanded && sorted.length > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3 py-4">
          {sorted.map((theme, i) => {
            const color = getThemeColor(i)
            const pct = totalComments > 0 ? theme.comment_count / totalComments : 0
            const minR = 28
            const maxR = 80
            const r = Math.max(minR, Math.round(pct * maxR * 6))
            return (
              <button
                key={theme.theme_id}
                onClick={() => selectTheme(theme.theme_id)}
                onMouseEnter={() => setHoveredTheme(theme.theme_id)}
                onMouseLeave={() => setHoveredTheme(null)}
                className="rounded-full flex items-center justify-center transition-all hover:scale-110"
                style={{
                  width: r,
                  height: r,
                  background: `radial-gradient(circle at 35% 35%, ${color}40, ${color}15)`,
                  border: `2px solid ${color}60`,
                  boxShadow: hoveredTheme === theme.theme_id ? `0 0 20px ${color}40` : 'none',
                }}
                title={`${theme.label}: ${theme.comment_count} comments`}
              >
                <span className="font-mono text-[10px] font-bold" style={{ color }}>{theme.comment_count}</span>
              </button>
            )
          })}
        </div>
      )}

      {/* ── Expanded: selected theme detail ── */}
      {expanded && selectedTheme && (() => {
        const idx = sorted.findIndex(t => t.theme_id === selectedTheme)
        const theme = sorted[idx]
        if (!theme) return null
        const color = getThemeColor(idx)

        return (
          <div className="mt-6 pt-6 animate-fade-up" style={{ borderTop: '1px solid var(--border)' }}>
            <div className="flex items-center gap-3">
              <div className="w-4 h-4 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 10px ${color}60` }} />
              <h4 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{theme.label}</h4>
            </div>
            <div className="mt-2 flex gap-2 flex-wrap">
              {(theme.keywords || []).map((kw, i) => (
                <span key={i} className="rounded-md px-2 py-1 text-[11px] font-mono" style={{ background: `${color}15`, color, border: `1px solid ${color}30` }}>
                  {kw}
                </span>
              ))}
            </div>

            {loadingComments ? (
              <p className="mt-4 text-sm" style={{ color: 'var(--text-muted)' }}>Loading comments...</p>
            ) : (
              <div className="mt-4 space-y-2">
                {themeComments.map((c) => (
                  <div
                    key={c.comment_id}
                    onClick={() => onSelectComment?.(c.comment_id)}
                    className="cursor-pointer rounded-lg p-4 transition-all hover:translate-x-1"
                    style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)', borderLeft: `3px solid ${color}` }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>{c.comment_id}</span>
                      <div className="flex gap-2">
                        {c.label && <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium label-${c.label}`}>{c.label}</span>}
                        {c.impact_score != null && (
                          <span className={`rounded-md px-2 py-0.5 text-[11px] font-mono font-semibold tier-${(c.impact_tier || '').toLowerCase()}`}>
                            {c.impact_score}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="mt-2 text-[13px] line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                      {c.body || c.excerpt || '(no text)'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })()}

      {/* Methodology link */}
      {expanded && !showMethodology && (
        <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowMethodology(true)}
            className="flex items-center gap-2 text-[13px] font-medium transition-colors hover:underline"
            style={{ color: 'var(--amber)' }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            Methodology: BERTopic Theme Discovery &rarr;
          </button>
        </div>
      )}

      {/* ── Full methodology (toggled by link click) ── */}
      {showMethodology && (
        <div className="mt-8 pt-6" style={{ borderTop: '1px solid var(--border)' }} id="theme-methodology">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="var(--amber)" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            <span className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>
              Methodology: BERTopic Theme Discovery
            </span>
          </div>

          <div className="text-[13px] leading-relaxed space-y-4" style={{ color: 'var(--text-secondary)' }}>
            <p>
              Themes are discovered <strong style={{ color: 'var(--text-primary)' }}>automatically</strong> using{' '}
              <a href="https://maartengr.github.io/BERTopic/index.html" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2" style={{ color: 'var(--amber)' }}>BERTopic</a>,
              a neural topic modeling algorithm. No human defines themes in advance &mdash; the system reads all comments
              and groups them by semantic similarity.
            </p>

            {/* Pipeline diagram */}
            <div className="rounded-lg p-5" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="flex items-center justify-between gap-2 text-center">
                {[
                  { step: '1', label: 'Embed', desc: 'all-MiniLM-L6-v2', note: 'Deterministic' },
                  { step: '2', label: 'Reduce', desc: 'UMAP → 5D', note: 'Stochastic' },
                  { step: '3', label: 'Cluster', desc: 'HDBSCAN', note: 'Deterministic' },
                  { step: '4', label: 'Label', desc: 'c-TF-IDF', note: 'Deterministic' },
                ].map((s, i) => (
                  <div key={s.step} className="flex items-center gap-2">
                    {i > 0 && <span className="text-[18px] font-light" style={{ color: 'var(--border-light)' }}>&rarr;</span>}
                    <div className="rounded-lg p-3 min-w-[120px]" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)' }}>
                      <div className="font-mono text-[10px] font-bold" style={{ color: 'var(--amber)' }}>STEP {s.step}</div>
                      <div className="text-[13px] font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>{s.label}</div>
                      <div className="font-mono text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.desc}</div>
                      <div className="font-mono text-[9px] mt-1 rounded px-1.5 py-0.5 inline-block" style={{
                        background: s.note === 'Stochastic' ? 'rgba(245,158,11,0.1)' : 'rgba(63,185,80,0.1)',
                        color: s.note === 'Stochastic' ? '#f59e0b' : '#3fb950',
                      }}>{s.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mathematical detail */}
            <div className="space-y-3">
              <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Step 1: Embedding (Deterministic)</h4>
              <p>Each comment <em>d</em> is mapped to a dense vector <strong style={{ color: 'var(--text-primary)' }}>e<sub>d</sub> {'\u2208'} {'\u211D'}<sup>384</sup></strong> using the sentence-transformer model <code style={{ fontSize: 11, padding: '1px 4px', borderRadius: 3, background: 'var(--bg-hover)', color: 'var(--amber)' }}>all-MiniLM-L6-v2</code>. Vectors are L2-normalized so cosine similarity equals the dot product. This step is fully deterministic &mdash; same input always produces the same embedding.</p>

              <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Step 2: Dimensionality Reduction (UMAP &mdash; the only stochastic step)</h4>
              <p>UMAP projects <strong style={{ color: 'var(--text-primary)' }}>e<sub>d</sub> {'\u2208'} {'\u211D'}<sup>384</sup> {'\u2192'} z<sub>d</sub> {'\u2208'} {'\u211D'}<sup>5</sup></strong> by constructing a fuzzy topological representation of the high-dimensional data and finding a low-dimensional layout that preserves local distances.</p>
              <p>Parameters: <code style={{ fontSize: 11, padding: '1px 4px', borderRadius: 3, background: 'var(--bg-hover)', color: 'var(--amber)' }}>n_neighbors=15, n_components=5, min_dist=0.0, metric=cosine</code></p>
              <div className="rounded-lg p-3" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.15)' }}>
                <p className="text-[12px]" style={{ color: '#f59e0b' }}>
                  <strong>UMAP is the only source of non-determinism</strong> in the entire pipeline. It uses random initialization, so results may vary slightly between runs. However, the overall theme structure is highly stable. All other steps (embedding, HDBSCAN, c-TF-IDF) are fully deterministic given the same input.
                </p>
              </div>

              <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Step 3: Clustering (HDBSCAN &mdash; Deterministic)</h4>
              <p>HDBSCAN (Hierarchical Density-Based Spatial Clustering of Applications with Noise) finds clusters of varying density in the UMAP-reduced space. It does not require specifying the number of clusters in advance &mdash; it discovers them from data topology.</p>
              <p>Parameters: <code style={{ fontSize: 11, padding: '1px 4px', borderRadius: 3, background: 'var(--bg-hover)', color: 'var(--amber)' }}>min_cluster_size=max(10, N&times;0.005), min_samples=5, metric=euclidean</code></p>
              <p>Comments not assigned to any cluster are labeled <strong style={{ color: 'var(--text-primary)' }}>noise (-1)</strong>. These are potential novel arguments &mdash; automatically flagged for priority human review.</p>

              <h4 className="text-[13px] font-semibold" style={{ color: 'var(--amber)' }}>Step 4: Topic Representation (c-TF-IDF &mdash; Deterministic)</h4>
              <p>Class-based TF-IDF extracts the most distinctive words for each cluster by treating all documents in a cluster as a single meta-document:</p>
              <pre className="rounded-lg p-3 font-mono text-[11px] leading-relaxed" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{`tf-idf(t, c) = tf(t, c) × log(1 + A / tf(t))

where:
  t = term
  c = cluster (all documents in cluster concatenated)
  tf(t, c) = frequency of term t in cluster c
  A = average number of words per cluster
  tf(t) = frequency of term t across all clusters`}</pre>
            </div>

            {/* Stability note */}
            <div className="rounded-lg p-4" style={{ background: 'rgba(63,185,80,0.06)', border: '1px solid rgba(63,185,80,0.15)' }}>
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="#3fb950" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-[12px] font-semibold" style={{ color: '#3fb950' }}>Stability at Scale</span>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                As the number of comments exceeds <strong style={{ color: 'var(--text-primary)' }}>1,000</strong>, BERTopic&apos;s theme structure becomes <strong style={{ color: 'var(--text-primary)' }}>very stable</strong> across runs. The UMAP stochasticity (Step 2) has diminishing effect on the final clustering because HDBSCAN operates on density topology, which converges with sufficient data. In practice, major themes remain identical; only boundary assignments between closely related topics may shift by a few percent.
              </p>
            </div>

            {/* Citation */}
            <div className="rounded-lg p-4" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
              <div className="text-[11px] font-mono mb-2" style={{ color: 'var(--text-muted)' }}>CITATION</div>
              <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>
                Grootendorst, M. (2022). BERTopic: Neural topic modeling with a class-based TF-IDF procedure. <em>arXiv preprint arXiv:2203.05794</em>.
              </p>
              <div className="mt-2 flex gap-3">
                <a href="https://arxiv.org/abs/2203.05794" target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-mono underline underline-offset-2" style={{ color: 'var(--amber)' }}>
                  arXiv:2203.05794
                </a>
                <a href="https://maartengr.github.io/BERTopic/index.html" target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-mono underline underline-offset-2" style={{ color: 'var(--amber)' }}>
                  Documentation
                </a>
                <a href="https://github.com/MaartenGr/BERTopic" target="_blank" rel="noopener noreferrer"
                  className="text-[11px] font-mono underline underline-offset-2" style={{ color: 'var(--amber)' }}>
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
