/**
 * Joshua Project reference scales (backend / CommonJS mirror of
 * frontend/src/utils/joshuaProjectScales.js).
 *
 * Derived from backend/data/AllProgressLevelsListing.csv:
 *  - JPScale (1–5)                    → JPStage (progress-level label)
 *  - JPScale (1–5)                    → PctEvangelicalRange
 *  - Bible Translation status (0–5)   → meaning
 *
 * The CSV also lists the half-levels 0.1 (Frontier) and 0.5 (non-Frontier);
 * application data stores JPScale as an integer 1–5, so both cases are covered.
 */

// JPScale → { stage, evangelical }
const JP_SCALE_TABLE = {
  '0.1': { stage: 'Unreached (Frontier)', evangelical: 'Évangéliques ≤ 0,1 %' },
  '0.5': { stage: 'Unreached (non-Frontier)', evangelical: 'Évangéliques > 0,1 % et ≤ 2 %' },
  '1': { stage: 'Unreached (All)', evangelical: 'Évangéliques ≤ 2 %' },
  '2': { stage: 'Minimally reached', evangelical: 'Évangéliques ≤ 2 %' },
  '3': { stage: 'Superficially reached', evangelical: 'Évangéliques ≤ 2 %' },
  '4': { stage: 'Partially reached', evangelical: 'Évangéliques > 2 % et ≤ 10 %' },
  '5': { stage: 'Significantly reached', evangelical: 'Évangéliques > 10 %' },
};

// Bible Translation status (code) → meaning
const BIBLE_STATUS_TABLE = {
  '0': 'Unspecified',
  '1': 'Translation Needed',
  '2': 'Translation Started',
  '3': 'Portions',
  '4': 'New Testament',
  '5': 'Complete Bible',
};

// Normalise a JPScale (number|string) to a table key ('1'..'5' or '0.1'/'0.5').
function normalizeScaleKey(jpScale) {
  if (jpScale === null || jpScale === undefined || jpScale === '') return null;
  const raw = String(jpScale).trim();
  if (JP_SCALE_TABLE[raw]) return raw;
  const asInt = String(parseInt(raw, 10));
  if (JP_SCALE_TABLE[asInt]) return asInt;
  return null;
}

/** JPStage label for a JPScale, or null when unknown. */
function jpStageFor(jpScale) {
  const key = normalizeScaleKey(jpScale);
  return key ? JP_SCALE_TABLE[key].stage : null;
}

/** PctEvangelicalRange for a JPScale, or null. */
function evangelicalRangeFor(jpScale) {
  const key = normalizeScaleKey(jpScale);
  return key ? JP_SCALE_TABLE[key].evangelical : null;
}

/**
 * "<scale> — <stage>" convenience string for a JPScale (e.g. "1 — Unreached (All)"),
 * or null when the scale is unknown/absent.
 */
function jpScaleDescriptionFor(jpScale) {
  const key = normalizeScaleKey(jpScale);
  if (!key) return null;
  const stage = JP_SCALE_TABLE[key].stage;
  // Keep the raw numeric value when present, else the normalised key.
  const label = jpScale === null || jpScale === undefined || jpScale === '' ? key : String(jpScale).trim();
  return `${label} — ${stage}`;
}

/**
 * "<code> — <meaning>" label for a Bible Translation status (e.g. "4 — New Testament").
 * Returns null when absent; an unlisted value is returned as-is.
 */
function bibleStatusLabel(bibleStatus) {
  if (bibleStatus === null || bibleStatus === undefined || bibleStatus === '') return null;
  const raw = String(bibleStatus).trim();
  const key = String(parseInt(raw, 10));
  const meaning = BIBLE_STATUS_TABLE[key];
  if (!meaning) return raw;
  return `${key} — ${meaning}`;
}

module.exports = {
  JP_SCALE_TABLE,
  BIBLE_STATUS_TABLE,
  jpStageFor,
  evangelicalRangeFor,
  jpScaleDescriptionFor,
  bibleStatusLabel,
};
