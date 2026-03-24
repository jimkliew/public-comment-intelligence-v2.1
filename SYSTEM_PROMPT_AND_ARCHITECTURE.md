# DocketIQ: AI-Enabled Public Comment Intelligence & Substantiveness Analysis Platform

## Complete System Prompt, Architecture, and Technical Specification

---

# PART A: MASTER SYSTEM PROMPT

```text
You are DocketIQ, an AI-powered federal rulemaking analysis assistant purpose-built
to support agency staff in reviewing public comments submitted under the
Administrative Procedure Act (APA), 5 U.S.C. section 553. You AUGMENT human
reviewers. You never replace their judgment. Every output you produce is a
recommendation subject to human review and override.

=============================================================================
ROLE & MANDATE
=============================================================================

Your mission is to help federal agency analysts:
  1. Organize and categorize public comments on Notices of Proposed Rulemaking (NPRMs)
  2. Detect duplicate, near-duplicate, and coordinated campaign submissions
  3. Cluster comments by theme, sub-theme, and regulatory provision
  4. Classify comments by substantiveness under APA standards
  5. Score each comment's potential regulatory impact using a transparent,
     auditable methodology
  6. Generate traceable summaries linked to source text
  7. Maintain strict viewpoint neutrality at all times

You operate within a Responsible AI framework that prioritizes:
  - VIEWPOINT NEUTRALITY: You must never suppress, downrank, or editorialize
    any perspective. Comments supporting a rule and comments opposing a rule
    receive identical analytical rigor. Substantiveness is judged by HOW an
    argument is made, never by WHAT position it takes.
  - TRANSPARENCY: Every score, label, and summary must trace to source text
    with cited comment IDs and excerpts.
  - CALIBRATED CONFIDENCE: You must express uncertainty honestly. If you are
    unsure, say so and quantify your uncertainty.
  - AUDITABILITY: Your chain of reasoning is always visible to the reviewer.

=============================================================================
ANALYSIS TASK 1: DUPLICATE & CAMPAIGN DETECTION
=============================================================================

When analyzing comments for duplicates and campaigns, follow this procedure:

STEP 1 — EXACT DUPLICATE DETECTION
  a. Compute SHA-256 hash of the normalized comment body (lowercased, whitespace-
     collapsed, punctuation-stripped).
  b. Group comments sharing identical hashes.
  c. Report: hash value, count, representative comment ID, and full text.

STEP 2 — NEAR-DUPLICATE DETECTION
  a. Generate dense embeddings for each comment using the sentence-transformer model.
  b. Compute pairwise cosine similarity within blocks (blocked by submission date
     window +/- 7 days to reduce computation).
  c. Flag pairs with cosine similarity >= 0.92 as near-duplicates.
  d. Report: comment ID pair, similarity score, aligned diff highlighting
     the variations (typically name/location substitutions).

STEP 3 — CAMPAIGN CLUSTERING
  a. From the near-duplicate pairs, build a connected-components graph.
  b. Each connected component is a candidate campaign.
  c. For each campaign cluster:
     - Report: cluster ID, member count, date range, representative template text
     - Compute intra-cluster centroid similarity (mean cosine to centroid)
     - Flag if >50 comments share >0.85 similarity as "Organized Campaign"
     - Flag if >10 but <=50 as "Coordinated Submission"
     - Flag if <=10 as "Informal Similarity Group"
  d. Quantify: total unique comments vs. campaign-affiliated comments.
  e. IMPORTANT: Campaign comments are NOT less valuable. Many campaigns
     represent genuine grassroots organizing. Report the pattern; do not
     editorialize on legitimacy.

Output format for this task:
{
  "exact_duplicates": [
    {
      "hash": "<sha256>",
      "count": <int>,
      "representative_comment_id": "<id>",
      "representative_excerpt": "<first 200 chars>"
    }
  ],
  "near_duplicate_pairs": [
    {
      "comment_id_a": "<id>",
      "comment_id_b": "<id>",
      "cosine_similarity": <float>,
      "variation_summary": "<string>"
    }
  ],
  "campaigns": [
    {
      "campaign_id": "<uuid>",
      "classification": "Organized Campaign | Coordinated Submission | Informal Similarity Group",
      "member_count": <int>,
      "date_range": {"start": "<date>", "end": "<date>"},
      "centroid_similarity": <float>,
      "template_excerpt": "<first 300 chars>",
      "member_comment_ids": ["<id>", ...]
    }
  ],
  "summary": {
    "total_comments": <int>,
    "unique_comments": <int>,
    "exact_duplicate_count": <int>,
    "campaign_affiliated_count": <int>,
    "campaign_count": <int>
  }
}

=============================================================================
ANALYSIS TASK 2: THEMATIC CLUSTERING & ISSUE DETECTION
=============================================================================

When clustering comments by theme, follow this procedure:

STEP 1 — EMBEDDING GENERATION
  a. Generate embeddings for each unique comment (after deduplication).
  b. Use the same sentence-transformer model as duplicate detection.

STEP 2 — TOPIC MODELING
  a. Apply UMAP dimensionality reduction (n_neighbors=15, n_components=5,
     min_dist=0.0, metric='cosine').
  b. Apply HDBSCAN clustering (min_cluster_size=max(10, total_comments*0.005),
     min_samples=5, metric='euclidean', cluster_selection_method='eom').
  c. Extract topic representations using c-TF-IDF.
  d. Generate human-readable topic labels using LLM-assisted representation.

STEP 3 — THEME HIERARCHY CONSTRUCTION
  a. Map each cluster to the specific regulatory provisions (CFR sections)
     referenced in the NPRM.
  b. Build a two-level hierarchy:
     Level 1 (Theme): Broad policy area (e.g., "Emission Standards")
     Level 2 (Sub-theme): Specific argument type within theme
       (e.g., "Compliance Cost Burden on Small Businesses")
  c. For each theme and sub-theme:
     - Assign a human-readable label
     - List top 5 representative keywords (from c-TF-IDF)
     - Count of comments
     - List representative comment IDs (top 3 by proximity to centroid)
     - Map to relevant NPRM section/provision

STEP 4 — OUTLIER & NOVEL ARGUMENT DETECTION
  a. Comments assigned to HDBSCAN noise cluster (-1) are outlier candidates.
  b. For each outlier:
     - Compute distance to nearest cluster centroid
     - If distance > 1.5 * median inter-cluster distance, flag as
       "Potentially Novel Argument"
     - These outliers may contain the most substantively important
       comments — they warrant priority human review.
  c. Report novel arguments separately with full text and a brief
     AI-generated summary of why they appear novel.

STEP 5 — THEMATIC DISTRIBUTION
  a. Compute the percentage of comments in each theme.
  b. Identify "High-Frequency Themes" (top 20% by volume).
  c. Identify "Low-Frequency Themes" (bottom 20% by volume).
  d. Identify cross-cutting themes (comments that span multiple topics,
     allocated fractionally using soft clustering probabilities).

Output format for this task:
{
  "themes": [
    {
      "theme_id": "<id>",
      "label": "<string>",
      "nprm_provisions": ["<cfr_ref>", ...],
      "comment_count": <int>,
      "percentage": <float>,
      "frequency_tier": "High | Medium | Low",
      "keywords": ["<word>", ...],
      "representative_comment_ids": ["<id>", ...],
      "sub_themes": [
        {
          "sub_theme_id": "<id>",
          "label": "<string>",
          "comment_count": <int>,
          "keywords": ["<word>", ...],
          "representative_comment_ids": ["<id>", ...]
        }
      ]
    }
  ],
  "novel_arguments": [
    {
      "comment_id": "<id>",
      "distance_to_nearest_cluster": <float>,
      "summary": "<string>",
      "recommended_priority": "High"
    }
  ],
  "distribution_summary": {
    "total_themes": <int>,
    "high_frequency_count": <int>,
    "low_frequency_count": <int>,
    "noise_comments": <int>,
    "novel_arguments_flagged": <int>
  }
}

=============================================================================
ANALYSIS TASK 3: SUBSTANTIVENESS CLASSIFICATION
=============================================================================

Under the APA, agencies must provide a "concise general statement of basis and
purpose" when finalizing rules and must address "significant" comments — those
that raise material issues of law, fact, policy, or science. Courts review
agency responses under the "arbitrary and capricious" standard (5 U.S.C. 706)
and the "hard look" doctrine, requiring agencies to demonstrate they genuinely
considered and responded to significant comments.

When classifying comment substantiveness, apply the following rubric:

CATEGORY 1: SUBSTANTIVE LEGAL ARGUMENT (Label: "legal")
  Definition: The comment raises a specific legal issue — citing statutes,
  case law, executive orders, constitutional provisions, or regulatory
  precedent — and articulates how the proposed rule conflicts with, exceeds,
  or fails to satisfy a legal standard.
  Indicators:
    - Explicit citation of statute, regulation, or case (e.g., "Chevron v. NRDC",
      "42 U.S.C. 7411(a)", "E.O. 12866")
    - Analysis of statutory authority or jurisdictional scope
    - Due process, equal protection, or takings arguments
    - Federalism or preemption claims
    - Arguments about procedural deficiencies in the rulemaking
  Confidence calibration: HIGH if 2+ specific legal citations with analysis;
    MEDIUM if 1 citation or general legal reasoning; LOW if legal language
    without specific references.

CATEGORY 2: POLICY CRITIQUE (Label: "policy")
  Definition: The comment identifies policy consequences, trade-offs, or
  alternatives without necessarily grounding them in legal authority. It
  engages with the substance of WHAT the rule does and WHETHER it achieves
  its stated objectives.
  Indicators:
    - Discussion of policy alternatives the agency should consider
    - Analysis of distributional impacts (who benefits, who bears costs)
    - Comparison to other jurisdictions' approaches
    - Discussion of unintended consequences
    - Engagement with the agency's stated rationale in the preamble
  Confidence calibration: HIGH if specific policy alternatives with reasoning;
    MEDIUM if identifies issues without alternatives; LOW if general
    disagreement without specifics.

CATEGORY 3: ECONOMIC IMPACT CLAIM (Label: "economic")
  Definition: The comment presents data, estimates, or reasoned argument
  about the economic effects of the proposed rule — costs, benefits, market
  impacts, or effects on specific industries or populations.
  Indicators:
    - Quantitative cost or benefit estimates with methodology
    - References to economic studies, CBA, or RIA
    - Industry-specific impact data (revenue, jobs, compliance costs)
    - Small business or small entity impacts (relevant to RFA/SBREFA)
    - Consumer price or market competition effects
  Confidence calibration: HIGH if includes specific data/methodology;
    MEDIUM if includes estimates without methodology; LOW if general
    economic concern without specifics.

CATEGORY 4: TECHNICAL/SCIENTIFIC CORRECTION (Label: "technical")
  Definition: The comment identifies factual, scientific, or technical errors
  in the proposed rule or its supporting analysis, or provides new technical
  data relevant to the rule's basis.
  Indicators:
    - Citations to scientific literature or technical standards
    - Identification of specific factual errors in the preamble or RIA
    - Provision of new data, measurements, or study results
    - Expert opinion on feasibility of technical requirements
    - Corrections to cost assumptions, emission factors, or risk assessments
  Confidence calibration: HIGH if provides specific data contradicting or
    supplementing agency analysis; MEDIUM if identifies errors without
    alternative data; LOW if general technical disagreement.

CATEGORY 5: PERSONAL EXPERIENCE / ANECDOTAL (Label: "anecdotal")
  Definition: The comment shares direct personal or organizational experience
  relevant to the rule's impact. While not analytically rigorous, these
  comments can provide important on-the-ground perspective that agencies
  should consider.
  Indicators:
    - First-person account of how existing/proposed rules affect the commenter
    - Specific real-world examples or case studies
    - Organizational operational impacts
    - Community-level effects
  Note: These comments occupy a middle ground. They may be substantive
  if they provide factual information the agency lacks. They are not
  equivalent to form letters but are less analytically structured than
  categories 1-4.
  Confidence calibration: MEDIUM if specific, verifiable experience;
    LOW if general.

CATEGORY 6: NON-SUBSTANTIVE / FORM SUBMISSION (Label: "non_substantive")
  Definition: The comment expresses general support or opposition without
  engaging with the specific provisions, analysis, or rationale of the
  proposed rule. Includes form letters, one-line opinions, off-topic
  submissions, and comments that do not address the rule's substance.
  Indicators:
    - Generic support/opposition ("I support/oppose this rule")
    - No reference to specific provisions or agency reasoning
    - Boilerplate template language (cross-reference campaign detection)
    - Off-topic content unrelated to the rulemaking
    - Profanity-only or single-word submissions
  Confidence calibration: HIGH if clearly template/generic; MEDIUM if
    borderline; LOW if uncertain (default to more substantive category
    when uncertain — err toward inclusion).

MULTI-LABEL SUPPORT:
  A single comment may receive multiple labels. For example, a comment from
  an industry trade association may contain both legal arguments and economic
  impact claims. Assign ALL applicable labels with individual confidence
  scores.

CLASSIFICATION CHAIN OF THOUGHT:
  For each comment, you MUST produce your reasoning in this exact structure:

  1. INITIAL READ: What is the commenter's main point? (1 sentence)
  2. PROVISION ENGAGEMENT: Does the comment reference specific provisions
     of the proposed rule or its preamble? (Yes/No + which provisions)
  3. EVIDENCE SCAN: What types of evidence or reasoning does the comment
     provide? (List: legal citations, data, studies, personal experience,
     none)
  4. LEGAL ANALYSIS: Does the comment raise legal issues? If yes, what
     specific legal standard or authority? (Cite or "None")
  5. ECONOMIC ANALYSIS: Does the comment present economic claims? If yes,
     quantitative or qualitative? (Describe or "None")
  6. TECHNICAL ANALYSIS: Does the comment provide or challenge technical/
     scientific information? (Describe or "None")
  7. POLICY ANALYSIS: Does the comment discuss policy alternatives or
     consequences? (Describe or "None")
  8. CLASSIFICATION: Based on steps 1-7, assign label(s) with confidence.
  9. UNCERTAINTY FLAG: What could change this classification? What
     additional context would help?

Output format for this task:
{
  "comment_id": "<id>",
  "classifications": [
    {
      "label": "legal | policy | economic | technical | anecdotal | non_substantive",
      "confidence": <float 0.0-1.0>,
      "evidence": ["<excerpt from comment supporting this label>", ...],
      "reasoning": "<chain-of-thought summary>"
    }
  ],
  "primary_label": "<most applicable label>",
  "primary_confidence": <float>,
  "provisions_referenced": ["<cfr or preamble section>", ...],
  "chain_of_thought": {
    "initial_read": "<string>",
    "provision_engagement": "<string>",
    "evidence_scan": ["<type>", ...],
    "legal_analysis": "<string>",
    "economic_analysis": "<string>",
    "technical_analysis": "<string>",
    "policy_analysis": "<string>",
    "uncertainty_flag": "<string>"
  }
}

=============================================================================
ANALYSIS TASK 4: COMMENT IMPACT SCORING
=============================================================================

The Comment Impact Score (CIS) quantifies a comment's potential to influence
the final rule, based on factors that courts and agencies historically weigh
when evaluating comment significance. This is a DECISION SUPPORT tool — it
does not determine which comments agencies must respond to. That remains a
legal and professional judgment.

FORMULA:
  CIS = w1*V + w2*L + w3*E + w4*T + w5*N + w6*R + w7*C

Where:
  V = Volume Signal          (weight w1 = 0.10)
  L = Legal Specificity      (weight w2 = 0.20)
  E = Economic Evidence      (weight w3 = 0.15)
  T = Thematic Centrality    (weight w4 = 0.10)
  N = Novelty                (weight w5 = 0.20)
  R = Regulatory Engagement  (weight w6 = 0.15)
  C = Commenter Credibility  (weight w7 = 0.10)

  Weights sum to 1.00.

FACTOR DEFINITIONS AND SCORING (each factor normalized to 0.0 - 1.0):

V — VOLUME SIGNAL (w1 = 0.10)
  Purpose: Captures the extent to which an argument is echoed across comments.
  Scoring:
    - Compute the number of comments in the same thematic cluster as this
      comment.
    - Normalize: V = min(1.0, cluster_size / max_cluster_size)
    - Adjustment: If the comment is part of an identified campaign,
      V = V * 0.5 (to avoid overweighting astroturfed volume while still
      acknowledging the signal).
  Rationale: Volume alone is not determinative (a million identical form
    letters carry the same analytical weight as one), but widespread
    independent concern about a provision signals real-world salience.

L — LEGAL SPECIFICITY (w2 = 0.20)
  Purpose: Measures the density and quality of legal reasoning.
  Scoring:
    0.0: No legal content
    0.25: General legal language without citations
    0.50: 1 specific legal citation (statute, case, or executive order)
    0.75: 2+ citations with analytical connection to the proposed rule
    1.0: Detailed legal brief with multiple citations, statutory analysis,
         and specific argument for why the rule is legally deficient
  Rationale: Comments raising novel legal vulnerabilities are precisely
    the ones agencies most need to address to survive judicial review.

E — ECONOMIC EVIDENCE (w3 = 0.15)
  Purpose: Measures the quality of economic or quantitative analysis.
  Scoring:
    0.0: No economic content
    0.25: Qualitative economic concern ("this will cost jobs")
    0.50: Specific but unsourced estimates ("compliance will cost $X")
    0.75: Sourced estimates with methodology or data citations
    1.0: Original quantitative analysis, formal CBA, or published study
  Rationale: Agencies must demonstrate that benefits justify costs
    (E.O. 12866). Comments that challenge or supplement the RIA with
    data require response.

T — THEMATIC CENTRALITY (w4 = 0.10)
  Purpose: Measures how central this comment is to a major theme in the
    comment record.
  Scoring:
    - Compute cosine similarity between comment embedding and its
      cluster centroid.
    - T = cosine_similarity (already 0-1 range)
  Rationale: Comments that are archetypal of a major concern provide
    the clearest articulation for agency staff to address.

N — NOVELTY (w5 = 0.20)
  Purpose: Measures whether the comment raises an argument not raised
    by other comments.
  Scoring:
    - Compute minimum cosine distance to any cluster centroid.
    - If comment is a cluster outlier (HDBSCAN noise):
      N = min(1.0, distance / (2 * median_inter_cluster_distance))
    - If comment is within a small cluster (<1% of total comments):
      N = 0.7
    - If comment is within a medium cluster (1-5%): N = 0.4
    - If comment is within a large cluster (>5%): N = 0.1
    - Override: If the comment raises an argument not addressed in the
      NPRM preamble, N = max(N, 0.8)
  Rationale: Novel arguments represent the highest-value analytical
    content. Under the "hard look" doctrine, failure to address a
    significant novel argument is a primary basis for judicial remand.
    This factor receives the joint-highest weight for this reason.

R — REGULATORY ENGAGEMENT (w6 = 0.15)
  Purpose: Measures how specifically the comment engages with the text
    of the proposed rule and its preamble.
  Scoring:
    0.0: No reference to rule text or preamble
    0.25: General reference to the rule's topic area
    0.50: References specific sections or provisions by name/number
    0.75: Quotes or paraphrases specific regulatory text and offers
          critique or suggestion for modification
    1.0: Provides specific alternative regulatory language (redline)
  Rationale: Comments that engage at the provision level give agencies
    actionable input for modifying the final rule.

C — COMMENTER CREDIBILITY SIGNALS (w7 = 0.10)
  Purpose: Captures contextual signals about the commenter's likely
    expertise. THIS IS NOT A JUDGMENT ON THE COMMENTER'S WORTH. All
    comments are analyzed equally. This factor simply captures signals
    that courts have historically considered relevant.
  Scoring:
    0.0: Anonymous or no identifiable affiliation
    0.25: Individual commenter with relevant self-identified experience
    0.50: Identified organization with stated interest
    0.75: Recognized industry association, advocacy organization, or
          academic institution
    1.0: Federal/state/local government entity, or entity with
         demonstrated subject-matter expertise (e.g., law firm
         specializing in the relevant area)
  Rationale: While the APA guarantees equal right to comment, courts
    do consider the expertise behind a comment when evaluating whether
    the agency's response was adequate. This factor has the lowest
    weight for this reason.
  CRITICAL GUARDRAIL: This factor must NEVER be used to suppress or
    deprioritize comments based on the commenter's identity, political
    affiliation, or viewpoint. It captures expertise signals only.

NORMALIZATION AND FINAL SCORE:
  - Raw CIS = sum of weighted factors (range 0.0 to 1.0)
  - Report as integer 0-100 for readability: CIS_display = round(CIS * 100)
  - Tiers:
      90-100: "Critical" — Almost certainly requires direct response in
              final rule preamble
      70-89:  "High" — Likely requires response; raises significant issues
      50-69:  "Moderate" — Contains substantive elements; should be reviewed
      30-49:  "Low" — Limited substantive content; may be addressed in
              aggregate summary
      0-29:   "Minimal" — Non-substantive or form submission; can be
              acknowledged in bulk

CONFIDENCE INTERVAL:
  - For each CIS, compute a 90% confidence interval by:
    a. Perturbing each factor score by +/- its confidence-adjusted error
       margin (higher confidence = smaller margin)
    b. Factor error margins:
       L, E, R, C: +/- (0.25 * (1 - classification_confidence))
       T, N: +/- 0.05 (embedding-based, low variance)
       V: +/- 0.01 (deterministic count-based)
    c. Compute CIS_low and CIS_high from perturbed minimums and maximums.
  - Report: CIS = X (CI: [CIS_low, CIS_high])

EXAMPLE CALCULATION:
  Comment: A law firm submits a 15-page comment on an EPA air quality rule.
  The comment cites Clean Air Act Sections 108 and 109, challenges the
  EPA's cost-benefit analysis with original economic modeling, and proposes
  alternative emission thresholds with specific regulatory language.

  V = 0.3 (in a cluster of 45 comments on emission thresholds out of
      max cluster of 150; no campaign flag)
  L = 1.0 (multiple statutory citations with detailed legal analysis)
  E = 1.0 (original economic modeling with methodology)
  T = 0.85 (high similarity to emission threshold cluster centroid)
  N = 0.4 (within medium cluster, but the alternative regulatory
      language is somewhat novel)
  R = 1.0 (provides specific alternative regulatory text)
  C = 1.0 (identified law firm with environmental law practice)

  CIS = (0.10)(0.3) + (0.20)(1.0) + (0.15)(1.0) + (0.10)(0.85)
      + (0.20)(0.4) + (0.15)(1.0) + (0.10)(1.0)
      = 0.03 + 0.20 + 0.15 + 0.085 + 0.08 + 0.15 + 0.10
      = 0.795

  CIS_display = 80 (Tier: "High")
  CI: [73, 86]

  This comment scores "High" primarily due to strong legal and economic
  analysis and direct regulatory engagement, despite being in a
  medium-frequency theme.

=============================================================================
ANALYSIS TASK 5: TRACEABLE SUMMARIZATION
=============================================================================

When generating summaries of comment themes or individual comments:

STEP 1 — EXTRACTION
  a. Identify the key claims, arguments, and evidence in the comment(s).
  b. For each claim, record the exact source text and comment ID.

STEP 2 — SYNTHESIS
  a. Group related claims across comments (if summarizing a theme).
  b. Present the strongest articulation of each distinct argument.
  c. Note the range of positions within the theme (do not flatten
     disagreement into false consensus).

STEP 3 — ATTRIBUTION
  a. Every factual claim in the summary must cite at least one source
     comment ID and include the relevant excerpt.
  b. Use this citation format: [Comment #<id>: "<excerpt>"]
  c. Never paraphrase in a way that changes the commenter's meaning.

STEP 4 — BALANCE CHECK
  a. Before finalizing, verify that the summary:
     - Represents both supporting and opposing viewpoints proportionally
     - Does not characterize any viewpoint pejoratively
     - Does not omit minority viewpoints that raise distinct arguments
     - Clearly distinguishes between what commenters SAID and what the
       AI INFERRED

Output format for theme summaries:
{
  "theme_id": "<id>",
  "theme_label": "<string>",
  "summary": "<synthesized summary with inline citations>",
  "key_arguments": [
    {
      "argument": "<string>",
      "position": "supports_rule | opposes_rule | proposes_modification | neutral",
      "comment_count": <int>,
      "source_citations": [
        {"comment_id": "<id>", "excerpt": "<string>"}
      ]
    }
  ],
  "viewpoint_balance": {
    "supports_rule": <int count>,
    "opposes_rule": <int count>,
    "proposes_modification": <int count>,
    "neutral_analytical": <int count>
  }
}

=============================================================================
RESPONSIBLE AI GUARDRAILS
=============================================================================

You must observe these constraints at all times:

1. VIEWPOINT NEUTRALITY
   - Never characterize a viewpoint as "extreme," "fringe," "radical," or
     any other value-laden term.
   - Report the substance of arguments; do not editorialize.
   - If two comments make equally strong legal arguments on opposite sides,
     they must receive comparable substantiveness scores.
   - Test: Could a commenter from ANY perspective read your analysis and
     feel their comment was fairly represented? If not, revise.

2. NO SUPPRESSION
   - Every comment must be analyzed. None may be excluded from analysis
     based on content, viewpoint, or commenter identity.
   - If a comment contains offensive language but also substantive content,
     analyze the substantive content. Note the offensive language factually
     without characterization.

3. CONFIDENCE CALIBRATION
   - Use the three-tier confidence scale (HIGH/MEDIUM/LOW) consistently.
   - When confidence is LOW, explicitly recommend human review.
   - Never present a LOW-confidence classification without flagging it.

4. ERROR ACKNOWLEDGMENT
   - If asked about your limitations, be forthright.
   - You may misclassify edge cases. Say so.
   - You may miss novel arguments that do not cluster well. Say so.
   - Embeddings may not capture domain-specific jargon. Say so.

5. HUMAN-IN-THE-LOOP
   - Flag all LOW-confidence items for human review.
   - Flag all novel arguments (HDBSCAN outliers) for human review.
   - Flag any comment where substantiveness label and impact score
     appear inconsistent (e.g., "non_substantive" label with CIS > 50).
   - Provide a daily review queue ranked by: (a) novel arguments,
     (b) low-confidence classifications, (c) high-CIS comments.

6. BIAS DETECTION
   - Monitor for systematic patterns in your classifications:
     * Are comments from certain commenter types consistently scored
       lower/higher? Flag if so.
     * Are comments using certain vocabulary consistently mis-classified?
       Flag if so.
     * Is there a correlation between comment length and score that
       might indicate length bias? Report the correlation coefficient.
   - Report these metrics in every batch analysis summary.

7. LEGAL DEFENSIBILITY
   - Your outputs may be examined in litigation challenging a final rule.
   - All reasoning must be reproducible: same input, same output.
   - Document every modeling assumption and hyperparameter choice.
   - Maintain version history of the scoring methodology.

=============================================================================
INTERACTION PATTERNS
=============================================================================

When interacting with agency analysts:

BRIEFING MODE:
  User says: "Brief me on [docket/rule]"
  Response: Provide a structured overview:
    1. Rule summary (from NPRM preamble)
    2. Comment period status and volume
    3. Top themes (with comment counts)
    4. Substantiveness breakdown (pie chart data)
    5. Top 10 highest-CIS comments
    6. Campaigns detected
    7. Novel arguments requiring review
    8. Recommended review priorities

DEEP DIVE MODE:
  User says: "Analyze theme [X]" or "Show me comments about [topic]"
  Response: Provide theme-level analysis with all source citations,
  viewpoint breakdown, key arguments, and recommended response points.

COMMENT REVIEW MODE:
  User says: "Review comment [ID]"
  Response: Provide full chain-of-thought classification, CIS breakdown
  with factor scores, relevant theme membership, similar comments, and
  any flags for human review.

DASHBOARD MODE:
  User says: "Generate dashboard data"
  Response: Produce the complete JSON data structure for all dashboard
  visualizations (theme heatmap, substantiveness breakdown, campaign
  clusters, CIS distribution, drill-down indices).

QUALITY ASSURANCE MODE:
  User says: "QA check" or "Validate analysis"
  Response: Run bias detection metrics, report confidence distributions,
  flag inconsistencies, and provide the reviewer queue.
```

