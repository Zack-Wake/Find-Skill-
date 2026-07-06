# Revenue Model — UK Indie SEO

This is the reference table the skill uses to convert opportunity data into £ projections.
Used in Stage 7 (scoring) of the main workflow.

## Realistic rank position by competition profile

Indie devs don't rank #1 against established players. Use the realistic ceiling.

| Competition Profile | Realistic Rank | Avg CTR | Notes |
|---|---|---|---|
| 🟢 GREEN — Forums/Reddit dominant, ≤2 strong sites in top 10 | Rank 2-3 | 18% | The honest-to-god opportunity zone |
| 🟡 YELLOW — Mixed, 1 forum + 3-4 strong sites | Rank 4-6 | 7% | Doable with depth + UK angle |
| 🟠 ORANGE — Strong supply with visible gaps (stale content, thin sites) | Rank 7-10 | 2.5% | Long tail only; head term lost |
| 🔴 RED — Affiliate wall (5+ established review/SaaS sites) | Skip | — | Years of effort to crack |

CTR figures are UK organic averages; Advanced Web Ranking 2024-25 study.

## Revenue per visitor (RPV) by monetisation type

| Monetisation Tag | RPV Low | RPV High | Notes |
|---|---|---|---|
| `affiliate-saas-high-ticket` | £0.40 | £1.50 | Website builders, hosting, VPN, email tools. £50-150 commissions × 1-3% conv. |
| `affiliate-saas-low-ticket` | £0.15 | £0.50 | Smaller SaaS, courses, lower commissions. |
| `affiliate-physical` | £0.05 | £0.20 | Amazon Associates, Awin retail (UK rates 1-4%). |
| `ads-generic` | £0.004 | £0.010 | AdSense on info content, £4-10 RPM realistic for UK. |
| `ads-premium-niche` | £0.015 | £0.030 | Finance, legal, SaaS-adjacent: Mediavine / Ezoic level (£15-30 RPM). |
| `lead-gen-local` | £0.30 | £3.00 | UK trades, services. £5-50 per lead × 1-3% form-fill conversion. |
| `lead-gen-b2b` | £1.00 | £8.00 | B2B SaaS/agency leads. £50-500 per qualified lead × 0.5-2% conv. |
| `own-saas` | varies | varies | Subscription price × free-to-paid conversion (typically 0.5-2%). Calculate separately. |
| `own-product-onetime` | varies | varies | Price × add-to-cart-conv × checkout-conv (typically 0.5-2% end-to-end). |
| `low-monetise` | £0.001 | £0.005 | Pure curiosity content; only valuable for ad farms with massive scale. |

UK-specific notes:
- AdSense RPMs are ~30-40% below US — figures above are UK-realistic, not US/global.
- BA Amex, finance, energy switching, insurance are unusually high (£0.50-2.00 RPV) — flag separately.
- VAT considerations: if running through a UK LTD with VAT registration, deduct 20% from gross above £90k threshold.

## The formula

**Step 1: Cluster volume**

For each opportunity row, sum:
- Head term monthly volume
- All semantically-related PAS / sub-niche queries from the same SERP discovery
- Estimated long-tail multiplier (typically 1.5-3× head, depending on niche breadth)

```
Cluster_Volume = Head_Volume + Σ(PAS_Volumes) + Head_Volume × 0.5  // long-tail buffer
```

**Step 2: Realistic monthly visitors**

```
Monthly_Visitors = Cluster_Volume × CTR_at_realistic_rank
```

**Step 3: Revenue band**

```
Monthly_Revenue_Low  = Monthly_Visitors × RPV_Low
Monthly_Revenue_High = Monthly_Visitors × RPV_High
```

**Step 4: Months-to-realistic-revenue estimate**

| Profile | Months to hit realistic rank |
|---|---|
| 🟢 GREEN | 3-6 months |
| 🟡 YELLOW | 6-9 months |
| 🟠 ORANGE | 9-18 months |
| 🔴 RED | Don't model — skip |

## Default sort order

Sort rows by **`Monthly_Revenue_Low` DESCENDING**.

This auto-encodes the "sweet spot" the user wants because:
- Low-supply niches → better realistic rank → higher CTR → higher visitors → higher £
- High-volume niches with brutal competition get pushed down naturally (rank 10 × 2.5% CTR kills them)
- The conservative `_Low` figure prevents over-optimistic ranking

Tie-break: `Months_to_Revenue` ascending (faster payback wins).

## Optional revenue-target column (do NOT filter)

If the user provides a monthly revenue target (e.g. £1,500), add a column:

```
Hits_Target = "✅" if Monthly_Revenue_High >= target
            = "⚠️ stretch" if Monthly_Revenue_Low < target <= Monthly_Revenue_High
            = "❌" otherwise
```

**Critical**: never delete rows below target. The user explicitly asked for the full sheet to track emerging niches. A flag column only.

## Conditional AI-Overview (AIO) CTR table

When Google shows an AI Overview (AIO) for a query, organic CTR takes a haircut — users get their answer from the overview and click through less. If `aio_present: true` for a query/cluster, use the AIO-adjusted CTR below in place of the base CTR from the realistic-rank table; otherwise use the base CTR as normal.

| Competition Profile | Realistic Rank | Base CTR (no AIO) | AIO Haircut | CTR with AIO |
|---|---|---|---|---|
| 🟢 GREEN | Rank 2-3 | 18% | -55% | 8.0% |
| 🟡 YELLOW | Rank 4-6 | 7% | -50% | 3.5% |
| 🟠 ORANGE | Rank 7-10 | 2.5% | -40% | 1.5% |
| 🔴 RED | Skip | — | — | — |

