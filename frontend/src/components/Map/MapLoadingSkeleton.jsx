import React from 'react'
import { useLanguage } from '../../i18n'

/**
 * MapLoadingSkeleton – subtle overlay shown while map data is loading.
 * Uses Tailwind animate-pulse + a small spinner.
 */
const MapLoadingSkeleton = ({ visible = true }) => {
  const { t } = useLanguage()
  const tx = (k, fb) => {
    const v = t(k)
    return v && v !== k ? v : fb
  }

  if (!visible) return null

  return (
    <div className="absolute inset-0 z-[900] pointer-events-none flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] animate-pulse" />

      {/* Center card */}
      <div className="relative pointer-events-auto bg-white/95 shadow-xl border border-neutral-200 rounded-2xl px-5 py-4 flex items-center gap-3 dark:border-slate-700">
        <div className="relative">
          <div className="w-8 h-8 rounded-full border-2 border-primary-100 dark:border-primary-800" />
          <div className="absolute inset-0 w-8 h-8 rounded-full border-2 border-primary-600 border-t-transparent animate-spin" />
        </div>
        <div>
          <div className="text-sm font-semibold text-neutral-800 dark:text-slate-100">
            {tx('map.loading.title', 'Loading map data')}
          </div>
          <div className="text-xs text-neutral-500 mt-0.5">
            {tx('map.loading.subtitle', 'Fetching peoples and locations…')}
          </div>
        </div>
      </div>
    </div>
  )
}

export default MapLoadingSkeleton
