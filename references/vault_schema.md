# Vault Schema — Master Sheet (S1-008)

The Vault is a separate Google Sheet from each run's Tab 1 / Tab 2 working sheet — it's the **persistent, append-only master record** of every niche that has cleared Gate 1 (not RED), across all runs and all seeds. One row = one niche record, in the shape defined by `references/handoff_schema.md` (PROD-001 v1.2), flattened to sheet columns.

## The Vault Sheet vs the working sheet

- **Working sheet (Tab 1 / Tab 2)**: created fresh per run via Drive MCP (Stage 4). Full, unfiltered results for *this* seed/run.
- **Vault Sheet**: one sheet, reused across every run. On first use, create it (e.g. "FIND Vault — Master") via Drive MCP and keep its link; on every later run, locate and reuse that same sheet — never create a second Vault.

## Columns (in this order)

| Column | Source (handoff_schema.md field) | Notes |
|---|---|---|
| niche_id | `niche_id` | slug, **dedup key** |
| niche_label | `niche_label` | |
| seed_term | `seed_term` | the seed that produced this run |
| selected_at | `selected_at` | date first appended — never changes after |
| head_keyword | `head_keyword` | |
| cluster_keywords | `cluster_keywords` | comma-separated |
| cluster_volume | `cluster_volume` | |
| volume_confidence | `volume_confidence` | low/med/high |
| competition_tier | `competition_tier` | GREEN/YELLOW/ORANGE — RED never appears here |
| realistic_rank | `realistic_rank` | |
| aio_present | `aio_present` | TRUE/FALSE |
| monetisation_tag | `monetisation_tag` | |
| rpv_low | `rpv_band[0]` | |
| rpv_high | `rpv_band[1]` | |
| monthly_revenue_low | `monthly_revenue_band[0]` | |
| monthly_revenue_high | `monthly_revenue_band[1]` | |
| revenue_confidence | `revenue_confidence` | low/med/high |
| band | `band` | vault / watchlist |
| opportunity_tier | `opportunity_tier` | A / B / C / blank |
| staleness_flag | `staleness_flag` | TRUE/FALSE — see Staleness sweep |
| priors_match | `priors_match` | optional, blank if none |
| trend | `trend` | optional, blank if none |
| notes | `notes` | optional — carries `validate before build` etc. |
| source_run | `source_run` | link to the Tab 1/2 sheet this row came from |
| schema_version | `schema_version` | "1.2" |

## Append-only

New rows go to the end of the sheet only. **Never edit, reorder, or replace an existing row's data fields** — the one exception is the staleness sweep below, which flips a single status flag in place.

## Dedup — niche_id

`niche_id` is the dedup key.

```
niche_id = slugify(niche_label)   // e.g. "Website builder for tradespeople" -> "website-builder-tradespeople"
```

Before appending candidate rows from this run's Tab 2:

1. Read the existing `niche_id` column from the Vault.
2. For each candidate, compute `niche_id`. If it already exists in the Vault, **skip it** — don't append, don't re-show, don't update.
3. If a slug collision occurs against a *different* `niche_label`, suffix `-2`, `-3`, etc. until unique.

**Unless the user explicitly asks to re-look at / re-save an already-vaulted niche** — in that case, treat it as a deliberate override for that one niche_id only.

## Staleness sweep (in-place, never deletes)

Before appending new rows, sweep existing Vault rows:

```
for each existing row where staleness_flag is FALSE/blank:
  if (today - selected_at) >= ~6 months:
    set staleness_flag = TRUE   // the only allowed in-place edit
```

A `staleness_flag = TRUE` row is **not removed or hidden** — it just means "re-verify before building." The Vault is a long-term timing log, not a queue.

## RED exclusion

Only rows with `band` ∈ {`vault`, `watchlist`} (i.e. cleared Gate 1) are candidates for the Vault. RED niches have no band and are **never written here** — they remain visible only in the per-run Tab 1/2 sheet.

## Soft cap — ~50 new rows per run

If a run produces more than ~50 fresh (non-dupe, non-RED) candidates:

1. Sort candidates by `monthly_revenue_low` descending.
2. Append the top 50.
3. Report the overflow count to the user — the remaining candidates stay visible in this run's Tab 2 and can be appended on a future run (dedup makes this safe to retry).

This is a **runaway guard**, not a quality filter — nothing is discarded, just deferred.

## Vault Sheet unreachable — local fallback

If the Vault Sheet can't be opened or written this run:

1. **Tell the user immediately** — don't fail silently.
2. Write the full candidate row set (post-dedup-plan, pre-append) to a local fallback file: `vault_fallback_<YYYY-MM-DD>.csv` in the repo's working directory, using the column order above.
3. On a future run where the Vault Sheet *is* reachable: before processing this run's new candidates, read any pending `vault_fallback_*.csv` files, run them through the same dedup + staleness + soft-cap logic, append what's still new, then rename each processed file to `vault_fallback_<date>.csv.merged` (keep it as a record — don't delete).

See `scripts/vault_write.js` for the dedup/staleness/cap/fallback logic as runnable functions.
