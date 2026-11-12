import { createContext, useContext, useState, useEffect } from 'react'
import api from '../services/api'
import toast from 'react-hot-toast'
import { useLanguage } from '../i18n'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

export const AuthProvider = ({ children }) => {
  const { t } = useLanguage()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAuth()
  }, [])

  const checkAuth = async () => {
    const token = localStorage.getItem('token')
    if (token) {
      try {
        api.defaults.headers.common['Authorization'] = `Bearer ${token}`
        const response = await api.get('/api/auth/me')
        // /api/auth/me renvoie l'utilisateur directement (pas { user }) :
        // sans ce repli, la session était perdue à chaque rechargement.
        setUser(response.data.user || response.data)
      } catch (error) {
        localStorage.removeItem('token')
        delete api.defaults.headers.common['Authorization']
      }
    }
    setLoading(false)
  }

  const login = async (email, password) => {
    try {
      const response = await api.post('/api/auth/login', { email, password })
      const { token, user } = response.data
      localStorage.setItem('token', token)
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      toast.success(t('auth.loginSuccess'))
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.message || t('auth.loginError')
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const register = async (userData) => {
    try {
      const response = await api.post('/api/auth/register', userData)
      const { token, user } = response.data
      localStorage.setItem('token', token)
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`
      setUser(user)
      toast.success(t('auth.registerSuccess'))
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.message || t('auth.registerError')
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    delete api.defaults.headers.common['Authorization']
    setUser(null)
    toast.success(t('auth.logoutSuccess'))
  }

  const updateProfile = async (userData) => {
    try {
      const response = await api.put('/api/auth/profile', userData)
      setUser(response.data.user)
      toast.success(t('auth.profileUpdated'))
      return { success: true }
    } catch (error) {
      const message = error.response?.data?.message || t('auth.updateError')
      toast.error(message)
      return { success: false, error: message }
    }
  }

  const value = {
    user,
    loading,
    login,
    register,
    logout,
    updateProfile,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
