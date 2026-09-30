import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { peopleGroupsApi } from '../services/api'
import { StateLoading, StateError, StatCard } from './geography/geoComponents'
import { dmmEngagementDisplay } from '../utils/dmmEngagement'
import { useLanguage } from '../i18n'

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

/**
 * EngagementDetail — fiche d'un engagement DMM (un « village » du modèle).
 *
 * Intégrée au funnel de la page Regions :
 *   Regions ▸ Pays ▸ Peuple ▸ Engagement
 *   /regions/:regionId/countries/:countryCode/peoples/:peopleId/engagements/:engagementId
 *
 * Atteignable en cliquant le nom d'un engagement depuis :
 *   - la fiche d'un peuple (PeopleDetailLite)
 *   - la section « Engagements » d'un pays (CountryPeoples)
 *   - la liste des engagements d'un implanteur (PlanterEngagements)
 *
 * Les points/statuts colorés suivent les règles du tableau DMM (nombre
 * d'églises) et les couleurs imposées — voir utils/dmmEngagement.js.
 */
export default function EngagementDetail() {
  const { isFrench } = useLanguage()
  const { regionId, countryCode, peopleId, engagementId } = useParams()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['engagement', engagementId],
    queryFn: async () => (await peopleGroupsApi.getById(engagementId)).data,
    enabled: !!engagementId,
    retry: false,
  })

  if (isLoading) return <div className="p-6"><StateLoading label={isFrench ? "Chargement de l'engagement…" : 'Loading engagement…'} /></div>
  if (isError) {
    const notFound = error?.response?.status === 404
    return <div className="p-6"><StateError label={notFound ? (isFrench ? 'Engagement introuvable.' : 'Engagement not found.') : (isFrench ? 'Erreur de chargement.' : 'Loading error.')} /></div>
  }

  const eng = data || {}
  const engagementName = eng.villageName || eng.name || (isFrench ? 'Engagement' : 'Engagement')
  const { label: stageLabel, colors } = dmmEngagementDisplay(eng, isFrench)

  // Fil d'Ariane funnel — on ne montre les segments géographiques que si l'URL
  // les fournit (accès direct depuis un implanteur peut ne pas les porter).
  const inFunnel = regionId && countryCode && peopleId

  const stats = [
    { label: isFrench ? "# d'églises" : '# churches', value: fmt(eng.numberOfChurches ?? 0), accent: 'blue' },
    { label: 'Max Gen', value: fmt(eng.churchGeneration ?? 0), accent: 'blue' },
    { label: isFrench ? 'Nouveaux disciples' : 'New disciples', value: fmt(eng.newDisciples ?? 0), accent: 'green' },
    { label: isFrench ? 'Nouveaux baptisés' : 'New baptisms', value: fmt(eng.newBaptisms ?? 0), accent: 'green' },
  ]

  const detailRows = [
    [isFrench ? 'Village' : 'Village', eng.villageName || '—'],
    [isFrench ? 'Région' : 'Region', eng.region || '—'],
    ['Admin 2', eng.admin2 || eng.departement || '—'],
    ['Admin 3', eng.admin3 || eng.arrondissement || '—'],
    [isFrench ? "Niveau d'engagement" : 'Engagement level', eng.engagementLevel || '—'],
    ['DBS', fmt(eng.dbs ?? 0)],
    ['COM', fmt(eng.com ?? 0)],
    ['CAT', fmt(eng.cat ?? 0)],
    [isFrench ? 'Leaders en formation' : 'Leaders in training', fmt(eng.leadersInTraining ?? 0)],
    [isFrench ? 'Coachs actifs' : 'Active coaches', fmt(eng.activeCoaches ?? 0)],
    [isFrench ? 'Formations tenues' : 'Trainings held', fmt(eng.trainingsHeld ?? 0)],
    [isFrench ? 'Période de rapport' : 'Report period', eng.reportPeriod || '—'],
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Fil d'Ariane : Regions ▸ Pays ▸ Peuple ▸ Engagement */}
      <p className="text-sm text-gray-500">
        {inFunnel ? (
          <>
            <Link to="/regions" className="hover:text-slate-700">Regions</Link> /{' '}
            <Link to={`/regions/${regionId}`} className="hover:text-slate-700">{regionId}</Link> /{' '}
            <Link to={`/regions/${regionId}/countries/${countryCode}`} className="hover:text-slate-700">{countryCode}</Link> /{' '}
            <Link to={`/regions/${regionId}/countries/${countryCode}/peoples/${peopleId}`} className="hover:text-slate-700">{eng.name || (isFrench ? 'Peuple' : 'People group')}</Link> /{' '}
            {engagementName}
          </>
        ) : (
          <>
            <Link to="/regions" className="hover:text-slate-700">Regions</Link> / {engagementName}
          </>
        )}
      </p>

      <div>
        <h1 className="text-4xl font-bold text-slate-900">{engagementName}</h1>
        {eng.name && eng.name !== engagementName && (
          <p className="mt-1 text-slate-500">{isFrench ? 'Peuple' : 'People group'} : {eng.name}</p>
        )}
      </div>

      {/* Carte Statut DMM : point + libellé colorés selon la règle du tableau. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <p className="text-sm font-semibold text-slate-500 mb-2">{isFrench ? 'Statut DMM' : 'DMM status'}</p>
        <div className="flex items-center gap-3">
          <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: colors.hex }} />
          <span className="text-xl font-bold" style={{ color: colors.hex }}>{stageLabel}</span>
        </div>
        <p className="mt-2 text-sm text-slate-400">
          {isFrench
            ? `Déterminé par le nombre d'églises (${fmt(eng.numberOfChurches ?? 0)}) selon le tableau DMM.`
            : `Determined by the number of churches (${fmt(eng.numberOfChurches ?? 0)}) per the DMM table.`}
        </p>
      </section>

      <div className="flex flex-wrap gap-3">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} accent={s.accent} />
        ))}
      </div>

      {/* Implanteur — cliquable vers ses engagements, comme ailleurs. */}
      {eng.churchPlanter && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-500 mb-1">{isFrench ? 'Implanteur' : 'Church planter'}</p>
          <Link
            to={`/planters/${encodeURIComponent(eng.churchPlanter)}/engagements`}
            className="text-blue-600 hover:underline text-lg font-medium"
          >
            {eng.churchPlanter}
          </Link>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold mb-4">{isFrench ? "Détails de l'engagement" : 'Engagement details'}</h2>
        <div className="divide-y divide-slate-100">
          {detailRows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-1.5">
              <span className="text-slate-400 text-sm">{label}</span>
              <span className="text-slate-800 text-sm font-medium text-right">{value}</span>
            </div>
          ))}
        </div>
        {eng.description && (
          <p className="mt-4 text-sm text-slate-600 whitespace-pre-line leading-relaxed">{eng.description}</p>
        )}
      </section>
    </div>
  )
}
