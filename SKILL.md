---
name: serp-opportunity-finder
description: Finds high-demand low-competition keyword niches and projects realistic monthly UK revenue from ranking on them. Use whenever the user asks about keyword research, SEO niche-finding, finding a website to build, "what should I build", content gap analysis, search demand vs supply analysis, identifying underserved search terms, or wants to know if a niche is worth their time as an indie developer. Trigger even on vague seeds like "website builder" or "dog training" — this skill turns a single seed into a ranked Google Sheet with revenue projections. Requires Claude in Chrome and a Google account.
---

# SERP Opportunity Finder

Turn one seed term into a ranked Google Sheet of buildable website opportunities, scored by realistic monthly UK revenue at the rank position you can realistically reach.

## What this skill outputs

A two-tab Google Sheet:

- **Tab 1 — Raw Discovery**: every query found, tagged by source modifier, with SERP composition
- **Tab 2 — Ranked Opportunities**: sorted by `Realistic Monthly Revenue (Low)` descending, with full revenue band, monetisation tag, build-effort tag, months-to-revenue estimate, and a vault/watchlist `Band` + `Opportunity Tier` (A/B/C) from the two-gate qualification

The full sheet is always returned — no rows filtered out. The user explicitly wants emerging niches tracked too, not just the obvious winners.

## When to use

Trigger for ANY of:
- "What should I build?" / "Find me a website idea"
- "Keyword research for [topic]"
- "Find low-competition niches in [space]"
- "Is [keyword] worth building for?"
- User gives a seed term and asks about opportunity / demand / competition / monetisation
- User asks how much they could earn from a niche / keyword

## Required tools

- **Claude in Chrome** (for SERP scraping, Keyword Planner, Google Trends, quality grading)
- **Google Drive MCP** (for the output Sheet)
- A Google account with Google Ads / Keyword Planner access (free)

If Claude in Chrome isn't available: ask the user to install it, or fall back to manual paste mode (much slower — flag this clearly).

## Key references in this skill

- `references/revenue_model.md` — UK RPV tables, CTR-by-rank, the revenue formula, default sort order, and the Gates & Tiers logic used in Stage 8
- `references/vault_and_gates.md` — the reasoning behind the vault/watchlist bands and tiers (background for Stage 8)
- `references/handoff_schema.md` — the S1→S2 record shape; `band` and `opportunity_tier` are set in Stage 8
- `references/modifier_library.md` — exhaustive seed expansion options for Stage 2
- `scripts/extract_serp.js` — paste this into Claude in Chrome's `javascript_tool` to extract a SERP

**Read both reference files before Stage 2 if this skill is being run fresh** — they contain detail that doesn't belong in this file.

---

## The workflow (8 stages, human-in-the-loop)

### Stage 1: Confirm intent

Ask the user (use the `ask_user_input` tool with buttons if available):

1. **Seed term**
2. **Monetisation lens** — affiliate / ads / SaaS / lead-gen / unsure
3. **Site shape** — landing / directory / tool / content hub / open
4. **Monthly revenue target** (optional) — if given, adds a `Hits Target?` flag column to Tab 2

Don't over-interrogate. If user says "unsure" or "open" on any of these, default to broad and move on.

### Stage 2: Modifier matrix

Read `references/modifier_library.md`. Pick 15-25 root searches that fit the seed across these axes:
- Audience modifiers (`[seed] for X`)
- Use-case modifiers
- Constraint modifiers
- Intent modifiers (comparison / how-to / problem)

Bias toward UK-relevant phrasing. Tag each root search with its modifier type.

**Output a numbered table to the user. STOP and wait for approval.** Ask:
- Anything to remove?
- Modifiers I missed?
- Priority order?

### Stage 3: SERP scrape

For each approved root search:

1. Navigate Claude in Chrome to `https://google.com/search?q=<encoded query>&hl=en&gl=uk`
2. Wait 2-3 seconds
3. Run `scripts/extract_serp.js` via `javascript_tool` action `javascript_exec`
4. Parse the returned JSON

The script extracts:
- Top 10 organic results + domain typing (Forum / BigBrand / EstablishedReview / Video / Reference / Other)
- All questions ending in `?` on the page (covers any residual PAA + Discussions module)
- "People also search for" + "Related products and services" refinements
- Competition profile: 🟢 GREEN / 🟡 YELLOW / 🟠 ORANGE / 🔴 RED (auto-calculated from domain mix)

