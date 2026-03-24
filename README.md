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
A transparent **7-factor weighted formula** combining AI agent assessment (60%) with peer-based numerical analysis (40%):

```
CIS = 0.20×L + 0.15×E + 0.15×R + 0.10×C + 0.20×N + 0.10×T + 0.10×V
```

| Group | Factors | Weight | Computation |
|-------|---------|--------|-------------|
| **AI Agent** | L (Legal), E (Economic), R (Regulatory), C (Credibility) | 60% | GPT-4o reads + reasons |
| **Peer-Based** | N (Novelty), T (Thematic), V (Volume) | 40% | Embeddings + clusters (deterministic) |

Every score includes a 90% confidence interval. Every factor is visible on the comment card.

### 3. CIS Agentic Pipeline
Each comment passes through **9 AI agents** that assess it from multiple angles:

```
Comment → Comprehension → Provision Scanner → Evidence Extractor
  → Legal Analyst → Economic Analyst → Technical Analyst
  → Policy Analyst → Classifier → Uncertainty Assessor → CIS
```

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
├── backend/
│   ├── api/              # FastAPI routes (15+ endpoints)
│   ├── analysis/         # CIS scoring, classifier, AI categories, summarizer
│   ├── ingestion/        # Federal Register + Regulations.gov API clients
│   ├── processing/       # Normalization, embeddings, dedup, attachments
│   ├── config.py         # Pydantic settings
│   ├── graph.py          # Neo4j driver + schema + CRUD helpers
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/          # Next.js pages
│   │   ├── components/   # 14 React components
│   │   └── lib/          # API client, CIS constants
│   └── package.json
├── docker-compose.yml
├── run_pipeline.py       # Full pipeline entry point
├── run_classify.py       # Classification-only (resumable)
└── README.md
```

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
