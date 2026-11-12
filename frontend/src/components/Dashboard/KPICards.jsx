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

// Status colors are semantic (DMM stage) and always paired with the label.
// Text uses -700 so small labels keep >= 4.5:1 on white.
const STATUS_CONFIG = {
  unreached:       { label: 'Non atteint',   bar: 'bg-red-600',    text: 'text-red-700 dark:text-red-300',       border: 'border-red-100 dark:border-red-900/50' },
  pioneer:         { label: 'Pioneer',       bar: 'bg-orange-500', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-100 dark:border-orange-900/50' },
  midway:          { label: 'Midway',        bar: 'bg-yellow-500', text: 'text-yellow-700 dark:text-yellow-300', border: 'border-yellow-100 dark:border-yellow-900/50' },
  'tipping-point': { label: 'Tipping Point', bar: 'bg-green-500',  text: 'text-green-700 dark:text-green-300',   border: 'border-green-100 dark:border-green-900/50' },
  dmm:             { label: 'DMM',           bar: 'bg-green-700',  text: 'text-green-800 dark:text-green-300',   border: 'border-green-100 dark:border-green-900/50' },
}

const TONES = {
  primary: 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200',
  success: 'bg-green-50 text-green-700 dark:bg-green-900/40 dark:text-green-300',
}

/** Flat summary tile: white card, thin border, colored icon chip (MASTER.md: calm, no gradients). */
const SummaryCard = ({ icon: Icon, label, value, hint, tone = 'primary' }) => (
  <div className="rounded-2xl border border-neutral-200 bg-white p-5 flex items-center gap-4 dark:border-slate-700 dark:bg-slate-800">
    <div className={`rounded-xl p-2.5 ${TONES[tone]}`}>
      <Icon className="w-5 h-5" aria-hidden="true" />
    </div>
    <div className="min-w-0">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-slate-400">{label}</p>
      <p className="text-3xl font-bold text-neutral-900 dark:text-slate-100">{value}</p>
      {hint && <p className="text-xs text-neutral-600 dark:text-slate-400 mt-0.5">{hint}</p>}
    </div>
  </div>
)

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
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl h-28 animate-pulse border border-slate-100 dark:border-slate-700" />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white dark:bg-slate-800 rounded-2xl h-20 animate-pulse border border-slate-100 dark:border-slate-700" />
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
              className={`relative overflow-hidden rounded-2xl border ${cfg.border} bg-white dark:bg-slate-800`}
            >
              {/* Colored top bar */}
              <div className={`h-1.5 w-full ${cfg.bar}`} aria-hidden="true" />
              <div className="p-4">
                <p className={`text-xs font-semibold uppercase tracking-wider ${cfg.text} mb-2`}>
                  {cfg.label}
                </p>
                <p className={`text-4xl font-bold ${cfg.text} leading-none`}>
                  {count.toLocaleString()}
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <div className="flex-1 bg-slate-100 dark:bg-slate-700 rounded-full h-1.5 mr-2">
                    <div
                      className={`h-1.5 rounded-full ${cfg.bar} transition-[width] duration-500`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{percentage}%</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SummaryCard icon={Layers} label={t('dashboard.totalPeoples') || 'Total peoples'} value={total.toLocaleString()} />
        <SummaryCard
          icon={TrendingUp}
          label={t('dashboard.villageCoverage') || 'Village coverage'}
          value={`${coveragePct}%`}
          hint={`${villages} / ${totalVillages}`}
        />
        <SummaryCard
          icon={Target}
          tone="success"
          label={t('dashboard.dmmSaturation') || 'DMM Saturation'}
          value={`${satPct}%`}
          hint={`${dmmCount} DMM / ${total} total`}
        />
      </div>

      {/* Source breakdown row — IMB / PeopleGroups.org & Finishing the Task */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SummaryCard
          icon={Users}
          label="IMB / PeopleGroups.org"
          value={(bySource?.imb ?? 0).toLocaleString()}
          hint={`${imbPct}% du total · groupes de personnes`}
        />
        <SummaryCard
          icon={Flag}
          label="Finishing the Task"
          value={(bySource?.ftt ?? 0).toLocaleString()}
          hint={`${fttPct}% du total · UUPGs`}
        />
      </div>
    </div>
  )
}

export default KPICards