**Important: Google retired classic PAA boxes for most commercial queries in 2025-26.** Do not waste time clicking PAA expansions; the modern signals are PAS, Discussions, and Related Products. The extraction script handles this.

**Dedupe across searches.** Maintain a running list of unique queries. New query >80% semantically similar to existing → skip but increment a `frequency` counter on the original (signal of importance across modifiers).

**Auto-skip rule.** If a root search returns competition profile 🔴 RED (5+ established review sites or big-brand SaaS in top 10), flag it as "wall — skip" and don't expand its PAS. Don't waste budget.

### Stage 4: Fill Tab 1 (Raw Discovery)

Create Google Sheet via Drive MCP. Tab 1 columns:

| # | Query | Source Modifier | Root Search | Frequency | Competition Profile | Top-10 Domain Mix | SERP Notes |

The `Top-10 Domain Mix` cell is a compact summary like `Forum:2, BigBrand:3, Review:2, Other:3`.

**STOP. Show user. Ask if any rows look obviously wrong.**

### Stage 5: Volume + Trend lookup

For non-RED queries, use Claude in Chrome to:

1. **Google Keyword Planner** (`ads.google.com/aw/keywordplanner`) — set region to United Kingdom, paste queries in batches of 10. Capture: monthly volume range, ad competition (low/med/high — proxy for commercial intent), top-of-page bid range in £ (commercial intent signal).
2. **Google Trends** (`trends.google.com`) — UK region, 12 months. Capture: trend direction (growing / flat / declining), seasonality flag.

Add to working sheet:
| Monthly Volume | Ad Competition | Top-Page Bid (£) | 12mo Trend | Seasonal? |

For queries with no clear volume signal: mark "negligible volume" but **keep the row** (user wants emerging niches tracked).

### Stage 6: Cluster mapping + monetisation tagging

This is the prep step for revenue calculation.

**Cluster mapping**: group semantically-related queries from Tab 1 into clusters. A cluster = head term + all its PAS variants + sub-niche queries that would all rank on the same hub of content.

Example cluster for "website builder for artists":
- website builder for artists (head)
- best website builder for artists
- website builder for artists free
- websites for artists to sell work
- artist website examples
- best website builder for artists reddit
- website builder for artist portfolio

These all land on one site / one content hub. Sum their volumes for the cluster.

**Monetisation tag**: assign one tag per cluster from the table in `references/revenue_model.md`:
- `affiliate-saas-high-ticket`, `affiliate-saas-low-ticket`, `affiliate-physical`
- `ads-generic`, `ads-premium-niche`
- `lead-gen-local`, `lead-gen-b2b`
- `own-saas`, `own-product-onetime`
- `low-monetise`

Choose based on:
- What the top-3 ranking sites currently monetise with
- Ad competition / top-page-bid (high £ bids = expensive ads = affiliate gold)
- User's stated monetisation lens from Stage 1

### Stage 7: Revenue calculation + Tab 2

Read `references/revenue_model.md` for the full formula and RPV table.

For each cluster:

```
Realistic_Rank      = lookup by Competition_Profile  (GREEN→2-3, YELLOW→4-6, ORANGE→7-10, RED→skip)
CTR                 = lookup by Realistic_Rank       (18%, 7%, 2.5%, 0%)
Cluster_Volume      = Head_Volume + Σ(PAS_Volumes) + Head_Volume × 0.5
Monthly_Visitors    = Cluster_Volume × CTR
RPV_Low, RPV_High   = lookup by Monetisation_Tag
Monthly_Revenue_Low  = Monthly_Visitors × RPV_Low
Monthly_Revenue_High = Monthly_Visitors × RPV_High
Months_to_Revenue   = lookup by Competition_Profile  (3-6, 6-9, 9-18 months)
```

**Tab 2 columns** (in this order):

| Rank | Cluster Name | Cluster Volume | Competition | Realistic Rank | Monthly Visitors | Monetisation Tag | RPV Range (£) | **Monthly Revenue Low (£)** | **Monthly Revenue High (£)** | Months to Revenue | Build Effort | Band | Opportunity Tier | Hits Target? | Notes |

`Band` and `Opportunity Tier` are populated in Stage 8 — leave blank here.

**Sort: `Monthly Revenue Low` DESCENDING.** Tie-break: `Months to Revenue` ascending.

**Never filter rows.** The full sheet is the deliverable. If user gave a target in Stage 1, the `Hits Target?` column flags ✅ / ⚠️ stretch / ❌, but no row is removed.

