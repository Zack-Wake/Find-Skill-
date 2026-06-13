Claude.md
**Name:** FORGE — personal build pipeline

**What it does:** Takes one seed term and carries it through six stages — FIND → SCOPE → BUILD → RANK → MONETISE → PUBLISH — to a published, monetised, ranking website. Built for one user (Zack), own build decisions. Not a client product, not multi-tenant.

**Status:** Scoping. Stage 1 (FIND / SERP Opportunity Finder) exists at v2. Stages 2–6 not built. Current focus: lock the S1→S2 handoff, finish S1 to "good enough", build the thinnest possible S2.

## How the pipeline works (data flow)

1. **FIND** extrapolates niche data from one seed, sequences it, ranks best→worst via the revenue formula (tweakable until calibrated).
2. The full ranked shortlist is **KEPT — never filter rows** (emerging niches stay tracked).
3. "Cut the worst" means the pipeline does **not advance** weak niches through the gate — it does NOT delete them. Only the strongest pass into SCOPE.
4. SCOPE → BUILD → RANK → MONETISE → PUBLISH each consume the previous stage's structured handoff.

## Stages (each is a separate skill / repo)

- **S1 FIND** — SERP Opportunity Finder (exists, v2)
- **S2 SCOPE** — Build Spec: cheapest effective build + build-target selection
- **S3 BUILD** — Site Scaffolder
- **S4 RANK** — SEO
- **S5 MONETISE** — revenue mechanism(s)
- **S6 PUBLISH** — deploy, monitor, harden, iterate

## Build-target selection (S2 decides — get the facts right)

The pipeline chooses the build tool per niche. Only Claude Code runs natively in VS Code:

- **Claude Code** — agentic, VS Code / terminal. Full-control Next.js + Supabase builds.
- **Replit** — its own cloud IDE + Agent. VS Code-like, has an extension, separate environment. Fast hosted prototypes.
- **Lovable** — browser-based AI app builder. NOT in VS Code; syncs to GitHub, then pull into VS Code. Fast UI-first marketing sites.

Selector chooses on build type and cost, not habit.

## Stack (default)

- Next.js + Supabase (standard)
- n8n for automation (later — only after the manual flow is proven)
- Claude Code on Windows, VS Code
- Per-niche build target may vary (see above)

## Quality bars (DoD on EVERY build/publish packet)

- **No AI slop.** Distinctive, intentional design. If it looks templated, it's not done.
- **Usable.** Real navigation, real content, works on mobile.
- **Easily runnable.** Clean install, documented run steps, no mystery setup.
- **Bug-tested** before publish.
- **Security-checked** before publish: no exposed keys, RLS on Supabase, input validation, no obvious injection / XSS.

## Autonomy ladder

- **L0 (now):** human approves EVERY stage gate.
- **L1:** human approves at stage boundaries only; skill runs freely within a stage.
- **L2:** runs multiple stages when explicitly prompted, stopping at named checkpoints.
- **Never autonomous for:** publishing live, security sign-off, anything that spends money.
- A stage earns the next level only after running clean ~5× under human approval.

## Handoff contracts

- Each stage emits a structured record the next stage reads.
- Define the handoff shape BEFORE adding features to a stage.
- **Keystone:** the S1→S2 niche record (see Handoff Contract page).

## Git Rules

- **One repo per skill/site, one branch per packet.** Map by packet prefix: PROD→FORGE repo, S1→FIND, S2→SCOPE, S3→the site's own repo, S4→RANK, S5→MONETISE, S6→PUBLISH.
- **Find the packet's repo.** If it exists → branch `task/[packet-id]-desc`, work to DoD, test, push, PR. If it doesn't (first packet of a new skill/site) → create the repo named for the skill/site, init with CLAUDE.md + README, then same flow.
- **Test before PR** = DoD met + nothing regressed + the packet's validation gate passes (e.g. FIND returns the known-good test result).
- **Never commit to main.** Always branch → PR → human review of the diff → merge.
- At L0, repo-create and branch can run unattended; **merge stays human-reviewed every time**.

## Claude Code rules

- Read this file before touching anything
- Work only on the packet's declared scope
- Stop at Definition of Done — do not expand scope
- Don't modify files outside the packet's declared targets
- Produce a change summary when done

## Must not do

- Change the stack without a new packet
- Delete files without explicit instruction
- Filter or delete rows from S1 output (emerging niches stay tracked)
- Invent conventions not defined here
- Mark a build/publish packet Done without passing every quality bar
- **Rebuild an existing skill from scratch.** S1 (FIND) already exists at v2 — read the current SKILL.md + references/ first and EXTEND. Recreating working functionality is a failure, not progress.

## The one rule (anti-side-track)

New idea mid-session → write it as a small explanation under 50 words and put in drafts. → keep building the current thing to DOD. Capture, don't chase.
