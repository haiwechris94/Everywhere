/**
 * PolygonPopulationDisplay Component
 * Displays population data when a polygon is clicked on the map
 */
import { useState, useEffect } from 'react'
import { useAuth } from '../../context/AuthContext'
import { peoplesApi } from '../../services/peoplesApi'
import { useLanguage } from '../../i18n'

// Status color mapping
const STATUS_COLORS = {
  unreached: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  pioneer: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
  midway: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
  'tipping-point': { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
  dmm: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
}

// Status display names
const STATUS_NAMES = {
  unreached: 'Unreached',
  pioneer: 'Pioneer',
  midway: 'Midway',
  'tipping-point': 'Tipping Point',
  dmm: 'DMM',
}

/**
 * PolygonPopulationDisplay - Shows population info for a selected polygon
 * @param {string} polygonId - The polygon ID or village name
 * @param {string} villageName - The village name (alternative to polygonId)
 * @param {function} onClose - Callback when popup is closed
 * @param {function} onAddPeople - Callback when add button is clicked
 * @param {Object} position - Position for the popup {x, y}
 */
const PolygonPopulationDisplay = ({ 
  polygonId, 
  villageName, 
  onClose, 
  onAddPeople,
  position = null 
}) => {
  const { user } = useAuth()
  const { t } = useLanguage()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)

  // Check if user can add peoples (Admin or Supervisor)
  const canAddPeople = user && ['admin', 'supervisor'].includes(user.role)

  // Fetch population data
  useEffect(() => {
    const fetchData = async () => {
      if (!polygonId && !villageName) return

      setLoading(true)
      setError(null)

      try {
        const identifier = polygonId || villageName
        const response = await peoplesApi.getByPolygon(identifier)
        setData(response.data)
      } catch (err) {
        console.error('Error fetching population data:', err)
        setError(err.response?.data?.message || 'Failed to load population data')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [polygonId, villageName])

  // Handle add button click
  const handleAddClick = () => {
    if (onAddPeople) {
      onAddPeople({
        polygonId,
        villageName: villageName || polygonId,
      })
    }
  }

  // Render loading state
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-4 min-w-[280px]">
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-2 text-gray-600">Loading...</span>
        </div>
      </div>
    )
  }

  // Render error state
  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-lg p-4 min-w-[280px]">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-gray-800">
            {villageName || polygonId || 'Population Data'}
          </h3>
          {onClose && (
            <button aria-label={t('common.close')}
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <div className="text-red-600 text-sm py-2">{error}</div>
        {canAddPeople && (
          <button
            onClick={handleAddClick}
            className="mt-2 w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            + Add Population Data
          </button>
        )}
      </div>
    )
  }

  // Render data
  const { peoples = [], totals = {}, count = 0 } = data || {}

  return (
    <div className="bg-white rounded-lg shadow-lg p-4 min-w-[320px] max-w-[400px] max-h-[500px] overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b">
        <h3 className="font-semibold text-gray-800 text-lg">
          {villageName || polygonId || 'Population Data'}
        </h3>
        {onClose && (
          <button aria-label={t('common.close')}
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-600">
            {totals.totalPopulation?.toLocaleString() || 0}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Population</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-green-600">
            {totals.totalHouseholds?.toLocaleString() || 0}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Households</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-600">
            {totals.totalBelievers?.toLocaleString() || 0}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Believers</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-orange-600">
            {totals.totalChurches?.toLocaleString() || 0}
          </div>
          <div className="text-xs text-gray-500 uppercase tracking-wide">Churches</div>
        </div>
      </div>

      {/* People Groups List */}
      {peoples.length > 0 ? (
        <div className="space-y-2 mb-4">
          <h4 className="text-sm font-medium text-gray-700">
            People Groups ({count})
          </h4>
          {peoples.map((people) => {
            const statusStyle = STATUS_COLORS[people.status] || STATUS_COLORS.unreached
            return (
              <div
                key={people._id}
                className={`p-2 rounded-md border ${statusStyle.border} ${statusStyle.bg}`}
              >
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${statusStyle.text}`}>
                    {people.name}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}>
                    {STATUS_NAMES[people.status] || people.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
                  <span>Pop: {people.population?.toLocaleString() || 0}</span>
                  {people.language && <span>Lang: {people.language}</span>}
                  {people.religion && <span>Rel: {people.religion}</span>}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="text-center py-4 text-gray-500 text-sm">
          No population data available for this area
        </div>
      )}

      {/* Add Button - Only for Admin/Supervisor */}
      {canAddPeople && (
        <button
          onClick={handleAddClick}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Population Data
        </button>
      )}
    </div>
  )
}

export default PolygonPopulationDisplay
