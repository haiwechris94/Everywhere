import { useMemo, memo } from 'react'
import { Marker } from 'react-leaflet'
import L from 'leaflet'

/**
 * DmmVillageLayer — renders the DMM engagement "village" sub-points.
 *
 * These are ADDITIONAL, intentionally SMALL points that sit alongside the ONE
 * main MasterPeopleLayer marker per people (the people's "fief"). At a glance:
 *   ● big filled dot (MasterPeopleLayer) = the people's fief / stronghold
 *   ○ small hollow ring (this layer)     = a village where that people is engaged
 *
 * Data comes from GET /api/master-people/map/dmm-villages
 * (each: { id, masterPeopleId, name, villageName, coordinates:[lng,lat],
 *          engagementStatus, numberOfChurches, churchGeneration, region }).
 *
 * @param {Array}   villages  village sub-points from the API
 * @param {boolean} visible   whether to render the layer (default true)
 */

// Mirror of UnifiedMapView's STATUS_COLORS_FILL (DMM engagement vocabulary).
const STATUS_COLORS_FILL = {
  'dmm':            { fill: '#15803d', stroke: '#166534', label: 'Mouvement' },
  'tipping-point':  { fill: '#22c55e', stroke: '#16a34a', label: 'Basculement' },
  'midway':         { fill: '#eab308', stroke: '#ca8a04', label: 'Mi-parcours' },
  'pioneer':        { fill: '#f97316', stroke: '#ea580c', label: 'Pionnier' },
  'unreached':      { fill: '#ef4444', stroke: '#dc2626', label: 'Non-atteint' },
  'unknown':        { fill: '#e5e7eb', stroke: '#d1d5db', label: 'Inconnu' },
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))

// PERF: cache one L.divIcon per status so we don't rebuild an icon per marker.
const iconCache = {}
function villageIcon(status) {
  const key = status || 'unknown'
  if (iconCache[key]) return iconCache[key]
  const cfg = STATUS_COLORS_FILL[key] || STATUS_COLORS_FILL.unknown
  // Small (~7px) hollow ring: status color as border + semi-transparent fill.
  // Deliberately distinct from the 12px solid white-bordered "fief" markers.
  const icon = L.divIcon({
    className: 'dmm-village-marker',
    html: `<div style="width:7px;height:7px;border-radius:50%;background:${cfg.fill}59;border:2px solid ${cfg.stroke};box-shadow:0 1px 2px rgba(0,0,0,.35);"></div>`,
    iconSize: [11, 11],
    iconAnchor: [5.5, 5.5],
    popupAnchor: [0, -6],
  })
  iconCache[key] = icon
  return icon
}

function DmmVillageLayer({ villages = [], visible = true }) {
  const points = useMemo(
    () =>
      (villages || []).filter(
        (v) => v && Array.isArray(v.coordinates) && v.coordinates.length === 2,
      ),
    [villages],
  )

  if (!visible) return null

  return (
    <>
      {points.map((v) => {
        const [lng, lat] = v.coordinates // API returns GeoJSON [lng, lat]
        const status = v.engagementStatus || 'unknown'
        const cfg = STATUS_COLORS_FILL[status] || STATUS_COLORS_FILL.unknown
        return (
          <Marker
            key={v.id}
            position={[lat, lng]}
            icon={villageIcon(status)}
            eventHandlers={{
              // PERF: bind tooltip lazily on hover instead of mounting a
              // <Tooltip> element per village marker.
              mouseover: (e) => {
                const layer = e.target
                if (!layer._ttBound) {
                  const people = escapeHtml(v.name || '—')
                  const village = escapeHtml(v.villageName || '—')
                  const churches = Number(v.numberOfChurches) || 0
                  layer.bindTooltip(
                    `<div style="font-size:12px;line-height:1.4;min-width:140px">
                      <strong>${people}</strong> — ${village}<br/>
                      <span style="display:inline-flex;align-items:center;gap:4px;color:${cfg.fill};font-weight:600">
                        <span style="display:inline-block;width:8px;height:8px;border-radius:50%;border:2px solid ${cfg.stroke};background:${cfg.fill}59"></span>
                        ${escapeHtml(cfg.label)}
                      </span><br/>
                      <span style="color:#6b7280">⛪ ${churches} église${churches > 1 ? 's' : ''}</span>
                    </div>`,
                    { direction: 'top', offset: [0, -6], opacity: 0.95 },
                  )
                  layer._ttBound = true
                }
                layer.openTooltip()
              },
            }}
          />
        )
      })}
    </>
  )
}

// PERF: memoized so parent state changes (selection/detail panel) don't rebuild
// every village marker; only a change to the villages list re-renders.
export default memo(DmmVillageLayer)
