import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { reportingApi } from '../services/reportingApi'
import { StateLoading, StateError, StateEmpty, StatCard } from './geography/geoComponents'
import { metricCards } from './regions/ngMetrics'
import { useLanguage } from '../i18n'

// Locale-aware thousands formatting for the numeric columns (e.g. 45000 -> 45 000).
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

const RegionCountries = () => {
  const { isFrench } = useLanguage()
  const { regionId } = useParams()
  const [countriesOpen, setCountriesOpen] = useState(true)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['ng-region', regionId],
    queryFn: async () => {
      const res = await reportingApi.getRegion(regionId)
      return res?.data?.data
    },
    enabled: !!regionId,
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          <Link to="/regions" className="font-bold hover:text-slate-700">Regions</Link> / {data.name}
        </p>
        <h1 className="text-4xl font-bold text-slate-900">{data.fullName}</h1>
      </div>

      {/* Layout paysage : Reporting en haut (pleine largeur), Countries en dessous */}
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold mb-4">Reporting</h2>
          {/* Cartes de métriques : une seule grille fluide. Les groupes bleu (ligne 1)
              et vert (ligne 2) partagent désormais le même conteneur, donc quand une
              carte de la 1re ligne passe à la ligne suivante, les cartes de la 2e ligne
              remontent pour combler l'espace au lieu de rester sur une ligne séparée.
              Chaque carte conserve sa couleur d'accent d'origine. */}
          <div className="flex flex-wrap gap-3">
            {cards.map((c) => (
              <StatCard key={c.label} label={c.label} value={c.value} accent={c.accent} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          {/* Collapsible Countries header: chevron on the left, blue title */}
          <button
            type="button"
            onClick={() => setCountriesOpen((v) => !v)}
            aria-expanded={countriesOpen}
            className="flex w-full items-center gap-2 text-left"
          >
            {countriesOpen ? (
              <ChevronDown size={20} className="text-blue-600" />
            ) : (
              <ChevronRight size={20} className="text-blue-600" />
            )}
            <span className="text-base font-semibold text-black uppercase">
              countries
            </span>
            <span className="text-slate-400 text-sm">({countries.length})</span>
          </button>

          {countriesOpen && (
            countries.length === 0 ? (
              <div className="mt-4">
                <StateEmpty label={isFrench ? 'Aucun pays pour cette région.' : 'No country for this region.'} />
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-4 text-left text-xs font-semibold tracking-wide text-slate-500">
                        country
                      </th>
                      <th className="py-2 px-4 text-right text-xs font-semibold tracking-wide text-slate-500">
                        # ng engagements
                      </th>
                      <th className="py-2 px-4 text-right text-xs font-semibold tracking-wide text-slate-500">
                        # churches
                      </th>
                      <th className="py-2 px-4 text-right text-xs font-semibold tracking-wide text-slate-500">
                        max gen reached
                      </th>
                      <th className="py-2 pl-4 text-right text-xs font-semibold tracking-wide text-slate-500">
                        # total believers
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {countries.map((country) => {
                      const s = country.summary || {}
                      return (
                        <tr
                          key={country.code}
                          className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
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

export default RegionCountries
