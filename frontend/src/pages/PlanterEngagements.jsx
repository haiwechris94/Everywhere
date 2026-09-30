import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Church, Loader2 } from 'lucide-react'
import { masterPeopleApi } from '../services/api'
import { DmmStatusDot } from '../components/DmmStatusBadge'
import { useLanguage } from '../i18n'

/**
 * PlanterEngagements — lists every engagement (people group) a given church
 * planter (implanteur) works on. Reached by clicking a planter name in a people
 * / engagement detail sheet: /planters/:name/engagements
 */
export default function PlanterEngagements() {
  const { isFrench } = useLanguage()
  const { name } = useParams()
  const navigate = useNavigate()
  const displayName = (() => {
    try { return decodeURIComponent(name || '') } catch { return name || '' }
  })()

  const { data, isLoading, error } = useQuery({
    queryKey: ['planter-engagements', name],
    queryFn: async () => (await masterPeopleApi.getPlanterEngagements(name)).data,
    enabled: !!name,
  })

  const engagements = data?.engagements || []

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <button
        onClick={() => navigate(-1)}
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800"
      >
        <ArrowLeft className="h-4 w-4" /> {isFrench ? 'Retour' : 'Back'}
      </button>

      <div className="mb-4">
        <h1 className="text-xl font-bold">{isFrench ? `Engagements de ${displayName}` : `Engagements of ${displayName}`}</h1>
        {!isLoading && !error && (
          <p className="text-sm text-gray-500">
            {data?.count ?? 0} engagement{(data?.count ?? 0) > 1 ? 's' : ''}
            {data?.totalChurches ? (isFrench ? ` · ${data.totalChurches} église${data.totalChurches > 1 ? 's' : ''} au total` : ` · ${data.totalChurches} church${data.totalChurches > 1 ? 'es' : ''} in total`) : ''}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> {isFrench ? 'Chargement…' : 'Loading…'}
        </div>
      )}

      {error && (
        <p className="py-10 text-red-600">{isFrench ? 'Erreur de chargement des engagements.' : 'Error loading engagements.'}</p>
      )}

      {!isLoading && !error && engagements.length === 0 && (
        <p className="py-10 text-gray-500">{isFrench ? 'Aucun engagement trouvé pour cet implanteur.' : 'No engagement found for this church planter.'}</p>
      )}

      {!isLoading && !error && engagements.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Engagement</th>
                <th className="px-3 py-2">Village</th>
                <th className="px-3 py-2">{isFrench ? 'Région' : 'Region'}</th>
                <th className="px-3 py-2">{isFrench ? 'Statut' : 'Status'}</th>
                <th className="px-3 py-2 text-right">{isFrench ? 'Églises' : 'Churches'}</th>
                <th className="px-3 py-2 text-right">{isFrench ? 'Génération' : 'Generation'}</th>
                <th className="px-3 py-2">{isFrench ? 'Période' : 'Period'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {engagements.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    {/* Le nom de l'engagement mène à SA fiche (fiche Engagement). */}
                    <Link to={`/engagements/${e.id}`} className="text-blue-600 hover:underline">
                      {e.villageName || e.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-gray-600">
                    {e.villageName ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-gray-400" /> {e.villageName}
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600">{e.region || '—'}</td>
                  <td className="px-3 py-2"><DmmStatusDot engagement={e} /></td>
                  <td className="px-3 py-2 text-right">
                    <span className="inline-flex items-center gap-1">
                      <Church className="h-3 w-3 text-gray-400" /> {e.numberOfChurches ?? 0}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">{e.churchGeneration ?? 0}</td>
                  <td className="px-3 py-2 text-gray-600">{e.reportPeriod || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