---

# PART B: ARCHITECTURE BLUEPRINT

## B.1 Knowledge Graph Schema

### Node Types

```
┌─────────────────────────────────────────────────────────────────────┐
│                        KNOWLEDGE GRAPH SCHEMA                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  NODES                                                              │
│  ═════                                                              │
│                                                                     │
│  Docket                                                             │
│  ├── docket_id: string (PK)        # e.g., "EPA-HQ-OAR-2021-0208" │
│  ├── title: string                                                  │
│  ├── agency_id: string                                              │
│  ├── rin: string                   # Regulation ID Number           │
│  ├── cfr_references: [string]      # e.g., ["40 CFR 52"]           │
│  ├── abstract: text                                                 │
│  ├── open_for_comment: boolean                                      │
│  └── last_modified: datetime                                        │
│                                                                     │
│  Document                                                           │
│  ├── document_id: string (PK)      # Federal Register doc number   │
│  ├── document_type: enum           # NPRM, Final Rule, Supporting   │
│  ├── title: string                                                  │
│  ├── abstract: text                                                 │
│  ├── publication_date: date                                         │
│  ├── comment_start_date: date                                       │
│  ├── comment_end_date: date                                         │
│  ├── action: string                # "Proposed rule", etc.          │
│  ├── full_text_url: url                                             │
│  ├── pdf_url: url                                                   │
│  ├── fr_document_number: string                                     │
│  └── object_id: string             # Regulations.gov internal ID    │
│                                                                     │
│  Comment                                                            │
│  ├── comment_id: string (PK)       # Regulations.gov tracking #    │
│  ├── body: text                    # Full comment text              │
│  ├── body_normalized: text         # Lowered, whitespace-collapsed  │
│  ├── body_hash: string             # SHA-256 of normalized body     │
│  ├── posted_date: datetime                                          │
│  ├── received_date: datetime                                        │
│  ├── title: string                                                  │
│  ├── has_attachments: boolean                                       │
│  ├── attachment_count: integer                                      │
│  ├── withdrawn: boolean                                             │
│  ├── embedding: vector(384)        # Sentence-transformer embedding │
│  ├── substantiveness_labels: [enum]                                 │
│  ├── substantiveness_confidences: [float]                           │
│  ├── impact_score: float                                            │
│  ├── impact_score_ci_low: float                                     │
│  ├── impact_score_ci_high: float                                    │
│  ├── impact_tier: enum             # Critical/High/Moderate/Low/Min │
│  ├── is_duplicate: boolean                                          │
│  ├── duplicate_group_id: string                                     │
│  └── needs_human_review: boolean                                    │
│                                                                     │
│  Commenter                                                          │
│  ├── commenter_id: string (PK)     # Generated UUID or derived     │
│  ├── name: string                  # First + Last (if public)       │
│  ├── organization: string                                           │
│  ├── commenter_type: enum          # individual, organization,      │
│  │                                 # law_firm, trade_association,    │
│  │                                 # academic, government,          │
│  │                                 # congressional, anonymous       │
│  ├── city: string                                                   │
│  ├── state: string                                                  │
│  └── gov_agency_type: string       # If government commenter        │
│                                                                     │
│  Theme                                                              │
│  ├── theme_id: string (PK)                                          │
│  ├── label: string                 # Human-readable name            │
│  ├── keywords: [string]            # Top c-TF-IDF terms             │
│  ├── comment_count: integer                                         │
│  ├── centroid: vector(384)                                          │
│  ├── frequency_tier: enum          # High / Medium / Low            │
│  └── coherence_score: float        # Internal cluster quality       │
│                                                                     │
│  SubTheme                                                           │
│  ├── sub_theme_id: string (PK)                                      │
│  ├── label: string                                                  │
│  ├── keywords: [string]                                             │
│  ├── comment_count: integer                                         │
│  └── centroid: vector(384)                                          │
│                                                                     │
│  Campaign                                                           │
│  ├── campaign_id: string (PK)                                       │
│  ├── classification: enum          # Organized/Coordinated/Informal │
│  ├── member_count: integer                                          │
│  ├── template_text: text                                            │
│  ├── centroid_similarity: float                                     │
│  ├── date_range_start: date                                         │
│  └── date_range_end: date                                           │
│                                                                     │
│  LegalCitation                                                      │
│  ├── citation_id: string (PK)                                       │
│  ├── citation_text: string         # "42 U.S.C. 7411(a)"           │
│  ├── citation_type: enum           # statute, case_law, exec_order, │
│  │                                 # regulation, constitutional     │
│  └── normalized_ref: string        # Canonical form for dedup       │
│                                                                     │
│  EconomicClaim                                                      │
│  ├── claim_id: string (PK)                                          │
│  ├── claim_text: text              # Excerpt containing the claim   │
│  ├── claim_type: enum              # cost, benefit, market_impact,  │
│  │                                 # employment, compliance_cost    │
│  ├── quantitative: boolean         # Has specific numbers?          │
│  ├── amount: string                # "$2.3 billion" if present      │
│  └── methodology_cited: boolean                                     │
│                                                                     │
│  RegulatoryProvision                                                │
│  ├── provision_id: string (PK)                                      │
│  ├── cfr_reference: string         # "40 CFR 52.245(b)(2)"         │
│  ├── description: string           # What this provision does       │
│  └── nprm_section: string          # Section of preamble            │
│                                                                     │
│  Agency                                                             │
│  ├── agency_id: string (PK)                                         │
│  ├── name: string                                                   │
│  ├── short_name: string            # "EPA", "FAA"                   │
│  ├── parent_agency_id: string                                       │
│  └── url: string                                                    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Edge Types (Relationships)

```
┌──────────────────────────────────────────────────────────────────────┐
│                          RELATIONSHIPS                               │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  BELONGS_TO_DOCKET: Document → Docket                                │
│  ├── Properties: (none)                                              │
│                                                                      │
│  ISSUED_BY: Docket → Agency                                          │
│  ├── Properties: (none)                                              │
│                                                                      │
│  CHILD_AGENCY_OF: Agency → Agency                                    │
│  ├── Properties: (none)                                              │
│                                                                      │
│  COMMENT_ON: Comment → Document                                      │
│  ├── Properties: (none)                                              │
│                                                                      │
│  SUBMITTED_BY: Comment → Commenter                                   │
│  ├── Properties: (none)                                              │
│                                                                      │
│  HAS_THEME: Comment → Theme                                          │
│  ├── Properties:                                                     │
│  │   ├── membership_probability: float  # Soft cluster assignment    │
│  │   └── distance_to_centroid: float                                 │
│                                                                      │
│  HAS_SUB_THEME: Comment → SubTheme                                   │
│  ├── Properties:                                                     │
│  │   └── membership_probability: float                               │
│                                                                      │
│  PARENT_THEME: SubTheme → Theme                                      │
│  ├── Properties: (none)                                              │
│                                                                      │
│  ADDRESSES_PROVISION: Theme → RegulatoryProvision                    │
│  ├── Properties:                                                     │
│  │   └── relevance_score: float                                      │
│                                                                      │
│  REFERENCES_PROVISION: Comment → RegulatoryProvision                 │
│  ├── Properties:                                                     │
│  │   └── excerpt: text  # The text where provision is referenced     │
│                                                                      │
│  CITES_LEGAL: Comment → LegalCitation                                │
│  ├── Properties:                                                     │
│  │   └── context_excerpt: text                                       │
│                                                                      │
│  MAKES_ECONOMIC_CLAIM: Comment → EconomicClaim                       │
│  ├── Properties: (none)                                              │
│                                                                      │
│  MEMBER_OF_CAMPAIGN: Comment → Campaign                              │
│  ├── Properties:                                                     │
│  │   └── similarity_to_template: float                               │
│                                                                      │
│  DUPLICATE_OF: Comment → Comment                                     │
│  ├── Properties:                                                     │
│  │   ├── duplicate_type: enum  # exact, near                         │
│  │   └── similarity: float                                           │
│                                                                      │
│  NEAR_DUPLICATE: Comment → Comment                                   │
│  ├── Properties:                                                     │
│  │   └── cosine_similarity: float                                    │
│                                                                      │
│  PROVISION_UNDER: RegulatoryProvision → Docket                       │
│  ├── Properties: (none)                                              │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

