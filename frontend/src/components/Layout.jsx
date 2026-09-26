import { Outlet, useLocation } from 'react-router-dom'
import TopNavbar from './TopNavbar'

const FULLSCREEN_ROUTES = ['/voronoi-map', '/unified-map']

const Layout = () => {
  const location = useLocation()
  const isFullscreen = FULLSCREEN_ROUTES.some(r => location.pathname.startsWith(r))
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col lg:flex-row">
      <TopNavbar />
      <main className={isFullscreen
        ? 'flex-1 min-w-0 overflow-hidden h-[calc(100vh-3.5rem)] lg:h-screen'
        : 'flex-1 min-w-0 w-full px-4 sm:px-6 lg:px-8 py-6'
      }>
        {isFullscreen ? <Outlet /> : <div className="max-w-7xl mx-auto w-full"><Outlet /></div>}
      </main>
    </div>
  )
}

export default Layout
