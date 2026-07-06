'use strict';

// FIND→SCOPE handoff emitter for S1 FIND (S1-004).
// After Stage 9 writes vault rows, this emits one schema-versioned JSON record
// per VAULT-qualifying niche (band='vault' only). Watchlist and excluded niches
// produce no handoff record — they stay tracked in the sheet.
//
// Single source of truth: references/vault_schema.md (25 flat columns,
// schema_version = "1.2"). Output uses those same flat field names — no
// array translation. references/handoff_schema.md is retired; vault_schema.md
// is the sole contract between FIND and SCOPE.
//
// Input: vault row objects with flat field names as in vault_write.js.
// Output: data/handoffs/<niche_id>.json  (tracked; SCOPE reads these)
//
// Run `node scripts/emit_handoff.js` to execute the built-in self-test.

const fs   = require('fs');
const path = require('path');

// ─── Schema constants (sourced from references/vault_schema.md) ───────────────

const SCHEMA_VERSION = '1.2'; // schema_version column in vault_schema.md

// Required fields — flat names from vault_schema.md column list.
// Types annotated for validation. Do not add fields not in vault_schema.md.
const REQUIRED_STRING = [
  'niche_id', 'niche_label', 'seed_term', 'selected_at',
  'head_keyword',
  'volume_confidence',    // low | med | high
  'competition_tier',     // GREEN | YELLOW | ORANGE
  'monetisation_tag',
  'revenue_confidence',   // low | med | high
  'band',                 // vault | watchlist — only 'vault' emits
];

const REQUIRED_NUMBER = [
  'cluster_volume', 'realistic_rank',
  'rpv_low', 'rpv_high',
  'monthly_revenue_low', 'monthly_revenue_high',
];

const REQUIRED_BOOLEAN = [
  'aio_present',
  'staleness_flag',
];

// cluster_keywords: string (comma-separated from sheet) or non-empty array
const REQUIRED_ARRAY_OR_STRING = ['cluster_keywords'];

// opportunity_tier: must be A/B/C for vault niches
const VALID_OPPORTUNITY_TIERS = new Set(['A', 'B', 'C']);

// Optional fields — included in output if present, null if absent
const OPTIONAL_FIELDS = ['priors_match', 'trend', 'notes', 'source_run'];

const HANDOFFS_DIR = path.join(__dirname, '..', 'data', 'handoffs');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Emit one handoff JSON file per vault-qualifying niche.
 *
 * @param {object[]} niches - niche objects (all bands; function filters vault only)
 * @param {object}   [opts]
 * @param {string}   [opts.dir] - override output directory (self-test injection)
 *
 * @returns {{ emitted: string[], skipped: Array<{niche_id:string, reason:string}> }}
 */
function emitHandoffs(niches, opts) {
  const outDir = (opts && opts.dir) || HANDOFFS_DIR;

  const emitted = [];
  const skipped = [];

  for (const niche of niches) {
    // Watchlist, excluded, and blank-band niches: no handoff
    if (niche.band !== 'vault') continue;

    const id = niche.niche_id || '(no niche_id)';

    // Validate all required fields — skip + log on any failure
    const missing = _missingFields(niche);
    if (missing.length > 0) {
      const reason = `missing ${missing.join(', ')}`;
      const msg = `handoff skipped: ${id}: ${reason}`;
      console.log(msg);
      skipped.push({ niche_id: id, reason: msg });
      continue;
    }

    // Build and write the record
    const record = _buildRecord(niche);
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `${niche.niche_id}.json`);
    fs.writeFileSync(outPath, JSON.stringify(record, null, 2) + '\n', 'utf8');
    emitted.push(niche.niche_id);
  }

  return { emitted, skipped };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _missingFields(niche) {
  const bad = [];

  for (const f of REQUIRED_STRING) {
    if (!niche[f] || typeof niche[f] !== 'string' || !String(niche[f]).trim()) {
      bad.push(f);
    }
  }

  for (const f of REQUIRED_NUMBER) {
    if (!Number.isFinite(niche[f])) bad.push(f);
  }

  for (const f of REQUIRED_BOOLEAN) {
    if (typeof niche[f] !== 'boolean') bad.push(f);
  }

  for (const f of REQUIRED_ARRAY_OR_STRING) {
    const v = niche[f];
    const ok = (Array.isArray(v) && v.length > 0) ||
               (typeof v === 'string' && v.trim().length > 0);
    if (!ok) bad.push(f);
  }

  // opportunity_tier: vault niches require A/B/C
  if (!VALID_OPPORTUNITY_TIERS.has(niche.opportunity_tier)) {
    bad.push('opportunity_tier');
  }

  return bad;
}

