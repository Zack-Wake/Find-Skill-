# Reference — Vault & Gates (S1)

## The core idea

FIND does not crown a single best niche — the numbers (volume ±40%, cluster multiplier, CTR haircut) are too rough. It **qualifies against two gates, saves everything that passes, lets you pick.** Row #3 can equal row #1; the gap is noise. FIND is cheap; building is gated to **one site at a time**.

## The two gates

1. **Supply:** competition not RED (GREEN/YELLOW/ORANGE pass; RED stays in full sheet only).
2. **Money:** revenue low-end ≥ £800/mo AND a monetisation_tag. (Demand is baked in.)

## Bands & tiers

- Both gates + GREEN → vault, **Tier A** (best).
- Both gates + YELLOW → vault, **Tier B**.
- Both gates + ORANGE → vault, **Tier C**.
- Supply + monetisation OK, fails £800 on volume → **watchlist** (good idea, not enough demand yet).
- RED → full sheet only, never vault/watchlist.

Tier is assigned only after clearing £800 — a £300 GREEN goes to watchlist. Low confidence but clears £800 → vault flagged **validate before build**.

## The Vault — two surfaces, one source of truth

- **Google Sheet = master.** Append-only, full record per niche. Source of truth.
- **Notion = tracker + Top Opportunities view** (Tier A, sorted by revenue low-end). Filtered read, nothing to sync.

Save everything that passes both gates; soft ceiling ~50/run as a runaway guard. **Watchlist** is a separate band, slow re-check — the long-term timing layer.

## Dedup

Skip niches already saved (by niche_id); don't reshow unless explicitly asked to re-look at old searches.

## Staleness — nothing auto-deletes

Every record carries selected_at; at ~6 months staleness_flag trips → **re-verify before building**. The vault is a long-term timing log, not a queue.

## How numbers are sourced (NOT a scrape)

Volume **estimates (model knowledge) + Google Trends for direction**, each confidence-tagged. NO live Keyword Planner scrape (cut for being flaky/slow/login-gated). Estimate + confidence + 'validate before build' = the substitute: cheap shortlist, then your manual KP check on the chosen winner.

## The one hard rule

**One site at a time, end to end, then pull the next.** FIND fills the vault cheaply; only one niche enters SCOPE→BUILD at once. Makes 'burn millions building 5–10 sites at once' structurally impossible. FIND names the site archetype; SCOPE picks the build tool.