### Graph Visualization (Conceptual)

```
                        ┌──────────┐
                        │  Agency  │
                        └────┬─────┘
                             │ ISSUED_BY
                        ┌────▼─────┐
                   ┌────│  Docket  │────┐
                   │    └────┬─────┘    │
                   │         │          │
          PROVISION_UNDER    │     BELONGS_TO_DOCKET
                   │         │          │
          ┌────────▼──┐  ┌──▼────────┐ │
          │ Regulatory │  │ Document  │◄┘
          │ Provision  │  └────┬──────┘
          └──────▲─────┘       │
                 │         COMMENT_ON
    ADDRESSES_   │             │
    PROVISION    │      ┌──────▼──────┐    SUBMITTED_BY   ┌───────────┐
                 │      │   Comment   │──────────────────►│ Commenter │
                 │      └──┬──┬──┬──┬─┘                   └───────────┘
                 │         │  │  │  │
          ┌──────┘    ┌────┘  │  │  └────────┐
          │           │       │  │           │
   ┌──────▼──┐  ┌────▼──┐  ┌▼──▼────┐ ┌────▼────────┐
   │  Theme  │  │ Legal │  │Campaign│ │  Economic   │
   │         │  │ Cit.  │  │        │ │  Claim      │
   └────┬────┘  └───────┘  └────────┘ └─────────────┘
        │
   ┌────▼────┐
   │SubTheme │
   └─────────┘
```

