/**
 * AnalyticsDashboard.jsx
 * Modern SaaS-style analytics dashboard for the Church Planting Map application.
 * Design system: Inter font, #5B5FEF primary, #FF6B4A secondary, #F5F7FB background
 */
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  PieChart, Pie, AreaChart, Area, Legend, CartesianGrid,
} from 'recharts'
import {
  Sparkles, TrendingUp, TrendingDown, MapPin, Users, Activity,
  RefreshCw, ChevronRight, Zap, Globe, BarChart2, Heart, Download,
  Home, Target, BarChart3, Calendar, Church, Award, ArrowUp, ArrowDown, Flag, Search,
} from 'lucide-react'
import axios from 'axios'
import { statsApi, villagesApi, activitiesApi, peopleGroupsApi, dashboardApi, masterPeopleApi } from '../../services/api'
import SourceDonutChart from './SourceDonutChart'
import DmmProgressTable from './DmmProgressTable'
import { useLanguage } from '../../i18n'

// Couleurs des statuts JP/IMB, identiques à Unified Map (STATUS_COLORS).
// Sert à colorer les cases chiffrées de « Global People Groups ».
const JP_IMB_STATUS_COLORS = {
  UNREACHED: '#ef4444',
  FRONTIER: '#b91c1c',
  MINIMALLY_REACHED: '#f97316',
  REACHED: '#15803d',
  UNKNOWN: '#9ca3af',
}
const jpImbStatusColor = (status) =>
  JP_IMB_STATUS_COLORS[String(status || 'UNKNOWN').toUpperCase()] || '#9ca3af'
import { initSocket, getSocket, subscribeToPeopleGroupUpdates, subscribeToVillageStatusUpdates } from '../../services/socket'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'

// ─── API helpers ────────────────────────────────────────────────────────────
const api = (url) => axios.get(url, {
  headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
})

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  primary: '#5B5FEF',
  secondary: '#FF6B4A',
  bg: '#F5F7FB',
  card: '#FFFFFF',
  text: '#1A1A1A',
  muted: '#6B7280',
  success: '#10B981',
  danger: '#EF4444',
}

// ─── Engagement status constants ────────────────────────────────────────────
const engagementStatusLabels = {
  unreached: 'Not Started',
  pioneer: 'Starting',
  midway: 'Growing',
  'tipping-point': 'Expanding',
  dmm: 'Movement',
}

const engagementStatusColors = {
  unreached: '#ef4444',
  pioneer: '#f97316',
  midway: '#eab308',
  'tipping-point': '#22c55e',
  dmm: '#15803d',
}

// ─── Skeleton loader ─────────────────────────────────────────────────────────
const Skeleton = ({ className = '' }) => (
  <div className={`animate-pulse bg-gray-200 rounded-xl ${className}`} />
)

// ─── Avatar circle ───────────────────────────────────────────────────────────
const avatarColors = ['#5B5FEF','#FF6B4A','#10B981','#F59E0B','#8B5CF6','#EC4899']
const Avatar = ({ letter, index = 0 }) => (
  <div
    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
    style={{ background: avatarColors[index % avatarColors.length] }}
  >
    {letter}
  </div>
)

