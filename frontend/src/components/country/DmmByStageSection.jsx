import {
  DMM_STAGE,
  DMM_STAGE_LABEL_FR,
  DMM_STAGE_LABEL_EN,
  DMM_STAGE_COLORS,
  dmmStageFromChurches,
  normalizeDmmStage,
} from '../../utils/dmmEngagement'

/**
 * DmmByStageSection — répartition des engagements DMM par ÉTAPE
 * (Mouvement · Point de Basculement · Mi-parcours · Pionnier), avec barres
 * proportionnelles. Conçu pour s'afficher à droite du tableau
 * « #people groups by stages & levels ».
 */

const STAGE_ORDER = [DMM_STAGE.MOVEMENT, DMM_STAGE.TIPPING_POINT, DMM_STAGE.MIDWAY, DMM_STAGE.PIONEER]

// Étape d'un engagement : priorité au nombre d'églises (règle du tableau DMM),
// repli sur le statut textuel.
const resolveStage = (e = {}) => {
  const churches = e.totalChurches ?? e.numberOfChurches ?? 0
  return (
    dmmStageFromChurches(churches) ||
    normalizeDmmStage(e.dmmStatus) ||
    normalizeDmmStage(e.engagementStatus) ||
    null
  )
}

export default function DmmByStageSection({ engagements = [], isFrench = true }) {
  const counts = {
    [DMM_STAGE.MOVEMENT]: 0,
    [DMM_STAGE.TIPPING_POINT]: 0,
    [DMM_STAGE.MIDWAY]: 0,
    [DMM_STAGE.PIONEER]: 0,
  }
  ;(engagements || []).forEach((e) => {
    const s = resolveStage(e)
    if (s && counts[s] != null) counts[s] += 1
  })

  const total = STAGE_ORDER.reduce((acc, s) => acc + counts[s], 0)
  const max = Math.max(1, ...STAGE_ORDER.map((s) => counts[s]))
  const labels = isFrench ? DMM_STAGE_LABEL_FR : DMM_STAGE_LABEL_EN

  return (
    <section className="rounded-[20px] border border-[#DCE6F5] bg-white p-6 shadow-[0_4px_20px_rgba(30,60,120,0.06)] dark:bg-slate-800">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold uppercase tracking-wide text-[#0F2A5C]">
          {isFrench ? 'DMM par étape' : 'DMM by stage'}
        </h3>
        <span className="text-sm text-[#6B7A99]">
          {total} {isFrench ? 'engagements' : 'engagements'}
        </span>
      </div>

      {total === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-[14px] bg-[#F5F8FD] text-sm text-[#6B7A99]">
          {isFrench ? 'Aucun engagement DMM pour ce pays.' : 'No DMM engagement for this country.'}
        </div>
      ) : (
        <ul className="space-y-3">
          {STAGE_ORDER.map((s) => {
            const color = DMM_STAGE_COLORS[s]?.hex || '#94a3b8'
            const n = counts[s]
            const pct = Math.round((n / max) * 100)
            return (
              <li key={s}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-[#0F2A5C]">
                    <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
                    {labels[s]}
                  </span>
                  <span className="tabular-nums font-bold text-[#0F2A5C]">{n}</span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-[#EEF3FB]">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
