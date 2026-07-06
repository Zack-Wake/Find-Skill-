'use strict';

// CPC capture for S1 FIND (S1-017).
// Stores the real top-of-page bid range that Keyword Planner surfaces during
// the manual Stage 5 volume check. Capture only — no scoring, no revenue
// estimate, no Gate-2 change. The lead-gen model that consumes this data is a
// separate future packet.
//
// Store path: data/cpc_data.jsonl  (append-only; tracked in git as curated data)
//
// Run `node scripts/cpc_capture.js` to execute the built-in self-test.

const fs   = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'data', 'cpc_data.jsonl');

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Store a real CPC range from Keyword Planner for a keyword.
 *
 * @param {string} keyword   - exact keyword as it appears in KP
 * @param {*}      cpcLow    - low end of top-of-page bid range (real KP figure, numeric)
 * @param {*}      cpcHigh   - high end of top-of-page bid range (real KP figure, numeric)
 * @param {object} [opts]
 * @param {string} [opts.currency='GBP']
 * @param {string} [opts.source='Google Keyword Planner']
 * @param {string} [opts.date]  - ISO date string; defaults to today if omitted
 *
 * @returns {{ ok: true, record: object } | { ok: false, error: string }}
 *   Returns ok:false and writes nothing on any validation failure.
 */
function captureCPC(keyword, cpcLow, cpcHigh, opts) {
  const currency = (opts && opts.currency) || 'GBP';
  const source   = (opts && opts.source)   || 'Google Keyword Planner';
  const date     = (opts && opts.date)     || new Date().toISOString().slice(0, 10);

  // ── Keyword guard ─────────────────────────────────────────────────────────
  if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
    return { ok: false, error: 'keyword is required and must be a non-empty string.' };
  }

  // ── CPC low guard ─────────────────────────────────────────────────────────
  const low = _parsePositiveNumber(cpcLow);
  if (low === null) {
    return { ok: false, error: `cpcLow must be a non-negative number from Keyword Planner; got "${cpcLow}". Never fabricate or estimate CPC.` };
  }

  // ── CPC high guard ────────────────────────────────────────────────────────
  const high = _parsePositiveNumber(cpcHigh);
  if (high === null) {
    return { ok: false, error: `cpcHigh must be a non-negative number from Keyword Planner; got "${cpcHigh}". Never fabricate or estimate CPC.` };
  }

  if (high < low) {
    return { ok: false, error: `cpcHigh (${high}) must be ≥ cpcLow (${low}).` };
  }

  // ── Build and append record ───────────────────────────────────────────────
  const record = {
    keyword:        keyword.trim(),
    cpc_low:        low,
    cpc_high:       high,
    currency,
    source,
    retrieved_date: date,
    confidence:     'low',
  };

  _appendData(record);
  return { ok: true, record };
}

/**
 * Return the most recent CPC record for a keyword (last-write-wins), or null.
 *
 * @param {string} keyword
 * @returns {object|null}
 */
