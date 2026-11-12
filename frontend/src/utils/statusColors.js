/**
 * Palette de statut canonique partagée + helpers de dérivation couleur.
 *
 * Hex alignés sur STATUS_COLORS / STATUS_COLORS_FILL de UnifiedMapView.jsx.
 * On mappe un statut (JP stage, DMM status, status.global) vers l'un de ces
 * tons de base, puis on en dérive les teintes claires / translucides.
 *
 * Source de vérité unique réutilisée par StatusHeroCard et les fiches
 * (PeopleDetailLite, PeopleGroupDetail, InitiativePeopleDetail, EngagementDetail).
 */

export const STATUS_HEX = {
  movement: '#15803d',      // Movement / reached (vert foncé)
  reached: '#15803d',
  tippingpoint: '#22c55e',  // Basculement (vert)
  midway: '#eab308',        // Mi-parcours (jaune)
  pioneer: '#f97316',       // Pionnier / frontier (orange)
  frontier: '#f97316',
  unreached: '#ef4444',     // Non-atteint (rouge)
  unknown: '#9ca3af',       // Inconnu / sans info (gris)
  noinfo: '#9ca3af',
}

// Normalise un libellé de statut (JP stage, DMM, status.global) vers une clé
// de STATUS_HEX. Couvre les libellés JP (« Significantly reached », « Unreached
// (Frontier) », « Partially reached », …) et le vocabulaire DMM.
export function statusKeyFor(status) {
  const raw = String(status || '').toLowerCase()
  const norm = raw.replace(/[\s_()-]+/g, '')
  if (STATUS_HEX[norm]) return norm
  if (norm.includes('frontier') || norm.includes('pioneer')) return 'pioneer'
  if (norm.includes('tipping')) return 'tippingpoint'
  if (norm.includes('midway') || norm.includes('minimallyreached')) return 'midway'
  if (
    norm.includes('significantlyreached') ||
    norm.includes('partiallyreached') ||
    norm.includes('movement') ||
    norm.includes('dmm') ||
    (norm.includes('reached') && !norm.includes('unreached'))
  ) {
    return 'movement'
  }
  if (norm.includes('unreached') || norm.includes('unengaged')) return 'unreached'
  return 'unknown'
}

// Hex de base pour un statut. Réutilise la palette canonique ci-dessus.
export function statusHexFor(status) {
  return STATUS_HEX[statusKeyFor(status)] || STATUS_HEX.unknown
}

// ─────────────────────────────────────────────────────────────────────────────
// ÉCHELLE JOSHUA PROJECT (reached-status) — pour les PEUPLES uniquement.
// ─────────────────────────────────────────────────────────────────────────────
// IMPORTANT : ne JAMAIS confondre avec le vocabulaire DMM (Pioneer / Midway /
// Tipping Point / Movement), réservé aux ENGAGEMENTS (voir utils/dmmEngagement.js).
// Un peuple se mesure sur l'échelle d'avancement de Joshua Project :
//   Unreached → Minimally reached → Superficially reached → Partially reached →
//   Significantly reached, avec la nuance Frontier (0.1) pour les non-atteints.
// Les clés canoniques ci-dessous couvrent le barème JP (jpStageFor) ET les codes
// de MasterPeople.status (UNREACHED / FRONTIER / MINIMALLY_REACHED / REACHED).

// Clés canoniques de l'échelle JP.
export const JP_REACHED = {
  UNREACHED: 'unreached',
  FRONTIER: 'frontier',
  MINIMALLY_REACHED: 'minimally_reached',
  SUPERFICIALLY_REACHED: 'superficially_reached',
  PARTIALLY_REACHED: 'partially_reached',
  SIGNIFICANTLY_REACHED: 'significantly_reached',
  REACHED: 'reached',
  UNKNOWN: 'unknown',
}

