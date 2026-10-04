import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { reportingApi } from '../services/reportingApi'
import { masterPeopleApi } from '../services/api'
import { StateLoading, StateError, StateEmpty, StatCard, StatusBadge } from './geography/geoComponents'
import { metricCards } from './regions/ngMetrics'
import { DmmStatusBadge } from '../components/DmmStatusBadge'
import DmmProgressTable from '../components/Dashboard/DmmProgressTable'
import { dmmLevelForEngagement, dmmLevelLabel } from '../utils/dmmEngagement'
import { useLanguage } from '../i18n'

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

// Pick the reference (non-DMM) source of a people's status, e.g. JP / IMB / FTT.
// Falls back to the first available source type.
const referenceSource = (sourceTypes = []) => {
  const preferred = sourceTypes.find((s) => s && s.toUpperCase() !== 'DMM')
  return (preferred || sourceTypes[0] || '').toUpperCase() || null
}

const CountryPeoples = () => {
  const { isFrench } = useLanguage()
  const { regionId, countryCode } = useParams()
  const [peoplesOpen, setPeoplesOpen] = useState(true)
  const [engagementsOpen, setEngagementsOpen] = useState(true)
  const [showAllMetrics, setShowAllMetrics] = useState(false)

  const countryQuery = useQuery({
    queryKey: ['ng-region-country', regionId, countryCode],
    queryFn: async () => {
      const res = await reportingApi.getRegionCountry(regionId, countryCode)
      return res?.data?.data
    },
    enabled: !!regionId && !!countryCode,
    retry: false,
  })

  const peoplesQuery = useQuery({
    queryKey: ['ng-country-peoples', countryCode],
    queryFn: async () => {
      const res = await reportingApi.getPeoples({ countries: countryCode, limit: 100 })
      return Array.isArray(res?.data?.data) ? res.data.data : []
    },
    enabled: !!countryCode,
    retry: false,
  })

  // Engagements DMM du pays — MÊME source que la carte (/map/dmm-engagements),
  // afin que le tableau DMM compte le même total que la carte (ex. 80 pour le
  // Cameroun), c.-à-d. les ENGAGEMENTS DMM et non les peuples.
  const dmmEngagementsQuery = useQuery({
    queryKey: ['ng-country-dmm-engagements', countryCode],
    queryFn: async () => {
      const res = await masterPeopleApi.getDmmEngagements({ country: countryCode, limit: 20000 })
      return Array.isArray(res?.data?.peoples) ? res.data.peoples : []
    },
    enabled: !!countryCode,
    retry: false,
  })

  if (countryQuery.isLoading) return <div className="p-6"><StateLoading label={isFrench ? 'Chargement du pays…' : 'Loading country…'} /></div>
  if (countryQuery.isError) {
    const notFound = countryQuery.error?.response?.status === 404
    return <div className="p-6"><StateError label={notFound ? (isFrench ? 'Pays introuvable.' : 'Country not found.') : (isFrench ? 'Erreur de chargement.' : 'Loading error.')} /></div>
  }

  const detail = countryQuery.data
  const region = detail?.region
  const country = detail?.country
  if (!country) return <div className="p-6">{isFrench ? 'Pays introuvable.' : 'Country not found.'}</div>

  const cards = metricCards(detail.metrics)
  const primaryCards = cards.filter((c) => c.primary)
  const moreCards = cards.filter((c) => !c.primary)
  const peoples = peoplesQuery.data || []
  const dmmPeoples = peoples.filter((p) => p.isNGEngaged)
  const engagements = dmmPeoples.flatMap((p) =>
    (p.dmm?.engagements || []).map((e) => ({
      ...e,
      masterPeopleId: p.masterPeopleId,
      // Parent people name (e.g. engagement "Bana Guili" belongs to people "Bana").
      peopleName: p.canonicalName,
    }))
  )
  const reportingCount = dmmPeoples.reduce((sum, p) => sum + (p.dmm?.engagementCount || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <p className="text-sm text-gray-500">
        <Link to="/regions" className="hover:text-slate-700">Regions</Link> /{' '}
        <Link to={`/regions/${region?.id}`} className="hover:text-slate-700">{region?.name}</Link> / {country.name || country.nameEn}
      </p>
      <div>
        <h1 className="text-4xl font-bold text-slate-900">{country.name || country.nameEn}</h1>
      </div>

      {/* Cartes de métriques : une seule grille fluide. Les groupes bleu (ligne 1)
          et vert (ligne 2) partagent désormais le même conteneur, donc quand une
          carte de la 1re ligne passe à la ligne suivante, les cartes de la 2e ligne
          remontent pour combler l'espace au lieu de rester sur une ligne séparée.
          Chaque carte conserve sa couleur d'accent d'origine. */}
      <div className="flex flex-wrap gap-3">
        {(showAllMetrics ? cards : primaryCards).map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} />
        ))}
      </div>
      {moreCards.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAllMetrics((v) => !v)}
          aria-expanded={showAllMetrics}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-800"
        >
          {showAllMetrics ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          {showAllMetrics ? (isFrench ? 'Voir moins de métriques' : 'View fewer metrics') : (isFrench ? 'Voir plus de métriques' : 'View more metrics')}
        </button>
      )}

      {/* Tableau DMM coloré (étape × niveau) — mêmes couleurs/structure que le
          Global Dashboard, mais avec les chiffres des engagements DE CE PAYS. */}
      <div className="border-t border-slate-200 mb-4" />
      <DmmProgressTable
        engagements={dmmEngagementsQuery.data || []}
        isFrench={isFrench}
        title={isFrench ? 'Tableau DMM — Engagements du pays' : 'DMM table — Country engagements'}
      />

      {/* Peuple en haut, Engagements en bas — deux sections repliables, même
          structure visuelle que le tableau Countries de la page Regions. */}
      <div className="space-y-6">
        {/* ── Peuple ─────────────────────────────────────────────────────── */}
        <section className="p-0">
          <button
            type="button"
            onClick={() => setPeoplesOpen((v) => !v)}
            aria-expanded={peoplesOpen}
            className="flex w-full items-center gap-2 text-left"
          >
            {peoplesOpen ? (
              <ChevronDown size={20} className="text-blue-600" />
            ) : (
              <ChevronRight size={20} className="text-blue-600" />
            )}
            <span className="text-base font-semibold text-black uppercase">{isFrench ? 'Peuples' : 'People groups'}</span>
            <span className="text-slate-400 text-sm">
              ({peoplesQuery.isLoading ? '…' : dmmPeoples.length})
            </span>
          </button>

          {peoplesOpen && (
            peoplesQuery.isLoading ? (
              <div className="mt-4"><StateLoading label={isFrench ? 'Chargement des peuples…' : 'Loading people groups…'} /></div>
            ) : peoplesQuery.isError ? (
              <div className="mt-4"><StateError label={isFrench ? 'Impossible de charger les peuples.' : 'Unable to load people groups.'} /></div>
            ) : dmmPeoples.length === 0 ? (
              <div className="mt-4"><StateEmpty label={isFrench ? 'Aucun peuple DMM pour ce pays.' : 'No DMM people group for this country.'} /></div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? 'Peuple' : 'People group'}</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? "# d'engagements" : '# engagements'}</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? "# d'églises" : '# churches'}</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Max Gen</th>
                      <th className="py-2 pl-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? 'Statut' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dmmPeoples.map((p) => {
                      // Source de référence pour le statut du peuple, en excluant
                      // « DMM » (on ne veut plus afficher le suffixe « (DMM) »).
                      const rawSrc = referenceSource(p.sourceTypes)
                      const src = rawSrc && rawSrc.toUpperCase() !== 'DMM' ? rawSrc : null
                      const status = p.status?.global || 'UNKNOWN'
                      return (
                        <tr key={p.masterPeopleId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="py-3 pr-4">
                            <Link
                              to={`/regions/${regionId}/countries/${countryCode}/peoples/${p.masterPeopleId}`}
                              className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              {p.canonicalName}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(p.dmm?.engagementCount ?? 0)}</td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(p.dmm?.totalChurches ?? 0)}</td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(p.dmm?.maxGeneration ?? 0)}</td>
                          <td className="py-3 pl-4 text-left text-slate-700">
                            <StatusBadge status={`${status}${src ? ` (${src})` : ''}`} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>

        {/* ── Engagements ────────────────────────────────────────────────── */}
        <section className="p-0">
          <button
            type="button"
            onClick={() => setEngagementsOpen((v) => !v)}
            aria-expanded={engagementsOpen}
            className="flex w-full items-center gap-2 text-left"
          >
            {engagementsOpen ? (
              <ChevronDown size={20} className="text-blue-600" />
            ) : (
              <ChevronRight size={20} className="text-blue-600" />
            )}
            <span className="text-base font-semibold text-black uppercase">Engagements</span>
            <span className="text-slate-400 text-sm">
              ({peoplesQuery.isLoading ? '…' : engagements.length})
            </span>
          </button>

          {engagementsOpen && (
            peoplesQuery.isLoading ? (
              <div className="mt-4"><StateLoading label={isFrench ? 'Chargement des engagements…' : 'Loading engagements…'} /></div>
            ) : peoplesQuery.isError ? (
              <div className="mt-4"><StateError label={isFrench ? 'Impossible de charger les engagements.' : 'Unable to load engagements.'} /></div>
            ) : engagements.length === 0 ? (
              <div className="mt-4"><StateEmpty label={isFrench ? 'Aucun engagement pour ce pays.' : 'No engagement for this country.'} /></div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? "Nom de l'engagement" : 'Engagement name'}</th>
                      <th className="py-2 px-6 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[7rem]">{isFrench ? "# d'églises" : '# churches'}</th>
                      <th className="py-2 px-6 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[6rem]">Max Gen</th>
                      <th className="py-2 px-6 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[7rem]">Eng level</th>
                      <th className="py-2 pl-6 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 min-w-[9rem]">DMM Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {engagements.map((e) => {
                      // Nom de l'engagement = « nom du peuple + nom du village ».
                      const engName = [e.peopleName, e.villageName].filter(Boolean).join(', ') || e.name
                      const level = dmmLevelForEngagement(e)
                      return (
                      <tr key={e.peopleGroupId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                        <td className="py-3 pr-4">
                          {/* Le nom d'un engagement mène désormais vers la FICHE
                              DE L'ENGAGEMENT (et non plus vers celle du peuple). */}
                          {e.peopleGroupId ? (
                            <Link
                              to={`/regions/${regionId}/countries/${countryCode}/peoples/${e.masterPeopleId}/engagements/${e.peopleGroupId}`}
                              className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              {engName}
                            </Link>
                          ) : (
                            <span className="font-medium text-slate-700">{engName}</span>
                          )}
                        </td>
                        <td className="py-3 px-6 text-right tabular-nums font-bold text-slate-700">{fmt(e.numberOfChurches ?? 0)}</td>
                        <td className="py-3 px-6 text-right tabular-nums font-bold text-slate-700">{fmt(e.churchGeneration ?? 0)}</td>
                        <td className="py-3 px-6 text-left text-slate-700">{level ? dmmLevelLabel(level, isFrench) : '—'}</td>
                        <td className="py-3 pl-6 text-left text-slate-700"><DmmStatusBadge engagement={e} /></td>
                      </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </section>
      </div>
    </div>
  )
}

export default CountryPeoples
