/**
 * Shared building blocks for the Geography section.
 * Constant visual language across every level (region / department / subdivision):
 *  - PageHeader : title + breadcrumb + stat cards row
 *  - ChildrenGrid : clickable cards to drill down to the next level
 *  - GeoTabs : [Peuples | Reporting | Couverture] tabs, scoped by a `filter`
 *
 * Everything here is defensive: empty data / network errors render a state
 * message instead of crashing.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useLanguage } from '../../i18n'
import api, { peopleGroupsApi, villagesApi } from '../../services/api'
import {
  Users,
  BarChart3,
  Compass,
  ChevronRight,
  Loader2,
  AlertCircle,
  Inbox,
} from 'lucide-react'

/** Resilient name extractor for administrative items of unknown exact shape. */
export const nameOf = (item) =>
  (item &&
    (item.name ||
      item.NAME_1 ||
      item.NAME_2 ||
      item.NAME_3 ||
      item.label ||
      item.title)) ||
  (typeof item === 'string' ? item : '')

const asArray = (v) => (Array.isArray(v) ? v : [])

/** Small state helpers */
export const StateLoading = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-neutral-500 text-sm">
    <Loader2 size={18} className="animate-spin" />
    {label || 'Chargement…'}
  </div>
)
export const StateError = ({ label }) => (
  <div className="flex items-center justify-center gap-2 py-10 text-red-600 text-sm">
    <AlertCircle size={18} />
    {label || 'Erreur de chargement.'}
  </div>
)
export const StateEmpty = ({ label }) => (
  <div className="flex flex-col items-center justify-center gap-2 py-10 text-neutral-400 text-sm">
    <Inbox size={22} />
    {label || 'Aucune donnée.'}
  </div>
)

export const StatCard = ({ label, value, accent = 'neutral' }) => {
  // Reinforced + colored top border and colored label for the blue/green
  // grouped metric cards. `neutral` keeps the original plain card look.
  const topBorder = {
    neutral: 'border-t border-neutral-200',
    blue: 'border-t-4 border-t-blue-500',
    green: 'border-t-4 border-t-green-500',
    amber: 'border-t-4 border-t-amber-500',
  }
  const labelColor = {
    neutral: 'text-neutral-400',
    blue: 'text-blue-600',
    green: 'text-green-600',
    amber: 'text-amber-600',
  }
  // Fixed, equal width so cards keep the same size even when they wrap to the
  // next line. Reduced padding + font sizes for a more compact card. Numbers
  // are always black regardless of the accent colour.
  return (
    <div
      className={`bg-white rounded-lg border border-neutral-200 ${topBorder[accent] || topBorder.neutral} px-3.5 py-2.5 w-[9.75rem]`}
    >
      <p className={`text-[15px] font-normal leading-tight font-[Arial] ${labelColor[accent] || labelColor.neutral}`}>
        {label}
      </p>
      <p className="text-xl font-bold mt-0.5 text-neutral-900">
        {value ?? '—'}
      </p>
    </div>
  )
}

/**
 * Colored status pill shared across the country/people tables.
 * Handles both the DMM engagement statuses (Pioneer, Midway, Tipping Point,
 * Movement) and the reference/source statuses (UNREACHED, ENGAGED, DMM, …).
 * The match is case- and separator-insensitive ("tipping-point", "Tipping Point",
 * "TIPPING_POINT" all map to the same colour). Unknown values fall back to a
 * neutral grey pill. Any trailing source annotation like " (JP)" is preserved
 * as a muted suffix so nothing is lost from the original text.
 */
export const StatusBadge = ({ status }) => {
  if (status == null || status === '' || status === '—') return <span className="text-neutral-400">—</span>

  const raw = String(status).trim()
  // Split an optional "(SOURCE)" suffix, e.g. "MOVEMENT (JP)".
  const match = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  const main = (match ? match[1] : raw).trim()
  const source = match ? match[2].trim() : null

  const norm = main.toLowerCase().replace(/[\s_-]+/g, '')

  // Ordered so more specific keys win (e.g. "tippingpoint" before "point").
  const palette = {
    pioneer: 'bg-amber-100 text-amber-700',
    midway: 'bg-blue-100 text-blue-700',
    tippingpoint: 'bg-purple-100 text-purple-700',
    movement: 'bg-green-100 text-green-700',
    dmm: 'bg-green-100 text-green-700',
    engaged: 'bg-blue-100 text-blue-700',
    unreached: 'bg-red-100 text-red-700',
    reached: 'bg-green-100 text-green-700',
    unknown: 'bg-slate-100 text-slate-600',
  }
  const cls = palette[norm] || 'bg-slate-100 text-slate-600'

  return (
    <span className="inline-flex items-center gap-1">
      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
        {main}
      </span>
      {source && <span className="text-xs text-slate-400">({source})</span>}
    </span>
  )
}

