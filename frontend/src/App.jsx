/**
 * App.jsx - Main Application Router
 * 
 * OPTIMIZED: Implements React.lazy() for code splitting and lazy loading
 * Heavy components (MapView, GeoJSONMapView, VoronoiMapPage) are loaded on demand
 * This significantly reduces initial bundle size and improves first load time
 * 
 * @author Church Planting Map Team
 * @version 2.0.0 - Performance Optimized
 */

import { Suspense, lazy } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'

// ============================================================================
// EAGER LOADED COMPONENTS (Critical Path - needed immediately)
// These are loaded in the main bundle for fast initial render
// ============================================================================
import Login from './pages/Login'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'

// ============================================================================
// LAZY LOADED COMPONENTS (Code Splitting - loaded on demand)
// These heavy components are split into separate chunks
// Reduces initial bundle size by ~60% for faster first load
// ============================================================================

// Dashboard components - loaded after authentication
const DashboardEnhanced = lazy(() => import('./pages/DashboardEnhanced'))
const AnalyticsTablePage = lazy(() => import('./pages/AnalyticsTablePage'))

// Map components - HEAVY (~1600 lines each) - loaded only when navigating to map
const GeoJSONMapView = lazy(() => import('./pages/GeoJSONMapView'))
const VoronoiMapPage = lazy(() => import('./pages/VoronoiMapPage'))
const UnifiedMapView = lazy(() => import('./pages/UnifiedMapView'))

// Secondary pages - loaded on demand
const Profile = lazy(() => import('./pages/Profile'))
const PeopleGroupDetail = lazy(() => import('./pages/PeopleGroupDetail'))
const VillageDetail = lazy(() => import('./pages/VillageDetail'))
const Initiatives = lazy(() => import('./pages/Initiatives'))
const InitiativeDetail = lazy(() => import('./pages/InitiativeDetail'))
const InitiativePeopleDetail = lazy(() => import('./pages/InitiativePeopleDetail'))
const DataManagement = lazy(() => import('./pages/DataManagement'))
const PendingValidations = lazy(() => import('./pages/PendingValidations'))
const RejectedPeopleGroups = lazy(() => import('./pages/RejectedPeopleGroups'))

// DMM pillars — nouvelles pages
const DmmReporting = lazy(() => import('./pages/DmmReporting'))
const DmmReviewQueue = lazy(() => import('./pages/DmmReviewQueue'));
const Regions = lazy(() => import('./pages/Regions'))
const Pays = lazy(() => import('./pages/Pays'))
const RegionCountries = lazy(() => import('./pages/RegionCountries'))
const CountryPeoples = lazy(() => import('./pages/CountryPeoples'))
const PeopleDetailLite = lazy(() => import('./pages/PeopleDetailLite'))
const EngagementDetail = lazy(() => import('./pages/EngagementDetail'))
const PlanterEngagements = lazy(() => import('./pages/PlanterEngagements'))
const Activities = lazy(() => import('./pages/Activities'))

const NOTION_ACTIVITE_URL = 'https://reminiscent-acapella-740.notion.site/EVERYWHERE-2a3ec55e01df8007bfc3fc19d481d3fc'

// Admin pages - lazy loaded, admin-only access
const AdminUsers = lazy(() => import('./pages/AdminUsers'))

// ============================================================================
// LOADING FALLBACK COMPONENT
// Shown while lazy components are being loaded
// ============================================================================
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-50">
    <div className="text-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
      <p className="text-gray-500 text-sm">Chargement...</p>
    </div>
  </div>
)

// Compact loader for nested routes
const CompactLoader = () => (
  <div className="flex items-center justify-center py-12">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
  </div>
)

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

/**
 * AdminRoute - Protected route that requires admin role
 * Redirects to dashboard if user is not an admin
 */
const AdminRoute = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  if (user.role !== 'admin') {
    return <Navigate to="/dashboard" replace />
  }

  return children
}

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    )
  }

  if (user) {
    // Après connexion, la première page affichée est « Regions ».
    return <Navigate to="/regions" replace />
  }

  return children
}

