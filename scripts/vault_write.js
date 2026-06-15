'use strict';

// Vault master-sheet logic (S1-008/009/013): dedup, staleness sweep, soft
// cap, CSV fallback, and Vault/Watchlist tab routing. Operates on plain row
// objects — Stage 9 reads the live Vault Google Sheet (Vault + Watchlist
// tabs) via Drive MCP, passes its rows through these functions, then writes
// the resulting appends and staleness patches back via Claude in Chrome
// (Drive MCP can create the sheet but can't edit an existing one in place).
// `monthly_revenue_low/high` must be plain numbers. See
// references/vault_schema.md for the column layout and rules this
// implements — the same rules apply independently to each tab.
//
// Run `node scripts/vault_write.js` to execute the built-in self-test.

const fs = require('fs');
const path = require('path');

const SOFT_CAP_PER_RUN = 50;
const STALENESS_MONTHS = 6;

const VAULT_COLUMNS = [
  'niche_id', 'niche_label', 'seed_term', 'selected_at', 'head_keyword',
  'cluster_keywords', 'cluster_volume', 'volume_confidence', 'competition_tier',
  'realistic_rank', 'aio_present', 'monetisation_tag', 'rpv_low', 'rpv_high',
  'monthly_revenue_low', 'monthly_revenue_high', 'revenue_confidence',
  'band', 'opportunity_tier', 'staleness_flag', 'priors_match', 'trend',
  'notes', 'source_run', 'schema_version',
];

function slugify(label) {
  return String(label)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function uniqueSlug(slug, usedIds) {
  if (!usedIds.has(slug)) return slug;
  let n = 2;
  while (usedIds.has(`${slug}-${n}`)) n++;
  return `${slug}-${n}`;
}

function uniqueNicheId(label, existingIds) {
  return uniqueSlug(slugify(label), existingIds);
}

/**
 * Plan which of this run's qualifying Tab 2 rows to append to the Vault.
 * - Excludes RED rows (no `band`).
 * - Skips rows whose niche_id already exists in the Vault (dedup).
 * - Sorts the rest by monthly_revenue_low descending and caps at SOFT_CAP_PER_RUN.
 *
 * @param {object[]} candidates - this run's Tab 2 rows with band set
 * @param {object[]} existingRows - current Vault rows
 * @param {string} today - 'YYYY-MM-DD'
 * @returns {{toAppend: object[], skippedDupes: number, overflow: object[]}}
 */
function planAppend(candidates, existingRows, today) {
  const existingIds = new Set(existingRows.map((r) => r.niche_id));
  const usedThisRun = new Set();

  const eligible = candidates.filter((c) => c.band === 'vault' || c.band === 'watchlist');

  const fresh = [];
  let skippedDupes = 0;
  for (const c of eligible) {
    const slug = c.niche_id || slugify(c.niche_label);

    // Already in the Vault from a previous run -> same niche, skip.
    if (existingIds.has(slug)) {
      skippedDupes++;
      continue;
    }

    // New to the Vault. Disambiguate only against other new rows from this
    // same run whose labels happen to slugify to the same string.
    const niche_id = uniqueSlug(slug, usedThisRun);
    usedThisRun.add(niche_id);

    fresh.push({
      schema_version: '1.2',
      staleness_flag: false,
      selected_at: today,
      ...c,
      niche_id,
    });
  }

  fresh.sort((a, b) => (Number(b.monthly_revenue_low) || 0) - (Number(a.monthly_revenue_low) || 0));

  return {
    toAppend: fresh.slice(0, SOFT_CAP_PER_RUN),
    skippedDupes,
    overflow: fresh.slice(SOFT_CAP_PER_RUN),
  };
}

/**
 * Split candidate/result rows into their target tab by `band`. Rows with any
 * other band (RED clusters have none) belong to neither tab.
 *
 * @param {object[]} rows
 * @returns {{vault: object[], watchlist: object[]}}
 */
function splitByBand(rows) {
  const vault = [];
  const watchlist = [];
  for (const row of rows) {
    if (row.band === 'vault') vault.push(row);
    else if (row.band === 'watchlist') watchlist.push(row);
  }
  return { vault, watchlist };
}

/**
 * Plan appends for both Vault-sheet tabs at once. Splits `candidates` by
 * `band` and runs `planAppend` independently against each tab's existing
 * rows — separate dedup sets, separate soft caps, separate overflow. A
 * watchlist row can never land in the vault plan or vice versa.
 *
 * @param {object[]} candidates - this run's Tab 2 rows with band set
 * @param {object[]} existingVaultRows - current Vault-tab rows
 * @param {object[]} existingWatchlistRows - current Watchlist-tab rows
 * @param {string} today - 'YYYY-MM-DD'
 * @returns {{vault: {toAppend: object[], skippedDupes: number, overflow: object[]}, watchlist: {toAppend: object[], skippedDupes: number, overflow: object[]}}}
 */
function planVaultAndWatchlist(candidates, existingVaultRows, existingWatchlistRows, today) {
  const { vault, watchlist } = splitByBand(candidates);
  return {
    vault: planAppend(vault, existingVaultRows, today),
    watchlist: planAppend(watchlist, existingWatchlistRows, today),
  };
}

/**
 * Existing Vault rows whose staleness_flag should flip to true. Apply each
 * patch in place (single-cell edit) — never delete or otherwise modify the row.
 *
 * @param {object[]} existingRows
 * @param {string} today - 'YYYY-MM-DD'
 * @returns {{niche_id: string, staleness_flag: true}[]}
 */
function sweepStaleness(existingRows, today) {
  const cutoff = new Date(today);
  cutoff.setMonth(cutoff.getMonth() - STALENESS_MONTHS);

  return existingRows
    .filter((r) => !truthy(r.staleness_flag) && new Date(r.selected_at) <= cutoff)
    .map((r) => ({ niche_id: r.niche_id, staleness_flag: true }));
}

function truthy(v) {
  return v === true || v === 'TRUE' || v === 'true';
}

// --- CSV fallback (used only when the Vault Sheet is unreachable) ---

function toCsv(rows) {
  const escape = (v) => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [VAULT_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(VAULT_COLUMNS.map((col) => escape(row[col])).join(','));
  }
  return lines.join('\n') + '\n';
}

function fromCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const values = parseCsvLine(line);
    const row = {};
    header.forEach((col, i) => { row[col] = values[i]; });
    return row;
  });
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { cur += ch; }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function fallbackFilename(today) {
  return `vault_fallback_${today}.csv`;
}

