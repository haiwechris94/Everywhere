/**
 * TopNavbar - Collapsible vertical left sidebar navigation
 */
import { useState, useRef, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'
import {
  User,
  LogOut,
  Menu,
  X,
  Shield,
  LayoutDashboard,
  MapPin,
  Globe,
  FolderKanban,
  Activity,
  BarChart3,
  ClipboardList,
  Database,
  Flag,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

const COLLAPSE_KEY = 'sidebar.collapsed'

const TopNavbar = () => {
  const { user, logout } = useAuth()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true' } catch { return false }
  })
  const [mainOpen, setMainOpen] = useState(true)
  const [reportingOpen, setReportingOpen] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  const navGroups = [
    {
      title: 'MAIN',
      open: mainOpen,
      setOpen: setMainOpen,
      items: [
        { path: '/regions', label: 'Regions', icon: Globe },
        { path: '/countries', label: t('nav.countries') || 'Countries', icon: Flag },
        { path: '/initiatives', label: 'Initiatives', icon: FolderKanban },
        { path: '/unified-map', label: t('nav.unifiedMap') || 'Mapping', icon: MapPin },
      ],
    },
    {
      title: 'REPORTING',
      open: reportingOpen,
      setOpen: setReportingOpen,
      items: [
        { path: '/dmm-reporting', label: t('nav.dmmReporting') || 'Data Reporting', icon: BarChart3 },
        { path: '/activities', label: t('nav.activities') || 'Activities', icon: Activity },
        { path: '/analyse-qualitative', label: t('nav.analyseQualitative') || 'Qualitative Analysis', icon: ClipboardList },
        { path: '/dashboard', label: 'Global Dashboard', icon: LayoutDashboard, exact: true },
      ],
    },
    {
      title: 'MANAGEMENT',
      open: managementOpen,
      setOpen: setManagementOpen,
      items: [
        { path: '/data-management', label: t('nav.dataManagement') || 'Data Management', icon: Database },
        ...(user?.role === 'admin' ? [{ path: '/admin/users', label: 'Administration', icon: Shield, admin: true }] : []),
      ],
    },
  ]

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setUserMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, String(collapsed)) } catch { /* noop */ }
  }, [collapsed])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const isActive = (path) => {
    if (path === '/dashboard') {
      return location.pathname === '/dashboard' || location.pathname === '/'
    }
    if (path === '/map') {
      return location.pathname.startsWith('/map') || location.pathname.startsWith('/geojson-map')
    }
    return location.pathname.startsWith(path)
  }

  const renderNavItem = (item) => {
    const active = isActive(item.path)
    const Icon = item.icon
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={() => setMobileOpen(false)}
        title={collapsed ? item.label : undefined}
        className={
          `flex items-center gap-3 rounded-lg text-[15px] font-medium transition-all duration-150 font-[Arial] ${collapsed ? 'lg:justify-center lg:px-0 px-3' : 'px-3'} py-2.5 ${
            active
              ? 'bg-neutral-900 text-white'
              : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
          }${item.admin ? (active ? '' : ' bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800') : ''}`
        }
      >
        {Icon && <Icon size={18} className="flex-shrink-0" />}
        <span className={`whitespace-nowrap font-normal font-[Arial] ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
      </NavLink>
    )
  }

  const width = collapsed ? 'lg:w-16' : 'lg:w-64'

  return (
    <>
      {/* Mobile top bar (hamburger + logo) */}
      <header className="lg:hidden bg-white shadow-sm border-b border-neutral-200 sticky top-0 z-50">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="p-2 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-600"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <NavLink to="/dashboard" className="flex items-center gap-2">
            <img src="/data/Everywhere_Logo_Mark_Black.png" alt="EVERYWHERE" className="h-7 w-7" />
            <span className="text-sm font-bold text-neutral-800 uppercase tracking-widest">EVERYWHERE</span>
          </NavLink>
          <LanguageSwitcher variant="compact" />
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 z-50"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          bg-white border-r border-neutral-200 flex flex-col z-50
          fixed inset-y-0 left-0 w-64 transform transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0 lg:h-screen lg:sticky lg:top-0 ${width} lg:transition-[width] lg:duration-200
        `}
      >
        {/* Header: logo + collapse toggle */}
        <div className={`flex items-center h-14 flex-shrink-0 border-b border-neutral-200 ${collapsed ? 'lg:justify-center px-2' : 'justify-between px-4'}`}>
          <NavLink to="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
            <img src="/data/Everywhere_Logo_Mark_Black.png" alt="EVERYWHERE" className="h-8 w-8 flex-shrink-0" />
            <span className={`text-base font-bold text-neutral-800 uppercase tracking-widest whitespace-nowrap ${collapsed ? 'lg:hidden' : ''}`}>
              EVERYWHERE
            </span>
          </NavLink>
          {/* Close on mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-600"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
          {/* Collapse toggle on desktop */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden lg:inline-flex p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800 ${collapsed ? 'lg:hidden' : ''}`}
            aria-label="Collapse sidebar"
            title="Réduire"
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Expand button visible when collapsed (desktop) */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="hidden lg:flex items-center justify-center h-9 mx-2 mt-2 rounded-lg hover:bg-neutral-100 text-neutral-500 hover:text-neutral-800"
            aria-label="Expand sidebar"
            title="Développer"
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        {/* Nav items */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-2">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <button
                type="button"
                onClick={() => group.setOpen((v) => !v)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm tracking-widest text-neutral-400 ${collapsed ? 'lg:justify-center' : ''}`}
                aria-expanded={group.open}
              >
                <span className={`font-normal ${collapsed ? 'lg:hidden' : ''}`}>{group.title}</span>
                {!collapsed && (group.open ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
              </button>
              {group.open && (
                <div className="space-y-0.5">
                  {group.items.map(renderNavItem)}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Footer: language (desktop) + user */}
        <div className="flex-shrink-0 border-t border-neutral-200 p-2 space-y-1">
          <div className={`hidden lg:block ${collapsed ? 'lg:hidden' : ''} px-1 py-1`}>
            <LanguageSwitcher variant="compact" />
          </div>
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex items-center gap-2.5 w-full rounded-xl hover:bg-neutral-50 transition-all duration-150 border border-transparent hover:border-neutral-200 ${collapsed ? 'lg:justify-center px-2' : 'px-2.5'} py-2`}
              aria-label="User menu"
              title={collapsed ? user?.name : undefined}
            >
              <div className="w-8 h-8 flex-shrink-0 bg-gradient-to-br from-neutral-700 to-neutral-900 rounded-full flex items-center justify-center">
                <User size={15} className="text-white" />
              </div>
              <div className={`flex-1 min-w-0 text-left ${collapsed ? 'lg:hidden' : ''}`}>
                <p className="text-sm font-semibold text-neutral-800 truncate">{user?.name}</p>
                <p className="text-xs text-neutral-400 truncate">{user?.email}</p>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-52 bg-white rounded-xl shadow-xl border border-neutral-200 py-2 overflow-hidden z-50">
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
      </aside>
    </>
  )
}

export default TopNavbar
