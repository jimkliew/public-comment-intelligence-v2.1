<p align="center">
  <img src="frontend/public/sokat-logo.jpg" alt="SoKat" height="60" />
</p>

<h1 align="center">Public Comment Intelligence v2.1</h1>

<p align="center">
  <strong>AI-Enabled Public Comment Analysis &amp; Substantiveness Scoring for Federal Rulemaking</strong><br/>
  <em>Built by <a href="https://www.sokat.com">SoKat</a> for the ACT-IAC Hackathon &mdash; March 27, 2026</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11-blue" alt="Python" />
  <img src="https://img.shields.io/badge/Next.js-14-black" alt="Next.js" />
  <img src="https://img.shields.io/badge/Neo4j-5.x-green" alt="Neo4j" />
  <img src="https://img.shields.io/badge/OpenAI-GPT--4o%20%7C%20GPT--5.4-orange" alt="OpenAI" />
</p>

---

## The Problem

Under the Administrative Procedure Act (APA), federal agencies must review, consider, and respond to substantive public comments before finalizing regulations. A single rulemaking can receive **thousands of comments** — including coordinated campaigns, detailed legal briefs, and economic impact analyses. Manual review is slow, inconsistent, and cannot scale. Under the "hard look" doctrine, failure to address a significant comment can result in **judicial remand**.

## The Solution

Public Comment Intelligence uses AI to **augment — not replace — human reviewers**. The platform ingests public comments from Regulations.gov, analyzes them with multiple AI agents, and produces transparent, traceable outputs suitable for agency review.

### Live Demo: EPA PFAS Drinking Water Rule

The platform is demonstrated on **EPA Docket EPA-HQ-OW-2022-0114** — the proposed PFAS National Primary Drinking Water Regulation, one of the most significant EPA rulemakings in recent years.

| Metric | Value |
|--------|-------|
| Comments Ingested | 1,165 |
| Unique (after dedup) | 1,138 |
| AI-Classified & Scored | 1,127 |
| AI Categories | 5 |
| Campaigns Detected | 32 |
| Executive Summary | GPT-5.4 |

---

## Key Capabilities

### 1. AI Categories
GPT-4o reads 200 representative comments and discovers **5 meaningful categories**. Then GPT-4o-mini assigns every comment to a category and scores it on **Support (1-10)** and **Credibility (1-10)**. The cross-category bubble chart shows where each category falls on the support × credibility matrix.

### 2. Comment Impact Score (CIS)
A transparent **7-factor weighted formula** combining AI agent assessment (60%) with peer-based numerical analysis (40%). The CIS quantifies a comment's potential to influence the final rule, based on factors that courts and agencies historically weigh when evaluating comment significance.

```
CIS = 0.20×L + 0.15×E + 0.15×R + 0.10×C + 0.20×N + 0.10×T + 0.10×V
```

| Factor | Weight | Group | Scoring Rubric |
|--------|--------|-------|---------------|
| **L** Legal Specificity | 0.20 | AI Agent | 0.0 = none → 0.25 = general legal language → 0.50 = 1 citation → 0.75 = 2+ citations with analysis → 1.0 = detailed legal brief |
| **N** Novelty | 0.20 | Peer-Based | HDBSCAN outlier distance: unique arguments score highest. Large-cluster comments (>5% of total) score 0.1. Novel outliers can reach 1.0. |
| **E** Economic Evidence | 0.15 | AI Agent | 0.0 = none → 0.25 = qualitative → 0.50 = unsourced estimates → 0.75 = sourced with methodology → 1.0 = original quantitative analysis |
| **R** Regulatory Engagement | 0.15 | AI Agent | 0.0 = no rule reference → 0.25 = general topic → 0.50 = specific sections → 0.75 = quotes + critique → 1.0 = alternative regulatory language |
| **C** Credibility Signals | 0.10 | AI Agent | Inferred from text: anonymous (0.0), individual (0.25), organization (0.50), trade assoc/academic (0.75), law firm/government (1.0) |
| **T** Thematic Centrality | 0.10 | Peer-Based | Cosine similarity to cluster centroid. Central comments articulate a theme most clearly. |
| **V** Volume Signal | 0.10 | Peer-Based | Cluster size / max cluster size. Campaign-affiliated comments penalized 0.5× to avoid astroturf overweighting. |

**Design rationale:** Novelty and Legal Specificity share the highest weight (0.20 each) because under the "hard look" doctrine, failure to address a novel legal argument is a primary basis for judicial remand. The Credibility factor has the lowest weight (0.10) with strict guardrails — it captures expertise signals only, never viewpoint.

