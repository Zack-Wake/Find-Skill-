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

Plus a separate, persistent **Vault Sheet** ("FIND Vault — Master") with two append-only tabs, both built on the column layout and rules in `references/vault_schema.md`, applied independently per tab:

- **Vault tab** — niches that cleared both gates (`Band = vault`, Tier A/B/C). The only surface that ever feeds SCOPE (S2).
- **Watchlist tab** — niches that cleared Gate 1 but not Gate 2 (`Band = watchlist`, "good idea, not enough demand yet"). Tracked for re-check as volumes grow; never proposed for SCOPE.

## When to use

Trigger for ANY of:
- "What should I build?" / "Find me a website idea"
- "Keyword research for [topic]"
- "Find low-competition niches in [space]"
- "Is [keyword] worth building for?"
- User gives a seed term and asks about opportunity / demand / competition / monetisation
- User asks how much they could earn from a niche / keyword

## Required tools

- **Claude in Chrome** (for SERP scraping, Keyword Planner, Google Trends, quality grading — and for every in-place edit to the Vault Sheet in Stage 9: appends, staleness flips, tab setup)
- **Google Drive MCP, connected with write/create access** (used in Stage 9 to locate, create, and read the Vault Sheet — read-only "view" scope can locate and read it but cannot create it on first-ever run)
- A Google account with Google Ads / Keyword Planner access (free)
- **Node.js** (for `scripts/vault_write.js` in Stage 9 — no extra packages, built-in modules only)

If Claude in Chrome isn't available: ask the user to install it, or fall back to manual paste mode (much slower — flag this clearly).

If Drive MCP is connected read-only: Stage 9 can't create or update the Vault Sheet. Tell the user, then write this run's vault/watchlist candidates straight to `vault_fallback_<date>.csv` (step 7) so nothing is lost.

## Key references in this skill

- `references/revenue_model.md` — UK RPV tables, CTR-by-rank, the revenue formula, default sort order, and the Gates & Tiers logic used in Stage 8
- `references/vault_and_gates.md` — the reasoning behind the vault/watchlist bands and tiers (background for Stage 8)
- `references/handoff_schema.md` — the S1→S2 record shape; `band` and `opportunity_tier` are set in Stage 8
- `references/vault_schema.md` — the column layout and dedup/staleness/cap/fallback rules shared by the Vault and Watchlist tabs (Stage 9)
- `references/modifier_library.md` — exhaustive seed expansion options for Stage 2
- `references/priors.md` — Zack's domain moats (flooring, watches, BJJ, reselling): adjacency triggers, competitor walls, monetisation reality, and insider knowledge banks. Read at the start of Stage 1; applies in Stages 2, 3, and 6 only when the seed matches a moat. Ignored for unrelated seeds.
- `scripts/extract_serp.js` — paste this into Claude in Chrome's `javascript_tool` to extract a SERP
- `scripts/vault_write.js` — dedup/staleness/soft-cap/fallback functions used in Stage 9, including `planVaultAndWatchlist` which routes vault-band and watchlist-band rows to their own tab (`node scripts/vault_write.js` runs its self-test)

**Read both reference files before Stage 2 if this skill is being run fresh** — they contain detail that doesn't belong in this file.

---

## The workflow (9 stages, human-in-the-loop)

### Stage 1: Confirm intent

Ask the user (use the `ask_user_input` tool with buttons if available):

1. **Seed term**
2. **Monetisation lens** — affiliate / ads / SaaS / lead-gen / unsure
3. **Site shape** — landing / directory / tool / content hub / open
4. **Monthly revenue target** (optional) — if given, adds a `Hits Target?` flag column to Tab 2

Don't over-interrogate. If user says "unsure" or "open" on any of these, default to broad and move on.

**Moat detection.** After collecting the seed, read `references/priors.md` and scan each moat's `Adjacency triggers`. If the seed contains or closely matches one or more trigger terms:
- Set `moat_match` to that moat (e.g. "FLOORING / TRADES") — carries forward into Stages 2, 3, and 6.
- Note which competitor wall, monetisation reality, and insider knowledge bank applies.

If no trigger matches, `moat_match` is unset. Skip priors entirely for this run — do not force it onto unrelated seeds.

### Stage 2: Modifier matrix

Read `references/modifier_library.md`. Pick **up to 15 root searches** (capped — see Stage 3 for why) that fit the seed across these axes:
- Audience modifiers (`[seed] for X`)
- Use-case modifiers
- Constraint modifiers
- Intent modifiers (comparison / how-to / problem)

