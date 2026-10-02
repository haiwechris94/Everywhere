/**
 * AdminUsers.jsx - Admin User Management Page
 * 
 * Features:
 * - List all users with search/filter
 * - Change user roles
 * - Block/unblock users
 * - Delete users
 * - Create new users
 * 
 * Admin-only access
 */
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useLanguage } from '../i18n'
import {
  Users,
  Search,
  Plus,
  Trash2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserX,
  UserCheck,
  Edit,
  X,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  RefreshCw
} from 'lucide-react'

// Role badge colors
const ROLE_COLORS = {
  admin: 'bg-red-100 text-red-800 border-red-200',
  supervisor: 'bg-orange-100 text-orange-800 border-orange-200',
  missionary: 'bg-blue-100 text-blue-800 border-blue-200',
  guest: 'bg-gray-100 text-gray-800 border-gray-200'
}

const ROLE_LABELS = {
  en: { admin: 'Admin', supervisor: 'Supervisor', missionary: 'Missionary', guest: 'Guest' },
  fr: { admin: 'Admin', supervisor: 'Superviseur', missionary: 'Missionnaire', guest: 'Invité' },
}

const RoleBadge = ({ role }) => {
  const { isFrench } = useLanguage()
  const labels = isFrench ? ROLE_LABELS.fr : ROLE_LABELS.en
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${ROLE_COLORS[role] || ROLE_COLORS.guest}`}>
      {labels[role] || role}
    </span>
  )
}

const StatusBadge = ({ isActive }) => {
  const { isFrench } = useLanguage()
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
      isActive 
        ? 'bg-green-100 text-green-800 border-green-200' 
        : 'bg-red-100 text-red-800 border-red-200'
    }`}>
      {isActive ? (isFrench ? 'Actif' : 'Active') : (isFrench ? 'Bloqué' : 'Blocked')}
    </span>
  )
}

// Confirmation Modal Component
const ConfirmModal = ({ isOpen, onClose, onConfirm, title, message, confirmText, isDestructive = false, isLoading = false }) => {
  const { isFrench } = useLanguage()
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="flex items-start gap-4">
            <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              isDestructive ? 'bg-red-100' : 'bg-yellow-100'
            }`}>
              <AlertTriangle className={isDestructive ? 'text-red-600' : 'text-yellow-600'} size={20} />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
              <p className="mt-2 text-sm text-gray-600">{message}</p>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50"
            >
              {isFrench ? 'Annuler' : 'Cancel'}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2 ${
                isDestructive 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-primary-600 hover:bg-primary-700'
              }`}
            >
              {isLoading && <Loader2 className="animate-spin" size={16} />}
              {confirmText}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Create User Modal Component
