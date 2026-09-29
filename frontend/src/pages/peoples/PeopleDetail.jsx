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
    [isFrench ? 'Donateur' : 'Donor', pg.donor],
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

  const tabs = [
    { key: 'profil', label: t('people.tabProfile') || (isFrench ? 'Profil' : 'Profile'), icon: User },
    { key: 'sources', label: t('people.tabSources') || 'Sources', icon: Database },
    { key: 'multiplication', label: t('people.tabMultiplication') || 'Multiplication', icon: Sprout },
    { key: 'reporting', label: t('people.tabReporting') || 'Reporting', icon: BarChart3 },
  ]

  return (
    <div>
      <PageHeader
        breadcrumb={[
          { label: t('nav.peoples') || (isFrench ? 'Peuples' : 'People groups'), to: '/peoples' },
          { label: pg?.name || '…' },
        ]}
        title={pg?.name || (isLoading ? (isFrench ? 'Chargement…' : 'Loading…') : (isFrench ? 'Peuple' : 'People group'))}
        subtitle={[pg?.region, pg?.status].filter(Boolean).join(' · ') || undefined}
      />

      <div className="mb-4">
        <Link
          to={`/people-groups/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900"
        >
          <ExternalLink size={15} />
          {t('people.fullEditor') || (isFrench ? 'Vue complète / éditer' : 'Full view / edit')}
        </Link>
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
