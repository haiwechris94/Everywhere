import { useMemo, memo } from 'react'
import { Marker } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import L from 'leaflet'

/**
 * MasterPeopleLayer — renders ONE marker per canonical "master people".
 *
 * Visibility rule (see docs/architecture/07-map-architecture.md):
 *   A marker is shown when ANY of its sources is active. Turning off a single
 *   source (e.g. JP) only hides that source's attributes in the detail panel;
 *   the marker itself stays as long as another active source remains, and only
 *   disappears when ALL of its sources are toggled off.
 *
 * @param {Array}  markers        markers from GET /api/master-people/map/markers
 *                                (each: { id, name, rop3, coordinates:[lng,lat],
 *                                 sourceTypes:[], status, country, population })
 * @param {Set}    activeSources  currently-enabled source types
 * @param {Func}   onSelect       called with the marker on click
 */
const STATUS_COLORS = {
  UNREACHED: '#ef4444',         // red
  FRONTIER: '#b91c1c',          // dark red
  MINIMALLY_REACHED: '#f97316', // orange
  REACHED: '#15803d',           // green
  UNKNOWN: '#9ca3af',           // gray
}

const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))

const iconCache = {}
function dotIcon(color, multiSource) {
  const key = `${color}-${multiSource ? 1 : 0}`
  if (iconCache[key]) return iconCache[key]
  // Multi-source (merged JP+CPPI+…) markers get an extra ring to stand out.
  const ring = multiSource
    ? `box-shadow:0 0 0 2px #fff, 0 0 0 4px ${color};`
    : 'box-shadow:0 1px 3px rgba(0,0,0,.45);'
  const icon = L.divIcon({
    className: 'master-people-marker',
    html: `<div style="background:${color};width:12px;height:12px;border-radius:50%;border:2px solid #fff;${ring}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  })
  iconCache[key] = icon
  return icon
}

function MasterPeopleLayer({ markers = [], activeSources, onSelect }) {
  const active = activeSources instanceof Set ? activeSources : new Set(activeSources || [])

  const visible = useMemo(() => {
    return markers.filter((m) => {
      if (!m || !Array.isArray(m.coordinates) || m.coordinates.length !== 2) return false
      const types = m.sourceTypes || []
      if (types.length === 0) return active.size > 0 // no source info -> show if anything active
      return types.some((t) => active.has(t))
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, Array.from(active).sort().join(',')])

  return (
    <MarkerClusterGroup
      chunkedLoading
      maxClusterRadius={50}
      disableClusteringAtZoom={9}
      spiderfyOnMaxZoom
    >
      {visible.map((m) => {
        const [lng, lat] = m.coordinates // API returns GeoJSON [lng, lat]
        const color = STATUS_COLORS[m.status] || STATUS_COLORS.UNKNOWN
        const multi = (m.sourceTypes || []).length > 1
        return (
          <Marker
            key={m.id}
            position={[lat, lng]}
            icon={dotIcon(color, multi)}
            eventHandlers={{
              click: () => onSelect && onSelect(m),
              // PERF: bind the tooltip lazily on hover instead of mounting a
              // <Tooltip> React element for every one of the ~20k markers.
              mouseover: (e) => {
                const layer = e.target
                if (!layer._ttBound) {
                  const sources = (m.sourceTypes || []).join(' + ') || '—'
                  layer.bindTooltip(
                    `<div style="font-size:12px;line-height:1.4"><strong>${escapeHtml(m.name)}</strong><br/><span style="color:#6366f1">${escapeHtml(sources)}</span></div>`,
                    { direction: 'top', offset: [0, -6], opacity: 0.95 }
                  )
                  layer._ttBound = true
                }
                layer.openTooltip()
              },
            }}
          />
        )
      })}
    </MarkerClusterGroup>
  )
}

// PERF: memoized so clicking a marker (which updates parent `selected`/detail
// state) does NOT re-render and rebuild all markers. Only a change to the
// markers list or the active-source set triggers a re-render.
export default memo(MasterPeopleLayer)
