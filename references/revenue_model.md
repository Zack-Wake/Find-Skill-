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
| 🟢 GREEN | Rank 2-3 | 18% | -55% | 8.1% |
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
