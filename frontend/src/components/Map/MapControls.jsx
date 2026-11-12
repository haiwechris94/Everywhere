import React from 'react'
import { Maximize2, Locate, Plus, Minus } from 'lucide-react'
import { useMap } from 'react-leaflet'
import { useLanguage } from '../../i18n'

/**
 * Modern map controls — floating right-side stack.
 * Replaces leaflet's default zoom control with cleaner Tailwind buttons.
 *
 * Props:
 *   onFitData: () => void
 *   onLocateMe: () => void
 *   className: optional positioning override
 */
const MapControls = ({ onFitData, onLocateMe, className = '' }) => {
  const map = useMap()
  const { t } = useLanguage()
  const tx = (k, fb) => {
    const v = t(k)
    return v && v !== k ? v : fb
  }

  const stop = (e) => {
    e.stopPropagation()
    if (e.preventDefault) e.preventDefault()
  }

  return (
    <div
      className={`absolute right-4 top-1/2 -translate-y-1/2 z-[1000] flex flex-col gap-2 ${className}`}
      onMouseDown={stop}
      onDoubleClick={stop}
      onWheel={stop}
    >
      {/* Zoom group */}
      <div className="bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200 overflow-hidden flex flex-col">
        <button aria-label={tx('map.controls.zoomIn', 'Zoom in')}
          type="button"
          onClick={() => map.zoomIn()}
          title={tx('map.controls.zoomIn', 'Zoom in')}
          className="w-9 h-9 flex items-center justify-center text-neutral-700 hover:bg-primary-50 hover:text-primary-700 transition-colors border-b border-neutral-100"
        >
          <Plus size={16} />
        </button>
        <button aria-label={tx('map.controls.zoomOut', 'Zoom out')}
          type="button"
          onClick={() => map.zoomOut()}
          title={tx('map.controls.zoomOut', 'Zoom out')}
          className="w-9 h-9 flex items-center justify-center text-neutral-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
        >
          <Minus size={16} />
        </button>
      </div>

      {/* Fit-to-data */}
      {onFitData && (
        <button aria-label={tx('map.modernControls.fitToData', 'Fit to data')}
          type="button"
          onClick={onFitData}
          title={tx('map.modernControls.fitToData', 'Fit to data')}
          className="w-9 h-9 flex items-center justify-center bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200 text-neutral-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
        >
          <Maximize2 size={15} />
        </button>
      )}

      {/* Locate me */}
      {onLocateMe && (
        <button aria-label={tx('map.modernControls.locateMe', 'Locate me')}
          type="button"
          onClick={onLocateMe}
          title={tx('map.modernControls.locateMe', 'Locate me')}
          className="w-9 h-9 flex items-center justify-center bg-white/95 backdrop-blur-sm rounded-xl shadow-lg border border-neutral-200 text-neutral-700 hover:bg-primary-50 hover:text-primary-700 transition-colors"
        >
          <Locate size={15} />
        </button>
      )}
    </div>
  )
}

export default MapControls
