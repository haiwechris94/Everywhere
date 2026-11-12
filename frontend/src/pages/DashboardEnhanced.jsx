/**
 * DashboardEnhanced.jsx â€” Slim wrapper for AnalyticsDashboard
 * Preserves Socket.IO real-time invalidation and DataSourceContext
 */
import { useEffect, createContext, useContext, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { initSocket, subscribeToPeopleGroupUpdates, subscribeToVillageStatusUpdates } from '../services/socket'
import AnalyticsDashboard from '../components/Dashboard/AnalyticsDashboard'

export const DataSourceContext = createContext({
  showDMM: true,
  showJoshuaProject: true,
  setShowDMM: () => {},
  setShowJoshuaProject: () => {},
})
export const useDataSourceVisibility = () => useContext(DataSourceContext)

const DashboardEnhanced = () => {
  const queryClient = useQueryClient()
  const [showDMM, setShowDMM] = useState(true)
  const [showJoshuaProject, setShowJoshuaProject] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    initSocket(token)
    const invalidate = () => {
      queryClient.invalidateQueries({ queryKey: ['analytics-ai-summary'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-weekly-activity'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-metric'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-dmm-growth'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-top-regions'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-people-groups'] })
      queryClient.invalidateQueries({ queryKey: ['activity-recent'] })
    }
    const unsub1 = subscribeToPeopleGroupUpdates(invalidate)
    const unsub2 = subscribeToVillageStatusUpdates(invalidate)
    return () => { unsub1(); unsub2() }
  }, [queryClient])

  return (
    <DataSourceContext.Provider value={{ showDMM, showJoshuaProject, setShowDMM, setShowJoshuaProject }}>
      <AnalyticsDashboard />
    </DataSourceContext.Provider>
  )
}

export default DashboardEnhanced