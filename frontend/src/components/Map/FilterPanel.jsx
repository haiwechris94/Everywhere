import React, { useState, useMemo } from 'react'
import { Search, ChevronDown, ChevronUp, Filter, X } from 'lucide-react'
import { useLanguage } from '../../i18n'

const STATUS_OPTIONS = [
  { key: 'unreached',     color: '#dc2626', labelKey: 'peopleMap.status.unreached',    fallback: 'Unreached' },
  { key: 'pioneer',       color: '#f97316', labelKey: 'peopleMap.status.pioneer',      fallback: 'Pioneer' },
  { key: 'mid-journey',   color: '#eab308', labelKey: 'peopleMap.status.midway',       fallback: 'Mid-journey' },
  { key: 'tipping-point', color: '#10b981', labelKey: 'peopleMap.status.tippingPoint', fallback: 'Tipping point' },
  { key: 'movement',      color: '#15803d', labelKey: 'peopleMap.status.dmm',          fallback: 'DMM' },
]

const SOURCE_OPTIONS = [
  { key: 'dmm',            labelKey: 'map.sources.dmm',           fallback: 'DMM' },
  { key: 'survey',         labelKey: 'map.sources.survey',        fallback: 'Survey' },
  { key: 'joshua-project', labelKey: 'map.sources.joshuaProject', fallback: 'Joshua Project' },
  { key: 'imb',            labelKey: 'map.sources.imb',           fallback: 'IMB / PeopleGroups.org', color: '#10b981' },
  { key: 'ftt',            labelKey: 'map.sources.ftt',           fallback: 'Finishing the Task',     color: '#8b5cf6' },
]

/**
 * FilterPanel – floating top-left foldable card with:
 *  - search box
 *  - status checkboxes
 *  - source checkboxes
 *  - country selector
 *
 * Props:
 *  search, onSearchChange
 *  statusFilter (Set or Array of status keys), onStatusToggle(statusKey)
 *  sourceFilter ({dmm, survey, joshuaProject, imb, ftt} booleans), onSourceToggle(sourceKey)
 *  country (string), onCountryChange(country)
 *  countries (array of strings)
 *  onClearAll
 */
const FilterPanel = ({
  search = '',
  onSearchChange,
  statusFilter = new Set(),
  onStatusToggle,
  sourceFilter = { dmm: true, survey: true, joshuaProject: true, imb: true, ftt: true },
  onSourceToggle,
  country = '',
  onCountryChange,
  countries = [],
  onClearAll,
}) => {
  const { t } = useLanguage()
  const [collapsed, setCollapsed] = useState(false)

  const tx = (key, fb) => {
    const v = t(key)
    return v && v !== key ? v : fb
  }

  const statusSet = useMemo(
    () => (statusFilter instanceof Set ? statusFilter : new Set(statusFilter || [])),
    [statusFilter]
  )

  const activeCount =
    (search ? 1 : 0) +
    statusSet.size +
    Object.values(sourceFilter || {}).filter((v) => !v).length +
    (country ? 1 : 0)

  return (
    <div className="absolute top-4 left-4 z-[1000] w-72 max-w-[85vw] bg-white/95 backdrop-blur rounded-xl shadow-xl border border-neutral-100 overflow-hidden">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-neutral-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Filter size={14} className="text-primary-600" />
          <span className="text-[11px] font-bold tracking-wider uppercase text-neutral-700">
            {tx('map.filtersPanel.title', 'Filters')}
          </span>
          {activeCount > 0 && (
            <span className="bg-primary-100 text-primary-700 rounded-full px-1.5 py-0.5 text-[9px] font-bold">
              {activeCount}
            </span>
          )}
        </div>
        {collapsed ? (
          <ChevronDown size={14} className="text-neutral-400" />
        ) : (
          <ChevronUp size={14} className="text-neutral-400" />
        )}
      </button>

      {!collapsed && (
        <div className="px-3 pb-3 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange?.(e.target.value)}
              placeholder={tx('map.filtersPanel.searchPlaceholder', 'Search peoples...')}
              className="w-full pl-7 pr-7 py-1.5 text-xs bg-neutral-50 border border-neutral-200 rounded-lg focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:outline-none transition-all"
            />
            {search && (
              <button
                onClick={() => onSearchChange?.('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
              >
                <X size={12} />
              </button>
            )}
          </div>

          {/* Status checkboxes */}
          <div>
            <div className="text-[9px] font-bold tracking-wider uppercase text-neutral-500 mb-1.5">
              {tx('map.filtersPanel.status', 'Status')}
            </div>
            <div className="space-y-1">
              {STATUS_OPTIONS.map((s) => {
                const checked = statusSet.size === 0 || statusSet.has(s.key)
                return (
                  <label
                    key={s.key}
                    className="flex items-center gap-2 cursor-pointer text-[11px] text-neutral-700 hover:bg-neutral-50 rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onStatusToggle?.(s.key)}
                      className="w-3.5 h-3.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-400 focus:ring-offset-0"
                    />
                    <span
                      className="w-2.5 h-2.5 rounded-full ring-1 ring-white shadow-sm"
                      style={{ backgroundColor: s.color }}
                    />
                    <span className="flex-1">{tx(s.labelKey, s.fallback)}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Source checkboxes */}
          <div>
            <div className="text-[9px] font-bold tracking-wider uppercase text-neutral-500 mb-1.5">
              {tx('map.filtersPanel.source', 'Source')}
            </div>
            <div className="space-y-1">
              {SOURCE_OPTIONS.map((src) => {
                // sourceFilter uses key 'joshuaProject' for source 'joshua-project'
                const stateKey = src.key === 'joshua-project' ? 'joshuaProject' : src.key
                const checked = !!sourceFilter?.[stateKey]
                return (
                  <label
                    key={src.key}
                    className="flex items-center gap-2 cursor-pointer text-[11px] text-neutral-700 hover:bg-neutral-50 rounded px-1 py-0.5"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onSourceToggle?.(stateKey)}
                      className="w-3.5 h-3.5 rounded border-neutral-300 text-primary-600 focus:ring-primary-400 focus:ring-offset-0"
                    />
                    {src.color && (
                      <span
                        className="w-2.5 h-2.5 rounded-full ring-1 ring-white shadow-sm"
                        style={{ backgroundColor: src.color }}
                      />
                    )}
                    <span className="flex-1">{tx(src.labelKey, src.fallback)}</span>
                  </label>
                )
              })}
            </div>
          </div>

          {/* Country */}
          {countries.length > 0 && (
            <div>
              <div className="text-[9px] font-bold tracking-wider uppercase text-neutral-500 mb-1.5">
                {tx('map.filtersPanel.country', 'Country')}
              </div>
              <select
                value={country}
                onChange={(e) => onCountryChange?.(e.target.value)}
                className="w-full text-xs bg-neutral-50 border border-neutral-200 rounded-lg px-2 py-1.5 focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-100 focus:outline-none"
              >
                <option value="">{tx('map.filtersPanel.allCountries', 'All countries')}</option>
                {countries.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activeCount > 0 && (
            <button
              onClick={onClearAll}
              className="w-full text-[10px] font-semibold text-neutral-500 hover:text-neutral-800 py-1 transition-colors"
            >
              {tx('map.filtersPanel.clearAll', 'Clear all filters')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default FilterPanel
