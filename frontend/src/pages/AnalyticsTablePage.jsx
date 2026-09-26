import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../services/api'
import { useLanguage } from '../i18n'
import { Filter, Loader2, Search, SlidersHorizontal, Users, MapPin } from 'lucide-react'

const STATUS_META = {
  unreached: { label: 'Unreached', chip: 'bg-red-100 text-red-700 border-red-200', cell: 'text-red-700 bg-red-50' },
  pioneer: { label: 'Pioneer', chip: 'bg-orange-100 text-orange-700 border-orange-200', cell: 'text-orange-700 bg-orange-50' },
  midway: { label: 'Midway', chip: 'bg-amber-100 text-amber-700 border-amber-200', cell: 'text-amber-700 bg-amber-50' },
  'tipping-point': { label: 'Tipping Point', chip: 'bg-emerald-100 text-emerald-700 border-emerald-200', cell: 'text-emerald-700 bg-emerald-50' },
  dmm: { label: 'DMM', chip: 'bg-green-100 text-green-800 border-green-200', cell: 'text-green-800 bg-green-50' },
}

const formatPercent = (value = 0) => `${Math.round(Number(value) || 0)}%`

const AnalyticsTablePage = () => {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')

  const { data, isLoading, error } = useQuery({
    queryKey: ['analytics-table-page', search, statusFilter, sourceFilter],
    queryFn: async () => {
      const response = await dashboardApi.getHierarchicalData({
        level: 'village',
        page: 1,
        limit: 200,
        sortBy: 'name',
        sortOrder: 'asc',
      })
      return response.data.data
    },
  })

  const rows = useMemo(() => {
    const items = data?.items || []
    const normalizedSearch = search.trim().toLowerCase()

    return items.filter((item) => {
      const matchesSearch = !normalizedSearch || [item.name, item.parentName, item.country].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedSearch))
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter
      const matchesSource = sourceFilter === 'all' || item.source === sourceFilter
      return matchesSearch && matchesStatus && matchesSource
    })
  }, [data, search, statusFilter, sourceFilter])

  const stats = useMemo(() => {
    const total = rows.length
    const withData = rows.filter((row) => Number(row.withDataPercentage || 0) > 0).length
    const reached = rows.filter((row) => row.status === 'dmm').length
    const inProgress = rows.filter((row) => row.status === 'pioneer' || row.status === 'midway' || row.status === 'tipping-point').length
    return { total, withData, reached, inProgress }
  }, [rows])

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-[1600px] px-4 py-6 lg:px-6">
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-indigo-700">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Analytics Table
              </div>
              <h1 className="mt-3 text-3xl font-bold text-slate-900">Village and People Analytics</h1>
              <p className="mt-2 max-w-3xl text-sm text-slate-500">A dedicated table view for monitoring village and people engagement with status-colored columns, search, and quick filters.</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[560px]">
              {[
                { label: 'Rows', value: stats.total, icon: MapPin, tone: 'from-sky-500 to-cyan-500' },
                { label: 'With data', value: stats.withData, icon: Filter, tone: 'from-emerald-500 to-green-500' },
                { label: 'Reached', value: stats.reached, icon: Users, tone: 'from-violet-500 to-indigo-500' },
                { label: 'In progress', value: stats.inProgress, icon: Loader2, tone: 'from-orange-500 to-amber-500' },
              ].map((card) => (
                <div key={card.label} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-slate-500">
                    <span>{card.label}</span>
                    <span className={`rounded-full bg-gradient-to-r ${card.tone} p-2 text-white`}>
                      <card.icon className="h-3.5 w-3.5" />
                    </span>
                  </div>
                  <div className="mt-3 text-2xl font-bold text-slate-900">{card.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-[1.4fr_repeat(2,minmax(180px,240px))]">
            <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search villages, regions, countries..." className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </label>

            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none">
              <option value="all">All status</option>
              {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
            </select>

            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 outline-none">
              <option value="all">All sources</option>
              <option value="dmm">DMM</option>
              <option value="joshua-project">Joshua Project</option>
            </select>
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-900 text-white">
                <tr>
                  {['Village', 'Country', 'Region', 'People Group', 'Status', 'Population', 'Churches', 'Coverage', 'Saturation'].map((head) => (
                    <th key={head} className="whitespace-nowrap px-4 py-4 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {isLoading ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 9 }).map((__, j) => <td key={j} className="px-4 py-4"><div className="h-4 rounded bg-slate-200" /></td>)}
                  </tr>
                )) : error ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-red-600">Failed to load analytics table.</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="px-4 py-10 text-center text-sm text-slate-500">No rows match the current filters.</td></tr>
                ) : rows.map((row, idx) => {
                  const meta = STATUS_META[row.status] || { label: row.status || 'Unknown', chip: 'bg-slate-100 text-slate-700 border-slate-200', cell: 'text-slate-700 bg-slate-50' }
                  return (
                    <tr key={`${row.name}-${idx}`} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-4">
                        <div className="font-semibold text-slate-900">{row.name}</div>
                        <div className="text-xs text-slate-500">{row.parentName || row.district || row.department || '-'}</div>
                      </td>
                      <td className="px-4 py-4 text-sm text-slate-600">{row.country || '-'}</td>
                      <td className="px-4 py-4 text-sm text-slate-600">{row.region || row.department || '-'}</td>
                      <td className="px-4 py-4 text-sm text-slate-700">{row.peopleGroup || row.peopleGroupName || '-'}</td>
                      <td className="px-4 py-4"><span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${meta.chip}`}>{meta.label}</span></td>
                      <td className="px-4 py-4 text-right text-sm font-medium text-slate-800">{Number(row.population || 0).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right text-sm font-medium text-slate-800">{Number(row.churches || 0).toLocaleString()}</td>
                      <td className="px-4 py-4 text-right"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${meta.cell}`}>{formatPercent(row.withDataPercentage)}</span></td>
                      <td className="px-4 py-4 text-right"><span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{formatPercent(row.saturationPercentage)}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AnalyticsTablePage
