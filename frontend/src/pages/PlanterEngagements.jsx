import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, MapPin, Church, Loader2 } from 'lucide-react'
import { masterPeopleApi } from '../services/api'

/**
 * PlanterEngagements — lists every engagement (people group) a given church
 * planter (implanteur) works on. Reached by clicking a planter name in a people
 * / engagement detail sheet: /planters/:name/engagements
 */
export default function PlanterEngagements() {
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
        <ArrowLeft className="h-4 w-4" /> Retour
      </button>

      <div className="mb-4">
        <h1 className="text-xl font-bold">Engagements de {displayName}</h1>
        {!isLoading && !error && (
          <p className="text-sm text-gray-500">
            {data?.count ?? 0} engagement{(data?.count ?? 0) > 1 ? 's' : ''}
            {data?.totalChurches ? ` · ${data.totalChurches} église${data.totalChurches > 1 ? 's' : ''} au total` : ''}
          </p>
        )}
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-10 text-gray-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Chargement…
        </div>
      )}

      {error && (
        <p className="py-10 text-red-600">Erreur de chargement des engagements.</p>
      )}

      {!isLoading && !error && engagements.length === 0 && (
        <p className="py-10 text-gray-500">Aucun engagement trouvé pour cet implanteur.</p>
      )}

      {!isLoading && !error && engagements.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-3 py-2">Engagement</th>
                <th className="px-3 py-2">Village</th>
                <th className="px-3 py-2">Région</th>
                <th className="px-3 py-2">Statut</th>
                <th className="px-3 py-2 text-right">Églises</th>
                <th className="px-3 py-2 text-right">Génération</th>
                <th className="px-3 py-2">Période</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {engagements.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-medium">
                    <Link to={`/people-groups/${e.id}`} className="text-blue-600 hover:underline">
                      {e.name}
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
                  <td className="px-3 py-2 text-gray-600">{e.engagementStatus || '—'}</td>
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
