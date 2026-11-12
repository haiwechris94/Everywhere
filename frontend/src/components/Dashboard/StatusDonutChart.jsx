/**
 * Status Donut Chart — Modern design with DMM/Joshua Project toggle support
 */
import { useQuery } from '@tanstack/react-query'
import { peopleGroupsApi } from '../../services/api'
import { useDataSourceVisibility } from '../../pages/DashboardEnhanced'
import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

// NEW COLOR SYSTEM
const STATUS_CONFIG = {
  unreached:       { label: 'Non atteint',  color: '#ef4444' },  // Red
  pioneer:         { label: 'Pioneer',       color: '#f97316' },  // Orange
  midway:          { label: 'Midway',        color: '#eab308' },  // Yellow
  'tipping-point': { label: 'Tipping Point', color: '#4ade80' },  // Light Green
  dmm:             { label: 'DMM',           color: '#15803d' },  // Dark Green
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white shadow-xl rounded-xl p-3 border border-slate-100 text-sm dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
        <span className="font-semibold text-slate-800 dark:text-slate-100">{d.label}</span>
      </div>
      <p className="text-slate-500">Nombre : <span className="font-medium text-slate-700 dark:text-slate-300">{d.value}</span></p>
      <p className="text-slate-500">Part : <span className="font-medium text-slate-700 dark:text-slate-300">{d.pct}%</span></p>
    </div>
  )
}

const StatusDonutChart = () => {
  const { showDMM, showJoshuaProject } = useDataSourceVisibility()

  const { data: allPeoples, isLoading } = useQuery({
    queryKey: ['kpi-all-peoples'],
    queryFn: async () => {
      const res = await peopleGroupsApi.getAll()
      return res.data.data || res.data || []
    },
    staleTime: 30000,
  })

  const { chartData, total } = useMemo(() => {
    if (!allPeoples) return { chartData: [], total: 0 }

    const filtered = allPeoples.filter(pg => {
      const src = (pg.dataSource || '').toLowerCase()
      const isJP = src === 'joshua project' || src === 'joshuaproject'
      const isDMM = !isJP
      if (isDMM && !showDMM) return false
      if (isJP && !showJoshuaProject) return false
      return true
    })

    const counts = {}
    Object.keys(STATUS_CONFIG).forEach(k => { counts[k] = 0 })
    filtered.forEach(pg => {
      const s = pg.engagementStatus || pg.status || 'unreached'
      if (counts[s] !== undefined) counts[s]++
    })

    const total = filtered.length
    const data = Object.entries(STATUS_CONFIG)
      .map(([key, cfg]) => ({
        key,
        label: cfg.label,
        value: counts[key] || 0,
        fill: cfg.color,
        pct: total > 0 ? Math.round(((counts[key] || 0) / total) * 100) : 0,
      }))
      .filter(d => d.value > 0)

    return { chartData: data, total }
  }, [allPeoples, showDMM, showJoshuaProject])

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 h-80 flex items-center justify-center dark:bg-slate-800 dark:border-slate-700">
        <div className="animate-spin rounded-full h-10 w-10 border-2 border-indigo-600 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 dark:bg-slate-800 dark:border-slate-700">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Distribution par Statut</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100 dark:bg-slate-900 dark:border-slate-700">
          {total} peuples
        </span>
      </div>

      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={3}
              dataKey="value"
              strokeWidth={0}
            >
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
        {chartData.map((item, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} aria-hidden="true" />
            <span className="text-xs text-slate-600 truncate dark:text-slate-300">{item.label}</span>
            <span className="text-xs font-semibold text-slate-800 ml-auto dark:text-slate-100">{item.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default StatusDonutChart