/**
 * Build the handoff record in vault_schema.md flat format.
 * Field names and order follow vault_schema.md's 25-column list exactly.
 * cluster_keywords is normalised from CSV string to array if needed.
 */
function _buildRecord(niche) {
  const clusterKeywords = Array.isArray(niche.cluster_keywords)
    ? niche.cluster_keywords
    : String(niche.cluster_keywords).split(',').map(s => s.trim()).filter(Boolean);

  return {
    niche_id:              niche.niche_id,
    niche_label:           niche.niche_label,
    seed_term:             niche.seed_term,
    selected_at:           niche.selected_at,
    head_keyword:          niche.head_keyword,
    cluster_keywords:      clusterKeywords,
    cluster_volume:        niche.cluster_volume,
    volume_confidence:     niche.volume_confidence,
    competition_tier:      niche.competition_tier,
    realistic_rank:        niche.realistic_rank,
    aio_present:           niche.aio_present,
    monetisation_tag:      niche.monetisation_tag,
    rpv_low:               niche.rpv_low,
    rpv_high:              niche.rpv_high,
    monthly_revenue_low:   niche.monthly_revenue_low,
    monthly_revenue_high:  niche.monthly_revenue_high,
    revenue_confidence:    niche.revenue_confidence,
    band:                  niche.band,
    opportunity_tier:      niche.opportunity_tier,
    staleness_flag:        niche.staleness_flag,
    priors_match:          niche.priors_match  || null,
    trend:                 niche.trend         || null,
    notes:                 niche.notes         || null,
    source_run:            niche.source_run    || null,
    schema_version:        SCHEMA_VERSION,
  };
}

// ─── Self-test (no Chrome, no network) ───────────────────────────────────────

