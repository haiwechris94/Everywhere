import React, { useState } from 'react'
import { TileLayer } from 'react-leaflet'
import { Layers, Sun, Moon, Mountain } from 'lucide-react'

/**
 * Modern tile layer configuration. Default = CartoDB Positron (light, clean).
 * Tiles are intentionally subdued so colored markers/clusters pop.
 */
export const TILE_PROVIDERS = {
  positron: {
    key: 'positron',
    icon: Sun,
    labelKey: 'map.layers.positron',
    fallbackLabel: 'Light',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  darkMatter: {
    key: 'darkMatter',
    icon: Moon,
    labelKey: 'map.layers.darkMatter',
    fallbackLabel: 'Dark',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  },
  terrain: {
    key: 'terrain',
    icon: Mountain,
    labelKey: 'map.layers.terrain',
    fallbackLabel: 'Terrain',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution:
      'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> contributors, SRTM | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a>',
    subdomains: 'abc',
    maxZoom: 17,
  },
}

/**
 * <ModernTileLayer> – wraps react-leaflet TileLayer and reacts to the active key.
 * Use a `key` prop tied to the provider key so Leaflet replaces the layer cleanly.
 */
export const ModernTileLayer = ({ providerKey = 'positron' }) => {
  const cfg = TILE_PROVIDERS[providerKey] || TILE_PROVIDERS.positron
  return (
    <TileLayer
      key={cfg.key}
      url={cfg.url}
      attribution={cfg.attribution}
      subdomains={cfg.subdomains}
      maxZoom={cfg.maxZoom}
    />
  )
}

/**
 * Floating tile-layer switcher control (small icon group on the map).
 * Positioned outside the map by the parent (so it can use Tailwind freely).
 */
const TileLayerSwitcher = ({ value = 'positron', onChange, t }) => {
  const [open, setOpen] = useState(false)
  const current = TILE_PROVIDERS[value] || TILE_PROVIDERS.positron
  const CurrentIcon = current.icon

  const label = (provider) => {
    const fromI18n = t ? t(provider.labelKey) : null
    return fromI18n && fromI18n !== provider.labelKey ? fromI18n : provider.fallbackLabel
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="bg-white rounded-lg shadow-md border border-neutral-100 p-2.5 hover:bg-neutral-50 transition-all flex items-center gap-1.5"
        title={t ? t('map.controls.layers') || 'Layers' : 'Layers'}
        aria-label="Tile layer switcher"
      >
        <Layers size={18} className="text-neutral-600" />
        <CurrentIcon size={14} className="text-neutral-500 hidden sm:block" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1.5 w-40 bg-white rounded-xl shadow-xl border border-neutral-100 overflow-hidden z-[1003]">
          {Object.values(TILE_PROVIDERS).map((p) => {
            const Icon = p.icon
            const active = p.key === value
            return (
              <button
                key={p.key}
                onClick={() => {
                  onChange(p.key)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors ${
                  active
                    ? 'bg-primary-50 text-primary-700 font-semibold'
                    : 'text-neutral-700 hover:bg-neutral-50'
                }`}
              >
                <Icon size={14} className={active ? 'text-primary-600' : 'text-neutral-400'} />
                <span className="flex-1">{label(p)}</span>
                {active && <span className="w-1.5 h-1.5 rounded-full bg-primary-600" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default TileLayerSwitcher