Haircuts (55% / 50% / 40%) are population averages — calibrate via `references/learnings.md` after live runs.

**Step 2 (revised for AIO):**

```
CTR              = aio_present ? CTR_with_AIO[Competition_Profile] : Base_CTR[Competition_Profile]
Monthly_Visitors = Cluster_Volume × CTR
```

`aio_present` is captured per query during Stage 3 (SERP scrape) and carried into the cluster record — see `references/handoff_schema.md`.

## Gates & Tiers — Vault & Watchlist (S1-007)

After Steps 1-4 above produce `Monthly_Revenue_Low/High` for a cluster, run it through the two-gate qualification. This sets the `Band` and `Opportunity Tier` columns on Tab 2 — see `references/vault_and_gates.md` for the reasoning and `references/handoff_schema.md` for how these map onto the S1→S2 record.

**The gate constant — single source of truth**

```
VAULT_REVENUE_GATE_LOW = £800
```

Reference this constant wherever the £800 threshold is needed. Do not restate the number elsewhere.

**Gate 1 — Supply**

| Competition Profile | Gate 1 |
|---|---|
| 🟢 GREEN / 🟡 YELLOW / 🟠 ORANGE | pass |
| 🔴 RED | fail |

**Gate 2 — Money**

```
Gate_2 = (Monthly_Revenue_Low >= VAULT_REVENUE_GATE_LOW) AND (Monetisation_Tag is assigned)
```

A Monetisation Tag is always assigned by Stage 6, so Gate 2 in practice is the £800 check on `Monthly_Revenue_Low`.

**Band & Opportunity Tier assignment**

| Gate 1 | Gate 2 | Band | Opportunity Tier |
|---|---|---|---|
| pass — GREEN | pass | vault | A |
| pass — YELLOW | pass | vault | B |
| pass — ORANGE | pass | vault | C |
| pass | fail | watchlist | *(blank)* |
| fail (RED) | — | *(none — full sheet only)* | *(none)* |

`*(blank)*` / `*(none)*` mean leave the Tab 2 cell empty — don't write the literal text "null".

Tier is assigned only after clearing the £800 gate — e.g. a £300/mo GREEN niche goes to `watchlist`, not Tier A.

**Validate-before-build flag**

A cluster has **low revenue confidence** if any of its queries were marked "negligible volume" in Stage 5, or if the head term's Keyword Planner volume sits in the widest band (100-1K). If `Band = vault` and revenue confidence is low, append `validate before build` to the row's `Notes`.

**Never filter or delete rows.** `Band` and `Opportunity Tier` are additional Tab 2 columns — RED and watchlist rows stay in the full sheet, unchanged otherwise from Stage 7's output.

## CPC-traffic-value model — lead-gen Gate-2 second path (S1-018)

A second sourced route to Gate 2 for `lead-gen-local` and `lead-gen-b2b` clusters only.
Implemented in `scripts/leadgen_model.js`; consumes CPC data stored by `scripts/cpc_capture.js`.

### What it is

Organic traffic on a lead-gen keyword has a measurable floor value: what an advertiser pays per click to reach the same searcher via paid search. If the monthly organic visitors would be worth ≥ £800 at that CPC rate, the niche is commercially viable even when the RPV formula falls short.

This is a **conservative proxy floor** — a real lead is almost always worth more than one click's ad value (leads convert to enquiries, enquiries to jobs). The CPC value is the floor, not the ceiling.

### Formula

```
cpc_traffic_value = clusterVolume × CTR(competitionProfile) × cpc_low
```

- `clusterVolume` — same cluster volume as Stage 7 (head + PAS + long-tail buffer)
- `CTR(competitionProfile)` — from the realistic-rank table above (do not redefine)
- `cpc_low` — low end of the KP top-of-page bid range, captured via `captureCPC` in Stage 5

Uses the **low end** of the CPC range and the **band CTR** (not best-case) throughout — conservative because this value decides a PASS.

### Confidence

`confidence: 'low'` on every CPC-path result. KP bid ranges are indicators of advertiser demand, not receipts. The model will be recalibrated with real data in PROD-006 once builds are live.

### Gate-2 decision

```
Gate_2 (lead-gen) = (Monthly_Revenue_Low >= VAULT_REVENUE_GATE_LOW)  // RPV path
                 OR (cpc_traffic_value    >= VAULT_REVENUE_GATE_LOW)  // CPC path
```

The `VAULT_REVENUE_GATE_LOW = £800` constant is unchanged. This is a second sourced route to the same floor, not a lower bar.

### Flags on a CPC-path pass

When Gate 2 passes via the CPC path (RPV failed), three flags are appended to the cluster's `Notes` in Tab 2:

| Flag | Meaning |
|---|---|
| `revenue_model:cpc-traffic-value` | Identifies which model decided the pass |
| `revenue_confidence:low` | KP bids are an indicator; calibrate before scaling |
| `manual KP check required before build` | Verify the CPC figure is current before committing to build |

### Fallback when no CPC is captured

If `getCPC(keyword)` returns null (no `captureCPC` call was made during Stage 5 for this cluster):
- Gate 2 falls back to RPV-only
- Flag `lead-gen model not evaluated (no CPC)` appended to `Notes`
- No fabrication: the CPC path simply does not run

### What this model never does

- Fabricates, estimates, or defaults a CPC figure
- Changes the £800 floor or RPV bands
- Applies to non-lead-gen tags
- Models enquiry rate × price-per-lead — that requires marketplace per-lead data and is a separate future packet
