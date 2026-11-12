/**
 * Hierarchical Table Component
 * Drill-down table for Country → Region → Department → District → Village
 */
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../services/api'
import { ChevronRight, ChevronDown, ChevronLeft, Home, ArrowUpDown, Loader2 } from 'lucide-react'
import { useLanguage } from '../../i18n'

// Status colors — alignées sur la convention carte / dashboard
// (pionnier=orange, mi-parcours=jaune, bascule=vert clair, mouvement=vert foncé).
const STATUS_COLORS = {
  unreached: '#ef4444',
  pioneer: '#f97316',
  midway: '#eab308',
  'tipping-point': '#4ade80',
  dmm: '#15803d'
}

const LEVEL_LABELS = {
  country: 'Pays',
  region: 'Région',
  department: 'Département',
  district: 'Arrondissement',
  village: 'Village'
}

const HierarchicalTable = () => {
  const { isFrench } = useLanguage()
  const [level, setLevel] = useState('country')
  const [parent, setParent] = useState(null)
  const [breadcrumbs, setBreadcrumbs] = useState([])
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const limit = 15

  const { data, isLoading, error, isFetching } = useQuery({
    queryKey: ['dashboard-hierarchical', level, parent, page, sortBy, sortOrder],
    queryFn: async () => {
      const response = await dashboardApi.getHierarchicalData({
        level,
        parent,
        page,
        limit,
        sortBy,
        sortOrder
      })
      return response.data.data
    },
    keepPreviousData: true
  })

  const handleDrillDown = (item) => {
    if (!item.hasChildren) return
    
    setBreadcrumbs([...breadcrumbs, { level, parent, name: parent || 'Tous' }])
    setParent(item.name)
    setLevel(item.nextLevel)
    setPage(1)
  }

  const handleBreadcrumbClick = (index) => {
    if (index === -1) {
      // Home clicked
      setBreadcrumbs([])
      setLevel('country')
      setParent(null)
      setPage(1)
    } else {
      const crumb = breadcrumbs[index]
      setBreadcrumbs(breadcrumbs.slice(0, index))
      setLevel(crumb.level)
      setParent(crumb.parent)
      setPage(1)
    }
  }

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')
    } else {
      setSortBy(field)
      setSortOrder('asc')
    }
    setPage(1)
  }

  const SortIcon = ({ field }) => (
    <ArrowUpDown 
      className={`w-4 h-4 inline ml-1 ${sortBy === field ? 'text-primary-600' : 'text-gray-400'}`}
    />
  )

  if (error) {
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
          Erreur: {error.message}
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-3">
          Données Hiérarchiques
        </h3>
        
        {/* Breadcrumbs */}
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <button
            onClick={() => handleBreadcrumbClick(-1)}
            className="flex items-center gap-1 text-primary-600 hover:text-primary-800"
          >
            <Home className="w-4 h-4" />
            <span>{isFrench ? 'Accueil' : 'Home'}</span>
          </button>
          
          {breadcrumbs.map((crumb, index) => (
            <div key={index} className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className="text-primary-600 hover:text-primary-800"
              >
                {crumb.name}
              </button>
            </div>
          ))}
          
          {parent && (
            <div className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <span className="text-gray-800 dark:text-slate-100 font-medium">{parent}</span>
            </div>
          )}
          
          <span className="ml-2 px-2 py-1 bg-gray-100 dark:bg-slate-800 rounded text-xs text-gray-600 dark:text-slate-400">
            {LEVEL_LABELS[level]}
          </span>
          
          {isFetching && (
            <Loader2 className="w-4 h-4 animate-spin text-primary-600 ml-2" />
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-900">
            <tr>
              <th 
                className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-slate-800"
                onClick={() => handleSort('name')}
              >
                Nom <SortIcon field="name" />
              </th>
              <th 
                className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-slate-800"
                onClick={() => handleSort('total')}
              >
                Total <SortIcon field="total" />
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-red-500 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.unreached }}></div>
                  Unr.
                </div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-orange-500 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.pioneer }}></div>
                  Pio.
                </div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-yellow-500 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.midway }}></div>
                  Mid.
                </div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-green-400 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS['tipping-point'] }}></div>
                  T.P.
                </div>
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-green-700 uppercase tracking-wider">
                <div className="flex items-center justify-center gap-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS.dmm }}></div>
                  DMM
                </div>
              </th>
              <th 
                className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-slate-800"
                onClick={() => handleSort('withDataPercentage')}
              >
                Couv. % <SortIcon field="withDataPercentage" />
              </th>
              <th 
                className="px-4 py-3 text-center text-xs font-medium text-gray-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:bg-slate-800"
                onClick={() => handleSort('saturationPercentage')}
              >
                Sat. % <SortIcon field="saturationPercentage" />
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-32"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-12 mx-auto"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-12 mx-auto"></div></td>
                </tr>
              ))
            ) : data?.items?.length === 0 ? (
              <tr>
                <td colSpan="9" className="px-4 py-8 text-center text-gray-500 dark:text-slate-400">
                  Aucune donnée disponible
                </td>
              </tr>
            ) : (
              data?.items?.map((item, index) => (
                <tr 
                  key={index}
                  className={`hover:bg-gray-50 dark:bg-slate-900 ${item.hasChildren ? 'cursor-pointer' : ''}`}
                  onClick={() => handleDrillDown(item)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {item.hasChildren ? (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      ) : (
                        <div className="w-4"></div>
                      )}
                      <span className="font-medium text-gray-800 dark:text-slate-100">{item.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center font-medium text-gray-800 dark:text-slate-100">
                    {item.total}
                  </td>
                  <td className="px-4 py-3 text-center text-red-600">
                    {item.unreached}
                  </td>
                  <td className="px-4 py-3 text-center text-orange-600">
                    {item.pioneer}
                  </td>
                  <td className="px-4 py-3 text-center text-yellow-600">
                    {item.midway}
                  </td>
                  <td className="px-4 py-3 text-center text-green-500">
                    {item.tippingPoint}
                  </td>
                  <td className="px-4 py-3 text-center text-green-700">
                    {item.dmm}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      item.withDataPercentage >= 75 ? 'bg-green-100 text-green-700' :
                      item.withDataPercentage >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      item.withDataPercentage >= 25 ? 'bg-orange-100 text-orange-700' :
                      'bg-red-100 text-red-700'
                    }`}>
                      {item.withDataPercentage}%
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      item.saturationPercentage >= 75 ? 'bg-green-100 text-green-700' :
                      item.saturationPercentage >= 50 ? 'bg-yellow-100 text-yellow-700' :
                      item.saturationPercentage >= 25 ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 dark:bg-slate-800 text-gray-700'
                    }`}>
                      {item.saturationPercentage}%
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data?.pagination && (
        <div className="px-4 py-3 border-t border-gray-200 dark:border-slate-700 flex items-center justify-between">
          <div className="text-sm text-gray-500 dark:text-slate-400">
            Page {data.pagination.page} sur {data.pagination.totalPages} ({data.pagination.total} éléments)
          </div>
          <div className="flex gap-2">
            <button aria-label={isFrench ? "Précédent" : "Previous"}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:bg-slate-900"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button aria-label={isFrench ? "Suivant" : "Next"}
              onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
              disabled={page >= data.pagination.totalPages}
              className="px-3 py-1 border border-gray-300 rounded text-sm disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:bg-slate-900"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default HierarchicalTable
