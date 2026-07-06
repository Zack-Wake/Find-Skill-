'use strict';

// Lead-gen revenue model for S1 FIND (S1-018).
// Adds a second Gate-2 path for lead-gen-tagged clusters: values the organic
// traffic at the real CPC from cpc_capture (S1-017), so the gate can pass via
// sourced data even when the RPV formula alone falls short.
//
// Formula (conservative — decides a PASS, so uses low end throughout):
//   value = kpVolume × CTR(realistic band) × cpc_low
//
// CTR values are read from references/revenue_model.md (do not redefine them).
// The £800 floor is the same gate constant — this is a second sourced route
// to the same bar, not a lower bar.
//
// Run `node scripts/leadgen_model.js` to execute the built-in self-test.

const { getCPC } = require('./cpc_capture');

// ─── Constants (mirrored from references/revenue_model.md) ───────────────────
// CTR-by-profile — realistic rank table, base CTR column.
// Update revenue_model.md first; keep in sync here.
const CTR_BY_PROFILE = {
  GREEN:  0.18,   // Rank 2-3
  YELLOW: 0.07,   // Rank 4-6
  ORANGE: 0.025,  // Rank 7-10
  // RED: not modelled — Gate 1 already filters RED before Gate 2 runs
};

// Single source of truth: references/revenue_model.md § Gates & Tiers
const VAULT_REVENUE_GATE_LOW = 800; // £

