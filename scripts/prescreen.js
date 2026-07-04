'use strict';

// Stage 0 pre-screen for S1 FIND (S1-012).
// Cheap, no-Chrome money-math gate: rejects seeds that can't reach £800/mo at
// optimistic best-case rank BEFORE any SERP scrape fires.
//
// Constants are mirrored from references/revenue_model.md — do not invent
// different values; update the reference first, then sync here.
//
// Log path: runs/prescreen_log.jsonl  (append-only, one record per call)
//
// Run `node scripts/prescreen.js` to execute the built-in self-test.

const fs   = require('fs');
const path = require('path');

// ─── Revenue constants (mirrored from references/revenue_model.md) ────────────

const VAULT_REVENUE_GATE_LOW = 800; // £  — single source of truth in revenue_model.md

// RPV_HIGH values from the RPV table (RPV High column, £ per visitor)
const RPV_HIGH = {
  'affiliate-saas-high-ticket': 1.50,
  'affiliate-saas-low-ticket':  0.50,
  'affiliate-physical':         0.20,
  'ads-generic':                0.010,
  'ads-premium-niche':          0.030,
  'lead-gen-local':             3.00,
  'lead-gen-b2b':               8.00,
  'low-monetise':               0.005,
  // own-saas / own-product-onetime: "varies" in revenue_model.md — not auto-scoreable
};

// Best-case CTR = GREEN profile, rank 2-3 = 18% (CTR-by-rank table in revenue_model.md)
const BEST_CASE_CTR = 0.18;

// ─── Log path ─────────────────────────────────────────────────────────────────

const LOG_PATH = path.join(__dirname, '..', 'runs', 'prescreen_log.jsonl');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Pre-screen a seed before committing to a full SERP scrape.
 *
 * @param {string}  seed      - raw seed term (e.g. "uk flooring installers")
 * @param {*}       kpVolume  - real monthly search volume from Keyword Planner.
 *                              Missing / non-numeric → verdict 'NO_VOLUME'; never estimated.
 * @param {string}  tag       - monetisation tag (one of the keys in RPV_HIGH, or
 *                              'own-saas' / 'own-product-onetime' for "varies" tags)
 * @param {object}  [opts]
 * @param {boolean} [opts.override=false] - force PROCEED on a REJECT; logged as verdict_overridden
 *
 * @returns {{ verdict: 'PROCEED'|'REJECT'|'NO_VOLUME', reason: string, math: object|null }}
 */