// ─── Status pill ─────────────────────────────────────────────────────────────
const StatusPill = ({ status }) => {
  const map = {
    completed: 'bg-emerald-100 text-emerald-700',
    'in-progress': 'bg-amber-100 text-amber-700',
    pending: 'bg-gray-100 text-gray-600',
  }
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${map[status] || map.pending}`}>
      {status === 'in-progress' ? 'In Progress' : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  )
}

// ─── Card wrapper ─────────────────────────────────────────────────────────────
const Card = ({ children, className = '', style = {} }) => (
  <div
    className={`bg-white dark:bg-white/[0.06] dark:border-white/10 dark:shadow-black/40 rounded-2xl p-5 shadow-sm border border-gray-100 transition-all duration-200 hover:shadow-md ${className}`}
    style={style}
  >
    {children}
  </div>
)

// ─── Section title ────────────────────────────────────────────────────────────
const SectionTitle = ({ children }) => (
  <h3 className="text-sm font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wider mb-4">{children}</h3>
)

// ════════════════════════════════════════════════════════════════════════════
// WIDGET 1 — AI Assistant Card
// ════════════════════════════════════════════════════════════════════════════
const AIAssistantCard = () => {
  const [open, setOpen] = useState(false)
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['analytics-ai-summary'],
    queryFn: () => api('/api/analytics/ai-summary').then(r => r.data),
    staleTime: 60000,
  })

  return (
    <Card
      className="relative overflow-hidden col-span-1 md:col-span-2 lg:col-span-1 row-span-1"
      style={{
        background: 'linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)',
        border: 'none',
        minHeight: 220,
      }}
    >
      {/* Mesh / wave background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-10 -right-10 w-48 h-48 rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #5B5FEF 0%, transparent 70%)' }} />
        <div className="absolute -bottom-8 -left-8 w-40 h-40 rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #FF6B4A 0%, transparent 70%)' }} />
        <svg className="absolute inset-0 w-full h-full opacity-5" viewBox="0 0 400 220" preserveAspectRatio="none">
          <path d="M0,80 C100,20 200,160 400,60 L400,220 L0,220 Z" fill="white" />
          <path d="M0,140 C120,80 280,180 400,100 L400,220 L0,220 Z" fill="white" opacity="0.5" />
        </svg>
      </div>

      {/* Glassmorphism inner panel */}
      <div className="relative z-10 h-full flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(91,95,239,0.4)', backdropFilter: 'blur(8px)' }}>
              <Sparkles size={16} className="text-white" />
            </div>
            <span className="text-white font-bold text-lg">AI Assistant</span>
          </div>
          <p className="text-gray-300 text-sm leading-relaxed mb-4">
            Analyze mission progress, compare regions, people groups and church planting movements.
          </p>

          {/* Insights preview */}
          {open && (
            <div className="mb-4 space-y-2 max-h-32 overflow-y-auto pr-1">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-full bg-white/10" />
                  <Skeleton className="h-4 w-4/5 bg-white/10" />
                </>
              ) : (
                <>
                  {(data?.insights || []).slice(0, 3).map((ins, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#FF6B4A' }} />
                      <p className="text-gray-200 text-xs">{ins}</p>
                    </div>
                  ))}
                  {(data?.alerts || []).map((alert, i) => (
                    <div key={i} className="flex items-start gap-2 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-yellow-400" />
                      <p className="text-yellow-200 text-xs">{alert}</p>
                    </div>
                  ))}
                  {(data?.recommendations || []).slice(0, 2).map((rec, i) => (
                    <div key={`rec-${i}`} className="flex items-start gap-2 mt-1">
                      <div className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 bg-emerald-400" />
                      <p className="text-emerald-200 text-xs">{rec}</p>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between">
          <button
            onClick={() => { setOpen(!open); if (!open) refetch() }}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-white text-sm font-semibold transition-all duration-200 hover:scale-105 active:scale-95"
            style={{ background: '#FF6B4A', boxShadow: '0 4px 15px rgba(255,107,74,0.4)' }}
          >
            <Zap size={14} />
            {open ? 'Hide insights' : 'Analyze data'}
          </button>
          {data?.aiPowered && (
            <span className="text-[10px] text-gray-400/80 flex items-center gap-1 px-2 py-1 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
              ✨ Powered by DeepSeek
            </span>
          )}
        </div>
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WIDGET 2 — Monthly Activity Chart
// ════════════════════════════════════════════════════════════════════════════
const MonthlyActivityChart = () => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-monthly-activity'],
    queryFn: () => api('/api/analytics/monthly-activity').then(r => r.data),
    staleTime: 60000,
  })

  const monthKeys = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec']
  const monthLabels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  const currentMonth = new Date().getMonth() // 0-based

  const chartData = monthKeys.map((k, i) => ({
    month: monthLabels[i],
    value: data?.[k] ?? 0,
    isCurrentMonth: i === currentMonth,
  }))

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-800 dark:text-slate-100">Monthly Activity</h3>
          <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">Villages, groups & trainings</p>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-orange-50 dark:bg-orange-500/10">
          <BarChart2 size={16} style={{ color: C.secondary }} />
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-end gap-2 h-28">
          {[40, 60, 50, 80, 55, 70, 45, 65, 75, 50, 85, 60].map((h, i) => (
            <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
          ))}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={chartData} barSize={16} margin={{ top: 4, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: isDark ? '#94a3b8' : C.muted }} />
            <YAxis hide />
            <Tooltip
              cursor={false}
              contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)', fontSize: 12, backgroundColor: isDark ? '#0f172a' : '#fff', color: isDark ? '#e2e8f0' : undefined }}
              formatter={(v) => [v, 'Activités']}
            />
            <Bar dataKey="value" radius={[6, 6, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={index} fill={entry.isCurrentMonth ? C.secondary : (isDark ? '#1e293b' : '#E5E7EB')} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WIDGET 3 — Progress Metrics (Reached / Unreached)
// ════════════════════════════════════════════════════════════════════════════
const MetricMiniCard = ({ title, endpoint, icon: Icon, color, positive = true, queryKeySuffix }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-metric', queryKeySuffix || endpoint],
    queryFn: () => api(endpoint).then(r => r.data),
    staleTime: 60000,
  })

  const rawTrend = data?.trend
  const trend =
    rawTrend === undefined || rawTrend === null || rawTrend === ''
      ? (positive ? '+24%' : '-8%')
      : typeof rawTrend === 'number'
        ? `${rawTrend >= 0 ? '+' : ''}${rawTrend}%`
        : String(rawTrend)
  const isPositive = trend.startsWith('+')
  const TrendIcon = isPositive ? TrendingUp : TrendingDown
  const trendColor = (positive && isPositive) || (!positive && !isPositive) ? C.success : C.danger

  return (
    <Card className="flex-1">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
          <Icon size={18} style={{ color }} />
        </div>
        <div className="flex items-center gap-1" style={{ color: trendColor }}>
          <TrendIcon size={13} />
          <span className="text-xs font-bold">{trend}</span>
        </div>
      </div>
      {isLoading ? (
        <>
          <Skeleton className="h-7 w-20 mb-1" />
          <Skeleton className="h-3 w-24" />
        </>
      ) : (
        <>
          <p className="text-2xl font-extrabold text-gray-800 dark:text-slate-100">
            {(data?.count ?? (positive ? 1620 : 3200)).toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">{title}</p>
        </>
      )}
    </Card>
  )
}

const ProgressMetrics = () => (
  <div className="flex flex-col gap-4">
  </div>
)

// ════════════════════════════════════════════════════════════════════════════
// WIDGET 4 — Recent Activity Feed
// ════════════════════════════════════════════════════════════════════════════
const RecentActivity = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['activity-recent'],
    queryFn: () => api('/api/activity/recent').then(r => r.data),
    staleTime: 30000,
    refetchInterval: 60000,
  })

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-1">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-800 dark:text-slate-100">Recent Activity</h3>
          <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">Latest missionary actions</p>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10">
          <Activity size={16} style={{ color: C.primary }} />
        </div>
      </div>

      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="w-9 h-9 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2.5 w-1/2" />
                </div>
              </div>
            ))
          : (data || []).slice(0, 6).map((item, i) => (
              <div key={item.id || i} className="flex items-center gap-3 group">
                <Avatar letter={item.avatar || item.name?.charAt(0) || '?'} index={i} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 dark:text-slate-100 truncate">{item.name}</p>
                  <p className="text-xs text-gray-400 dark:text-slate-400 truncate">{item.action} · {item.date}</p>
                </div>
                <StatusPill status={item.status || 'completed'} />
              </div>
            ))
        }
      </div>

      <button className="mt-4 w-full flex items-center justify-center gap-1 text-xs font-semibold py-2 rounded-xl transition-colors hover:bg-gray-50 dark:hover:bg-white/5"
        style={{ color: C.primary }}>
        View all activities <ChevronRight size={13} />
      </button>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WIDGET 5 — DMM Movement Growth (Radial / Donut)
// ════════════════════════════════════════════════════════════════════════════
const MovementGrowth = () => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-dmm-growth'],
    queryFn: () => api('/api/analytics/dmm-growth').then(r => r.data),
    staleTime: 60000,
  })

  const growth = data?.percentage ?? data?.growth ?? 73.1
  const chartData = [
    { name: 'DMM', value: growth },
    { name: 'Rest', value: 100 - growth },
  ]

  return (
    <Card className="flex flex-col items-center">
      <div className="w-full flex items-center justify-between mb-2">
        <div>
          <h3 className="font-bold text-gray-800 dark:text-slate-100">DMM Growth</h3>
          <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">Movement progress</p>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-purple-50 dark:bg-purple-500/10">
          <TrendingUp size={16} style={{ color: '#8B5CF6' }} />
        </div>
      </div>

      {isLoading ? (
        <Skeleton className="w-32 h-32 rounded-full mx-auto my-2" />
      ) : (
        <div className="relative flex items-center justify-center my-1">
          <PieChart width={140} height={140}>
            <Pie
              data={chartData}
              cx={65}
              cy={65}
              innerRadius={48}
              outerRadius={65}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              <Cell fill={C.secondary} />
              <Cell fill={isDark ? '#1e293b' : '#F3F4F6'} />
            </Pie>
          </PieChart>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold text-gray-800 dark:text-slate-100">+{growth}%</span>
            <span className="text-xs text-gray-400 dark:text-slate-400">growth</span>
          </div>
        </div>
      )}

      <div className="flex items-center gap-1 mt-1">
        <TrendingUp size={13} style={{ color: C.success }} />
        <span className="text-xs font-semibold" style={{ color: C.success }}>
          Movements expanding
        </span>
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WIDGET 6 — Top Active Regions
// ════════════════════════════════════════════════════════════════════════════
const TopRegions = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-top-regions'],
    queryFn: () => api('/api/analytics/top-regions').then(r => r.data),
    staleTime: 60000,
  })

  const regions = data || []
  const max = regions.length ? Math.max(...regions.map(r => r.count)) : 1

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-bold text-gray-800 dark:text-slate-100">Top Active Regions</h3>
          <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">By village count</p>
        </div>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-blue-50 dark:bg-blue-500/10">
          <Users size={16} style={{ color: C.primary }} />
        </div>
      </div>

      <div className="space-y-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-10" />
                </div>
                <Skeleton className="h-2 w-full rounded-full" />
              </div>
            ))
          : regions.map((r, i) => {
              const pct = Math.round((r.count / max) * 100)
              const barColors = [C.primary, C.secondary, '#10B981', '#F59E0B', '#8B5CF6', '#EC4899']
              return (
                <div key={r.region || i}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{r.region}</span>
                    <span className="text-xs font-bold text-gray-500 dark:text-slate-400">{r.count.toLocaleString()} villages</span>
                  </div>
                  <div className="h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{ width: `${pct}%`, background: barColors[i % barColors.length] }}
                    />
                  </div>
                </div>
              )
            })
        }
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WIDGET 7 — People Groups
// ════════════════════════════════════════════════════════════════════════════

const STATUS_COLORS = {
  unreached: '#EF4444',
  pioneer: '#F59E0B',
  midway: '#3B82F6',
  'tipping-point': '#8B5CF6',
  dmm: '#10B981',
}

const STATUS_LABELS_FR = {
  unreached: 'Non atteint',
  pioneer: 'Pionnier',
  midway: 'En chemin',
  'tipping-point': 'Point critique',
  dmm: 'Mouvement DMM',
}

const EngagementStatusPill = ({ status }) => {
  const color = STATUS_COLORS[status] || '#6B7280'
  const label = STATUS_LABELS_FR[status] || status
  return (
    <span
      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{ background: `${color}18`, color }}
    >
      {label}
    </span>
  )
}

// Fixed list of countries in the app
const APP_COUNTRIES = [
  { label: 'Cameroun',           value: 'Cameroon' },
  { label: 'Gabon',              value: 'Gabon' },
  { label: 'Congo Brazzaville',  value: 'Congo' },
  { label: 'RD Congo',           value: 'DR Congo' },
  { label: 'Centrafrique',       value: 'Central African Republic' },
  { label: 'Tchad',              value: 'Chad' },
  { label: 'Guinée Équatoriale', value: 'Equatorial Guinea' },
]

const PeopleGroupsWidget = () => {
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  const navigate = useNavigate()
  const [selectedCountry, setSelectedCountry] = useState('')
  const [selectedRegion, setSelectedRegion] = useState('')
  const [isExporting, setIsExporting] = useState(false)

  // Reset region when country changes
  const handleCountryChange = (country) => {
    setSelectedCountry(country)
    setSelectedRegion('')
  }

  const buildQueryString = () => {
    const params = new URLSearchParams()
    if (selectedCountry) params.set('country', selectedCountry)
    if (selectedRegion) params.set('region', selectedRegion)
    const qs = params.toString()
    return qs ? '?' + qs : ''
  }

  const { data, isLoading } = useQuery({
    queryKey: ['analytics-people-groups', selectedCountry, selectedRegion],
    queryFn: () => api('/api/analytics/people-groups-stats' + buildQueryString()).then(r => r.data),
    staleTime: 60000,
  })

  const handleExportCSV = async () => {
    setIsExporting(true)
    try {
      const params = selectedRegion ? `?region=${encodeURIComponent(selectedRegion)}&format=csv` : '?format=csv'
      const response = await axios.get(`/api/export/people-groups${params}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        responseType: 'blob',
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      const filename = selectedRegion ? `people-groups-${selectedRegion}.csv` : 'people-groups.csv'
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
    } catch (e) {
      console.error('Export failed', e)
    } finally {
      setIsExporting(false)
    }
  }

  const kpis = [
    {
      label: 'Groupes de peuples',
      value: data?.totalPeopleGroups ?? 0,
      icon: Users,
      color: C.primary,
      format: (v) => v.toLocaleString(),
    },
    {
      label: 'Population totale',
      value: data?.totalPopulation ?? 0,
      icon: Globe,
      color: '#8B5CF6',
      format: (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v.toLocaleString(),
    },
    {
      label: 'Croyants',
      value: data?.totalBelievers ?? 0,
      icon: Heart,
      color: C.success,
      format: (v) => v.toLocaleString(),
    },
    {
      label: 'Taux d\'évangélisation',
      value: data?.evangelismRate ?? 0,
      icon: TrendingUp,
      color: C.secondary,
      format: (v) => `${v}%`,
    },
  ]

  const statusData = (data?.statusDistribution || []).map(s => ({
    name: STATUS_LABELS_FR[s.status] || s.status,
    count: s.count,
    population: s.totalPopulation,
    color: STATUS_COLORS[s.status] || '#6B7280',
  }))

  const top5 = data?.top5ByPopulation || []
  const religions = data?.religionDistribution || []
  const languages = data?.languageDistribution || []
  const maxReligion = religions.length ? Math.max(...religions.map(r => r.count)) : 1
  const maxLanguage = languages.length ? Math.max(...languages.map(l => l.count)) : 1
  // Répartition par donateur (camembert) et par année de début (barres).
  const donors = (data?.donorDistribution || []).map((d) => ({
    name: d.donor || 'Inconnu',
    value: d.count,
  }))
  const startYears = (data?.startYearDistribution || []).map((y) => ({
    year: String(y.year),
    count: y.count,
  }))

  const dotColors = [C.primary, C.secondary, '#10B981', '#F59E0B', '#8B5CF6']

  const CustomStatusTooltip = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    return (
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-gray-100 dark:border-white/10 p-3 text-xs">
        <p className="font-bold text-gray-800 dark:text-slate-100 mb-1">{d?.name}</p>
        <p className="text-gray-500 dark:text-slate-400">Groupes : <span className="font-semibold text-gray-800 dark:text-slate-100">{d?.count?.toLocaleString()}</span></p>
        <p className="text-gray-500 dark:text-slate-400">Population : <span className="font-semibold text-gray-800 dark:text-slate-100">{d?.population?.toLocaleString()}</span></p>
      </div>
    )
  }

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-3">
      {/* ── Widget header ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: `${C.primary}15` }}>
            <Users size={20} style={{ color: C.primary }} />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-800 dark:text-slate-100 text-base flex items-center gap-1 flex-wrap">
              People Groups
              {selectedCountry && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full ml-1" style={{ background: C.primary + '18', color: C.primary }}>
                  {APP_COUNTRIES.find(c => c.value === selectedCountry)?.label || selectedCountry}
                </span>
              )}
              {selectedRegion && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: C.secondary + '18', color: C.secondary }}>
                  {selectedRegion}
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">Population · Engagement · Évangélisation</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Country selector — fixed list */}
          <select
            value={selectedCountry}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="text-xs border border-gray-200 dark:border-white/10 rounded-xl px-3 py-1.5 bg-white dark:bg-white/5 text-gray-700 dark:text-slate-200 font-medium focus:outline-none focus:ring-2 cursor-pointer shadow-sm"
          >
            <option value="">Tous les pays</option>
            {APP_COUNTRIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>

          {/* Region selector — dynamic from API, shown only when country selected */}
          {selectedCountry && (data?.regions || []).length > 0 && (
            <select
              value={selectedRegion}
              onChange={(e) => setSelectedRegion(e.target.value)}
              className="text-xs border border-gray-200 rounded-xl px-3 py-1.5 bg-white text-gray-700 font-medium focus:outline-none focus:ring-2 cursor-pointer shadow-sm"
            >
              <option value="">Toutes les régions</option>
              {(data?.regions || []).map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          )}
          <button
            onClick={handleExportCSV}
            disabled={isExporting}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 disabled:opacity-50"
            style={{ color: C.primary }}
            title="Exporter en CSV"
          >
            <Download size={12} className={isExporting ? 'animate-bounce' : ''} />
            {isExporting ? 'Export...' : 'CSV'}
          </button>
        </div>
      </div>

      {/* ── KPI pills row ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {kpis.map(({ label, value, icon: Icon, color, format }) => (
          <div key={label} className="relative rounded-2xl bg-gray-50 p-4 overflow-hidden">
            <div className="absolute top-3 right-3 w-7 h-7 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
              <Icon size={14} style={{ color }} />
            </div>
            {isLoading ? (
              <>
                <Skeleton className="h-7 w-20 mb-1" />
                <Skeleton className="h-3 w-24" />
              </>
            ) : (
              <>
                <p className="text-2xl font-extrabold text-gray-800 pr-8">{format(value)}</p>
                <p className="text-xs text-gray-400 mt-0.5">{label}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* ── 3-column sub-grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Sub-section 1 — Engagement Status bar chart */}
        <div>
          <SectionTitle>Engagement Status</SectionTitle>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-1">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-6 w-full rounded-lg" />
                </div>
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={statusData}
                layout="vertical"
                margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                barSize={18}
              >
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={100}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: C.muted }}
                />
                <Tooltip content={<CustomStatusTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Sub-section 2 — Top 5 people groups table */}
        <div>
          <SectionTitle>Top Groupes par Population</SectionTitle>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <Skeleton className="w-6 h-6 rounded-full flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-2.5 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div>
              {top5.map((pg, i) => (
                <div
                  key={pg.name || i}
                  className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50 rounded-xl transition-colors px-2 -mx-2"
                  onClick={() => {
                    if (pg.coordinates) {
                      navigate(`/map?lat=${pg.coordinates[1]}&lng=${pg.coordinates[0]}&zoom=12&highlight=${encodeURIComponent(pg.name)}`)
                    } else {
                      navigate(`/map?search=${encodeURIComponent(pg.name)}`)
                    }
                  }}
                >
                  <span
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-extrabold flex-shrink-0 text-white"
                    style={{ background: dotColors[i % dotColors.length] }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{pg.name}</p>
                    <p className="text-xs text-gray-400">{pg.population.toLocaleString()} hab. · {pg.believersCount.toLocaleString()} croyants</p>
                  </div>
                  <EngagementStatusPill status={pg.status} />
                  <MapPin size={12} style={{ color: C.muted }} className="flex-shrink-0" />
                </div>
              ))}
              {top5.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">Aucune donnée disponible</p>
              )}
            </div>
          )}
        </div>

        {/* Sub-section 3 — Religion & Language distribution */}
        <div className="space-y-5">
          {/* Religions */}
          <div>
            <SectionTitle>Religions</SectionTitle>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {religions.map((r, i) => (
                  <div key={r.religion || i}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColors[i % dotColors.length] }} />
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{r.religion || 'Inconnu'}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-500 ml-2">{r.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.round((r.count / maxReligion) * 100)}%`, background: dotColors[i % dotColors.length] }}
                      />
                    </div>
                  </div>
                ))}
                {religions.length === 0 && <p className="text-xs text-gray-400">Aucune donnée</p>}
              </div>
            )}
          </div>

          {/* Languages */}
          <div>
            <SectionTitle>Langues</SectionTitle>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full rounded-lg" />)}
              </div>
            ) : (
              <div className="space-y-2">
                {languages.map((l, i) => (
                  <div key={l.language || i}>
                    <div className="flex items-center justify-between mb-0.5">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColors[i % dotColors.length] }} />
                        <span className="text-xs font-medium text-gray-700 truncate max-w-[120px]">{l.language || 'Inconnu'}</span>
                      </div>
                      <span className="text-xs font-bold text-gray-500 ml-2">{l.count}</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.round((l.count / maxLanguage) * 100)}%`, background: dotColors[i % dotColors.length] }}
                      />
                    </div>
                  </div>
                ))}
                {languages.length === 0 && <p className="text-xs text-gray-400">Aucune donnée</p>}
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ── Répartition par donateur & par année de début ────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-6 pt-6 border-t border-gray-100 dark:border-white/10">
        {/* Par donateur (camembert) */}
        <div>
          <SectionTitle>Par donateur</SectionTitle>
          {isLoading ? (
            <Skeleton className="h-56 w-full rounded-xl" />
          ) : donors.length === 0 ? (
            <p className="text-xs text-gray-400">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <PieChart>
                <Pie
                  data={donors}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  paddingAngle={2}
                >
                  {donors.map((entry, i) => (
                    <Cell key={entry.name} fill={dotColors[i % dotColors.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [`${v} peuple(s)`, n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Par année de début (barres) */}
        <div>
          <SectionTitle>Par année de début</SectionTitle>
          {isLoading ? (
            <Skeleton className="h-56 w-full rounded-xl" />
          ) : startYears.length === 0 ? (
            <p className="text-xs text-gray-400">Aucune donnée</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={startYears} margin={{ top: 8, right: 12, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [`${v} peuple(s)`, 'Peuples']} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} fill={C.primary} barSize={22} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WIDGET 8 — Evolution Chart (Evangelization over time)
// ════════════════════════════════════════════════════════════════════════════

const formatMonth = (dateStr) => {
  if (!dateStr) return ''
  const [year, month] = dateStr.split('-')
  const months = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc']
  return `${months[parseInt(month) - 1]} ${year?.slice(2)}`
}

const EvolutionTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid #E5E7EB', borderRadius: 12, padding: '10px 14px', boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 12 }}>
      <p style={{ fontWeight: 700, color: '#1A1A1A', marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color, margin: '2px 0' }}>
          {p.name}: <strong>{p.value}</strong>
        </p>
      ))}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// WIDGET — JP Non-Engagés
// Combien de peuples Joshua Project ont déjà une équipe DMM ?
// ════════════════════════════════════════════════════════════════════════════
// Désormais piloté par le LIEN JP+IMB de la carte : on reçoit en props le total
// de peuples JP/IMB dédupliqués (JP et IMB fusionnés = 1), le nombre de ces
// peuples ayant AU MOINS un engagement DMM (engaged) et le reste sans engagement
// DMM (nonEngaged). Aucune donnée n'est dupliquée : même ensemble que la carte.
const JPCoverageWidget = ({ total = 0, engaged = 0, nonEngaged = 0 }) => {
  const pct = total > 0 ? Math.round((engaged / total) * 100) : 0
  const gapPct = total > 0 ? Math.round((nonEngaged / total) * 100) : 0

  if (!total) {
    return (
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center">
            <Globe size={18} className="text-amber-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Peuples JP/IMB non-engagés</h3>
            <p className="text-xs text-gray-400">JP + IMB × DMM</p>
          </div>
        </div>
        <div className="text-center py-8 text-gray-400">
          <Globe size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm font-medium">Aucun peuple JP/IMB sur la carte</p>
          <p className="text-xs mt-1">Importez des données JP / IMB pour activer cette vue.</p>
        </div>
      </Card>
    )
  }

  return (
    <Card>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
            <Globe size={18} className="text-white" />
          </div>
          <div>
            <h3 className="font-bold text-gray-800 text-sm">Peuples JP/IMB non-engagés</h3>
            <p className="text-xs text-gray-400">JP + IMB liés × DMM terrain</p>
          </div>
        </div>
        <span className="text-xs font-bold px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200">
          {pct}% engagés
        </span>
      </div>

      {/* Grande jauge circulaire */}
      <div className="relative flex items-center justify-center mb-5" style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              data={[
                { value: engaged, fill: C.success },
                { value: Math.max(0, nonEngaged), fill: '#FEE2E2' },
              ]}
              cx="50%" cy="85%"
              startAngle={180} endAngle={0}
              innerRadius={52} outerRadius={72}
              paddingAngle={2}
              dataKey="value"
              isAnimationActive
            >
              <Cell fill={C.success} />
              <Cell fill="#FEE2E2" />
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        {/* Texte central */}
        <div className="absolute bottom-3 text-center pointer-events-none">
          <p className="text-2xl font-black text-gray-800">{pct}%</p>
          <p className="text-[10px] text-gray-400 leading-tight">engagés</p>
        </div>
      </div>

      {/* 3 stats principales : Total JP+IMB · avec engagement DMM · sans engagement */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="text-center rounded-xl p-3 bg-gray-50 border border-gray-100">
          <p className="text-xl font-bold text-gray-800">{total}</p>
          <p className="text-[10px] text-gray-500 font-medium leading-tight">Total JP+IMB</p>
        </div>
        <div className="text-center rounded-xl p-3 bg-emerald-50 border border-emerald-100">
          <p className="text-xl font-bold text-emerald-700">{engaged}</p>
          <p className="text-[10px] text-emerald-600 font-medium leading-tight">Avec engagement DMM</p>
        </div>
        <div className="text-center rounded-xl p-3 bg-red-50 border border-red-100">
          <p className="text-xl font-bold text-red-600">{Math.max(0, nonEngaged)}</p>
          <p className="text-[10px] text-red-500 font-medium leading-tight">Sans engagement DMM</p>
        </div>
      </div>

      {/* Barre engagés vs non-engagés */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Lien JP+IMB × DMM</p>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-24 flex-shrink-0 truncate">Avec DMM</span>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, backgroundColor: '#15803d' }} />
          </div>
          <span className="text-[10px] font-bold text-gray-600 w-6 text-right">{engaged}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-500 w-24 flex-shrink-0 truncate">Sans DMM</span>
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500" style={{ width: `${gapPct}%`, backgroundColor: '#ef4444' }} />
          </div>
          <span className="text-[10px] font-bold text-gray-600 w-6 text-right">{Math.max(0, nonEngaged)}</span>
        </div>
      </div>

      {/* Appel à l'action si gros gap */}
      {gapPct > 50 && (
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs font-semibold text-amber-800">
            ⚡ {gapPct}% des peuples JP+IMB n'ont pas encore d'engagement DMM.
          </p>
        </div>
      )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
const EvolutionChart = () => {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics-pg-timeline'],
    queryFn: () => api('/api/analytics/timeline?type=people-groups&period=180&groupBy=month').then(r => r.data),
    staleTime: 60000,
  })

  const timeline = data?.timeline || []
  const chartData = timeline.map(item => ({
    month: formatMonth(item.date),
    'Nouveaux groupes': item.count,
    'Total cumulé': item.cumulative,
  }))

  const lastIdx = timeline.length - 1
  const isTrendingUp = lastIdx >= 1
    ? timeline[lastIdx]?.count >= timeline[lastIdx - 1]?.count
    : true
  const TrendIcon = isTrendingUp ? TrendingUp : TrendingDown
  const trendColor = isTrendingUp ? C.success : C.danger

  return (
    <Card className="col-span-1 md:col-span-2 lg:col-span-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: '#8B5CF615' }}>
            <TrendingUp size={20} style={{ color: '#8B5CF6' }} />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-800 text-base">Évolution de l'Évangélisation</h3>
            <p className="text-xs text-gray-400 mt-0.5">Nouveaux groupes par mois</p>
          </div>
        </div>
      </div>

      {/* ── KPI pills ── */}
      <div className="flex flex-wrap gap-2 mb-5">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: `${C.primary}12`, color: C.primary }}>
          <Users size={12} />
          Total groupes suivis : <strong>{isLoading ? '…' : (data?.total ?? 0)}</strong>
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
          <Activity size={12} />
          Période : 6 derniers mois
        </span>
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold" style={{ background: `${trendColor}12`, color: trendColor }}>
          <TrendIcon size={12} />
          Tendance : {isTrendingUp ? 'En hausse' : 'En baisse'}
        </span>
      </div>

      {/* ── Chart ── */}
      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-8 w-full rounded-xl" />
          <Skeleton className="h-8 w-5/6 rounded-xl" />
          <Skeleton className="h-8 w-4/6 rounded-xl" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400 gap-2">
          <Activity size={28} className="opacity-40" />
          <p className="text-sm">Aucune donnée de timeline disponible</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 4, right: 16, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCumulative" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#5B5FEF" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#5B5FEF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradNew" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FF6B4A" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#FF6B4A" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="month"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 11, fill: C.muted }}
            />
            <YAxis hide />
            <Tooltip content={<EvolutionTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
            />
            <Area
              type="monotone"
              dataKey="Total cumulé"
              stroke="#5B5FEF"
              strokeWidth={2}
              fill="url(#gradCumulative)"
            />
            <Area
              type="monotone"
              dataKey="Nouveaux groupes"
              stroke="#FF6B4A"
              strokeWidth={2}
              fill="url(#gradNew)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </Card>
  )
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
const AnalyticsDashboard = () => {
  const [lastRefresh, setLastRefresh] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const { t, isFrench } = useLanguage()
  const dateLocale = isFrench ? fr : enUS
  const queryClient = useQueryClient()
  const [paginationProgress, setPaginationProgress] = useState(null)

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true)
    setLastRefresh(new Date())
    setTimeout(() => setIsRefreshing(false), 800)
  }, [])

  const timeAgo = () => {
    const diff = Math.floor((Date.now() - lastRefresh.getTime()) / 1000)
    if (diff < 60) return `${diff}s ago`
    return `${Math.floor(diff / 60)}m ago`
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SOCKET.IO REAL-TIME UPDATES
  // ═══════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    const token = localStorage.getItem('token')
    initSocket(token)

    const unsubscribePeopleGroups = subscribeToPeopleGroupUpdates(() => {
      queryClient.invalidateQueries({ queryKey: ['peopleGroups'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardKPI'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStatusDistribution'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardCoverage'] })
      queryClient.invalidateQueries({ queryKey: ['villages'] })
    })

    const unsubscribeVillageStatus = subscribeToVillageStatusUpdates(() => {
      queryClient.invalidateQueries({ queryKey: ['villages'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
    })

    const socket = getSocket()
    if (socket) {
      const handleVillageChange = () => {
        queryClient.invalidateQueries({ queryKey: ['villages'] })
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      }
      socket.on('village-created', handleVillageChange)
      socket.on('village-updated', handleVillageChange)
      socket.on('village-deleted', handleVillageChange)

      const handleActivityChange = () => {
        queryClient.invalidateQueries({ queryKey: ['recentActivities'] })
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      }
      socket.on('activity-created', handleActivityChange)
      socket.on('activity-updated', handleActivityChange)
    }

    return () => {
      unsubscribePeopleGroups()
      unsubscribeVillageStatus()
      const s = getSocket()
      if (s) {
        s.off('village-created')
        s.off('village-updated')
        s.off('village-deleted')
        s.off('activity-created')
        s.off('activity-updated')
      }
    }
  }, [queryClient])

  // ── Data queries ────────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: async () => {
      try {
        const response = await statsApi.getDashboard()
        return response.data
      } catch {
        return { totalVillages: 0, totalChurches: 0, totalActivities: 0, totalUsers: 0, villagesByStatus: [], recentActivities: [], monthlyProgress: [] }
      }
    },
    refetchInterval: 30000,
  })

  const { data: kpiSummary } = useQuery({
    queryKey: ['dashboardKPI'],
    queryFn: async () => {
      try {
        const response = await dashboardApi.getKPISummary({ includeJoshuaProject: true })
        return response.data
      } catch { return null }
    },
    refetchInterval: 30000,
  })

  const { data: statusDistribution } = useQuery({
    queryKey: ['dashboardStatusDistribution'],
    queryFn: async () => {
      try {
        const response = await dashboardApi.getStatusDistribution({ includeJoshuaProject: true })
        return response.data
      } catch { return null }
    },
    refetchInterval: 30000,
  })

  const { data: coverageGauge } = useQuery({
    queryKey: ['dashboardCoverage'],
    queryFn: async () => {
      try {
        const response = await dashboardApi.getCoverageGauge({ includeJoshuaProject: true })
        return response.data
      } catch { return null }
    },
    refetchInterval: 30000,
  })

  const { data: peopleGroupsData } = useQuery({
    queryKey: ['peopleGroups', 'dashboard', 'all', search, statusFilter, sourceFilter, sortBy, sortOrder],
    queryFn: async () => {
      try {
        const allData = await peopleGroupsApi.getAllPaginated({
          search,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          source: sourceFilter !== 'all' ? sourceFilter : undefined,
          sortBy,
          sortOrder,
        }, {
          onProgress: (progress) => { setPaginationProgress(progress) },
        })
        setPaginationProgress(null)
        return allData || []
      } catch {
        setPaginationProgress(null)
        return []
      }
    },
    refetchInterval: 30000,
  })

  // ── Source de vérité « carte » : peuples JP/IMB dédupliqués ────────────────
  // Le dashboard global doit refléter EXACTEMENT ce qui s'affiche sur la carte.
  // /api/master-people/map/markers renvoie UN point par master people (les
  // enregistrements JP + IMB décrivant le même groupe ethnique sont fusionnés en
  // un seul point). On ne compte donc jamais deux fois le même peuple.
  const { data: mapMarkersData } = useQuery({
    queryKey: ['dashboard', 'map-markers'],
    queryFn: async () => {
      try {
        const res = await masterPeopleApi.getMarkers({ limit: 20000 })
        return res.data?.markers || []
      } catch { return [] }
    },
    refetchInterval: 30000,
  })

  // Engagements DMM (un point par engagement, niveau village) — même couche que
  // la carte. Sert à la section « Global DMM Engagements » et au lien JP+IMB.
  const { data: dmmEngagementsData } = useQuery({
    queryKey: ['dashboard', 'map-dmm-engagements'],
    queryFn: async () => {
      try {
        const res = await masterPeopleApi.getDmmEngagements({ limit: 20000 })
        return res.data?.peoples || []
      } catch { return [] }
    },
    refetchInterval: 30000,
  })

  const { data: villagesData } = useQuery({
    queryKey: ['villages', search, statusFilter, sortBy, sortOrder],
    queryFn: async () => {
      try {
        const response = await villagesApi.getAll({
          search,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          sortBy,
          sortOrder,
        })
        return response.data.villages || response.data || []
      } catch { return [] }
    },
    refetchInterval: 30000,
  })

  const { data: recentActivities } = useQuery({
    queryKey: ['recentActivities'],
    queryFn: async () => {
      try {
        const response = await activitiesApi.getAll({ limit: 5, sort: '-date' })
        return response.data.activities || []
      } catch { return [] }
    },
    refetchInterval: 30000,
  })

  // ── Derived stats ────────────────────────────────────────────────────────────
  const peopleGroups = peopleGroupsData || []
  const peopleStats = useMemo(() => ({
    total: peopleGroups.length,
    unreached: peopleGroups.filter(p => p.engagementStatus === 'unreached').length,
    pioneer: peopleGroups.filter(p => p.engagementStatus === 'pioneer').length,
    midway: peopleGroups.filter(p => p.engagementStatus === 'midway').length,
    tippingPoint: peopleGroups.filter(p => p.engagementStatus === 'tipping-point').length,
    dmm: peopleGroups.filter(p => p.engagementStatus === 'dmm').length,
    totalChurches: peopleGroups.reduce((sum, p) => sum + (p.numberOfChurches || 0), 0),
    withCoordinates: peopleGroups.filter(p => p?.location?.coordinates?.length >= 2).length,
    imbSource: peopleGroups.filter(p => p.source === 'PeopleGroups.org').length,
    fttSource: peopleGroups.filter(p => p.source === 'Finishing the Task').length,
  }), [peopleGroups])

  // ── Stats « carte » dédupliquées (JP+IMB fusionnés = 1 peuple) ─────────────
  const mapMarkers = mapMarkersData || []
  const dmmEngagements = dmmEngagementsData || []

  // Peuples JP/IMB uniques tels qu'affichés sur la carte (un point par master
  // people). C'est le TOTAL de peuples « officiel » du dashboard.
  const mapPeopleStats = useMemo(() => {
    // Statut JP/IMB (status.status renvoyé par /map/markers), ex. UNREACHED,
    // FRONTIER, UNENGAGED, REACHED, UNKNOWN… On regroupe par statut brut.
    const byStatus = {}
    mapMarkers.forEach((m) => {
      const key = (m.status || 'UNKNOWN').toString().toUpperCase()
      byStatus[key] = (byStatus[key] || 0) + 1
    })
    const statusList = Object.entries(byStatus)
      .map(([status, count]) => ({ status, count, color: jpImbStatusColor(status) }))
      .sort((a, b) => b.count - a.count)
    return { total: mapMarkers.length, byStatus, statusList }
  }, [mapMarkers])

  // Peuples JP/IMB dédupliqués "aplatis" pour le donut Source (un peuple = 1 point
  // carte, jamais dupliqué). La source est déduite de sourceTypes du marqueur :
  // IMB (CPPI) prioritaire, sinon JP, sinon Survey.
  const mapSourcePeople = useMemo(() => mapMarkers.map((m) => {
    const types = (m.sourceTypes || []).map((s) => String(s).toUpperCase())
    let source = 'Manual'
    if (types.includes('CPPI') || types.includes('IMB')) source = 'PeopleGroups.org'
    else if (types.includes('JP')) source = 'Joshua Project'
    else if (types.includes('SURVEY')) source = 'Survey'
    return { source, masterPeopleId: m.id }
  }), [mapMarkers])

  // Lien JP+IMB : parmi les peuples JP/IMB de la carte, combien ont AU MOINS un
  // engagement DMM (ids de master people présents dans la couche engagements),
  // et combien restent sans engagement DMM.
  const jpImbEngagementStats = useMemo(() => {
    const engagedMasterIds = new Set(
      dmmEngagements.map((e) => e.masterPeopleId && String(e.masterPeopleId)).filter(Boolean)
    )
    const total = mapMarkers.length
    const engaged = mapMarkers.filter((m) => engagedMasterIds.has(String(m.id))).length
    return { total, engaged, nonEngaged: Math.max(0, total - engaged) }
  }, [mapMarkers, dmmEngagements])

  // Engagements DMM répartis par STATUT et par NIVEAU (tableau DMM).
  const dmmEngagementStats = useMemo(() => {
    const byStatus = {}
    const byLevel = {}
    dmmEngagements.forEach((e) => {
      const s = (e.dmmStatus || 'unknown').toString().toLowerCase()
      byStatus[s] = (byStatus[s] || 0) + 1
      const lvl = (e.engagementLevel != null && e.engagementLevel !== '')
        ? String(e.engagementLevel)
        : '—'
      byLevel[lvl] = (byLevel[lvl] || 0) + 1
    })
    const statusList = Object.entries(byStatus).map(([status, count]) => ({ status, count })).sort((a, b) => b.count - a.count)
    const levelList = Object.entries(byLevel).map(([level, count]) => ({ level, count })).sort((a, b) => b.count - a.count)
    return { total: dmmEngagements.length, byStatus, byLevel, statusList, levelList }
  }, [dmmEngagements])

  const { peopleGroupsByCountry, countryDataList, peopleGroupsByCountryList } = useMemo(() => {
    const byCountry = {}
    const byCountryList = {}
    peopleGroups.forEach(pg => {
      const country = pg.country || 'Unknown'
      if (!byCountry[country]) {
        byCountry[country] = { total: 0, unreached: 0, pioneer: 0, midway: 0, tippingPoint: 0, dmm: 0, churches: 0 }
        byCountryList[country] = []
      }
      byCountry[country].total++
      byCountry[country].churches += pg.numberOfChurches || 0
      byCountryList[country].push(pg)
      if (pg.engagementStatus === 'unreached') byCountry[country].unreached++
      else if (pg.engagementStatus === 'pioneer') byCountry[country].pioneer++
      else if (pg.engagementStatus === 'midway') byCountry[country].midway++
      else if (pg.engagementStatus === 'tipping-point') byCountry[country].tippingPoint++
      else if (pg.engagementStatus === 'dmm') byCountry[country].dmm++
    })
    const dataList = Object.entries(byCountry)
      .map(([country, data]) => ({ country, ...data }))
      .sort((a, b) => b.total - a.total)
    return { peopleGroupsByCountry: byCountry, countryDataList: dataList, peopleGroupsByCountryList: byCountryList }
  }, [peopleGroups])

  const villages = villagesData || []
  const villageStats = useMemo(() => ({
    total: villages.length,
    byStatus: {
      pioneer: villages.filter(v => v.status === 'pioneer').length,
      midway: villages.filter(v => v.status === 'midway').length,
      tippingPoint: villages.filter(v => v.status === 'tipping-point').length,
      dmm: villages.filter(v => v.status === 'dmm').length,
      unreached: villages.filter(v => v.status === 'unreached').length,
      inProgress: villages.filter(v => v.status === 'in-progress').length,
      churchPlanted: villages.filter(v => v.status === 'church-planted').length,
      multiplying: villages.filter(v => v.status === 'multiplying').length,
    },
    totalPopulation: villages.reduce((sum, v) => sum + (v.population || 0), 0),
  }), [villages])

  // Camembert « People Group Status » basé sur les statuts JP/IMB dédupliqués de
  // la carte (un peuple fusionné JP+IMB = 1), et non sur les people groups bruts.
  const engagementStatusData = useMemo(
    () => mapPeopleStats.statusList.map((s) => ({
      status: s.status,
      count: s.count,
      color: s.color,
      label: s.status.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    })),
    [mapPeopleStats]
  )

  const comparisonData = useMemo(() => [
    { name: 'Unreached', peopleGroups: peopleStats.unreached, villages: villageStats.byStatus.unreached || 0 },
    { name: 'Pioneer', peopleGroups: peopleStats.pioneer, villages: villageStats.byStatus.pioneer },
    { name: 'Midway', peopleGroups: peopleStats.midway, villages: villageStats.byStatus.midway },
    { name: 'Tipping Point', peopleGroups: peopleStats.tippingPoint, villages: villageStats.byStatus.tippingPoint },
    { name: 'DMM (Reached)', peopleGroups: peopleStats.dmm, villages: villageStats.byStatus.dmm },
  ], [peopleStats, villageStats])

  const [isDark, setIsDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'))
  useEffect(() => {
    const el = document.documentElement
    const obs = new MutationObserver(() => setIsDark(el.classList.contains('dark')))
    obs.observe(el, { attributes: true, attributeFilter: ['class'] })
    setIsDark(el.classList.contains('dark'))
    return () => obs.disconnect()
  }, [])
  const T = isDark ? { primary: '#818cf8', secondary: '#fb7185', bg: '#0b1020', card: 'rgba(17,24,39,0.75)', text: '#e5e7eb', muted: '#94a3b8', success: '#34d399', danger: '#f87171' } : C

  return (
    <div className="min-h-screen -m-6 p-6 relative" style={{ background: T.bg }}>
      {/* Background Logo Watermark */}
      <div
        className="fixed inset-0 z-0 pointer-events-none opacity-5 dark:opacity-[0.03] dark:invert"
        style={{
          backgroundImage: 'url(/data/Everywhere Logo_Mark & Title_Black.png)',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundSize: '50%',
          filter: 'blur(2px)',
        }}
      />

      <div className="max-w-7xl mx-auto">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8 relative z-10">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight" style={{ color: T.text }}>
              Global Dashboard
            </h1>
            <p className="text-sm mt-1" style={{ color: T.muted }}>
              Mission progress · Church planting movements · Regional insights
            </p>
          </div>
          <div className="flex items-center gap-4">
            {paginationProgress && (
              <span className="text-xs text-primary-600 bg-primary-50 px-2 py-1 rounded">
                Loading: {paginationProgress.recordsFetched}/{paginationProgress.totalCount}
              </span>
            )}
            <p className="text-gray-500 dark:text-slate-400 text-sm">
              {format(new Date(), "EEEE d MMMM yyyy", { locale: dateLocale })}
            </p>
            <button
              onClick={handleRefresh}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-white border border-gray-200 shadow-sm hover:shadow-md transition-all duration-200 dark:bg-white/5 dark:border-white/10 dark:text-indigo-300"
              style={{ color: T.primary }}
            >
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh · {timeAgo()}
            </button>
          </div>
        </div>

        {/* ── Grid Layout — Progress Metrics ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8 relative z-10">

          <ProgressMetrics />

        </div>

        {/* ── Global People Groups (JP + IMB uniquement, par statut) ──
            Source : couche carte /map/markers (JP et IMB fusionnés = 1 point).
            On ne compte jamais deux fois le même peuple. */}
        <div className="bg-white/75 backdrop-blur-lg rounded-2xl shadow-md border border-white/60 dark:bg-slate-900/60 dark:border-white/10 p-5 mb-6 relative z-10">
          <div className="flex items-center justify-between gap-3 mb-5">
            <div className="flex items-center gap-3">
              <Target size={22} className="text-sky-600" />
              <h2 className="text-xl font-bold text-gray-800 dark:text-slate-100">Global People Groups</h2>
              <span className="text-xs font-medium text-gray-400 dark:text-slate-400">JP + IMB</span>
            </div>
            <div className="text-right">
              <p className="text-3xl font-black text-sky-700 dark:text-sky-300 leading-none">{mapPeopleStats.total}</p>
              <p className="text-[11px] text-gray-400 dark:text-slate-400 mt-1">peuples (carte)</p>
            </div>
          </div>

          {mapPeopleStats.statusList.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-gray-400 dark:text-slate-500 text-sm">
              Aucun peuple JP/IMB disponible
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {mapPeopleStats.statusList.map(({ status, count, color }) => (
                <div
                  key={status}
                  className="rounded-2xl p-4 text-center border transition-colors"
                  style={{ backgroundColor: `${color}1A`, borderColor: `${color}55` }}
                >
                  <p className="text-4xl font-bold mb-1" style={{ color }}>{count}</p>
                  <p className="text-sm font-semibold capitalize" style={{ color }}>{status.toLowerCase().replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Global DMM Engagements — tableau DMM coloré (étape × niveau) ──
            Source : couche carte /map/dmm-engagements (un point par engagement).
            Chiffres GLOBAUX réels. Couleurs = statuts DMM d'Unified Map. */}
        <div className="mb-6 relative z-10">
          <DmmProgressTable
            engagements={dmmEngagements}
            isFrench={isFrench}
            title={isFrench ? 'Global DMM Engagements — Tableau DMM (étape × niveau)' : 'Global DMM Engagements — DMM table (stage × level)'}
          />
        </div>

        {/* ── Répartition People Groups : Source · Statut · JP non-engagés ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mb-6 relative z-10 items-stretch">

          {/* People Groups by Source (Donut) — apporte sa propre carte */}
          <div className="[&>div]:h-full [&>div]:mb-0 flex flex-col">
            <SourceDonutChart peopleGroups={mapSourcePeople} />
          </div>

          {/* People Groups by Status (Pie) */}
          <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 border border-white/60 flex flex-col relative z-10 overflow-hidden dark:bg-slate-900/60 dark:border-white/10 dark:shadow-[0_0_25px_-5px_rgba(99,102,241,0.45)] dark:ring-1 dark:ring-indigo-500/20">
            {/* halo futuriste subtil */}
            <div className="absolute -top-16 -right-16 w-40 h-40 rounded-full opacity-20 dark:opacity-40 pointer-events-none"
              style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
            <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 flex items-center gap-2 mb-5 relative">
              <Target size={18} className="text-primary-600" />
              {t('dashboard.peopleGroupStatus') || 'People Group Status'}
            </h3>
            {engagementStatusData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={160}>
                  <PieChart>
                    <Pie
                      data={engagementStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={34}
                      outerRadius={62}
                      paddingAngle={5}
                      dataKey="count"
                    >
                      {engagementStatusData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color || engagementStatusColors[entry.status] || '#9ca3af'}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: isDark ? '#0f172a' : '#fff',
                        border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        color: isDark ? '#e2e8f0' : undefined,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-3 space-y-1.5">
                  {engagementStatusData.map((item, index) => (
                    <div key={index} className="flex items-center justify-between text-sm p-1.5 rounded-lg hover:bg-gray-50/80 dark:hover:bg-white/5 transition-colors">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3.5 h-3.5 rounded-full shadow-sm"
                          style={{ backgroundColor: item.color || engagementStatusColors[item.status] || '#9ca3af' }}
                        />
                        <span className="text-gray-700 dark:text-slate-200 font-medium">{item.label}</span>
                      </div>
                      <span className="font-bold text-gray-800 dark:text-slate-100">{item.count}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-48 text-gray-400 dark:text-slate-500">
                <p>No people groups data available</p>
              </div>
            )}
          </div>

          {/* Peuples JP/IMB non-engagés — piloté par le lien JP+IMB de la carte */}
          <div className="md:col-span-2 xl:col-span-1 flex flex-col [&>div]:h-full [&>div]:rounded-xl">
            <JPCoverageWidget
              total={jpImbEngagementStats.total}
              engaged={jpImbEngagementStats.engaged}
              nonEngaged={jpImbEngagementStats.nonEngaged}
            />
          </div>

        </div>

        {/* ── Village Coverage — 3 widgets ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6 relative z-10">

          {/* WIDGET 1 — Statut des villages */}
          <div className="bg-white/75 backdrop-blur-lg rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-5 border border-white/60 dark:bg-slate-900/60 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3 flex items-center gap-2">
              <Home size={16} className="text-primary-600" />
              Statut des villages
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl p-3.5 text-center border border-red-100 bg-red-50/80 dark:bg-red-500/10 dark:border-red-500/20">
                <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Non-atteint</p>
                <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                  {kpiSummary?.villageStatusCounts?.unreached
                    ?? coverageGauge?.statusCounts?.unreached
                    ?? statusDistribution?.villages?.find(v => v.status === 'unreached')?.count
                    ?? '—'}
                </p>
              </div>
              <div className="rounded-xl p-3.5 text-center border border-green-100 bg-green-50/80 dark:bg-green-500/10 dark:border-green-500/20">
                <p className="text-xs font-semibold text-green-700 dark:text-green-400 mb-1">Mouvement</p>
                <p className="text-3xl font-bold text-green-700 dark:text-green-400">
                  {kpiSummary?.villageStatusCounts?.dmm
                    ?? coverageGauge?.statusCounts?.dmm
                    ?? statusDistribution?.villages?.find(v => v.status === 'dmm')?.count
                    ?? '—'}
                </p>
              </div>
              <div className="rounded-xl p-3.5 text-center border border-yellow-100 bg-yellow-50/80 dark:bg-yellow-500/10 dark:border-yellow-500/20">
                <p className="text-xs font-semibold text-yellow-600 dark:text-yellow-400 mb-1">En cours</p>
                <p className="text-3xl font-bold text-yellow-600 dark:text-yellow-400">
                  {kpiSummary?.villageStatusCounts
                    ? (kpiSummary.villageStatusCounts.pioneer || 0)
                      + (kpiSummary.villageStatusCounts.midway || 0)
                      + (kpiSummary.villageStatusCounts['tipping-point'] || 0)
                    : coverageGauge?.villageCoverage?.withData ?? '—'}
                </p>
                <p className="text-xs text-yellow-500 dark:text-yellow-400 mt-1">avec données</p>
              </div>
              <div className="rounded-xl p-3.5 text-center border border-gray-100 bg-gray-50/80 dark:bg-white/5 dark:border-white/10">
                <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-1">Sans données</p>
                <p className="text-3xl font-bold text-gray-500 dark:text-slate-400">
                  {coverageGauge?.villageCoverage?.withoutData
                    ?? kpiSummary?.villageStatusCounts?.noData
                    ?? '—'}
                </p>
              </div>
            </div>
          </div>

          {/* WIDGET 2 — Donut villages avec données DMM */}
          <div className="bg-white/75 backdrop-blur-lg rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-5 border border-white/60 dark:bg-slate-900/60 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3 flex items-center gap-2">
              <Target size={16} className="text-primary-600" />
              Villages avec données DMM
            </h3>
            {(() => {
              const raw = statusDistribution?.villages
                || (kpiSummary?.villageStatusCounts
                  ? Object.entries(kpiSummary.villageStatusCounts)
                      .filter(([k]) => k !== 'noData')
                      .map(([status, count]) => ({ status, count }))
                  : null)
              const donutColors = {
                unreached: '#ef4444',
                pioneer: '#f97316',
                midway: '#eab308',
                'tipping-point': '#22c55e',
                dmm: '#15803d',
              }
              const donutLabels = {
                unreached: 'Non-atteint',
                pioneer: 'Pionnier',
                midway: 'Mi-parcours',
                'tipping-point': 'Basculement',
                dmm: 'Mouvement',
              }
              const total = raw?.reduce((s, d) => s + (d.count || 0), 0) || 0
              if (!raw || raw.length === 0) {
                return (
                  <div className="flex items-center justify-center h-36 text-gray-400 dark:text-slate-500 text-sm">
                    Aucune donnée disponible
                  </div>
                )
              }
              return (
                <>
                  <div className="relative">
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie
                          data={raw}
                          cx="50%"
                          cy="50%"
                          innerRadius={44}
                          outerRadius={68}
                          paddingAngle={3}
                          dataKey="count"
                        >
                          {raw.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={donutColors[entry.status] || '#9ca3af'} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, name, props) => [value, donutLabels[props.payload?.status] || props.payload?.status]}
                          contentStyle={{ backgroundColor: isDark ? '#0f172a' : '#fff', border: isDark ? '1px solid #334155' : '1px solid #e5e7eb', borderRadius: '8px', color: isDark ? '#e2e8f0' : undefined }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-gray-800 dark:text-slate-100">{total}</p>
                        <p className="text-xs text-gray-400 dark:text-slate-400">villages</p>
                      </div>
                    </div>
                  </div>
                  <div className="space-y-1 mt-2">
                    {raw.filter(d => d.count > 0).map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: donutColors[item.status] || '#9ca3af' }} />
                          <span className="text-gray-600 dark:text-slate-300">{donutLabels[item.status] || item.status}</span>
                        </div>
                        <span className="font-semibold text-gray-800 dark:text-slate-100">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )
            })()}
          </div>

          {/* WIDGET 3 — Gauge couverture villages */}
          <div className="bg-white/75 backdrop-blur-lg rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-5 border border-white/60 dark:bg-slate-900/60 dark:border-white/10">
            <h3 className="text-sm font-semibold text-gray-800 dark:text-slate-100 mb-3 flex items-center gap-2">
              <BarChart3 size={16} className="text-primary-600" />
              Couverture des villages
            </h3>
            {(() => {
              const withData = coverageGauge?.villageCoverage?.withData ?? kpiSummary?.villageCoverage?.withData ?? 0
              const total    = coverageGauge?.villageCoverage?.total ?? kpiSummary?.villageCoverage?.total ?? villageStats.total ?? 0
              const pct      = total > 0 ? ((withData / total) * 100).toFixed(1) : '0.0'
              const gaugeVal = parseFloat(pct)
              const filled   = (gaugeVal / 100) * 180
              const gaugeData = [
                { value: filled,       fill: '#0ea5e9' },
                { value: 180 - filled, fill: isDark ? '#1e293b' : '#e5e7eb' },
                { value: 180,          fill: 'transparent' },
              ]
              return (
                <>
                  <div className="relative" style={{ height: 132 }}>
                    <ResponsiveContainer width="100%" height={132}>
                      <PieChart>
                        <Pie
                          data={gaugeData}
                          cx="50%"
                          cy="85%"
                          startAngle={180}
                          endAngle={0}
                          innerRadius={48}
                          outerRadius={68}
                          paddingAngle={0}
                          dataKey="value"
                          isAnimationActive={true}
                        >
                          {gaugeData.map((entry, index) => (
                            <Cell key={index} fill={entry.fill} strokeWidth={0} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-end justify-center pb-4 pointer-events-none">
                      <div className="text-center">
                        <p className="text-2xl font-bold text-sky-600 dark:text-sky-400">{pct}%</p>
                        <p className="text-xs text-gray-400 dark:text-slate-400 mt-0.5">villages engagés</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-400 dark:text-slate-400 mt-1">
                    <span>0</span>
                    <span>{total.toLocaleString('fr-FR')}</span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-gray-500 dark:text-slate-400 mb-1">
                      <span className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" />
                        {withData.toLocaleString('fr-FR')} avec données
                      </span>
                      <span className="text-gray-400 dark:text-slate-400">sur {total.toLocaleString('fr-FR')}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-white/10 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(gaugeVal, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-gray-100 dark:border-white/10 flex items-center justify-between text-xs">
                    <span className="text-gray-400 dark:text-slate-400">Objectif 100%</span>
                    <span className="font-semibold text-gray-600 dark:text-slate-300">{(total - withData).toLocaleString('fr-FR')} restants</span>
                  </div>
                </>
              )
            })()}
          </div>

        </div>

        {/* ── Charts Row ── */}
        <div className="grid grid-cols-1 gap-8 mb-8 relative z-10">
          {/* Comparison Bar Chart */}
          <div className="bg-white/75 backdrop-blur-lg rounded-2xl shadow-md hover:shadow-lg transition-all duration-300 p-5 border border-white/60 dark:bg-slate-900/60 dark:border-white/10">
            <h3 className="text-base font-semibold text-gray-800 dark:text-slate-100 mb-4 flex items-center gap-2 drop-shadow">
              <BarChart3 size={18} className="text-primary-600" />
              {t('dashboard.statusComparison') || 'Status Comparison'}
            </h3>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={comparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#334155' : '#e5e7eb'} />
                <XAxis dataKey="name" tick={{ fill: isDark ? '#94a3b8' : '#6b7280' }} />
                <YAxis tick={{ fill: isDark ? '#94a3b8' : '#6b7280' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0f172a' : '#fff',
                    border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    color: isDark ? '#e2e8f0' : undefined,
                  }}
                />
                <Legend />
                <Bar dataKey="peopleGroups" name="People Groups" fill="#6366f1" radius={[6, 6, 0, 0]} />
                <Bar dataKey="villages" name="Villages" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* ── Footer note ── */}
        <p className="text-center text-xs mt-8 pb-4" style={{ color: T.muted }}>
          Data refreshes automatically every 60 seconds · Church Planting Map Analytics
        </p>
      </div>
    </div>
  )
}

export default AnalyticsDashboard
