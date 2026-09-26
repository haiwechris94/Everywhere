/**
 * Joshua Project reference scales — dérivées de
 * backend/data/AllProgressLevelsListing.csv.
 *
 * Ces tables servent à enrichir la fiche des peuples DMM :
 *  - JP Scale (1–5) → JPStage (libellé du niveau d'avancement)
 *  - JP Scale (1–5) → fourchette d'évangéliques (PctEvangelicalRange)
 *  - Bible Translation status (0–5) → signification
 *
 * Remarque : le CSV liste aussi les demi-niveaux 0.1 (Frontier) et 0.5
 * (non-Frontier). Les données applicatives stockent JPScale comme entier
 * 1–5, on couvre donc les deux cas (entier et décimal).
 */

// JPScale → { stage, evangelicalRange }
// Source : lignes "JPScale;JPStage;…;JPScaleEvangelicals" du CSV.
const JP_SCALE_TABLE = {
  '0.1': { stage: 'Unreached (Frontier)', evangelical: 'Évangéliques ≤ 0,1 %' },
  '0.5': { stage: 'Unreached (non-Frontier)', evangelical: 'Évangéliques > 0,1 % et ≤ 2 %' },
  '1': { stage: 'Unreached (All)', evangelical: 'Évangéliques ≤ 2 %' },
  '2': { stage: 'Minimally reached', evangelical: 'Évangéliques ≤ 2 %' },
  '3': { stage: 'Superficially reached', evangelical: 'Évangéliques ≤ 2 %' },
  '4': { stage: 'Partially reached', evangelical: 'Évangéliques > 2 % et ≤ 10 %' },
  '5': { stage: 'Significantly reached', evangelical: 'Évangéliques > 10 %' },
}

// Bible Translation status (code) → signification.
// Source : bloc "Bible Translation status:" du CSV.
const BIBLE_STATUS_TABLE = {
  '0': 'Unspecified',
  '1': 'Translation Needed',
  '2': 'Translation Started',
  '3': 'Portions',
  '4': 'New Testament',
  '5': 'Complete Bible',
}

// Normalise une valeur JPScale (number|string) vers une clé de table ('1'..'5' ou '0.1'/'0.5').
function normalizeScaleKey(jpScale) {
  if (jpScale === null || jpScale === undefined || jpScale === '') return null
  const raw = String(jpScale).trim()
  if (JP_SCALE_TABLE[raw]) return raw
  // Tolère les entiers stockés en number (ex. 1) ou "1.0".
  const asInt = String(parseInt(raw, 10))
  if (JP_SCALE_TABLE[asInt]) return asInt
  return null
}

/** JPStage correspondant à un JPScale, ou null si inconnu. */
export function jpStageFor(jpScale) {
  const key = normalizeScaleKey(jpScale)
  return key ? JP_SCALE_TABLE[key].stage : null
}

/** Fourchette d'évangéliques (PctEvangelicalRange) pour un JPScale, ou null. */
export function evangelicalRangeFor(jpScale) {
  const key = normalizeScaleKey(jpScale)
  return key ? JP_SCALE_TABLE[key].evangelical : null
}

/**
 * Libellé "code — signification" pour un Bible Translation status.
 * Accepte un code (0–5) éventuellement fourni en string. Retourne null si absent.
 */
export function bibleStatusLabel(bibleStatus) {
  if (bibleStatus === null || bibleStatus === undefined || bibleStatus === '') return null
  const raw = String(bibleStatus).trim()
  const key = String(parseInt(raw, 10))
  const meaning = BIBLE_STATUS_TABLE[key]
  if (!meaning) return raw // valeur non répertoriée : on affiche telle quelle
  return `${key} — ${meaning}`
}

export { JP_SCALE_TABLE, BIBLE_STATUS_TABLE }
