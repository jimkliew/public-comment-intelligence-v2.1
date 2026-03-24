/**
 * CIS Factor definitions — single source of truth.
 * Used consistently across CommentDetail, CISCorrelationTab, BiasAudit, etc.
 *
 * Two groups:
 *   AI Agent Assessment (L, E, R, C) — weight sum 0.60
 *   Peer-Based Numerical (N, T, V) — weight sum 0.40
 */

export const AGENT_FACTORS = [
  { key: 'L', label: 'Legal Specificity', weight: 0.20, color: '#a78bfa' },
  { key: 'E', label: 'Economic Evidence', weight: 0.15, color: '#3fb950' },
  { key: 'R', label: 'Regulatory Engagement', weight: 0.15, color: '#2dd4bf' },
  { key: 'C', label: 'Credibility Signals', weight: 0.10, color: '#db6d28' },
] as const

export const PEER_FACTORS = [
  { key: 'N', label: 'Novelty', weight: 0.20, color: '#f59e0b' },
  { key: 'T', label: 'Thematic Centrality', weight: 0.10, color: '#00a5e0' },
  { key: 'V', label: 'Volume Signal', weight: 0.10, color: '#6b7280' },
] as const

export const ALL_FACTORS = [...AGENT_FACTORS, ...PEER_FACTORS]

export const FACTOR_MAP: Record<string, { label: string; weight: number; color: string; group: 'agent' | 'peer' }> = {}
for (const f of AGENT_FACTORS) FACTOR_MAP[f.key] = { ...f, group: 'agent' }
for (const f of PEER_FACTORS) FACTOR_MAP[f.key] = { ...f, group: 'peer' }

export const FACTOR_ORDER = ['L', 'E', 'R', 'C', 'N', 'T', 'V'] as const

export type FactorKey = typeof FACTOR_ORDER[number]

export function parseFactors(raw: string): Record<FactorKey, number> {
  try { return JSON.parse(raw.replace(/'/g, '"')) }
  catch { return { L: 0, E: 0, R: 0, C: 0, N: 0, T: 0, V: 0 } }
}

export const TIER_COLORS: Record<string, string> = {
  Critical: '#ef4444',
  High: '#f97316',
  Moderate: '#eab308',
  Low: '#22c55e',
  Minimal: '#6b7280',
}
