/**
 * Header - Top bar (sticky): hamburger (mobile) + logo + language + user menu
 */
import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'
import { User, LogOut, Menu, ChevronDown } from 'lucide-react'

const Header = ({ onMenuClick = () => {} }) => {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()

  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="bg-white shadow-sm border-b border-neutral-200 sticky top-0 z-40">
      <div className="flex items-center justify-between h-14 px-4 sm:px-6">
        {/* Left: hamburger (mobile) + logo */}
        <div className="flex items-center gap-3 flex-shrink-0">
          <button
            onClick={onMenuClick}
            className="lg:hidden p-2 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-600"
            aria-label="Ouvrir le menu"
          >
            <Menu size={22} />
          </button>
          <NavLink to="/dashboard" className="flex items-center gap-2.5">
            <img
              src="/data/Everywhere_Logo_Mark_Black.png"
              alt="EVERYWHERE"
              className="h-8 w-8"
            />
            <span className="hidden sm:block text-base font-bold text-neutral-800 uppercase tracking-widest">
              EVERYWHERE
            </span>
          </NavLink>
        </div>

        {/* Right: Language + User */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <LanguageSwitcher variant="compact" />
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl hover:bg-neutral-50 transition-all duration-150 border border-transparent hover:border-neutral-200"
              aria-label="User menu"
            >
              <div className="w-7 h-7 bg-gradient-to-br from-neutral-700 to-neutral-900 rounded-full flex items-center justify-center">
                <User size={14} className="text-white" />
              </div>
              <ChevronDown
                size={14}
                className={`hidden md:block text-neutral-400 transition-transform duration-200 ${userMenuOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-neutral-200 py-2 overflow-hidden z-50">
                <div className="px-4 py-2.5 border-b border-neutral-100">
                  <p className="text-sm font-semibold text-neutral-800">{user?.name}</p>
                  <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <NavLink
                    to="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
                  >
                    <User size={15} />
                    <span>{t('nav.profile') || 'Profil'}</span>
                  </NavLink>
                </div>
                <div className="border-t border-neutral-100 pt-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 w-full transition-colors"
                  >
                    <LogOut size={15} />
                    <span>{t('auth.logout') || 'Déconnexion'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
