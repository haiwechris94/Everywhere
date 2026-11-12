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
  Database,
  Flag,
  Users,
  HeartHandshake,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

const COLLAPSE_KEY = 'sidebar.collapsed'

const TopNavbar = () => {
  const { user, logout } = useAuth()
  const { t, isFrench } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()

  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem(COLLAPSE_KEY) === 'true' } catch { return false }
  })
  const [mainOpen, setMainOpen] = useState(true)
  const [reportingOpen, setReportingOpen] = useState(true)
  const [managementOpen, setManagementOpen] = useState(true)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const userMenuRef = useRef(null)

  const navGroups = [
    {
      title: isFrench ? 'Explorer' : 'Explore',
      open: mainOpen,
      setOpen: setMainOpen,
      items: [
        { path: '/regions', label: isFrench ? 'Régions' : 'Regions', icon: Globe },
        { path: '/countries', label: t('nav.countries') || 'Countries', icon: Flag },
        { path: '/people-groups', label: t('nav.peopleGroups') || 'Peuples', icon: Users },
        { path: '/engagements', label: t('nav.engagements') || 'Engagements', icon: HeartHandshake },
        { path: '/persons', label: t('nav.persons') || 'Personnes', icon: User },
        { path: '/initiatives', label: 'Initiatives', icon: FolderKanban },
        { path: '/unified-map', label: isFrench ? 'Carte' : 'Map', icon: MapIcon },
      ],
    },
    {
      title: isFrench ? 'Rapports' : 'Reports',
      open: reportingOpen,
      setOpen: setReportingOpen,
      items: [
        { path: '/dmm-reporting', label: t('nav.dmmReporting') || 'Data Reporting', icon: BarChart3 },
        { path: '/activities', label: t('nav.activities') || 'Activities', icon: Activity },
        { path: '/dashboard', label: isFrench ? 'Tableau de bord' : 'Dashboard', icon: LayoutDashboard, exact: true },
      ],
    },
    {
      title: isFrench ? 'Gestion' : 'Manage',
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

  // Escape closes the mobile drawer and the user menu
  useEffect(() => {
    if (!mobileOpen && !userMenuOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key !== 'Escape') return
      setMobileOpen(false)
      setUserMenuOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [mobileOpen, userMenuOpen])

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
        aria-label={collapsed ? item.label : undefined}
        aria-current={active ? 'page' : undefined}
        className={
          `relative flex items-center gap-3 rounded-lg text-base min-h-[2.75rem] transition-colors duration-150 ${collapsed ? 'lg:justify-center lg:px-0 px-3' : 'px-3'} py-2 ${
            active
              ? 'bg-primary-50 text-primary-800 font-semibold dark:bg-primary-900/50 dark:text-primary-100'
              : 'text-neutral-700 font-medium hover:text-neutral-900 hover:bg-neutral-100 dark:text-slate-300 dark:hover:text-slate-100 dark:hover:bg-slate-700'
          }`
        }
      >
        {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-1 rounded-full bg-primary-600 dark:bg-primary-300" />}
        {Icon && <Icon size={20} className="flex-shrink-0" aria-hidden="true" />}
        <span className={`whitespace-nowrap ${collapsed ? 'lg:hidden' : ''}`}>{item.label}</span>
      </NavLink>
    )
  }

  const width = collapsed ? 'lg:w-16' : 'lg:w-64'

  return (
    <>
      {/* Mobile top bar (hamburger + logo) */}
      <header className="lg:hidden bg-white dark:bg-slate-800 shadow-sm border-b border-neutral-200 dark:border-slate-700 sticky top-0 z-50">
        <div className="flex items-center justify-between h-14 px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="inline-flex items-center justify-center h-11 w-11 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-700 transition-colors text-neutral-700 dark:text-slate-200"
            aria-label={isFrench ? 'Ouvrir le menu' : 'Open menu'}
          >
            <Menu size={22} />
          </button>
          <NavLink to="/regions" className="flex items-center gap-2">
            <img src="/data/Everywhere_Logo_Mark_Black.png" alt="EVERYWHERE" className="h-7 w-7 dark:invert" />
            <span className="font-display text-base font-semibold text-neutral-900 dark:text-slate-100">Everywhere</span>
          </NavLink>
          <LanguageSwitcher variant="compact" />
        </div>
      </header>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/40 dark:bg-black/60 z-50"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          bg-white dark:bg-slate-800 border-r border-neutral-200 dark:border-slate-700 flex flex-col z-50
          fixed inset-y-0 left-0 w-64 transform transition-transform duration-200
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
          lg:static lg:translate-x-0 lg:h-screen lg:sticky lg:top-0 ${width} lg:transition-[width] lg:duration-200
        `}
      >
        {/* Header: logo + collapse toggle */}
        <div className={`flex items-center h-16 flex-shrink-0 border-b border-neutral-200 dark:border-slate-700 ${collapsed ? 'lg:justify-center px-2' : 'justify-between px-4'}`}>
          <NavLink to="/regions" className="flex items-center gap-2.5 overflow-hidden">
            <img src="/data/Everywhere_Logo_Mark_Black.png" alt="EVERYWHERE" className="h-8 w-8 flex-shrink-0 dark:invert" />
            <span className={`font-display text-lg font-semibold text-neutral-900 dark:text-slate-100 whitespace-nowrap ${collapsed ? 'lg:hidden' : ''}`}>
              Everywhere
            </span>
          </NavLink>
          {/* Close on mobile */}
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden inline-flex items-center justify-center h-11 w-11 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-700 text-neutral-700 dark:text-slate-200"
            aria-label={isFrench ? 'Fermer le menu' : 'Close menu'}
          >
            <X size={20} />
          </button>
          {/* Collapse toggle on desktop */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`hidden lg:inline-flex items-center justify-center h-10 w-10 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-700 text-neutral-600 dark:text-slate-300 hover:text-neutral-800 dark:hover:text-slate-100 ${collapsed ? 'lg:hidden' : ''}`}
            aria-label={isFrench ? 'Réduire le menu' : 'Collapse menu'}
            title={isFrench ? 'Réduire le menu' : 'Collapse menu'}
          >
            <PanelLeftClose size={18} />
          </button>
        </div>

        {/* Expand button visible when collapsed (desktop) */}
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            className="hidden lg:flex items-center justify-center h-11 mx-2 mt-2 rounded-lg hover:bg-neutral-100 dark:hover:bg-slate-700 text-neutral-600 dark:text-slate-300 hover:text-neutral-800 dark:hover:text-slate-100"
            aria-label={isFrench ? 'Agrandir le menu' : 'Expand menu'}
            title={isFrench ? 'Agrandir le menu' : 'Expand menu'}
          >
            <PanelLeftOpen size={18} />
          </button>
        )}

        {/* Nav items */}
        <nav aria-label={isFrench ? 'Navigation principale' : 'Main navigation'} className="flex-1 overflow-y-auto py-3 px-2 space-y-3 dark:bg-slate-800">
          {navGroups.map((group) => (
            <div key={group.title} className="space-y-1">
              <button
                type="button"
                onClick={() => group.setOpen((v) => !v)}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600 hover:text-neutral-900 dark:text-slate-400 dark:hover:text-slate-100 ${collapsed ? 'lg:hidden' : ''}`}
                aria-expanded={group.open}
              >
                <span>{group.title}</span>
                {group.open ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
              </button>
              {(group.open || collapsed) && (
                <div className="space-y-0.5">
                  {group.items.map(renderNavItem)}
                </div>
              )}
            </div>
          ))}
        </nav>

        {/* Footer: language (desktop) + user */}
        <div className="flex-shrink-0 border-t border-neutral-200 dark:border-slate-700 p-2 space-y-1">
          <div className={`hidden lg:block ${collapsed ? 'lg:hidden' : ''} px-1 py-1`}>
            <LanguageSwitcher variant="compact" />
          </div>
          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className={`flex items-center gap-2.5 w-full rounded-xl hover:bg-neutral-50 dark:hover:bg-slate-700 transition-all duration-150 border border-transparent hover:border-neutral-200 dark:hover:border-slate-600 ${collapsed ? 'lg:justify-center px-2' : 'px-2.5'} py-2`}
              aria-label={isFrench ? 'Mon compte' : 'My account'}
              aria-expanded={userMenuOpen}
              title={collapsed ? user?.name : undefined}
            >
              <div className="w-9 h-9 flex-shrink-0 bg-primary-600 rounded-full flex items-center justify-center">
                <User size={17} className="text-white" aria-hidden="true" />
              </div>
              <div className={`flex-1 min-w-0 text-left ${collapsed ? 'lg:hidden' : ''}`}>
                <p className="text-sm font-semibold text-neutral-800 dark:text-slate-100 truncate">{user?.name}</p>
                <p className="text-xs text-neutral-600 dark:text-slate-400 truncate">{user?.email}</p>
              </div>
            </button>

            {userMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-60 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-neutral-200 dark:border-slate-700 py-2 overflow-hidden z-50">
                <div className="px-4 py-2.5 border-b border-neutral-100 dark:border-slate-700">
                  <p className="text-sm font-semibold text-neutral-800 dark:text-slate-100">{user?.name}</p>
                  <p className="text-xs text-neutral-600 dark:text-slate-400 truncate">{user?.email}</p>
                </div>
                <div className="py-1">
                  <NavLink
                    to="/profile"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-3 text-sm text-neutral-800 dark:text-slate-200 hover:bg-neutral-100 dark:hover:bg-slate-700 transition-colors"
                  >
                    <User size={15} />
                    <span>{t('nav.profile') || 'Profil'}</span>
                  </NavLink>
                </div>
                <div className="border-t border-neutral-100 dark:border-slate-700 pt-1">
                  <button
                    onClick={handleLogout}
                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 w-full transition-colors"
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
