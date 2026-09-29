import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import {
  User,
  Mail,
  Building,
  Shield,
  Edit,
  Save,
  X,
  Lock,
  Eye,
  EyeOff,
  Moon,
  Sun,
  Calendar,
  Clock,
  Settings,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'

const Profile = () => {
  const { t, isFrench } = useLanguage()
  const { user, updateProfile } = useAuth()
  const [isEditing, setIsEditing] = useState(false)
  const [showPasswordSection, setShowPasswordSection] = useState(false)
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [editData, setEditData] = useState({
    name: '',
    email: '',
    organization: '',
  })
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [isUpdating, setIsUpdating] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  
  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark'
  })

  // Apply dark mode on mount and when changed
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [isDarkMode])

  const toggleDarkMode = () => {
    const newMode = !isDarkMode
    setIsDarkMode(newMode)
    localStorage.setItem('theme', newMode ? 'dark' : 'light')
    if (newMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
    toast.success(newMode ? (t('profile.darkModeEnabled') || 'Dark mode enabled') : (t('profile.lightModeEnabled') || 'Light mode enabled'))
  }

  const handleEdit = () => {
    setEditData({
      name: user?.name || '',
      email: user?.email || '',
      organization: user?.organization || '',
    })
    setIsEditing(true)
  }

  const handleCancel = () => {
    setIsEditing(false)
    setEditData({
      name: '',
      email: '',
      organization: '',
    })
  }

  const handleSave = async () => {
    setIsUpdating(true)
    try {
      const result = await updateProfile(editData)
      if (result.success) {
        setIsEditing(false)
      }
    } finally {
      setIsUpdating(false)
    }
  }

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error(t('profile.passwordMismatch'))
      return
    }

    if (passwordData.newPassword.length < 6) {
      toast.error(t('profile.passwordTooShort'))
      return
    }

    setIsChangingPassword(true)
    try {
      await api.put('/api/auth/password', {
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword,
      })
      toast.success(t('profile.passwordChangeSuccess'))
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
      })
      setShowPasswordSection(false)
    } catch (error) {
      toast.error(error.response?.data?.message || t('profile.passwordChangeError'))
    } finally {
      setIsChangingPassword(false)
    }
  }

  const roleLabels = {
    admin: t('profile.roles.admin'),
    supervisor: t('profile.roles.supervisor'),
    missionary: t('profile.roles.missionary'),
    coordinator: t('profile.roles.coordinator'),
    viewer: t('profile.roles.viewer'),
  }

  const roleColors = {
    admin: 'bg-red-100 text-red-700 border-red-200',
    supervisor: 'bg-purple-100 text-purple-700 border-purple-200',
    missionary: 'bg-blue-100 text-blue-700 border-blue-200',
    coordinator: 'bg-green-100 text-green-700 border-green-200',
    viewer: 'bg-gray-100 text-gray-700 border-gray-200',
  }

  // Get user initials for avatar
  const getInitials = (name) => {
    if (!name) return 'U'
    const parts = name.split(' ')
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  // Generate avatar color based on name
  const getAvatarColor = (name) => {
    if (!name) return 'from-gray-400 to-gray-500'
    const colors = [
      'from-indigo-500 to-purple-600',
      'from-blue-500 to-cyan-600',
      'from-emerald-500 to-teal-600',
      'from-orange-500 to-red-600',
      'from-pink-500 to-rose-600',
      'from-violet-500 to-purple-600',
    ]
    const index = name.charCodeAt(0) % colors.length
    return colors[index]
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      {/* Profile Header Card */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden">
        {/* Gradient Banner */}
        <div className="h-32 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 relative">
          <div className="absolute inset-0 bg-black/10"></div>
          {/* Edit Button */}
          {!isEditing && (
            <button 
              onClick={handleEdit} 
              className="absolute top-4 right-4 flex items-center gap-2 px-4 py-2 bg-white/20 backdrop-blur-sm text-white rounded-xl hover:bg-white/30 transition-all"
            >
              <Edit size={16} />
              <span className="text-sm font-medium">{t('common.edit')}</span>
            </button>
          )}
        </div>
        
        {/* Profile Info */}
        <div className="px-6 pb-6">
          {/* Avatar */}
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 -mt-16 relative z-10">
            <div className={`w-28 h-28 rounded-2xl bg-gradient-to-br ${getAvatarColor(user.name)} flex items-center justify-center text-white text-3xl font-bold shadow-xl border-4 border-white dark:border-gray-800`}>
              {getInitials(user.name)}
            </div>
            <div className="flex-1 pb-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{user.name}</h1>
              <p className="text-gray-500 dark:text-gray-400">{user.email}</p>
            </div>
            <div className="pb-2">
              <span className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold border ${roleColors[user.role] || roleColors.viewer}`}>
                <Shield size={16} />
                {roleLabels[user.role] || user.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Informations personnelles */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/50 rounded-xl">
              <User size={20} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            {t('profile.personalInfo')}
          </h2>
        </div>
        
        <div className="p-6">
          {isEditing ? (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('profile.fullName')}</label>
                <div className="relative">
                  <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={editData.name}
                    onChange={(e) => setEditData((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('profile.email')}</label>
                <div className="relative">
                  <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="email"
                    value={editData.email}
                    onChange={(e) => setEditData((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('profile.organization')}</label>
                <div className="relative">
                  <Building size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={editData.organization}
                    onChange={(e) => setEditData((prev) => ({ ...prev, organization: e.target.value }))}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button 
                  onClick={handleCancel} 
                  className="flex-1 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <X size={18} />
                  {t('common.cancel')}
                </button>
                <button
                  onClick={handleSave}
                  disabled={isUpdating}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all font-medium flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Save size={18} />
                  {isUpdating ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group">
                <div className="p-3 bg-white dark:bg-gray-600 rounded-xl shadow-sm group-hover:shadow transition-shadow">
                  <User size={22} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.fullName')}</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{user.name}</p>
                </div>
                <ChevronRight size={18} className="text-gray-300 dark:text-gray-600" />
              </div>

              <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group">
                <div className="p-3 bg-white dark:bg-gray-600 rounded-xl shadow-sm group-hover:shadow transition-shadow">
                  <Mail size={22} className="text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.email')}</p>
                  <p className="font-semibold text-gray-900 dark:text-white">{user.email}</p>
                </div>
                <ChevronRight size={18} className="text-gray-300 dark:text-gray-600" />
              </div>

              {user.organization && (
                <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group">
                  <div className="p-3 bg-white dark:bg-gray-600 rounded-xl shadow-sm group-hover:shadow transition-shadow">
                    <Building size={22} className="text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.organization')}</p>
                    <p className="font-semibold text-gray-900 dark:text-white">{user.organization}</p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 dark:text-gray-600" />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Sécurité */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-xl">
              <Lock size={20} className="text-red-600 dark:text-red-400" />
            </div>
            {t('profile.security')}
          </h2>
        </div>
        
        <div className="p-6">
          {!showPasswordSection ? (
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white dark:bg-gray-600 rounded-xl shadow-sm">
                  <Lock size={22} className="text-gray-500 dark:text-gray-400" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{t('profile.password')}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">{t('profile.lastPasswordChange')}</p>
                </div>
              </div>
              <button
                onClick={() => setShowPasswordSection(true)}
                className="px-4 py-2 bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors text-sm font-medium"
              >
                {t('common.edit')}
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordChange} className="space-y-5 animate-fade-in">
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('profile.currentPassword')}</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showCurrentPassword ? 'text' : 'password'}
                    value={passwordData.currentPassword}
                    onChange={(e) => setPasswordData((prev) => ({ ...prev, currentPassword: e.target.value }))}
                    className="w-full pl-12 pr-12 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showCurrentPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('profile.newPassword')}</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={passwordData.newPassword}
                    onChange={(e) => setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))}
                    className="w-full pl-12 pr-12 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showNewPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{t('profile.minCharacters')}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">{t('profile.confirmPassword')}</label>
                <div className="relative">
                  <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="password"
                    value={passwordData.confirmPassword}
                    onChange={(e) => setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full pl-12 pr-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-gray-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordSection(false)
                    setPasswordData({
                      currentPassword: '',
                      newPassword: '',
                      confirmPassword: '',
                    })
                  }}
                  className="flex-1 px-6 py-3 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors font-medium"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-red-600 to-orange-600 text-white rounded-xl hover:from-red-700 hover:to-orange-700 transition-all font-medium disabled:opacity-50"
                >
                  {isChangingPassword ? t('profile.changingPassword') : t('profile.changePassword')}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Préférences */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-xl">
              <Settings size={20} className="text-purple-600 dark:text-purple-400" />
            </div>
            {t('profile.preferences')}
          </h2>
        </div>
        
        <div className="p-6">
          {/* Dark Mode Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-xl shadow-sm transition-colors ${isDarkMode ? 'bg-gray-700' : 'bg-white'}`}>
                {isDarkMode ? (
                  <Moon size={22} className="text-indigo-400" />
                ) : (
                  <Sun size={22} className="text-yellow-500" />
                )}
              </div>
              <div>
                <p className="font-semibold text-gray-900 dark:text-white">{t('profile.darkMode')}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {isDarkMode ? t('profile.enabled') : t('profile.disabled')}
                </p>
              </div>
            </div>
            
            {/* iOS-style Toggle Switch */}
            <button
              onClick={toggleDarkMode}
              className={`relative w-14 h-8 rounded-full transition-colors duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                isDarkMode ? 'bg-indigo-600' : 'bg-gray-300'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-6 h-6 bg-white rounded-full shadow-md transform transition-transform duration-300 flex items-center justify-center ${
                  isDarkMode ? 'translate-x-6' : 'translate-x-0'
                }`}
              >
                {isDarkMode ? (
                  <Moon size={14} className="text-indigo-600" />
                ) : (
                  <Sun size={14} className="text-yellow-500" />
                )}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <div className="p-2 bg-green-100 dark:bg-green-900/50 rounded-xl">
              <Calendar size={20} className="text-green-600 dark:text-green-400" />
            </div>
            {t('profile.accountInfo')}
          </h2>
        </div>
        
        <div className="p-6 space-y-4">
          {user.createdAt && (
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-center gap-3">
                <Calendar size={18} className="text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">{t('profile.accountCreated')}</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">
                {new Date(user.createdAt).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </span>
            </div>
          )}
          {user.lastLogin && (
            <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
              <div className="flex items-center gap-3">
                <Clock size={18} className="text-gray-400" />
                <span className="text-gray-600 dark:text-gray-400">{t('profile.lastLogin')}</span>
              </div>
              <span className="font-semibold text-gray-900 dark:text-white">
                {new Date(user.lastLogin).toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default Profile
