# Handoff Contract — PROD-001 (v1.2)

The fixed form FIND hands to SCOPE. One record = one niche advanced through the gate. Multiple niches = an array of these. Once locked, SCOPE can be built entirely on its own.

## The shape (worked example — tradespeople, deliberately a WATCHLIST case)

```json
{
  "schema_version": "1.2",
  "niche_id": "website-builder-tradespeople",
  "niche_label": "Website builder for tradespeople",
  "seed_term": "website builder",
  "selected_at": "2026-06-12",
  "head_keyword": "website builder for tradespeople",
  "cluster_keywords": ["website builder for plumbers", "website builder for electricians", "website builder for builders", "tradesman website template"],
  "cluster_volume": 1840,
  "volume_confidence": "medium",
  "competition_tier": "GREEN",
  "realistic_rank": 2,
  "aio_present": false,
  "monetisation_tag": "lead-gen-local",
  "rpv_band": [0.30, 3.00],
  "monthly_revenue_band": [99, 994],
  "revenue_confidence": "medium",
  "opportunity_tier": null,
  "band": "watchlist",
  "staleness_flag": false,
  "priors_match": "trades",
  "trend": "flat",
  "notes": "Passes supply + monetisation, but head-term low-end (£99) is below the £800 gate → WATCHLIST. Sub-expansion across trades would lift volume enough to promote to Tier A.",
  "source_run": "https://docs.google.com/..."
}
```

## Required fields

**What it is:** `schema_version`, `niche_id` (slug), `niche_label`, `seed_term`, `selected_at` (date).

**Demand:** `head_keyword`, `cluster_keywords` (string[]), `cluster_volume` (number), `volume_confidence` (low/med/high).

**Competition:** `competition_tier` (GREEN/YELLOW/ORANGE), `realistic_rank` (number), `aio_present` (bool).

**Money:** `monetisation_tag` (enum), `rpv_band` [low,high], `monthly_revenue_band` [low,high], `revenue_confidence` (low/med/high).

**Gate result (set by FIND):** `band` (vault/watchlist), `opportunity_tier` (A/B/C/null), `staleness_flag` (bool).

## Optional fields

`priors_match` (string/null), `trend` (growing/flat/declining/null), `notes` (string), `source_run` (url).

## Allowed monetisation_tag values

`affiliate-saas-high-ticket` · `affiliate-physical` · `lead-gen-local` · `ads-display` · `mixed` · `own-product`

> `own-product` is first-party (sell your own template/download/tool/service). Highest revenue-per-visitor, keeps 100%, needs NO approval or traffic threshold — available to a zero-traffic site day one. Highest build effort (needs checkout + fulfilment); the one route that can fail because the *product* was wrong, not the ranking.

## Gate logic (locked)

- **Gate 1 (supply):** not RED. GREEN/YELLOW/ORANGE pass. RED excluded entirely.
- **Gate 2 (money):** `monthly_revenue_band` low-end ≥ £800 AND a monetisation_tag present.
- Both → `band: vault`, tier by colour (GREEN=A, YELLOW=B, ORANGE=C).
- Gate 1 + monetisation but fails £800 on volume → `band: watchlist`, tier null.
- Fails Gate 1 (RED) → not emitted.
- SCOPE on receipt: `revenue_confidence: low` → flag **validate before build**. The £800 threshold lives in SCOPE config, not FIND.

## Design rules

1. One record per niche (array if multiple).
2. Confidence is never optional.
3. Versioned — bump `schema_version` on any change; SCOPE refuses an unknown version.
4. FIND never deletes — it selects.