export const PageHeader = ({ breadcrumb = [], title, subtitle, stats = [] }) => (
  <div className="mb-6">
    {breadcrumb.length > 0 && (
      <nav className="flex items-center gap-1 text-sm text-neutral-400 mb-2 flex-wrap">
        {breadcrumb.map((b, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight size={14} />}
            {b.to ? (
              <Link to={b.to} className="hover:text-neutral-700">
                {b.label}
              </Link>
            ) : (
              <span className="text-neutral-700 font-medium">{b.label}</span>
            )}
          </span>
        ))}
      </nav>
    )}
    <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
    {subtitle && <p className="text-neutral-500 mt-1">{subtitle}</p>}
    {stats.length > 0 && (
      <div className="flex flex-wrap gap-3 mt-4">
        {stats.map((s, i) => (
          <StatCard key={i} label={s.label} value={s.value} accent={s.accent} />
        ))}
      </div>
    )}
  </div>
)

export const ChildrenGrid = ({ title, items, toPath, emptyLabel }) => {
  const list = asArray(items)
  return (
    <div className="mb-8">
      {title && (
        <h2 className="text-sm font-bold text-neutral-700 uppercase tracking-wide mb-3">
          {title} <span className="text-neutral-400">({list.length})</span>
        </h2>
      )}
      {list.length === 0 ? (
        <StateEmpty label={emptyLabel} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {list.map((item, i) => {
            const name = nameOf(item)
            const to = toPath(name)
            const card = (
              <div className="flex items-center justify-between bg-white border border-neutral-200 rounded-lg px-4 py-3 hover:border-neutral-400 hover:bg-neutral-50 transition-colors">
                <span className="text-sm font-bold text-neutral-800 truncate">
                  {name || '—'}
                </span>
                {to && <ChevronRight size={16} className="text-neutral-400 flex-shrink-0" />}
              </div>
            )
            return to ? (
              <Link key={`${name}-${i}`} to={to}>
                {card}
              </Link>
            ) : (
              <div key={`${name}-${i}`}>{card}</div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ------------------------------- Tab panels ------------------------------- */

function PeoplesTab({ filter }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['geo-peoples', filter],
    queryFn: async () => {
      const res = await peopleGroupsApi.getAll({ ...filter, limit: 200 })
      const d = res?.data
      return asArray(d?.data || d?.peopleGroups || d)
    },
  })

  if (isLoading) return <StateLoading label="Chargement des peuples…" />
  if (isError) return <StateError />
  const list = asArray(data)
  if (list.length === 0) return <StateEmpty label="Aucun peuple dans cette zone." />

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-neutral-400 border-b border-neutral-200">
            <th className="py-2 pr-4 font-medium">Peuple</th>
            <th className="py-2 pr-4 font-medium">Statut</th>
            <th className="py-2 pr-4 font-medium">Population</th>
          </tr>
        </thead>
        <tbody>
          {list.map((pg, i) => (
            <tr key={pg._id || i} className="border-b border-neutral-100 hover:bg-neutral-50">
              <td className="py-2 pr-4 font-medium text-neutral-800">
                {pg.name || pg.peopleName || pg.NAME || '—'}
              </td>
              <td className="py-2 pr-4 text-neutral-600">{pg.status || pg.dmmStatus || '—'}</td>
              <td className="py-2 pr-4 text-neutral-600">
                {(pg.population ?? pg.populationTotal ?? '—').toLocaleString?.() ??
                  (pg.population ?? '—')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function CoverageTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['geo-coverage-summary'],
    queryFn: async () => {
      const res = await villagesApi.getStatusSummary()
      return res?.data
    },
  })

  if (isLoading) return <StateLoading label="Chargement de la couverture…" />
  if (isError) return <StateError />

  // The summary shape can vary; render numeric fields defensively.
  const summary = data?.summary || data?.statuses || data?.counts || data || {}
  const entries = Object.entries(summary).filter(
    ([, v]) => typeof v === 'number'
  )

  return (
    <div>
      <div className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2 mb-4">
        Indicateurs de couverture agrégés (village/statut). Le filtrage fin par zone
        administrative sera affiné ultérieurement.
      </div>
      {entries.length === 0 ? (
        <StateEmpty label="Pas de statistiques de couverture disponibles." />
      ) : (
        <div className="flex flex-wrap gap-3">
          {entries.map(([k, v]) => (
            <StatCard key={k} label={k} value={v} accent="blue" />
          ))}
        </div>
      )}
    </div>
  )
}

/** Flatten the nested numerical report into labelled stat cards (FR). */
function reportToStats(r) {
  if (!r || typeof r !== 'object') return []
  const d = r.disciples || {}
  const dg = r.discoveryGroups || {}
  const c = r.churches || {}
  const l = r.leaders || {}
  const pop = r.personsOfPeace || {}
  return [
    { label: 'Nouveaux disciples', value: d.newDisciples, accent: 'green' },
    { label: 'Baptisés', value: d.baptized, accent: 'green' },
    { label: 'Groupes de découverte', value: dg.total, accent: 'blue' },
    { label: 'GD actifs', value: dg.active, accent: 'blue' },
    { label: 'GD devenus église', value: dg.becameChurch, accent: 'blue' },
    { label: 'Églises', value: c.total, accent: 'amber' },
    { label: 'Personnes de paix', value: pop.total, accent: 'neutral' },
    { label: 'Leaders en formation', value: l.inTraining, accent: 'neutral' },
    { label: 'Coachs actifs', value: l.activeCoaches, accent: 'neutral' },
  ].filter((s) => typeof s.value === 'number')
}

function ReportingTab({ filter }) {
  // The zone → its people groups → the DMM report scoped to those groups.
  const peoples = useQuery({
    queryKey: ['geo-reporting-peoples', filter],
    queryFn: async () => {
      const res = await peopleGroupsApi.getAll({ ...filter, limit: 500 })
      const d = res?.data
      return asArray(d?.data || d?.peopleGroups || d)
    },
  })

  const pgIds = asArray(peoples.data)
    .map((pg) => pg?._id)
    .filter(Boolean)

  const report = useQuery({
    // Only fetch once we know which people groups fall in this zone.
    enabled: !peoples.isLoading && !peoples.isError,
    queryKey: ['geo-reporting-quarterly', pgIds],
    queryFn: async () => {
      const params = pgIds.length ? { peopleGroup: pgIds.join(',') } : {}
      const res = await api.get('/api/reporting/quarterly', { params })
      return res?.data
    },
  })

  if (peoples.isLoading || report.isLoading)
    return <StateLoading label="Chargement du reporting…" />
  if (peoples.isError || report.isError)
    return <StateError label="Reporting indisponible." />

  // No people group in this zone → nothing to report on.
  if (pgIds.length === 0)
    return <StateEmpty label="Aucun peuple dans cette zone : pas de reporting." />

  const payload = report.data?.data || report.data || {}
  const stats = reportToStats(payload)

  return (
    <div>
      <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs px-3 py-2 mb-4">
        Reporting trimestriel filtré sur les {pgIds.length} peuple(s) de cette zone.
      </div>
      {stats.length === 0 ? (
        <StateEmpty label="Aucune donnée de reporting à afficher." />
      ) : (
        <div className="flex flex-wrap gap-3">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} accent={s.accent} />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * GeoTabs — constant [Peuples | Reporting | Couverture] tab strip.
 * @param {Object} filter - people-groups filter for the current level
 *                          (e.g. { region }, { admin2 }, { admin3 })
 */
export const GeoTabs = ({ filter = {} }) => {
  const { t } = useLanguage()
  const [tab, setTab] = useState('peuples')

  const tabs = [
    { key: 'peuples', label: t('geo.tabPeoples') || 'Peuples', icon: Users },
    { key: 'reporting', label: t('geo.tabReporting') || 'Reporting', icon: BarChart3 },
    { key: 'couverture', label: t('geo.tabCoverage') || 'Couverture', icon: Compass },
  ]

  return (
    <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
      <div className="flex border-b border-neutral-200">
        {tabs.map((tb) => {
          const Icon = tb.icon
          const active = tab === tb.key
          return (
            <button
              key={tb.key}
              type="button"
              onClick={() => setTab(tb.key)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors ${
                active
                  ? 'text-neutral-900 border-b-2 border-neutral-900 -mb-px'
                  : 'text-neutral-500 hover:text-neutral-800'
              }`}
            >
              <Icon size={16} />
              {tb.label}
            </button>
          )
        })}
      </div>
      <div className="p-5">
        {tab === 'peuples' && <PeoplesTab filter={filter} />}
        {tab === 'reporting' && <ReportingTab filter={filter} />}
        {tab === 'couverture' && <CoverageTab />}
      </div>
    </div>
  )
}

export default GeoTabs
