import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { peopleGroupsApi } from '../services/api'
import {
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  User,
  Calendar,
  AlertTriangle,
  ArrowLeft,
  Users,
  Eye,
  Loader2,
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

const PendingValidations = () => {
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const dateLocale = language === 'fr' ? fr : enUS

  const [rejectingId, setRejectingId] = useState(null)
  const [rejectReason, setRejectReason] = useState('')

  const { data, isLoading, error } = useQuery({
    queryKey: ['pendingValidations'],
    queryFn: async () => {
      const response = await peopleGroupsApi.getPending({ limit: 100 })
      return response.data
    },
  })

  const approveMutation = useMutation({
    mutationFn: (id) => peopleGroupsApi.approve(id),
    onSuccess: (res) => {
      // Backend returns 200 (with alreadyApproved:true) even if it was already
      // approved, so we always refresh the pending list to drop the item.
      queryClient.invalidateQueries(['pendingValidations'])
      queryClient.invalidateQueries(['dmm-review-count'])
      if (res?.data?.alreadyApproved) {
        toast.success(t('validation.approveSuccess'))
      } else {
        toast.success(t('validation.approveSuccess'))
      }
    },
    onError: (error) => {
      // Even on error, refresh so the list reflects the true server state
      // (prevents an item lingering after it was actually approved).
      queryClient.invalidateQueries(['pendingValidations'])
      toast.error(error.response?.data?.message || t('validation.approveError'))
    },
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }) => peopleGroupsApi.reject(id, reason),
    onSuccess: () => {
      queryClient.invalidateQueries(['pendingValidations'])
      setRejectingId(null)
      setRejectReason('')
      toast.success(t('validation.rejectSuccess'))
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || t('validation.rejectError'))
    },
  })

  const handleApprove = (id) => {
    approveMutation.mutate(id)
  }

  const handleReject = (id) => {
    if (!rejectReason.trim()) {
      toast.error(t('validation.rejectReasonRequired'))
      return
    }
    rejectMutation.mutate({ id, reason: rejectReason })
  }

  const pendingItems = data?.data || []
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
        <h3 className="text-lg font-medium text-gray-900">{t('validation.loadError')}</h3>
        <p className="text-gray-500 mt-2">{error.response?.data?.message || t('validation.loadErrorDesc')}</p>
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
          <button
            onClick={() => navigate('/activities')}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{t('validation.title')}</h1>
            <p className="text-gray-500 mt-1">
              {t('validation.totalPending').replace('{count}', total)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Clock size={16} />
          <span>{t('validation.awaitingReview')}</span>
        </div>
      </div>

      {/* Pending Items List */}
      {pendingItems.length > 0 ? (
        <div className="space-y-4">
          {pendingItems.map((item) => (
            <div
              key={item._id}
              className="bg-white rounded-xl shadow-sm p-6 border border-gray-100"
            >
              <div className="flex flex-col lg:flex-row lg:items-start gap-4">
                {/* Main Info */}
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <h3 className="text-lg font-semibold text-gray-800">{item.name}</h3>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[item.engagementStatus] || statusColors.unreached}`}>
                      {t(`peopleMap.status.${item.engagementStatus}`) || item.engagementStatus}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm text-gray-600">
                    {/* Village */}
                    <div className="flex items-center gap-2">
                      <MapPin size={16} className="text-gray-400" />
                      <span>
                        <span className="text-gray-400">{t('validation.village')}:</span>{' '}
                        {item.villageName || item.village?.name || t('validation.notSpecified')}
                      </span>
                    </div>

                    {/* Date Added */}
                    <div className="flex items-center gap-2">
                      <Calendar size={16} className="text-gray-400" />
                      <span>
                        <span className="text-gray-400">{t('validation.dateAdded')}:</span>{' '}
                        {item.createdAt
                          ? format(new Date(item.createdAt), 'dd MMM yyyy, HH:mm', { locale: dateLocale })
                          : t('validation.notSpecified')}
                      </span>
                    </div>

                    {/* Added By */}
                    <div className="flex items-center gap-2">
                      <User size={16} className="text-gray-400" />
                      <span>
                        <span className="text-gray-400">{t('validation.addedBy')}:</span>{' '}
                        {item.createdBy?.name || item.createdBy?.email || t('validation.unknown')}
                      </span>
                    </div>

                    {/* Churches */}
                    {item.numberOfChurches > 0 && (
                      <div className="flex items-center gap-2">
                        <Users size={16} className="text-gray-400" />
                        <span>
                          <span className="text-gray-400">{t('validation.churches')}:</span>{' '}
                          {item.numberOfChurches}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Description */}
                  {item.description && (
                    <p className="mt-3 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg line-clamp-2">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex flex-col gap-2 lg:min-w-[200px]">
                  {rejectingId === item._id ? (
                    <div className="space-y-2">
                      <textarea
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value)}
                        placeholder={t('validation.rejectReasonPlaceholder')}
                        className="form-input text-sm w-full"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleReject(item._id)}
                          disabled={rejectMutation.isPending}
                          className="btn-danger flex-1 text-sm py-1.5"
                        >
                          {rejectMutation.isPending ? (
                            <Loader2 size={16} className="animate-spin mx-auto" />
                          ) : (
                            t('common.confirm')
                          )}
                        </button>
                        <button
                          onClick={() => {
                            setRejectingId(null)
                            setRejectReason('')
                          }}
                          className="btn-secondary flex-1 text-sm py-1.5"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => navigate(`/people-groups/${item._id}`)}
                        className="btn-secondary flex items-center justify-center gap-2 text-sm"
                      >
                        <Eye size={16} />
                        {t('validation.viewDetails')}
                      </button>
                      <button
                        onClick={() => handleApprove(item._id)}
                        disabled={approveMutation.isPending}
                        className="btn-primary flex items-center justify-center gap-2 text-sm bg-green-600 hover:bg-green-700"
                      >
                        {approveMutation.isPending ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : (
                          <CheckCircle size={16} />
                        )}
                        {t('validation.approve')}
                      </button>
                      <button
                        onClick={() => setRejectingId(item._id)}
                        className="btn-secondary flex items-center justify-center gap-2 text-sm text-red-600 hover:bg-red-50"
                      >
                        <XCircle size={16} />
                        {t('validation.reject')}
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center">
          <CheckCircle size={48} className="mx-auto text-green-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900">{t('validation.empty.title')}</h3>
          <p className="text-gray-500 mt-2">{t('validation.empty.description')}</p>
          <button
            onClick={() => navigate('/activities')}
            className="btn-primary mt-4"
          >
            <ArrowLeft size={18} className="inline mr-2" />
            {t('validation.backToActivities')}
          </button>
        </div>
      )}
    </div>
  )
}

export default PendingValidations
