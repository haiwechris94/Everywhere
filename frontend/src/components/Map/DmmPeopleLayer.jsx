import { useMemo, memo } from 'react'
import { Marker, Popup, Tooltip } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useNavigate } from 'react-router-dom'
import L from 'leaflet'

/**
 * DmmPeopleLayer — renders DMM peoples as a SEPARATE map layer.
 *
 * These points are intentionally DISTINCT from the JP / IMB unified markers
 * (round dots in MasterPeopleLayer): DMM peoples are drawn as green diamonds so
 * they stand apart at a glance. Clicking one opens a popup with the essential
 * details plus a button that navigates to the people sheet under
 *   /regions/:regionId/countries/:countryCode2/peoples/:id
 * (Regions → country → people funnel).
 *
 * Data comes from GET /api/master-people/map/dmm-peoples — each point:
 *   { id, name, coordinates:[lng,lat], countryCode2, countryCode3, regionId,
 *     status, dmmStatus, population, engagementCount, totalChurches,
 *     maxGeneration, villagesTouched, region, department, subdivision,
 *     language, religion }
 *
 * @param {Array}   peoples  DMM people points from the API
 * @param {boolean} visible  whether to render the layer (default true)
 */

// DMM engagement status palette (mirrors the DMM vocabulary used elsewhere).
const DMM_STATUS_COLORS = {
  'dmm': { fill: '#15803d', label: 'Mouvement' },
  'tipping-point': { fill: '#22c55e', label: 'Basculement' },
  'midway': { fill: '#eab308', label: 'Mi-parcours' },
  'pioneer': { fill: '#f97316', label: 'Pionnier' },
  'unreached': { fill: '#ef4444', label: 'Non-atteint' },
  'unknown': { fill: '#6366f1', label: 'Inconnu' },
}

// PERF: cache one L.divIcon per status so we don't rebuild an icon per marker.
const iconCache = {}
function dmmIcon(status, approximate = false) {
  const key = `${status || 'unknown'}${approximate ? '~approx' : ''}`
  if (iconCache[key]) return iconCache[key]
  const cfg = DMM_STATUS_COLORS[status || 'unknown'] || DMM_STATUS_COLORS.unknown
  // A rotated square (diamond) with a white border — deliberately different from
  // the round JP/IMB dots so the DMM layer is visually separable.
  // Approximate points (snapped to an admin-unit centroid because the engagement
  // has no exact coordinates) are drawn hollow with a dashed border so users can
  // tell them apart from precisely-located ones.
  const html = approximate
    ? `<div style="width:9px;height:9px;background:${cfg.fill}33;border:2px dashed ${cfg.fill};box-shadow:0 1px 2px rgba(0,0,0,.35);transform:rotate(45deg);"></div>`
    : `<div style="width:9px;height:9px;background:${cfg.fill};border:2px solid #fff;box-shadow:0 1px 2px rgba(0,0,0,.5);transform:rotate(45deg);"></div>`
  const icon = L.divIcon({
    className: 'dmm-people-marker',
    html,
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -7],
  })
  iconCache[key] = icon
  return icon
}

const fmt = (v) => (v === null || v === undefined || v === '' ? '—' : v)
const fmtNum = (v) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : fmt(v))

