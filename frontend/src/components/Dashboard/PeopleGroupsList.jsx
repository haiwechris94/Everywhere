import React, { useState, useMemo } from 'react'
import {
  Search,
  Filter,
  ChevronDown,
  ChevronRight,
  Globe,
  Users,
  Download,
  LayoutList,
  LayoutGrid,
  X,
  Check,
  Database,
} from 'lucide-react'
import { useLanguage } from '../../i18n'
import KPICards from './KPICards'

// Status colors configuration
const STATUS_COLORS = {
  unreached: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', hex: '#ef4444', label: 'Unreached' },
  pioneer: { bg: 'bg-orange-100', text: 'text-orange-700', border: 'border-orange-200', hex: '#f97316', label: 'Pioneer' },
  midway: { bg: 'bg-yellow-100', text: 'text-yellow-700', border: 'border-yellow-200', hex: '#eab308', label: 'Midway' },
  'tipping-point': { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', hex: '#22c55e', label: 'Tipping Point' },
  dmm: { bg: 'bg-green-100', text: 'text-green-700', border: 'border-green-200', hex: '#15803d', label: 'DMM' },
}

const STATUS_ORDER = ['unreached', 'pioneer', 'midway', 'tipping-point', 'dmm']
const HIERARCHY_ORDER = ['country', 'region', 'department', 'district', 'subDistrict']

const HIERARCHY_CONFIG = {
  country: { label: 'Pays', field: 'country' },
  region: { label: 'Région', field: 'region' },
  department: { label: 'District', field: 'departement' },
  district: { label: 'Sous-district', field: 'arrondissement' },
  subDistrict: { label: 'Village', field: 'villageName' },
}

const formatPeopleVillageName = (peopleName, villageName) => {
  const name = (peopleName || '').trim()
  const village = (villageName || '').trim()
  if (name && village) return `${name}, ${village}`
  return name || village || '-'
}

const PeopleGroupsList = ({ peopleGroups = [] }) => {
  const { t } = useLanguage()

  // Data sources configuration - extensible for future organisations
  const DATA_SOURCES = useMemo(() => [
    { value: 'all', label: t('common.all') || 'All data', color: 'bg-gray-100 text-gray-700' },
    { value: 'Survey', label: t('peopleMap.surveyData') || 'Survey', color: 'bg-purple-100 text-purple-700' },
    { value: 'DMM', label: 'DMM', color: 'bg-blue-100 text-blue-700' },
    { value: 'Joshua Project', label: 'Joshua Project', color: 'bg-amber-100 text-amber-700' },
    { value: 'Manual', label: t('common.import') || 'Manual', color: 'bg-gray-100 text-gray-600' },
    { value: 'PeopleGroups.org', label: 'IMB / PeopleGroups.org', color: 'bg-emerald-100 text-emerald-700' },
    { value: 'Finishing the Task', label: 'Finishing the Task', color: 'bg-violet-100 text-violet-700' },
    // Add new organisations here in the future
  ], [t])

  const SORT_OPTIONS = useMemo(() => [
    { value: 'name-asc', label: `${t('common.name') || 'Name'} (A-Z)` },
    { value: 'name-desc', label: `${t('common.name') || 'Name'} (Z-A)` },
    { value: 'population-desc', label: `${t('peopleMap.population') || 'Population'} ↓` },
    { value: 'population-asc', label: `${t('peopleMap.population') || 'Population'} ↑` },
    { value: 'churches-desc', label: `${t('dashboard.churches') || 'Churches'} ↓` },
    { value: 'status', label: t('common.status') || 'Status' },
  ], [t])

  const [searchTerm, setSearchTerm] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [activeStatuses, setActiveStatuses] = useState([])
  const [sortBy, setSortBy] = useState('name-asc')
  const [viewMode, setViewMode] = useState('hierarchy')
  const [hierarchyLevel, setHierarchyLevel] = useState('country')
  const [expandedGroups, setExpandedGroups] = useState(new Set())
  const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false)
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false)

  const matchesSource = (pg) => {
    if (sourceFilter === 'all') return true
    const src = pg.source || pg.dataSource || 'Manual'
    if (sourceFilter === 'Manual') return (!pg.source && !pg.dataSource) || pg.source === 'Manual'
    return src === sourceFilter
  }

  const matchesStatus = (pg) => {
    if (activeStatuses.length === 0) return true
    return activeStatuses.includes(pg.engagementStatus)
  }

  const matchesSearch = (pg) => {
    if (!searchTerm.trim()) return true
    const term = searchTerm.toLowerCase()
    return (
      (pg.name || '').toLowerCase().includes(term) ||
      (pg.language || '').toLowerCase().includes(term) ||
      (pg.religion || '').toLowerCase().includes(term) ||
      (pg.region || '').toLowerCase().includes(term) ||
      (pg.country || '').toLowerCase().includes(term)
    )
  }

  const filteredGroups = useMemo(() => {
    return peopleGroups.filter(pg => matchesSource(pg) && matchesStatus(pg) && matchesSearch(pg))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peopleGroups, sourceFilter, activeStatuses, searchTerm])

  const sortedGroups = useMemo(() => {
    const sorted = [...filteredGroups]
    switch (sortBy) {
      case 'name-asc': sorted.sort((a, b) => (a.name || '').localeCompare(b.name || '')); break
      case 'name-desc': sorted.sort((a, b) => (b.name || '').localeCompare(a.name || '')); break
      case 'population-desc': sorted.sort((a, b) => (b.population || 0) - (a.population || 0)); break
      case 'population-asc': sorted.sort((a, b) => (a.population || 0) - (b.population || 0)); break
      case 'churches-desc': sorted.sort((a, b) => (b.numberOfChurches || 0) - (a.numberOfChurches || 0)); break
      case 'status': sorted.sort((a, b) => {
        const ai = STATUS_ORDER.indexOf(a.engagementStatus)
        const bi = STATUS_ORDER.indexOf(b.engagementStatus)
        return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
      }); break
      default: break
    }
    return sorted
  }, [filteredGroups, sortBy])

  const groupedByCountry = useMemo(() => {
    const groups = {}
    sortedGroups.forEach(pg => {
      const country = pg.country || 'Unknown'
      if (!groups[country]) groups[country] = []
      groups[country].push(pg)
    })
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b))
  }, [sortedGroups])

  const getGroupStatusCounts = (items) => {
    const counts = {}
    items.forEach(pg => {
      if (pg.engagementStatus) counts[pg.engagementStatus] = (counts[pg.engagementStatus] || 0) + 1
    })
    return counts
  }

  const groupedByHierarchy = useMemo(() => {
    const config = HIERARCHY_CONFIG[hierarchyLevel]
    const nextLevel = HIERARCHY_ORDER[HIERARCHY_ORDER.indexOf(hierarchyLevel) + 1] || null
    const groups = {}

    sortedGroups.forEach(pg => {
      const key = pg?.[config.field] || 'Unknown'
      if (!groups[key]) groups[key] = []
      groups[key].push(pg)
    })

    return {
      items: Object.entries(groups)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, items]) => ({
          name,
          items,
          nextLevel,
          statusCounts: getGroupStatusCounts(items),
        })),
      nextLevel,
      config,
    }
  }, [sortedGroups, hierarchyLevel])

  const groupedByStatus = useMemo(() => {
    const groups = {}
    STATUS_ORDER.forEach(s => { groups[s] = [] })
    groups['unknown'] = []
    sortedGroups.forEach(pg => {
      const s = pg.engagementStatus || 'unknown'
      if (groups[s]) groups[s].push(pg)
      else groups['unknown'].push(pg)
    })
    return Object.entries(groups).filter(([, items]) => items.length > 0)
  }, [sortedGroups])

  const statusCounts = useMemo(() => {
    const counts = {}
    STATUS_ORDER.forEach(s => { counts[s] = 0 })
    filteredGroups.forEach(pg => {
      if (pg.engagementStatus && counts[pg.engagementStatus] !== undefined) {
        counts[pg.engagementStatus]++
      }
    })
    return counts
  }, [filteredGroups])

  const toggleStatus = (status) => {
    setActiveStatuses(prev =>
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    )
  }

  const toggleGroup = (key) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const expandAll = () => {
    const keys = viewMode === 'hierarchy'
      ? groupedByHierarchy.items.map(({ name }) => name)
      : viewMode === 'country'
        ? groupedByCountry.map(([c]) => c)
        : groupedByStatus.map(([s]) => s)
    setExpandedGroups(new Set(keys))
  }

  const collapseAll = () => setExpandedGroups(new Set())

  const exportCSV = () => {
    const headers = [
      t('common.name') || 'Name',
      t('peopleMap.country') || 'Country',
      t('common.status') || 'Status',
      t('peopleMap.population') || 'Population',
      t('dashboard.churches') || 'Churches',
      t('peopleMap.generation') || 'Generation',
      t('peopleMap.language') || 'Language',
      t('peopleMap.religion') || 'Religion',
      t('peopleMap.region') || 'Region',
      t('common.type') || 'Source',
      'Lat',
      'Lng'
    ]
    const rows = filteredGroups.map(pg => {
      const hasCoords = pg.location?.coordinates?.length >= 2
      return [
        pg.name || '', pg.country || '', pg.engagementStatus || '',
        pg.population || '', pg.numberOfChurches || 0, pg.churchGeneration || '',
        pg.language || '', pg.religion || '', pg.region || '',
        pg.source || pg.dataSource || (t('common.import') || 'Manual'),
        hasCoords ? pg.location.coordinates[1]?.toFixed(4) : '',
        hasCoords ? pg.location.coordinates[0]?.toFixed(4) : '',
      ]
    })
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `people-groups-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const StatusBadge = ({ status }) => {
    const colors = STATUS_COLORS[status] || { bg: 'bg-gray-100', text: 'text-gray-700', label: status || (t('common.unknown') || 'Unknown') }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
        {colors.label}
      </span>
    )
  }

  const tableHeaders = useMemo(() => [
    t('common.name') || 'Name',
    t('common.status') || 'Status',
    t('peopleMap.population') || 'Population',
    t('dashboard.churches') || 'Churches',
    t('peopleMap.generation') || 'Generation',
    t('peopleMap.language') || 'Language',
    t('peopleMap.religion') || 'Religion',
    t('peopleMap.region') || 'Region',
    t('peopleMap.coordinates') || 'Coordinates',
    t('common.type') || 'Source'
  ], [t])

  const renderTable = (items) => (
    <div className="overflow-x-auto mt-2 rounded-lg border border-gray-100">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            {tableHeaders.map(h => (
              <th key={h} className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {items.map((pg, idx) => {
            const hasCoords = pg.location?.coordinates?.length >= 2
            return (
              <tr key={pg._id || idx} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-2 whitespace-nowrap font-medium text-gray-900">{formatPeopleVillageName(pg.name, pg.villageName)}</td>
                <td className="px-4 py-2 whitespace-nowrap"><StatusBadge status={pg.engagementStatus} /></td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-600">{pg.population ? pg.population.toLocaleString() : '-'}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-600">{pg.numberOfChurches || 0}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-600">{pg.churchGeneration || '-'}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-600">{pg.language || '-'}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-600">{pg.religion || '-'}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-600">{pg.region || '-'}</td>
                <td className="px-4 py-2 whitespace-nowrap text-gray-500 font-mono text-xs">
                  {hasCoords ? `${pg.location.coordinates[1]?.toFixed(3)}, ${pg.location.coordinates[0]?.toFixed(3)}` : '-'}
                </td>
                <td className="px-4 py-2 whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600">
                    {pg.source || pg.dataSource || (t('common.import') || 'Manual')}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div className="space-y-4">
      <KPICards />

      <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 relative z-10">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <Users size={20} className="text-primary-600" />
          {t('dashboard.peopleGroups') || 'People Groups'}
          <span className="text-sm font-normal text-gray-500 ml-1">
            ({peopleGroups.length} total)
          </span>
        </h3>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 transition-colors"
        >
          <Download className="h-4 w-4" />
          {t('common.export') || 'Export'} CSV
        </button>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-gray-200 bg-gray-50/50">
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder={t('peopleMap.searchPlaceholder') || 'Search a people group...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-8 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Source dropdown */}
          <div className="relative">
            <button
              onClick={() => { setSourceDropdownOpen(!sourceDropdownOpen); setSortDropdownOpen(false) }}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-white bg-white shadow-sm"
            >
              <Database className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{DATA_SOURCES.find(s => s.value === sourceFilter)?.label || 'Source'}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
            {sourceDropdownOpen && (
              <div className="absolute z-20 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                {DATA_SOURCES.map(source => (
                  <button
                    key={source.value}
                    onClick={() => { setSourceFilter(source.value); setSourceDropdownOpen(false) }}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between transition-colors ${sourceFilter === source.value ? 'bg-blue-50' : ''}`}
                  >
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${source.color}`}>{source.label}</span>
                    {sourceFilter === source.value && <Check className="h-4 w-4 text-blue-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Sort dropdown */}
          <div className="relative">
            <button
              onClick={() => { setSortDropdownOpen(!sortDropdownOpen); setSourceDropdownOpen(false) }}
              className="flex items-center gap-2 px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-white bg-white shadow-sm"
            >
              <LayoutList className="h-4 w-4 text-gray-500" />
              <span className="font-medium">{SORT_OPTIONS.find(s => s.value === sortBy)?.label || (t('common.sort') || 'Sort')}</span>
              <ChevronDown className="h-4 w-4 text-gray-400" />
            </button>
            {sortDropdownOpen && (
              <div className="absolute z-20 mt-1 w-44 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                {SORT_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    onClick={() => { setSortBy(option.value); setSortDropdownOpen(false) }}
                    className={`w-full px-4 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center justify-between transition-colors ${sortBy === option.value ? 'bg-blue-50' : ''}`}
                  >
                    <span>{option.label}</span>
                    {sortBy === option.value && <Check className="h-4 w-4 text-blue-600" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden shadow-sm">
            <button
              onClick={() => setViewMode('hierarchy')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'hierarchy' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <Globe className="h-4 w-4" />
              Hiérarchie
            </button>
            <button
              onClick={() => setViewMode('status')}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${viewMode === 'status' ? 'bg-primary-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
            >
              <LayoutGrid className="h-4 w-4" />
              {t('common.status') || 'Status'}
            </button>
          </div>
        </div>
      </div>

      <div className="px-6 py-3 border-b border-gray-200 bg-slate-50/60 flex items-center gap-2 flex-wrap">
        {HIERARCHY_ORDER.map(level => (
          <button
            key={level}
            onClick={() => setHierarchyLevel(level)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${hierarchyLevel === level ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
          >
            {HIERARCHY_CONFIG[level].label}
          </button>
        ))}
      </div>

      {/* Status filter pills */}
      <div className="px-6 py-3 border-b border-gray-200 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide mr-1">{t('common.status') || 'Status'} :</span>
        <button
          onClick={() => setActiveStatuses([])}
          className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${activeStatuses.length === 0 ? 'bg-gray-800 text-white border-gray-800' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'}`}
        >
          {t('common.all') || 'All'}
        </button>
        {STATUS_ORDER.map(status => {
          const colors = STATUS_COLORS[status]
          const isActive = activeStatuses.includes(status)
          const count = statusCounts[status]
          return (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all border ${isActive ? `${colors.bg} ${colors.text} ${colors.border} shadow-sm` : `bg-white ${colors.text} ${colors.border} hover:${colors.bg}`}`}
            >
              {colors.label}
              {count > 0 && <span className="ml-1 opacity-75">({count})</span>}
            </button>
          )
        })}
      </div>

      {/* Stats summary bar */}
      <div className="px-6 py-2.5 border-b border-gray-100 bg-gray-50/30 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Users className="h-4 w-4 text-gray-400" />
          <span className="font-semibold text-gray-800">{filteredGroups.length}</span>
          <span>{t('dashboard.peopleGroups') || 'people groups'}</span>
          {filteredGroups.length !== peopleGroups.length && (
            <span className="text-gray-400">/ {peopleGroups.length}</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {STATUS_ORDER.map(status => {
            const colors = STATUS_COLORS[status]
            const count = statusCounts[status]
            if (!count) return null
            return (
              <span key={status} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: colors.hex }} />
                {count}
              </span>
            )
          })}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <button onClick={expandAll} className="text-primary-600 hover:text-primary-800 font-medium hover:underline">{t('common.expandAll') || 'Expand all'}</button>
          <span className="text-gray-300">|</span>
          <button onClick={collapseAll} className="text-primary-600 hover:text-primary-800 font-medium hover:underline">{t('common.collapseAll') || 'Collapse all'}</button>
        </div>
      </div>

      {/* Accordion list */}
      <div className="divide-y divide-gray-100">
        {viewMode === 'hierarchy' ? (
          groupedByHierarchy.items.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t('peopleMap.noPeopleFound') || 'No people group found'}</p>
            </div>
          ) : (
            groupedByHierarchy.items.map(({ name, items, statusCounts }) => {
              const isExpanded = expandedGroups.has(name)
              return (
                <div key={name}>
                  <button
                    onClick={() => toggleGroup(name)}
                    className="w-full px-6 py-3.5 flex items-center justify-between hover:bg-slate-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-400" /> : <ChevronRight className="h-4 w-4 text-gray-400" />}
                      <span className="font-semibold text-gray-800">{name}</span>
                      <span className="text-sm text-gray-400">({items.length})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {STATUS_ORDER.map(status => {
                        const count = statusCounts[status]
                        if (!count) return null
                        const colors = STATUS_COLORS[status]
                        return <span key={status} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${colors.bg} ${colors.text}`}>{count}</span>
                      })}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-6 pb-4">
                      {renderTable(items)}
                    </div>
                  )}
                </div>
              )
            })
          )
        ) : viewMode === 'country' ? (
          groupedByCountry.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t('peopleMap.noPeopleFound') || 'No people group found'}</p>
              {peopleGroups.length === 0 && <p className="text-sm mt-1 text-gray-300">{t('common.noData') || 'No data loaded'}</p>}
            </div>
          ) : (
            groupedByCountry.map(([country, items]) => {
              const isExpanded = expandedGroups.has(country)
              const groupStatusCounts = getGroupStatusCounts(items)
              return (
                <div key={country}>
                  <button
                    onClick={() => toggleGroup(country)}
                    className="w-full px-6 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      }
                      <Globe className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="font-semibold text-gray-800">{country}</span>
                      <span className="text-sm text-gray-400">({items.length})</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {STATUS_ORDER.map(status => {
                        const count = groupStatusCounts[status]
                        if (!count) return null
                        const colors = STATUS_COLORS[status]
                        return (
                          <span key={status} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${colors.bg} ${colors.text}`}>
                            {count}
                          </span>
                        )
                      })}
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-6 pb-4">
                      {renderTable(items)}
                    </div>
                  )}
                </div>
              )
            })
          )
        ) : (
          groupedByStatus.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{t('peopleMap.noPeopleFound') || 'No people group found'}</p>
            </div>
          ) : (
            groupedByStatus.map(([status, items]) => {
              const isExpanded = expandedGroups.has(status)
              const colors = STATUS_COLORS[status] || { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200', hex: '#6b7280', label: t('common.unknown') || 'Unknown' }
              return (
                <div key={status}>
                  <button
                    onClick={() => toggleGroup(status)}
                    className={`w-full px-6 py-3.5 flex items-center justify-between transition-colors text-left ${colors.bg} hover:opacity-90`}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded
                        ? <ChevronDown className={`h-4 w-4 ${colors.text} flex-shrink-0`} />
                        : <ChevronRight className={`h-4 w-4 ${colors.text} flex-shrink-0`} />
                      }
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colors.hex }} />
                      <span className={`font-semibold ${colors.text}`}>{colors.label}</span>
                      <span className={`text-sm ${colors.text} opacity-70`}>({items.length})</span>
                    </div>
                  </button>
                  {isExpanded && (
                    <div className="px-6 pb-4 bg-white">
                      {renderTable(items)}
                    </div>
                  )}
                </div>
              )
            })
          )
        )}
      </div>

      {/* Click outside to close dropdowns */}
      {(sourceDropdownOpen || sortDropdownOpen) && (
        <div className="fixed inset-0 z-10" onClick={() => { setSourceDropdownOpen(false); setSortDropdownOpen(false) }} />
      )}
      </div>
    </div>
  )
}

export default PeopleGroupsList