function writeFallback(rows, dir, today) {
  const filePath = path.join(dir, fallbackFilename(today));
  fs.writeFileSync(filePath, toCsv(rows), 'utf8');
  return filePath;
}

// Unmerged fallback files in `dir`, oldest first.
function readPendingFallbacks(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^vault_fallback_\d{4}-\d{2}-\d{2}\.csv$/.test(f));
  return files.sort().map((f) => {
    const filePath = path.join(dir, f);
    return { filePath, rows: fromCsv(fs.readFileSync(filePath, 'utf8')) };
  });
}

function markFallbackMerged(filePath) {
  fs.renameSync(filePath, `${filePath}.merged`);
}

module.exports = {
  VAULT_COLUMNS,
  SOFT_CAP_PER_RUN,
  STALENESS_MONTHS,
  slugify,
  uniqueNicheId,
  planAppend,
  splitByBand,
  planVaultAndWatchlist,
  sweepStaleness,
  toCsv,
  fromCsv,
  writeFallback,
  readPendingFallbacks,
  markFallbackMerged,
  fallbackFilename,
};

// --- Self-test ---------------------------------------------------------

function assert(cond, label) {
  if (!cond) throw new Error(`self-test failed: ${label}`);
}

function selfTest() {
  const today = '2026-06-14';

  // Staleness sweep: >6mo and unflagged -> flip; <6mo -> untouched; already-flagged -> untouched
  const existingRows = [
    { niche_id: 'old-stale-niche', selected_at: '2025-10-01', staleness_flag: 'FALSE' },
    { niche_id: 'recent-niche', selected_at: '2026-04-01', staleness_flag: 'FALSE' },
    { niche_id: 'already-flagged', selected_at: '2025-01-01', staleness_flag: 'TRUE' },
  ];
  const staleUpdates = sweepStaleness(existingRows, today);
  assert(staleUpdates.length === 1, 'staleness sweep finds exactly one row');
  assert(staleUpdates[0].niche_id === 'old-stale-niche', 'staleness sweep flags the >6mo row');

  // Dedup + RED exclusion + sort-by-revenue
  const candidates = [
    { niche_label: 'Recent Niche', band: 'vault', opportunity_tier: 'A', monthly_revenue_low: 1000 }, // dupe of recent-niche
    { niche_label: 'Brand New Vault Niche', band: 'vault', opportunity_tier: 'B', monthly_revenue_low: 900 },
    { niche_label: 'Brand New Watchlist Niche', band: 'watchlist', opportunity_tier: '', monthly_revenue_low: 200 },
    { niche_label: 'A Red Niche', band: '', opportunity_tier: '', monthly_revenue_low: 0 }, // RED -> no band -> excluded
  ];
  const plan = planAppend(candidates, existingRows, today);
  assert(plan.skippedDupes === 1, 'dedup skips the existing niche_id');
  assert(plan.toAppend.length === 2, 'RED row excluded, the other two appended');
  assert(plan.toAppend.every((r) => r.band === 'vault' || r.band === 'watchlist'), 'no RED rows in append plan');
  assert(plan.toAppend[0].niche_label === 'Brand New Vault Niche', 'sorted by monthly_revenue_low descending');
  assert(plan.toAppend[0].staleness_flag === false, 'new rows start with staleness_flag false');

  // Soft cap: 55 fresh candidates -> 50 appended, 5 overflow
  const manyCandidates = Array.from({ length: 55 }, (_, i) => ({
    niche_label: `Niche ${i}`,
    band: 'vault',
    opportunity_tier: 'C',
    monthly_revenue_low: 1000 - i,
  }));
  const capResult = planAppend(manyCandidates, [], today);
  assert(capResult.toAppend.length === SOFT_CAP_PER_RUN, 'soft cap limits append to 50');
  assert(capResult.overflow.length === 5, 'overflow holds the remaining 5');

  // splitByBand: buckets by band, RED (blank band) lands in neither
  const split = splitByBand([
    { niche_label: 'V', band: 'vault' },
    { niche_label: 'W', band: 'watchlist' },
    { niche_label: 'R', band: '' },
  ]);
  assert(split.vault.length === 1 && split.vault[0].niche_label === 'V', 'splitByBand buckets vault rows');
  assert(split.watchlist.length === 1 && split.watchlist[0].niche_label === 'W', 'splitByBand buckets watchlist rows');

  // planVaultAndWatchlist: independent dedup per tab
  const mixedCandidates = [
    { niche_label: 'Vault Niche One', band: 'vault', opportunity_tier: 'A', monthly_revenue_low: 1500 },
    { niche_label: 'Vault Niche Two', band: 'vault', opportunity_tier: 'B', monthly_revenue_low: 1200 }, // dupe of existing vault row
    { niche_label: 'Watchlist Niche One', band: 'watchlist', opportunity_tier: '', monthly_revenue_low: 300 },
    { niche_label: 'A Red Niche', band: '', opportunity_tier: '', monthly_revenue_low: 0 }, // RED -> neither tab
  ];
  const existingVaultRows = [{ niche_id: 'vault-niche-two', selected_at: '2026-01-01', staleness_flag: 'FALSE' }];
  const vwPlan = planVaultAndWatchlist(mixedCandidates, existingVaultRows, [], today);
  assert(vwPlan.vault.toAppend.length === 1 && vwPlan.vault.toAppend[0].niche_label === 'Vault Niche One', 'vault tab dedups against its own existing rows');
  assert(vwPlan.vault.skippedDupes === 1, 'vault tab skips its own dupe');
  assert(vwPlan.watchlist.toAppend.length === 1 && vwPlan.watchlist.toAppend[0].niche_label === 'Watchlist Niche One', 'watchlist candidate lands on the watchlist tab');
  assert(vwPlan.watchlist.skippedDupes === 0, 'watchlist tab has its own (empty) dedup set');
  assert(vwPlan.vault.toAppend.every((r) => r.band === 'vault'), 'no watchlist rows leak into the vault plan');
  assert(vwPlan.watchlist.toAppend.every((r) => r.band === 'watchlist'), 'no vault rows leak into the watchlist plan');

  // planVaultAndWatchlist: each tab gets its own soft cap
  const manyVault = Array.from({ length: 55 }, (_, i) => ({
    niche_label: `Vault Niche ${i}`,
    band: 'vault',
    opportunity_tier: 'C',
    monthly_revenue_low: 2000 - i,
  }));
  const fewWatchlist = Array.from({ length: 3 }, (_, i) => ({
    niche_label: `Watchlist Niche ${i}`,
    band: 'watchlist',
    opportunity_tier: '',
    monthly_revenue_low: 100 - i,
  }));
  const capSplit = planVaultAndWatchlist([...manyVault, ...fewWatchlist], [], [], today);
  assert(capSplit.vault.toAppend.length === SOFT_CAP_PER_RUN, 'vault tab keeps its own 50-row soft cap');
  assert(capSplit.vault.overflow.length === 5, 'vault tab overflow unaffected by watchlist volume');
  assert(capSplit.watchlist.toAppend.length === 3 && capSplit.watchlist.overflow.length === 0, 'watchlist tab has its own cap, unaffected by vault volume');

  // CSV fallback round trip
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'vault-fallback-'));
  try {
    const fbPath = writeFallback(capResult.toAppend.slice(0, 3), tmpDir, today);
    assert(fs.existsSync(fbPath), 'fallback CSV written');

    const pending = readPendingFallbacks(tmpDir);
    assert(pending.length === 1 && pending[0].rows.length === 3, 'fallback CSV read back with 3 rows');
    assert(pending[0].rows[0].niche_id === capResult.toAppend[0].niche_id, 'fallback row data matches');

    markFallbackMerged(pending[0].filePath);
    assert(fs.existsSync(`${fbPath}.merged`), 'fallback renamed to .merged, not deleted');
    assert(readPendingFallbacks(tmpDir).length === 0, 'merged fallback no longer pending');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log('vault_write.js self-test: all checks passed');
}

if (require.main === module) {
  selfTest();
}
