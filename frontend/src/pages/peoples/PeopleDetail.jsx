/**
 * PeopleDetail — enriched people sheet (Master People hub).
 * Constant tabs: [Profil | Sources | Multiplication | Reporting].
 * The "Multiplication" tab aggregates, filtered on THIS people group, the DMM
 * pillar data (persons of peace, discovery groups, DBS sessions, churches,
 * coaching). The full editor remains available at /people-groups/:id.
 */
import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  peopleGroupsApi,
  personsOfPeaceApi,
  discoveryGroupsApi,
  dbsSessionsApi,
  coachingSessionsApi,
  churchesApi,
  reportingApi,
  qualitativeAnalysisApi,
} from '../../services/api'
import { useLanguage } from '../../i18n'
import {
  PageHeader,
  StatCard,
  StateLoading,
  StateError,
  StateEmpty,
} from '../geography/geoComponents'
import {
  User,
  Database,
  Sprout,
  BarChart3,
  ExternalLink,
  Users,
  BookOpen,
  Church as ChurchIcon,
  GraduationCap,
  HeartHandshake,
  MapPin,
  Globe2,
  Flag,
  Smile,
} from 'lucide-react'

const unwrap = (res) => {
  const d = res?.data
  return d?.data && !Array.isArray(d) ? d.data : d
}
const listCount = (res) => {
  const d = res?.data
  if (typeof d?.total === 'number') return d.total
  const arr = d?.data || d?.items || d?.peopleGroups || d
  return Array.isArray(arr) ? arr.length : 0
}

const formatValue = (value, locale = 'fr-FR') => {
  if (value === undefined || value === null || value === '') return '—'
  if (typeof value === 'number') return value.toLocaleString(locale)
  return value
}

/* --------------------------------- Profil --------------------------------- */
function ProfilTab({ pg }) {
  const { isFrench } = useLanguage()
  if (!pg) return <StateEmpty label={isFrench ? 'Profil indisponible.' : 'Profile unavailable.'} />
  const rows = [
    [isFrench ? 'Nom' : 'Name', pg.name],
    [isFrench ? 'Région' : 'Region', pg.region],
    [isFrench ? 'Département' : 'Department', pg.admin2 || pg.department],
    [isFrench ? 'Arrondissement' : 'Subdivision', pg.admin3 || pg.subdivision],
    [isFrench ? 'Statut DMM' : 'DMM status', pg.status || pg.dmmStatus],
    [isFrench ? "Niveau d'engagement" : 'Engagement level', pg.engagementLevel],
    [
      'Population',
      typeof pg.population === 'number'
        ? pg.population.toLocaleString('fr-FR')
        : pg.population,
    ],
    [isFrench ? 'Langue' : 'Language', pg.language],
    ['Religion', pg.religion],
    [isFrench ? "Groupe d'affinité" : 'Affinity group', pg.affinityGroup],
    [isFrench ? 'Urbain / Rural' : 'Urban / Rural', pg.urbanRural],
    [isFrench ? 'Année de début' : 'Start year', pg.startYear],
    [isFrench ? 'Donateur' : 'Donor', pg.donor ? (
      <Link to={`/donors/${encodeURIComponent(pg.donor)}/engagements`} className="text-blue-600 hover:underline">
        {pg.donor}
      </Link>
    ) : pg.donor],
    [isFrench ? 'Coordinateur national' : 'National coordinator', pg.nationalCoordinator],
    [isFrench ? "Implanteur d'église" : 'Church planter', pg.churchPlanter ? (
      <Link to={`/planters/${encodeURIComponent(pg.churchPlanter)}/engagements`} className="text-blue-600 hover:underline">
        {pg.churchPlanter}
      </Link>
    ) : pg.churchPlanter],
  ].filter(([, v]) => v !== undefined && v !== null && v !== '')

  return (
    <div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-3">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between border-b border-neutral-100 py-1.5">
            <span className="text-neutral-400 text-sm">{label}</span>
            <span className="text-neutral-800 text-sm font-medium text-right">{value}</span>
          </div>
        ))}
      </div>
      {pg.description && (
        <p className="mt-4 text-sm text-neutral-600 leading-relaxed">{pg.description}</p>
      )}
    </div>
  )
}