**Confidence intervals:** Every CIS includes a 90% CI computed by perturbing each factor by its confidence-adjusted error margin. AI-assessed factors (L, E, R, C) have wider margins (±0.25 × (1 - confidence)) than peer-based factors (T, N: ±0.05; V: ±0.02).

**Impact tiers:** 90-100 Critical | 70-89 High | 50-69 Moderate | 30-49 Low | 0-29 Minimal

Every score, every factor, and the full chain-of-thought reasoning is visible on the comment card in the dashboard.

### 3. CIS Agentic Pipeline

Each comment passes through a **9-step chain-of-thought pipeline** where GPT-4o reasons about the comment from multiple analytical angles before assigning labels and scores. This mirrors how a human analyst would read a comment — understanding it first, then systematically evaluating its legal, economic, technical, and policy dimensions.

```
  Comment Text
       │
       ▼
┌─────────────────────────────────────────────────────────────────┐
│  Agent 1: COMPREHENSION                                         │
│  "What is the commenter's main point?" (1-sentence summary)     │
├─────────────────────────────────────────────────────────────────┤
│  Agent 2: PROVISION SCANNER                                     │
│  Does the comment reference specific provisions of the          │
│  proposed rule or its preamble? (Yes/No + which provisions)     │
├─────────────────────────────────────────────────────────────────┤
│  Agent 3: EVIDENCE EXTRACTOR                                    │
│  What types of evidence does the comment provide?               │
│  (legal citations, data, studies, personal experience, none)    │
├─────────────────────────────────────────────────────────────────┤
│  Agent 4: LEGAL ANALYST                                         │
│  Does the comment raise legal issues? Cites statutes, case      │
│  law, executive orders, constitutional provisions?              │
├─────────────────────────────────────────────────────────────────┤
│  Agent 5: ECONOMIC ANALYST                                      │
│  Does the comment present economic claims? Quantitative or      │
│  qualitative? Original analysis, sourced estimates, or general? │
├─────────────────────────────────────────────────────────────────┤
│  Agent 6: TECHNICAL ANALYST                                     │
│  Does the comment challenge or supplement the agency's          │
│  scientific/technical analysis? New data or corrections?        │
├─────────────────────────────────────────────────────────────────┤
│  Agent 7: POLICY ANALYST                                        │
│  Does the comment discuss policy alternatives, trade-offs,      │
│  unintended consequences, or distributional impacts?            │
├─────────────────────────────────────────────────────────────────┤
│  Agent 8: CLASSIFIER                                            │
│  Based on agents 1-7, assign substantiveness labels with        │
│  confidence scores. Multi-label: a comment can be both          │
│  "legal" and "economic". 6 categories available.                │
├─────────────────────────────────────────────────────────────────┤
│  Agent 9: UNCERTAINTY ASSESSOR                                  │
│  What could change this classification? Flag low-confidence     │
│  results for human review.                                      │
└─────────────────────────────────────────────────────────────────┘
       │
       ▼
  CIS Score (0-100) + Confidence Interval + Impact Tier
```

**Why a chain-of-thought pipeline?** Under the APA's "hard look" doctrine, agencies must demonstrate they genuinely considered significant comments. A black-box classification isn't auditable. By forcing the AI through structured reasoning steps, every label traces back to specific evidence extracted from the comment text. Reviewers can inspect *why* a comment scored the way it did — not just *what* the score is.

**The 6 substantiveness categories:**

| Label | What It Means | Example Indicators |
|-------|--------------|-------------------|
| **Legal** | Cites statutes, case law, or constitutional provisions | "42 U.S.C. 300f", "Chevron v. NRDC", due process arguments |
| **Economic** | Presents cost/benefit data or quantitative analysis | "$4.2B compliance cost", CBA methodology, RIA challenges |
| **Technical** | Identifies scientific errors or provides new data | Lab results, emission factor corrections, feasibility data |
| **Policy** | Discusses alternatives, trade-offs, or consequences | "EPA should consider phased implementation", distributional impacts |
| **Anecdotal** | First-person experience relevant to the rule | "Our water utility serves 50K customers and cannot afford..." |
| **Non-substantive** | General support/opposition without specifics | "I support clean water" (no engagement with rule text) |

A single comment can receive **multiple labels** — e.g., a trade association brief might score as both `legal` (cites SDWA) and `economic` (original cost analysis). Each label carries an independent confidence score.

**Confidence calibration matters.** When the classifier is uncertain (confidence < 0.6), the comment is automatically flagged for human review rather than silently misclassified. The Uncertainty Assessor (Agent 9) explicitly documents what additional context would change the classification.

