/**
 * AnalyticalTable Component
 * Comprehensive analytical table showing people groups, villages, and administrative data
 * with status information and DMM metrics
 */
import React, { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { peopleGroupsApi, villagesApi } from '../../services/api'
import { useLanguage } from '../../i18n'
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Search,
  Filter,
  Download,
  Users,
  MapPin,
  Building2,
  TrendingUp,
  AlertCircle,
  Loader2,
  X
} from 'lucide-react'

// Status configuration with colors and labels
const STATUS_CONFIG = {
  unreached: { color: '#EF4444', bgColor: 'bg-red-100', textColor: 'text-red-700', label: 'Non atteint' },
  pioneer: { color: '#F59E0B', bgColor: 'bg-amber-100', textColor: 'text-amber-700', label: 'Pioneer' },
  midway: { color: '#3B82F6', bgColor: 'bg-blue-100', textColor: 'text-blue-700', label: 'Midway' },
  'tipping-point': { color: '#F97316', bgColor: 'bg-orange-100', textColor: 'text-orange-700', label: 'Tipping Point' },
  dmm: { color: '#10B981', bgColor: 'bg-emerald-100', textColor: 'text-emerald-700', label: 'DMM' }
}

const StatusBadge = ({ status }) => {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.unreached
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.bgColor} ${config.textColor}`}>
      <span className="w-1.5 h-1.5 rounded-full mr-1.5" style={{ backgroundColor: config.color }}></span>
      {config.label}
    </span>
  )
}

const AnalyticalTable = ({ showDMM = true, showJoshuaProject = true }) => {
  const { t, isFrench } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [countryFilter, setCountryFilter] = useState('all')
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' })
  const [currentPage, setCurrentPage] = useState(1)
  const [expandedRows, setExpandedRows] = useState(new Set())
  const itemsPerPage = 15

  // Fetch people groups data
  const { data: peopleGroupsData, isLoading: loadingPeopleGroups, error: errorPeopleGroups } = useQuery({
    queryKey: ['analyticalTable-peopleGroups'],
    queryFn: async () => {
      const response = await peopleGroupsApi.getAll()
      return response.data.data || response.data || []
    },
    staleTime: 5 * 60 * 1000
  })

  // Fetch villages data
  const { data: villagesData, isLoading: loadingVillages, error: errorVillages } = useQuery({
    queryKey: ['analyticalTable-villages'],
    queryFn: async () => {
      const response = await villagesApi.getAll()
      return response.data.data || response.data || []
    },
    staleTime: 5 * 60 * 1000
  })

  // Process and combine data
  const processedData = useMemo(() => {
    if (!peopleGroupsData) return []

    // Create a map of villages for quick lookup
    // Ensure villagesData is always an array before processing
    const villageMap = new Map()
    const villagesArray = Array.isArray(villagesData) ? villagesData : (villagesData?.villages || [])
    if (villagesArray && villagesArray.length > 0) {
      villagesArray.forEach(village => {
        if (village?.name) {
          villageMap.set(village.name.toLowerCase(), village)
        }
        if (village?._id) {
          villageMap.set(village._id.toString(), village)
        }
      })
    }

    return peopleGroupsData.map(pg => {
      // Find associated village
      const village = pg.villageName 
        ? villageMap.get(pg.villageName.toLowerCase()) 
        : (pg.village ? villageMap.get(pg.village.toString()) : null)

      return {
        id: pg._id,
        name: pg.name || 'N/A',
        villageName: pg.villageName || village?.name || '-',
        country: pg.country || village?.country || '-',
        region: pg.region || village?.admin1 || village?.region || '-',
        department: village?.admin2 || village?.department || '-',
        arrondissement: village?.admin3 || village?.arrondissement || '-',
        status: pg.engagementStatus || pg.status || 'unreached',
        churches: pg.numberOfChurches || 0,
        generation: pg.churchGeneration || 0,
        population: pg.population || 0,
        latitude: pg.location?.coordinates?.[1] || null,
        longitude: pg.location?.coordinates?.[0] || null,
        createdAt: pg.createdAt,
        updatedAt: pg.updatedAt,
        dataSource: pg.dataSource || pg.source || '',
        joshuaProjectId: pg.joshuaProjectId || null,
        isJoshuaProject: pg.isJoshuaProject || false,
      }
    })
  }, [peopleGroupsData, villagesData])

  // Get unique countries for filter
  const countries = useMemo(() => {
    const countrySet = new Set(processedData.map(item => item.country).filter(c => c && c !== '-'))
    return Array.from(countrySet).sort()
  }, [processedData])

  // Filter and sort data
  const filteredData = useMemo(() => {
    let result = [...processedData]

    // Apply source filter (DMM / Joshua Project)
    if (!showDMM || !showJoshuaProject) {
      result = result.filter(item => {
        const source = item.dataSource || ''
        const isJP = source.toLowerCase().includes('joshua') || source === 'Joshua Project' || item.joshuaProjectId || item.isJoshuaProject
        const isDMM = !isJP
        if (isJP && !showJoshuaProject) return false
        if (isDMM && !showDMM) return false
        return true
      })
    }

    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      result = result.filter(item =>
        item.name.toLowerCase().includes(term) ||
        item.villageName.toLowerCase().includes(term) ||
        item.region.toLowerCase().includes(term) ||
        item.department.toLowerCase().includes(term)
      )
    }

    // Apply status filter
    if (statusFilter !== 'all') {
      result = result.filter(item => item.status === statusFilter)
    }

    // Apply country filter
    if (countryFilter !== 'all') {
      result = result.filter(item => item.country === countryFilter)
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal = a[sortConfig.key]
      let bVal = b[sortConfig.key]

      // Handle numeric values
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal
      }

      // Handle string values
      aVal = String(aVal || '').toLowerCase()
      bVal = String(bVal || '').toLowerCase()
      
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [processedData, searchTerm, statusFilter, countryFilter, sortConfig, showDMM, showJoshuaProject])

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage)
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  )

  // Calculate summary statistics
  const summaryStats = useMemo(() => {
    const stats = {
      total: filteredData.length,
      byStatus: {},
      totalChurches: 0,
      avgChurches: 0,
      withCoordinates: 0
    }

    Object.keys(STATUS_CONFIG).forEach(status => {
      stats.byStatus[status] = 0
    })

    filteredData.forEach(item => {
      if (stats.byStatus[item.status] !== undefined) {
        stats.byStatus[item.status]++
      }
      stats.totalChurches += item.churches
      if (item.latitude && item.longitude) {
        stats.withCoordinates++
      }
    })

    stats.avgChurches = stats.total > 0 ? Math.round(stats.totalChurches / stats.total) : 0

    return stats
  }, [filteredData])

  // Handle sort
  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }))
    setCurrentPage(1)
  }

  // Toggle row expansion
  const toggleRowExpansion = (id) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  // Export to CSV
  const exportToCSV = () => {
    const headers = [
      'Nom du peuple',
      'Village',
      'Pays',
      'Région (Admin 1)',
      'Département (Admin 2)',
      'Arrondissement (Admin 3)',
      'Statut DMM',
      'Églises',
      'Génération',
      'Population',
      'Latitude',
      'Longitude'
    ]

    const csvContent = [
      headers.join(';'),
      ...filteredData.map(item => [
        `"${item.name}"`,
        `"${item.villageName}"`,
        `"${item.country}"`,
        `"${item.region}"`,
        `"${item.department}"`,
        `"${item.arrondissement}"`,
        `"${STATUS_CONFIG[item.status]?.label || item.status}"`,
        item.churches,
        item.generation,
        item.population,
        item.latitude || '',
        item.longitude || ''
      ].join(';'))
    ].join('\n')

    const BOM = '\uFEFF'
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `analyse_peuples_${new Date().toISOString().split('T')[0]}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Sort icon component
  const SortIcon = ({ columnKey }) => {
    if (sortConfig.key !== columnKey) {
      return <ChevronDown className="w-4 h-4 text-gray-300" />
    }
    return sortConfig.direction === 'asc' 
      ? <ChevronUp className="w-4 h-4 text-primary-600" />
      : <ChevronDown className="w-4 h-4 text-primary-600" />
  }

  const isLoading = loadingPeopleGroups || loadingVillages
  const error = errorPeopleGroups || errorVillages

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="flex items-center gap-3 text-red-600">
          <AlertCircle className="w-5 h-5" />
          <span>Erreur lors du chargement des données: {error.message}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary-600" />
              Analyse Complète des Peuples et Villages
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              {filteredData.length} enregistrements • {summaryStats.totalChurches} églises au total
            </p>
          </div>

          <button
            onClick={exportToCSV}
            className="flex items-center gap-2 px-4 py-2 bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Exporter CSV
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <div 
              key={status}
              className={`${config.bgColor} rounded-lg p-3 cursor-pointer transition-all hover:scale-105 ${statusFilter === status ? 'ring-2 ring-offset-1' : ''}`}
              style={{ '--tw-ring-color': config.color }}
              onClick={() => setStatusFilter(statusFilter === status ? 'all' : status)}
            >
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: config.color }}></div>
                <span className={`text-xs font-medium ${config.textColor}`}>{config.label}</span>
              </div>
              <p className={`text-xl font-bold ${config.textColor} mt-1`}>
                {summaryStats.byStatus[status] || 0}
              </p>
            </div>
          ))}
        </div>

        {/* Filters - Minimalist */}
        <div className="flex flex-col md:flex-row gap-2 mt-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              placeholder={isFrench ? 'Rechercher...' : 'Search...'}
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
              className="w-full pl-9 pr-4 py-2 bg-slate-50 border-0 border-b-2 border-slate-200 focus:border-indigo-400 focus:bg-white rounded-t-lg text-sm outline-none transition-all"
            />
          </div>
          <select
            value={countryFilter}
            onChange={(e) => { setCountryFilter(e.target.value); setCurrentPage(1) }}
            className="px-3 py-2 bg-slate-50 border-0 border-b-2 border-slate-200 focus:border-indigo-400 rounded-t-lg text-sm outline-none transition-all min-w-[130px] text-slate-600"
          >
            <option value="all">{isFrench ? 'Tous les pays' : 'All countries'}</option>
            {countries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1) }}
            className="px-3 py-2 bg-slate-50 border-0 border-b-2 border-slate-200 focus:border-indigo-400 rounded-t-lg text-sm outline-none transition-all min-w-[130px] text-slate-600"
          >
            <option value="all">{isFrench ? 'Tous les statuts' : 'All statuses'}</option>
            {Object.entries(STATUS_CONFIG).map(([s, c]) => <option key={s} value={s}>{c.label}</option>)}
          </select>
          {(searchTerm || statusFilter !== 'all' || countryFilter !== 'all') && (
            <button
              onClick={() => { setSearchTerm(''); setStatusFilter('all'); setCountryFilter('all'); setCurrentPage(1) }}
              className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="w-8 px-2"></th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('name')}
              >
                <div className="flex items-center gap-1">
                  <Users className="w-4 h-4" />
                  Peuple
                  <SortIcon columnKey="name" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('villageName')}
              >
                <div className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  Village
                  <SortIcon columnKey="villageName" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('country')}
              >
                <div className="flex items-center gap-1">
                  Pays
                  <SortIcon columnKey="country" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors hidden lg:table-cell"
                onClick={() => handleSort('region')}
              >
                <div className="flex items-center gap-1">
                  <Building2 className="w-4 h-4" />
                  Admin 1
                  <SortIcon columnKey="region" />
                </div>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden xl:table-cell">
                Admin 2
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hidden xl:table-cell">
                Admin 3
              </th>
              <th 
                className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('status')}
              >
                <div className="flex items-center justify-center gap-1">
                  Statut
                  <SortIcon columnKey="status" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors"
                onClick={() => handleSort('churches')}
              >
                <div className="flex items-center justify-center gap-1">
                  Églises
                  <SortIcon columnKey="churches" />
                </div>
              </th>
              <th 
                className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100 transition-colors hidden md:table-cell"
                onClick={() => handleSort('generation')}
              >
                <div className="flex items-center justify-center gap-1">
                  Gén.
                  <SortIcon columnKey="generation" />
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="px-2 py-3"></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-24"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-16"></div></td>
                  <td className="px-4 py-3 hidden lg:table-cell"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                  <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                  <td className="px-4 py-3 hidden xl:table-cell"><div className="h-4 bg-gray-200 rounded w-20"></div></td>
                  <td className="px-4 py-3"><div className="h-6 bg-gray-200 rounded w-20 mx-auto"></div></td>
                  <td className="px-4 py-3"><div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div></td>
                  <td className="px-4 py-3 hidden md:table-cell"><div className="h-4 bg-gray-200 rounded w-8 mx-auto"></div></td>
                </tr>
              ))
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan="10" className="px-4 py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-gray-500">
                    <Search className="w-8 h-8 text-gray-300" />
                    <p className="font-medium">{isFrench ? 'Aucun résultat trouvé' : 'No result found'}</p>
                    <p className="text-sm">{isFrench ? 'Essayez de modifier vos filtres' : 'Try adjusting your filters'}</p>
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((item) => (
                <React.Fragment key={item.id}>
                  <tr 
                    className="hover:bg-gray-50 transition-colors cursor-pointer"
                    onClick={() => toggleRowExpansion(item.id)}
                  >
                    <td className="px-2 py-3 text-center">
                      <button className="text-gray-400 hover:text-gray-600">
                        {expandedRows.has(item.id) ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-800">{item.name}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{item.villageName}</td>
                    <td className="px-4 py-3 text-gray-600">{item.country}</td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">{item.region}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm hidden xl:table-cell">{item.department}</td>
                    <td className="px-4 py-3 text-gray-500 text-sm hidden xl:table-cell">{item.arrondissement}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold ${item.churches > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {item.churches}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-600 hidden md:table-cell">
                      {item.generation > 0 ? `G${item.generation}` : '-'}
                    </td>
                  </tr>
                  {/* Expanded Row Details */}
                  {expandedRows.has(item.id) && (
                    <tr key={`${item.id}-expanded`} className="bg-gray-50">
                      <td colSpan="10" className="px-4 py-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-gray-500 block">Population</span>
                            <span className="font-medium text-gray-800">
                              {item.population > 0 ? item.population.toLocaleString() : '-'}
                            </span>
                          </div>
                          <div>
                            <span className="text-gray-500 block">{isFrench ? 'Coordonnées' : 'Coordinates'}</span>
                            <span className="font-medium text-gray-800">
                              {item.latitude && item.longitude 
                                ? `${item.latitude.toFixed(4)}, ${item.longitude.toFixed(4)}`
                                : '-'}
                            </span>
                          </div>
                          <div className="lg:hidden">
                            <span className="text-gray-500 block">Région (Admin 1)</span>
                            <span className="font-medium text-gray-800">{item.region}</span>
                          </div>
                          <div className="xl:hidden">
                            <span className="text-gray-500 block">Département (Admin 2)</span>
                            <span className="font-medium text-gray-800">{item.department}</span>
                          </div>
                          <div className="xl:hidden">
                            <span className="text-gray-500 block">Arrondissement (Admin 3)</span>
                            <span className="font-medium text-gray-800">{item.arrondissement}</span>
                          </div>
                          <div className="md:hidden">
                            <span className="text-gray-500 block">{isFrench ? 'Génération' : 'Generation'}</span>
                            <span className="font-medium text-gray-800">
                              {item.generation > 0 ? `Génération ${item.generation}` : '-'}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-sm text-gray-500">
            Affichage {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredData.length)} sur {filteredData.length}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              <ChevronLeft className="w-4 h-4 -ml-2" />
            </button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1">
              {[...Array(Math.min(5, totalPages))].map((_, i) => {
                let pageNum
                if (totalPages <= 5) {
                  pageNum = i + 1
                } else if (currentPage <= 3) {
                  pageNum = i + 1
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i
                } else {
                  pageNum = currentPage - 2 + i
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                      currentPage === pageNum
                        ? 'bg-primary-600 text-white'
                        : 'hover:bg-gray-100 text-gray-600'
                    }`}
                  >
                    {pageNum}
                  </button>
                )
              })}
            </div>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-2 rounded-lg border border-gray-200 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
              <ChevronRight className="w-4 h-4 -ml-2" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AnalyticalTable
