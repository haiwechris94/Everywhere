import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { peopleGroupsApi } from '../services/api'
import {
  XCircle,
  Clock,
  MapPin,
  User,
  Calendar,
  AlertTriangle,
  ArrowLeft,
  Users,
  Eye,
  Archive,
  Loader2,
  Search,
  MessageSquare,
  RefreshCw,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import { useLanguage } from '../i18n'

const statusColors = {
  unreached: 'bg-red-100 text-red-800',
  pioneer: 'bg-blue-100 text-blue-800',
  midway: 'bg-orange-100 text-orange-800',
  'tipping-point': 'bg-yellow-100 text-yellow-800',
  dmm: 'bg-green-100 text-green-800',
}

const resubmissionStatusColors = {
  rejected: 'bg-red-100 text-red-800',
  resubmitted: 'bg-blue-100 text-blue-800',
  archived: 'bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-slate-100',
}

const RejectedPeopleGroups = () => {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const dateLocale = language === 'fr' ? fr : enUS

  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['rejectedPeopleGroups', searchTerm, statusFilter],
    queryFn: async () => {
      const params = { limit: 100 }
      if (searchTerm) params.search = searchTerm
      if (statusFilter) params.status = statusFilter
      const response = await peopleGroupsApi.getRejected(params)
      return response.data
    },
  })

  const archiveMutation = useMutation({
    mutationFn: (id) => peopleGroupsApi.archiveRejected(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['rejectedPeopleGroups'])
      toast.success(t('rejected.archiveSuccess'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('rejected.archiveError'))
    },
  })

  const handleArchive = (id) => {
    if (window.confirm(t('rejected.archiveConfirm'))) {
      archiveMutation.mutate(id)
    }
  }

  const rejectedItems = data?.data || []
  const total = data?.total || 0

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">
          <AlertTriangle size={48} className="mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">{t('rejected.loadError')}</h3>
        <p className="text-gray-500 dark:text-slate-400 mt-2">{error.response?.data?.message || t('rejected.loadErrorDesc')}</p>
        <button
          onClick={() => navigate('/activities')}
          className="btn-secondary mt-4"
        >
          <ArrowLeft size={18} className="inline mr-2" />
          {t('common.back')}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button aria-label={t('common.back')}
            onClick={() => navigate('/activities')}
            className="p-2 hover:bg-gray-100 dark:bg-slate-800 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800 dark:text-slate-100">{t('rejected.title')}</h1>
            <p className="text-gray-500 dark:text-slate-400 mt-1">
              {t('rejected.totalRejected').replace('{count}', total)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
          <XCircle size={16} className="text-red-500" />
          <span>{t('rejected.rejectedSubmissions')}</span>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={t('rejected.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="form-input pl-10 w-full"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="form-input w-full sm:w-48"
          >
            <option value="">{t('rejected.allStatuses')}</option>
            <option value="rejected">{t('rejected.statusRejected')}</option>
            <option value="resubmitted">{t('rejected.statusResubmitted')}</option>
            <option value="archived">{t('rejected.statusArchived')}</option>
          </select>
        </div>
      </div>

      {/* Rejected Items List */}
      {rejectedItems.length > 0 ? (
        <div className="space-y-4">
          {rejectedItems.map((item) => (
            <div
              key={item._id}
              className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden"
            >
              {/* Main Content */}
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                  {/* Main Info */}
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                      <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">{item.name}</h3>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[item.engagementStatus] || statusColors.unreached}`}>
                        {t(`peopleMap.status.${item.engagementStatus}`) || item.engagementStatus}
                      </span>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${resubmissionStatusColors[item.resubmissionStatus] || resubmissionStatusColors.rejected}`}>
                        {t(`rejected.status${item.resubmissionStatus?.charAt(0).toUpperCase() + item.resubmissionStatus?.slice(1)}`) || item.resubmissionStatus}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-sm text-gray-600 dark:text-slate-400">
                      {/* Village */}
                      <div className="flex items-center gap-2">
                        <MapPin size={16} className="text-gray-400" />
                        <span>
                          <span className="text-gray-400">{t('rejected.village')}:</span>{' '}
                          {item.villageName || t('rejected.notSpecified')}
                        </span>
                      </div>

                      {/* Date Added */}
                      <div className="flex items-center gap-2">
                        <Calendar size={16} className="text-gray-400" />
                        <span>
                          <span className="text-gray-400">{t('rejected.dateAdded')}:</span>{' '}
                          {item.originalCreatedAt
                            ? format(new Date(item.originalCreatedAt), 'dd MMM yyyy', { locale: dateLocale })
                            : t('rejected.notSpecified')}
                        </span>
                      </div>

                      {/* Date Rejected */}
                      <div className="flex items-center gap-2">
                        <XCircle size={16} className="text-red-400" />
                        <span>
                          <span className="text-gray-400">{t('rejected.dateRejected')}:</span>{' '}
                          {item.rejectedAt
                            ? format(new Date(item.rejectedAt), 'dd MMM yyyy, HH:mm', { locale: dateLocale })
                            : t('rejected.notSpecified')}
                        </span>
                      </div>

                      {/* Added By */}
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-gray-400" />
                        <span>
                          <span className="text-gray-400">{t('rejected.addedBy')}:</span>{' '}
                          {item.createdBy?.name || item.createdBy?.email || t('rejected.unknown')}
                        </span>
                      </div>

                      {/* Rejected By */}
                      <div className="flex items-center gap-2">
                        <User size={16} className="text-red-400" />
                        <span>
                          <span className="text-gray-400">{t('rejected.rejectedBy')}:</span>{' '}
                          {item.rejectedBy?.name || item.rejectedBy?.email || t('rejected.unknown')}
                        </span>
                      </div>

                      {/* Churches */}
                      {item.numberOfChurches > 0 && (
                        <div className="flex items-center gap-2">
                          <Users size={16} className="text-gray-400" />
                          <span>
                            <span className="text-gray-400">{t('rejected.churches')}:</span>{' '}
                            {item.numberOfChurches}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Rejection Reason - Prominently Displayed */}
                    <div className="mt-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
                      <div className="flex items-start gap-2">
                        <MessageSquare size={18} className="text-red-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <p className="font-medium text-red-800 mb-1">{t('rejected.rejectionReason')}:</p>
                          <p className="text-red-700 italic">"{item.rejectionReason}"</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 lg:min-w-[160px]">
                    <button
                      onClick={() => setExpandedId(expandedId === item._id ? null : item._id)}
                      className="btn-secondary flex items-center justify-center gap-2 text-sm"
                    >
                      <Eye size={16} />
                      {expandedId === item._id ? t('rejected.hideDetails') : t('rejected.viewDetails')}
                    </button>
                    
                    {item.resubmissionStatus === 'rejected' && (
                      <>
                        <button
                          onClick={() => {
                            // Navigate to create new people group with pre-filled data
                            // This would need to be implemented based on your form structure
                            toast.info(t('rejected.resubmitInfo'))
                          }}
                          className="btn-primary flex items-center justify-center gap-2 text-sm"
                        >
                          <RefreshCw size={16} />
                          {t('rejected.resubmit')}
                        </button>
                        <button
                          onClick={() => handleArchive(item._id)}
                          disabled={archiveMutation.isPending}
                          className="btn-secondary flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:bg-slate-800"
                        >
                          {archiveMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Archive size={16} />
                          )}
                          {t('rejected.archive')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Expanded Details */}
              {expandedId === item._id && (
                <div className="border-t bg-gray-50 dark:bg-slate-900 p-6 animate-fade-in">
                  <h4 className="font-medium text-gray-800 dark:text-slate-100 mb-3">{t('rejected.fullDetails')}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
                    {item.description && (
                      <div className="col-span-full">
                        <span className="text-gray-500 dark:text-slate-400">{t('rejected.description')}:</span>
                        <p className="mt-1 text-gray-700">{item.description}</p>
                      </div>
                    )}
                    {item.population > 0 && (
                      <div>
                        <span className="text-gray-500 dark:text-slate-400">{t('rejected.population')}:</span>
                        <p className="text-gray-700">{item.population.toLocaleString()}</p>
                      </div>
                    )}
                    {item.language && (
                      <div>
                        <span className="text-gray-500 dark:text-slate-400">{t('rejected.language')}:</span>
                        <p className="text-gray-700">{item.language}</p>
                      </div>
                    )}
                    {item.religion && (
                      <div>
                        <span className="text-gray-500 dark:text-slate-400">{t('rejected.religion')}:</span>
                        <p className="text-gray-700">{item.religion}</p>
                      </div>
                    )}
                    {item.churchGeneration > 0 && (
                      <div>
                        <span className="text-gray-500 dark:text-slate-400">{t('rejected.generations')}:</span>
                        <p className="text-gray-700">{item.churchGeneration}</p>
                      </div>
                    )}
                    {item.region && (
                      <div>
                        <span className="text-gray-500 dark:text-slate-400">{t('rejected.region')}:</span>
                        <p className="text-gray-700">{item.region}</p>
                      </div>
                    )}
                    {item.country && (
                      <div>
                        <span className="text-gray-500 dark:text-slate-400">{t('rejected.country')}:</span>
                        <p className="text-gray-700">{item.country}</p>
                      </div>
                    )}
                    {item.location?.coordinates && (
                      <div>
                        <span className="text-gray-500 dark:text-slate-400">{t('rejected.coordinates')}:</span>
                        <p className="text-gray-700">
                          {item.location.coordinates[1].toFixed(6)}, {item.location.coordinates[0].toFixed(6)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm p-12 text-center">
          <XCircle size={48} className="mx-auto text-gray-300 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-slate-100">{t('rejected.empty.title')}</h3>
          <p className="text-gray-500 dark:text-slate-400 mt-2">{t('rejected.empty.description')}</p>
          <button
            onClick={() => navigate('/activities')}
            className="btn-primary mt-4"
          >
            <ArrowLeft size={18} className="inline mr-2" />
            {t('rejected.backToActivities')}
          </button>
        </div>
      )}
    </div>
  )
}

export default RejectedPeopleGroups
