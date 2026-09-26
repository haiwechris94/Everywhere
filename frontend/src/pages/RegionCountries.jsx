import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, MapPin } from 'lucide-react'
import { reportingApi } from '../services/reportingApi'
import { StateLoading, StateError, StateEmpty, StatCard } from './geography/geoComponents'
import { metricCards } from './regions/ngMetrics'

const RegionCountries = () => {
  const { regionId } = useParams()

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['ng-region', regionId],
    queryFn: async () => {
      const res = await reportingApi.getRegion(regionId)
      return res?.data?.data
    },
    enabled: !!regionId,
    retry: false,
  })

  if (isLoading) return <div className="p-6"><StateLoading label="Chargement de la région…" /></div>
  if (isError) {
    const notFound = error?.response?.status === 404
    return <div className="p-6"><StateError label={notFound ? 'Région introuvable.' : 'Erreur de chargement.'} /></div>
  }
  if (!data) return <div className="p-6">Région introuvable.</div>

  const countries = Array.isArray(data.countries) ? data.countries : []
  const cards = metricCards(data.metrics)

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-sm text-gray-500">
          <Link to="/regions" className="hover:text-slate-700">Regions</Link> / {data.name}
        </p>
        <h1 className="text-4xl font-bold text-slate-900">{data.fullName}</h1>
      </div>

      {/* Layout paysage : Reporting en haut (pleine largeur), Countries en dessous */}
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold mb-4">Reporting</h2>
          <div className="flex flex-wrap gap-3">
            {cards.map((c) => (
              <StatCard key={c.label} label={c.label} value={c.value} />
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-semibold mb-4">
            Countries <span className="text-slate-400 text-base">({countries.length})</span>
          </h2>
          {countries.length === 0 ? (
            <StateEmpty label="Aucun pays pour cette région." />
          ) : (
            <ul className="divide-y divide-slate-200">
              {countries.map((country) => (
                <li key={country.code}>
                  <Link
                    to={`/regions/${data.id}/countries/${country.code}`}
                    className="flex items-center justify-between py-3 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <MapPin size={15} className="text-slate-400" />
                      <span className="font-medium text-slate-900 hover:text-slate-700">
                        {country.name || country.nameEn}
                      </span>
                      <span className="text-sm text-slate-400">· {country.code}</span>
                    </div>
                    <ChevronRight size={18} className="text-slate-400" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

export default RegionCountries