## B.2 Data Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      DATA PIPELINE OVERVIEW                         │
│                                                                     │
│  STAGE 1: INGESTION                                                 │
│  ┌─────────────────┐    ┌─────────────────┐                         │
│  │ Federal Register │    │ Regulations.gov │                         │
│  │ API (REST/JSON)  │    │ API (REST/JSON) │                         │
│  │                  │    │                  │                         │
│  │ GET /api/v1/     │    │ GET /v4/dockets  │                         │
│  │ documents.json   │    │ GET /v4/documents│                         │
│  │ ?type=PRORULE    │    │ GET /v4/comments │                         │
│  └────────┬─────────┘    └────────┬─────────┘                         │
│           │                       │                                 │
│           └───────────┬───────────┘                                 │
│                       ▼                                             │
│  ┌─────────────────────────────────────┐                            │
│  │     INGESTION ORCHESTRATOR          │                            │
│  │  - Rate-limit-aware scheduler       │                            │
│  │  - Incremental sync (lastModified)  │                            │
│  │  - Attachment downloader            │                            │
│  │  - Raw data → staging store         │                            │
│  └────────────────┬────────────────────┘                            │
│                   ▼                                                 │
│  STAGE 2: NORMALIZATION & ENRICHMENT                                │
│  ┌─────────────────────────────────────┐                            │
│  │     TEXT PROCESSING PIPELINE        │                            │
│  │  1. HTML/markup stripping           │                            │
│  │  2. Unicode normalization (NFKC)    │                            │
│  │  3. Whitespace collapsing           │                            │
│  │  4. Language detection              │                            │
│  │  5. PII detection & flagging        │                            │
│  │  6. SHA-256 hash computation        │                            │
│  │  7. Entity extraction (orgs, laws,  │                            │
│  │     CFR refs, monetary amounts)     │                            │
│  │  8. Embedding generation            │                            │
│  └────────────────┬────────────────────┘                            │
│                   ▼                                                 │
│  ┌─────────────────────────────────────┐                            │
│  │     KNOWLEDGE GRAPH BUILDER         │                            │
│  │  - Create/update nodes & edges      │                            │
│  │  - Link comments → documents →      │                            │
│  │    dockets via API IDs              │                            │
│  │  - Extract & link legal citations   │                            │
│  │  - Extract & link economic claims   │                            │
│  │  - Resolve commenter entities       │                            │
│  └────────────────┬────────────────────┘                            │
│                   ▼                                                 │
│  STAGE 3: ANALYSIS                                                  │
│  ┌─────────────────────────────────────┐                            │
│  │  PARALLEL ANALYSIS MODULES          │                            │
│  │                                     │                            │
│  │  ┌───────────────────┐              │                            │
│  │  │ Duplicate &       │              │                            │
│  │  │ Campaign Detection│              │                            │
│  │  └─────────┬─────────┘              │                            │
│  │            │                        │                            │
│  │  ┌─────────▼─────────┐              │                            │
│  │  │ Thematic Clustering│              │                            │
│  │  │ (BERTopic pipeline)│              │                            │
│  │  └─────────┬─────────┘              │                            │
│  │            │                        │                            │
│  │  ┌─────────▼─────────┐              │                            │
│  │  │ Substantiveness   │              │                            │
│  │  │ Classification    │              │                            │
│  │  │ (LLM + ensemble)  │              │                            │
│  │  └─────────┬─────────┘              │                            │
│  │            │                        │                            │
│  │  ┌─────────▼─────────┐              │                            │
│  │  │ Impact Scoring    │              │                            │
│  │  │ (CIS computation) │              │                            │
│  │  └─────────┬─────────┘              │                            │
│  │            │                        │                            │
│  │  ┌─────────▼─────────┐              │                            │
│  │  │ Summarization &   │              │                            │
│  │  │ Traceability      │              │                            │
│  │  └─────────┬─────────┘              │                            │
│  └────────────┼────────────────────────┘                            │
│               ▼                                                     │
│  STAGE 4: PRESENTATION                                              │
│  ┌─────────────────────────────────────┐                            │
│  │  EXECUTIVE DASHBOARD & API          │                            │
│  │  - REST API for all analysis data   │                            │
│  │  - WebSocket for real-time updates  │                            │
│  │  - Dashboard frontend               │                            │
│  │  - Export (PDF, CSV, JSON)          │                            │
│  │  - Human review workflow UI         │                            │
│  └─────────────────────────────────────┘                            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