// Couleurs de l'échelle JP (dégradé rouge → vert selon l'avancement). Distinctes
// des couleurs DMM : ici le vert foncé = « Significantly reached », pas DMM.
export const JP_REACHED_HEX = {
  [JP_REACHED.UNREACHED]: '#ef4444',               // rouge
  [JP_REACHED.FRONTIER]: '#b91c1c',                // rouge foncé (frontier = le moins atteint)
  [JP_REACHED.MINIMALLY_REACHED]: '#f97316',       // orange
  [JP_REACHED.SUPERFICIALLY_REACHED]: '#eab308',   // jaune
  [JP_REACHED.PARTIALLY_REACHED]: '#84cc16',       // vert-jaune
  [JP_REACHED.SIGNIFICANTLY_REACHED]: '#15803d',   // vert foncé
  [JP_REACHED.REACHED]: '#15803d',                 // vert foncé
  [JP_REACHED.UNKNOWN]: '#9ca3af',                 // gris
}

// Libellés affichables de l'échelle JP (FR / EN).
export const JP_REACHED_LABEL = {
  [JP_REACHED.UNREACHED]: { fr: 'Non atteint', en: 'Unreached' },
  [JP_REACHED.FRONTIER]: { fr: 'Non atteint (Frontier)', en: 'Unreached (Frontier)' },
  [JP_REACHED.MINIMALLY_REACHED]: { fr: 'Faiblement atteint', en: 'Minimally reached' },
  [JP_REACHED.SUPERFICIALLY_REACHED]: { fr: 'Superficiellement atteint', en: 'Superficially reached' },
  [JP_REACHED.PARTIALLY_REACHED]: { fr: 'Partiellement atteint', en: 'Partially reached' },
  [JP_REACHED.SIGNIFICANTLY_REACHED]: { fr: 'Significativement atteint', en: 'Significantly reached' },
  [JP_REACHED.REACHED]: { fr: 'Atteint', en: 'Reached' },
  [JP_REACHED.UNKNOWN]: { fr: 'Inconnu', en: 'Unknown' },
}

// Normalise un statut JP (libellé de barème JP, OU code MasterPeople.status) vers
// une clé JP_REACHED. NE fait AUCun repli vers le vocabulaire DMM.
export function jpReachedKeyFor(status) {
  const norm = String(status || '').toLowerCase().replace(/[\s_()-]+/g, '')
  if (!norm) return JP_REACHED.UNKNOWN
  // Frontier d'abord (c'est une nuance d'« unreached »).
  if (norm.includes('frontier')) return JP_REACHED.FRONTIER
  if (norm.includes('unreached') || norm.includes('unengaged')) return JP_REACHED.UNREACHED
  if (norm.includes('minimallyreached')) return JP_REACHED.MINIMALLY_REACHED
  if (norm.includes('superficiallyreached')) return JP_REACHED.SUPERFICIALLY_REACHED
  if (norm.includes('partiallyreached')) return JP_REACHED.PARTIALLY_REACHED
  if (norm.includes('significantlyreached')) return JP_REACHED.SIGNIFICANTLY_REACHED
  // Code générique MasterPeople.status = 'REACHED' ou libellé « reached ».
  if (norm.includes('reached')) return JP_REACHED.REACHED
  return JP_REACHED.UNKNOWN
}

// Hex JP pour un statut de peuple.
export function jpReachedHexFor(status) {
  return JP_REACHED_HEX[jpReachedKeyFor(status)] || JP_REACHED_HEX[JP_REACHED.UNKNOWN]
}

// Libellé JP (FR/EN) pour un statut de peuple. Préserve un libellé JP déjà
// humanisé (ex. « Minimally reached » venant de jpStageFor) tel quel.
export function jpReachedLabelFor(status, isFrench = true) {
  const key = jpReachedKeyFor(status)
  if (key === JP_REACHED.UNKNOWN && status) return String(status)
  const entry = JP_REACHED_LABEL[key]
  return isFrench ? entry.fr : entry.en
}

// Convertit un hex #rrggbb en « rgba(r,g,b,alpha) » pour les teintes/translucides.
export function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return `rgba(148,163,184,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