if (require.main === module) {
  const os = require('os');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'handoff-test-'));

  let passed = 0;
  let failed = 0;

  function assert(label, cond, detail) {
    if (cond) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}${detail !== undefined ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  // Shared fixture — fully-populated vault niche in flat vault-row format
  const vaultNiche = {
    niche_id:             'resin-flooring-uk',
    niche_label:          'Resin flooring UK',
    seed_term:            'flooring',
    selected_at:          '2026-07-05',
    head_keyword:         'resin flooring uk',
    cluster_keywords:     ['resin floor coating uk', 'epoxy floor uk', 'industrial resin flooring'],
    cluster_volume:       3200,
    volume_confidence:    'medium',
    competition_tier:     'GREEN',
    realistic_rank:       2,
    aio_present:          false,
    monetisation_tag:     'lead-gen-local',
    rpv_low:              0.30,
    rpv_high:             3.00,
    monthly_revenue_low:  1728,
    monthly_revenue_high: 17280,
    revenue_confidence:   'low',
    band:                 'vault',
    opportunity_tier:     'A',
    staleness_flag:       false,
    priors_match:         'FLOORING / TRADES',
    trend:                'growing',
    notes:                'validate before build',
    source_run:           'https://docs.google.com/example',
  };

  // All 25 flat field names from vault_schema.md — defines the allowed key set
  const VAULT_SCHEMA_FIELDS = new Set([
    'niche_id', 'niche_label', 'seed_term', 'selected_at', 'head_keyword',
    'cluster_keywords', 'cluster_volume', 'volume_confidence', 'competition_tier',
    'realistic_rank', 'aio_present', 'monetisation_tag', 'rpv_low', 'rpv_high',
    'monthly_revenue_low', 'monthly_revenue_high', 'revenue_confidence', 'band',
    'opportunity_tier', 'staleness_flag', 'priors_match', 'trend', 'notes',
    'source_run', 'schema_version',
  ]);

  console.log('\n=== emit_handoff.js self-test ===\n');

  // ── 1. Valid vault niche → flat record written, matches vault_schema.md ───
  const r1 = emitHandoffs([vaultNiche], { dir: tmpDir });

  assert('vault niche → emitted contains niche_id',
    r1.emitted.includes('resin-flooring-uk'),    `emitted: ${JSON.stringify(r1.emitted)}`);
  assert('vault niche → skipped is empty',
    r1.skipped.length === 0,                     `skipped: ${JSON.stringify(r1.skipped)}`);

  const outPath = path.join(tmpDir, 'resin-flooring-uk.json');
  assert('vault niche → file written',            fs.existsSync(outPath));

  const record = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert('record → schema_version = 1.2',         record.schema_version === '1.2');
  assert('record → niche_id correct',             record.niche_id === 'resin-flooring-uk');
  assert('record → rpv_low flat (not rpv_band)',  record.rpv_low === 0.30 && !('rpv_band' in record),
    `rpv_low=${record.rpv_low} rpv_band=${record.rpv_band}`);
  assert('record → rpv_high flat',               record.rpv_high === 3.00);
  assert('record → monthly_revenue_low flat',    record.monthly_revenue_low === 1728 &&
                                                  !('monthly_revenue_band' in record),
    `monthly_revenue_low=${record.monthly_revenue_low}`);
  assert('record → monthly_revenue_high flat',   record.monthly_revenue_high === 17280);
  assert('record → cluster_keywords is array',    Array.isArray(record.cluster_keywords) &&
                                                   record.cluster_keywords.length === 3);
  assert('record → band = vault',                 record.band === 'vault');
  assert('record → opportunity_tier = A',         record.opportunity_tier === 'A');
  assert('record → priors_match present',         record.priors_match === 'FLOORING / TRADES');
  assert('record → only vault_schema.md fields',
    Object.keys(record).every(k => VAULT_SCHEMA_FIELDS.has(k)),
    `unexpected keys: ${Object.keys(record).filter(k => !VAULT_SCHEMA_FIELDS.has(k)).join(', ')}`);
  assert('record → all 25 vault_schema.md fields present',
    VAULT_SCHEMA_FIELDS.size === Object.keys(record).length,
    `got ${Object.keys(record).length} fields`);

  // ── 2. Watchlist niche → no file written ─────────────────────────────────
  const watchlistNiche = { ...vaultNiche, niche_id: 'safety-flooring-uk',
    band: 'watchlist', opportunity_tier: null };

  const r2 = emitHandoffs([watchlistNiche], { dir: tmpDir });
  assert('watchlist → nothing emitted',           r2.emitted.length === 0);
  assert('watchlist → nothing skipped (filtered)', r2.skipped.length === 0);
  assert('watchlist → no file on disk',
    !fs.existsSync(path.join(tmpDir, 'safety-flooring-uk.json')));

  // ── 3. Niche missing required field → skipped + logged, not fabricated ───
  const missingVolume = { ...vaultNiche, niche_id: 'epoxy-floor-uk',
    cluster_volume: undefined };

  let loggedMsg = '';
  const origLog = console.log;
  console.log = (msg) => { loggedMsg = msg; origLog(msg); };

  const r3 = emitHandoffs([missingVolume], { dir: tmpDir });
  console.log = origLog;

  assert('missing field → skipped non-empty',
    r3.skipped.length === 1,                     `got ${r3.skipped.length}`);
  assert('missing field → nothing emitted',       r3.emitted.length === 0);
  assert('missing field → logged "handoff skipped"',
    loggedMsg.includes('handoff skipped'),         `got: "${loggedMsg}"`);
  assert('missing field → logged field name',
    loggedMsg.includes('cluster_volume'),          `got: "${loggedMsg}"`);
  assert('missing field → no file written',
    !fs.existsSync(path.join(tmpDir, 'epoxy-floor-uk.json')));

  // ── 4. Mixed batch: vault + watchlist + missing-field → only vault emits ──
  const missingOppTier = { ...vaultNiche, niche_id: 'lino-flooring-uk',
    opportunity_tier: null };

  const r4 = emitHandoffs([vaultNiche, watchlistNiche, missingOppTier], { dir: tmpDir });
  assert('mixed batch → 1 emitted',               r4.emitted.length === 1,
    `got ${r4.emitted.length}: ${JSON.stringify(r4.emitted)}`);
  assert('mixed batch → 1 skipped',               r4.skipped.length === 1,
    `got ${JSON.stringify(r4.skipped)}`);

  // ── 5. CSV cluster_keywords → normalised to array in output ──────────────
  const csvKeywords = { ...vaultNiche, niche_id: 'vinyl-floor-uk',
    cluster_keywords: 'vinyl flooring uk, lino floor uk, sheet vinyl uk' };

  const r5 = emitHandoffs([csvKeywords], { dir: tmpDir });
  assert('CSV cluster_keywords → emitted',         r5.emitted.includes('vinyl-floor-uk'));

  const rec5 = JSON.parse(fs.readFileSync(path.join(tmpDir, 'vinyl-floor-uk.json'), 'utf8'));
  assert('CSV cluster_keywords → array in output',
    Array.isArray(rec5.cluster_keywords) && rec5.cluster_keywords.length === 3,
    `got ${JSON.stringify(rec5.cluster_keywords)}`);

  // ── Cleanup ───────────────────────────────────────────────────────────────
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Self-test complete.');
  process.exit(0);
}

module.exports = { emitHandoffs };