## B.3 AI Model Selection & Justification

| Capability | Model/Approach | Justification |
|---|---|---|
| **Embedding Generation** | `all-MiniLM-L6-v2` (384-dim) via sentence-transformers | Fast, lightweight (80MB), excellent quality for semantic similarity. Runs on CPU. Proven in production clustering tasks. For higher quality at scale: upgrade to `all-mpnet-base-v2` (768-dim). |
| **Topic Modeling** | BERTopic (UMAP + HDBSCAN + c-TF-IDF) | State-of-the-art neural topic modeling. Produces interpretable topics with keyword representations. Supports hierarchical topics, dynamic modeling, and outlier detection natively. The modular architecture allows swapping components. |
| **LLM Topic Labeling** | Claude 3.5 Sonnet via API | High-quality, nuanced labels for discovered topics. Cost-effective for this batch task. Understands regulatory domain language. |
| **Substantiveness Classification** | Ensemble: Claude 3.5 Sonnet (primary) + fine-tuned DeBERTa-v3-large (secondary) | **Ensemble rationale**: LLM provides chain-of-thought reasoning and handles nuance; fine-tuned classifier provides consistent, fast baseline. Agreement between the two raises confidence; disagreement triggers human review. The fine-tuned model is trained on agency-annotated comment datasets (GSA/OIRA historical data). |
| **Legal Citation Extraction** | Regex patterns + spaCy NER (custom legal model) | Legal citations follow predictable patterns (U.S.C., C.F.R., case names). Regex handles 90%+ of citations; spaCy catches non-standard formats. Deterministic and auditable. |
| **Economic Claim Extraction** | spaCy NER (monetary entities) + Claude 3.5 Sonnet (claim classification) | Monetary amounts are extracted deterministically; the LLM assesses whether the context constitutes an economic claim vs. incidental mention. |
| **Near-Duplicate Detection** | FAISS (Facebook AI Similarity Search) with cosine similarity | Industry-standard for fast approximate nearest-neighbor search on embeddings. Scales to millions of comments. Exact results for the similarity thresholds we use. |
| **Summarization** | Claude 3.5 Sonnet with RAG | Retrieval-Augmented Generation ensures summaries are grounded in source text. The prompt enforces citation format. Claude's long context window (200K tokens) handles large comment batches. |
| **Bias Detection** | Statistical analysis (scipy) + demographic parity metrics | No ML model needed — bias detection is a statistical question. Compute correlation coefficients between commenter attributes and scores, flag deviations from expected distributions. |

### RAG Architecture for Comment Analysis

```
┌─────────────────────────────────────────────────────────────────┐
│                    RAG PIPELINE                                  │
│                                                                  │
│  INDEXING PHASE (offline, per-docket):                           │
│  1. Chunk NPRM preamble into ~500-token passages                │
│  2. Embed chunks with same sentence-transformer                 │
│  3. Store in vector DB alongside comment embeddings              │
│  4. Build metadata index (CFR refs, section headers)             │
│                                                                  │
│  RETRIEVAL PHASE (per-comment analysis):                         │
│  1. Given a comment, retrieve:                                   │
│     a. Top-3 most similar NPRM passages (for context)            │
│     b. Top-5 most similar other comments (for clustering)        │
│     c. Relevant regulatory provisions (by CFR ref match)         │
│  2. Assemble context window:                                     │
│     [SYSTEM PROMPT]                                              │
│     [NPRM CONTEXT: retrieved preamble passages]                  │
│     [REGULATORY PROVISIONS: matched provisions]                  │
│     [SIMILAR COMMENTS: for cluster context]                      │
│     [TARGET COMMENT: full text]                                  │
│     [TASK: classify / score / summarize]                         │
│                                                                  │
│  GENERATION PHASE:                                               │
│  1. LLM produces chain-of-thought analysis                      │
│  2. Output parsed into structured JSON                           │
│  3. Scores validated against ensemble classifier                │
│  4. Disagreements flagged for human review                       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## B.4 API Integration Patterns

### Federal Register API Integration

```python
# Federal Register API - No authentication required
# Base URL: https://www.federalregister.gov/api/v1

# Search for NPRMs (Proposed Rules)
GET /api/v1/documents.json
  ?conditions[type][]=PRORULE
  &conditions[agencies][]=environmental-protection-agency   # agency slug
  &conditions[publication_date][gte]=2025-01-01
  &fields[]=title
  &fields[]=document_number
  &fields[]=publication_date
  &fields[]=abstract
  &fields[]=docket_ids
  &fields[]=regulation_id_number_info
  &fields[]=cfr_references
  &fields[]=comment_url
  &fields[]=comments_close_on
  &fields[]=action
  &fields[]=agencies
  &fields[]=full_text_xml_url
  &per_page=200
  &page=1

# Response fields of interest:
#   document_number  → links to FR document
#   docket_ids       → links to Regulations.gov docket(s)
#   comments_close_on → comment period deadline
#   cfr_references   → affected CFR parts (title, part)
#   regulation_id_number_info → RIN for Unified Agenda cross-ref

# Pagination: follow next_page_url until null
# Rate limits: Undocumented but generous; implement 1 req/sec courtesy
```

### Regulations.gov API Integration

```python
# Regulations.gov API - API key required (free from api.data.gov)
# Base URL: https://api.regulations.gov/v4
# Header: X-Api-Key: <your_key>

# STEP 1: Get documents for a docket
GET /v4/documents
  ?filter[docketId]=EPA-HQ-OAR-2021-0208
  &filter[documentType]=Proposed Rule
  &api_key=<key>
  &page[size]=25

# STEP 2: Get the objectId for the NPRM document from response
# Response: data[].attributes.objectId → e.g., "0900006483a6cba3"

# STEP 3: Retrieve comments using objectId
GET /v4/comments
  ?filter[commentOnId]=0900006483a6cba3
  &api_key=<key>
  &page[size]=250
  &page[number]=1
  &sort=postedDate

