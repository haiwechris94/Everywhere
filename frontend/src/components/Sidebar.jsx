/**
 * Sidebar - Collapsible Vertical Navigation
 */
import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import dmmReviewApi from '../services/dmmReviewService'
import {
  LayoutDashboard,
  Map,
  Globe,
  Users,
  Sprout,
  BarChart3,
  ClipboardCheck,
  Database,
  Shield,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
} from 'lucide-react'

const Sidebar = ({ mobileOpen = false, onMobileClose = () => {} }) => {
  const { user } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()

  // Live pending count for the DMM review queue. Gated to reviewers only so the
  // request never fires for other users (the /dmm-review link is hidden for them too).
  const isReviewer = user?.role === 'admin' || user?.role === 'supervisor'
  const { data: dmmCountRes } = useQuery({
    queryKey: ['dmm-review-count'],
    queryFn: () => dmmReviewApi.getCount(),
    enabled: isReviewer,
    refetchInterval: 60000,
    staleTime: 30000,
  })
  const dmmPendingCount = dmmCountRes?.data?.totalPending ?? 0

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebarCollapsed') === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('sidebarCollapsed', String(collapsed))
    } catch {
      /* ignore */
    }
  }, [collapsed])

  // Navigation structure. Items with `children` are collapsible submenus.
  const navSections = [
    { path: '/dashboard', label: t('nav.dashboard') || 'Dashboard', icon: LayoutDashboard },
    { path: '/unified-map', label: t('nav.unifiedMap') || 'Carte unifiée', icon: Map },
    {
      key: 'geography',
      label: t('nav.geography') || 'Géographie',
      icon: Globe,
      children: [
        { path: '/regions', label: 'Regions NG' },
        { path: '/geography', label: t('nav.countries') || 'Pays' },
      ],
    },
    { path: '/peoples', label: t('nav.peoples') || 'Peuples', icon: Users },
    {
      key: 'dmm-pillars',
      label: t('nav.dmmPillars') || 'Piliers DMM',
      icon: Sprout,
      children: [
        { path: '/persons-of-peace', label: t('nav.personsOfPeace') || 'Personnes de paix' },
        { path: '/discovery-groups', label: t('nav.discoveryGroups') || 'Groupes de découverte' },
        { path: '/dbs-sessions', label: t('nav.dbsSessions') || 'Sessions DBS' },
        { path: '/churches', label: t('nav.churches') || 'Églises' },
      ],
    },
    {
      key: 'reporting',
      label: t('nav.reporting') || 'Reporting',
      icon: BarChart3,
      children: [
        { path: '/dmm-reporting', label: t('nav.reportingQuarterly') || 'Trimestriel' },
        { path: '/reporting/monthly', label: t('nav.reportingMonthly') || 'Mensuel' },
        { path: '/reporting/trends', label: t('nav.reportingTrends') || 'Tendances' },
      ],
    },
    {
      key: 'activities-validations',
      label: t('nav.activitiesValidations') || 'Activités & Validations',
      icon: ClipboardCheck,
      children: [
        { path: '/activities', label: t('nav.activities') || 'Activités' },
        { path: '/pending-validations', label: t('nav.pendingValidations') || 'En attente de validation' },
        ...((user?.role === 'admin' || user?.role === 'supervisor') ? [{ path: '/dmm-review', label: t('nav.dmmReview') || 'Revue DMM', badge: dmmPendingCount }] : []),
        { path: '/rejected-people-groups', label: t('nav.rejectedPeopleGroups') || 'Rejetés' },
      ],
    },
    { path: '/data-management', label: t('nav.dataManagement') || 'Données', icon: Database },
  ]

  const isChildActive = (children) =>
    children.some((c) => location.pathname.startsWith(c.path))

  const [openSections, setOpenSections] = useState({})

  // Auto-open the section that contains the current route.
  useEffect(() => {
    const next = {}
    navSections.forEach((s) => {
      if (s.children && isChildActive(s.children)) {
        next[s.key] = true
      }
    })
    setOpenSections((prev) => ({ ...prev, ...next }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname])

  const toggleSection = (key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const linkBase =
    'flex items-center gap-3 rounded-lg text-[15px] font-medium transition-all duration-150 font-[Arial] lowercase'

  const renderSimpleLink = (item, { isAdmin } = {}) => {
    const Icon = item.icon
    return (
      <NavLink
        key={item.path}
        to={item.path}
        onClick={onMobileClose}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          `${linkBase} ${collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'} ${
            isActive
              ? isAdmin
                ? 'bg-red-100 text-red-800'
                : 'bg-neutral-900 text-white'
              : isAdmin
              ? 'text-red-700 hover:bg-red-100 hover:text-red-800'
              : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
          }`
        }
      >
        {Icon && <Icon size={18} className="flex-shrink-0" />}
        {!collapsed && <span className="truncate">{item.label}</span>}
      </NavLink>
    )
  }

  const renderSection = (section) => {
    if (!section.children) {
      return renderSimpleLink(section)
    }
    const Icon = section.icon
    const open = !!openSections[section.key]
    const activeSection = isChildActive(section.children)

    return (
      <div key={section.key}>
        <button
          type="button"
          onClick={() => (collapsed ? setCollapsed(false) : toggleSection(section.key))}
          title={collapsed ? section.label : undefined}
          className={`${linkBase} w-full ${
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          } ${
            activeSection
              ? 'text-neutral-900 bg-neutral-100'
              : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          {Icon && <Icon size={18} className="flex-shrink-0" />}
          {!collapsed && (
            <>
              <span className="truncate flex-1 text-left">{section.label}</span>
              <ChevronDown
                size={16}
                className={`flex-shrink-0 transition-transform duration-200 ${
                  open ? 'rotate-180' : ''
                }`}
              />
            </>
          )}
        </button>
        {!collapsed && open && (
          <div className="mt-0.5 ml-4 pl-3 border-l border-neutral-200 space-y-0.5">
            {section.children.map((child) => (
              <NavLink
                key={child.path}
                to={child.path}
                onClick={onMobileClose}
                className={({ isActive }) =>
                  `flex items-center px-3 py-2 rounded-lg text-sm transition-all duration-150 ${
                    isActive
                      ? 'bg-neutral-900 text-white font-medium'
                      : 'text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100'
                  }`
                }
              >
                <span className="truncate">{child.label}</span>
                {typeof child.badge === 'number' && child.badge > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center text-xs font-semibold rounded-full bg-red-500 text-white px-2 py-0.5">
                    {child.badge}
                  </span>
                )}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    )
  }

  const sidebarInner = (
    <div className="flex flex-col h-full">
      {/* Collapse toggle (desktop) + close (mobile) */}
      <div
        className={`flex items-center h-14 border-b border-neutral-200 flex-shrink-0 ${
          collapsed ? 'justify-center px-2' : 'justify-between px-3'
        }`}
      >
        {!collapsed && (
        <span className="text-sm font-bold text-neutral-800 uppercase tracking-widest font-[Arial]">
            Navigation
        </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="hidden lg:flex p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
          aria-label={collapsed ? 'Déployer' : 'Rétracter'}
          title={collapsed ? 'Déployer' : 'Rétracter'}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button
          type="button"
          onClick={onMobileClose}
          className="lg:hidden p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500 transition-colors"
          aria-label="Fermer le menu"
        >
          <X size={20} />
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-1">
        {navSections.map((section) => renderSection(section))}

        {user?.role === 'admin' && (
          <div className="pt-2 mt-2 border-t border-neutral-200">
            {renderSimpleLink(
              { path: '/admin/users', label: 'Administration', icon: Shield },
              { isAdmin: true }
            )}
          </div>
        )}
      </nav>
    </div>
  )

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={`hidden lg:flex flex-col bg-white border-r border-neutral-200 flex-shrink-0 transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {sidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={onMobileClose}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80%] bg-white border-r border-neutral-200 shadow-xl">
            {sidebarInner}
          </aside>
        </div>
      )}
    </>
  )
}

export default Sidebar
