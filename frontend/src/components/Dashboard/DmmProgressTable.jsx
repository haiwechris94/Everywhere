/**
 * DmmProgressTable.jsx
 *
 * Petit tableau DMM coloré (ÉTAPES × NIVEAUX) reproduisant « TABLEAU DMM.docx ».
 *
 * - Lignes (ÉTAPES)  : Mouvement · Point de Basculement · Mi-parcours · Pionnier
 * - Colonnes (NIVEAUX): I · II · III · IV
 * - Chaque cellule affiche le NOMBRE RÉEL d'engagements DMM à cette étape et ce
 *   niveau (ex. « nombre de Pionnier niveau 2 »).
 *
 * Couleurs : celles des statuts d'engagement DMM de la carte Unified Map
 * (STATUS_COLORS_FILL) — PAS les couleurs du document Word.
 *   Mouvement            → #15803d
 *   Point de Basculement → #22c55e
 *   Mi-parcours          → #eab308
 *   Pionnier             → #f97316
 *
 * L'étape est déduite du nombre d'églises et le niveau de la génération max,
 * via les helpers partagés de utils/dmmEngagement (règles du tableau DMM).
 */
import {
  DMM_STAGE,
  DMM_STAGE_LABEL_FR,
  DMM_STAGE_LABEL_EN,
  dmmStageFromChurches,
  normalizeDmmStage,
  dmmLevelFromGeneration,
} from '../../utils/dmmEngagement'

// Couleurs des statuts d'engagement DMM, identiques à Unified Map
// (STATUS_COLORS_FILL). On garde un fond "fill" + un texte lisible.
const STAGE_COLORS = {
  [DMM_STAGE.MOVEMENT]: '#15803d', // Mouvement — vert foncé
  [DMM_STAGE.TIPPING_POINT]: '#22c55e', // Point de Basculement — vert
  [DMM_STAGE.MIDWAY]: '#eab308', // Mi-parcours — jaune
  [DMM_STAGE.PIONEER]: '#f97316', // Pionnier — orange
}

// Ordre d'affichage des lignes (du plus avancé au moins avancé, comme le tableau).
const STAGE_ROWS = [
  DMM_STAGE.MOVEMENT,
  DMM_STAGE.TIPPING_POINT,
  DMM_STAGE.MIDWAY,
  DMM_STAGE.PIONEER,
]

const LEVELS = [1, 2, 3, 4]
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV' }

// Normalise un engagement (venant de /map/dmm-engagements ou de reporting) vers
// l'étape + le niveau DMM. On privilégie le nombre d'églises pour l'étape et la
// génération max pour le niveau (règle du tableau), avec repli sur le statut.
const resolveStageAndLevel = (e = {}) => {
  const churches = e.totalChurches ?? e.numberOfChurches ?? 0
  const gen = e.maxGeneration ?? e.churchGeneration ?? 0
  const stage =
    dmmStageFromChurches(churches) ||
    normalizeDmmStage(e.dmmStatus) ||
    normalizeDmmStage(e.engagementStatus) ||
    null
  const level = dmmLevelFromGeneration(gen, stage)
  return { stage, level }
}

/**
 * @param {Array}  engagements  liste d'engagements DMM (un par engagement/village)
 * @param {boolean} isFrench
 * @param {string}  title
 */
const DmmProgressTable = ({ engagements = [], isFrench = true, title }) => {
  // Comptage réel par (étape, niveau).
  const counts = {}
  let total = 0
  STAGE_ROWS.forEach((s) => { counts[s] = { 1: 0, 2: 0, 3: 0, 4: 0, _total: 0 } })
  engagements.forEach((e) => {
    const { stage, level } = resolveStageAndLevel(e)
    if (!stage || !counts[stage] || !level) return
    counts[stage][level] += 1
    counts[stage]._total += 1
    total += 1
  })

  const stageLabels = isFrench ? DMM_STAGE_LABEL_FR : DMM_STAGE_LABEL_EN
  const heading = title || (isFrench ? 'Tableau DMM — Engagements par étape et niveau' : 'DMM table — Engagements by stage and level')

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:bg-slate-900/60 dark:border-white/10">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-base font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-100">{heading}</h3>
        <span className="text-sm text-slate-400">
          {total} {isFrench ? 'engagements' : 'engagements'}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="py-2 px-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                {isFrench ? 'Étapes' : 'Stages'}
              </th>
              {LEVELS.map((lvl) => (
                <th key={lvl} className="py-2 px-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                  {isFrench ? 'Niveau' : 'Level'} {ROMAN[lvl]}
                </th>
              ))}
              <th className="py-2 px-3 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 border-b border-slate-200">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {STAGE_ROWS.map((stage) => {
              const color = STAGE_COLORS[stage]
              return (
                <tr key={stage}>
                  {/* Cellule d'étape : fond coloré au statut DMM de la carte. */}
                  <td
                    className="py-2.5 px-3 font-semibold text-white rounded-l-lg"
                    style={{ backgroundColor: color }}
                  >
                    {stageLabels[stage]}
                  </td>
                  {LEVELS.map((lvl) => {
                    const value = counts[stage][lvl]
                    return (
                      <td key={lvl} className="py-1.5 px-1.5 text-center">
                        <div
                          className="mx-auto flex h-12 min-w-[3rem] items-center justify-center rounded-lg text-base font-bold tabular-nums"
                          style={{
                            // Teinte légère de la couleur d'étape pour la cellule,
                            // chiffre lisible dans la couleur d'étape pleine.
                            backgroundColor: value > 0 ? `${color}22` : 'transparent',
                            color: value > 0 ? color : '#cbd5e1',
                            border: `1px solid ${value > 0 ? color : '#e2e8f0'}`,
                          }}
                        >
                          {value}
                        </div>
                      </td>
                    )
                  })}
                  <td className="py-1.5 px-1.5 text-center">
                    <div
                      className="mx-auto flex h-12 min-w-[3rem] items-center justify-center rounded-lg text-base font-black tabular-nums text-white"
                      style={{ backgroundColor: color }}
                    >
                      {counts[stage]._total}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default DmmProgressTable