# STEP 4: For dockets with >5000 comments, use date windowing:
GET /v4/comments
  ?filter[commentOnId]=0900006483a6cba3
  &filter[lastModifiedDate][ge]=2025-06-01 00:00:00
  &api_key=<key>
  &page[size]=250

# STEP 5: Get individual comment details with attachments
GET /v4/comments/<commentId>
  ?include=attachments
  &api_key=<key>

# Rate limits: Standard api.data.gov limits (1000/hr for default key)
# Strategy: Implement exponential backoff, batch during off-peak hours
# Cache: Store raw responses; re-fetch only modified records
```

### Ingestion Orchestration Strategy

```
INCREMENTAL SYNC ALGORITHM:
1. On first run: full fetch of all comments for target docket(s)
2. On subsequent runs:
   a. Query with filter[lastModifiedDate][ge] = last_sync_timestamp
   b. Upsert new/modified comments into staging store
   c. Re-run analysis pipeline on new batch
   d. Merge new analysis results into existing knowledge graph
3. Maintain sync metadata:
   - last_sync_timestamp per docket
   - total_comments_fetched vs API reported total
   - any gaps or errors logged for retry

ERROR HANDLING:
- 429 Too Many Requests → exponential backoff (1s, 2s, 4s, 8s, max 60s)
- 500/503 → retry 3x then log and continue with next item
- Partial page → log gap, schedule retry
- Validate response schema before processing (reject malformed)
```

## B.5 Technology Stack

| Layer | Technology | Rationale |
|---|---|---|
| **Language** | Python 3.11+ | Dominant in ML/NLP ecosystem; rich library support |
| **Web Framework** | FastAPI | Async, auto-generated OpenAPI docs, type hints, high performance |
| **Task Queue** | Celery + Redis | Distributed task execution for batch analysis; retries; monitoring |
| **Vector Database** | ChromaDB (MVP) → Qdrant (production) | ChromaDB for fast prototyping; Qdrant for production scale with filtering |
| **Graph Database** | Neo4j (Community Edition) | Industry standard; Cypher query language; excellent visualization; free tier |
| **Relational DB** | PostgreSQL 16 | Stores raw API data, user sessions, audit logs; pgvector extension as vector DB alternative |
| **Embeddings** | sentence-transformers (HuggingFace) | Local execution, no API dependency, fast inference |
| **Topic Modeling** | BERTopic | See model selection above |
| **LLM** | Claude API (Anthropic) | Chain-of-thought reasoning, long context, high quality |
| **NER/NLP** | spaCy 3.x + custom pipelines | Fast, production-grade, custom entity types |
| **Frontend** | Next.js 14 + React | SSR for fast dashboard loads; React ecosystem for visualizations |
| **Visualization** | D3.js + Recharts | D3 for custom heatmaps/network graphs; Recharts for standard charts |
| **Deployment** | Docker Compose (MVP) → Kubernetes (production) | Containerized services; easy local dev; production-scalable |
| **CI/CD** | GitHub Actions | Free for public repos; built-in secret management |
| **Monitoring** | Prometheus + Grafana | Pipeline health, analysis latency, error rates |

---

# PART C: COMMENT IMPACT SCORING METHODOLOGY (DETAILED)

## C.1 Formula

```
CIS = 0.10*V + 0.20*L + 0.15*E + 0.10*T + 0.20*N + 0.15*R + 0.10*C
```

## C.2 Weight Rationale

| Factor | Weight | Rationale |
|---|---|---|
| **V** (Volume Signal) | 0.10 | Volume signals salience but is easily manipulated. Low weight prevents gaming. |
| **L** (Legal Specificity) | **0.20** | Legal arguments are what courts examine. Agencies face remand for ignoring significant legal challenges. Joint-highest weight. |
| **E** (Economic Evidence) | 0.15 | E.O. 12866 requires cost-benefit justification. Data-backed challenges to RIA demand response. |
| **T** (Thematic Centrality) | 0.10 | Archetypal comments articulate concerns clearly but are not inherently more impactful than outliers. Low weight. |
| **N** (Novelty) | **0.20** | Novel arguments represent the highest risk of judicial remand under "hard look" doctrine. An argument no other commenter raised is precisely the one an agency might overlook. Joint-highest weight. |
| **R** (Regulatory Engagement) | 0.15 | Provision-level engagement gives agencies actionable modification paths. High practical value. |
| **C** (Credibility Signals) | 0.10 | Courts consider expertise but the APA guarantees equal access. Lowest weight, plus strong guardrails. |

## C.3 Normalization Details

Each factor is computed on a [0.0, 1.0] scale as defined in the system prompt. The weighted sum naturally falls in [0.0, 1.0]. For display:

- Multiply by 100 and round to nearest integer: `CIS_display = round(CIS_raw * 100)`
- Report tier labels alongside numeric score
- Always report confidence interval

## C.4 Confidence Interval Methodology

```
For each factor F_i with score s_i and classification confidence c_i:

  error_margin_i = base_error_i * (1 - c_i)

  where base_error:
    V: 0.02 (near-deterministic, count-based)
    L: 0.25 (subjective, depends on classification quality)
    E: 0.25 (subjective, depends on claim detection quality)
    T: 0.05 (embedding-based, stable)
    N: 0.05 (embedding-based, stable)
    R: 0.25 (subjective, depends on provision matching quality)
    C: 0.25 (subjective, depends on entity resolution)

  s_i_low  = max(0, s_i - error_margin_i)
  s_i_high = min(1, s_i + error_margin_i)

  CIS_low  = sum(w_i * s_i_low)
  CIS_high = sum(w_i * s_i_high)

  Report: CIS = X (90% CI: [CIS_low, CIS_high])
```

## C.5 Extended Example Calculations

### Example 1: Industry Trade Association Comment (High Impact)

> "The National Association of Widget Manufacturers opposes the proposed emission
> standard in 40 CFR 52.245(b)(2). Under Section 111(a) of the Clean Air Act,
> EPA must set standards reflecting the 'best system of emission reduction' that
> has been 'adequately demonstrated.' See 42 U.S.C. 7411(a)(1). The proposed
> standard of 25 ppm has not been demonstrated achievable by existing technology.
> Our survey of 340 member facilities shows average achievable emissions of 42 ppm
> at current technology levels, with compliance costs estimated at $3.2 billion
> annually. We propose an alternative standard of 35 ppm with a 5-year phase-in,
> as detailed in our attached technical appendix with proposed regulatory text."

| Factor | Score | Reasoning |
|---|---|---|
| V | 0.40 | In cluster of 60 comments (out of max 150) on emission standards; no campaign flag |
| L | 0.75 | Cites 42 U.S.C. 7411(a)(1) with specific legal standard ("adequately demonstrated") |
| E | 0.85 | Survey data from 340 facilities, specific dollar figure with methodology referenced |
| T | 0.80 | Near centroid of emission standards theme |
| N | 0.30 | Within large cluster; common industry argument pattern |
| R | 1.00 | Cites specific provision (40 CFR 52.245(b)(2)), proposes alternative regulatory text |
| C | 0.75 | Identified trade association with direct interest |

**CIS** = 0.10(0.40) + 0.20(0.75) + 0.15(0.85) + 0.10(0.80) + 0.20(0.30) + 0.15(1.00) + 0.10(0.75)
= 0.04 + 0.15 + 0.1275 + 0.08 + 0.06 + 0.15 + 0.075
= **0.6825 → 68 (Tier: Moderate)**

CI: [59, 77] — straddles Moderate/High boundary, suggesting this comment warrants careful review.

### Example 2: Form Letter Campaign Comment (Low Impact)

> "I oppose this regulation. Please protect our jobs and economy."

| Factor | Score | Reasoning |
|---|---|---|
| V | 0.45 * 0.5 = 0.225 | Campaign of 12,000 identical letters; campaign penalty applied |
| L | 0.00 | No legal content |
| E | 0.00 | No economic evidence |
| T | 0.60 | Part of jobs/economy theme |
| N | 0.10 | Within largest cluster |
| R | 0.00 | No provision reference |
| C | 0.00 | Anonymous form letter |

**CIS** = 0.10(0.225) + 0.20(0) + 0.15(0) + 0.10(0.60) + 0.20(0.10) + 0.15(0) + 0.10(0)
= 0.0225 + 0 + 0 + 0.06 + 0.02 + 0 + 0
= **0.1025 → 10 (Tier: Minimal)**

CI: [8, 13]

### Example 3: Individual with Novel Scientific Argument (High Impact)

> "I am a retired atmospheric chemist (25 years at NOAA). The proposed ozone
> precursor model in the TSD uses the Chapman mechanism without accounting for
> the heterogeneous reactions on polar stratospheric cloud surfaces documented
> in Solomon et al. (1986) and validated by the 2022 WMO Ozone Assessment.
> This omission leads the model to underestimate ground-level ozone formation
> by approximately 12-18% in winter months at latitudes above 40 degrees N.
> I have attached my reanalysis of the agency's modeling data."

| Factor | Score | Reasoning |
|---|---|---|
| V | 0.05 | Unique argument, cluster of 1 |
| L | 0.00 | No legal citations |
| E | 0.00 | Not an economic claim |
| T | 0.20 | Far from any cluster centroid |
| N | 1.00 | HDBSCAN outlier; raises argument not in NPRM preamble |
| R | 0.75 | References specific technical support document |
| C | 0.50 | Self-identified expert with institutional affiliation |

**CIS** = 0.10(0.05) + 0.20(0) + 0.15(0) + 0.10(0.20) + 0.20(1.0) + 0.15(0.75) + 0.10(0.50)
= 0.005 + 0 + 0 + 0.02 + 0.20 + 0.1125 + 0.05
= **0.3875 → 39 (Tier: Low)**

Wait — this seems too low for a clearly significant scientific comment. This reveals an important design consideration: the numeric score reflects multiple dimensions, and a comment can score "Low" overall while being "Critical" on a single dimension (Novelty = 1.0).

**This is why the system MUST report factor-level scores alongside the composite.** The human reviewer sees:

```
CIS: 39 (Tier: Low)  |  CI: [33, 45]
┌──────────────────────────────────────────────────────┐
│  V: 0.05  L: 0.00  E: 0.00  T: 0.20                │
│  N: 1.00 ★  R: 0.75  C: 0.50                        │
│                                                      │
│  ⚠ FLAG: Novelty score = 1.00 (maximum)              │
│  ⚠ FLAG: HDBSCAN outlier — potentially novel argument│
│  → RECOMMENDED: Priority human review                │
└──────────────────────────────────────────────────────┘
```

This example demonstrates why the system must not rely solely on composite scores. **The review queue prioritizes novel arguments regardless of composite CIS.**

---

# PART D: SUBSTANTIVENESS CLASSIFICATION RUBRIC (EXTENDED)

## D.1 Decision Tree

```
                        ┌───────────────────────┐
                        │ Does the comment       │
                        │ reference specific     │
                        │ provisions of the rule │
                        │ or its preamble?       │
                        └───────────┬────────────┘
                                    │
                       ┌────────────┼────────────┐
                       │YES                      │NO
                       ▼                         ▼
              ┌────────────────┐        ┌────────────────┐
              │ Does it cite   │        │ Does it share  │
              │ legal authority│        │ personal       │
              │ or case law?   │        │ experience     │
              └───────┬────────┘        │ relevant to    │
                      │                 │ the rule?      │
               ┌──────┼──────┐          └───────┬────────┘
               │YES          │NO                │
               ▼             ▼           ┌──────┼──────┐
          ┌─────────┐  ┌──────────┐      │YES          │NO
          │ LEGAL   │  │ Does it  │      ▼             ▼
          │         │  │ present  │ ┌──────────┐  ┌──────────┐
          └─────────┘  │ economic │ │ANECDOTAL │  │NON-SUB-  │
                       │ data or  │ └──────────┘  │STANTIVE  │
                       │ claims?  │               └──────────┘
                       └────┬─────┘
                            │
                     ┌──────┼──────┐
                     │YES          │NO
                     ▼             ▼
                ┌──────────┐  ┌──────────┐
                │ ECONOMIC │  │ Does it  │
                └──────────┘  │ provide  │
                              │ technical│
                              │ data or  │
                              │ challenge│
                              │ agency   │
                              │ science? │
                              └────┬─────┘
                                   │
                            ┌──────┼──────┐
                            │YES          │NO
                            ▼             ▼
                       ┌──────────┐  ┌──────────┐
                       │TECHNICAL │  │ POLICY   │
                       └──────────┘  │ (engages │
                                     │ with rule│
                                     │ but none │
                                     │ of above)│
                                     └──────────┘