/* --------------------------------- Sources -------------------------------- */
function SourcesTab({ pg }) {
  const { isFrench } = useLanguage()
  if (!pg) return <StateEmpty label={isFrench ? 'Aucune source.' : 'No source.'} />
  const sources = [
    { key: 'JP', label: 'Joshua Project', present: !!(pg.joshuaProjectId || pg.jpId || pg.peopleId || pg.sources?.joshuaProject) },
    { key: 'IMB', label: 'IMB (People Groups)', present: !!(pg.imbId || pg.sources?.imb) },
    { key: 'FTT', label: 'Finishing The Task', present: !!(pg.fttId || pg.sources?.ftt) },
    { key: 'DMM', label: isFrench ? 'DMM (terrain)' : 'DMM (field)', present: !!(pg.status || pg.dmmStatus || pg.sources?.dmm) },
  ]
  const any = sources.some((s) => s.present)
  return (
    <div>
      <p className="text-sm text-neutral-500 mb-4">
        {isFrench ? 'Provenance des données consolidées pour ce peuple (modèle Master People).' : 'Provenance of the consolidated data for this people group (Master People model).'}
      </p>
      <div className="flex flex-wrap gap-3">
        {sources.map((s) => (
          <div
            key={s.key}
            className={`px-4 py-3 rounded-xl border flex-1 min-w-[160px] ${
              s.present
                ? 'border-green-200 bg-green-50'
                : 'border-neutral-200 bg-neutral-50 opacity-60'
            }`}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {s.key}
            </p>
            <p className="text-sm font-medium text-neutral-800 mt-0.5">{s.label}</p>
            <p className={`text-xs mt-1 ${s.present ? 'text-green-700' : 'text-neutral-400'}`}>
              {s.present ? (isFrench ? 'Présent' : 'Present') : (isFrench ? 'Absent' : 'Absent')}
            </p>
          </div>
        ))}
      </div>
      {!any && <StateEmpty label={isFrench ? 'Aucune source identifiée sur cet enregistrement.' : 'No source identified on this record.'} />}
    </div>
  )
}

/* ------------------------------ Multiplication ---------------------------- */
function MultiplicationTab({ id }) {
  const { isFrench } = useLanguage()
  const q = (key, fn) =>
    useQuery({ queryKey: [key, id], queryFn: fn, enabled: !!id })

  const pop = q('mult-pop', () => personsOfPeaceApi.list({ peopleGroup: id, limit: 500 }))
  const dg = q('mult-dg', () => discoveryGroupsApi.list({ peopleGroup: id, limit: 500 }))
  const dbs = q('mult-dbs', () => dbsSessionsApi.list({ peopleGroup: id, limit: 500 }))
  const churches = q('mult-churches', () => churchesApi.getAll({ peopleGroup: id, limit: 500 }))
  const coaching = q('mult-coaching', () => coachingSessionsApi.list({ peopleGroup: id, limit: 500 }))

  const loading = [pop, dg, dbs, churches, coaching].some((x) => x.isLoading)
  if (loading) return <StateLoading label={isFrench ? 'Agrégation des métriques de multiplication…' : 'Aggregating multiplication metrics…'} />

  const cards = [
    { label: isFrench ? 'Personnes de paix' : 'Persons of peace', value: listCount(pop.data), icon: Users, accent: 'blue' },
    { label: isFrench ? 'Groupes de découverte' : 'Discovery groups', value: listCount(dg.data), icon: BookOpen, accent: 'blue' },
    { label: isFrench ? 'Sessions DBS' : 'DBS sessions', value: listCount(dbs.data), icon: HeartHandshake, accent: 'amber' },
    { label: isFrench ? 'Églises' : 'Churches', value: listCount(churches.data), icon: ChurchIcon, accent: 'green' },
    { label: 'Coaching iGROW', value: listCount(coaching.data), icon: GraduationCap, accent: 'neutral' },
  ]

  return (
    <div>
      <div className="rounded-lg bg-neutral-100 border border-neutral-200 text-neutral-600 text-xs px-3 py-2 mb-4">
        {isFrench ? <>Indicateurs de multiplication filtrés sur ce peuple (paramètre <code>peopleGroup</code>).</> : <>Multiplication indicators filtered on this people group (<code>peopleGroup</code> parameter).</>}
      </div>
      <div className="flex flex-wrap gap-3">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} />
        ))}
      </div>
    </div>
  )
}

