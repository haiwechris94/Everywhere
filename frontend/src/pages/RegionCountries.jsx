import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { reportingApi, regionAdminApi } from '../services/reportingApi'
import { masterPeopleApi } from '../services/api'
import { StateLoading, StateError, StateEmpty, StatCard } from './geography/geoComponents'
import { metricCards } from './regions/ngMetrics'
import DmmProgressTable from '../components/Dashboard/DmmProgressTable'
import DmmStageGauge from '../components/Dashboard/DmmStageGauge'
import { useLanguage } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { RegionForm, CountryForm } from '../components/admin/RegionCountryForms'

// Locale-aware thousands formatting for the numeric columns (e.g. 45000 -> 45 000).
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

const RegionCountries = () => {
  const { isFrench } = useLanguage()
  const { regionId } = useParams()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManage = !!user && (user.role === 'admin' || user.role === 'supervisor')
  const [countriesOpen, setCountriesOpen] = useState(true)
  const [showAllMetrics, setShowAllMetrics] = useState(false)
  const [editingRegion, setEditingRegion] = useState(false)
  const [creatingCountry, setCreatingCountry] = useState(false)
  const [editCountry, setEditCountry] = useState(null)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['ng-region', regionId],
    queryFn: async () => {
      const res = await reportingApi.getRegion(regionId)
      return res?.data?.data
    },
    enabled: !!regionId,
    retry: false,
  })

  // Tous les engagements DMM (même source que la carte). On agrège ensuite ceux
  // des pays de CETTE région pour le tableau DMM. Requête déclarée avant tout
  // retour anticipé pour garder l'ordre des hooks stable.
  const { data: allDmmEngagements } = useQuery({
    queryKey: ['region-dmm-engagements', 'all'],
    queryFn: async () => {
      const res = await masterPeopleApi.getDmmEngagements({ limit: 20000 })
      return Array.isArray(res?.data?.peoples) ? res.data.peoples : []
    },
    retry: false,
  })

  if (isLoading) return <div className="p-6"><StateLoading label={isFrench ? 'Chargement de la région…' : 'Loading region…'} /></div>
  if (isError) {
    const notFound = error?.response?.status === 404
    return <div className="p-6"><StateError label={notFound ? (isFrench ? 'Région introuvable.' : 'Region not found.') : (isFrench ? 'Erreur de chargement.' : 'Loading error.')} /></div>
  }
  if (!data) return <div className="p-6">{isFrench ? 'Région introuvable.' : 'Region not found.'}</div>

  const countries = Array.isArray(data.countries) ? data.countries : []
  const cards = metricCards(data.metrics)
  const primaryCards = cards.filter((c) => c.primary)
  const moreCards = cards.filter((c) => !c.primary)

  // Engagements DMM agrégés sur les pays de la région (filtre par code alpha-2).
  const regionCountryCodes = new Set(countries.map((c) => (c.code || '').toUpperCase()).filter(Boolean))
  const regionDmmEngagements = (allDmmEngagements || []).filter(
    (e) => e.countryCode2 && regionCountryCodes.has(String(e.countryCode2).toUpperCase())
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            <Link to="/regions" className="font-bold hover:text-slate-700">Regions</Link> / {data.name}
          </p>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">{data.fullName}</h1>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setEditingRegion(true)}
            className="rounded border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {isFrench ? 'Modifier la région' : 'Edit region'}
          </button>
        )}
      </div>

      {(data.responsibleName || data.leaders?.length) && (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {isFrench ? 'Responsables' : 'Leaders'}
          </p>
          {data.responsibleName && (
            <p className="mt-1 text-sm font-medium text-slate-700">{data.responsibleName}</p>
          )}
          {Array.isArray(data.leaders) && data.leaders.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm text-slate-600">
              {data.leaders.map((l, i) => (
                <li key={i}>{[l.role, l.name].filter(Boolean).join(' — ')}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {editingRegion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-lg w-full bg-white rounded-xl p-4 max-h-[85vh] overflow-y-auto">
            <RegionForm
              mode="edit"
              initial={{
                regionId: data.id,
                name: data.name,
                fullName: data.fullName,
                description: data.description,
                responsibleName: data.responsibleName,
                leaders: data.leaders,
              }}
              onCancel={() => setEditingRegion(false)}
              onSubmit={async (body) => {
                await regionAdminApi.updateRegion(regionId, body)
                await queryClient.invalidateQueries({ queryKey: ['ng-region', regionId] })
                await queryClient.invalidateQueries({ queryKey: ['ng-regions'] })
                setEditingRegion(false)
              }}
              isFrench={isFrench}
            />
          </div>
        </div>
      )}

      {/* Layout paysage : Reporting en haut (pleine largeur), Countries en dessous */}
      <div className="space-y-6">
        <section className="p-0">
          <h2 className="text-xl font-bold mb-4">Reporting</h2>
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
              className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 dark:text-slate-400 transition-colors hover:text-slate-800 dark:text-slate-100"
            >
              {showAllMetrics ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              {showAllMetrics ? (isFrench ? 'Voir moins de métriques' : 'View fewer metrics') : (isFrench ? 'Voir plus de métriques' : 'View more metrics')}
            </button>
          )}
        </section>

        <div className="border-t border-slate-200 dark:border-slate-700" />

        {/* Tableau DMM coloré (étape × niveau) — engagements AGRÉGÉS de la région
            (somme des pays), même composant/couleurs que le Dashboard et les pays. */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <section className="rounded-2xl border border-slate-200 bg-white p-6">
            <DmmProgressTable
              engagements={regionDmmEngagements}
              isFrench={isFrench}
              title={isFrench ? '#Peuples par Statut & Niveau' : '#people groups by stages & levels'}
            />
          </section>
          <DmmStageGauge
            engagements={regionDmmEngagements}
            isFrench={isFrench}
            title={isFrench ? 'Progression DMM' : 'DMM progression'}
          />
        </div>

        <section className="p-0">
          {/* Collapsible Countries header: chevron on the left, blue title */}
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setCountriesOpen((v) => !v)}
              aria-expanded={countriesOpen}
              className="flex items-center gap-2 text-left"
            >
              {countriesOpen ? (
                <ChevronDown size={20} className="text-blue-600" />
              ) : (
                <ChevronRight size={20} className="text-blue-600" />
              )}
              <span className="text-sm font-semibold text-black uppercase">
                countries
              </span>
              <span className="text-slate-400 text-sm">({countries.length})</span>
            </button>
            {canManage && !creatingCountry && (
              <button
                type="button"
                onClick={() => setCreatingCountry(true)}
                className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {isFrench ? '＋ Créer un pays' : '＋ New country'}
              </button>
            )}
          </div>

          {creatingCountry && (
            <div className="mt-4">
              <CountryForm
                mode="create"
                regionId={regionId}
                onCancel={() => setCreatingCountry(false)}
                onSubmit={async (body) => {
                  await regionAdminApi.createCountry(body)
                  await queryClient.invalidateQueries({ queryKey: ['ng-region', regionId] })
                  setCreatingCountry(false)
                }}
                isFrench={isFrench}
              />
            </div>
          )}

          {countriesOpen && (
            countries.length === 0 ? (
              <div className="mt-4">
                <StateEmpty label={isFrench ? 'Aucun pays pour cette région.' : 'No country for this region.'} />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="py-2 pr-4 text-left text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                        country
                      </th>
                      <th className="py-2 px-4 text-right text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                        # ng engagements
                      </th>
                      <th className="py-2 px-4 text-right text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                        # churches
                      </th>
                      <th className="py-2 px-4 text-right text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                        max gen reached
                      </th>
                      <th className="py-2 pl-4 text-right text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                        # total believers
                      </th>
                      {canManage && (
                        <th className="py-2 pl-4 text-right text-xs font-semibold tracking-wide text-slate-500 dark:text-slate-400">
                          {isFrench ? 'actions' : 'actions'}
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {countries.map((country) => {
                      const s = country.summary || {}
                      return (
                        <tr
                          key={country.code}
                          className="border-b border-slate-100 dark:border-slate-700 last:border-0 hover:bg-slate-50 dark:bg-slate-900 transition-colors"
                        >
                          <td className="py-3 pr-4">
                            <Link
                              to={`/regions/${data.id}/countries/${country.code}`}
                              className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                            >
                              {country.name || country.nameEn}
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(s.engagements ?? 0)}</td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(s.churches ?? 0)}</td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(s.maxGeneration ?? 0)}</td>
                          <td className="py-3 pl-4 text-right tabular-nums font-bold text-slate-700">{fmt(s.totalBelievers ?? 0)}</td>
                          {canManage && (
                            <td className="py-3 pl-4 text-right">
                              <button
                                type="button"
                                onClick={() => setEditCountry(country)}
                                className="rounded border px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                              >
                                {isFrench ? 'Modifier' : 'Edit'}
                              </button>
                            </td>
                          )}
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

      {editCountry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-lg w-full bg-white rounded-xl p-4 max-h-[85vh] overflow-y-auto">
            <CountryForm
              mode="edit"
              regionId={regionId}
              initial={editCountry}
              onCancel={() => setEditCountry(null)}
              onSubmit={async (body) => {
                await regionAdminApi.updateCountry(editCountry.code, body)
                await queryClient.invalidateQueries({ queryKey: ['ng-region', regionId] })
                setEditCountry(null)
              }}
              isFrench={isFrench}
            />
            {editCountry.isCustom && (
              <div className="mt-3 border-t border-slate-200 pt-3">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = window.confirm(
                      isFrench ? 'Supprimer ce pays ?' : 'Delete this country?'
                    )
                    if (!ok) return
                    await regionAdminApi.deleteCountry(editCountry.code)
                    await queryClient.invalidateQueries({ queryKey: ['ng-region', regionId] })
                    setEditCountry(null)
                  }}
                  className="rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  {isFrench ? 'Supprimer le pays' : 'Delete country'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default RegionCountries
