'use strict';

// Stage 3 crash-safe checkpoint for S1 SERP scraping.
// Persists each query result as JSONL the moment it's parsed, so a Chrome MCP
// drop never loses scraped progress. On resume, the same seed + date reloads
// the existing file and returns only not-yet-scraped queries in original order.
//
// Checkpoint path: runs/<seed-slug>_<YYYY-MM-DD>/checkpoint.jsonl
// Each line: one JSON record per root search (mirrors extract_serp.js output
// plus Stage 3 bookkeeping: query_num, root_search, modifier_type, frequency,
// red_skip, timestamp). Enough for Stage 4 to rebuild Tab 1 without re-scraping.
//
// Run `node scripts/checkpoint.js` to execute the built-in self-test (no Chrome needed).

const fs = require('fs');
const path = require('path');

const DEFAULT_RUNS_DIR = path.join(__dirname, '..', 'runs');

/**
 * Convert a seed term to a filesystem-safe slug.
 */
function seedSlug(seed) {
  return String(seed)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Resolve (and create) the run directory and checkpoint file path.
 *
 * @param {string} seed   - raw seed term (e.g. "website builder")
 * @param {string} date   - 'YYYY-MM-DD'
 * @param {string} [runsDir] - override for the runs/ base dir (used in tests)
 * @returns {{ dir: string, checkpointPath: string }}
 */
function initRun(seed, date, runsDir) {
  const base = runsDir || DEFAULT_RUNS_DIR;
  const slug = seedSlug(seed);
  const dir = path.join(base, `${slug}_${date}`);
  fs.mkdirSync(dir, { recursive: true });
  const checkpointPath = path.join(dir, 'checkpoint.jsonl');
  return { dir, checkpointPath };
}

/**
 * Load an existing checkpoint, rebuilding all Stage 3 running state from disk.
 *
 * Returns:
 *   checkpointPath  - where to append new records
 *   exists          - false if the file doesn't exist yet (fresh run)
 *   doneSet         - Set<string> of query strings already scraped
 *   dedupList       - string[] of unique discovered queries accumulated so far
 *   frequencyMap    - Map<string, number> query → how many root-search SERPs it appeared in
 *
 * @param {string} seed
 * @param {string} date  - 'YYYY-MM-DD'
 * @param {string} [runsDir]
 */
function loadCheckpoint(seed, date, runsDir) {
  const { checkpointPath } = initRun(seed, date, runsDir);
  const doneSet = new Set();
  const dedupList = [];
  const dedupSet = new Set();
  const frequencyMap = new Map();

  if (!fs.existsSync(checkpointPath)) {
    return { checkpointPath, exists: false, doneSet, dedupList, frequencyMap };
  }

  const lines = fs.readFileSync(checkpointPath, 'utf8')
    .split('\n')
    .filter(l => l.trim());

  for (const line of lines) {
    let record;
    try { record = JSON.parse(line); } catch { continue; }

    doneSet.add(record.query);

    if (record.serp) {
      const discovered = [
        ...(record.serp.peopleAlsoSearchFor || []),
        ...(record.serp.relatedProductsAndServices || []),
      ];
      for (const q of discovered) {
        if (!dedupSet.has(q)) {
          dedupSet.add(q);
          dedupList.push(q);
          frequencyMap.set(q, 1);
        } else {
          frequencyMap.set(q, (frequencyMap.get(q) || 1) + 1);
        }
      }
    }
  }

  return { checkpointPath, exists: lines.length > 0, doneSet, dedupList, frequencyMap };
}

/**
 * Append one record to the checkpoint file immediately after a SERP is parsed.
 * MUST be called BEFORE the 3-7s inter-query wait so a crash mid-wait loses nothing.
 *
 * Record shape:
 *   query_num     {number}  position in the Stage 2 matrix (1-based)
 *   query         {string}  the exact query string scraped
 *   root_search   {string}  the Stage 2 root search this came from
 *   modifier_type {string}  modifier category from Stage 2
 *   frequency     {number}  current frequency counter for this query in the dedup list
 *   red_skip      {boolean} true when the SERP was 🔴 RED and PAS was not expanded
 *   timestamp     {string}  ISO 8601
 *   serp          {object|null} full extract_serp.js output, or null for red_skip records
 *
 * @param {object} record
 * @param {string} checkpointPath
 */
function appendCheckpoint(record, checkpointPath) {
  fs.appendFileSync(checkpointPath, JSON.stringify(record) + '\n', 'utf8');
}

/**
 * Filter the full Stage 2 query list to only those not yet in the done set,
 * preserving original order.
 *
 * @param {Array<{query: string}|string>} allQueries - Stage 2 matrix entries
 * @param {Set<string>} doneSet - from loadCheckpoint
 * @returns {Array<{query: string}|string>}
 */
function pendingQueries(allQueries, doneSet) {
  return allQueries.filter(q => !doneSet.has(typeof q === 'string' ? q : q.query));
}

// ─── Self-test (no live Chrome) ───────────────────────────────────────────────

if (require.main === module) {
  const os = require('os');

  const tmpBase = fs.mkdtempSync(path.join(os.tmpdir(), 'ck-test-'));
  const SEED = 'test seed';
  const DATE = '2026-01-01';
  const TOTAL = 6;
  const CRASH_AFTER = 3;

  let failures = 0;
  function assert(cond, msg) {
    if (!cond) { console.error(`FAIL: ${msg}`); failures++; }
    else        { console.log(`PASS: ${msg}`); }
  }

  // Build the Stage 2 query list.
  // 'shared query' appears as a PAS result in every SERP record to test
  // frequency accumulation across multiple root searches.
  const allQueries = Array.from({ length: TOTAL }, (_, i) => ({
    query: `root search ${i + 1}`,
    root_search: `root search ${i + 1}`,
    modifier_type: 'use-case',
  }));

  const mockSerp = (i) => ({
    organic: [{ url: `https://example${i}.com`, title: `Example ${i}`, domainType: 'Other' }],
    paaQuestions: [],
    peopleAlsoSearchFor: [`unique variant ${i}`, 'shared query'],
    relatedProductsAndServices: [],
    domainTypes: { Other: 1 },
    competitionProfile: 'GREEN',
  });

  // ── Phase 1: write CRASH_AFTER records then stop (simulate crash) ──────────
  console.log(`\nPhase 1: writing ${CRASH_AFTER} records...`);
  const { checkpointPath } = initRun(SEED, DATE, tmpBase);

  for (let i = 0; i < CRASH_AFTER; i++) {
    appendCheckpoint({
      query_num: i + 1,
      query: allQueries[i].query,
      root_search: allQueries[i].root_search,
      modifier_type: allQueries[i].modifier_type,
      frequency: 1,
      red_skip: false,
      timestamp: '2026-01-01T10:00:00.000Z',
      serp: mockSerp(i + 1),
    }, checkpointPath);
  }
  console.log(`  Wrote ${CRASH_AFTER} records to ${checkpointPath}`);

  // ── Phase 2: reload (simulate crash + resume) ──────────────────────────────
  console.log('\nPhase 2: reloading checkpoint (simulating crash + resume)...');
  let state = loadCheckpoint(SEED, DATE, tmpBase);

  assert(state.exists, 'checkpoint file exists after writes');
  assert(state.doneSet.size === CRASH_AFTER, `doneSet.size === ${CRASH_AFTER} after crash`);

  const pending = pendingQueries(allQueries, state.doneSet);
  assert(pending.length === TOTAL - CRASH_AFTER, `pending === ${TOTAL - CRASH_AFTER}`);
  assert(
    pending[0].query === allQueries[CRASH_AFTER].query,
    'pending[0] is next query in original order'
  );

  // 'shared query' appeared in all CRASH_AFTER records → frequency should be CRASH_AFTER
  assert(
    state.frequencyMap.get('shared query') === CRASH_AFTER,
    `'shared query' frequency === ${CRASH_AFTER}`
  );

  // Each record contributes 1 unique variant + 'shared query' (deduped after first)
  // → CRASH_AFTER unique variants + 1 shared = CRASH_AFTER + 1 entries in dedupList
  assert(
    state.dedupList.length === CRASH_AFTER + 1,
    `dedupList.length === ${CRASH_AFTER + 1}`
  );

  // Already-done queries must not appear in pending
  assert(
    allQueries.slice(0, CRASH_AFTER).every(q => !pending.find(p => p.query === q.query)),
    'done queries are absent from pending'
  );

  // ── Phase 3: one RED skip record ──────────────────────────────────────────
  console.log('\nPhase 3: appending a RED skip record...');
  appendCheckpoint({
    query_num: CRASH_AFTER + 1,
    query: allQueries[CRASH_AFTER].query,
    root_search: allQueries[CRASH_AFTER].root_search,
    modifier_type: allQueries[CRASH_AFTER].modifier_type,
    frequency: 1,
    red_skip: true,
    timestamp: '2026-01-01T10:03:00.000Z',
    serp: null,
  }, checkpointPath);

  state = loadCheckpoint(SEED, DATE, tmpBase);
  assert(
    state.doneSet.has(allQueries[CRASH_AFTER].query),
    'RED skip query is in doneSet — will not be re-fetched on next resume'
  );
  // RED skip has serp: null — dedupList should not grow
  assert(
    state.dedupList.length === CRASH_AFTER + 1,
    'RED skip does not grow dedupList'
  );

  // ── Phase 4: write the remaining records and verify totals ─────────────────
  console.log('\nPhase 4: writing remaining records after resume...');
  for (let i = CRASH_AFTER + 1; i < TOTAL; i++) {
    appendCheckpoint({
      query_num: i + 1,
      query: allQueries[i].query,
      root_search: allQueries[i].root_search,
      modifier_type: allQueries[i].modifier_type,
      frequency: 1,
      red_skip: false,
      timestamp: '2026-01-01T10:04:00.000Z',
      serp: mockSerp(i + 1),
    }, checkpointPath);
  }

  state = loadCheckpoint(SEED, DATE, tmpBase);
  assert(state.doneSet.size === TOTAL, `after full run: doneSet.size === ${TOTAL}`);
  assert(
    pendingQueries(allQueries, state.doneSet).length === 0,
    'no pending queries after full run'
  );
  // 'shared query' appeared in TOTAL - 1 records (the RED skip had serp: null)
  const expectedSharedFreq = TOTAL - 1;
  assert(
    state.frequencyMap.get('shared query') === expectedSharedFreq,
    `'shared query' final frequency === ${expectedSharedFreq}`
  );

  // ── Phase 5: truncated-line robustness (mid-append Chrome drop) ───────────
  // Snapshot state BEFORE the corrupt write so we can assert nothing changed.
  console.log('\nPhase 5: truncated trailing line (mid-append crash simulation)...');
  const snapDoneSize   = state.doneSet.size;
  const snapDedupLen   = state.dedupList.length;
  const snapSharedFreq = state.frequencyMap.get('shared query');

  // Simulate a Chrome MCP drop mid-write: raw append of an incomplete JSON line.
  fs.appendFileSync(checkpointPath, '{"query_num":99,"query":"root search 99","root_sear', 'utf8');

  state = loadCheckpoint(SEED, DATE, tmpBase);
  assert(
    state.doneSet.size === snapDoneSize &&
    state.dedupList.length === snapDedupLen &&
    state.frequencyMap.get('shared query') === snapSharedFreq,
    'truncated trailing line is silently discarded — doneSet/dedupList/frequencyMap unchanged'
  );

  // ── Cleanup ────────────────────────────────────────────────────────────────
  fs.rmSync(tmpBase, { recursive: true, force: true });

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log('\nAll assertions passed.');
  process.exit(0);
}

module.exports = { seedSlug, initRun, loadCheckpoint, appendCheckpoint, pendingQueries };
