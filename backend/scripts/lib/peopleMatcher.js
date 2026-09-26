/**
 * peopleMatcher.js — shared matching primitives for the people-graph loaders.
 * =============================================================================
 * Extracted verbatim from buildMasterPeople.js so multiple ingestion scripts
 * (buildMasterPeople.js, ingestDmmPeople.js, …) can share ONE canonical copy of
 * the normalization / similarity / distance / scoring-band helpers and the 0–100
 * confidence scoring constants. Implementations are byte-for-byte identical to the
 * originals — importing them here MUST NOT change any caller's behavior.
 * =============================================================================
 */

'use strict';

// ─────────────────────────────────────────────────────────────────────────────
// SCORING CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

// Confidence bands (Step 3)
const AUTO_MERGE = 90; // 90–100
const MANUAL_LOW = 70; // 70–89 -> MANUAL_REVIEW (still merged, flagged)
const PROX_RADIUS_KM = 25; // Tier-5 geo proximity radius

// Scoring contributions (Step 3.2) — the +25 internal-id contribution is omitted
// for tiers 2–5 (per design: only cross-reference/ROP3/country/name/geo apply here).
const PTS_ROP3_MATCH = 55;
const PTS_ROP3_CONFLICT = -40;
const PTS_COUNTRY_MATCH = 20;
const PTS_COUNTRY_MISMATCH = -15;
const PTS_NAME_HIGH = 15; // sim >= 0.85
const PTS_NAME_MED = 8; // 0.60 <= sim < 0.85
const PTS_GEO = 10;

// ─────────────────────────────────────────────────────────────────────────────
// NORMALIZATION / SIMILARITY / DISTANCE
// ─────────────────────────────────────────────────────────────────────────────

// Normalize a name: lowercase, strip diacritics, collapse non-alphanumerics.
function normName(name) {
  if (!name) return '';
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Trigram-Jaccard similarity over normalized names (application-side pg_trgm analog).
function trigrams(str) {
  const t = `  ${str} `;
  const set = new Set();
  for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
  return set;
}
function trigramSimilarity(a, b) {
  const na = normName(a);
  const nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const ta = trigrams(na);
  const tb = trigrams(nb);
  let inter = 0;
  for (const g of ta) if (tb.has(g)) inter++;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

// Haversine distance in km.
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE → BAND / TIER → NAME
// ─────────────────────────────────────────────────────────────────────────────

function bandFor(score) {
  if (score >= AUTO_MERGE) return 'AUTO_MERGE';
  if (score >= MANUAL_LOW) return 'MANUAL_REVIEW';
  return 'KEEP_SEPARATE';
}

function tierName(tier) {
  switch (tier) {
    case 1:
      return 'CROSS_REFERENCE';
    case 2:
      return 'EXACT_ID';
    case 3:
      return 'COUNTRY';
    case 4:
      return 'NAME_SIMILARITY';
    case 5:
    default:
      return 'GEO_PROXIMITY';
  }
}

module.exports = {
  // constants
  AUTO_MERGE,
  MANUAL_LOW,
  PROX_RADIUS_KM,
  PTS_ROP3_MATCH,
  PTS_ROP3_CONFLICT,
  PTS_COUNTRY_MATCH,
  PTS_COUNTRY_MISMATCH,
  PTS_NAME_HIGH,
  PTS_NAME_MED,
  PTS_GEO,
  // helpers
  normName,
  trigrams,
  trigramSimilarity,
  haversineKm,
  clamp,
  bandFor,
  tierName,
};
