import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { peopleGroupsApi, activitiesApi } from '../services/api'
import { useLanguage } from '../i18n'
import {
  ArrowLeft,
  Edit,
  Save,
  X,
  MapPin,
  Users,
  Church,
  Activity,
  Calendar,
  Trash2,
  Image,
  TrendingUp,
  Clock,
  CheckCircle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'
import { useAuth } from '../context/AuthContext'

// Status labels
const statusLabels = {
  pioneer: 'Pioneer',
  midway: 'Midway',
  'tipping-point': 'Tipping Point',
  dmm: 'DMM',
}

// Status colors - Updated to new color scheme
const statusColors = {
  pioneer: 'bg-yellow-500',
  midway: 'bg-blue-500',
  'tipping-point': 'bg-orange-500',
  dmm: 'bg-green-500',
}

const statusBgColors = {
  pioneer: 'bg-yellow-100 text-yellow-800',
  midway: 'bg-blue-100 text-blue-800',
  'tipping-point': 'bg-orange-100 text-orange-800',
  dmm: 'bg-green-100 text-green-800',
}

// Engagement level options
const engagementLevelOptions = ['I', 'II', 'III', 'IV']

const PeopleGroupDetail = () => {
  const { t } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [selectedPhoto, setSelectedPhoto] = useState(null)

  // Fetch people group details
  const { data: peopleGroup, isLoading, error } = useQuery({
    queryKey: ['peopleGroup', id],
    queryFn: async () => {
      const response = await peopleGroupsApi.getById(id)
      return response.data
    },
  })

  // Fetch activities for this people group
  const { data: activitiesData } = useQuery({
    queryKey: ['peopleGroupActivities', id],
    queryFn: async () => {
      const response = await activitiesApi.getAll({ peopleGroup: id, limit: 10 })
      return response.data.activities || response.data.data || []
    },
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data) => peopleGroupsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['peopleGroup', id])
      queryClient.invalidateQueries(['peopleGroups'])
      toast.success('People group updated!')
      setIsEditing(false)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Error updating')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => peopleGroupsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['peopleGroups'])
      toast.success('People group deleted!')
      navigate('/map')
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Error deleting')
    },
  })

  // Approve mutation - only for admin or supervisor users
  const approveMutation = useMutation({
    mutationFn: () => peopleGroupsApi.approve(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['peopleGroup', id])
      queryClient.invalidateQueries(['peopleGroups'])
      toast.success('People group approved successfully!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Error approving people group')
    },
  })

  // Check if current user can approve (admin or supervisor role)
  const canApprove = user && (user.role === 'admin' || user.role === 'supervisor') && !peopleGroup?.approved

  const handleEdit = () => {
    setEditData({
      name: peopleGroup.name || '',
      description: peopleGroup.description || '',
      engagementStatus: peopleGroup.engagementStatus || 'pioneer',
      engagementLevel: peopleGroup.engagementLevel || '',
      population: peopleGroup.population || '',
      numberOfChurches: peopleGroup.numberOfChurches || 0,
      churchGeneration: peopleGroup.churchGeneration || 0,
      dbs: peopleGroup.dbs || 0,
      com: peopleGroup.com || 0,
      cat: peopleGroup.cat || 0,
      reportPeriod: peopleGroup.reportPeriod || '',
      villageName: peopleGroup.villageName || '',
      region: peopleGroup.region || '',
      country: peopleGroup.country || '',
      language: peopleGroup.language || '',
      religion: peopleGroup.religion || '',
      donor: peopleGroup.donor || '',
      nationalCoordinator: peopleGroup.nationalCoordinator || '',
      churchPlanter: peopleGroup.churchPlanter || '',
      affinityGroup: peopleGroup.affinityGroup || '',
      urbanRural: peopleGroup.urbanRural || '',
      startYear: peopleGroup.startYear || '',
      latitude: peopleGroup.location?.coordinates[1] || '',
      longitude: peopleGroup.location?.coordinates[0] || '',
    })
    setIsEditing(true)
  }

  const handleSave = () => {
    const updateData = {
      ...editData,
      population: parseInt(editData.population) || 0,
      numberOfChurches: parseInt(editData.numberOfChurches) || 0,
      churchGeneration: parseInt(editData.churchGeneration) || 0,
      dbs: parseInt(editData.dbs) || 0,
      com: parseInt(editData.com) || 0,
      cat: parseInt(editData.cat) || 0,
      reportPeriod: editData.reportPeriod || '',
      startYear: editData.startYear ? parseInt(editData.startYear) : undefined,
    }
    if (editData.latitude && editData.longitude) {
      updateData.location = {
        type: 'Point',
        coordinates: [parseFloat(editData.longitude), parseFloat(editData.latitude)],
      }
    }
    delete updateData.latitude
    delete updateData.longitude
    updateMutation.mutate(updateData)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditData(null)
  }

  const canEdit = user && (user.role === 'admin' || user.role === 'supervisor' || 
    (peopleGroup?.createdBy?._id === user._id))

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !peopleGroup) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">
          <X size={48} className="mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">{t('peopleMap.loadError') || 'People group not found'}</h3>
        <p className="text-gray-500 mt-2">{t('peopleMap.loadErrorDesc') || "This people group doesn't exist or has been deleted"}</p>
        <Link to="/map" className="btn-primary mt-4 inline-block">
          {t('common.back')}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/map')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-800">
              {isEditing ? (
                <input
                  type="text"
                  value={editData.name}
                  onChange={(e) => setEditData((prev) => ({ ...prev, name: e.target.value }))}
                  className="form-input text-2xl font-bold"
                />
              ) : (
                peopleGroup.name
              )}
            </h1>
            {peopleGroup.villageName && !isEditing && (
              <p className="text-gray-500">{peopleGroup.villageName}</p>
            )}
          </div>
        </div>
        {canEdit && (
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button onClick={handleCancel} className="btn-secondary flex items-center gap-2">
                  <X size={18} />
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  <Save size={18} />
                  {updateMutation.isPending ? t('common.loading') : t('common.save')}
                </button>
              </>
            ) : (
              <>
                <button onClick={handleEdit} className="btn-secondary flex items-center gap-2">
                  <Edit size={18} />
                  {t('common.edit')}
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-2"
                >
                  <Trash2 size={18} />
                  {t('common.delete')}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{t('peopleMap.peopleName') || 'General Information'}</h3>
            
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">{t('peopleMap.engagementStatus')}</label>
                    <select
                      value={editData.engagementStatus}
                      onChange={(e) => setEditData((prev) => ({ ...prev, engagementStatus: e.target.value }))}
                      className="form-input"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">{t('peopleMap.engagementLevel')}</label>
                    <select
                      value={editData.engagementLevel}
                      onChange={(e) => setEditData((prev) => ({ ...prev, engagementLevel: e.target.value }))}
                      className="form-input"
                    >
                      <option value="">Select level</option>
                      {engagementLevelOptions.map((level) => (
                        <option key={level} value={level}>{level}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">{t('peopleMap.population')}</label>
                    <input
                      type="number"
                      value={editData.population}
                      onChange={(e) => setEditData((prev) => ({ ...prev, population: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">{t('peopleMap.numberOfChurches')}</label>
                    <input
                      type="number"
                      value={editData.numberOfChurches}
                      onChange={(e) => setEditData((prev) => ({ ...prev, numberOfChurches: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">{t('peopleMap.churchGeneration')}</label>
                    <input
                      type="number"
                      value={editData.churchGeneration}
                      onChange={(e) => setEditData((prev) => ({ ...prev, churchGeneration: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">{t('peopleMap.village')}</label>
                    <input
                      type="text"
                      value={editData.villageName}
                      onChange={(e) => setEditData((prev) => ({ ...prev, villageName: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="form-label">DBS</label>
                    <input
                      type="number"
                      min="0"
                      value={editData.dbs}
                      onChange={(e) => setEditData((prev) => ({ ...prev, dbs: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">COM</label>
                    <input
                      type="number"
                      min="0"
                      value={editData.com}
                      onChange={(e) => setEditData((prev) => ({ ...prev, com: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">CAT</label>
                    <input
                      type="number"
                      min="0"
                      value={editData.cat}
                      onChange={(e) => setEditData((prev) => ({ ...prev, cat: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Trimestre (reportPeriod)</label>
                    <input
                      type="text"
                      placeholder="ex. 2Q26"
                      value={editData.reportPeriod}
                      onChange={(e) => setEditData((prev) => ({ ...prev, reportPeriod: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">{t('peopleMap.region')}</label>
                    <input
                      type="text"
                      value={editData.region}
                      onChange={(e) => setEditData((prev) => ({ ...prev, region: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">{t('peopleMap.country')}</label>
                    <input
                      type="text"
                      value={editData.country}
                      onChange={(e) => setEditData((prev) => ({ ...prev, country: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={editData.latitude}
                      onChange={(e) => setEditData((prev) => ({ ...prev, latitude: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={editData.longitude}
                      onChange={(e) => setEditData((prev) => ({ ...prev, longitude: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Affinity Group</label>
                    <input
                      type="text"
                      value={editData.affinityGroup}
                      onChange={(e) => setEditData((prev) => ({ ...prev, affinityGroup: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Urban / Rural</label>
                    <input
                      type="text"
                      value={editData.urbanRural}
                      onChange={(e) => setEditData((prev) => ({ ...prev, urbanRural: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Start Year</label>
                    <input
                      type="number"
                      value={editData.startYear}
                      onChange={(e) => setEditData((prev) => ({ ...prev, startYear: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Donor</label>
                    <input
                      type="text"
                      value={editData.donor}
                      onChange={(e) => setEditData((prev) => ({ ...prev, donor: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">National Coordinator</label>
                    <input
                      type="text"
                      value={editData.nationalCoordinator}
                      onChange={(e) => setEditData((prev) => ({ ...prev, nationalCoordinator: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">Church Planter</label>
                    <input
                      type="text"
                      value={editData.churchPlanter}
                      onChange={(e) => setEditData((prev) => ({ ...prev, churchPlanter: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                </div>
                <div>
                  <label className="form-label">{t('common.description')}</label>
                  <textarea
                    value={editData.description}
                    onChange={(e) => setEditData((prev) => ({ ...prev, description: e.target.value }))}
                    className="form-input"
                    rows={4}
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <TrendingUp size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">{t('peopleMap.engagementStatus')}</p>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusBgColors[peopleGroup.engagementStatus]}`}>
                        <span className={`w-2 h-2 rounded-full ${statusColors[peopleGroup.engagementStatus]}`}></span>
                        {statusLabels[peopleGroup.engagementStatus]}
                        {peopleGroup.engagementLevel && ` - Level ${peopleGroup.engagementLevel}`}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Users size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">{t('peopleMap.population')}</p>
                      <p className="text-lg font-semibold">{peopleGroup.population?.toLocaleString() || 'N/A'}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Church size={24} className="text-green-600" />
                    <div>
                      <p className="text-sm text-gray-500">{t('peopleMap.numberOfChurches')}</p>
                      <p className="text-lg font-semibold">{peopleGroup.numberOfChurches || 0}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <TrendingUp size={24} className="text-blue-600" />
                    <div>
                      <p className="text-sm text-gray-500">{t('peopleMap.churchGeneration')}</p>
                      <p className="text-lg font-semibold">{peopleGroup.churchGeneration || 0}</p>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Activity size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">DBS</p>
                      <p className="text-lg font-semibold">{peopleGroup.dbs || 0}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Users size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">COM</p>
                      <p className="text-lg font-semibold">{peopleGroup.com || 0}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Church size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">CAT</p>
                      <p className="text-lg font-semibold">{peopleGroup.cat || 0}</p>
                    </div>
                  </div>
                </div>
                {peopleGroup.location && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <MapPin size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">{t('rejected.coordinates')}</p>
                      <p className="font-medium">
                        {peopleGroup.location.coordinates[1].toFixed(6)}, {peopleGroup.location.coordinates[0].toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}
                {peopleGroup.description && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-2">{t('common.description')}</p>
                    <p className="text-gray-700">{peopleGroup.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Photos */}
          {peopleGroup.photos && peopleGroup.photos.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Image size={20} />
                Photos ({peopleGroup.photos.length})
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {peopleGroup.photos.map((photo, index) => (
                  <div
                    key={photo._id || index}
                    className="relative aspect-square rounded-lg overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setSelectedPhoto(photo)}
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || `Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {photo.caption && (
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-2 truncate">
                        {photo.caption}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress History */}
          {peopleGroup.progressHistory && peopleGroup.progressHistory.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Clock size={20} />
                Progress History
              </h3>
              <div className="space-y-3">
                {peopleGroup.progressHistory.slice().reverse().slice(0, 5).map((entry, index) => (
                  <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <TrendingUp size={16} className="text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusBgColors[entry.status] || 'bg-gray-100 text-gray-800'}`}>
                          {statusLabels[entry.status] || entry.status}
                        </span>
                        {entry.percentage !== undefined && (
                          <span className="text-sm text-gray-500">{entry.percentage}%</span>
                        )}
                      </div>
                      {entry.notes && (
                        <p className="text-sm text-gray-600 mt-1">{entry.notes}</p>
                      )}
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Calendar size={12} />
                        {format(new Date(entry.date), 'dd MMMM yyyy', { locale: fr })}
                        {entry.updatedBy?.name && ` • ${entry.updatedBy.name}`}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Activities */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">Activities</h3>
              <Link to={`/activities?peopleGroup=${id}`} className="text-primary-600 text-sm hover:underline">
                View all
              </Link>
            </div>
            {activitiesData && activitiesData.length > 0 ? (
              <div className="space-y-3">
                {activitiesData.map((activity) => (
                  <div key={activity._id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                    <div className="p-2 bg-primary-100 rounded-lg">
                      <Activity size={16} className="text-primary-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-800">{activity.type}</p>
                      <p className="text-sm text-gray-500">{activity.description}</p>
                      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                        <Calendar size={12} />
                        {format(new Date(activity.date), 'dd MMMM yyyy', { locale: fr })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Activity size={32} className="mx-auto mb-2 opacity-50" />
                <p>No activities recorded</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Details</h3>
            <div className="space-y-3">
              {peopleGroup.villageName && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Village</span>
                  <span className="font-semibold">{peopleGroup.villageName}</span>
                </div>
              )}
              {peopleGroup.region && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Region</span>
                  <span className="font-semibold">{peopleGroup.region}</span>
                </div>
              )}
              {peopleGroup.country && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Country</span>
                  <span className="font-semibold">{peopleGroup.country}</span>
                </div>
              )}
              {peopleGroup.language && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Language</span>
                  <span className="font-semibold">{peopleGroup.language}</span>
                </div>
              )}
              {peopleGroup.religion && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Religion</span>
                  <span className="font-semibold">{peopleGroup.religion}</span>
                </div>
              )}
              {peopleGroup.affinityGroup && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Affinity Group</span>
                  <span className="font-semibold text-right">{peopleGroup.affinityGroup}</span>
                </div>
              )}
              {peopleGroup.urbanRural && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Urban / Rural</span>
                  <span className="font-semibold text-right">{peopleGroup.urbanRural}</span>
                </div>
              )}
              {peopleGroup.startYear && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Start Year</span>
                  <span className="font-semibold">{peopleGroup.startYear}</span>
                </div>
              )}
              {peopleGroup.donor && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Donor</span>
                  <span className="font-semibold text-right">{peopleGroup.donor}</span>
                </div>
              )}
              {peopleGroup.nationalCoordinator && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">National Coordinator</span>
                  <span className="font-semibold text-right">{peopleGroup.nationalCoordinator}</span>
                </div>
              )}
              {peopleGroup.churchPlanter && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Church Planter</span>
                  <span className="font-semibold text-right">
                    <Link to={`/planters/${encodeURIComponent(peopleGroup.churchPlanter)}/engagements`} className="text-blue-600 hover:underline">
                      {peopleGroup.churchPlanter}
                    </Link>
                  </span>
                </div>
              )}
              {peopleGroup.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Created</span>
                  <span className="font-semibold text-sm">
                    {format(new Date(peopleGroup.createdAt), 'dd/MM/yyyy')}
                  </span>
                </div>
              )}
              {peopleGroup.createdBy?.name && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Created by</span>
                  <span className="font-semibold text-sm">{peopleGroup.createdBy.name}</span>
                </div>
              )}
            </div>
          </div>

          {/* Approval Status */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">Approved</span>
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  peopleGroup.approved ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {peopleGroup.approved ? 'Yes' : 'Pending'}
                </span>
              </div>
              {peopleGroup.approvedBy?.name && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Approved by</span>
                  <span className="font-semibold text-sm">{peopleGroup.approvedBy.name}</span>
                </div>
              )}
              {peopleGroup.approvedAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">Approved on</span>
                  <span className="font-semibold text-sm">
                    {format(new Date(peopleGroup.approvedAt), 'dd/MM/yyyy')}
                  </span>
                </div>
              )}
              
              {/* Approve Button - Only visible for admin or supervisor when status is Pending */}
              {canApprove && (
                <div className="pt-3 border-t mt-3">
                  <button
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                    className="w-full btn-primary flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700"
                  >
                    <CheckCircle size={18} />
                    {approveMutation.isPending ? 'Approving...' : 'Approve People Group'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Delete Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Delete People Group</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>{peopleGroup.name}</strong>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Photo Modal */}
      {selectedPhoto && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <div className="max-w-4xl max-h-[90vh] relative">
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute -top-10 right-0 text-white hover:text-gray-300"
            >
              <X size={24} />
            </button>
            <img
              src={selectedPhoto.url}
              alt={selectedPhoto.caption || 'Photo'}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
            {selectedPhoto.caption && (
              <p className="text-white text-center mt-4">{selectedPhoto.caption}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default PeopleGroupDetail
