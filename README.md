# Find-Skill-
## What this is

A personal pipeline that turns one search term into a published, monetised, ranking website. Six stages, each one a skill, chained so one stage's output feeds the next. Built for my own builds — not a client product, not multi-tenant.

## The problem it solves

I find niches, then get side-tracked stacking features instead of building. FORGE fixes that: the SERP finder is just **stage one** of a defined corridor, and every new idea gets filed against a stage instead of derailing the current build.

## The six stages

```
FIND → SCOPE → BUILD → RANK → MONETISE → PUBLISH
```

- **FIND** — rank niches best→worst from one seed (SERP Opportunity Finder)
- **SCOPE** — cheapest effective build spec + pick the build tool
- **BUILD** — scaffold the site (Next.js + Supabase)
- **RANK** — SEO it to the top
- **MONETISE** — wire in revenue (affiliate / ads / lead-gen / own-product, possibly several)
- **PUBLISH** — deploy, harden, monitor, iterate

See `CLAUDE.md` for the data flow, build-target rules, autonomy ladder, and handoff contracts.

## Status

Scoping. Stage 1 exists at v2. Stages 2–6 not yet built. Current focus: lock the **S1→S2 handoff**, finish Stage 1 to "good enough", build the thinnest possible Stage 2.

## Stack

Next.js + Supabase, Claude Code on Windows, n8n (later). Per-niche build target (Claude Code / Replit / Lovable) chosen at the SCOPE stage.

## How to work in this repo

Packet workflow. Pick a Ready packet → branch → build to the Definition of Done → review the diff → mark Done. One packet, one branch, one session. New ideas become Draft packets, not detours.

## Quality bars

No AI slop. Usable. Runnable. Bug-tested and security-checked before publish.
