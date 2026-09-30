/**
 * DMM engagement status — règles & couleurs.
 *
 * Source des règles : « TABLEAU DMM.docx ». L'étape (statut) d'un engagement est
 * déterminée par son NOMBRE D'ÉGLISES :
 *   - Mouvement           : 100 églises ou plus
 *   - Point de Basculement : 67 à 99 églises
 *   - Mi-parcours          : 34 à 66 églises
 *   - Pionnier             : 1 à 33 églises
 * (Le tableau croise aussi le nombre de générations pour affiner les NIVEAUX
 *  I–IV, mais l'ÉTAPE colorée dépend du nombre d'églises.)
 *
 * Couleurs imposées (indépendantes des couleurs du tableau) :
 *   - Mouvement            = Vert foncé
 *   - Point de Basculement = Vert clair
 *   - Mi-parcours          = Jaune
 *   - Pionnier             = Orange
 */

// Clés canoniques des étapes DMM.
export const DMM_STAGE = {
  MOVEMENT: 'movement',
  TIPPING_POINT: 'tippingpoint',
  MIDWAY: 'midway',
  PIONEER: 'pioneer',
}

// Libellés d'affichage (français) par étape.
export const DMM_STAGE_LABEL_FR = {
  [DMM_STAGE.MOVEMENT]: 'Mouvement',
  [DMM_STAGE.TIPPING_POINT]: 'Point de Basculement',
  [DMM_STAGE.MIDWAY]: 'Mi-parcours',
  [DMM_STAGE.PIONEER]: 'Pionnier',
}

export const DMM_STAGE_LABEL_EN = {
  [DMM_STAGE.MOVEMENT]: 'Movement',
  [DMM_STAGE.TIPPING_POINT]: 'Tipping Point',
  [DMM_STAGE.MIDWAY]: 'Midway',
  [DMM_STAGE.PIONEER]: 'Pioneer',
}

/**
 * Palette imposée par étape. On expose à la fois :
 *  - hex        : couleur brute (points colorés, SVG…)
 *  - dot        : classe Tailwind pour un point coloré
 *  - text       : classe Tailwind pour le texte coloré
 *  - badge      : classes Tailwind fond+texte pour une pastille
 */
export const DMM_STAGE_COLORS = {
  // Vert foncé
  [DMM_STAGE.MOVEMENT]: {
    hex: '#166534',
    dot: 'bg-green-700',
    text: 'text-green-800',
    badge: 'bg-green-700 text-white',
  },
  // Vert clair
  [DMM_STAGE.TIPPING_POINT]: {
    hex: '#86efac',
    dot: 'bg-green-300',
    text: 'text-green-600',
    badge: 'bg-green-100 text-green-700',
  },
  // Jaune
  [DMM_STAGE.MIDWAY]: {
    hex: '#facc15',
    dot: 'bg-yellow-400',
    text: 'text-yellow-600',
    badge: 'bg-yellow-100 text-yellow-700',
  },
  // Orange
  [DMM_STAGE.PIONEER]: {
    hex: '#f97316',
    dot: 'bg-orange-500',
    text: 'text-orange-600',
    badge: 'bg-orange-100 text-orange-700',
  },
}

const NEUTRAL_COLORS = {
  hex: '#94a3b8',
  dot: 'bg-slate-400',
  text: 'text-slate-600',
  badge: 'bg-slate-100 text-slate-600',
}

/**
 * Étape DMM d'un engagement d'après le NOMBRE D'ÉGLISES (règle du tableau DMM).
 * @param {number} numberOfChurches
 * @returns {string|null} une clé DMM_STAGE, ou null si 0 / invalide.
 */
export function dmmStageFromChurches(numberOfChurches) {
  const n = Number(numberOfChurches)
  if (!Number.isFinite(n) || n < 1) return null
  if (n >= 100) return DMM_STAGE.MOVEMENT
  if (n >= 67) return DMM_STAGE.TIPPING_POINT
  if (n >= 34) return DMM_STAGE.MIDWAY
  return DMM_STAGE.PIONEER // 1 à 33
}

/**
 * Normalise un statut d'engagement textuel (pioneer / midway / tipping-point /
 * movement, dans n'importe quelle casse/séparateur) vers une clé DMM_STAGE.
 */