function preScreen(seed, kpVolume, tag, opts) {
  const override = (opts && opts.override === true);

  // ── Volume guard ──────────────────────────────────────────────────────────
  if (kpVolume === undefined || kpVolume === null || kpVolume === '') {
    const rec = _buildRecord(seed, kpVolume, tag, null, null, null, 'NO_VOLUME',
      'kpVolume is required — paste the real Keyword Planner figure; never estimated.', override, false);
    _appendLog(rec);
    return { verdict: 'NO_VOLUME', reason: rec.reason, math: null };
  }

  const vol = Number(kpVolume);
  if (!Number.isFinite(vol) || vol < 0) {
    const rec = _buildRecord(seed, kpVolume, tag, null, null, null, 'NO_VOLUME',
      `kpVolume must be a non-negative number; got "${kpVolume}".`, override, false);
    _appendLog(rec);
    return { verdict: 'NO_VOLUME', reason: rec.reason, math: null };
  }

  // ── Tag guard ─────────────────────────────────────────────────────────────
  if (tag === 'own-saas' || tag === 'own-product-onetime') {
    const reason = `Tag "${tag}" has variable RPV — cannot auto-screen. ` +
      'Calculate manually and use override:true if the seed pencils out.';
    const rec = _buildRecord(seed, vol, tag, null, null, null, 'REJECT', reason, override, false);
    _appendLog(rec);
    return { verdict: 'REJECT', reason, math: null };
  }

  const rpvHigh = RPV_HIGH[tag];
  if (rpvHigh === undefined) {
    const known = Object.keys(RPV_HIGH).join(', ');
    const reason = `Unknown monetisation tag "${tag}". Known tags: ${known}.`;
    const rec = _buildRecord(seed, vol, tag, null, null, null, 'REJECT', reason, override, false);
    _appendLog(rec);
    return { verdict: 'REJECT', reason, math: null };
  }

  // ── Money math ────────────────────────────────────────────────────────────
  const projected = vol * rpvHigh * BEST_CASE_CTR;
  const math = {
    kpVolume:                    vol,
    rpv_high:                    rpvHigh,
    best_case_ctr:               BEST_CASE_CTR,
    projected_monthly_revenue:   Math.round(projected * 100) / 100,
    gate:                        VAULT_REVENUE_GATE_LOW,
  };

  let verdict;
  let reason;
  let verdictOverridden = false;

  if (projected >= VAULT_REVENUE_GATE_LOW) {
    verdict = 'PROCEED';
    reason  = `Optimistic revenue £${math.projected_monthly_revenue.toFixed(2)}/mo ≥ £${VAULT_REVENUE_GATE_LOW} gate.`;
  } else if (override) {
    verdict          = 'PROCEED';
    verdictOverridden = true;
    reason = `Optimistic revenue £${math.projected_monthly_revenue.toFixed(2)}/mo < £${VAULT_REVENUE_GATE_LOW} gate — OVERRIDDEN by caller.`;
  } else {
    verdict = 'REJECT';
    reason  = `Optimistic revenue £${math.projected_monthly_revenue.toFixed(2)}/mo < £${VAULT_REVENUE_GATE_LOW} gate. ` +
      'Run a full FIND only if you have strong reason to override (e.g. insider data).';
  }

  const rec = _buildRecord(seed, vol, tag, rpvHigh, BEST_CASE_CTR, math.projected_monthly_revenue,
    verdict, reason, override, verdictOverridden);
  _appendLog(rec);

  return { verdict, reason, math };
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _buildRecord(seed, kpVolume, tag, rpv_high, ctr, projected_monthly_revenue_gbp,
                      verdict, reason, override, verdict_overridden) {
  return {
    seed,
    kpVolume,
    tag,
    rpv_high,
    ctr,
    projected_monthly_revenue_gbp,
    verdict,
    reason,
    override,
    verdict_overridden,
    timestamp: new Date().toISOString(),
  };
}

function _appendLog(record) {
  const dir = path.dirname(LOG_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(LOG_PATH, JSON.stringify(record) + '\n', 'utf8');
}

// ─── Self-test (no Chrome, no network) ───────────────────────────────────────

if (require.main === module) {
  const os = require('os');

  // Redirect log writes to a temp file so the self-test doesn't pollute the
  // real prescreen_log.jsonl.
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'prescreen-test-'));
  const realLog = LOG_PATH;

  // Monkey-patch _appendLog to write to tmp during test
  let _patchedLog = path.join(tmpDir, 'prescreen_log.jsonl');
  const origAppend = fs.appendFileSync.bind(fs);
  const _origLogPath = realLog;
  // Simple override: replace LOG_PATH reference by re-pointing the closure
  // (cannot reassign const — instead we test via the returned records)

  let passed = 0;
  let failed = 0;

  function assert(label, cond, detail) {
    if (cond) {
      console.log(`  PASS  ${label}`);
      passed++;
    } else {
      console.error(`  FAIL  ${label}${detail ? ' — ' + detail : ''}`);
      failed++;
    }
  }

  // Use a temp log so the self-test doesn't write to the real one.
  // We achieve this by temporarily writing to a temp directory by
  // creating a writable symlink — not available on all Windows configs, so
  // instead we just read back what was actually written to the real log and
  // count the new lines appended during this test run.
  const logBefore = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(l => l.trim()).length
    : 0;

  console.log('\n=== prescreen.js self-test ===\n');

  // ── 1. Known-fail: tiny volume + very low RPV tag → REJECT ───────────────
  // 500 × 0.010 (ads-generic RPV_high) × 0.18 = £0.90 — well under £800
  const r1 = preScreen('pet food recipes', 500, 'ads-generic');
  assert('known-fail → REJECT',         r1.verdict === 'REJECT',  `got "${r1.verdict}"`);
  assert('known-fail → reason string',  typeof r1.reason === 'string' && r1.reason.length > 0);
  assert('known-fail → math present',   r1.math !== null);
  assert('known-fail → projected < 800', r1.math.projected_monthly_revenue < 800,
    `got ${r1.math && r1.math.projected_monthly_revenue}`);

  // ── 2. Known-pass: decent volume + high RPV tag → PROCEED ────────────────
  // 10000 × 1.50 (affiliate-saas-high-ticket) × 0.18 = £2700 — over £800
  const r2 = preScreen('best CRM software UK', 10000, 'affiliate-saas-high-ticket');
  assert('known-pass → PROCEED',        r2.verdict === 'PROCEED', `got "${r2.verdict}"`);
  assert('known-pass → math present',   r2.math !== null);
  assert('known-pass → projected ≥ 800', r2.math.projected_monthly_revenue >= 800,
    `got ${r2.math && r2.math.projected_monthly_revenue}`);

  // ── 3. Override on a failing seed → PROCEED + "OVERRIDDEN" in reason ─────
  // 200 × 0.005 (low-monetise) × 0.18 = £0.18 — under £800
  const r3 = preScreen('free stuff online', 200, 'low-monetise', { override: true });
  assert('override → PROCEED',              r3.verdict === 'PROCEED',       `got "${r3.verdict}"`);
  assert('override → reason mentions OVERRIDDEN',
    r3.reason.toUpperCase().includes('OVERRIDDEN'));

  // ── 4. Missing volume → NO_VOLUME ────────────────────────────────────────
  const r4 = preScreen('uk flooring', undefined, 'lead-gen-local');
  assert('missing vol → NO_VOLUME',     r4.verdict === 'NO_VOLUME', `got "${r4.verdict}"`);
  assert('missing vol → no math',       r4.math === null);

  // ── 5. Non-numeric volume → NO_VOLUME ────────────────────────────────────
  const r5 = preScreen('uk flooring', 'lots', 'lead-gen-local');
  assert('non-numeric vol → NO_VOLUME', r5.verdict === 'NO_VOLUME', `got "${r5.verdict}"`);

  // ── 6. Unknown tag → REJECT ───────────────────────────────────────────────
  const r6 = preScreen('dog training', 5000, 'mystery-tag');
  assert('unknown tag → REJECT',        r6.verdict === 'REJECT',   `got "${r6.verdict}"`);

  // ── 7. own-saas tag → REJECT (variable RPV, not auto-scoreable) ──────────
  const r7 = preScreen('project management tool', 8000, 'own-saas');
  assert('own-saas → REJECT',           r7.verdict === 'REJECT',   `got "${r7.verdict}"`);

  // ── 8. All 7 calls logged (one JSONL line each) ───────────────────────────
  const logAfter = fs.existsSync(LOG_PATH)
    ? fs.readFileSync(LOG_PATH, 'utf8').split('\n').filter(l => l.trim()).length
    : 0;
  assert('all 7 calls logged', logAfter - logBefore === 7,
    `expected 7 new lines; got ${logAfter - logBefore}`);

  // ── Cleanup temp dir ──────────────────────────────────────────────────────
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Self-test complete.');
  process.exit(0);
}

module.exports = { preScreen };