### 4. Stance & Stakeholder Analysis
GPT-4o classifies each comment as **support / oppose / conditional / neutral** and infers commenter type from the text itself (Gov't, trade association, organization, academic, law firm, individual).

### 5. Duplicate & Campaign Detection
- **Exact duplicates**: SHA-256 hash matching
- **Near-duplicates**: Cosine similarity ≥ 0.92 on sentence-transformer embeddings (all-MiniLM-L6-v2)
- **Campaign clustering**: Connected components on the near-duplicate graph
- **Timeline**: Cumulative comments with dedup and similar-removal lines

### 6. Executive Summary
**GPT-5.4** generates a polished executive briefing with linked action items referencing specific comment IDs. Click any comment ID to open the full analysis card.

### 7. Bias Audit
Score distributions for CIS and all 7 factors. **3% tail outliers** (1.5% each side) are highlighted in red. Click any outlier to inspect its full scoring breakdown.

### 8. Knowledge Graph
D3 force-directed graph: **Docket → AI Categories → Comments**. Click a category node to see top 3 arguments for and against the rule. Click any comment to open its card.

### 9. Stakeholder → Category Flow
Sankey diagram showing which stakeholder types (Gov't, trade assoc, individual, etc.) are commenting on which AI categories. Flow width = comment volume.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Data Sources                          │
│  Federal Register API    Regulations.gov API (+ PDFs)   │
└──────────────────────┬──────────────────────────────────┘
                       │ 8 parallel async fetches
                       ▼
┌─────────────────────────────────────────────────────────┐
│                   Neo4j Knowledge Graph                  │
│  11 node types · 14 relationship types · streaming load │
└──────────────────────┬──────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
  ┌──────────┐  ┌──────────┐  ┌──────────────┐
  │Embeddings│  │ BERTopic │  │ CIS Agentic  │
  │MiniLM-L6 │  │UMAP+HDBSCAN│ │  Pipeline   │
  │ 384-dim  │  │ c-TF-IDF │  │  GPT-4o ×8  │
  └────┬─────┘  └──────────┘  └──────┬───────┘
       │                              │
       ▼                              ▼
  ┌──────────┐              ┌──────────────────┐
  │  Dedup   │              │  AI Categories   │
  │SHA-256 + │              │GPT-4o + 4o-mini  │
  │cos≥0.92  │              │ Support/Credib.  │
  └──────────┘              └──────────────────┘
                                      │
                       ┌──────────────┼──────────┐
                       ▼              ▼          ▼
                 ┌──────────┐  ┌──────────┐ ┌────────┐
                 │ Summary  │  │Dashboard │ │  Bias  │
                 │ GPT-5.4  │  │Next.js+D3│ │ Audit  │
                 └──────────┘  └──────────┘ └────────┘
```

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python 3.11, FastAPI (async), Neo4j 5.x |
| AI Models | GPT-4o (classification), GPT-4o-mini (categories), GPT-5.4 (summary) |
| Embeddings | all-MiniLM-L6-v2 (384-dim, sentence-transformers) |
| Clustering | BERTopic (UMAP + HDBSCAN + c-TF-IDF) |
| PDF Extraction | pdfplumber (first 3K chars, max 2MB) |
| Frontend | Next.js 14, React, Tailwind CSS, Recharts, D3.js |
| Graph DB | Neo4j Community Edition (Docker) |
| Deployment | Docker Compose |

---

## Quick Start

### Prerequisites
- Docker (for Neo4j)
- Python 3.11+
- Node.js 18+
- OpenAI API key
- Regulations.gov API key (free from [api.data.gov](https://api.data.gov))

### Setup

```bash
# 1. Clone
git clone <repo-url>
cd public-comment-intelligence-v2.0

# 2. Start Neo4j
docker compose up neo4j -d

# 3. Backend
cd backend
cp .env.example .env   # Add your API keys
python3.11 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# 4. Frontend
cd ../frontend
npm install

# 5. Run the pipeline (ingests + classifies all comments)
cd ..
python run_pipeline.py EPA-HQ-OW-2022-0114

# 6. Generate AI Categories
python run_classify.py EPA-HQ-OW-2022-0114

# 7. Start servers
# Terminal 1:
cd backend && source .venv/bin/activate && python -m uvicorn api.main:app --port 8000
# Terminal 2:
cd frontend && npm run dev

# 8. Open http://localhost:3000
```

### Environment Variables

```env
OPENAI_API_KEY=sk-...
REGULATIONS_GOV_API_KEY=...
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=docketiq2024
```

---

## Responsible AI

- **Viewpoint Neutrality**: Evaluates HOW arguments are made, never WHAT position is taken
- **No Suppression**: Every comment is analyzed regardless of content or commenter identity
- **Transparency**: All methodology published, every score traceable to source text
- **Bias Detection**: 3% tail outlier detection across all CIS factors
- **Human-in-the-Loop**: All outputs are recommendations, not determinations
- **Reproducibility**: Peer-based factors deterministic; AI factors at temperature=0.2

---

## Project Structure

```
public-comment-intelligence/
├── .github/workflows/
│   └── ci.yml            # GitHub Actions: lint, test, typecheck, Docker build
├── backend/
│   ├── api/              # FastAPI routes (15+ endpoints)
│   ├── analysis/         # CIS scoring, classifier, AI categories, summarizer
│   ├── ingestion/        # Federal Register + Regulations.gov API clients
│   ├── processing/       # Normalization, embeddings, dedup, attachments
│   ├── tests/            # 104 unit tests (pytest)
│   ├── evals/            # Golden-set evaluation harness
│   ├── config.py         # Pydantic settings
│   ├── graph.py          # Neo4j driver + schema + CRUD helpers
│   ├── requirements.txt
│   └── requirements-dev.txt
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js pages
│   │   ├── components/   # 14 React components
│   │   └── lib/          # API client, CIS constants
│   └── package.json
├── docker-compose.yml
├── pyproject.toml         # Ruff linter + pytest config
├── Makefile               # make lint / make test / make ci
├── run_pipeline.py        # Full pipeline entry point
├── run_classify.py        # Classification-only (resumable)
└── README.md
```

---

## Test Suite & CI

The platform includes **104 unit tests** covering the core analytical logic, run automatically on every push via GitHub Actions.

```bash
make test     # Run all tests
make lint     # Python linting (ruff)
make ci       # Full CI suite: lint + test + typecheck
```

### Test Coverage

| Module | Tests | What's Covered |
|--------|-------|----------------|
| **CIS Scoring** (`test_scoring.py`) | 33 | All 7 factor computations, weight invariants (sum to 1.0, AI=60%/Peer=40%), composite CIS, tier boundaries, confidence intervals |
| **Text Normalization** (`test_normalize.py`) | 30 | HTML entity decoding, tag stripping, URL removal, Unicode normalization, stub detection (13 parametrized cases), commenter type inference |
| **Dedup & Campaigns** (`test_dedup.py`) | 13 | SHA-256 hash equivalence, cosine similarity thresholding, campaign classification (Organized/Coordinated/Informal), connected components |
| **API Endpoints** (`test_api.py`) | 6 | Health check, docket listing, comment detail, admin status — all with mocked Neo4j |

### GitHub Actions CI Pipeline

Four jobs run in parallel on every push to `main`:

| Job | What It Does |
|-----|-------------|
| **Python Lint** | `ruff check` + `ruff format --check` with security rules (bandit) |
| **Python Tests** | `pytest` — 104 tests in <1 second |
| **Frontend Typecheck** | `tsc --noEmit` — strict TypeScript validation |
| **Docker Build** | Full `docker compose build` — catches Dockerfile and dependency issues |

---

## Performance

| Operation | Speed |
|-----------|-------|
| Comment ingestion (with PDF attachments) | ~8 comments/sec |
| CIS classification (8 parallel GPT-4o) | ~2.5 comments/sec |
| AI category assignment (8 parallel GPT-4o-mini) | ~5 comments/sec |
| Dashboard load | <1 sec |
| Executive summary (GPT-5.4) | ~5 sec |
| Full pipeline (1,165 comments) | ~15 min |

---

## ACT-IAC Hackathon Submission

**Team**: [SoKat](https://www.sokat.com)

**Challenge**: AI-Enabled Public Comment Intelligence & Substantiveness Analysis Platform

**Judging Criteria**:
- **Mission Relevance** (High) — Built for APA notice-and-comment rulemaking. CIS weights reflect what courts examine.
- **Technical Soundness** (High) — 7-factor CIS with AI agent + peer-based split, Neo4j knowledge graph, parallel async processing.
- **Explainability & Responsible AI** (High) — Full agentic pipeline reasoning visible, 3% tail bias detection, viewpoint neutrality.
- **Innovation** (Medium) — AI Categories with support × credibility scoring, Sankey stakeholder flows, GPT-5.4 executive summaries.
- **Demo Clarity** (Medium) — Live on 1,165 real PFAS comments with interactive drill-down to any comment card.

---

<p align="center">
  <strong>Public Comment Intelligence v2.1</strong><br/>
  <em>Scaling transparency, accountability, and analytical rigor in federal rulemaking.</em><br/><br/>
  <a href="https://www.sokat.com">SoKat</a> · ACT-IAC Hackathon 2026
</p>
