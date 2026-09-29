/**
 * PeoplesList — dedicated list view for Peoples (Master People hub entry).
 * Previously this listing was buried inside UnifiedMapView; here it is a
 * first-class, searchable list. Each row links to the enriched people sheet
 * (/peoples/:id) with Profil / Sources / Multiplication / Reporting tabs.
 */
import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { peopleGroupsApi } from '../../services/api'
import { useLanguage } from '../../i18n'
import { Search, ChevronRight, Users } from 'lucide-react'
import {
  PageHeader,
  StateLoading,
  StateError,
  StateEmpty,
} from '../geography/geoComponents'

const statusBadge = (status) => {
  const map = {
    pioneer: 'bg-yellow-100 text-yellow-800',
    midway: 'bg-blue-100 text-blue-800',
    'tipping-point': 'bg-orange-100 text-orange-800',
    dmm: 'bg-green-100 text-green-800',
  }
  return map[status] || 'bg-neutral-100 text-neutral-600'
}

const PeoplesList = () => {
  const { t, isFrench } = useLanguage()
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: ['peoples-list'],
    queryFn: async () => {
      const res = await peopleGroupsApi.getAll({ limit: 500 })
      const d = res?.data
      return Array.isArray(d?.data || d?.peopleGroups || d) ? d.data || d.peopleGroups || d : []
    },
  })

  const list = Array.isArray(data) ? data : []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return list
    return list.filter((pg) =>
      `${pg.name || ''} ${pg.region || ''} ${pg.status || ''}`.toLowerCase().includes(q)
    )
  }, [list, search])

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: t('nav.peoples') || 'Peuples' }]}
        title={t('nav.peoples') || 'Peuples'}
        subtitle={
          t('peoples.subtitle') ||
          'Entité centrale : les métriques de multiplication (personnes de paix, groupes de découverte, DBS, églises, coaching) se rattachent à un peuple.'
        }
        stats={[{ label: t('nav.peoples') || 'Peuples', value: list.length }]}
      />

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('common.search') || 'Rechercher un peuple…'}
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
        />
      </div>

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des peuples…' : 'Loading people groups…'} />
      ) : isError ? (
        <StateError />
      ) : filtered.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucun peuple trouvé.' : 'No people group found.'} />
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400 border-b border-neutral-200 bg-neutral-50">
                <th className="py-2.5 px-4 font-medium">{isFrench ? 'Peuple' : 'People group'}</th>
                <th className="py-2.5 px-4 font-medium">{isFrench ? 'Région' : 'Region'}</th>
                <th className="py-2.5 px-4 font-medium">{isFrench ? 'Statut' : 'Status'}</th>
                <th className="py-2.5 px-4 font-medium">Population</th>
                <th className="py-2.5 px-4 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((pg, i) => (
                <tr
                  key={pg._id || i}
                  className="border-b border-neutral-100 hover:bg-neutral-50"
                >
                  <td className="py-2.5 px-4">
                    <Link
                      to={`/peoples/${pg._id}`}
                      className="font-medium text-neutral-800 hover:text-neutral-900 flex items-center gap-2"
                    >
                      <Users size={15} className="text-neutral-400" />
                      {pg.name || '—'}
                    </Link>
                  </td>
                  <td className="py-2.5 px-4 text-neutral-600">{pg.region || '—'}</td>
                  <td className="py-2.5 px-4">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(
                        pg.status
                      )}`}
                    >
                      {pg.status || '—'}
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-neutral-600">
                    {typeof pg.population === 'number'
                      ? pg.population.toLocaleString('fr-FR')
                      : pg.population || '—'}
                  </td>
                  <td className="py-2.5 px-4 text-right">
                    <Link to={`/peoples/${pg._id}`}>
                      <ChevronRight size={16} className="text-neutral-400 inline" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PeoplesList
