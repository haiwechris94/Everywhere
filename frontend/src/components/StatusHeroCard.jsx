import { Target, Users, AlertTriangle } from 'lucide-react'
import { jpStageFor, evangelicalRangeFor } from '../utils/joshuaProjectScales'
import { statusHexFor, hexToRgba } from '../utils/statusColors'

// ── Jauge circulaire (SVG) de la carte « Statut » ───────────────────────────
// Piste blanche translucide + arc de progression (jpScale / 5) plus clair, avec
// un disque blanc au centre portant une icône « groupe de personnes » colorée.
export function StatusGauge({ progress, statusHex }) {
  const size = 92
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(1, progress || 0)) * c
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`Joshua Project ${Math.round((progress || 0) * 100)}%`}
    >
      {/* Piste de fond translucide. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={stroke}
      />
      {/* Arc de progression (blanc plus clair). */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {/* Disque blanc central + icône groupe. */}
      <circle cx={size / 2} cy={size / 2} r={r - stroke - 4} fill="#ffffff" />
      <g transform={`translate(${size / 2 - 9}, ${size / 2 - 9})`} style={{ color: statusHex }}>
        {/* Icône « group of people » (contour simple, 18x18). */}
        <path
          d="M6 8a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 6 8Zm6 0a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 12 8ZM2 15c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6M10 15c0-2.2 1.8-3.6 4-3.6s2 .6 2.6 1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

/**
 * Carte HERO « Statut » réutilisable : dégradé couleur-statut, libellé
 * STATUT/STATUS, pastille + grand statut, ligne descriptive de l'échelle JP,
 * jauge circulaire (progress = jpScale/5), et panneau blanc 3 stats
 * (Évangéliques / Échelle JP / Moins atteint) chevauchant le bas du dégradé.
 *
 * Le statut affiché est le statut Joshua Project : si `jpStage`/`status` n'est
 * pas fourni, il est dérivé de `jpScale` via jpStageFor. Les champs absents
 * retombent gracieusement sur « — » (ou la fourchette JP officielle pour le %).
 *
 * Props :
 *  - status       : libellé de statut explicite (repli si pas de jpStage/jpScale)
 *  - jpScale      : échelle JP 1–5 (number|string|null)
 *  - jpStage      : libellé du stage JP (facultatif ; sinon dérivé de jpScale)
 *  - description  : ligne descriptive sous le statut (facultatif ; sinon dérivée)
 *  - evangelical  : % évangéliques précis (string|number|null ; sinon fourchette JP)
 *  - leastReached : booléen|null (peuple moins atteint)
 *  - isFrench     : bascule i18n FR/EN
 *  - className    : classes supplémentaires sur le conteneur externe
 */
export default function StatusHeroCard({
  status = null,
  jpScale = null,
  jpStage = null,
  description = null,
  evangelical = null,
  leastReached = null,
  isFrench = false,
  className = '',
}) {
  const dash = '—'
  const jpStageResolved = jpStage || jpStageFor(jpScale)
  // Statut du peuple = statut Joshua Project ; repli sur `status` fourni.
  const displayStatus = jpStageResolved || status || null
  const statusHex = statusHexFor(displayStatus)
  const statusGradient = `linear-gradient(90deg, ${statusHex} 0%, ${hexToRgba(statusHex, 0.82)} 100%)`

  // Progression de la jauge (jpScale / 5), bornée [0,1].
  const gaugeProgress = jpScale != null ? Math.min(1, Math.max(0, Number(jpScale) / 5)) : 0

  // Description lisible du JPScale (« 5 — Significantly reached »), repli dérivé.
  const descriptionResolved =
    description ||
    (jpStageResolved
      ? `${jpScale ?? ''}${jpScale != null ? ' — ' : ''}${jpStageResolved}`
      : null)

  // % évangéliques : valeur précise sinon fourchette officielle liée au JPScale.
  const evangelicalDisplay =
    evangelical != null
      ? (typeof evangelical === 'number' ? `${evangelical}%` : String(evangelical))
      : evangelicalRangeFor(jpScale) || dash

  const jpScaleDisplay = jpScale != null ? String(jpScale) : dash
  const leastReachedDisplay =
    leastReached == null
      ? dash
      : leastReached
        ? (isFrench ? 'Oui' : 'Yes')
        : (isFrench ? 'Non' : 'No')

  return (
    <div
      className={`relative rounded-[20px] p-6 pb-24 text-white ${className}`}
      style={{ background: statusGradient, boxShadow: `0 10px 30px ${hexToRgba(statusHex, 0.35)}` }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
            <Target className="h-3.5 w-3.5" aria-hidden="true" />
            {isFrench ? 'Statut' : 'Status'}
          </p>
          <div className="mt-3 flex items-center gap-3">
            <span
              className="inline-block h-4 w-4 rounded-full ring-2 ring-white shrink-0"
              style={{ backgroundColor: hexToRgba('#ffffff', 0.9) }}
              aria-hidden="true"
            />
            <span className="text-[40px] leading-none font-bold text-white">{displayStatus || dash}</span>
          </div>
          {descriptionResolved && (
            <p className="mt-2 text-sm font-semibold text-white/90">{descriptionResolved}</p>
          )}
        </div>

        {/* Jauge circulaire (SVG) : piste translucide + arc de progression. */}
        <StatusGauge progress={gaugeProgress} statusHex={statusHex} />
      </div>

      {/* Panneau blanc en bas, chevauchant le dégradé, 3 colonnes. */}
      <div className="absolute left-6 right-6 -bottom-10 rounded-2xl bg-white border border-slate-200 shadow-md">
        <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
          <div className="px-3 py-4">
            <Users className="mx-auto h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
            <p className="mt-1 font-bold text-slate-900">{evangelicalDisplay}</p>
            <p className="text-[11px] text-slate-500">{isFrench ? 'Évangéliques' : 'Evangelical'}</p>
          </div>
          <div className="px-3 py-4">
            <Target className="mx-auto h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
            <p className="mt-1 font-bold text-slate-900">{jpScaleDisplay}</p>
            <p className="text-[11px] text-slate-500">{isFrench ? 'Échelle JP' : 'JP Scale'}</p>
          </div>
          <div className="px-3 py-4">
            <AlertTriangle className="mx-auto h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
            <p className="mt-1 font-bold text-slate-900">{leastReachedDisplay}</p>
            <p className="text-[11px] text-slate-500">{isFrench ? 'Moins atteint' : 'Least Reached'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
