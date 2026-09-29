import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { reportingApi } from '../services/reportingApi'
import { StateLoading, StateError, StateEmpty } from './geography/geoComponents'
import { useLanguage } from '../i18n'

const Regions = () => {
  const { isFrench } = useLanguage()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ng-regions'],
    queryFn: async () => {
      const res = await reportingApi.getRegions()
      return Array.isArray(res?.data?.data) ? res.data.data : []
    },
  })

  const regions = data || []

  return (
    <div className="p-6 space-y-6">
      <div>
        <p className="text-sm font-bold text-gray-500">Regions</p>
        <h1 className="text-4xl font-bold text-slate-900">Regions</h1>
      </div>

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des régions…' : 'Loading regions…'} />
      ) : isError ? (
        <StateError label={isFrench ? 'Impossible de charger les régions.' : 'Unable to load regions.'} />
      ) : regions.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucune région disponible.' : 'No region available.'} />
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {regions.map((region) => (
            <Link
              key={region.id}
              to={`/regions/${region.id}`}
              className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Sigle mis en avant, nom complet juste en dessous.
                  Ex. « FCA » puis « Francophone Central Africa ». */}
              <h2 className="text-3xl font-bold tracking-tight text-slate-900">{region.name}</h2>
              {region.fullName && (
                <p className="mt-1 text-sm text-slate-500">{region.fullName}</p>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default Regions