export function normalizeDmmStage(status) {
  const norm = String(status || '').toLowerCase().replace(/[\s_-]+/g, '')
  if (!norm) return null
  if (norm === 'movement' || norm === 'dmm' || norm === 'mouvement') return DMM_STAGE.MOVEMENT
  if (norm === 'tippingpoint' || norm === 'pointdebasculement') return DMM_STAGE.TIPPING_POINT
  if (norm === 'midway' || norm === 'miparcours') return DMM_STAGE.MIDWAY
  if (norm === 'pioneer' || norm === 'pionnier') return DMM_STAGE.PIONEER
  return null
}

/**
 * Étape DMM d'un engagement. On applique EN PRIORITÉ la règle du tableau
 * (nombre d'églises). En repli, on utilise le statut textuel stocké.
 * @param {{ numberOfChurches?: number, engagementStatus?: string }} engagement
 */
export function dmmStageForEngagement(engagement = {}) {
  return (
    dmmStageFromChurches(engagement.numberOfChurches) ||
    normalizeDmmStage(engagement.engagementStatus) ||
    null
  )
}

/**
 * NIVEAU DMM (I–IV) d'un engagement d'après la GÉNÉRATION MAX atteinte, selon
 * le tableau DMM.
 *
 * Étapes standard (Pionnier / Mi-parcours / Point de Basculement) :
 *   1–2 gén → I · 3–4 gén → II · 5–6 gén → III · 7+ gén → IV
 *
 * Mouvement (cas particulier — exige 100+ églises ET au moins 4 générations,
 * donc pas de NIVEAU I) :
 *   4 gén → II · 5–6 gén → III · 7+ gén → IV
 *
 * @param {number} maxGeneration  génération max atteinte par l'engagement
 * @param {string} [stage]        étape DMM (clé DMM_STAGE) pour gérer le cas Mouvement
 * @returns {number|null} 1..4, ou null si aucune génération valide.
 */
export function dmmLevelFromGeneration(maxGeneration, stage = null) {
  const g = Number(maxGeneration)
  if (!Number.isFinite(g) || g < 1) return null

  if (stage === DMM_STAGE.MOVEMENT) {
    // Mouvement : démarre au NIVEAU II (4 générations).
    if (g >= 7) return 4
    if (g >= 5) return 3
    if (g >= 4) return 2
    return 2 // sécurité : un Mouvement a par définition ≥ 4 générations
  }

  if (g >= 7) return 4
  if (g >= 5) return 3
  if (g >= 3) return 2
  return 1 // 1 ou 2 générations
}

// Chiffres romains pour l'affichage des niveaux.
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

/** Libellé du niveau DMM, ex. « Niveau III » / « Level III ». Vide si inconnu. */
export function dmmLevelLabel(level, isFrench = true) {
  if (!level || !ROMAN[level]) return isFrench ? '—' : '—'
  return `${isFrench ? 'Niveau' : 'Level'} ${ROMAN[level]}`
}

/** Niveau DMM d'un engagement (à partir de sa génération max et de son étape). */
export function dmmLevelForEngagement(engagement = {}) {
  const stage = dmmStageForEngagement(engagement)
  const gen = engagement.churchGeneration ?? engagement.maxGeneration
  return dmmLevelFromGeneration(gen, stage)
}

/** Libellé d'affichage d'une étape DMM (fr/en). */
export function dmmStageLabel(stage, isFrench = true) {
  if (!stage) return isFrench ? 'Non engagé' : 'Not engaged'
  return (isFrench ? DMM_STAGE_LABEL_FR : DMM_STAGE_LABEL_EN)[stage] || stage
}

/** Couleurs (hex + classes Tailwind) d'une étape DMM. */
export function dmmStageColors(stage) {
  return (stage && DMM_STAGE_COLORS[stage]) || NEUTRAL_COLORS
}

/**
 * Raccourci pratique : à partir d'un engagement, renvoie { stage, label, colors }.
 */
export function dmmEngagementDisplay(engagement = {}, isFrench = true) {
  const stage = dmmStageForEngagement(engagement)
  return {
    stage,
    label: dmmStageLabel(stage, isFrench),
    colors: dmmStageColors(stage),
  }
}
