import { useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { villagesApi, churchesApi, activitiesApi } from '../services/api'
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
  Home,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

// New DMM status labels
const statusLabels = {
  pioneer: 'Pioneer',
  midway: 'Midway',
  'tipping-point': 'Tipping point',
  dmm: 'DMM',
}

// Legacy status labels (for backward compatibility)
const legacyStatusLabels = {
  unreached: 'Non atteint',
  'in-progress': 'En cours',
  'church-planted': 'Église plantée',
  multiplying: 'Multiplication',
}

const statusColors = {
  pioneer: 'bg-yellow-500',
  midway: 'bg-blue-500',
  'tipping-point': 'bg-orange-500',
  dmm: 'bg-green-500',
  unreached: 'bg-gray-500',
  'in-progress': 'bg-yellow-500',
  'church-planted': 'bg-green-500',
  multiplying: 'bg-blue-500',
}

const statusBgColors = {
  pioneer: 'bg-yellow-100 text-yellow-800',
  midway: 'bg-blue-100 text-blue-800',
  'tipping-point': 'bg-orange-100 text-orange-800',
  dmm: 'bg-green-100 text-green-800',
  unreached: 'bg-gray-100 text-gray-800',
  'in-progress': 'bg-yellow-100 text-yellow-800',
  'church-planted': 'bg-green-100 text-green-800',
  multiplying: 'bg-blue-100 text-blue-800',
}

// Niveau options (replaces Pays)
const niveauOptions = ['I', 'II', 'III', 'IV']

const VillageDetail = () => {
  const { t, isFrench } = useLanguage()
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState(null)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  const { data: village, isLoading, error } = useQuery({
    queryKey: ['village', id],
    queryFn: async () => {
      const response = await villagesApi.getById(id)
      return response.data.village || response.data
    },
  })

  const { data: churches } = useQuery({
    queryKey: ['churches', { village: id }],
    queryFn: async () => {
      const response = await churchesApi.getAll({ village: id })
      return response.data.churches || []
    },
    enabled: !!id,
  })

  const { data: activities } = useQuery({
    queryKey: ['activities', { village: id }],
    queryFn: async () => {
      const response = await activitiesApi.getAll({ village: id, limit: 5 })
      return response.data.activities || []
    },
    enabled: !!id,
  })

  const updateMutation = useMutation({
    mutationFn: (data) => villagesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['village', id])
      queryClient.invalidateQueries(['villages'])
      toast.success('Village mis à jour!')
      setIsEditing(false)
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Erreur lors de la mise à jour')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => villagesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['villages'])
      toast.success('Village supprimé!')
      navigate('/villages')
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Erreur lors de la suppression')
    },
  })

  const handleEdit = () => {
    setEditData({
      name: village.name || '',
      population: village.population || '',
      status: village.status || 'unreached',
      region: village.region || '',
      country: village.country || '',
      description: village.description || '',
      latitude: village.location?.coordinates[1] || '',
      longitude: village.location?.coordinates[0] || '',
    })
    setIsEditing(true)
  }

  const handleSave = () => {
    const updateData = {
      ...editData,
      population: parseInt(editData.population) || 0,
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (error || !village) {
    return (
      <div className="text-center py-12">
        <div className="text-red-500 mb-4">
          <X size={48} className="mx-auto" />
        </div>
        <h3 className="text-lg font-medium text-gray-900">{isFrench ? 'Village non trouvé' : 'Village not found'}</h3>
        <p className="text-gray-500 mt-2">{isFrench ? "Ce village n'existe pas ou a été supprimé" : 'This village does not exist or has been deleted'}</p>
        <Link to="/villages" className="btn-primary mt-4 inline-block">
          Retour aux villages
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
            onClick={() => navigate('/villages')}
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
                village.name
              )}
            </h1>
            {village.region && !isEditing && (
              <p className="text-gray-500">{village.region}, {village.country}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing ? (
            <>
              <button onClick={handleCancel} className="btn-secondary flex items-center gap-2">
                <X size={18} />
                {isFrench ? 'Annuler' : 'Cancel'}
              </button>
              <button
                onClick={handleSave}
                disabled={updateMutation.isPending}
                className="btn-primary flex items-center gap-2"
              >
                <Save size={18} />
                {updateMutation.isPending ? (isFrench ? 'Enregistrement...' : 'Saving...') : (isFrench ? 'Enregistrer' : 'Save')}
              </button>
            </>
          ) : (
            <>
              <button onClick={handleEdit} className="btn-secondary flex items-center gap-2">
                <Edit size={18} />
                {isFrench ? 'Modifier' : 'Edit'}
              </button>
              <button
                onClick={() => setShowDeleteModal(true)}
                className="btn-secondary text-red-600 hover:bg-red-50 flex items-center gap-2"
              >
                <Trash2 size={18} />
                Supprimer
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Info */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{isFrench ? 'Informations générales' : 'General information'}</h3>
            
            {isEditing ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">Population</label>
                    <input
                      type="number"
                      value={editData.population}
                      onChange={(e) => setEditData((prev) => ({ ...prev, population: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">{isFrench ? 'Statut' : 'Status'}</label>
                    <select
                      value={editData.status}
                      onChange={(e) => setEditData((prev) => ({ ...prev, status: e.target.value }))}
                      className="form-input"
                    >
                      {Object.entries(statusLabels).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label">{isFrench ? 'Région' : 'Region'}</label>
                    <input
                      type="text"
                      value={editData.region}
                      onChange={(e) => setEditData((prev) => ({ ...prev, region: e.target.value }))}
                      className="form-input"
                    />
                  </div>
                  <div>
                    <label className="form-label">{isFrench ? 'Pays' : 'Country'}</label>
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
                <div>
                  <label className="form-label">Description</label>
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
                    <Users size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">Population</p>
                      <p className="text-lg font-semibold">{village.population?.toLocaleString() || 'N/A'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <Home size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">{isFrench ? 'Statut' : 'Status'}</p>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${statusBgColors[village.status]}`}>
                        <span className={`w-2 h-2 rounded-full ${statusColors[village.status]}`}></span>
                        {statusLabels[village.status]}
                      </span>
                    </div>
                  </div>
                </div>
                {village.location && (
                  <div className="flex items-center gap-3 p-4 bg-gray-50 rounded-lg">
                    <MapPin size={24} className="text-primary-600" />
                    <div>
                      <p className="text-sm text-gray-500">{isFrench ? 'Coordonnées' : 'Coordinates'}</p>
                      <p className="font-medium">
                        {village.location.coordinates[1].toFixed(6)}, {village.location.coordinates[0].toFixed(6)}
                      </p>
                    </div>
                  </div>
                )}
                {village.description && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <p className="text-sm text-gray-500 mb-2">Description</p>
                    <p className="text-gray-700">{village.description}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Activities */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{isFrench ? 'Activités récentes' : 'Recent activities'}</h3>
              <Link to={`/activities?village=${id}`} className="text-primary-600 text-sm hover:underline">
                Voir tout
              </Link>
            </div>
            {activities && activities.length > 0 ? (
              <div className="space-y-3">
                {activities.map((activity) => (
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
                <p>{isFrench ? 'Aucune activité enregistrée' : 'No activity recorded'}</p>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Churches */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{isFrench ? 'Églises' : 'Churches'}</h3>
              <span className="bg-primary-100 text-primary-600 px-2 py-1 rounded-full text-sm font-medium">
                {churches?.length || 0}
              </span>
            </div>
            {churches && churches.length > 0 ? (
              <div className="space-y-3">
                {churches.map((church) => (
                  <Link
                    key={church._id}
                    to={`/churches/${church._id}`}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Church size={20} className="text-green-600" />
                    <div>
                      <p className="font-medium text-gray-800">{church.name}</p>
                      {church.pastor && (
                        <p className="text-sm text-gray-500">Pasteur: {church.pastor}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500">
                <Church size={32} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">{isFrench ? 'Aucune église' : 'No church'}</p>
              </div>
            )}
          </div>

          {/* Quick Stats */}
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">{isFrench ? 'Statistiques' : 'Statistics'}</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{isFrench ? 'Églises' : 'Churches'}</span>
                <span className="font-semibold">{churches?.length || 0}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-500">{isFrench ? 'Activités' : 'Activities'}</span>
                <span className="font-semibold">{activities?.length || 0}</span>
              </div>
              {village.createdAt && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-500">{isFrench ? 'Créé le' : 'Created on'}</span>
                  <span className="font-semibold text-sm">
                    {format(new Date(village.createdAt), 'dd/MM/yyyy')}
                  </span>
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
            <h3 className="text-xl font-bold text-gray-800 mb-4">{isFrench ? 'Supprimer le village' : 'Delete village'}</h3>
            <p className="text-gray-600 mb-6">
              {isFrench ? 'Êtes-vous sûr de vouloir supprimer' : 'Are you sure you want to delete'} <strong>{village.name}</strong>{isFrench ? ' ? Cette action est irréversible.' : '? This action cannot be undone.'}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 btn-secondary"
              >
                {isFrench ? 'Annuler' : 'Cancel'}
              </button>
              <button
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 transition-colors"
              >
                {deleteMutation.isPending ? (isFrench ? 'Suppression...' : 'Deleting...') : (isFrench ? 'Supprimer' : 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default VillageDetail