const LEAD_GEN_TAGS = new Set(['lead-gen-local', 'lead-gen-b2b']);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function _normalizeProfile(realisticRank) {
  const s = String(realisticRank).toUpperCase();
  if (s.includes('GREEN'))  return 'GREEN';
  if (s.includes('YELLOW')) return 'YELLOW';
  if (s.includes('ORANGE')) return 'ORANGE';
  return null;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute the CPC-traffic-value for a lead-gen cluster.
 * Conservative: band CTR (not best-case) × cpc_low (not cpc_high).
 *
 * @param {string} keyword       - cluster head term; must match the key used in captureCPC
 * @param {number} kpVolume      - real monthly search volume (cluster volume)
 * @param {string} realisticRank - competition profile: 'GREEN' | 'YELLOW' | 'ORANGE'
 * @param {object} [opts]
 * @param {function} [opts._getCPCFn] - override getCPC (self-test injection only)
 *
 * @returns {{ value: number, model: 'cpc-traffic-value', confidence: 'low', cpc: number }
 *          |{ value: null, reason: string }}
 *   reason 'NO_CPC' means getCPC returned null — no capture exists for this keyword.
 */
function leadGenValue(keyword, kpVolume, realisticRank, opts) {
  const getCPCFn = (opts && opts._getCPCFn) || getCPC;

  const profile = _normalizeProfile(realisticRank);
  if (!profile) {
    return { value: null, reason: `Unknown competition profile "${realisticRank}". Expected GREEN, YELLOW, or ORANGE.` };
  }

  const cpcRec = getCPCFn(keyword);
  if (!cpcRec) {
    return { value: null, reason: 'NO_CPC' };
  }

  const ctr   = CTR_BY_PROFILE[profile];
  const value = Math.round(kpVolume * ctr * cpcRec.cpc_low * 100) / 100;

  return {
    value,
    model:      'cpc-traffic-value',
    confidence: 'low',
    cpc:        cpcRec.cpc_low,
  };
}

/**
 * Gate-2 check with lead-gen second path.
 *
 * Non-lead-gen tags: RPV-only, unchanged.
 * lead-gen-local / lead-gen-b2b: passes if RPV revenue_low ≥ £800
 *   OR CPC-traffic-value ≥ £800.
 *
 * A CPC-path pass carries three flags that must be appended to the cluster's
 * Notes column (and never to an RPV-path pass):
 *   - 'revenue_model:cpc-traffic-value'
 *   - 'revenue_confidence:low'
 *   - 'manual KP check required before build'
 *
 * If getCPC returns null (no CPC captured):
 *   - Falls back to RPV-only for the gate decision
 *   - Adds flag 'lead-gen model not evaluated (no CPC)'
 *
 * @param {string}   tag          - monetisation tag from Stage 6
 * @param {number}   revenueLow   - Monthly_Revenue_Low from Stage 7 RPV formula (£)
 * @param {string}   keyword      - cluster head term
 * @param {number}   kpVolume     - real monthly search volume
 * @param {string}   realisticRank - competition profile
 * @param {object}   [opts]
 * @param {function} [opts._getCPCFn] - override getCPC (self-test injection only)
 *
 * @returns {{
 *   pass:       boolean,
 *   path:       'rpv' | 'cpc-traffic-value' | null,
 *   flags:      string[],
 *   cpcResult:  object | null
 * }}
 */
function gate2Check(tag, revenueLow, keyword, kpVolume, realisticRank, opts) {
  const rpvPass = revenueLow >= VAULT_REVENUE_GATE_LOW;

  // Non-lead-gen: RPV only, no change to existing behaviour
  if (!LEAD_GEN_TAGS.has(tag)) {
    return {
      pass:      rpvPass,
      path:      rpvPass ? 'rpv' : null,
      flags:     [],
      cpcResult: null,
    };
  }

  // Lead-gen: evaluate CPC path alongside RPV
  const lgv = leadGenValue(keyword, kpVolume, realisticRank, opts);

  // No CPC captured → fall back to RPV-only; flag it
  if (lgv.reason === 'NO_CPC') {
    return {
      pass:      rpvPass,
      path:      rpvPass ? 'rpv' : null,
      flags:     ['lead-gen model not evaluated (no CPC)'],
      cpcResult: lgv,
    };
  }

  const cpcPass = lgv.value >= VAULT_REVENUE_GATE_LOW;
  const pass    = rpvPass || cpcPass;

  // Flags only when CPC path is the deciding factor (RPV failed)
  const flags = [];
  if (cpcPass && !rpvPass) {
    flags.push('revenue_model:cpc-traffic-value');
    flags.push('revenue_confidence:low');
    flags.push('manual KP check required before build');
  }

  return {
    pass,
    path:      rpvPass ? 'rpv' : (cpcPass ? 'cpc-traffic-value' : null),
    flags,
    cpcResult: lgv,
  };
}

// ─── Self-test (no Chrome, no network, no real file I/O) ─────────────────────

if (require.main === module) {
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

  // Inject a mock getCPC so no real file is read or written
  function mockGetCPC(records) {
    return (keyword) => {
      const target = String(keyword).trim().toLowerCase();
      let latest = null;
      for (const r of records) {
        if (String(r.keyword).toLowerCase() === target) latest = r;
      }
      return latest;
    };
  }

  console.log('\n=== leadgen_model.js self-test ===\n');

  // ── (a) lead-gen cluster: CPC path clears £800, RPV does not ─────────────
  // kpVolume=5000, GREEN (CTR=18%), cpc_low=1.50
  //   CPC value = 5000 × 0.18 × 1.50 = £1350  ≥ £800 ✓
  //   revenueLow (passed directly) = £270        < £800 ✗ (RPV fails)
  const cpcA = mockGetCPC([{ keyword: 'resin flooring uk', cpc_low: 1.50, cpc_high: 4.50 }]);

  const lgvA = leadGenValue('resin flooring uk', 5000, 'GREEN', { _getCPCFn: cpcA });
  assert('(a) leadGenValue → value computed',       lgvA.value !== null,                         `reason: ${lgvA.reason}`);
  assert('(a) leadGenValue → value ≥ £800',         lgvA.value >= 800,                           `got ${lgvA.value}`);
  assert('(a) leadGenValue → model tag',            lgvA.model === 'cpc-traffic-value',           `got "${lgvA.model}"`);
  assert('(a) leadGenValue → confidence low',       lgvA.confidence === 'low');
  assert('(a) leadGenValue → cpc is cpc_low',       lgvA.cpc === 1.50,                           `got ${lgvA.cpc}`);

  const g2A = gate2Check('lead-gen-local', 270, 'resin flooring uk', 5000, 'GREEN', { _getCPCFn: cpcA });
  assert('(a) Gate 2 → pass',                       g2A.pass === true,                            `got ${g2A.pass}`);
  assert('(a) Gate 2 → path = cpc-traffic-value',  g2A.path === 'cpc-traffic-value',             `got "${g2A.path}"`);
  assert('(a) flag: revenue_model',                 g2A.flags.includes('revenue_model:cpc-traffic-value'));
  assert('(a) flag: revenue_confidence',            g2A.flags.includes('revenue_confidence:low'));
  assert('(a) flag: manual KP check',              g2A.flags.some(f => f.includes('manual KP check')));

  // ── (b) lead-gen cluster with no CPC → NO_CPC; gate falls back to RPV ────
  const cpcB = mockGetCPC([]); // empty — no captures exist

  const lgvB = leadGenValue('safety flooring', 3000, 'YELLOW', { _getCPCFn: cpcB });
  assert('(b) leadGenValue → reason NO_CPC',        lgvB.reason === 'NO_CPC',                    `got "${lgvB.reason}"`);
  assert('(b) leadGenValue → value null',            lgvB.value === null);

  // RPV fails, no CPC → Gate 2 fails, flag present
  const g2B_fail = gate2Check('lead-gen-local', 200, 'safety flooring', 3000, 'YELLOW', { _getCPCFn: cpcB });
  assert('(b) Gate 2 → fail (low RPV, no CPC)',     g2B_fail.pass === false,                     `got ${g2B_fail.pass}`);
  assert('(b) Gate 2 → flag: no CPC',               g2B_fail.flags.some(f => f.includes('no CPC')));

  // RPV passes, no CPC → Gate 2 passes via RPV path
  const g2B_pass = gate2Check('lead-gen-local', 900, 'safety flooring', 3000, 'YELLOW', { _getCPCFn: cpcB });
  assert('(b) Gate 2 → pass via RPV when RPV ≥ 800', g2B_pass.pass === true,                    `got ${g2B_pass.pass}`);
  assert('(b) Gate 2 → path = rpv',                  g2B_pass.path === 'rpv',                    `got "${g2B_pass.path}"`);

  // ── (c) non-lead-gen tag → CPC path NOT applied ──────────────────────────
  const cpcC = mockGetCPC([{ keyword: 'best crm software', cpc_low: 5.00, cpc_high: 12.00 }]);

  // CPC alone would be huge but it must NOT be evaluated for non-lead-gen tags
  const g2C_fail = gate2Check('affiliate-saas-high-ticket', 300, 'best crm software', 8000, 'GREEN', { _getCPCFn: cpcC });
  assert('(c) non-lead-gen, RPV fail → Gate 2 fail', g2C_fail.pass === false,                   `got ${g2C_fail.pass}`);
  assert('(c) non-lead-gen → no flags',               g2C_fail.flags.length === 0,               `got ${JSON.stringify(g2C_fail.flags)}`);
  assert('(c) non-lead-gen → cpcResult null',         g2C_fail.cpcResult === null);

  const g2C_pass = gate2Check('affiliate-saas-high-ticket', 1200, 'best crm software', 8000, 'GREEN', { _getCPCFn: cpcC });
  assert('(c) non-lead-gen, RPV pass → Gate 2 via rpv', g2C_pass.pass === true && g2C_pass.path === 'rpv');

  // ── (d) £800 floor is unchanged — verified at the boundary ───────────────
  // kpVolume=555, GREEN (18%), cpc_low=8.00 → 555 × 0.18 × 8.00 = 799.20  < 800
  // kpVolume=556, GREEN (18%), cpc_low=8.00 → 556 × 0.18 × 8.00 = 800.64  ≥ 800
  const cpcD = mockGetCPC([{ keyword: 'floor test', cpc_low: 8.00, cpc_high: 10.00 }]);

  const lgvD_low  = leadGenValue('floor test', 555, 'GREEN', { _getCPCFn: cpcD });
  const lgvD_high = leadGenValue('floor test', 556, 'GREEN', { _getCPCFn: cpcD });

  assert('(d) floor — 555 vol → value < £800',  lgvD_low.value  <  800, `got ${lgvD_low.value}`);
  assert('(d) floor — 556 vol → value ≥ £800',  lgvD_high.value >= 800, `got ${lgvD_high.value}`);

  const g2D_fail = gate2Check('lead-gen-local', 100, 'floor test', 555, 'GREEN', { _getCPCFn: cpcD });
  const g2D_pass = gate2Check('lead-gen-local', 100, 'floor test', 556, 'GREEN', { _getCPCFn: cpcD });
  assert('(d) gate fails just below £800',       g2D_fail.pass === false, `value=${lgvD_low.value}`);
  assert('(d) gate passes just above £800',      g2D_pass.pass === true,  `value=${lgvD_high.value}`);
  assert('(d) floor = same £800 constant',       lgvD_low.value < VAULT_REVENUE_GATE_LOW && lgvD_high.value >= VAULT_REVENUE_GATE_LOW);

  // ── Extra: emoji / verbose profile strings are normalised ────────────────
  const cpcE = mockGetCPC([{ keyword: 'uk flooring', cpc_low: 2.00, cpc_high: 5.00 }]);
  const lgvE = leadGenValue('uk flooring', 1000, '🟡 YELLOW — Mixed', { _getCPCFn: cpcE });
  assert('emoji profile normalised → value computed', lgvE.value !== null, `reason: ${lgvE.reason}`);
  assert('emoji profile → correct CTR (0.07)',        Math.abs(lgvE.value - 1000 * 0.07 * 2.00) < 0.01,
    `got ${lgvE.value}, expected ${1000 * 0.07 * 2.00}`);

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Self-test complete.');
  process.exit(0);
}

module.exports = { leadGenValue, gate2Check };
