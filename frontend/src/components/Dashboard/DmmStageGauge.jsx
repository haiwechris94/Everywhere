/**
 * DmmStageGauge.jsx
 *
 * Carte « jauge DMM » réutilisable : résume une liste d'engagements DMM par
 * leur ÉTAPE DMM (PAS l'échelle Joshua Project). Elle reproduit visuellement la
 * carte-jauge de la feuille d'engagement (StatusHeroCard / StatusGauge).
 *
 * L'étape d'un engagement suit la MÊME logique que DmmProgressTable :
 *   churches = e.totalChurches ?? e.numberOfChurches ?? 0
 *   stage    = dmmStageFromChurches(churches)
 *              || normalizeDmmStage(e.dmmStatus)
 *              || normalizeDmmStage(e.engagementStatus)
 *              || null
 *
 * La jauge et le grand libellé sont pilotés UNIQUEMENT par les données d'étape
 * DMM (jamais par jpScale).
 */
import { useState } from 'react'
import {
  DMM_STAGE,
  DMM_STAGE_LABEL_FR,
  DMM_STAGE_LABEL_EN,
  DMM_STAGE_COLORS,
  dmmStageFromChurches,
  normalizeDmmStage,
} from '../../utils/dmmEngagement'

// Rang de chaque étape (Pionnier = 1 … Mouvement = 4) pour calculer un progrès
// agrégé et départager les égalités (étape la plus avancée gagne).
const STAGE_RANK = {
  [DMM_STAGE.PIONEER]: 1,
  [DMM_STAGE.MIDWAY]: 2,
  [DMM_STAGE.TIPPING_POINT]: 3,
  [DMM_STAGE.MOVEMENT]: 4,
}

// Ordre de la légende : du plus avancé au moins avancé.
const LEGEND_ORDER = [
  DMM_STAGE.MOVEMENT,
  DMM_STAGE.TIPPING_POINT,
  DMM_STAGE.MIDWAY,
  DMM_STAGE.PIONEER,
]

// Étape DMM d'un engagement — même logique que DmmProgressTable.
const stageForEngagement = (e = {}) => {
  const churches = e.totalChurches ?? e.numberOfChurches ?? 0
  return (
    dmmStageFromChurches(churches) ||
    normalizeDmmStage(e.dmmStatus) ||
    normalizeDmmStage(e.engagementStatus) ||
    null
  )
}

/**
 * @param {Array}   engagements  liste d'engagements DMM
 * @param {boolean} isFrench
 * @param {string}  title
 */
