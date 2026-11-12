import React from 'react'
import { ExternalLink, Users, Globe, BookOpen } from 'lucide-react'
import { useLanguage } from '../../i18n'

const STATUS_BADGES = {
  'unreached':     { color: 'bg-red-100 text-red-800 border-red-200',          dot: '#dc2626' },
  'pioneer':       { color: 'bg-orange-100 text-orange-800 border-orange-200', dot: '#f97316' },
  'mid-journey':   { color: 'bg-yellow-100 text-yellow-800 border-yellow-200', dot: '#eab308' },
  'tipping-point': { color: 'bg-emerald-100 text-emerald-800 border-emerald-200', dot: '#10b981' },
  'movement':      { color: 'bg-green-100 text-green-800 border-green-200',    dot: '#15803d' },
}

const SOURCE_LABELS = {
  'dmm':            { label: 'DMM',           color: 'bg-primary-50 text-primary-700' },
  'survey':         { label: 'Survey',        color: 'bg-amber-50 text-amber-700' },
  'joshua-project': { label: 'Joshua Project', color: 'bg-indigo-50 text-indigo-700' },
}

/**
 * ModernPopup – Tailwind-styled marker popup.
 * Renders inside a react-leaflet <Popup>.
 *
 * Props:
 *   people: { _id, name, country, region, engagementStatus, status, population,
 *             primaryLanguage, language, primaryReligion, religion, source, dataSource }
 *   onDetailsClick (optional)
 */
const ModernPopup = ({ people = {}, onDetailsClick }) => {
  const { t } = useLanguage()
  const tx = (k, fb) => {
    const v = t(k)
    return v && v !== k ? v : fb
  }

  const status = people.engagementStatus || people.status || 'unreached'
  const source = people.source || people.dataSource || 'dmm'
  const badge = STATUS_BADGES[status] || STATUS_BADGES.unreached
  const sourceBadge = SOURCE_LABELS[source] || SOURCE_LABELS.dmm

  const country = people.country || people.countryName
  const region = people.region || people.adminRegion
  const language = people.primaryLanguage || people.language
  const religion = people.primaryReligion || people.religion
  const population = people.population

  return (
    <div className="modern-popup-content min-w-[230px] max-w-[280px] font-sans">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h3 className="font-bold text-sm text-neutral-900 leading-tight flex-1 dark:text-slate-100">
          {people.name || tx('peopleMap.unnamed', 'Unnamed people')}
        </h3>
        <span
          className={`text-xs font-bold tracking-wider uppercase px-1.5 py-0.5 rounded ${sourceBadge.color}`}
        >
          {sourceBadge.label}
        </span>
      </div>

      {/* Status badge */}
      <div className="mb-2.5">
        <span
          className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${badge.color}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: badge.dot }}
          />
          {tx(`peopleMap.status.${status === 'mid-journey' ? 'midway' : status === 'tipping-point' ? 'tippingPoint' : status === 'movement' ? 'dmm' : status}`, status)}
        </span>
      </div>

      {/* Location */}
      {(country || region) && (
        <div className="text-xs text-neutral-600 mb-2 flex items-center gap-1.5 dark:text-slate-300">
          <Globe size={11} className="text-neutral-500 dark:text-slate-400 flex-shrink-0" />
          <span>
            {[region, country].filter(Boolean).join(', ')}
          </span>
        </div>
      )}

      {/* Stats grid */}
      <div className="space-y-1.5 mb-3">
        {population != null && (
          <div className="flex items-center gap-1.5 text-xs">
            <Users size={11} className="text-neutral-500 dark:text-slate-400 flex-shrink-0" />
            <span className="text-neutral-500">
              {tx('peopleMap.population', 'Population')}:
            </span>
            <span className="font-semibold text-neutral-800 tabular-nums dark:text-slate-100">
              {Number(population).toLocaleString()}
            </span>
          </div>
        )}
        {language && (
          <div className="flex items-center gap-1.5 text-xs">
            <BookOpen size={11} className="text-neutral-500 dark:text-slate-400 flex-shrink-0" />
            <span className="text-neutral-500">
              {tx('peopleMap.language', 'Language')}:
            </span>
            <span className="font-medium text-neutral-700 truncate dark:text-slate-300">{language}</span>
          </div>
        )}
        {religion && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="w-[11px] h-[11px] flex items-center justify-center text-neutral-500 dark:text-slate-400 flex-shrink-0">
              ☪
            </span>
            <span className="text-neutral-500">
              {tx('peopleMap.religion', 'Religion')}:
            </span>
            <span className="font-medium text-neutral-700 truncate dark:text-slate-300">{religion}</span>
          </div>
        )}
      </div>

      {/* Action */}
      {(people._id || people.id) && onDetailsClick && (
        <button
          onClick={() => onDetailsClick(people)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 border border-primary-100 py-1.5 rounded-lg transition-colors dark:bg-primary-900/30 dark:border-primary-800 dark:text-primary-300"
        >
          {tx('peopleMap.viewDetails', 'Voir les détails')}
          <ExternalLink size={11} />
        </button>
      )}
    </div>
  )
}

export default ModernPopup