const CreateUserModal = ({ isOpen, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: 'missionary',
    organizationName: ''
  })
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { isFrench } = useLanguage()
  
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsLoading(true)
    
    try {
      const response = await api.post('/api/admin/users', formData)
      toast.success(isFrench ? 'Utilisateur créé avec succès' : 'User created successfully')
      onSuccess(response.data.user)
      onClose()
      setFormData({ name: '', email: '', password: '', role: 'missionary', organizationName: '' })
    } catch (err) {
      const message = err.response?.data?.message || (isFrench ? 'Erreur lors de la création' : 'Error while creating')
      setError(message)
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }
  
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="fixed inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-gray-900">{isFrench ? 'Créer un utilisateur' : 'Create a user'}</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>
          
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isFrench ? 'Nom *' : 'Name *'}</label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="Jean Dupont"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="jean@example.com"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isFrench ? 'Mot de passe *' : 'Password *'}</label>
              <input
                type="password"
                required
                minLength={6}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder="••••••••"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isFrench ? 'Rôle *' : 'Role *'}</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="guest">Invité (lecture seule)</option>
                <option value="missionary">Missionnaire (lecture/écriture)</option>
                <option value="supervisor">{isFrench ? 'Superviseur' : 'Supervisor'}</option>
                <option value="admin">{isFrench ? 'Administrateur' : 'Administrator'}</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isFrench ? 'Organisation' : 'Organization'}</label>
              <input
                type="text"
                value={formData.organizationName}
                onChange={(e) => setFormData({ ...formData, organizationName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                placeholder={isFrench ? "Nom de l'organisation (optionnel)" : 'Organization name (optional)'}
              />
            </div>
            
            <div className="flex justify-end gap-3 pt-4">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                {isFrench ? 'Annuler' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
              >
                {isLoading && <Loader2 className="animate-spin" size={16} />}
                Créer
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

const AdminUsers = () => {
  const { t, isFrench } = useLanguage()
  const { user: currentUser } = useAuth()
  
  // State
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  
  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [confirmModal, setConfirmModal] = useState({ isOpen: false, type: '', user: null })
  const [actionLoading, setActionLoading] = useState(false)
  
  // Check if current user is admin
  const isAdmin = currentUser?.role === 'admin'
  
  // Fetch users
  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return
    
    setLoading(true)
    setError(null)
    
    try {
      const params = { page, limit: 20 }
      if (search) params.search = search
      if (roleFilter) params.role = roleFilter
      if (statusFilter) params.isActive = statusFilter
      
      const response = await api.get('/api/admin/users', { params })
      setUsers(response.data.users)
      setTotalPages(response.data.totalPages)
      setTotal(response.data.total)
    } catch (err) {
      console.error('Error fetching users:', err)
      setError(err.response?.data?.message || (isFrench ? 'Erreur lors du chargement des utilisateurs' : 'Error while loading users'))
    } finally {
      setLoading(false)
    }
  }, [isAdmin, page, search, roleFilter, statusFilter])
  
  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])
  
  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      setPage(1)
    }, 300)
    return () => clearTimeout(timer)
  }, [search])
  
  // Handle role change
  const handleRoleChange = async (userId, newRole) => {
    try {
      await api.put(`/api/admin/users/${userId}/role`, { role: newRole })
      toast.success(t('adminUsers.updateSuccess') || 'Role updated successfully')
      fetchUsers()
    } catch (err) {
      toast.error(err.response?.data?.message || t('adminUsers.updateError') || 'Error updating role')
    }
  }
  
  // Handle toggle active
  const handleToggleActive = async () => {
    if (!confirmModal.user) return
    
    setActionLoading(true)
    try {
      await api.put(`/api/admin/users/${confirmModal.user._id}/toggle-active`)
      toast.success(confirmModal.user.isActive ? (t('adminUsers.userBlocked') || 'User blocked') : (t('adminUsers.userUnblocked') || 'User unblocked'))
      fetchUsers()
      setConfirmModal({ isOpen: false, type: '', user: null })
    } catch (err) {
      toast.error(err.response?.data?.message || (isFrench ? 'Erreur lors de la modification du statut' : 'Error while updating status'))
    } finally {
      setActionLoading(false)
    }
  }
  
  // Handle delete
  const handleDelete = async () => {
    if (!confirmModal.user) return
    
    setActionLoading(true)
    try {
      await api.delete(`/api/admin/users/${confirmModal.user._id}`)
      toast.success(t('adminUsers.deleteSuccess') || 'User deleted')
      fetchUsers()
      setConfirmModal({ isOpen: false, type: '', user: null })
    } catch (err) {
      toast.error(err.response?.data?.message || t('adminUsers.deleteError') || 'Error deleting user')
    } finally {
      setActionLoading(false)
    }
  }
  
  // Access denied for non-admins
  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <ShieldAlert className="mx-auto h-16 w-16 text-red-400 mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t('adminUsers.accessDenied') || 'Access Denied'}</h2>
          <p className="text-gray-600">
            {t('adminUsers.adminOnly') || 'This page is reserved for administrators.'}
          </p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Users className="text-primary-600" />
            {t('adminUsers.title') || 'User Management'}
          </h1>
          <p className="text-gray-600 mt-1">
            {total} {t('adminUsers.usersTotal') || 'users total'}
          </p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus size={18} />
          {t('adminUsers.newUser') || 'New User'}
        </button>
      </div>
      
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={t('adminUsers.searchPlaceholder') || 'Search by name or email...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
          
          {/* Role filter */}
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">{t('adminUsers.allRoles') || 'All roles'}</option>
            <option value="admin">Admin</option>
            <option value="supervisor">{isFrench ? 'Superviseur' : 'Supervisor'}</option>
            <option value="missionary">Missionnaire</option>
            <option value="guest">Invité</option>
          </select>
          
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1) }}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            <option value="">{t('adminUsers.allStatuses') || 'All statuses'}</option>
            <option value="true">{t('adminUsers.active') || 'Active'}</option>
            <option value="false">{t('adminUsers.blocked') || 'Blocked'}</option>
          </select>
          
          {/* Refresh */}
          <button
            onClick={fetchUsers}
            disabled={loading}
            className="p-2 text-gray-600 hover:text-primary-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={isFrench ? 'Actualiser' : 'Refresh'}
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
      
      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6 text-red-700">
          {error}
        </div>
      )}
      
      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-primary-600" size={32} />
        </div>
      )}
      
      {/* Users table */}
      {!loading && !error && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    {t('adminUsers.user') || 'User'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    {t('adminUsers.role') || 'Role'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    {t('adminUsers.status') || 'Status'}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    {t('rejected.dateAdded') || 'Created'}
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50">
                    <td className="px-4 py-4">
                      <div>
                        <div className="font-medium text-gray-900">{user.name}</div>
                        <div className="text-sm text-gray-500">{user.email}</div>
                        {user.organizationName && (
                          <div className="text-xs text-gray-400">{user.organizationName}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={user.role}
                        onChange={(e) => handleRoleChange(user._id, e.target.value)}
                        disabled={user._id === currentUser?._id}
                        className={`text-sm border rounded-lg px-2 py-1 focus:ring-2 focus:ring-primary-500 ${
                          user._id === currentUser?._id ? 'bg-gray-100 cursor-not-allowed' : ''
                        }`}
                      >
                        <option value="guest">Invité</option>
                        <option value="missionary">Missionnaire</option>
                        <option value="supervisor">{isFrench ? 'Superviseur' : 'Supervisor'}</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-4">
                      <StatusBadge isActive={user.isActive !== false} />
                    </td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString('fr-FR', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center justify-end gap-2">
                        {/* Toggle active button */}
                        <button
                          onClick={() => setConfirmModal({
                            isOpen: true,
                            type: 'toggle',
                            user
                          })}
                          disabled={user._id === currentUser?._id}
                          className={`p-2 rounded-lg transition-colors ${
                            user._id === currentUser?._id
                              ? 'text-gray-300 cursor-not-allowed'
                              : user.isActive !== false
                                ? 'text-yellow-600 hover:bg-yellow-50'
                                : 'text-green-600 hover:bg-green-50'
                          }`}
                          title={user.isActive !== false ? (isFrench ? 'Bloquer' : 'Block') : (isFrench ? 'Débloquer' : 'Unblock')}
                        >
                          {user.isActive !== false ? <UserX size={18} /> : <UserCheck size={18} />}
                        </button>
                        
                        {/* Delete button */}
                        <button
                          onClick={() => setConfirmModal({
                            isOpen: true,
                            type: 'delete',
                            user
                          })}
                          disabled={user._id === currentUser?._id}
                          className={`p-2 rounded-lg transition-colors ${
                            user._id === currentUser?._id
                              ? 'text-gray-300 cursor-not-allowed'
                              : 'text-red-600 hover:bg-red-50'
                          }`}
                          title={isFrench ? 'Supprimer' : 'Delete'}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                
                {users.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                      {isFrench ? 'Aucun utilisateur trouvé' : 'No user found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          
          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 bg-gray-50">
              <div className="text-sm text-gray-600">
                Page {page} sur {totalPages}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-2 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* Create User Modal */}
      <CreateUserModal
        isOpen={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        onSuccess={() => fetchUsers()}
      />
      
      {/* Confirm Modal for Toggle Active */}
      <ConfirmModal
        isOpen={confirmModal.isOpen && confirmModal.type === 'toggle'}
        onClose={() => setConfirmModal({ isOpen: false, type: '', user: null })}
        onConfirm={handleToggleActive}
        title={confirmModal.user?.isActive !== false ? (isFrench ? 'Bloquer cet utilisateur ?' : 'Block this user?') : (isFrench ? 'Débloquer cet utilisateur ?' : 'Unblock this user?')}
        message={
          confirmModal.user?.isActive !== false
            ? `${confirmModal.user?.name} ne pourra plus se connecter à l'application.`
            : `${confirmModal.user?.name} pourra à nouveau se connecter.`
        }
        confirmText={confirmModal.user?.isActive !== false ? (isFrench ? 'Bloquer' : 'Block') : (isFrench ? 'Débloquer' : 'Unblock')}
        isDestructive={confirmModal.user?.isActive !== false}
        isLoading={actionLoading}
      />
      
      {/* Confirm Modal for Delete */}
      <ConfirmModal
        isOpen={confirmModal.isOpen && confirmModal.type === 'delete'}
        onClose={() => setConfirmModal({ isOpen: false, type: '', user: null })}
        onConfirm={handleDelete}
        title={isFrench ? 'Supprimer cet utilisateur ?' : 'Delete this user?'}
        message={`Cette action est irréversible. Toutes les données associées à ${confirmModal.user?.name} seront perdues.`}
        confirmText={isFrench ? 'Supprimer' : 'Delete'}
        isDestructive={true}
        isLoading={actionLoading}
      />
    </div>
  )
}

export default AdminUsers