/* -------------------------------- Reporting ------------------------------- */
/** Flatten the nested numerical report into labelled stat cards (FR). */
function reportToStats(r, isFrench = true) {
  if (!r || typeof r !== 'object') return []
  const d = r.disciples || {}
  const dg = r.discoveryGroups || {}
  const c = r.churches || {}
  const l = r.leaders || {}
  const pop = r.personsOfPeace || {}
  return [
    { label: isFrench ? 'Nouveaux disciples' : 'New disciples', value: d.newDisciples, accent: 'green' },
    { label: isFrench ? 'Baptisés' : 'Baptized', value: d.baptized, accent: 'green' },
    { label: isFrench ? 'Groupes de découverte' : 'Discovery groups', value: dg.total, accent: 'blue' },
    { label: isFrench ? 'GD actifs' : 'Active DGs', value: dg.active, accent: 'blue' },
    { label: isFrench ? 'GD devenus église' : 'DGs became church', value: dg.becameChurch, accent: 'blue' },
    { label: isFrench ? 'Églises' : 'Churches', value: c.total, accent: 'amber' },
    { label: isFrench ? 'Personnes de paix' : 'Persons of peace', value: pop.total, accent: 'neutral' },
    { label: isFrench ? 'Leaders en formation' : 'Leaders in training', value: l.inTraining, accent: 'neutral' },
    { label: isFrench ? 'Coachs actifs' : 'Active coaches', value: l.activeCoaches, accent: 'neutral' },
  ].filter((s) => typeof s.value === 'number')
}

