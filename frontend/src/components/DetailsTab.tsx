'use client'

import { useState } from 'react'
import { DocketStats } from '@/lib/api'

type Section = 'mission' | 'pipeline' | 'capabilities' | 'scoring' | 'classification' | 'responsible' | 'architecture'

const SECTIONS: { key: Section; label: string; icon: string }[] = [
  { key: 'mission', label: 'Mission & Context', icon: 'M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9' },
  { key: 'pipeline', label: 'Data Pipeline', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4' },
  { key: 'capabilities', label: 'MVP Capabilities', icon: 'M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z' },
  { key: 'scoring', label: 'Impact Scoring (CIS)', icon: 'M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z' },
  { key: 'classification', label: 'AI Classification', icon: 'M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z' },
  { key: 'responsible', label: 'Responsible AI', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { key: 'architecture', label: 'Architecture', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
]

export default function DetailsTab({ stats }: { stats: DocketStats | null }) {
  const [active, setActive] = useState<Section>('mission')

  return (
    <div className="flex gap-6">
      <nav className="w-56 flex-shrink-0 space-y-0.5">
        {SECTIONS.map(s => (
          <button key={s.key} onClick={() => setActive(s.key)}
            className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left text-[13px] font-medium transition-all"
            style={{ background: active === s.key ? 'var(--bg-surface)' : 'transparent', color: active === s.key ? 'var(--amber)' : 'var(--text-muted)', borderLeft: active === s.key ? '2px solid var(--amber)' : '2px solid transparent' }}>
            <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d={s.icon} />
            </svg>
            {s.label}
          </button>
        ))}
      </nav>

      <div className="flex-1 card p-8 min-h-[600px] animate-fade-in">
        <div className="details-prose max-w-3xl">
          {active === 'mission' && <Mission />}
          {active === 'pipeline' && <Pipeline />}
          {active === 'capabilities' && <Capabilities />}
          {active === 'scoring' && <Scoring />}
          {active === 'classification' && <Classification />}
          {active === 'responsible' && <Responsible />}
          {active === 'architecture' && <Architecture />}
        </div>
      </div>
    </div>
  )
}

function Mission() { return (<>
  <h2>Mission &amp; Context</h2>
  <p>Federal agencies develop regulations under the <strong style={{ color: 'var(--text-primary)' }}>Administrative Procedure Act (APA)</strong>, 5 U.S.C. &sect; 553. When an agency publishes a Notice of Proposed Rulemaking (NPRM), the public has a defined period to submit comments. Agencies are legally required to review, consider, and respond to substantive comments before issuing a final rule.</p>
  <blockquote>Public Comment Intelligence scales transparency, accountability, and analytical rigor in federal rulemaking &mdash; it augments human reviewers, never replaces them.</blockquote>

  <h3>The Problem</h3>
  <p>A single rulemaking can receive thousands of comments &mdash; including coordinated campaigns, detailed legal briefs, and economic analyses. The manual review process is slow, inconsistent, and cannot scale. Under the &ldquo;hard look&rdquo; doctrine, courts review whether agencies genuinely considered and responded to significant comments. Missing a critical argument can result in judicial remand.</p>

  <h3>What This Platform Does</h3>
  <table>
    <thead><tr><th>Capability</th><th>Value</th></tr></thead>
    <tbody>
      <tr><td>AI Categories</td><td>GPT-4o reads all comments and creates 5 meaningful categories with support &amp; credibility scores</td></tr>
      <tr><td>Duplicate Detection</td><td>SHA-256 exact matching + cosine similarity (&ge;0.92) for near-duplicates</td></tr>
      <tr><td>CIS Scoring</td><td>7-factor transparent score: 4 AI agent factors (60%) + 3 peer-based numerical (40%)</td></tr>
      <tr><td>Stance Detection</td><td>GPT-4o classifies each comment as support / oppose / conditional / neutral</td></tr>
      <tr><td>Stakeholder Inference</td><td>GPT-4o identifies commenter type from text (Gov&apos;t, trade assoc, individual, etc.)</td></tr>
      <tr><td>Executive Summary</td><td>GPT-5.4 generates a polished briefing with linked action items</td></tr>
      <tr><td>Bias Audit</td><td>3% tail outlier detection across all CIS factors</td></tr>
    </tbody>
  </table>
</>)}

function Pipeline() { return (<>
  <h2>Data Pipeline</h2>

  <h3>Stage 1: Ingestion</h3>
  <table>
    <thead><tr><th>Source</th><th>Data</th><th>Auth</th></tr></thead>
    <tbody>
      <tr><td><code>Federal Register API</code></td><td>NPRM metadata, rule text, agency info</td><td>None</td></tr>
      <tr><td><code>Regulations.gov API</code></td><td>Comments, docket metadata, PDF attachments</td><td>Free API key</td></tr>
    </tbody>
  </table>
  <p>Comments are fetched with <strong style={{ color: 'var(--text-primary)' }}>8 parallel async requests</strong> and streamed into Neo4j immediately. Resumable &mdash; if interrupted, already-loaded comments persist. PDF attachments are downloaded (max 2MB) and text extracted (first 3,000 chars) via pdfplumber.</p>

  <h3>Stage 2: Normalization</h3>
  <pre>{`1. HTML entity decoding + Unicode normalization (NFKC)
2. HTML/markup stripping, URL removal
3. Whitespace collapsing
4. SHA-256 hash computation (for exact dedup)
5. Stub detection ("See Attached" with no body → flagged, excluded)
6. Word count computation`}</pre>

  <h3>Stage 3: Knowledge Graph (Neo4j)</h3>
  <p>All entities are loaded into a Neo4j graph database with 11 node types and 14 relationship types. The graph enables queries like &ldquo;find all legal citations referenced by comments in the Compliance Costs category&rdquo; as a single Cypher traversal.</p>

  <h3>Stage 4: AI Analysis</h3>
  <pre>{`Embeddings (all-MiniLM-L6-v2, 384-dim)
  → Exact dedup (SHA-256) + Near-dedup (cosine ≥ 0.92)
  → BERTopic clustering (UMAP + HDBSCAN)
  → AI Categories (GPT-4o discovers 5 categories from 200 comments)
  → CIS Agentic Pipeline (GPT-4o classifies + scores each comment)
  → AI Category assignment (GPT-4o-mini, 8 parallel)
  → Executive Summary (GPT-5.4)`}</pre>

  <h3>Stage 5: Dashboard</h3>
  <p>FastAPI serves 15+ REST endpoints. Next.js frontend with Recharts + D3.js visualizations. Real-time admin status with auto-refresh.</p>
</>)}

function Capabilities() { return (<>
  <h2>MVP Capabilities</h2>

  <h3>1. AI Categories</h3>
  <p>GPT-4o reads 200 representative comments and proposes exactly 5 categories. Then GPT-4o-mini assigns every comment to one category and scores it on <strong style={{ color: 'var(--text-primary)' }}>Support (1-10)</strong> and <strong style={{ color: 'var(--text-primary)' }}>Credibility (1-10)</strong>. The cross-category bubble chart plots each category by average support vs. credibility.</p>

  <h3>2. Duplicate &amp; Campaign Detection</h3>
  <p>Exact duplicates via SHA-256 hash. Near-duplicates via cosine similarity on sentence-transformer embeddings (&ge;0.92 threshold). Connected components of near-duplicates form campaigns. The cumulative timeline shows all comments, after dedup, and after similar removal.</p>

  <h3>3. Comment Impact Scoring (CIS)</h3>
  <p>A transparent 7-factor weighted formula. 4 AI agent factors (L, E, R, C = 60%) scored by GPT-4o + 3 peer-based numerical factors (N, T, V = 40%) computed from embeddings. Every score has a 90% confidence interval. See &ldquo;Impact Scoring&rdquo; for the full methodology.</p>

  <h3>4. Stance &amp; Stakeholder Analysis</h3>
  <p>GPT-4o classifies each comment as support/oppose/conditional/neutral and infers commenter type (Gov&apos;t, trade assoc, organization, academic, law firm, individual) from the text itself &mdash; not from Regulations.gov metadata (which is often empty).</p>

  <h3>5. Executive Summary</h3>
  <p>GPT-5.4 generates a polished 3-5 sentence summary with linked action items referencing specific comment IDs. Click any [[comment-id]] to open the full analysis card.</p>

  <h3>6. Bias Audit</h3>
  <p>Histogram distributions for CIS and all 7 factors. 3% tail outliers (1.5% each side) are highlighted in red. Clickable &mdash; inspect any outlier to see its full scoring breakdown.</p>

  <h3>7. Knowledge Graph</h3>
  <p>D3 force-directed graph showing Docket &rarr; AI Categories &rarr; Comments. Click a category to see top 3 arguments for and against the rule. Click any comment to open its card.</p>
</>)}

function Scoring() { return (<>
  <h2>Comment Impact Scoring (CIS)</h2>
  <p>The CIS quantifies a comment&apos;s potential regulatory significance. It is a <strong style={{ color: 'var(--text-primary)' }}>decision-support tool</strong>, not a determination of which comments require response.</p>

  <h3>Formula</h3>
  <pre>{`CIS = 0.20×L + 0.15×E + 0.15×R + 0.10×C + 0.20×N + 0.10×T + 0.10×V`}</pre>

  <h3>AI Agent Assessment (60%)</h3>
  <p>GPT-4o reads the comment and scores these factors through the CIS Agentic Pipeline:</p>
  <table>
    <thead><tr><th>Factor</th><th>Weight</th><th>What It Measures</th><th>Scale</th></tr></thead>
    <tbody>
      <tr><td><code style={{ color: '#a78bfa' }}>L</code></td><td><strong>0.20</strong></td><td>Legal Specificity &mdash; citation depth, statutory analysis</td><td>0/0.25/0.50/0.75/1.0</td></tr>
      <tr><td><code style={{ color: '#3fb950' }}>E</code></td><td>0.15</td><td>Economic Evidence &mdash; quantitative analysis quality</td><td>0/0.25/0.50/0.75/1.0</td></tr>
      <tr><td><code style={{ color: '#2dd4bf' }}>R</code></td><td>0.15</td><td>Regulatory Engagement &mdash; provision-level specificity</td><td>0/0.25/0.50/0.75/1.0</td></tr>
      <tr><td><code style={{ color: '#db6d28' }}>C</code></td><td>0.10</td><td>Credibility Signals &mdash; commenter expertise (lowest weight)</td><td>0/0.25/0.50/0.75/1.0</td></tr>
    </tbody>
  </table>

  <h3>Peer-Based Numerical (40%)</h3>
  <p>Computed from corpus statistics. No AI judgment. Fully deterministic:</p>
  <table>
    <thead><tr><th>Factor</th><th>Weight</th><th>What It Measures</th><th>Computation</th></tr></thead>
    <tbody>
      <tr><td><code style={{ color: '#f59e0b' }}>N</code></td><td><strong>0.20</strong></td><td>Novelty &mdash; unique argument detection</td><td>HDBSCAN outlier distance</td></tr>
      <tr><td><code style={{ color: '#00a5e0' }}>T</code></td><td>0.10</td><td>Thematic Centrality &mdash; archetypal articulation</td><td>Cosine similarity to cluster centroid</td></tr>
      <tr><td><code style={{ color: '#6b7280' }}>V</code></td><td>0.10</td><td>Volume Signal &mdash; argument popularity</td><td>Cluster size ratio (campaign-penalized &times;0.5)</td></tr>
    </tbody>
  </table>

  <blockquote>The two highest-weighted factors are deliberately split: <strong>N</strong> (peer, 0.20) and <strong>L</strong> (agent, 0.20). The CIS blends statistical signal from the corpus with deep reading of individual comment quality.</blockquote>

  <h3>Confidence Intervals</h3>
  <p>Every CIS includes a 90% CI. Subjective factors (L, E, R, C) have wider error margins (&plusmn;0.25 &times; (1 &minus; confidence)). Embedding-based factors (T, N) are stable (&plusmn;0.05). Volume (V) is near-deterministic (&plusmn;0.02).</p>

  <h3>Tiers</h3>
  <table>
    <thead><tr><th>Score</th><th>Tier</th><th>Implication</th></tr></thead>
    <tbody>
      <tr><td>90&ndash;100</td><td>Critical</td><td>Requires direct response in final rule preamble</td></tr>
      <tr><td>70&ndash;89</td><td>High</td><td>Likely requires response</td></tr>
      <tr><td>50&ndash;69</td><td>Moderate</td><td>Contains substantive elements</td></tr>
      <tr><td>30&ndash;49</td><td>Low</td><td>May be addressed in aggregate</td></tr>
      <tr><td>0&ndash;29</td><td>Minimal</td><td>Non-substantive; acknowledge in bulk</td></tr>
    </tbody>
  </table>
</>)}

function Classification() { return (<>
  <h2>AI Classification Methodology</h2>

  <h3>CIS Agentic Pipeline</h3>
  <p>Each comment passes through a sequence of AI agents (GPT-4o) that assess it from multiple angles:</p>
  <pre>{`Comment Text
    ↓
Agent 1: Comprehension → "What is the main point?"
Agent 2: Provision Scanner → references specific rule sections? → R score
Agent 3: Evidence Extractor → citations, data, studies, experience?
Agent 4: Legal Analyst → statutory authority cited? → L score
Agent 5: Economic Analyst → quantitative claims? → E score
Agent 6: Technical Analyst → scientific data or corrections?
Agent 7: Policy Analyst → alternatives or consequences?
Agent 8: Classifier → assigns label(s) + confidence + stance
Agent 9: Uncertainty Assessor → flags for human review if unsure
    ↓
Structured JSON output → Neo4j`}</pre>

  <h3>Classification Labels</h3>
  <table>
    <thead><tr><th>Label</th><th>What It Means</th></tr></thead>
    <tbody>
      <tr><td><code>legal</code></td><td>Cites statutes, case law, or regulatory precedent</td></tr>
      <tr><td><code>policy</code></td><td>Identifies policy consequences, trade-offs, or alternatives</td></tr>
      <tr><td><code>economic</code></td><td>Presents economic data, cost estimates, or CBA challenges</td></tr>
      <tr><td><code>technical</code></td><td>Identifies scientific errors or provides new data</td></tr>
      <tr><td><code>anecdotal</code></td><td>Shares personal or organizational experience</td></tr>
      <tr><td><code>non_substantive</code></td><td>General support/opposition without engaging specifics</td></tr>
    </tbody>
  </table>
  <p>Multi-label supported. Primary label = highest confidence. Low confidence (&lt;0.5) &rarr; automatically flagged for human review.</p>

  <h3>AI Categories (GPT-4o)</h3>
  <p>Separate from the classification labels. GPT-4o reads 200 representative comments and proposes exactly 5 high-level categories. Then GPT-4o-mini assigns every comment to one category and scores:</p>
  <table>
    <thead><tr><th>Score</th><th>Scale</th><th>Meaning</th></tr></thead>
    <tbody>
      <tr><td>Support</td><td>1&ndash;10</td><td>10 = strongly supports the rule, 5 = neutral, 1 = strongly opposes</td></tr>
      <tr><td>Credibility</td><td>1&ndash;10</td><td>10 = expert with data/legal citations, 5 = reasonable argument, 1 = vague opinion</td></tr>
    </tbody>
  </table>

  <h3>Stance Detection</h3>
  <p>Each comment receives one of: <code>support</code>, <code>oppose</code>, <code>conditional</code>, <code>neutral</code>. Inferred by GPT-4o during classification, not from CIS scores.</p>

  <h3>Stakeholder Inference</h3>
  <p>Commenter type is inferred from the comment text (not Regulations.gov metadata, which is often empty). Types: Gov&apos;t, trade association, organization, academic, law firm, individual. Based on phrases like &ldquo;on behalf of&rdquo;, &ldquo;the City of&rdquo;, &ldquo;our association&rdquo;.</p>
</>)}

function Responsible() { return (<>
  <h2>Responsible AI</h2>

  <h3>Viewpoint Neutrality</h3>
  <p>The system evaluates <em>HOW</em> arguments are made, never <em>WHAT</em> position is taken. A well-reasoned comment supporting a rule and a well-reasoned comment opposing it must receive comparable scores.</p>

  <h3>No Suppression</h3>
  <p>Every comment is analyzed. None is excluded based on content, viewpoint, or commenter identity. Campaign comments are detected but not devalued &mdash; many campaigns represent legitimate grassroots organizing.</p>

  <h3>Transparency</h3>
  <p>All methodology is documented. The CIS formula, factor weights, and scoring rubrics are published. Every comment card shows the full agentic pipeline reasoning. Every score has a confidence interval.</p>

  <h3>Bias Detection</h3>
  <p>The Bias Audit computes score distributions for CIS and all 7 factors. Comments in the 3% tails (1.5% each side) are flagged as outliers. Users can click through to inspect any flagged comment and its full scoring breakdown.</p>

  <h3>Human-in-the-Loop</h3>
  <p>All AI outputs are recommendations. Low-confidence classifications, novel arguments, and label-score inconsistencies are automatically flagged for human review. Reviewers can confirm, modify, or reject any analysis.</p>

  <h3>Reproducibility</h3>
  <p>Peer-based factors (N, T, V) are fully deterministic. AI agent factors (L, E, R, C) use GPT-4o with temperature=0.2 for consistency. All model versions and parameters are logged in the Admin tab.</p>
</>)}

function Architecture() { return (<>
  <h2>Architecture</h2>

  <h3>Technology Stack</h3>
  <table>
    <thead><tr><th>Layer</th><th>Technology</th><th>Purpose</th></tr></thead>
    <tbody>
      <tr><td>Language</td><td>Python 3.11</td><td>ML/NLP ecosystem</td></tr>
      <tr><td>API</td><td>FastAPI (async)</td><td>REST endpoints, auto-docs at /docs</td></tr>
      <tr><td>Graph DB</td><td>Neo4j 5.x</td><td>Knowledge graph, Cypher queries</td></tr>
      <tr><td>Embeddings</td><td>all-MiniLM-L6-v2</td><td>384-dim sentence embeddings</td></tr>
      <tr><td>Clustering</td><td>BERTopic</td><td>UMAP + HDBSCAN + c-TF-IDF</td></tr>
      <tr><td>Classification</td><td>GPT-4o (OpenAI)</td><td>CIS Agentic Pipeline, 8 parallel</td></tr>
      <tr><td>Categories</td><td>GPT-4o + GPT-4o-mini</td><td>Discovery (4o) + assignment (4o-mini)</td></tr>
      <tr><td>Summary</td><td>GPT-5.4 (OpenAI)</td><td>Executive briefing generation</td></tr>
      <tr><td>Similarity</td><td>scikit-learn cosine</td><td>Near-duplicate detection</td></tr>
      <tr><td>PDF Extraction</td><td>pdfplumber</td><td>Attachment text extraction (max 3K chars)</td></tr>
      <tr><td>Frontend</td><td>Next.js 14 + React</td><td>Dashboard, SSR</td></tr>
      <tr><td>Charts</td><td>Recharts + D3.js</td><td>Histograms, Sankey, force graph</td></tr>
      <tr><td>Deployment</td><td>Docker Compose</td><td>Neo4j + backend + frontend</td></tr>
    </tbody>
  </table>

  <h3>API Endpoints (15+)</h3>
  <pre>{`GET  /api/dockets                     List dockets
GET  /api/dockets/{id}                Docket detail + exec summary
GET  /api/dockets/{id}/stats          Dashboard statistics
GET  /api/dockets/{id}/ai-categories  AI categories + scores
GET  /api/dockets/{id}/cis-factors    Per-comment CIS factors
GET  /api/dockets/{id}/graph          Knowledge graph (D3)
GET  /api/dockets/{id}/comment-timeline  Cumulative timeline
GET  /api/dockets/{id}/stakeholder-theme-flow  Sankey data
GET  /api/dockets/{id}/bias-audit     Fairness metrics
GET  /api/dockets/{id}/category-arguments/{cat}  For/against
GET  /api/comments/{id}               Full comment card
GET  /api/admin/status                System status
POST /api/dockets/{id}/run-ai-categories  Run categorization
POST /api/dockets/{id}/generate-summary   Regenerate summary`}</pre>

  <h3>Data Flow</h3>
  <pre>{`Regulations.gov API → 8 parallel fetches → Neo4j (streaming)
  → Embeddings (all-MiniLM-L6-v2)
  → Dedup (SHA-256 + cosine ≥ 0.92)
  → BERTopic clustering (UMAP → HDBSCAN → c-TF-IDF)
  → CIS Agentic Pipeline (GPT-4o, 8 parallel)
  → AI Categories (GPT-4o discovery + GPT-4o-mini assignment)
  → Executive Summary (GPT-5.4)
  → Dashboard (Next.js + FastAPI)`}</pre>

  <h3>Performance</h3>
  <table>
    <thead><tr><th>Operation</th><th>Speed</th></tr></thead>
    <tbody>
      <tr><td>Comment ingestion</td><td>~8 comments/sec (parallel, with attachments)</td></tr>
      <tr><td>CIS classification</td><td>~2.5 comments/sec (8 parallel GPT-4o)</td></tr>
      <tr><td>AI category assignment</td><td>~5 comments/sec (8 parallel GPT-4o-mini)</td></tr>
      <tr><td>Dashboard load</td><td>&lt;1 sec (Neo4j Cypher queries)</td></tr>
      <tr><td>Executive summary</td><td>~5 sec (single GPT-5.4 call)</td></tr>
    </tbody>
  </table>
</>)}
