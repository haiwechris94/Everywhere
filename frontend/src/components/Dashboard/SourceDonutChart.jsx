/**
 * SourceDonutChart — Répartition des people groups par source de données.
 * Réutilise les people groups déjà chargés (prop `peopleGroups`) et la même
 * logique de source que PeopleGroupsList : pg.source || pg.dataSource.
 * Met en avant les nouvelles sources IMB (PeopleGroups.org) et Finishing the Task.
 */
import { useMemo } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { Database } from 'lucide-react'
import { useLanguage } from '../../i18n'

// Source buckets — couleurs alignées sur les badges de PeopleGroupsList et
// les marqueurs de la carte (IMB emerald, FTT violet).
const SOURCE_CONFIG = [
  { key: 'DMM',                label: 'DMM',                   color: '#3b82f6', match: (s) => s === 'dmm' },
  { key: 'Survey',             label: 'Survey',                color: '#a855f7', match: (s) => s === 'survey' },
  { key: 'Joshua Project',     label: 'Joshua Project',        color: '#f59e0b', match: (s) => s === 'joshua project' || s === 'joshuaproject' },
  { key: 'PeopleGroups.org',   label: 'IMB / PeopleGroups.org', color: '#10b981', match: (s) => s === 'peoplegroups.org' || s === 'imb' },
  { key: 'Finishing the Task', label: 'Finishing the Task',    color: '#8b5cf6', match: (s) => s === 'finishing the task' || s === 'ftt' },
  { key: 'Manual',             label: 'Manuel / Autre',        color: '#9ca3af', match: () => false },
]

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div className="bg-white shadow-xl rounded-xl p-3 border border-slate-100 text-sm dark:bg-slate-900 dark:border-white/10">
      <div className="flex items-center gap-2 mb-1">
        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
        <span className="font-semibold text-slate-800 dark:text-slate-100">{d.label}</span>
      </div>
      <p className="text-slate-500 dark:text-slate-400">Nombre : <span className="font-medium text-slate-700 dark:text-slate-200">{d.value}</span></p>
      <p className="text-slate-500 dark:text-slate-400">Part : <span className="font-medium text-slate-700 dark:text-slate-200">{d.pct}%</span></p>
    </div>
  )
}

const SourceDonutChart = ({ peopleGroups = [] }) => {
  const { t } = useLanguage()

  const { chartData, total } = useMemo(() => {
    const counts = {}
    SOURCE_CONFIG.forEach((c) => { counts[c.key] = 0 })

    // Pour la source DMM, on compte les MASTER PEUPLES distincts (≈54) et non
    // les engagements individuels (≈80) : plusieurs engagements (villages) se
    // rattachent à un même master people via masterPeopleId.
    const dmmMasters = new Set()

    peopleGroups.forEach((pg) => {
      const raw = pg.source || pg.dataSource
      const s = raw ? String(raw).toLowerCase() : ''
      const cfg = raw ? SOURCE_CONFIG.find((c) => c.match(s)) : null
      const key = cfg ? cfg.key : 'Manual'

      if (key === 'DMM') {
        // Clé de regroupement : masterPeopleId si présent, sinon repli sur le
        // nom du peuple pour ne pas surcompter faute d'identifiant.
        const mpId = pg.masterPeopleId || pg.master_people_id
        dmmMasters.add(mpId ? String(mpId) : `name:${(pg.name || '').trim().toLowerCase()}`)
        return
      }
      counts[key]++
    })

    counts.DMM = dmmMasters.size

    // Total cohérent avec les tranches affichées (les master peuples DMM
    // remplacent les engagements dans le décompte).
    const totalCount = Object.values(counts).reduce((sum, n) => sum + (n || 0), 0)
    const data = SOURCE_CONFIG
      .map((c) => ({
        key: c.key,
        label: c.label,
        value: counts[c.key] || 0,
        fill: c.color,
        pct: totalCount > 0 ? Math.round(((counts[c.key] || 0) / totalCount) * 100) : 0,
      }))
      .filter((d) => d.value > 0)

    return { chartData: data, total: totalCount }
  }, [peopleGroups])

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 relative z-10 dark:bg-slate-900/60 dark:border dark:border-white/10 dark:shadow-[0_0_25px_-5px_rgba(99,102,241,0.45)] dark:ring-1 dark:ring-indigo-500/20">
      <div className="flex items-center justify-between mb-5">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2">
          <Database size={18} className="text-primary-600" />
          {t('dashboard.bySource') || 'Répartition par source'}
        </h3>
        <span className="text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full border border-slate-100 dark:text-slate-300 dark:bg-white/5 dark:border-white/10">
          {total} {t('dashboard.peopleGroups') || 'people groups'}
        </span>
      </div>

      {chartData.length === 0 ? (
        <div className="h-56 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
          {t('dashboard.noData') || 'Aucune donnée'}
        </div>
      ) : (
        <>
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
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
            {chartData.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.fill }} />
                <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{item.label}</span>
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 ml-auto">
                  {item.value} <span className="text-slate-400 dark:text-slate-500 font-normal">· {item.pct}%</span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default SourceDonutChart
