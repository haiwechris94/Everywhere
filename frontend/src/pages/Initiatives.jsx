import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { initiativesApi } from '../services/reportingApi'
import { StateLoading, StateError, StateEmpty } from './geography/geoComponents'
import { useLanguage } from '../i18n'
import { initiativeDisplayName } from '../utils/initiativeLabel'

// Locale-aware thousands formatting for the numeric columns (e.g. 45000 -> 45 000).
// Même formatage que les colonnes numériques des pages Regions / Pays.
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

// Synthetic initiative always shown in the list. Merged with whatever the backend
// returns and deduped by name (case-insensitive) so that if a real "Media
// Multipliers" initiative is added later, it replaces this placeholder instead of
// producing a duplicate row.
const SYNTHETIC_INITIATIVES = [
  {
    key: 'MEDIA_MULTIPLIERS',
    name: 'Media Multipliers',
    fullName: 'Media Multipliers',
    countryCount: 0,
    peopleCount: 0,
    synthetic: true,
  },
]

/**
 * Page « Initiatives » (anciennement « Projects »).
 *
 * Liste des initiatives structurées (ESP 300, YCS, …) avec, par initiative, le
 * nombre de pays DISTINCTS et de peuples DISTINCTS engagés. La source est
 * l'endpoint /api/initiatives, qui renvoie désormais countryCount / peopleCount.
 *
 * Présentation en mode liste (pas de cartes), même police et mêmes couleurs que
 * la section « countries » des fiches Régions et la page Pays :
 *   #  |  Nom / Name  |  Pays / Countries  |  Peuples / People groups
 */
const Initiatives = () => {
  const { isFrench } = useLanguage()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['initiatives-list'],
    queryFn: async () => {
      const res = await initiativesApi.list()
      return Array.isArray(res?.data?.data) ? res.data.data : []
    },
  })

  // Merge the backend list with the synthetic rows, deduping by name so a real
  // backend row always wins over the placeholder with the same name.
  const initiatives = useMemo(() => {
    const fetched = data || []
    const byName = new Map()
    fetched.forEach((i) => {
      if (i && i.name) byName.set(i.name.trim().toLowerCase(), i)
    })
    const merged = [...fetched]
    SYNTHETIC_INITIATIVES.forEach((s) => {
      if (!byName.has(s.name.trim().toLowerCase())) merged.push(s)
    })
    return merged
  }, [data])

  return (
    <div className="p-6 space-y-6">
      {/* En-tête : même mise en forme que les pages Regions / Pays (petit libellé
          gris en gras au-dessus, grand titre slate-900 en dessous). */}
      <div>
        <p className="text-sm font-bold text-gray-500">{isFrench ? 'Initiatives' : 'Initiatives'}</p>
        <h1 className="text-4xl font-bold text-slate-900">{isFrench ? 'Initiatives' : 'Initiatives'}</h1>
      </div>

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des initiatives…' : 'Loading initiatives…'} />
      ) : isError ? (
        <StateError label={isFrench ? 'Impossible de charger les initiatives.' : 'Unable to load initiatives.'} />
      ) : initiatives.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucune initiative disponible.' : 'No initiative available.'} />
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-right text-xs font-semibold tracking-wide text-slate-500 w-12">
                    #
                  </th>
                  <th className="py-2 px-4 text-left text-xs font-semibold tracking-wide text-slate-500">
                    {isFrench ? 'Nom' : 'Name'}
                  </th>
                  <th className="py-2 px-4 text-right text-xs font-semibold tracking-wide text-slate-500">
                    {isFrench ? 'Pays' : 'Countries'}
                  </th>
                  <th className="py-2 px-4 text-right text-xs font-semibold tracking-wide text-slate-500">
                    {isFrench ? 'Peuples' : 'People groups'}
                  </th>
                  <th className="py-2 pl-4 text-left text-xs font-semibold tracking-wide text-slate-500">
                    {isFrench ? 'Statut du projet' : 'Project Status'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {initiatives.map((initiative, index) => (
                  <tr
                    key={initiative.key || initiative.name}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                  >
                    {/* Numéro de ligne : 1, 2, 3 … */}
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-400">{index + 1}</td>
                    <td className="py-3 px-4">
                      {initiative.key && !initiative.synthetic ? (
                        <Link
                          to={`/initiatives/${initiative.key}`}
                          className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                          {initiativeDisplayName(initiative.key || initiative.name, { isFrench }, initiative.name)}
                        </Link>
                      ) : (
                        <span className="font-medium text-slate-700">{initiativeDisplayName(initiative.key || initiative.name, { isFrench }, initiative.name)}</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">
                      {fmt(initiative.countryCount ?? 0)}
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">
                      {fmt(initiative.peopleCount ?? 0)}
                    </td>
                    <td className="py-3 pl-4 text-left">
                      {((initiative.countryCount ?? 0) > 0 || (initiative.peopleCount ?? 0) > 0) ? (
                        <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
                          {isFrench ? 'Actif' : 'Active'}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-500">
                          {isFrench ? 'Inactif' : 'Inactive'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

export default Initiatives