Bias toward UK-relevant phrasing. Tag each root search with its modifier type.

**Moat bias (applies only when `moat_match` is set).** Pull the matched moat's angles and sub-niches from `references/priors.md` and fill the 15-slot matrix with moat-specific searches first. For a flooring match: prioritise buyer-type angles (flood/insurance-payout, elderly/inheritance, sellers boosting value before sale), material sub-niches (carpet, LVT, laminate, sheet vinyl), and prep/problem angles. Generic modifiers from `references/modifier_library.md` fill remaining slots only after moat-specific angles are exhausted. Do not exceed the 15-search cap regardless of how many moat angles exist.

**Output a numbered table to the user. STOP and wait for approval.** Ask:
- Anything to remove?
- Modifiers I missed?
- Priority order?

### Stage 3: SERP scrape

**Resume check (run once at the very start of Stage 3, before the first navigation).** Call `loadCheckpoint(seed, date)` from `scripts/checkpoint.js` (where `date` is today's `YYYY-MM-DD`). If `exists` is true, the returned `doneSet`, `dedupList`, and `frequencyMap` already contain all state from the prior run — restore them as the running dedup state. Then call `pendingQueries(allQueries, doneSet)` to get only the not-yet-scraped root searches in their original order. If `exists` is false (fresh run), all root searches are pending and dedup state starts empty. Either way, `checkpointPath` is where all new records will be appended.

For each pending root search:

1. Navigate Claude in Chrome to `https://google.com/search?q=<encoded query>&hl=en&gl=uk`
2. Wait 2-3 seconds
3. Run `scripts/extract_serp.js` via `javascript_tool` action `javascript_exec`
4. Parse the returned JSON
4a. **Immediately** call `appendCheckpoint(record, checkpointPath)` from `scripts/checkpoint.js`, where `record` is `{ query_num, query, root_search, modifier_type, frequency, red_skip: false, timestamp: <ISO>, serp: <parsed extract_serp.js output> }`. Do this **before** step 5's inter-query wait — a crash mid-wait or mid-navigation loses nothing.
5. **Before navigating to the next query, wait a randomised 3-7 seconds.** Pick a new random value in this range for every query — don't fire searches back-to-back. Combined with the 15-search cap from Stage 2, this is what keeps a normal run from tripping Google's bot check.

The script extracts:
- Top 10 organic results + domain typing (Forum / BigBrand / EstablishedReview / Video / Reference / Other)
- All questions ending in `?` on the page (covers any residual PAA + Discussions module)
- "People also search for" + "Related products and services" refinements
- Competition profile: 🟢 GREEN / 🟡 YELLOW / 🟠 ORANGE / 🔴 RED (auto-calculated from domain mix)

**Moat competitor wall (applies only when `moat_match` is set).** Cross-reference the top-10 results against the moat's competitor wall in `references/priors.md` — named wall members already have the correct domain type; no guessing or per-run inference needed. For flooring: Supafit, Berwicks of Horsham, James for Carpets → `Other` (local retailer, not BigBrand); Checkatrade, MyBuilder, Rated People → `Other` (directory). These do not constitute a BigBrand or EstablishedReview wall. A flooring SERP that surfaces only wall members stays GREEN or YELLOW — do not auto-grade it RED.

**Important: Google retired classic PAA boxes for most commercial queries in 2025-26.** Do not waste time clicking PAA expansions; the modern signals are PAS, Discussions, and Related Products. The extraction script handles this.

**Dedupe across searches.** Maintain a running list of unique queries. New query >80% semantically similar to existing → skip but increment a `frequency` counter on the original (signal of importance across modifiers).

**Auto-skip rule.** If a root search returns competition profile 🔴 RED (5+ established review sites or big-brand SaaS in top 10), call `appendCheckpoint` with `{ ..., red_skip: true, serp: null }` before moving on, then flag it as "wall — skip" and don't expand its PAS. Recording it prevents re-fetching on resume.

### Stage 4: Fill Tab 1 (Raw Discovery)

**Tab 1 source.** Tab 1 is built from the checkpoint file at `runs/<seed-slug>_<YYYY-MM-DD>/checkpoint.jsonl` — every JSONL record contains the full extract_serp.js output plus Stage 3 bookkeeping, enough to reconstruct Tab 1 without re-scraping.

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

**Moat monetisation override (applies only when `moat_match` is set).** Use the moat's `Monetisation reality` from `references/priors.md` as the primary signal — it overrides what the top-3 sites appear to use. For flooring: tag as `lead-gen-local` (primary); fall back to `ads-generic` or `affiliate-physical` only for clearly informational-only clusters. Never tag a flooring cluster as `affiliate-saas` — that contradicts moat reality.

**Insider knowledge flag (applies only when `moat_match` is set).** Add `insider knowledge available — [moat name]` to the cluster's `Notes` field. For flooring clusters whose head term matches resin/epoxy/screed triggers, note `contact-sourced, not first-hand` instead — per `references/priors.md`.

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
   - Gate 1 passes, Gate 2 fails → `Band = watchlist`, `Opportunity Tier` left blank (no tier).
   - Gate 1 fails (RED) → leave `Band` and `Opportunity Tier` blank.
4. If the cluster has low revenue confidence (per the "Validate-before-build flag" rule in `references/revenue_model.md`) and `Band = vault`, append `validate before build` to `Notes`.

**Never filter or delete rows.** `Band` and `Opportunity Tier` are additional Tab 2 columns — RED and watchlist rows stay in the full sheet exactly as Stage 7 produced them, just with these two columns filled in.

### Stage 9: Save to Vault & Watchlist

Read `references/vault_schema.md` for the column layout and dedup/staleness/cap/fallback rules, and `scripts/vault_write.js` for the runnable logic (`node scripts/vault_write.js` runs its self-test). This stage applies those rules independently to two tabs of the same persistent sheet — **Vault** and **Watchlist** — never to each other's rows.

**Drive MCP vs Claude in Chrome — who does what.** Drive MCP (the Drive API) can create a whole file and read a file's current contents, but it **cannot** append rows, edit cells, or add a tab to a spreadsheet that already exists — those are Sheets-UI operations. So:
- **Drive MCP**: locate the Vault Sheet, create it if it doesn't exist yet, and read its current rows (both tabs) for the dedup/staleness/cap calculations below.
- **Claude in Chrome**: perform every in-place edit on the live sheet — staleness-flag flips (step 3), new-row appends (step 6), and the one-time Watchlist-tab setup (step 1).

1. **Locate the Vault Sheet.** Search Drive (via Drive MCP) for a Sheet titled "FIND Vault — Master".
   - **If found**: reuse it — never create a second one. If it currently has only one tab (e.g. it was created via a Drive MCP file upload, which produces a single tab), that tab holds the **Vault** column headers (25 columns per `references/vault_schema.md`) — use Chrome to confirm/rename it to "Vault" and add a **Watchlist** tab with the same header row. This setup only happens once.
   - **If not found**: create it via Drive MCP — upload a CSV containing just the Vault header row from `references/vault_schema.md` (Drive converts this to a single-tab Sheet), note its link, then use Chrome to add the **Watchlist** tab with the same header row.
2. **Check for pending fallback files.** If any `vault_fallback_*.csv` exist in the working directory (left by a previous run where a tab was unreachable), read them with `readPendingFallbacks` — each row's `band` says which tab it belongs to. Mark each file merged with `markFallbackMerged` once its rows have been appended to the right tab.
3. **Staleness sweep — both tabs, independently.** For the Vault tab's existing rows and again for the Watchlist tab's existing rows (read via Drive MCP), run `sweepStaleness(existingRows, today)` and apply each returned `{niche_id, staleness_flag: true}` patch as a single-cell edit **in Chrome** — the only in-place edit ever made to an existing row.
4. **Build candidates.** From this run's Tab 2, take every row where `Band` is `vault` or `watchlist` (RED and blank-Band rows are excluded automatically) and map its columns onto the field list in `references/vault_schema.md` (e.g. `Monthly Revenue Low (£)` → `monthly_revenue_low`, `Cluster Name` → `niche_label`).
5. **Plan the append — split by band.** Run `planVaultAndWatchlist(candidates, existingVaultRows, existingWatchlistRows, today)`. It splits candidates by `band` and runs the same dedup + soft-cap (`SOFT_CAP_PER_RUN` = 50) + sort-by-`monthly_revenue_low`-descending logic independently for each tab, returning `{vault: {toAppend, skippedDupes, overflow}, watchlist: {toAppend, skippedDupes, overflow}}`.
6. **Append — to the matching tab only, via Chrome.** In the Sheets UI, write `vault.toAppend` to the end of the Vault tab and `watchlist.toAppend` to the end of the Watchlist tab, one row per niche, in the column order from `references/vault_schema.md`. Never overwrite, reorder, or move a row between tabs.
7. **If a tab is unreachable at any point** (Drive MCP can't read it, or Chrome can't open/edit it): tell the user immediately, then write the affected `toAppend` rows to a local fallback file with `writeFallback(rows, dir, today)`. Nothing is lost — it's picked up by step 2 on a future run.

**Watchlist rows never advance to SCOPE.** The Watchlist tab is tracking-only — "good idea, not enough demand yet". Only Vault-tab rows (Tier A/B/C) are ever proposed as S1→S2 handoff candidates.

**Never filter or delete rows — in either tab or in Tab 2.** Step 3's staleness flip is the only sanctioned in-place edit; everything else is append-only.

### Stage 10: Emit FIND→SCOPE handoff records

After Stage 9 completes the Vault write, call `emitHandoffs` from `scripts/emit_handoff.js` with this run's vault rows:

```js
const { emitHandoffs } = require('./scripts/emit_handoff');
const result = emitHandoffs(vault.toAppend);
// result → { emitted: string[], skipped: Array<{niche_id, reason}> }
```

**Vault niches only.** Watchlist and excluded niches do not emit — they stay tracked in the sheet per the never-delete rule. This step does not duplicate or re-score any data; it assembles what Stage 9 already wrote.

Each emitted record lands in `data/handoffs/<niche_id>.json` — one file per niche, schema-versioned (v1.2), committed. The file carries every provenance flag the schema defines: `volume_confidence`, `revenue_confidence`, and any `notes` flags (e.g. `validate before build`, `revenue_model:cpc-traffic-value`, `manual KP check required before build`) — so SCOPE knows exactly what is verified vs estimated.

**If a required field is missing on a niche:** `emitHandoffs` skips that record and logs `handoff skipped: <niche_id>: missing <field>`. The Vault row is unaffected. Never fabricate or default a missing field.

**Emit only.** No scoring, no gating change, no Vault/Watchlist edit. The schema is defined by `references/vault_schema.md`; this step reads it, never edits it.

### Final delivery

Share both Sheet links — the run's Tab 1/2 sheet and the Vault Sheet. In the chat:

1. Highlight the **top 5 by revenue** with a one-line "why this one" for each
2. Highlight any **🔴 RED clusters** the user explicitly asked about, so they know why they were skipped (not forgotten)
3. Flag any **fast-payback opportunities** (high revenue AND <6 months) — those are the immediate wins
4. Report the **vault/watchlist split**: how many clusters landed in `vault` (by tier A/B/C) vs `watchlist`
5. Report **Vault & Watchlist save results**, for each tab separately: how many rows were newly appended, how many were skipped as dupes, how many existing rows were freshly flagged stale, and any soft-cap overflow or fallback-file note. Make clear that Watchlist rows are tracked only — none are proposed for SCOPE.
6. If `moat_match` was set: call out which vault clusters have **insider knowledge available** in their Notes — these are the highest-confidence content plays and the ones where RANK content can differentiate from generic AI output.
7. Ask for feedback: anything that looks wrong, anything surprising?

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
4. End of Stage 9 — collect feedback for `learnings.md`

User can say "run it end-to-end" to skip checkpoints once trust is established.

---

## Failure modes to watch for

- **🔴 RED everywhere**: if every modifier returns RED, the entire seed niche is saturated. Suggest the user pivots to adjacent seeds (e.g. instead of "website builder", try "portfolio platform").
- **Volume range too wide to score**: Keyword Planner returns 100-1K bands. Use Trends for the tie-break and Top-Page Bid as commercial-intent signal.
- **Reddit-#1 false positives**: sometimes Reddit ranks because the question is genuinely better answered as a community discussion (e.g. "is X a scam"). Read the thread before scoring as opportunity.
- **Cluster bleed**: if a cluster has queries with very different intent (info vs commercial), split it into two clusters. Different revenue profiles.
- **CAPTCHA after rapid Google searches**: Stage 2's 15-search cap and Stage 3's randomised 3-7s gap between scrapes are tuned to avoid this under normal conditions. If a CAPTCHA still appears, pause 60-90 seconds and resume. If it keeps happening, widen the gap to 8-12s (randomised) for the rest of the run.
- **Stale RPV figures**: the table in `references/revenue_model.md` is good for 2025-26 UK. Refresh annually.
- **AdSense decline**: display ad RPMs have been trending down ~5-10% per year. Use the lower end of the band for new builds.

---

## Notes for future improvement

- Integrate Ahrefs free tools (Site Explorer free tier) for backlink-strength check on top-5 competitors — adds a "ranking difficulty" beyond domain typing.
- Add domain-age check on top-5 results (newer domains ranking = the SERP is genuinely soft).
- Build a `monetisation_playbook.md` reference mapping each tag → revenue-implementation guide (which affiliate networks, which ad provider, etc).
