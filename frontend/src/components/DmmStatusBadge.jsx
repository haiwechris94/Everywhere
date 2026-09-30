/**
 * Composants d'affichage du statut DMM d'un engagement, avec les couleurs
 * imposées (Mouvement=vert foncé, Point de Basculement=vert clair,
 * Mi-parcours=jaune, Pionnier=orange). La règle d'étape suit le tableau DMM
 * (nombre d'églises) — voir utils/dmmEngagement.js.
 */
import { dmmEngagementDisplay } from '../utils/dmmEngagement'
import { useLanguage } from '../i18n'

/**
 * Pastille colorée du statut DMM d'un engagement.
 * @param {{ engagement: object, className?: string }} props
 *   engagement : objet portant numberOfChurches / engagementStatus.
 */
export function DmmStatusBadge({ engagement, className = '' }) {
  const { isFrench } = useLanguage()
  const { label, colors } = dmmEngagementDisplay(engagement, isFrench)
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${colors.badge} ${className}`}
    >
      <span className="inline-block h-2 w-2 rounded-full bg-current opacity-70" />
      {label}
    </span>
  )
}

/**
 * Point coloré (dot) seul du statut DMM, à côté d'un texte libre.
 * @param {{ engagement: object, showLabel?: boolean, className?: string }} props
 */
export function DmmStatusDot({ engagement, showLabel = true, className = '' }) {
  const { isFrench } = useLanguage()
  const { label, colors } = dmmEngagementDisplay(engagement, isFrench)
  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${colors.dot}`} />
      {showLabel && <span className={`text-sm font-medium ${colors.text}`}>{label}</span>}
    </span>
  )
}

export default DmmStatusBadge
