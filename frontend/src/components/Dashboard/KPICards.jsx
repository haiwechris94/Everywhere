/**
 * KPI Cards — Modern colorful design with DMM/Joshua Project toggle support
 */
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../services/api'
import { useDataSourceVisibility } from '../../pages/DashboardEnhanced'
import { peopleGroupsApi } from '../../services/api'
import { useMemo } from 'react'
import { TrendingUp, Target, Layers, Users, Flag } from 'lucide-react'
import { useLanguage } from '../../i18n'

// NEW COLOR SYSTEM
const STATUS_CONFIG = {
  unreached:       { label: 'Non atteint',   gradient: 'from-red-500 to-rose-600',       light: 'bg-red-50',    text: 'text-red-600',    border: 'border-red-100' },
  pioneer:         { label: 'Pioneer',        gradient: 'from-orange-400 to-orange-600',   light: 'bg-orange-50',  text: 'text-orange-600',  border: 'border-orange-100' },
  midway:          { label: 'Midway',         gradient: 'from-yellow-400 to-yellow-600',    light: 'bg-yellow-50',   text: 'text-yellow-600',   border: 'border-yellow-100' },
  'tipping-point': { label: 'Tipping Point',  gradient: 'from-emerald-400 to-emerald-600', light: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100' },
  dmm:             { label: 'DMM',            gradient: 'from-green-600 to-green-800',  light: 'bg-green-50',text: 'text-green-700',border: 'border-green-100' },
}

const KPICards = () => {
  const { t } = useLanguage()
  const { showDMM, showJoshuaProject } = useDataSourceVisibility()

  // Fetch all people groups to compute filtered counts
  const { data: allPeoples, isLoading: loadingPeoples } = useQuery({
    queryKey: ['kpi-all-peoples'],
    queryFn: async () => {
      const res = await peopleGroupsApi.getAll()
      return res.data.data || res.data || []
    },
    staleTime: 30000,
  })

  // Fetch base KPI (villages data)
  const { data: kpiData, isLoading: loadingKpi } = useQuery({
    queryKey: ['dashboard-kpi'],
    queryFn: async () => {
      const res = await dashboardApi.getKPISummary()
      return res.data.data
    },
    refetchInterval: 30000,
  })

  // Compute filtered counts based on toggles
  const computed = useMemo(() => {
    if (!allPeoples) return null

    const filtered = allPeoples.filter(pg => {
      const src = (pg.dataSource || '').toLowerCase()
      const isDMM = src !== 'joshua project' && src !== 'joshuaproject'
      const isJP  = src === 'joshua project' || src === 'joshuaproject'
      if (isDMM && !showDMM) return false
      if (isJP  && !showJoshuaProject) return false
      return true
    })

    const counts = { unreached: 0, pioneer: 0, midway: 0, 'tipping-point': 0, dmm: 0 }
    filtered.forEach(pg => {
      const s = pg.engagementStatus || pg.status || 'unreached'
      if (counts[s] !== undefined) counts[s]++
    })
    const total = filtered.length
    const pct = {}
    Object.keys(counts).forEach(k => {
      pct[k] = total > 0 ? Math.round((counts[k] / total) * 100) : 0
    })
    // Source breakdown (IMB / PeopleGroups.org & Finishing the Task) — independent of DMM/JP toggles
    const bySource = { imb: 0, ftt: 0 }
    allPeoples.forEach(pg => {
      const src = pg.source || pg.dataSource || ''
      if (src === 'PeopleGroups.org') bySource.imb++
      else if (src === 'Finishing the Task') bySource.ftt++
    })
    return { counts, pct, total, bySource }
  }, [allPeoples, showDMM, showJoshuaProject])

  const isLoading = loadingPeoples || loadingKpi

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-28 animate-pulse border border-slate-100" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white rounded-2xl h-20 animate-pulse border border-slate-100" />
          ))}
        </div>
      </div>
    )
  }

  const { counts, pct, total, bySource } = computed || { counts: {}, pct: {}, total: 0, bySource: { imb: 0, ftt: 0 } }
  const villages = kpiData?.villagesWithData ?? 0
  const totalVillages = kpiData?.totalVillages ?? 0
  const coveragePct = totalVillages > 0 ? Math.round((villages / totalVillages) * 100) : 0
  const dmmCount = counts['dmm'] || 0
  const satPct = total > 0 ? Math.round((dmmCount / total) * 100) : 0
  const imbPct = total > 0 ? Math.round(((bySource?.imb ?? 0) / total) * 100) : 0
  const fttPct = total > 0 ? Math.round(((bySource?.ftt ?? 0) / total) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {Object.entries(STATUS_CONFIG).map(([status, cfg]) => {
          const count = counts[status] || 0
          const percentage = pct[status] || 0
          return (
            <div
              key={status}
              className={`relative overflow-hidden rounded-2xl border ${cfg.border} bg-white shadow-sm hover:shadow-md transition-shadow group`}
            >
              {/* Colored top bar */}
              <div className={`h-1.5 w-full bg-gradient-to-r ${cfg.gradient}`} />
              <div className="p-4">
                <p className={`text-xs font-semibold uppercase tracking-wider ${cfg.text} mb-2`}>
                  {cfg.label}
                </p>
                <p className={`text-4xl font-bold ${cfg.text} leading-none`}>
                  {count.toLocaleString()}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex-1 bg-slate-100 rounded-full h-1.5 mr-2">
                    <div
                      className={`h-1.5 rounded-full bg-gradient-to-r ${cfg.gradient} transition-all duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-400 font-medium">{percentage}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Total */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white shadow-md p-5 flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-2.5">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-indigo-200 uppercase tracking-wide">{t('dashboard.totalPeoples') || 'Total peoples'}</p>
            <p className="text-3xl font-bold">{total.toLocaleString()}</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full" />
        </div>

        {/* Coverage */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-500 to-cyan-600 text-white shadow-md p-5 flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-2.5">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-sky-200 uppercase tracking-wide">{t('dashboard.villageCoverage') || 'Village coverage'}</p>
            <p className="text-3xl font-bold">{coveragePct}%</p>
            <p className="text-xs text-sky-200 mt-0.5">{villages} / {totalVillages}</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full" />
        </div>

        {/* Saturation */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md p-5 flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-2.5">
            <Target className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-200 uppercase tracking-wide">{t('dashboard.dmmSaturation') || 'DMM Saturation'}</p>
            <p className="text-3xl font-bold">{satPct}%</p>
            <p className="text-xs text-emerald-200 mt-0.5">{dmmCount} DMM / {total} total</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full" />
        </div>
      </div>

      {/* Source breakdown row — IMB / PeopleGroups.org & Finishing the Task */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* IMB / PeopleGroups.org */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500 to-green-600 text-white shadow-md p-5 flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-2.5">
            <Users className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-100 uppercase tracking-wide">IMB / PeopleGroups.org</p>
            <p className="text-3xl font-bold">{(bySource?.imb ?? 0).toLocaleString()}</p>
            <p className="text-xs text-emerald-100 mt-0.5">{imbPct}% du total · groupes de personnes</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full" />
        </div>

        {/* Finishing the Task */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md p-5 flex items-center gap-4">
          <div className="bg-white/20 rounded-xl p-2.5">
            <Flag className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-medium text-violet-100 uppercase tracking-wide">Finishing the Task</p>
            <p className="text-3xl font-bold">{(bySource?.ftt ?? 0).toLocaleString()}</p>
            <p className="text-xs text-violet-100 mt-0.5">{fttPct}% du total · UUPGs</p>
          </div>
          <div className="absolute -right-4 -bottom-4 w-24 h-24 bg-white/5 rounded-full" />
        </div>
      </div>
    </div>
  )
}

export default KPICards