function DmmPopupContent({ p }) {
  const navigate = useNavigate()
  const cfg = DMM_STATUS_COLORS[p.dmmStatus] || DMM_STATUS_COLORS.unknown

  // Navigation target: Regions → country → people. Requires regionId + alpha-2.
  // The people sheet is keyed by the MASTER people id; fall back to the point id
  // for the legacy master-people layer where `id` already is the master id.
  const peopleSheetId = p.masterPeopleId || p.id
  const canNavigate = !!(p.regionId && p.countryCode2 && peopleSheetId)
  const goToSheet = () => {
    if (!canNavigate) return
    navigate(`/regions/${p.regionId}/countries/${p.countryCode2}/peoples/${peopleSheetId}`)
  }

  // "nom de l'engagement, Village" — same convention as the Villages/DMM layer.
  const heading = p.label || (p.villageName ? `${p.name}, ${p.villageName}` : p.name)

  return (
    <div style={{ minWidth: 147, fontSize: 9, lineHeight: 1.4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
        <span style={{ width: 7, height: 7, background: cfg.fill, transform: 'rotate(45deg)', display: 'inline-block' }} />
        <strong style={{ fontSize: 10 }}>{fmt(heading)}</strong>
      </div>
      <div style={{ color: '#6b7280', marginBottom: 4 }}>
        {[fmt(p.region), fmt(p.department)].filter((x) => x && x !== '—').join(' · ') || 'DMM'}
      </div>
      {p.approximate && (
        <div style={{ color: '#b45309', background: '#fef3c7', borderRadius: 4, padding: '2px 5px', marginBottom: 4, fontSize: 8.5 }}>
          📍 Localisation approximative (centroïde de la zone administrative)
        </div>
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          <tr><td style={{ color: '#6b7280', paddingRight: 8 }}>Statut DMM</td><td style={{ textAlign: 'right', fontWeight: 600, color: cfg.fill }}>{cfg.label}</td></tr>
          <tr><td style={{ color: '#6b7280' }}>Engagements</td><td style={{ textAlign: 'right' }}>{fmtNum(p.engagementCount)}</td></tr>
          <tr><td style={{ color: '#6b7280' }}>Églises</td><td style={{ textAlign: 'right' }}>{fmtNum(p.totalChurches)}</td></tr>
          <tr><td style={{ color: '#6b7280' }}>Génération max</td><td style={{ textAlign: 'right' }}>{fmtNum(p.maxGeneration)}</td></tr>
          <tr><td style={{ color: '#6b7280' }}>Villages touchés</td><td style={{ textAlign: 'right' }}>{fmtNum(p.villagesTouched)}</td></tr>
          {p.population ? (
            <tr><td style={{ color: '#6b7280' }}>Population</td><td style={{ textAlign: 'right' }}>{fmtNum(p.population)}</td></tr>
          ) : null}
        </tbody>
      </table>

      <button
        type="button"
        onClick={goToSheet}
        disabled={!canNavigate}
        style={{
          marginTop: 7,
          width: '100%',
          padding: '5px 7px',
          borderRadius: 6,
          border: 'none',
          background: canNavigate ? '#4f46e5' : '#c7c7c7',
          color: '#fff',
          fontWeight: 600,
          fontSize: 9,
          cursor: canNavigate ? 'pointer' : 'not-allowed',
        }}
        title={canNavigate ? 'Ouvrir la fiche du peuple' : 'Fiche indisponible (pays/région non résolus)'}
      >
        Voir la fiche du peuple →
      </button>
    </div>
  )
}

function DmmPeopleLayer({ peoples = [], visible = true }) {
  const points = useMemo(
    () =>
      (peoples || []).filter(
        (p) => p && Array.isArray(p.coordinates) && p.coordinates.length === 2,
      ),
    [peoples],
  )

  if (!visible) return null

  return (
    // Regroupement (clustering) des engagements DMM au dézoom, avec le nombre
    // affiché dans le cercle — même comportement que la couche JP/IMB
    // (MasterPeopleLayer). La clé force la reconstruction du groupe quand la
    // liste de points change.
    <MarkerClusterGroup
      key={`dmm-cluster-${points.length}`}
      chunkedLoading
      maxClusterRadius={50}
      disableClusteringAtZoom={9}
      spiderfyOnMaxZoom
    >
      {points.map((p) => {
        const [lng, lat] = p.coordinates // API returns GeoJSON [lng, lat]
        // "nom de l'engagement, Village". Le label N'EST PLUS permanent sur la
        // carte (trop encombrant) : il est affiché dans la liste du filtre
        // latéral. Ici on ne le montre qu'au survol (tooltip non permanent).
        const label = p.label || (p.villageName ? `${p.name}, ${p.villageName}` : p.name)
        return (
          <Marker key={p.id} position={[lat, lng]} icon={dmmIcon(p.dmmStatus, p.approximate)}>
            <Tooltip
              direction="right"
              offset={[8, 0]}
              className="dmm-engagement-label"
              opacity={0.95}
            >
              {label}
            </Tooltip>
            <Popup>
              <DmmPopupContent p={p} />
            </Popup>
          </Marker>
        )
      })}
    </MarkerClusterGroup>
  )
}

export default memo(DmmPeopleLayer)