### Stage 8: Gate qualification + Band/Tier

Read the "Gates & Tiers" section of `references/revenue_model.md` for the gate constant and the assignment table — apply it as written, do not redefine the £800 threshold here.

For each cluster row from Stage 7:

1. **Gate 1 (supply):** Competition Profile is not 🔴 RED.
2. **Gate 2 (money):** `Monthly Revenue Low (£)` ≥ the gate constant in `references/revenue_model.md`, and a Monetisation Tag is assigned.
3. Set `Band` and `Opportunity Tier` per the assignment table in `references/revenue_model.md`:
   - Both gates pass → `Band = vault`, `Opportunity Tier` by Competition Profile colour (GREEN=A, YELLOW=B, ORANGE=C).
   - Gate 1 passes, Gate 2 fails → `Band = watchlist`, `Opportunity Tier = null`.
   - Gate 1 fails (RED) → leave `Band` and `Opportunity Tier` blank.
4. If the cluster has low revenue confidence (per the "Validate-before-build flag" rule in `references/revenue_model.md`) and `Band = vault`, append `validate before build` to `Notes`.

**Never filter or delete rows.** `Band` and `Opportunity Tier` are additional Tab 2 columns — RED and watchlist rows stay in the full sheet exactly as Stage 7 produced them, just with these two columns filled in.

### Final delivery

Share both Sheet links. In the chat:

1. Highlight the **top 5 by revenue** with a one-line "why this one" for each
2. Highlight any **🔴 RED clusters** the user explicitly asked about, so they know why they were skipped (not forgotten)
3. Flag any **fast-payback opportunities** (high revenue AND <6 months) — those are the immediate wins
4. Report the **vault/watchlist split**: how many clusters landed in `vault` (by tier A/B/C) vs `watchlist`
5. Ask for feedback: anything that looks wrong, anything surprising?

**Capture corrections to `learnings.md`** (create the file next to SKILL.md on first feedback). Examples worth logging:
- "X niche is dead because Y" — niche-specific rules
- "Skip Z modifier — never useful for trades" — modifier pruning rules
- "RPV for [tag] should be higher in UK" — RPV adjustments
- "Use [other site] for top-page bid instead of Keyword Planner because it's blocked" — tool fallbacks

The skill applies these on next run.

---

## Human-in-the-loop checkpoints

1. End of Stage 1 — confirm seed + lenses
2. End of Stage 2 — approve modifier matrix
3. End of Stage 4 — sanity-check raw discovery before spending volume-lookup time
4. End of Stage 8 — collect feedback for `learnings.md`

User can say "run it end-to-end" to skip checkpoints once trust is established.

---

## Failure modes to watch for

- **🔴 RED everywhere**: if every modifier returns RED, the entire seed niche is saturated. Suggest the user pivots to adjacent seeds (e.g. instead of "website builder", try "portfolio platform").
- **Volume range too wide to score**: Keyword Planner returns 100-1K bands. Use Trends for the tie-break and Top-Page Bid as commercial-intent signal.
- **Reddit-#1 false positives**: sometimes Reddit ranks because the question is genuinely better answered as a community discussion (e.g. "is X a scam"). Read the thread before scoring as opportunity.
- **Cluster bleed**: if a cluster has queries with very different intent (info vs commercial), split it into two clusters. Different revenue profiles.
- **CAPTCHA after rapid Google searches**: the script triggers Google's bot detection after ~10-15 rapid queries. If detected, pause 60-90 seconds and resume. If persistent, slow the cadence to one query every 8-10 seconds.
- **Stale RPV figures**: the table in `references/revenue_model.md` is good for 2025-26 UK. Refresh annually.
- **AdSense decline**: display ad RPMs have been trending down ~5-10% per year. Use the lower end of the band for new builds.

---

## Notes for future improvement

- Integrate Ahrefs free tools (Site Explorer free tier) for backlink-strength check on top-5 competitors — adds a "ranking difficulty" beyond domain typing.
- Add domain-age check on top-5 results (newer domains ranking = the SERP is genuinely soft).
- Build a `monetisation_playbook.md` reference mapping each tag → revenue-implementation guide (which affiliate networks, which ad provider, etc).
- Consider a `priors.md` file that captures Zack-specific niches with insider knowledge (flooring, trades, BJJ, watches, reselling) so the skill biases the modifier matrix toward his moats.
