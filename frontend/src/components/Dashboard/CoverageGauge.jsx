/**
 * Coverage Gauge — Modern design with DMM/Joshua Project toggle support
 */
import { useQuery } from '@tanstack/react-query'
import { dashboardApi, peopleGroupsApi } from '../../services/api'
import { useDataSourceVisibility } from '../../pages/DashboardEnhanced'
import { useMemo } from 'react'

const ArcGauge = ({ value, max = 100, color, label, sublabel }) => {
  const pct = Math.min(Math.max(value / max, 0), 1)
  const r = 52
  const cx = 70
  const cy = 70
  const startAngle = Math.PI
  const endAngle = 0
  const arcLength = Math.PI * r
  const progress = pct * arcLength

  const polarToCartesian = (angle) => ({
    x: cx + r * Math.cos(angle),
    y: cy - r * Math.sin(angle),
  })

  const start = polarToCartesian(startAngle)
  const end = polarToCartesian(endAngle)

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <svg width="140" height="80" viewBox="0 0 140 80">
          {/* Track */}
          <path
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`}
            fill="none"
            stroke="#F1F5F9"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {/* Progress */}
          <path
            d={`M ${start.x} ${start.y} A ${r} ${r} 0 0 1 ${end.x} ${end.y}`}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${arcLength}`}
            style={{ transition: 'stroke-dasharray 0.8s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-end justify-center pb-1">
          <span className="text-2xl font-bold" style={{ color }}>{value}%</span>
        </div>
      </div>
      <p className="text-xs font-semibold text-slate-700 mt-1 dark:text-slate-300">{label}</p>
      {sublabel && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{sublabel}</p>}
    </div>
  )
}

const CoverageGauge = () => {
  const { showDMM, showJoshuaProject } = useDataSourceVisibility()

  const { data: gaugeData, isLoading: loadingGauge } = useQuery({
    queryKey: ['dashboard-coverage'],
    queryFn: async () => {
      const res = await dashboardApi.getCoverageGauge()
      return res.data.data
    },
    refetchInterval: 30000,
  })

  const { data: allPeoples, isLoading: loadingPeoples } = useQuery({
    queryKey: ['kpi-all-peoples'],
    queryFn: async () => {
      const res = await peopleGroupsApi.getAll()
      return res.data.data || res.data || []
    },
    staleTime: 30000,
  })

  const { dmmCount, total, satPct } = useMemo(() => {
    if (!allPeoples) return { dmmCount: 0, total: 0, satPct: 0 }
    const filtered = allPeoples.filter(pg => {
      const src = (pg.dataSource || '').toLowerCase()
      const isJP = src === 'joshua project' || src === 'joshuaproject'
      const isDMM = !isJP
      if (isDMM && !showDMM) return false
      if (isJP && !showJoshuaProject) return false
      return true
    })
    const dmmCount = filtered.filter(pg => (pg.engagementStatus || pg.status) === 'dmm').length
    const total = filtered.length
    const satPct = total > 0 ? Math.round((dmmCount / total) * 100) : 0
    return { dmmCount, total, satPct }
  }, [allPeoples, showDMM, showJoshuaProject])

  const isLoading = loadingGauge || loadingPeoples

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-80 flex items-center justify-center dark:bg-slate-800 dark:border-slate-700">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  const coveragePct = gaugeData?.villagesCoveragePercentage ?? 0
  const villagesWithData = gaugeData?.villagesWithData ?? 0
  const totalVillages = gaugeData?.totalVillages ?? 0

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-full dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Indicateurs</h3>
      </div>

      <div className="flex flex-col gap-8 items-center justify-center h-[calc(100%-3rem)]">
        <ArcGauge
          value={coveragePct}
          color="#3B82F6"
          label="Couverture Villages"
          sublabel={`${villagesWithData} / ${totalVillages} villages`}
        />
        <ArcGauge
          value={satPct}
          color="#10B981"
          label="Saturation DMM"
          sublabel={`${dmmCount} DMM / ${total} peuples`}
        />
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-2 gap-3 text-xs text-slate-500 dark:border-slate-700">
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Couverture
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500" />
          Saturation
        </div>
      </div>
    </div>
  )
}

export default CoverageGauge