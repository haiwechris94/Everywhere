/**
 * Village Details Modal Component
 * Shows detailed village information when clicking on a polygon
 */
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { dashboardApi } from '../../services/api'
import { X, Users, Church, MapPin, TrendingUp, Loader2 } from 'lucide-react'
import { useLanguage } from '../../i18n'

// Status colors
const STATUS_COLORS = {
  unreached: '#EF4444',
  pioneer: '#F59E0B',
  midway: '#3B82F6',
  'tipping-point': '#F97316',
  dmm: '#10B981',
  'pas-d-information': '#6B7280'
}

const STATUS_LABELS = {
  unreached: 'Unreached',
  pioneer: 'Pioneer',
  midway: 'Midway',
  'tipping-point': 'Tipping Point',
  dmm: 'DMM',
  'pas-d-information': "Pas d'information"
}

const VillageDetailsModal = ({ villageName, isOpen, onClose }) => {
  const { isFrench } = useLanguage()
  const { data, isLoading, error } = useQuery({
    queryKey: ['village-details', villageName],
    queryFn: async () => {
      const response = await dashboardApi.getVillageDetailsByName(villageName)
      return response.data.data
    },
    enabled: isOpen && !!villageName
  })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div 
          className="px-6 py-4 border-b border-gray-200 flex items-center justify-between"
          style={{ backgroundColor: data ? STATUS_COLORS[data.status] + '20' : '#f3f4f6' }}
        >
          <div>
            <h2 className="text-xl font-bold text-gray-800">{villageName}</h2>
            {data && (
              <div className="flex items-center gap-2 mt-1">
                <div 
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[data.status] }}
                />
                <span className="text-sm font-medium" style={{ color: STATUS_COLORS[data.status] }}>
                  {STATUS_LABELS[data.status]}
                </span>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-600">
              Erreur: {error.message}
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Key Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <Users className="w-6 h-6 text-blue-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-gray-800">
                    {data.population?.toLocaleString() || 0}
                  </p>
                  <p className="text-xs text-gray-500">Population</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <Users className="w-6 h-6 text-indigo-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-gray-800">
                    {data.totalPeopleGroups}
                  </p>
                  <p className="text-xs text-gray-500">{isFrench ? 'Groupes de peuples' : 'People groups'}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4 text-center">
                  <Church className="w-6 h-6 text-green-500 mx-auto mb-2" />
                  <p className="text-2xl font-bold text-gray-800">
                    {data.totalChurches}
                  </p>
                  <p className="text-xs text-gray-500">{isFrench ? 'Églises' : 'Churches'}</p>
                </div>
              </div>

              {/* Location Info */}
              {(data.region || data.departement || data.arrondissement) && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="w-4 h-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-700">{isFrench ? 'Localisation' : 'Location'}</span>
                  </div>
                  <div className="text-sm text-gray-600 space-y-1">
                    {data.region && <p>Région: <span className="font-medium">{data.region}</span></p>}
                    {data.departement && <p>Département: <span className="font-medium">{data.departement}</span></p>}
                    {data.arrondissement && <p>Arrondissement: <span className="font-medium">{data.arrondissement}</span></p>}
                  </div>
                </div>
              )}

              {/* Status Breakdown */}
              <div>
                <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Répartition par statut
                </h3>
                <div className="space-y-2">
                  {Object.entries(data.statusBreakdown).map(([status, count]) => {
                    const percentage = data.percentages[status] || 0
                    return (
                      <div key={status} className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: STATUS_COLORS[status] }}
                        />
                        <span className="text-sm text-gray-600 w-24">
                          {STATUS_LABELS[status]}
                        </span>
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div 
                            className="h-2 rounded-full transition-all"
                            style={{ 
                              width: `${percentage}%`,
                              backgroundColor: STATUS_COLORS[status]
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-gray-800 w-16 text-right">
                          {count} ({percentage}%)
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* People Groups List */}
              {data.peopleGroups && data.peopleGroups.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">
                    {isFrench ? 'Groupes de peuples' : 'People groups'} ({data.peopleGroups.length})
                  </h3>
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {data.peopleGroups.map((pg, index) => (
                      <div 
                        key={pg._id || index}
                        className="flex items-center justify-between p-2 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-2">
                          <div 
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: STATUS_COLORS[pg.status] || STATUS_COLORS.unreached }}
                          />
                          <span className="text-sm font-medium text-gray-800">{pg.name}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          {pg.population > 0 && (
                            <span>{pg.population.toLocaleString()} hab.</span>
                          )}
                          {pg.churches > 0 && (
                            <span>{pg.churches} égl.</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

export default VillageDetailsModal
