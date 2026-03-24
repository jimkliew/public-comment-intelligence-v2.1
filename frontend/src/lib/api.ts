const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

async function fetchApi<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface DocketSummary {
  docket_id: string;
  title: string;
  agency: string;
  doc_count: number;
  comment_count: number;
}

export interface DocketDetail {
  docket_id: string;
  title: string;
  abstract: string;
  rin: string;
  executive_summary: string | null;
  agency_name: string;
  agency_short: string;
  total_comments: number;
  duplicate_count: number;
  unique_comments: number;
}

export interface DocketStats {
  total: number;
  duplicates: number;
  needs_review: number;
  substantiveness: { label: string; count: number }[];
  impact_tiers: { tier: string; count: number }[];
  campaign_count: number;
  campaign_comments: number;
  theme_count: number;
  stance: { stance: string; count: number }[];
  stance_by_type: { commenter_type: string; stance: string; count: number }[];
  commenter_types: { type: string; count: number }[];
  content_quality: { total: number; stubs: number; with_body: number; classified: number }[];
}

export interface Theme {
  theme_id: string;
  label: string;
  keywords: string[];
  frequency_tier: string;
  comment_count: number;
  substantiveness_labels: string[];
}

export interface Comment {
  comment_id: string;
  title?: string;
  body?: string;
  excerpt?: string;
  label: string;
  confidence: number;
  impact_score: number;
  impact_tier: string;
  needs_review?: boolean;
  commenter_name?: string;
  organization?: string;
  commenter_type?: string;
  theme_probability?: number;
}

export interface CommentDetail {
  comment: Record<string, any>;
  commenter: Record<string, any>;
  document_id: string;
  document_title: string;
  themes: { theme_id: string; label: string; probability: number }[];
  legal_citations: { citation: string; type: string; context: string }[];
  economic_claims: { claim: string; type: string; quantitative: boolean; amount: string }[];
  campaign: { campaign_id: string; classification: string; member_count: number; similarity: number }[];
  similar_comments: { comment_id: string; type: string; similarity: number; excerpt: string }[];
}

export interface Campaign {
  campaign_id: string;
  classification: string;
  member_count: number;
  centroid_similarity: number;
  template_excerpt: string;
}

export interface GraphData {
  nodes: { id: string; label: string; type: string; score?: number; tier?: string; size?: number }[];
  links: { source: string; target: string; type: string }[];
}

export interface ReviewItem {
  comment_id: string;
  excerpt: string;
  label: string;
  confidence: number;
  impact_score: number;
  tier: string;
  review_reason: string;
  is_novel: boolean;
  commenter_name: string;
  organization: string;
  priority: number;
}

export interface BiasAudit {
  cis_by_commenter_type: { commenter_type: string; mean_cis: number; count: number }[];
  cis_by_label: { label: string; mean_cis: number; count: number }[];
  overall: { overall_mean_cis: number; total_scored: number };
  review_stats: { total: number; flagged_for_review: number; novel_arguments: number; low_confidence: number };
  confidence_distribution: { bucket: string; count: number }[];
}

export interface CISFactorRow {
  comment_id: string;
  cis: number;
  tier: string;
  label: string;
  confidence: number;
  factors: string; // JSON string of {V, L, E, T, N, R, C}
  word_count: number;
  stance: string;
  ai_category: string;
  ai_support: number;
  ai_credibility: number;
  excerpt: string;
  commenter_type: string;
}

export interface TopicMapPoint {
  id: string; x: number; y: number;
  theme_id: string | null; theme_label: string | null;
  cis: number | null; label: string | null; stance: string | null;
  excerpt: string;
}

export interface TopicMapTheme {
  theme_id: string; label: string; size: number;
  center_x: number; center_y: number;
}

export interface TopicMapData {
  points: TopicMapPoint[];
  themes: TopicMapTheme[];
}

export interface TimelineDay {
  date: string;
  total: number;
  exact_dupes: number;
  near_dupes: number;
}

export interface AdminStatus {
  dockets: {
    docket_id: string; title: string; total_comments: number;
    duplicates: number; stubs: number; after_dedup: number;
    classified: number; scored: number;
  }[];
  node_counts: Record<string, number>;
  edge_counts: Record<string, number>;
  config: Record<string, any>;
}

export interface SankeyFlow {
  source: string;
  target: string;
  value: number;
}

export interface ThemeWithStance {
  theme_id: string;
  label: string;
  keywords: string[];
  frequency_tier: string;
  comment_count: number;
  support: number;
  oppose: number;
  conditional: number;
  neutral: number;
}

export const api = {
  getAdminStatus: () => fetchApi<AdminStatus>('/admin/status'),
  getSankeyFlow: (id: string) => fetchApi<SankeyFlow[]>(`/dockets/${id}/stakeholder-theme-flow`),
  getThemesWithStance: (id: string) => fetchApi<ThemeWithStance[]>(`/dockets/${id}/themes-with-stance`),
  getDockets: () => fetchApi<DocketSummary[]>('/dockets'),
  getDocket: (id: string) => fetchApi<DocketDetail>(`/dockets/${id}`),
  getDocketStats: (id: string) => fetchApi<DocketStats>(`/dockets/${id}/stats`),
  getThemes: (id: string) => fetchApi<Theme[]>(`/dockets/${id}/themes`),
  getThemeComments: (themeId: string, limit = 50) =>
    fetchApi<Comment[]>(`/themes/${themeId}/comments?limit=${limit}`),
  getComments: (params: Record<string, string>) => {
    const qs = new URLSearchParams(params).toString();
    return fetchApi<Comment[]>(`/comments?${qs}`);
  },
  getCommentDetail: (id: string) => fetchApi<CommentDetail>(`/comments/${id}`),
  getCampaigns: (id: string) => fetchApi<Campaign[]>(`/dockets/${id}/campaigns`),
  getGraph: (id: string, limit = 200) =>
    fetchApi<GraphData>(`/dockets/${id}/graph?limit=${limit}`),
  getReviewQueue: (id: string, limit = 50) =>
    fetchApi<ReviewItem[]>(`/dockets/${id}/review-queue?limit=${limit}`),
  getBiasAudit: (id: string) => fetchApi<BiasAudit>(`/dockets/${id}/bias-audit`),
  getTopicMap: (id: string) => fetchApi<TopicMapData>(`/dockets/${id}/topic-map`),
  getTimeline: (id: string) => fetchApi<TimelineDay[]>(`/dockets/${id}/comment-timeline`),
  getCISFactors: (id: string) => fetchApi<CISFactorRow[]>(`/dockets/${id}/cis-factors`),
};