function ReportingTab({ id }) {
  const { isFrench } = useLanguage()
  const quarterly = useQuery({
    queryKey: ['people-reporting', id],
    // Scope the whole DMM report to THIS people group.
    queryFn: () => reportingApi.quarterly({ peopleGroup: id }),
    enabled: !!id,
  })
  const qual = useQuery({
    queryKey: ['people-qual', id],
    queryFn: () => qualitativeAnalysisApi.getByPeopleGroup(id),
    enabled: !!id,
  })

  if (quarterly.isLoading) return <StateLoading label={isFrench ? 'Chargement du reporting…' : 'Loading reporting…'} />
  if (quarterly.isError) return <StateError label={isFrench ? 'Reporting indisponible.' : 'Reporting unavailable.'} />

  const payload = quarterly.data?.data?.data || quarterly.data?.data || {}
  const stats = reportToStats(payload, isFrench)
  const qualData = qual.data?.data?.data || qual.data?.data

  return (
    <div>
      <div className="rounded-lg bg-green-50 border border-green-200 text-green-800 text-xs px-3 py-2 mb-4">
        {isFrench ? <>Reporting trimestriel filtré sur ce peuple (paramètre <code>peopleGroup</code>) + analyse qualitative DMM.</> : <>Quarterly reporting filtered on this people group (<code>peopleGroup</code> parameter) + DMM qualitative analysis.</>}
      </div>
      {stats.length > 0 ? (
        <div className="flex flex-wrap gap-3 mb-4">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} accent={s.accent} />
          ))}
        </div>
      ) : (
        <StateEmpty label={isFrench ? 'Aucune donnée de reporting pour ce peuple.' : 'No reporting data for this people group.'} />
      )}
      {qualData && (
        <div className="mt-4 bg-white border border-neutral-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-neutral-700 mb-2">{isFrench ? 'Analyse qualitative' : 'Qualitative analysis'}</h3>
          <pre className="text-xs text-neutral-600 whitespace-pre-wrap break-words max-h-64 overflow-auto">
            {JSON.stringify(qualData, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

/* --------------------------------- Page ----------------------------------- */
const PeopleDetail = () => {
  const { id } = useParams()
  const { t, isFrench } = useLanguage()
  const [tab, setTab] = useState('profil')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['people-detail', id],
    queryFn: async () => {
      const res = await peopleGroupsApi.getById(id)
      return unwrap(res)
    },
    enabled: !!id,
  })

  const pg = data || null

  const statusValue = formatValue(pg?.status || pg?.dmmStatus)
  const mainSubtitle = [pg?.region, pg?.admin2 || pg?.department, pg?.admin3 || pg?.subdivision].filter(Boolean).join(' / ')
  const heroNotes = [
    { label: isFrench ? 'Pays' : 'Country', value: pg?.country || pg?.countryCode || pg?.primaryCountryCode || '—', icon: Flag },
    { label: isFrench ? 'Région' : 'Region', value: pg?.region || '—', icon: MapPin },
    { label: isFrench ? 'Langue' : 'Language', value: pg?.language || '—', icon: Globe2 },
  ]

  const kpiCards = [
    {
      label: isFrench ? 'Population' : 'Population',
      value: formatValue(pg?.population),
      icon: Users,
      accent: 'from-sky-50 to-cyan-50',
      valueClass: 'text-slate-950',
    },
    {
      label: isFrench ? 'Statut' : 'Status',
      value: statusValue,
      icon: Smile,
      accent: 'from-blue-500 to-sky-500',
      valueClass: 'text-white',
      inverse: true,
    },
    {
      label: isFrench ? 'Engagement' : 'Engagement',
      value: formatValue(pg?.engagementLevel),
      icon: HeartHandshake,
      accent: 'from-slate-50 to-slate-100',
      valueClass: 'text-slate-950',
    },
  ]

  const infoCards = [
    { label: isFrench ? 'Pays' : 'Country', value: pg?.country || pg?.countryCode || pg?.primaryCountryCode || '—', icon: Flag },
    { label: isFrench ? 'JP Scale' : 'JP Scale', value: formatValue(pg?.jpScale || pg?.scale || pg?.joshuaProjectScale), icon: BarChart3 },
    { label: isFrench ? 'Moins atteint' : 'Least reached', value: formatValue(pg?.leastReached), icon: Target },
    { label: isFrench ? 'Langue primaire' : 'Primary language', value: pg?.language || '—', icon: Globe2 },
    { label: isFrench ? '% Évangélique' : '% Evangelical', value: formatValue(pg?.evangelicalPercent ?? pg?.evangelical), icon: HeartHandshake },
    { label: isFrench ? 'Traduction biblique' : 'Bible translation', value: pg?.bibleTranslation || pg?.translation || '—', icon: BookOpen },
    { label: isFrench ? 'Religion' : 'Religion', value: pg?.religion || '—', icon: ChurchIcon },
    { label: 'ESP 300', value: formatValue(pg?.esp300), icon: Target },
    { label: 'YCS', value: formatValue(pg?.ycs), icon: CalendarDays },
  ]

  const secondaryCards = infoCards.slice(0, 6)
  const tertiaryCards = infoCards.slice(6)

  const tabs = [
    { key: 'profil', label: t('people.tabProfile') || (isFrench ? 'Profil' : 'Profile'), icon: User },
    { key: 'sources', label: t('people.tabSources') || 'Sources', icon: Database },
    { key: 'multiplication', label: t('people.tabMultiplication') || 'Multiplication', icon: Sprout },
    { key: 'reporting', label: t('people.tabReporting') || 'Reporting', icon: BarChart3 },
  ]

  return (
    <div>
      <div className="mb-6 rounded-[32px] border border-slate-200/80 bg-white shadow-[0_24px_80px_-50px_rgba(15,23,42,0.25)] overflow-hidden">
        <div className="p-4 sm:p-5 lg:p-6">
          <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
            <Link to="/regions" className="inline-flex items-center gap-2 font-medium text-slate-500 hover:text-slate-800">
              <MapPin size={16} />
              {isFrench ? 'Régions' : 'Regions'}
            </Link>
            <span>/</span>
            <span className="font-medium text-slate-500">{pg?.region || 'FCA'}</span>
            <span>/</span>
            <span className="font-medium text-slate-500">{pg?.country || pg?.countryCode || 'CM'}</span>
            <span>/</span>
            <span className="font-semibold text-slate-900">{pg?.name || '…'}</span>
          </div>

          <div className="grid gap-4 xl:grid-cols-[380px_1fr]">
            <div className="rounded-[28px] border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.35)]">
              <div className="overflow-hidden rounded-[22px] bg-slate-100">
                {pg?.imageUrl ? (
                  <img
                    src={pg.imageUrl}
                    alt={pg?.name || 'People group'}
                    className="h-[260px] w-full object-cover sm:h-[290px]"
                  />
                ) : (
                  <div className="flex h-[260px] w-full items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 text-slate-400 sm:h-[290px]">
                    <Users size={48} />
                  </div>
                )}
              </div>

              <h2 className="mt-4 text-[42px] leading-[0.95] font-extrabold tracking-tight text-slate-950 sm:text-[52px]">
                {pg?.name || (isLoading ? (isFrench ? 'Chargement…' : 'Loading…') : (isFrench ? 'Peuple' : 'People group'))}
              </h2>

              <div className="mt-4 flex flex-wrap gap-2">
                {[pg?.region, pg?.country || pg?.countryCode || pg?.primaryCountryCode, pg?.religion].filter(Boolean).map((chip) => (
                  <span key={chip} className="inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700">
                    {chip}
                  </span>
                ))}
              </div>

              <p className="mt-5 max-w-md text-sm leading-7 text-slate-600 sm:text-base">
                {pg?.description || mainSubtitle || (isFrench ? 'Aucune description n’est disponible pour ce peuple.' : 'No description is available for this people group yet.')}
              </p>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-500">{isFrench ? 'Pays' : 'Country'}</div>
                  <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{pg?.country || pg?.countryCode || pg?.primaryCountryCode || '—'}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-sm font-medium text-slate-500">JP Scale</div>
                  <div className="mt-2 text-2xl font-bold tracking-tight text-slate-900">{formatValue(pg?.jpScale || pg?.scale || pg?.joshuaProjectScale)}</div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-[28px] border border-slate-200 bg-gradient-to-br from-blue-500 via-blue-600 to-sky-500 p-5 text-white shadow-[0_24px_70px_-30px_rgba(37,99,235,0.65)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold uppercase tracking-[0.28em] text-blue-100/90">
                      {isFrench ? 'Statut' : 'Status'}
                    </div>
                    <div className="mt-2 text-[48px] font-extrabold leading-none tracking-tight sm:text-[56px]">
                      {statusValue}
                    </div>
                    <div className="mt-3 text-lg font-medium text-blue-50/95">
                      {isFrench ? 'Partiellement atteint' : 'Partially reached'}
                    </div>
                  </div>

                  <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-full border-[10px] border-white/20 bg-white/10 shadow-inner backdrop-blur">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/95 text-blue-600">
                      <Users size={28} />
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3 rounded-[22px] bg-white/92 p-3 text-slate-900 shadow-inner">
                  {[
                    { label: isFrench ? 'Évangélique' : 'Evangelical', value: formatValue(pg?.evangelicalPercent ?? pg?.evangelical), icon: HeartHandshake },
                    { label: 'JP Scale', value: formatValue(pg?.jpScale || pg?.scale || pg?.joshuaProjectScale), icon: BarChart3 },
                    { label: isFrench ? 'Moins atteint' : 'Least Reached', value: formatValue(pg?.leastReached), icon: Target },
                  ].map((item) => {
                    const Icon = item.icon
                    return (
                      <div key={item.label} className="flex flex-col items-center justify-center gap-1 rounded-2xl px-2 py-3 text-center">
                        <Icon size={20} className="text-blue-600" />
                        <div className="text-2xl font-extrabold tracking-tight">{item.value}</div>
                        <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">{item.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-[#f8fbff] p-5 shadow-[0_18px_50px_-35px_rgba(15,23,42,0.28)]">
                <div className="flex items-center gap-3 text-slate-900">
                  <MapPin size={22} className="text-slate-700" />
                  <h3 className="text-2xl font-bold tracking-tight">{isFrench ? 'Key Information' : 'Key Information'}</h3>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {secondaryCards.map((card) => {
                    const Icon = card.icon
                    return (
                      <div key={card.label} className="min-h-[132px] rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_14px_35px_-30px_rgba(15,23,42,0.25)]">
                        <Icon size={28} className="text-slate-700" />
                        <div className="mt-4 text-sm font-medium text-slate-500">{card.label}</div>
                        <div className={`mt-2 text-[22px] font-extrabold tracking-tight ${card.valueClass || 'text-slate-950'}`}>
                          {card.value}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {tertiaryCards.map((card) => {
                    const Icon = card.icon
                    return (
                      <div key={card.label} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-[0_14px_35px_-30px_rgba(15,23,42,0.25)]">
                        <div className="flex items-center gap-3 text-slate-500">
                          <Icon size={18} />
                          <div className="text-sm font-medium">{card.label}</div>
                        </div>
                        <div className="mt-3 text-[22px] font-extrabold tracking-tight text-slate-950">
                          {card.value}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-5 flex flex-wrap gap-2">
                  {[pg?.language, pg?.urbanRural, pg?.affinityGroup, pg?.startYear].filter(Boolean).map((chip) => (
                    <span key={chip} className="inline-flex items-center rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Link
                  to={`/people-groups/${id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-slate-950 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-slate-950/20 transition hover:bg-slate-800"
                >
                  <ExternalLink size={15} />
                  {t('people.fullEditor') || (isFrench ? 'Vue complète / éditer' : 'Full view / edit')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {isLoading ? (
        <StateLoading />
      ) : isError ? (
        <StateError label={isFrench ? 'Impossible de charger ce peuple.' : 'Unable to load this people group.'} />
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <div className="flex border-b border-neutral-200 overflow-x-auto">
            {tabs.map((tb) => {
              const Icon = tb.icon
              const active = tab === tb.key
              return (
                <button
                  key={tb.key}
                  type="button"
                  onClick={() => setTab(tb.key)}
                  className={`flex items-center gap-2 px-5 py-3 text-sm font-medium whitespace-nowrap transition-colors ${
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
            {tab === 'profil' && <ProfilTab pg={pg} />}
            {tab === 'sources' && <SourcesTab pg={pg} />}
            {tab === 'multiplication' && <MultiplicationTab id={id} />}
            {tab === 'reporting' && <ReportingTab id={id} />}
          </div>
        </div>
      )}
    </div>
  )
}

export default PeopleDetail
