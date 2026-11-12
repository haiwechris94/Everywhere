import { useState } from 'react'
import { useLanguage } from '../../i18n'

const MapLegend = ({ items = [], className = '' }) => {
  const { t } = useLanguage()
  const [isExpanded, setIsExpanded] = useState(false)

  // NEW COLOR SYSTEM: Orange=Pioneer, Yellow=Midway, Light Green=Tipping Point, Dark Green=DMM
  const defaultItems = [
    { color: 'bg-red-500', labelKey: 'unreached', label: 'Unreached' },
    { color: 'bg-orange-500', labelKey: 'pioneer', label: 'Pioneer' },
    { color: 'bg-yellow-500', labelKey: 'midway', label: 'Midway' },
    { color: 'bg-emerald-500', labelKey: 'tippingPoint', label: 'Tipping Point' },
    { color: 'bg-green-700', labelKey: 'dmm', label: 'DMM (Reached)' },
  ]

  // Data source indicators
  const dataSourceItems = [
    { icon: '📍', label: 'Données DMM', description: 'DMM data' },
    { icon: '💎', label: 'Joshua Project', description: 'Joshua Project data' },
  ]

  const legendItems = items.length > 0 ? items : defaultItems

  const handleToggle = () => {
    setIsExpanded(!isExpanded)
  }

  return (
    <div className={`absolute bottom-4 left-4 z-[1000] bg-white rounded-lg shadow-lg overflow-hidden ${className}`}>
      {/* Clickable Header */}
      <button
        onClick={handleToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors duration-200 dark:hover:bg-slate-700"
      >
        <h4 className="text-sm font-semibold text-gray-800 dark:text-slate-100">
          {t('map.legend.title')}
        </h4>
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-300 ${
            isExpanded ? 'rotate-0' : '-rotate-90'
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Collapsible Content */}
      <div
        className={`transition-all duration-300 ease-in-out ${
          isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-3 pb-3 space-y-3">
          {/* Church Planting Stages */}
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('map.legend.stages') || 'Stages'}
            </div>
            {legendItems.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${item.color}`}></span>
                <span className="text-sm text-gray-600 dark:text-slate-300">
                  {item.label || t(`map.legend.${item.labelKey}`)}
                </span>
              </div>
            ))}
          </div>

          {/* Data Sources */}
          <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-slate-700">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {t('map.legend.dataSources') || 'Data Sources'}
            </div>
            {dataSourceItems.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="text-base">{item.icon}</span>
                <span className="text-sm text-gray-600 dark:text-slate-300">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MapLegend