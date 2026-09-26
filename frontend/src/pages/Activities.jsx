import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { activitiesApi, villagesApi, churchesApi, peopleGroupsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  Search,
  Plus,
  Calendar,
  MapPin,
  Church,
  X,
  Clock,
  Users,
  ClipboardCheck,
  AlertCircle,
  Archive,
  ArchiveRestore,
  Eye,
  EyeOff,
  Heart,
  BookOpen,
  GraduationCap,
  Megaphone,
  Music,
  UsersRound,
  MessageCircle,
  MoreHorizontal,
  ChevronDown,
  Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { useLanguage } from '../i18n'

const activityTypeKeys = [
  'evangelism',
  'discipleship',
  'prayer',
  'training',
  'outreach',
  'worship',
  'meeting',
  'coaching-igrow',
  'other',
]

// Activity type configurations with icons and colors
const activityTypeConfig = {
  evangelism: { 
    icon: Megaphone, 
    color: '#8b5cf6', 
    bgColor: 'bg-purple-100', 
    textColor: 'text-purple-700',
    borderColor: 'border-l-purple-500'
  },
  discipleship: { 
    icon: BookOpen, 
    color: '#3b82f6', 
    bgColor: 'bg-blue-100', 
    textColor: 'text-blue-700',
    borderColor: 'border-l-blue-500'
  },
  prayer: { 
    icon: Heart, 
    color: '#eab308', 
    bgColor: 'bg-yellow-100', 
    textColor: 'text-yellow-700',
    borderColor: 'border-l-yellow-500'
  },
  training: { 
    icon: GraduationCap, 
    color: '#22c55e', 
    bgColor: 'bg-green-100', 
    textColor: 'text-green-700',
    borderColor: 'border-l-green-500'
  },
  outreach: { 
    icon: Heart, 
    color: '#f97316', 
    bgColor: 'bg-orange-100', 
    textColor: 'text-orange-700',
    borderColor: 'border-l-orange-500'
  },
  worship: { 
    icon: Music, 
    color: '#ec4899', 
    bgColor: 'bg-pink-100', 
    textColor: 'text-pink-700',
    borderColor: 'border-l-pink-500'
  },
  meeting: { 
    icon: UsersRound, 
    color: '#6b7280', 
    bgColor: 'bg-gray-100', 
    textColor: 'text-gray-700',
    borderColor: 'border-l-gray-500'
  },
  'coaching-igrow': { 
    icon: MessageCircle, 
    color: '#14b8a6', 
    bgColor: 'bg-teal-100', 
    textColor: 'text-teal-700',
    borderColor: 'border-l-teal-500'
  },
  other: { 
    icon: MoreHorizontal, 
    color: '#6b7280', 
    bgColor: 'bg-gray-100', 
    textColor: 'text-gray-700',
    borderColor: 'border-l-gray-400'
  },
}

// Coaching iGROW conversation partner options
const coachingConversationWithOptions = [
  { value: 'leader', labelKey: 'activities.coaching.leader' },
  { value: 'church-planter', labelKey: 'activities.coaching.churchPlanter' },
  { value: 'other', labelKey: 'activities.coaching.otherPerson' },
]

const Activities = () => {
  const { t, language } = useLanguage()
  const { user } = useAuth()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  
  // Build activity types with translations
  const activityTypes = activityTypeKeys.map(key => ({
    value: key,
    label: t(`activities.types.${key}`)
  }))
  
  // Get date locale based on current language
  const dateLocale = language === 'fr' ? fr : enUS

  const [searchTerm, setSearchTerm] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [villageFilter, setVillageFilter] = useState(searchParams.get('village') || '')
  const [churchFilter, setChurchFilter] = useState(searchParams.get('church') || '')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [newActivity, setNewActivity] = useState({
    type: 'evangelism',
    description: '',
    date: '',
    village: '',
    church: '',
    participants: '',
    notes: '',
    coachingDetails: {
      conversationWith: '',
      conversationTheme: '',
      duration: '',
    },
  })

  const { data: activitiesData, isLoading, error } = useQuery({
    queryKey: ['activities', searchTerm, typeFilter, villageFilter, churchFilter, dateFrom, dateTo],
    queryFn: async () => {
      const params = {}
      if (searchTerm) params.search = searchTerm
      if (typeFilter) params.type = typeFilter
      if (villageFilter) params.village = villageFilter
      if (churchFilter) params.church = churchFilter
      if (dateFrom) params.dateFrom = dateFrom
      if (dateTo) params.dateTo = dateTo
      const response = await activitiesApi.getAll(params)
      return response.data.activities || []
    },
  })

  const { data: villages } = useQuery({
    queryKey: ['villages-list'],
    queryFn: async () => {
      const response = await villagesApi.getAll()
      return response.data.villages || []
    },
  })

  const { data: churches } = useQuery({
    queryKey: ['churches-list'],
    queryFn: async () => {
      const response = await churchesApi.getAll()
      return response.data.churches || []
    },
  })

  // Query for pending validations count (only for supervisors/admins)
  const canValidate = user?.role === 'admin' || user?.role === 'supervisor'
  const { data: pendingData } = useQuery({
    queryKey: ['pendingValidationsCount'],
    queryFn: async () => {
      const response = await peopleGroupsApi.getPending({ limit: 1 })
      return response.data
    },
    enabled: canValidate,
  })
  const pendingCount = pendingData?.total || 0

  // Query for rejected people groups count (only for supervisors/admins)
  const { data: rejectedData } = useQuery({
    queryKey: ['rejectedPeopleGroupsCount'],
    queryFn: async () => {
      const response = await peopleGroupsApi.getRejectedCount()
      return response.data
    },
    enabled: canValidate,
  })
  const rejectedCount = rejectedData?.total || 0

  const createMutation = useMutation({
    mutationFn: (data) => activitiesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['activities'])
      toast.success(t('activities.messages.createSuccess'))
      resetForm()
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('activities.messages.createError'))
    },
  })

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }) => activitiesApi.archive(id, archived),
    onSuccess: (response, variables) => {
      queryClient.invalidateQueries(['activities'])
      toast.success(variables.archived ? t('activities.messages.archiveSuccess') : t('activities.messages.unarchiveSuccess'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('activities.messages.archiveError'))
    },
  })

  const handleArchive = (activityId, currentArchived) => {
    archiveMutation.mutate({ id: activityId, archived: !currentArchived })
  }

  const resetForm = () => {
    setShowAddModal(false)
    setNewActivity({
      type: 'evangelism',
      description: '',
      date: '',
      village: '',
      church: '',
      participants: '',
      notes: '',
      coachingDetails: {
        conversationWith: '',
        conversationTheme: '',
        duration: '',
      },
    })
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    const activityData = {
      ...newActivity,
      participants: parseInt(newActivity.participants) || 0,
    }
    if (!activityData.village) delete activityData.village
    if (!activityData.church) delete activityData.church
    if (activityData.type === 'coaching-igrow') {
      activityData.coachingDetails = {
        conversationWith: newActivity.coachingDetails.conversationWith || undefined,
        conversationTheme: newActivity.coachingDetails.conversationTheme || undefined,
        duration: parseInt(newActivity.coachingDetails.duration) || undefined,
      }
    } else {
      delete activityData.coachingDetails
    }
    createMutation.mutate(activityData)
  }

  const clearFilters = () => {
    setSearchTerm('')
    setTypeFilter('')
    setVillageFilter('')
    setChurchFilter('')
    setDateFrom('')
    setDateTo('')
  }

  const allActivities = activitiesData || []
  const activities = showArchived 
    ? allActivities 
    : allActivities.filter(a => !a.archived)
  const archivedCount = allActivities.filter(a => a.archived).length
  const hasActiveFilters = searchTerm || typeFilter || villageFilter || churchFilter || dateFrom || dateTo

  // Calculate type counts
  const typeCounts = activities.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] || 0) + 1
    return acc
  }, {})

  // Loading skeleton
  if (isLoading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8">
          <div className="h-8 w-48 bg-white/20 rounded-lg animate-pulse mb-4"></div>
          <div className="h-6 w-32 bg-white/20 rounded-lg animate-pulse"></div>
        </div>
        <div className="space-y-4">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex gap-4">
                <div className="w-12 h-12 bg-gray-200 rounded-xl animate-pulse"></div>
                <div className="flex-1">
                  <div className="h-5 w-24 bg-gray-200 rounded animate-pulse mb-2"></div>
                  <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[400px] flex items-center justify-center">
        <div className="text-center bg-white rounded-2xl shadow-lg p-12 max-w-md">
          <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <X size={40} className="text-red-500" />
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">{t('activities.messages.loadError')}</h3>
          <p className="text-gray-500">{t('activities.messages.loadErrorDesc')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Gradient Header */}
      <div className="bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">{t('activities.title')}</h1>
            <p className="text-emerald-100 text-lg">
              {t('activities.totalCount').replace('{count}', activities.length)}
            </p>
          </div>
          
          {/* Quick Actions */}
          <div className="flex flex-wrap gap-3">
            {canValidate && (
              <>
                <button
                  onClick={() => navigate('/pending-validations')}
                  className="relative flex items-center gap-2 px-4 py-2 bg-white/15 backdrop-blur-sm rounded-xl hover:bg-white/25 transition-all"
                >
                  <ClipboardCheck size={18} />
                  <span className="text-sm font-medium">{t('validation.pendingValidations')}</span>
                  {pendingCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center shadow-lg">
                      {pendingCount > 99 ? '99+' : pendingCount}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => navigate('/rejected-people-groups')}
                  className="relative flex items-center gap-2 px-4 py-2 bg-red-500/20 backdrop-blur-sm rounded-xl hover:bg-red-500/30 transition-all"
                >
                  <AlertCircle size={18} />
                  <span className="text-sm font-medium">{t('rejected.rejectedPeopleGroups')}</span>
                  {rejectedCount > 0 && (
                    <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center shadow-lg">
                      {rejectedCount > 99 ? '99+' : rejectedCount}
                    </span>
                  )}
                </button>
              </>
            )}
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-5 py-2 bg-white text-emerald-700 rounded-xl hover:bg-emerald-50 transition-all font-semibold shadow-lg"
            >
              <Plus size={18} />
              {t('activities.newActivity')}
            </button>
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          New Generation — contenu inspiré de goeverywhere.org
          (Calendrier annuel + Engagements S.E.R.V.E. + liens externes)
          ───────────────────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Calendrier annuel New Generation */}
        <section className="rounded-2xl border border-gray-100 bg-white/90 backdrop-blur-lg shadow-lg p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <Calendar size={20} className="text-emerald-600" />
            <h2 className="text-lg font-bold text-gray-800">Calendrier annuel New Generation</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { q: 'Q1', label: 'Vision & Lancement' },
              { q: 'Q2', label: 'Mobilisation & Formation' },
              { q: 'Q3', label: 'Expansion & Partenariats' },
              { q: 'Q4', label: 'Moisson & Bilan' },
            ].map((item) => (
              <div key={item.q} className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-emerald-600">{item.q}</div>
                <div className="mt-1 text-sm font-medium text-gray-700">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Engagements S.E.R.V.E. */}
        <section className="rounded-2xl border border-gray-100 bg-white/90 backdrop-blur-lg shadow-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Heart size={20} className="text-rose-500" />
            <h2 className="text-lg font-bold text-gray-800">Nos engagements communs S.E.R.V.E.</h2>
          </div>
          <ul className="space-y-2.5">
            {[
              { l: 'S', en: 'Spiritual Vitality', fr: 'Vitalité spirituelle' },
              { l: 'E', en: 'Empowering Leadership', fr: 'Développer le leadership' },
              { l: 'R', en: 'Relational Unity', fr: 'Unité relationnelle' },
              { l: 'V', en: 'Visionary Execution', fr: 'Exécution visionnaire' },
              { l: 'E', en: 'Engagement with the Margins', fr: 'Aller vers les moins atteints' },
            ].map((item, i) => (
              <li key={`${item.l}-${i}`} className="flex items-start gap-3">
                <span className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 text-sm font-bold">
                  {item.l}
                </span>
                <div className="text-sm">
                  <div className="font-medium text-gray-800">{item.fr}</div>
                  <div className="text-xs text-gray-400">{item.en}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {/* Liens externes : site officiel + calendrier détaillé */}
      <div className="flex flex-wrap gap-3">
        <a
          href="https://goeverywhere.org"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
        >
          goeverywhere.org ↗
        </a>
        <a
          href="https://reminiscent-acapella-740.notion.site/EVERYWHERE-2a3ec55e01df8007bfc3fc19d481d3fc"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Calendrier détaillé (Notion) ↗
        </a>
      </div>

      {/* Search and Type Filter Tabs */}
      <div className="bg-white/90 backdrop-blur-lg rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-gray-100">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1 relative">
              <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder={t('activities.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                  showFilters 
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-700' 
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Filter size={18} />
                {t('common.filters')}
                {hasActiveFilters && (
                  <span className="w-2 h-2 bg-emerald-500 rounded-full"></span>
                )}
                <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
              </button>
              <button
                onClick={() => setShowArchived(!showArchived)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-all ${
                  showArchived 
                    ? 'bg-gray-200 border-gray-300 text-gray-700' 
                    : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                }`}
                title={showArchived ? t('activities.hideArchived') : t('activities.showArchived')}
              >
                {showArchived ? <EyeOff size={18} /> : <Eye size={18} />}
                <Archive size={18} />
                {archivedCount > 0 && (
                  <span className="bg-gray-500 text-white text-xs px-2 py-0.5 rounded-full">{archivedCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Activity Type Filter Tabs - Horizontal Scrollable */}
        <div className="px-4 py-3 overflow-x-auto scrollbar-hide">
          <div className="flex gap-2 min-w-max">
            <button
              onClick={() => setTypeFilter('')}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                typeFilter === '' 
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-current opacity-60"></span>
              {t('activities.filters.allTypes')}
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${typeFilter === '' ? 'bg-white/20' : 'bg-gray-200'}`}>
                {activities.length}
              </span>
            </button>
            {activityTypes.map((type) => {
              const config = activityTypeConfig[type.value] || activityTypeConfig.other
              const TypeIcon = config.icon
              const count = typeCounts[type.value] || 0
              return (
                <button
                  key={type.value}
                  onClick={() => setTypeFilter(type.value)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap ${
                    typeFilter === type.value 
                      ? `${config.bgColor} ${config.textColor} shadow-md ring-2 ring-offset-1`
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                  style={typeFilter === type.value ? { '--tw-ring-color': config.color } : {}}
                >
                  <TypeIcon size={16} style={{ color: typeFilter === type.value ? config.color : '#6b7280' }} />
                  {type.label}
                  {count > 0 && (
                    <span className={`px-1.5 py-0.5 rounded-full text-xs ${
                      typeFilter === type.value ? 'bg-white/50' : 'bg-gray-200'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="px-4 pb-4 pt-2 border-t border-gray-100 animate-fade-in">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('activities.labels.village')}</label>
                <select
                  value={villageFilter}
                  onChange={(e) => setVillageFilter(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">{t('activities.filters.allVillages')}</option>
                  {villages?.map((village) => (
                    <option key={village._id} value={village._id}>{village.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('activities.labels.church')}</label>
                <select
                  value={churchFilter}
                  onChange={(e) => setChurchFilter(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">{t('activities.filters.allChurches')}</option>
                  {churches?.map((church) => (
                    <option key={church._id} value={church._id}>{church.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('activities.filters.dateFrom')}</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">{t('activities.filters.dateTo')}</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
            {hasActiveFilters && (
              <button 
                onClick={clearFilters}
                className="mt-4 flex items-center gap-2 px-4 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-medium"
              >
                <X size={16} />
                {t('common.clearFilters') || 'Effacer les filtres'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Activities List */}
      {activities.length > 0 ? (
        <div className="space-y-4">
          {activities.map((activity) => {
            const config = activityTypeConfig[activity.type] || activityTypeConfig.other
            const TypeIcon = config.icon
            return (
              <div
                key={activity._id}
                className={`group bg-white rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden border-l-4 ${config.borderColor} ${
                  activity.archived ? 'opacity-60' : ''
                }`}
              >
                <div className="p-5">
                  <div className="flex items-start gap-4">
                    {/* Icon Badge */}
                    <div 
                      className={`p-3 rounded-xl ${config.bgColor} transition-transform group-hover:scale-110`}
                    >
                      <TypeIcon size={24} style={{ color: config.color }} />
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${config.bgColor} ${config.textColor}`}>
                          {activityTypes.find((t) => t.value === activity.type)?.label || activity.type}
                        </span>
                        {activity.archived && (
                          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-200 text-gray-600 flex items-center gap-1">
                            <Archive size={12} />
                            {t('activities.archived')}
                          </span>
                        )}
                      </div>
                      
                      <p className="font-medium text-gray-900 mb-3">{activity.description}</p>
                      
                      {/* Date - Prominent Display */}
                      {activity.date && (
                        <div className="flex items-center gap-2 mb-3">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 rounded-lg">
                            <Calendar size={16} className="text-gray-500" />
                            <span className="text-sm font-medium text-gray-700">
                              {format(new Date(activity.date), 'EEEE dd MMMM yyyy', { locale: dateLocale })}
                            </span>
                          </div>
                        </div>
                      )}
                      
                      {/* Location Tags */}
                      <div className="flex flex-wrap items-center gap-3 text-sm">
                        {activity.village && (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 text-blue-700 rounded-full">
                            <MapPin size={14} />
                            {activity.village.name || activity.village}
                          </span>
                        )}
                        {activity.church && (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-purple-50 text-purple-700 rounded-full">
                            <Church size={14} />
                            {activity.church.name || activity.church}
                          </span>
                        )}
                        {activity.participants > 0 && (
                          <span className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 rounded-full">
                            <Users size={14} />
                            {activity.participants} {t('common.participants').toLowerCase()}
                          </span>
                        )}
                      </div>

                      {activity.notes && (
                        <p className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg border-l-2 border-gray-300">
                          {activity.notes}
                        </p>
                      )}
                    </div>
                    
                    {/* Actions */}
                    <div className="flex flex-col items-end gap-2">
                      {activity.createdAt && (
                        <span className="text-xs text-gray-400 flex items-center gap-1">
                          <Clock size={12} />
                          {format(new Date(activity.createdAt), 'HH:mm')}
                        </span>
                      )}
                      <button
                        onClick={() => handleArchive(activity._id, activity.archived)}
                        disabled={archiveMutation.isLoading}
                        className={`p-2 rounded-lg transition-all ${
                          activity.archived 
                            ? 'text-green-600 hover:bg-green-50 hover:scale-110' 
                            : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 hover:scale-110'
                        }`}
                        title={activity.archived ? t('activities.unarchive') : t('activities.archive')}
                      >
                        {activity.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        /* Empty State */
        <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
          <div className="w-32 h-32 bg-gradient-to-br from-emerald-100 to-teal-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Calendar size={56} className="text-emerald-400" />
          </div>
          <h3 className="text-2xl font-bold text-gray-900 mb-2">{t('activities.empty.title')}</h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            {hasActiveFilters
              ? t('activities.empty.withFilters')
              : t('activities.empty.withoutFilters')}
          </p>
          {!hasActiveFilters && (
            <button
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all shadow-lg font-medium"
            >
              <Plus size={20} />
              {t('activities.addActivity')}
            </button>
          )}
        </div>
      )}

      {/* Floating Add Button (Mobile) */}
      <button
        onClick={() => setShowAddModal(true)}
        className="fixed bottom-6 right-6 lg:hidden w-14 h-14 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-full shadow-2xl flex items-center justify-center z-40 hover:scale-110 transition-all"
      >
        <Plus size={24} />
      </button>

      {/* Add Activity Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-in">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-emerald-600 to-teal-600 px-6 py-5 rounded-t-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white">{t('activities.newActivity')}</h3>
                  <p className="text-emerald-100 text-sm mt-1">{t('activities.addActivityDesc') || 'Enregistrez une nouvelle activité'}</p>
                </div>
                <button 
                  onClick={resetForm} 
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X size={20} className="text-white" />
                </button>
              </div>
            </div>
            
            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('activities.labels.activityType')} <span className="text-red-500">*</span>
                </label>
                <select
                  value={newActivity.type}
                  onChange={(e) => setNewActivity((prev) => ({ ...prev, type: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  required
                >
                  {activityTypes.map((type) => (
                    <option key={type.value} value={type.value}>{type.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('activities.labels.description')} <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={newActivity.description}
                  onChange={(e) => setNewActivity((prev) => ({ ...prev, description: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                  rows={3}
                  required
                  placeholder={t('activities.placeholders.description') || 'Décrivez l\'activité...'}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('activities.labels.date')} <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newActivity.date}
                    onChange={(e) => setNewActivity((prev) => ({ ...prev, date: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    {t('activities.labels.participants')}
                  </label>
                  <input
                    type="number"
                    value={newActivity.participants}
                    onChange={(e) => setNewActivity((prev) => ({ ...prev, participants: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    min="0"
                    placeholder="0"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('activities.labels.village')}
                </label>
                <select
                  value={newActivity.village}
                  onChange={(e) => setNewActivity((prev) => ({ ...prev, village: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">{t('activities.placeholders.selectVillage')}</option>
                  {villages?.map((village) => (
                    <option key={village._id} value={village._id}>{village.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('activities.labels.church')}
                </label>
                <select
                  value={newActivity.church}
                  onChange={(e) => setNewActivity((prev) => ({ ...prev, church: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">{t('activities.placeholders.selectChurch')}</option>
                  {churches?.map((church) => (
                    <option key={church._id} value={church._id}>{church.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  {t('activities.labels.notes')}
                </label>
                <textarea
                  value={newActivity.notes}
                  onChange={(e) => setNewActivity((prev) => ({ ...prev, notes: e.target.value }))}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none"
                  rows={2}
                  placeholder={t('activities.placeholders.notes') || 'Notes additionnelles...'}
                />
              </div>

              {/* Coaching iGROW specific fields */}
              {newActivity.type === 'coaching-igrow' && (
                <div className="space-y-4 p-4 bg-teal-50 rounded-xl border border-teal-200">
                  <h4 className="font-semibold text-teal-800 flex items-center gap-2">
                    <MessageCircle size={18} />
                    {t('activities.coaching.title') || 'Détails du coaching iGROW'}
                  </h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('activities.coaching.conversationWith') || 'Conversation avec'}
                    </label>
                    <select
                      value={newActivity.coachingDetails.conversationWith}
                      onChange={(e) => setNewActivity((prev) => ({
                        ...prev,
                        coachingDetails: { ...prev.coachingDetails, conversationWith: e.target.value }
                      }))}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                    >
                      <option value="">{t('common.select') || 'Sélectionner...'}</option>
                      {coachingConversationWithOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>{t(opt.labelKey) || opt.value}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('activities.coaching.theme') || 'Thème de la conversation'}
                    </label>
                    <input
                      type="text"
                      value={newActivity.coachingDetails.conversationTheme}
                      onChange={(e) => setNewActivity((prev) => ({
                        ...prev,
                        coachingDetails: { ...prev.coachingDetails, conversationTheme: e.target.value }
                      }))}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      placeholder={t('activities.coaching.themePlaceholder') || 'Ex: Leadership, Vision...'}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('activities.coaching.duration') || 'Durée (minutes)'}
                    </label>
                    <input
                      type="number"
                      value={newActivity.coachingDetails.duration}
                      onChange={(e) => setNewActivity((prev) => ({
                        ...prev,
                        coachingDetails: { ...prev.coachingDetails, duration: e.target.value }
                      }))}
                      className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-transparent"
                      min="0"
                      placeholder="30"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button 
                  type="button" 
                  onClick={resetForm} 
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isLoading}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl hover:from-emerald-700 hover:to-teal-700 transition-all font-medium disabled:opacity-50"
                >
                  {createMutation.isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      {t('common.loading')}
                    </span>
                  ) : t('activities.addActivity')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Activities