const DmmStageGauge = ({ engagements = [], isFrench = true, title }) => {
  // Valeur affichée au centre de la jauge :
  //  - 'dominant' : progrès de l'ÉTAPE DOMINANTE (rang/4) ;
  //  - 'weighted' : MOYENNE PONDÉRÉE des rangs de tous les engagements (rang moyen/4).
  // Le choix est mémorisé dans le localStorage pour être conservé entre les visites.
  const CENTER_MODE_KEY = 'dmmStageGauge.centerMode'
  const [centerMode, setCenterModeState] = useState(() => {
    try {
      const saved = window.localStorage.getItem(CENTER_MODE_KEY)
      return saved === 'weighted' || saved === 'dominant' ? saved : 'dominant'
    } catch {
      return 'dominant'
    }
  })
  const setCenterMode = (mode) => {
    setCenterModeState(mode)
    try {
      window.localStorage.setItem(CENTER_MODE_KEY, mode)
    } catch {
      /* localStorage indisponible (mode privé, quota) — on ignore. */
    }
  }

  // Comptage par étape + somme des rangs.
  const tally = {
    [DMM_STAGE.MOVEMENT]: 0,
    [DMM_STAGE.TIPPING_POINT]: 0,
    [DMM_STAGE.MIDWAY]: 0,
    [DMM_STAGE.PIONEER]: 0,
  }
  let countWithStage = 0
  let rankSum = 0
  engagements.forEach((e) => {
    const stage = stageForEngagement(e)
    if (!stage || !(stage in tally)) return
    tally[stage] += 1
    countWithStage += 1
    rankSum += STAGE_RANK[stage] || 0
  })

  // Progrès agrégé : moyenne des rangs ramenée sur [0..1] (4 = max).
  const progress =
    countWithStage > 0
      ? Math.max(0, Math.min(1, rankSum / (4 * countWithStage)))
      : 0

  // Étape dominante = plus grand compte ; égalité → étape la plus avancée.
  let dominantStage = null
  LEGEND_ORDER.forEach((stage) => {
    if (tally[stage] <= 0) return
    if (
      dominantStage === null ||
      tally[stage] > tally[dominantStage] ||
      (tally[stage] === tally[dominantStage] &&
        (STAGE_RANK[stage] || 0) > (STAGE_RANK[dominantStage] || 0))
    ) {
      dominantStage = stage
    }
  })

  const stageLabels = isFrench ? DMM_STAGE_LABEL_FR : DMM_STAGE_LABEL_EN
  const dominantColor = dominantStage
    ? DMM_STAGE_COLORS[dominantStage]?.hex || '#94a3b8'
    : '#94a3b8'
  const dominantLabel = dominantStage ? stageLabels[dominantStage] : '—'

  // Progrès de l'étape dominante (rang/4) — distinct de la moyenne pondérée.
  const dominantProgress = dominantStage
    ? Math.max(0, Math.min(1, (STAGE_RANK[dominantStage] || 0) / 4))
    : 0

  // Valeur et couleur retenues selon le mode de la bascule.
  const displayProgress = centerMode === 'weighted' ? progress : dominantProgress
  const displayColor = centerMode === 'weighted' ? '#0C6A85' : dominantColor
  const centerSubLabel =
    centerMode === 'weighted'
      ? (isFrench ? 'Moyenne pondérée' : 'Weighted average')
      : (isFrench ? 'Stade dominant' : 'Dominant stage')

  const heading = title || (isFrench ? 'Progression DMM' : 'DMM progression')

  // Jauge circulaire SVG (inspirée de StatusGauge).
  const size = 140
  const stroke = 12
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(1, displayProgress)) * c

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3 className="text-base font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-100">
          {heading}
        </h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {countWithStage} {isFrench ? 'engagements' : 'engagements'}
        </span>
      </div>

      {/* Bascule : valeur centrale = étape dominante ou moyenne pondérée. */}
      <div className="mb-4 inline-flex self-start rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
        <button
          type="button"
          onClick={() => setCenterMode('dominant')}
          aria-pressed={centerMode === 'dominant'}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${centerMode === 'dominant' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300'}`}
        >
          {isFrench ? 'Stade dominant' : 'Dominant stage'}
        </button>
        <button
          type="button"
          onClick={() => setCenterMode('weighted')}
          aria-pressed={centerMode === 'weighted'}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${centerMode === 'weighted' ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300'}`}
        >
          {isFrench ? 'Moyenne pondérée' : 'Weighted average'}
        </button>
      </div>

      {/* Jauge circulaire centrée. */}
      <div className="flex flex-col items-center justify-center flex-1">
        <div className="relative" style={{ width: size, height: size }}>
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={`DMM ${Math.round(displayProgress * 100)}%`}
          >
            {/* Piste de fond translucide. */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke="rgba(148,163,184,0.25)"
              strokeWidth={stroke}
            />
            {/* Arc de progression dans la couleur de l'étape dominante. */}
            <circle
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={displayColor}
              strokeWidth={stroke}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${c - dash}`}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          </svg>
          {/* Pourcentage au centre. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
            <span className="text-2xl font-bold text-slate-800 dark:text-slate-100">
              {Math.round(displayProgress * 100)}%
            </span>
            <span className="mt-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {centerSubLabel}
            </span>
          </div>
        </div>

        {/* Grand libellé de l'étape dominante. */}
        <div className="mt-4 text-center">
          <div className="text-2xl font-bold" style={{ color: dominantColor }}>
            {dominantLabel}
          </div>
          <div className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {isFrench ? 'Stade DMM dominant' : 'Dominant DMM stage'}
          </div>
        </div>
      </div>

      {/* Légende compacte : 4 étapes avec point coloré + compte. */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
        {LEGEND_ORDER.map((stage) => (
          <div key={stage} className="flex items-center gap-2">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: DMM_STAGE_COLORS[stage]?.hex || '#94a3b8' }}
            />
            <span className="text-sm text-slate-600 dark:text-slate-300">
              {stageLabels[stage]}
            </span>
            <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {tally[stage]}
            </span>
          </div>
        ))}
      </div>

      {/* Comparaison : valeur de l'AUTRE mode (non sélectionné), en petit. */}
      {countWithStage > 0 && (
        <div className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
          {centerMode === 'weighted'
            ? (isFrench
                ? `Stade dominant : ${Math.round(dominantProgress * 100)}% (${dominantLabel})`
                : `Dominant stage: ${Math.round(dominantProgress * 100)}% (${dominantLabel})`)
            : (isFrench
                ? `Moyenne pondérée : ${Math.round(progress * 100)}%`
                : `Weighted average: ${Math.round(progress * 100)}%`)}
        </div>
      )}
    </section>
  )
}

export default DmmStageGauge