function App() {
  return (
    // Wrap entire app in Suspense for lazy-loaded components
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Public Routes - Login/Register are eagerly loaded for fast initial render */}
        <Route
          path="/login"
          element={
            <PublicRoute>
              <Login />
            </PublicRoute>
          }
        />
        <Route
          path="/register"
          element={
            <PublicRoute>
              <Register />
            </PublicRoute>
          }
        />
        <Route
          path="/reset-password/:token"
          element={
            <PublicRoute>
              <ResetPassword />
            </PublicRoute>
          }
        />

        {/* Protected Routes - All lazy loaded for code splitting */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="/regions" replace />} />
          
          {/* Dashboard - lazy loaded */}
          <Route path="dashboard" element={
            <Suspense fallback={<CompactLoader />}>
              <DashboardEnhanced />
            </Suspense>
          } />
          <Route path="analytics-table" element={
            <Suspense fallback={<CompactLoader />}>
              <AnalyticsTablePage />
            </Suspense>
          } />
          
          {/* Map Views - HEAVY components, lazy loaded with error boundaries */}
          <Route path="unified-map" element={
            <ErrorBoundary fallbackMessage="Erreur lors du chargement de la carte unifiee.">
              <Suspense fallback={<CompactLoader />}>
                <UnifiedMapView />
              </Suspense>
            </ErrorBoundary>
          } />
          {/* Legacy Map route removed - redirect to the unified map */}
          <Route path="map" element={<Navigate to="/unified-map" replace />} />
          <Route path="geojson-map" element={<Navigate to="/unified-map" replace />} />
          <Route path="voronoi-map" element={
            <ErrorBoundary fallbackMessage="Erreur lors du chargement de la carte Voronoi.">
              <Suspense fallback={<CompactLoader />}>
                <VoronoiMapPage />
              </Suspense>
            </ErrorBoundary>
          } />
          
          {/* Secondary pages - lazy loaded */}
          <Route path="activities" element={
            <Suspense fallback={<CompactLoader />}>
              <Activities />
            </Suspense>
          } />
          <Route path="initiatives" element={
            <Suspense fallback={<CompactLoader />}>
              <Initiatives />
            </Suspense>
          } />
          {/* Legacy path kept so existing /projects links/bookmarks keep working. */}
          <Route path="projects" element={<Navigate to="/initiatives" replace />} />
          <Route path="initiatives/:key" element={
            <ErrorBoundary fallbackMessage="Error loading initiative.">
              <Suspense fallback={<CompactLoader />}>
                <InitiativeDetail />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="initiatives/:key/peoples/:peopleId" element={
            <ErrorBoundary fallbackMessage="Error loading initiative people detail.">
              <Suspense fallback={<CompactLoader />}>
                <InitiativePeopleDetail />
              </Suspense>
            </ErrorBoundary>
          } />
          {/* Legacy initiative paths kept working with a redirect. */}
          <Route path="projects/initiatives/:key" element={<Navigate to="/initiatives" replace />} />
          <Route path="projects/initiatives/:key/peoples/:peopleId" element={<Navigate to="/initiatives" replace />} />
          <Route path="pending-validations" element={
            <Suspense fallback={<CompactLoader />}>
              <PendingValidations />
            </Suspense>
          } />
          <Route path="dmm-review" element={<Suspense fallback={<CompactLoader />}><DmmReviewQueue /></Suspense>} />
          <Route path="rejected-people-groups" element={
            <Suspense fallback={<CompactLoader />}>
              <RejectedPeopleGroups />
            </Suspense>
          } />
          {/* DMM pillars — groupes DBS, reporting */}
          <Route path="dmm-reporting" element={
            <Suspense fallback={<CompactLoader />}>
              <DmmReporting />
            </Suspense>
          } />
          <Route path="regions" element={
            <Suspense fallback={<CompactLoader />}>
              <Regions />
            </Suspense>
          } />
          <Route path="countries" element={
            <Suspense fallback={<CompactLoader />}>
              <Pays />
            </Suspense>
          } />
          <Route path="regions/:regionId" element={
            <Suspense fallback={<CompactLoader />}>
              <RegionCountries />
            </Suspense>
          } />
          <Route path="regions/:regionId/countries/:countryCode" element={
            <Suspense fallback={<CompactLoader />}>
              <CountryPeoples />
            </Suspense>
          } />
          <Route path="regions/:regionId/countries/:countryCode/peoples/:peopleId" element={
            <Suspense fallback={<CompactLoader />}>
              <PeopleDetailLite />
            </Suspense>
          } />
          <Route path="regions/:regionId/countries/:countryCode/peoples/:peopleId/engagements/:engagementId" element={
            <ErrorBoundary fallbackMessage="Error loading engagement details.">
              <Suspense fallback={<CompactLoader />}>
                <EngagementDetail />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="engagements/:engagementId" element={
            <ErrorBoundary fallbackMessage="Error loading engagement details.">
              <Suspense fallback={<CompactLoader />}>
                <EngagementDetail />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="data-management" element={
            <Suspense fallback={<CompactLoader />}>
              <DataManagement />
            </Suspense>
          } />
          <Route path="profile" element={
            <Suspense fallback={<CompactLoader />}>
              <Profile />
            </Suspense>
          } />
          <Route path="people-groups/:id" element={
            <ErrorBoundary fallbackMessage="Error loading people group details.">
              <Suspense fallback={<CompactLoader />}>
                <PeopleGroupDetail />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="planters/:name/engagements" element={
            <ErrorBoundary fallbackMessage="Error loading planter engagements.">
              <Suspense fallback={<CompactLoader />}>
                <PlanterEngagements />
              </Suspense>
            </ErrorBoundary>
          } />
          <Route path="villages/:id" element={
            <ErrorBoundary fallbackMessage="Error loading village details.">
              <Suspense fallback={<CompactLoader />}>
                <VillageDetail />
              </Suspense>
            </ErrorBoundary>
          } />
          
          {/* Admin Routes - Admin-only access */}
          <Route path="admin/users" element={
            <AdminRoute>
              <Suspense fallback={<CompactLoader />}>
                <AdminUsers />
              </Suspense>
            </AdminRoute>
          } />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