```

Note: This tree is a simplification. In practice, a comment may trigger MULTIPLE paths (multi-label classification). The tree helps with primary label assignment.

## D.2 Edge Cases and Resolution

| Edge Case | Resolution |
|---|---|
| Comment mixes legal and economic arguments | Assign BOTH labels. Each gets its own confidence score. Primary label = whichever has higher confidence. |
| Comment opposes rule passionately but with specific provision references | Classify based on content quality, not sentiment. Provision-specific opposition = likely "policy" at minimum. |
| Comment is one sentence but contains a specific legal citation | "Legal" at LOW confidence. Short comments can be substantive. |
| Comment is long but entirely off-topic | "Non-substantive" at HIGH confidence. Length is not a substantiveness indicator. |
| Comment in a foreign language | Flag for translation before classification. Do not classify untranslated. |
| Comment contains only an attachment reference ("see attached") | Flag for attachment retrieval. Classify based on attachment content when available; label as "pending_attachment_review" otherwise. |
| Comment is clearly AI-generated boilerplate | Classify on content substance, not authorship. An AI-generated legal argument citing real statutes is still substantive. Note the AI-generation signal separately. |
| Comment raises a religious or moral objection | If it engages with the rule's provisions: "policy". If it does not: "anecdotal" or "non_substantive" depending on specificity. Viewpoint neutrality applies — moral arguments are not inherently non-substantive if they identify specific policy consequences. |
| Congressional letter | Classify on content like any other comment. Note commenter_type = "congressional" for credibility factor. Congressional comments carry political weight but are analyzed by the same rubric. |

## D.3 Multi-Label Frequency Expectations

Based on typical federal rulemaking comment distributions:

| Primary Label | Expected Frequency | Typical Multi-Label Combinations |
|---|---|---|
| non_substantive | 40-70% (varies by rule) | Rarely multi-labeled |
| policy | 10-25% | Often + economic, sometimes + legal |
| economic | 5-15% | Often + policy, sometimes + technical |
| legal | 3-10% | Often + policy, sometimes + economic |
| technical | 2-8% | Sometimes + economic |
| anecdotal | 5-15% | Sometimes + policy |

---

# PART E: RESPONSIBLE AI FRAMEWORK

## E.1 Viewpoint Neutrality Safeguards

### Principle
The platform analyzes HOW arguments are made (specificity, evidence, legal grounding) and never evaluates WHAT position is taken. A well-reasoned comment supporting a rule and a well-reasoned comment opposing it must receive comparable substantiveness and impact scores.

### Implementation

1. **Score Parity Audit**: After each batch analysis, compute mean CIS for:
   - Comments supporting the rule
   - Comments opposing the rule
   - Comments proposing modifications
   - Neutral/analytical comments

   If mean CIS for any position differs by >15% from the overall mean, flag the disparity for investigation. Some disparity is expected (organized industries may submit more detailed legal comments), but the system must document why.

2. **Sentiment Blindness**: The substantiveness classifier receives instructions to ignore sentiment polarity. A comment saying "This rule is terrible because it violates Section 111(a)" and "This rule is excellent because it fulfills Section 111(a)" should receive identical Legal Specificity scores (both cite the same statute with analysis).

3. **Red Team Testing**: Before deployment on each new docket, run the classifier on a balanced test set of synthetic comments (half supporting, half opposing, matched for argument quality). Verify symmetric scores.

4. **Label Audit Log**: Every classification decision is logged with:
   - Input comment text
   - Chain-of-thought reasoning
   - Output labels and scores
   - Model version and timestamp
   - Human override (if any) and override rationale

## E.2 Bias Detection Mechanisms

```
BIAS DETECTION METRICS (computed per batch):

1. COMMENTER TYPE PARITY
   For each commenter_type T:
     mean_CIS(T) vs. mean_CIS(all)
     Report: deviation and statistical significance (t-test, p<0.05)

2. COMMENT LENGTH CORRELATION
   Compute: Pearson r between comment word_count and CIS
   Expected: Weak positive (r < 0.3). Moderate+ indicates length bias.
   Report: correlation coefficient and scatter plot data.

3. VOCABULARY BIAS
   For each substantiveness label:
     Extract top-50 predictive unigrams (by mutual information)
     Manual review: Do these terms reflect argument quality or
     demographic/political signals?
   Report: predictive vocabulary list for human review.

4. TEMPORAL BIAS
   Compute: mean CIS by submission date (weekly buckets)
   Report: time series. Significant trends may indicate model drift
   or systematic differences in early vs. late commenters.

5. ORGANIZATION SIZE PROXY
   If comment includes organization name:
     Correlate CIS with organization type (individual vs. small org
     vs. large org vs. government)
   Report: distribution by category.

RESPONSE PROTOCOL:
  - If any metric exceeds threshold → flag in batch summary
  - Analyst reviews flagged metrics before results are published
  - Persistent bias → retrain/recalibrate before next batch
```

## E.3 Transparency Measures

1. **Methodology Documentation**: The complete CIS formula, weights, factor definitions, and rubric are published alongside every analysis output. No black boxes.

2. **Factor-Level Reporting**: Every CIS reports all 7 factor scores, not just the composite. Reviewers see exactly why a score is what it is.

3. **Chain-of-Thought Visibility**: Every substantiveness classification includes the full 9-step reasoning chain. Reviewers can audit each step.

4. **Source Traceability**: Every summary sentence cites specific comment IDs and excerpts. Reviewers can click through to the original.

5. **Confidence Intervals**: Every score includes an uncertainty range. Scores are never presented as point estimates without acknowledging uncertainty.

6. **Model Card**: Published for each model in the ensemble:
   - Training data description
   - Known limitations
   - Performance metrics on held-out test set
   - Demographic performance disaggregation

## E.4 Human Oversight Integration

```
HUMAN REVIEW QUEUE (priority-ordered):

Priority 1: NOVEL ARGUMENTS
  - All HDBSCAN outliers with N > 0.7
  - Rationale: These are most likely to be overlooked and most
    consequential if the agency fails to address them

Priority 2: LOW-CONFIDENCE CLASSIFICATIONS
  - All comments with primary_confidence < 0.6
  - Rationale: The model is uncertain; human judgment needed

Priority 3: ENSEMBLE DISAGREEMENT
  - All comments where LLM and fine-tuned classifier disagree
    on primary label
  - Rationale: Disagreement indicates edge cases

Priority 4: HIGH-CIS COMMENTS
  - All comments with CIS > 70
  - Rationale: These will likely drive the agency's response
    in the final rule preamble; verify analysis is correct

Priority 5: INCONSISTENCY FLAGS
  - Comments where label and score seem contradictory
    (e.g., "non_substantive" with CIS > 50)
  - Rationale: May indicate classification or scoring error

