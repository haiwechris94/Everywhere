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

// Convertit un hex #rrggbb en « rgba(r,g,b,alpha) » pour les teintes/translucides.
export function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return `rgba(148,163,184,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