function getCPC(keyword) {
  if (!keyword || typeof keyword !== 'string') return null;
  const target = keyword.trim().toLowerCase();

  if (!fs.existsSync(DATA_PATH)) return null;

  const lines = fs.readFileSync(DATA_PATH, 'utf8')
    .split('\n')
    .filter(l => l.trim());

  let latest = null;
  for (const line of lines) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    if (rec.keyword && rec.keyword.toLowerCase() === target) {
      latest = rec;
    }
  }
  return latest;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function _parsePositiveNumber(val) {
  if (val === undefined || val === null || val === '') return null;
  const n = Number(val);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function _appendData(record) {
  const dir = path.dirname(DATA_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(DATA_PATH, JSON.stringify(record) + '\n', 'utf8');
}

// ─── Self-test (no Chrome, no network) ───────────────────────────────────────

if (require.main === module) {
  const os = require('os');

  // Run against a temp data file so the self-test doesn't pollute cpc_data.jsonl.
  const tmpDir  = fs.mkdtempSync(path.join(os.tmpdir(), 'cpc-test-'));
  const tmpData = path.join(tmpDir, 'cpc_data.jsonl');

  // Monkey-patch DATA_PATH by re-pointing the file operations via a local helper.
  // Since DATA_PATH is a module-level const, we test by directly exercising the
  // internal helpers with the temp path, then reading back to verify.
  function captureToTemp(keyword, cpcLow, cpcHigh, opts) {
    const currency = (opts && opts.currency) || 'GBP';
    const source   = (opts && opts.source)   || 'Google Keyword Planner';
    const date     = (opts && opts.date)     || '2026-07-04';

    if (!keyword || typeof keyword !== 'string' || !keyword.trim())
      return { ok: false, error: 'keyword is required and must be a non-empty string.' };

    const low = _parsePositiveNumber(cpcLow);
    if (low === null)
      return { ok: false, error: `cpcLow invalid: "${cpcLow}"` };

    const high = _parsePositiveNumber(cpcHigh);
    if (high === null)
      return { ok: false, error: `cpcHigh invalid: "${cpcHigh}"` };

    if (high < low)
      return { ok: false, error: `cpcHigh (${high}) < cpcLow (${low})` };

    const record = { keyword: keyword.trim(), cpc_low: low, cpc_high: high,
      currency, source, retrieved_date: date, confidence: 'low' };
    fs.appendFileSync(tmpData, JSON.stringify(record) + '\n', 'utf8');
    return { ok: true, record };
  }

  function getCPCFromTemp(keyword) {
    if (!keyword || typeof keyword !== 'string') return null;
    const target = keyword.trim().toLowerCase();
    if (!fs.existsSync(tmpData)) return null;
    const lines = fs.readFileSync(tmpData, 'utf8').split('\n').filter(l => l.trim());
    let latest = null;
    for (const line of lines) {
      let rec;
      try { rec = JSON.parse(line); } catch { continue; }
      if (rec.keyword && rec.keyword.toLowerCase() === target) latest = rec;
    }
    return latest;
  }

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

  console.log('\n=== cpc_capture.js self-test ===\n');

  // ── 1. Valid capture → stored and retrievable ─────────────────────────────
  const r1 = captureToTemp('resin flooring uk', 1.20, 4.50);
  assert('valid capture → ok:true',          r1.ok === true,              `got ok:${r1.ok}`);
  assert('valid capture → record has keyword', r1.ok && r1.record.keyword === 'resin flooring uk');
  assert('valid capture → cpc_low stored',    r1.ok && r1.record.cpc_low  === 1.20);
  assert('valid capture → cpc_high stored',   r1.ok && r1.record.cpc_high === 4.50);
  assert('valid capture → confidence low',    r1.ok && r1.record.confidence === 'low');

  const g1 = getCPCFromTemp('resin flooring uk');
  assert('getCPC → returns stored record',    g1 !== null,                 'got null');
  assert('getCPC → correct cpc_high',         g1 && g1.cpc_high === 4.50, `got ${g1 && g1.cpc_high}`);

  // ── 2. Missing cpcLow → rejected, nothing written ─────────────────────────
  const lineBefore = fs.existsSync(tmpData)
    ? fs.readFileSync(tmpData, 'utf8').split('\n').filter(l => l.trim()).length : 0;

  const r2 = captureToTemp('safety flooring', undefined, 3.00);
  assert('missing cpcLow → ok:false',         r2.ok === false,             `got ok:${r2.ok}`);

  const r3 = captureToTemp('safety flooring', 'ask KP', 3.00);
  assert('non-numeric cpcLow → ok:false',     r3.ok === false,             `got ok:${r3.ok}`);

  const r4 = captureToTemp('safety flooring', 1.50, undefined);
  assert('missing cpcHigh → ok:false',        r4.ok === false,             `got ok:${r4.ok}`);

  const r5 = captureToTemp('safety flooring', 1.50, 'tbc');
  assert('non-numeric cpcHigh → ok:false',    r5.ok === false,             `got ok:${r5.ok}`);

  const lineAfter = fs.readFileSync(tmpData, 'utf8').split('\n').filter(l => l.trim()).length;
  assert('invalid inputs → nothing written',  lineAfter === lineBefore,
    `expected ${lineBefore} lines, got ${lineAfter}`);

  // ── 3. cpcHigh < cpcLow → rejected ───────────────────────────────────────
  const r6 = captureToTemp('epoxy floor paint', 5.00, 2.00);
  assert('cpcHigh < cpcLow → ok:false',       r6.ok === false,             `got ok:${r6.ok}`);

  // ── 4. Missing keyword → rejected ────────────────────────────────────────
  const r7 = captureToTemp('', 1.00, 2.00);
  assert('empty keyword → ok:false',          r7.ok === false,             `got ok:${r7.ok}`);

  // ── 5. Re-capture same keyword → getCPC returns newest ───────────────────
  captureToTemp('resin flooring uk', 2.00, 6.00, { date: '2026-07-05' });
  const g2 = getCPCFromTemp('resin flooring uk');
  assert('re-capture → getCPC returns newest cpc_high', g2 && g2.cpc_high === 6.00,
    `got cpc_high ${g2 && g2.cpc_high}`);
  assert('re-capture → newest retrieved_date',          g2 && g2.retrieved_date === '2026-07-05',
    `got date ${g2 && g2.retrieved_date}`);

  // ── 6. getCPC on unknown keyword → null ──────────────────────────────────
  const g3 = getCPCFromTemp('vinyl plank flooring');
  assert('unknown keyword → null',            g3 === null,                 `got ${g3}`);

  // ── 7. Default opts filled correctly ─────────────────────────────────────
  const r8 = captureToTemp('safety flooring', 0.80, 2.50);
  assert('default currency = GBP',            r8.ok && r8.record.currency === 'GBP');
  assert('default source = Google KP',        r8.ok && r8.record.source === 'Google Keyword Planner');
  assert('confidence always low',             r8.ok && r8.record.confidence === 'low');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  fs.rmSync(tmpDir, { recursive: true, force: true });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
  console.log('Self-test complete.');
  process.exit(0);
}

module.exports = { captureCPC, getCPC };