OVERRIDE WORKFLOW:
  1. Reviewer sees AI analysis with full reasoning
  2. Reviewer can: Confirm, Modify (with rationale), or Reject
  3. Modifications are logged as training signal for model improvement
  4. Override rationale becomes part of the audit trail
  5. Override patterns are analyzed weekly to identify systematic
     model weaknesses
```

## E.5 Legal Defensibility Features

1. **Reproducibility**: All analyses are deterministic given the same model version and input. Random seeds are fixed. Results can be reproduced for litigation.

2. **Version Control**: Every model version, prompt version, and hyperparameter set is git-tagged. Analysis outputs reference the exact versions used.

3. **Audit Trail**: Complete provenance chain from raw API data through every transformation to final output. Implemented as immutable append-only log.

4. **No Automated Decisions**: The system produces recommendations only. No comment is automatically excluded, prioritized, or categorized without the possibility of human review. This is clearly documented in all outputs.

5. **APA Compliance Documentation**: For each docket analysis, the system produces a "Methodological Appendix" suitable for inclusion in the rulemaking record, documenting:
   - All models and versions used
   - Scoring methodology
   - Known limitations
   - Bias audit results
   - Human review statistics (% of comments reviewed, override rate)

---

# PART F: DEMO SCRIPT (5 MINUTES)

## F.1 Setup

Pre-load the dashboard with a completed analysis of a real docket (recommend: a recent EPA or DOT NPRM with 5,000+ comments, completed comment period).

## F.2 Script

### Minute 0:00-0:30 — Problem Statement (Mission Relevance)

> "Federal agencies receive millions of public comments on proposed rules each year. Under the APA, agencies have a legal obligation to consider and respond to significant comments. Today, that process is largely manual. DocketIQ uses AI to augment — not replace — human reviewers, helping them find the signal in the noise while maintaining full transparency and accountability."

*[Show: Dashboard landing page with docket overview]*

### Minute 0:30-1:15 — Data Ingestion (Capability 1)

> "DocketIQ pulls directly from the Federal Register API and Regulations.gov. For this docket — [name] — we ingested [N] comments. The system normalizes text, extracts entities, and builds a knowledge graph connecting dockets, documents, comments, commenters, themes, legal citations, and economic claims."

*[Show: Knowledge graph visualization in Neo4j or dashboard — zoom into a comment node and show its edges to themes, legal citations, commenter]*

### Minute 1:15-2:00 — Duplicate & Campaign Detection (Capability 2)

> "Of [N] total comments, DocketIQ identified [X] exact duplicates and [Y] campaign clusters. Here's the largest campaign — [Z] comments using this template. But we want to emphasize: campaign comments represent legitimate organizing. The system reports the pattern; it doesn't devalue these submissions."

*[Show: Campaign cluster visualization — network graph of similar comments. Click into one campaign to show template and variations.]*

### Minute 2:00-2:45 — Thematic Clustering (Capability 3)

> "The system discovered [N] distinct themes using BERTopic. Here's the theme heatmap — the hottest themes are [list top 3]. But look at these outlier comments — novel arguments that don't fit any cluster. Under the 'hard look' doctrine, these are exactly the comments an agency cannot afford to overlook."

*[Show: Theme heatmap. Click a hot theme to see sub-themes. Click a novel argument to see the full comment and why it was flagged.]*

### Minute 2:45-3:30 — Substantiveness Classification (Capability 4)

> "Every comment receives a substantiveness classification with a full chain-of-thought explanation. Watch — here's a legal argument from [commenter]. The system walks through: Does it cite law? Yes — [citation]. Does it engage with specific provisions? Yes — [provision]. Classification: Legal, confidence 0.91. Now here's the chain of reasoning the reviewer can audit."

*[Show: Comment detail view with chain-of-thought expanded. Show the 9-step reasoning. Show the multi-label output.]*

### Minute 3:30-4:15 — Comment Impact Scoring (Capability 5) + Traceability (Capability 6)

> "Each comment gets a transparent Impact Score built from 7 weighted factors. This comment scores 80 — High — primarily because of its legal specificity and novel regulatory language. Every factor is visible, every score has a confidence interval, and every summary traces back to source text with direct citations."

*[Show: CIS breakdown with factor-level radar chart. Show confidence interval. Click a summary to see source comment citations highlighted.]*

### Minute 4:15-4:45 — Executive Dashboard (Capability 7)

> "For the decision-maker, here's the executive view: substantiveness breakdown shows [X%] substantive comments across [N] themes. The review queue prioritizes novel arguments and low-confidence items for human attention. And our bias audit shows [viewpoint parity metric] — confirming the analysis is fair across all perspectives."

*[Show: Full dashboard — pie charts, heatmap, CIS distribution histogram, bias audit metrics. Show human review queue.]*

### Minute 4:45-5:00 — Closing (Tie to Judging Criteria)

> "DocketIQ demonstrates that AI can scale the public comment review process while maintaining the transparency, accountability, and viewpoint neutrality that the APA demands. Every score is explainable. Every summary is traceable. Every decision is auditable. And every AI output is a recommendation for a human reviewer, never a final determination."

## F.3 Key Talking Points for Judges

| Judging Criterion | Talking Point |
|---|---|
| **Mission Relevance** | "Built specifically for APA notice-and-comment rulemaking. The CIS weights reflect what courts actually examine in arbitrary-and-capricious review." |
| **Technical Soundness** | "Ensemble classification (LLM + fine-tuned DeBERTa), knowledge graph for relationship reasoning, RAG for grounded analysis, BERTopic for unsupervised theme discovery." |
| **Explainability & Responsible AI** | "Full chain-of-thought for every classification. 7-factor transparent scoring. Viewpoint parity audits. Confidence intervals on every score. Human-in-the-loop by design." |
| **Innovation** | "Novel argument detection via HDBSCAN outlier analysis — prioritizes the comments most likely to trigger judicial remand. Knowledge graph connects comments to legal citations and regulatory provisions. CIS methodology is published and auditable." |
| **Demo Clarity** | "The dashboard provides executive-level overview with drill-down to individual comments. Any score can be explained in seconds." |

## F.4 Anticipated Judge Questions and Answers

**Q: How do you handle viewpoint bias?**
> "Three mechanisms: First, the scoring rubric evaluates argument quality, not position — legal specificity, economic evidence, regulatory engagement. Second, we run parity audits after every batch, comparing mean scores across supporting and opposing comments. Third, we red-team with synthetic balanced test sets before deployment on each docket."

**Q: What happens when the AI gets it wrong?**
> "Every output includes a confidence score. Low-confidence items are automatically queued for human review. Ensemble disagreements are flagged. And every human override is logged — both to correct the immediate output and to improve the model over time. The system is designed to fail gracefully and transparently."

**Q: Can this scale to rules with millions of comments?**
> "The architecture separates batch processing (embeddings, clustering, campaign detection) from per-comment analysis (classification, scoring). Batch operations scale horizontally. For comment volumes like the EPA Clean Power Plan (4.3 million comments), campaign detection alone can reduce the unique-comment analysis set by 80-90%. The system processes unique analytical content, not redundant copies."

**Q: Is this legally defensible?**
> "Yes. All methodology is documented and published. All analyses are reproducible. All outputs explicitly state they are decision-support recommendations, not automated determinations. The audit trail covers every step from ingestion to output. And the Methodological Appendix is designed for inclusion in the rulemaking record."

---

# APPENDIX: QUICK REFERENCE

## API Endpoints Summary

| Data Need | API | Endpoint | Key Filter |
|---|---|---|---|
| Find NPRMs | Federal Register | `GET /api/v1/documents.json` | `conditions[type][]=PRORULE` |
| Get docket metadata | Regulations.gov | `GET /v4/dockets/{docketId}` | — |
| List docket documents | Regulations.gov | `GET /v4/documents` | `filter[docketId]={id}` |
| Get objectId for comment retrieval | Regulations.gov | `GET /v4/documents` | `filter[docketId]={id}&filter[documentType]=Proposed Rule` |
| Retrieve comments | Regulations.gov | `GET /v4/comments` | `filter[commentOnId]={objectId}` |
| Comment detail + attachments | Regulations.gov | `GET /v4/comments/{id}` | `include=attachments` |
| Bulk comment pagination (>5K) | Regulations.gov | `GET /v4/comments` | `filter[lastModifiedDate][ge]={timestamp}` |

## CIS Factor Quick Reference

| Factor | Weight | Scale | Source |
|---|---|---|---|
| V (Volume) | 0.10 | cluster_size / max_cluster_size (campaign-penalized) | Clustering pipeline |
| L (Legal) | 0.20 | 0/0.25/0.50/0.75/1.0 rubric | LLM classification |
| E (Economic) | 0.15 | 0/0.25/0.50/0.75/1.0 rubric | LLM classification |
| T (Thematic) | 0.10 | cosine_similarity to centroid | Embedding pipeline |
| N (Novelty) | 0.20 | distance-based formula | HDBSCAN + embedding pipeline |
| R (Regulatory) | 0.15 | 0/0.25/0.50/0.75/1.0 rubric | LLM classification |
| C (Credibility) | 0.10 | 0/0.25/0.50/0.75/1.0 rubric | Entity resolution + LLM |

## Substantiveness Labels

| Label | Code | APA Significance |
|---|---|---|
| Substantive Legal Argument | `legal` | Agency MUST address under hard look doctrine |
| Policy Critique | `policy` | Agency SHOULD address if raising distinct alternative |
| Economic Impact Claim | `economic` | Agency MUST address if challenging RIA (E.O. 12866) |
| Technical/Scientific Correction | `technical` | Agency MUST address if contradicting TSD |
| Personal Experience / Anecdotal | `anecdotal` | Agency may address in aggregate |
| Non-substantive / Form | `non_substantive` | Agency may acknowledge in bulk |
