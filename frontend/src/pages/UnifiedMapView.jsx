import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, Rectangle, useMap, useMapEvents } from 'react-leaflet'
import { useQuery } from '@tanstack/react-query'
import L from 'leaflet'
import { createPortal } from 'react-dom'
import {
  Loader2, Compass, Eye, Search, Moon, Sun, ChevronLeft, ChevronRight, ChevronDown,
  BarChart3, Users, MapPin, Church, X, Minimize2, Map as MapIcon, Download,
  RotateCcw, Layers, Info,
} from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip } from 'recharts'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import { masterPeopleApi } from '../services/api'
import { reportingApi } from '../services/reportingApi'
import MasterPeopleLayer from '../components/Map/MasterPeopleLayer'
import DmmPeopleLayer from '../components/Map/DmmPeopleLayer'
import { getCountryConfig, SUPPORTED_COUNTRIES } from '../config/supportedCountries'
import { VORONOI_ZOOM_CONFIG, getVoronoiLevelForZoom } from '../config/countryConfig'
import { useLanguage } from '../i18n'

// ── i18n local labels (FR/EN) for the Unified Map UI ─────────────────────────
// Small helper object: pick FR or EN label by current language flag.
const UI_LABELS = {
  title:              { fr: 'Carte unifiée des peuples', en: 'Unified Map of People groups' },
  layers:             { fr: 'Calques',                   en: 'Layers' },
  adminBoundaries:    { fr: 'Limites administratives',   en: 'Admin boundaries' },
  activeSources:      { fr: 'Sources actifs',            en: 'Actives sources' },
  locations:          { fr: 'Lieux',                     en: 'Locations' },
  country:            { fr: 'Pays',                      en: 'Country' },
  allCountries:       { fr: 'Tous les pays',             en: 'All countries' },
  peopleStatus:       { fr: 'Statut des peuples',        en: 'People groups Status' },
  allStatuses:        { fr: 'Tous les statuts',          en: 'All statuses' },
  dmmEngagementStatus:{ fr: "Statut d'engagement DMM",   en: 'DMM Engagement Status' },
  allDmmStatuses:     { fr: 'Tous les statuts DMM',      en: 'All DMM statuses' },
  level:              { fr: 'Niveau',                    en: 'Level' },
}
const uiLabel = (key, isEnglish) => (isEnglish ? UI_LABELS[key].en : UI_LABELS[key].fr)

/**
 * UnifiedMapView — "one people group = one marker" canonical map.
 *
 * Backed by the Master People API (/api/master-people). Joshua Project and
 * IMB/PeopleGroups.org (CPPI) records that describe the same ethnic group are
 * merged into a single marker; the detail panel shows every contributing source.
 * Source toggles hide a source's ATTRIBUTES without removing the marker when
 * another source remains.
 */
const ALL_SOURCES = ['JP', 'CPPI', 'DMM', 'SURVEY']
const SOURCE_LABELS = {
  JP: 'Joshua Project',
  CPPI: 'IMB / PeopleGroups.org',
  DMM: 'DMM',
  SURVEY: 'Survey',
}
const STATUS_LABELS = {
  UNREACHED: 'Non atteint',
  FRONTIER: 'Frontier',
  MINIMALLY_REACHED: 'Peu atteint',
  REACHED: 'Atteint',
  UNKNOWN: 'Inconnu',
}
// Vocabulaire des statuts d'engagement DMM (pour le filtre dédié à la couche DMM).
const DMM_ENGAGEMENT_LABELS = {
  pioneer: 'Pionnier',
  midway: 'Mi-parcours',
  'tipping-point': 'Basculement',
  dmm: 'Mouvement',
  unreached: 'Non-atteint',
  unknown: 'Inconnu',
}
const DMM_ENGAGEMENT_COLORS = {
  pioneer: '#f97316',
  midway: '#eab308',
  'tipping-point': '#22c55e',
  dmm: '#15803d',
  unreached: '#ef4444',
  unknown: '#6366f1',
}
const STATUS_COLORS = {
  UNREACHED: '#ef4444',
  FRONTIER: '#b91c1c',
  MINIMALLY_REACHED: '#f97316',
  REACHED: '#15803d',
  UNKNOWN: '#9ca3af',
}

// ── Coverage mode (mode couverture) — porté depuis MapView.jsx ───────────────
const STATUS_COLORS_FILL = {
  'dmm':            { fill: '#15803d', stroke: '#166534', label: 'Mouvement' },
  'tipping-point':  { fill: '#22c55e', stroke: '#16a34a', label: 'Basculement' },
  'midway':         { fill: '#eab308', stroke: '#ca8a04', label: 'Mi-parcours' },
  'pioneer':        { fill: '#f97316', stroke: '#ea580c', label: 'Pionnier' },
  'unreached':      { fill: '#ef4444', stroke: '#dc2626', label: 'Non-atteint' },
  'unknown':        { fill: '#e5e7eb', stroke: '#d1d5db', label: 'Inconnu' },
}

// Le modèle "master people" utilise UNREACHED/FRONTIER/... — on le convertit
// vers le vocabulaire DMM attendu par STATUS_COLORS_FILL / buildLocalCoverageMap.
const STATUS_TO_COVERAGE = {
  UNREACHED: 'unreached',
  FRONTIER: 'pioneer',
  MINIMALLY_REACHED: 'midway',
  REACHED: 'dmm',
  UNKNOWN: 'unknown',
}

/** Minimal ray-casting point-in-polygon (handles a single ring). */
function pointInRing(point, ring) {
  const [px, py] = point
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect =
      (yi > py) !== (yj > py) &&
      px < ((xj - xi) * (py - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function pointInFeature(lngLat, feature) {
  const geom = feature?.geometry
  if (!geom) return false
  if (geom.type === 'Polygon') {
    return pointInRing(lngLat, geom.coordinates[0])
  }
  if (geom.type === 'MultiPolygon') {
    return geom.coordinates.some(poly => pointInRing(lngLat, poly[0]))
  }
  return false
}

const DMM_PRIORITY = ['dmm', 'tipping-point', 'midway', 'pioneer', 'unreached']

/** Aggregate people into polygons (returns Map<featureIndex, info>). */
function buildLocalCoverageMap(geojson, peoples) {
  const result = new Map()
  if (!geojson?.features?.length || !peoples?.length) return result

  for (const person of peoples) {
    const coords = person?.location?.coordinates
    if (!coords || coords.length < 2) continue
    const lngLat = [coords[0], coords[1]]

    for (let i = 0; i < geojson.features.length; i++) {
      if (!pointInFeature(lngLat, geojson.features[i])) continue

      const existing = result.get(i) || {
        status: 'unknown',
        peopleCount: 0,
        population: 0,
        churches: 0,
        maxGeneration: 0,
        // Population cumulée PAR SOURCE (jamais fusionnée entre sources).
        populationBySource: {},
        peoples: [],
      }
      existing.peopleCount += 1
      existing.population += person.population || 0
      existing.churches += person.numberOfChurches || 0
      // Génération maximale atteinte dans la zone (0 si non renseignée).
      existing.maxGeneration = Math.max(existing.maxGeneration, Number(person.maxGeneration) || 0)
      // Regroupe la population par source (clé lisible : DMM / JP / IMB / …).
      const srcKey = person.sourceGroup || person.source || 'Autre'
      existing.populationBySource[srcKey] = (existing.populationBySource[srcKey] || 0) + (person.population || 0)
      existing.peoples.push({
        name: formatPeopleVillageName(person.name, person.villageName),
        engagementStatus: person.engagementStatus || 'unknown',
        source: person.source || '',
        sourceGroup: person.sourceGroup || (person.source === 'DMM' ? 'DMM' : 'JP/IMB'),
        population: person.population || 0,
        // Infos de navigation vers la fiche du peuple (popup cliquable).
        masterPeopleId: person.masterPeopleId || person.id || null,
        regionId: person.regionId || null,
        countryCode2: person.countryCode2 || null,
        countryCode3: person.countryCode3 || null,
      })

      const newStatus = person.engagementStatus || 'unknown'
      const curIdx = DMM_PRIORITY.indexOf(existing.status)
      const newIdx = DMM_PRIORITY.indexOf(newStatus)
      if (newIdx !== -1 && (curIdx === -1 || newIdx < curIdx)) {
        existing.status = newStatus
      }
      result.set(i, existing)
      break
    }
  }
  return result
}

/** Infer admin level from GADM GID fields, or read explicit admin_level. */
function inferAdminLevel(props = {}) {
  if (props.admin_level != null) return Number(props.admin_level)
  if (!props.GID_2) return 1
  if (!props.GID_3) return 2
  return 3
}

function adminFeatureName(props = {}) {
  const lvl = inferAdminLevel(props)
  if (lvl === 1) return props.NAME_1 || props.name || ''
  if (lvl === 2) return props.NAME_2 || props.name || ''
  return props.NAME_3 || props.name || ''
}

function formatPeopleVillageName(peopleName, villageName) {
  const p = (peopleName || '').trim()
  const v = (villageName || '').trim()
  if (p && v) return `${p}, ${v}`
  return p || v || 'Sans nom'
}

// ─── data files keyed by alpha-3 country code ────────────────────────────────
const COUNTRY_DATA_FILES = {
  CMR: { admin: '/data/Admin123CMR fusionnées.geojson',  villages: '/data/Villages découpés.geojson' },
  CAF: { admin: '/data/CAF_admin123.geojson',            villages: '/data/VCAF_Polygons.geojson' },
  TCD: { admin: '/data/TCD_admin123.geojson',            villages: '/data/VChad_polygons.geojson' },
  GAB: { admin: '/data/GAB_admin123.geojson',            villages: '/data/VGabon_Polygons.geojson' },
  COG: { admin: '/data/Admin123COG fusionnées.geojson',  villages: '/data/VCongoBrazza_Polygons.geojson' },
  COD: { admin: '/data/Admin123COD fusionnées.geojson',  villages: null },
  GNQ: { admin: '/data/Admin123GNQ fusionnées.geojson',  villages: null },
}

// ─── CoverageLevelIndicator (rendered via portal) ────────────────────────────
const LEVEL_BADGE_COLORS = {
  village:        'bg-blue-100 text-blue-700 border-blue-300',
  arrondissement: 'bg-violet-100 text-violet-700 border-violet-300',
  departement:    'bg-emerald-100 text-emerald-700 border-emerald-300',
  region:         'bg-amber-100 text-amber-700 border-amber-300',
}

const CoverageLevelIndicator = ({ level, zoom, visible }) => {
  if (!level) return null
  const cfg = VORONOI_ZOOM_CONFIG[level]
  if (!cfg) return null
  const colors = LEVEL_BADGE_COLORS[level] || 'bg-gray-100 text-gray-700 border-gray-300'
  return createPortal(
    <div
      className={`fixed bottom-20 left-1/2 -translate-x-1/2 z-[1100] flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold shadow-md pointer-events-none select-none backdrop-blur-sm bg-opacity-75 transition-opacity duration-300 ${colors} ${visible ? 'opacity-100' : 'opacity-0'}`}
    >
      <span>{cfg.label}</span>
      <span className="opacity-60 font-normal">zoom {zoom}</span>
    </div>,
    document.body,
  )
}

// ─── CoverageLayer (zoom-aware) ──────────────────────────────────────────────
const CoverageLayer = ({ visible, countryCode, peoples, levelOverride, onPeopleClick }) => {
  const map = useMap()

  // Resolve alpha-2 → alpha-3 for the data file map.
  const code3 = React.useMemo(() => {
    if (!countryCode) return null
    const upper = countryCode.toUpperCase()
    if (upper.length === 3) return upper
    const cfg = getCountryConfig(upper)
    return cfg?.code3 || cfg?.code || null
  }, [countryCode])

  const files = code3 ? COUNTRY_DATA_FILES[code3] : null

  // ── state ───────────────────────────────────────────────────────────────
  const [zoom, setZoom]               = React.useState(() => map.getZoom())
  const [zooming, setZooming]         = React.useState(false)
  const zoomHideTimer                 = React.useRef(null)
  const [adminData, setAdminData]     = React.useState(null)
  const [villageData, setVillageData] = React.useState(null)
  const [voronoiData, setVoronoiData] = React.useState(null)
  const [coverageMap, setCoverageMap] = React.useState(null) // backend (CMR voronoi)
  const [loading, setLoading]         = React.useState(false)
  const [error, setError]             = React.useState(null)

  const layerRef = React.useRef(null)

  // Track zoom changes. The level badge is only shown WHILE zooming, then
  // auto-hides ~900ms after the last zoomend.
  useMapEvents({
    zoomstart() {
      if (zoomHideTimer.current) { clearTimeout(zoomHideTimer.current); zoomHideTimer.current = null }
      setZooming(true)
    },
    zoomend() {
      setZoom(map.getZoom())
      if (zoomHideTimer.current) clearTimeout(zoomHideTimer.current)
      zoomHideTimer.current = setTimeout(() => { setZooming(false); zoomHideTimer.current = null }, 900)
    },
  })

  const level = levelOverride || getVoronoiLevelForZoom(zoom)

  // ── data loading ────────────────────────────────────────────────────────
  React.useEffect(() => {
    if (!visible) return
    setLoading(true)
    setError(null)

    const token = localStorage.getItem('token')
    const headers = token ? { Authorization: `Bearer ${token}` } : {}
    const coverageUrl = `/api/analytics/coverage-voronoi${countryCode ? `?countryCode=${countryCode}` : ''}`

    const tasks = [
      fetch('/data/voronoi.geojson')
        .then(r => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(coverageUrl, { headers })
        .then(r => (r.ok ? r.json() : { coverageMap: {} }))
        .catch(() => ({ coverageMap: {} })),
      files?.admin
        ? fetch(files.admin).then(r => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
      files?.villages
        ? fetch(files.villages).then(r => (r.ok ? r.json() : null)).catch(() => null)
        : Promise.resolve(null),
    ]

    let cancelled = false
    Promise.all(tasks)
      .then(([voronoi, coverage, admin, villages]) => {
        if (cancelled) return
        setVoronoiData(voronoi)
        setCoverageMap(coverage?.coverageMap || {})
        setAdminData(admin)
        setVillageData(villages)
        setLoading(false)
      })
      .catch(err => {
        if (cancelled) return
        setError(err.message)
        setLoading(false)
      })

    return () => { cancelled = true }
  }, [visible, countryCode, files?.admin, files?.villages])

  // ── pick the dataset that matches the current zoom level ───────────────
  const { activeData, nameKey, useApiCoverage } = React.useMemo(() => {
    if (!visible) return { activeData: null, nameKey: null, useApiCoverage: false }

    if (level === 'village') {
      if (villageData?.features?.length) {
        return { activeData: villageData, nameKey: 'name', useApiCoverage: false }
      }
      // Fallback to the small CMR-only voronoi tied to the backend coverage map
      return { activeData: voronoiData, nameKey: 'village_name', useApiCoverage: true }
    }

    if (!adminData?.features?.length) {
      return { activeData: null, nameKey: null, useApiCoverage: false }
    }

    const targetLvl = level === 'arrondissement' ? 3
                    : level === 'departement'    ? 2
                    : 1 // region
    const features = adminData.features.filter(
      f => inferAdminLevel(f.properties) === targetLvl,
    )
    // Fall back to the highest available level if requested level is empty
    // (e.g. CAF/COG/COD/GNQ have no level 3).
    const safeFeatures = features.length
      ? features
      : adminData.features.filter(f => inferAdminLevel(f.properties) === 1)

    return {
      activeData: { type: 'FeatureCollection', features: safeFeatures },
      nameKey: null, // use adminFeatureName()
      useApiCoverage: false,
    }
  }, [visible, level, adminData, villageData, voronoiData])

  // Local coverage aggregation (used whenever we are NOT relying on the API)
  const localCoverage = React.useMemo(() => {
    if (useApiCoverage || !activeData) return null
    return buildLocalCoverageMap(activeData, peoples || [])
  }, [useApiCoverage, activeData, peoples])

  // ── style helper ────────────────────────────────────────────────────────
  const styleFeature = React.useCallback(
    (feature, idx) => {
      let info
      if (useApiCoverage && coverageMap) {
        const name = feature.properties?.[nameKey] || ''
        info = coverageMap[name] || coverageMap[String(name).toLowerCase().trim()]
      } else if (localCoverage) {
        info = localCoverage.get(idx)
      }
      const status = info?.status || 'unknown'
      const cfg    = STATUS_COLORS_FILL[status] || STATUS_COLORS_FILL.unknown
      return {
        fillColor:   cfg.fill,
        fillOpacity: status === 'unknown' ? 0.08 : 0.35,
        color:       '#000000',
        weight:      status === 'unknown' ? 0.5 : 1,
        opacity:     status === 'unknown' ? 0.5 : 0.9,
      }
    },
    [useApiCoverage, coverageMap, localCoverage, nameKey],
  )

  // ── imperative Leaflet layer (avoids GeoJSON re-mount issues on zoom) ──
  React.useEffect(() => {
    if (!map) return

    if (layerRef.current) {
      layerRef.current.remove()
      layerRef.current = null
    }
    if (!visible || !activeData?.features?.length) return

    const feats = activeData.features

    const layer = L.geoJSON(activeData, {
      style: feature => styleFeature(feature, feats.indexOf(feature)),
      onEachFeature: (feature, lyr) => {
        const idx   = feats.indexOf(feature)
        const props = feature.properties || {}
        const name  = nameKey
          ? (props[nameKey] || 'Inconnu')
          : (adminFeatureName(props) || 'Inconnu')

        let info
        if (useApiCoverage && coverageMap) {
          info = coverageMap[name] || coverageMap[String(name).toLowerCase().trim()]
        } else if (localCoverage) {
          info = localCoverage.get(idx)
        }

        const status = info?.status || 'unknown'
        const cfg    = STATUS_COLORS_FILL[status] || STATUS_COLORS_FILL.unknown

        // Sépare les peuples par groupe de source (JP/IMB d'un côté, DMM de l'autre).
        const allPeoples = (info && info.peoples) || []
        const jpImbPeoples = allPeoples.filter((p) => p.sourceGroup !== 'DMM')
        const dmmPeoples   = allPeoples.filter((p) => p.sourceGroup === 'DMM')

        // Liste ordonnée servant de référence pour retrouver le peuple cliqué
        // (index stocké dans data-pi sur chaque nom du popup).
        const orderedPeoples = [...jpImbPeoples, ...dmmPeoples]
        const escAttr = (s) => String(s ?? '').replace(/"/g, '&quot;')

        // Rend une liste de peuples (sans troncature « ... et N autres »)
        // pour un groupe de source donné. Chaque nom est cliquable → fiche.
        const renderPeopleGroup = (title, list) => {
          if (!list || !list.length) return ''
          const rows = list.map((p) => {
            const pCfg = STATUS_COLORS_FILL[p.engagementStatus] || STATUS_COLORS_FILL.unknown
            const pi = orderedPeoples.indexOf(p)
            const canNav = !!(p.masterPeopleId || p.id)
            return `
              <div style="display:flex;align-items:center;gap:6px;font-size:11px;line-height:1.2;">
                <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background-color:${pCfg.fill};flex-shrink:0;"></span>
                <span class="${canNav ? 'cov-people-link' : ''}" data-pi="${pi}" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${canNav ? 'color:#4f46e5;cursor:pointer;text-decoration:underline;' : 'color:#374151;'}" title="${escAttr(p.name)}">${p.name}</span>
              </div>`
          }).join('')
          return `
            <div style="margin-top:6px;">
              <p style="font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.03em;color:#6b7280;margin-bottom:3px;">${title} (${list.length})</p>
              <div style="display:flex;flex-direction:column;gap:3px;">${rows}</div>
            </div>`
        }

        // Population par source (jamais cumulée entre sources).
        const popBySrc = (info && info.populationBySource) || null
        const popRows = popBySrc
          ? Object.entries(popBySrc)
              .filter(([, v]) => v > 0)
              .map(([k, v]) => `<span>Pop ${k}: ${Number(v).toLocaleString('fr-FR')}</span>`)
              .join('')
          : (info && info.population ? `<span>Pop: ${info.population.toLocaleString('fr-FR')}</span>` : '')

        lyr.bindPopup(
          `<div style="min-width:200px;font-family:inherit">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <div style="width:12px;height:12px;border-radius:50%;background:${cfg.fill};flex-shrink:0"></div>
              <strong style="font-size:14px">${name}</strong>
            </div>
            <div style="display:inline-flex;align-items:center;gap:4px;background:${cfg.fill}22;border:1px solid ${cfg.fill}66;border-radius:99px;padding:2px 10px;font-size:11px;font-weight:600;color:${cfg.fill}">
              ${cfg.label}
            </div>
            ${info ? `
              <div style="margin-top:8px;display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:12px;color:#374151">
                <span>👥 ${info.peopleCount} peuple${info.peopleCount > 1 ? 's' : ''}</span>
                ${info.churches ? `<span>⛪ ${info.churches} églises</span>` : ''}
                ${info.maxGeneration ? `<span>🌱 Gén. max : ${info.maxGeneration}</span>` : ''}
                ${popRows}
              </div>
              ${(jpImbPeoples.length || dmmPeoples.length) ? `
                <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e5e7eb;max-height:220px;overflow-y:auto;">
                  ${renderPeopleGroup('Joshua Project / IMB', jpImbPeoples)}
                  ${renderPeopleGroup('DMM', dmmPeoples)}
                </div>
              ` : ''}
              ` : `
              <p style="margin-top:6px;font-size:11px;color:#9ca3af;font-style:italic">
                Aucun peuple DMM enregistré dans cette zone
              </p>`}
          </div>`,
          { maxWidth: 320 },
        )

        // Rend chaque nom de peuple cliquable → navigation vers sa fiche.
        lyr.on('popupopen', (e) => {
          const root = e.popup.getElement()
          if (!root) return
          root.querySelectorAll('.cov-people-link').forEach((el) => {
            el.addEventListener('click', (ev) => {
              ev.stopPropagation()
              const pi = Number(el.getAttribute('data-pi'))
              const person = orderedPeoples[pi]
              if (person && onPeopleClick) onPeopleClick(person)
            })
          })
        })

        lyr.on({
          mouseover: (e) => {
            e.target.setStyle({ fillOpacity: 0.6, weight: 1.5 })
            e.target.bringToFront()
          },
          mouseout: (e) => {
            e.target.setStyle(styleFeature(feature, idx))
          },
        })
      },
    })

    layer.addTo(map)
    layerRef.current = layer

    return () => {
      if (layerRef.current) {
        layerRef.current.remove()
        layerRef.current = null
      }
    }
  }, [map, visible, activeData, styleFeature, useApiCoverage, coverageMap, localCoverage, nameKey, onPeopleClick])

  if (!visible) return null

  return (
    <>
      {loading && createPortal(
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[1002] bg-white rounded-full shadow-lg px-4 py-2 text-xs font-medium text-gray-600 flex items-center gap-2 pointer-events-none">
          <Loader2 size={14} className="animate-spin text-teal-600" />
          Chargement des zones de couverture…
        </div>,
        document.body,
      )}
      {!loading && !error && (
        <CoverageLevelIndicator level={level} zoom={zoom} visible={zooming} />
      )}
    </>
  )
}

// ── FitToFeature ──────────────────────────────────────────────────────────────
// Centre / ajuste la carte sur l'emprise de l'entité admin sélectionnée.
const FitToFeature = ({ feature }) => {
  const map = useMap()
  React.useEffect(() => {
    if (!map || !feature?.geometry) return
    try {
      const layer = L.geoJSON(feature)
      const bounds = layer.getBounds()
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 11, animate: true })
    } catch { /* géométrie invalide : on ignore */ }
  }, [map, feature])
  return null
}

// Trace ORANGE de l'entité administrative sélectionnée (pays / admin 1-2-3).
// Piloté par `selectedAdminFeature` : le tracé suit donc toujours le filtre.
// Couche Leaflet impérative (react-leaflet n'importe pas <GeoJSON> ici).
const SelectionOutline = ({ feature }) => {
  const map = useMap()
  React.useEffect(() => {
    if (!map || !feature?.geometry) return
    let layer
    try {
      layer = L.geoJSON(feature, {
        interactive: false,
        style: { color: '#f97316', weight: 2.5, opacity: 0.95, fill: true, fillColor: '#f97316', fillOpacity: 0.06 },
      })
      layer.addTo(map)
    } catch { /* géométrie invalide : on ignore */ }
    return () => { if (layer) { try { layer.remove() } catch { /* noop */ } } }
  }, [map, feature])
  return null
}

// ── Légende Mode Couverture ───────────────────────────────────────────────────
const CoverageLegend = ({ visible, theme }) => {
  if (!visible) return null
  return (
    <details className={`absolute bottom-20 right-4 z-[1001] rounded-xl shadow-lg p-3 ${panelCls(theme)}`} open>
      <summary className={`cursor-pointer list-none text-[10px] font-bold uppercase tracking-wide mb-2 ${subtleText(theme)}`}>
        Couverture DMM
      </summary>
      {Object.entries(STATUS_COLORS_FILL)
        .filter(([k]) => k !== 'unknown')
        .map(([status, cfg]) => (
          <div key={status} className="flex items-center gap-2 mb-1.5">
            <div className="w-4 h-3 rounded-sm flex-shrink-0" style={{ background: cfg.fill, opacity: 0.85 }} />
            <span className="text-xs">{cfg.label}</span>
          </div>
        ))}
      <div className="flex items-center gap-2 mt-1 pt-1 border-t border-black/10">
        <div className="w-4 h-3 rounded-sm flex-shrink-0 bg-gray-300" />
        <span className={`text-xs ${subtleText(theme)}`}>Non renseigné</span>
      </div>
    </details>
  )
}

// ── Niveaux administratifs (mode couverture) ─────────────────────────────────
const LEVEL_LABELS = {
  region: 'Région',
  departement: 'Département',
  arrondissement: 'Arrondissement',
  village: 'Village',
}

// ── Map Mode Toggle (Terrain / Couverture) ───────────────────────────────────
const MapModeToggle = ({ mode, onChange, theme }) => (
  <div className={`absolute top-3 left-1/2 -translate-x-1/2 z-[1001] flex rounded-full shadow-md p-0.5 gap-0.5 ${panelCls(theme)}`}>
    {[
      { key: 'terrain',   icon: Compass, label: 'Terrain',     active: 'text-teal-700 bg-teal-50' },
      { key: 'coverage',  icon: Eye,     label: 'Couverture',  active: 'text-emerald-700 bg-emerald-50' },
    ].map(({ key, icon: Icon, label, active }) => (
      <button key={key} onClick={() => onChange(key)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
          mode === key ? active + ' shadow-sm' : 'text-neutral-500 hover:bg-neutral-100'
        }`}>
        <Icon size={12} />
        <span className="hidden sm:inline">{label}</span>
      </button>
    ))}
  </div>
)

// ── Utils ────────────────────────────────────────────────────────────────────
const formatCompact = (n) => {
  const num = Number(n) || 0
  if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + ' Md'
  if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + ' M'
  if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + ' k'
  return String(num)
}

// ── Theming ──────────────────────────────────────────────────────────────────
const THEME_TILES = {
  light: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
  dark: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap contributors',
  },
}
const panelCls = (theme) =>
  theme === 'dark'
    ? 'bg-neutral-900/95 text-neutral-100 border border-neutral-700 backdrop-blur'
    : 'bg-white/95 text-gray-800 border border-neutral-100 backdrop-blur'
const subtleText = (theme) => (theme === 'dark' ? 'text-neutral-400' : 'text-gray-500')
const inputCls = (theme) =>
  theme === 'dark'
    ? 'bg-neutral-800 border-neutral-700 text-neutral-100'
    : 'bg-white border-gray-300 text-gray-800'

// ── Search box (peuples) ─────────────────────────────────────────────────────
const SearchBox = ({ markers, onPick, onClear, theme }) => {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const results = useMemo(() => {
    const term = q.trim().toLowerCase()
    if (term.length < 2) return []
    const out = []
    for (const m of markers) {
      if ((m.name || '').toLowerCase().includes(term)) out.push(m)
      if (out.length >= 8) break
    }
    return out
  }, [q, markers])
  return (
    <div className="relative">
      <div className={`flex h-9 items-center gap-2 rounded-full px-3 shadow-md max-w-[16rem] sm:max-w-[20rem] ${panelCls(theme)}`}>
        <Search size={15} className={subtleText(theme)} />
        <input
          value={q}
          onChange={(e) => { const v = e.target.value; setQ(v); setOpen(true); if (v.trim() === '') onClear && onClear() }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder="Rechercher un peuple…"
          className="min-w-0 w-24 bg-transparent text-sm outline-none placeholder:text-neutral-400 sm:w-40"
        />
        {q && (
          <button onMouseDown={() => { setQ(''); setOpen(false); onClear && onClear() }} className={subtleText(theme)}>
            <X size={14} />
          </button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className={`absolute right-0 z-[1200] mt-2 max-h-72 w-64 overflow-y-auto rounded-xl shadow-xl ${panelCls(theme)}`}>
          {results.map((m) => (
            <button
              key={m.id}
              onMouseDown={() => { onPick(m); setQ(m.name); setOpen(false) }}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5"
            >
              <span
                className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                style={{ background: STATUS_COLORS[m.status] || STATUS_COLORS.UNKNOWN }}
              />
              <span className="flex-1 truncate">{m.name}</span>
              <span className={`text-[10px] ${subtleText(theme)}`}>{m.country || ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── KPI cards ────────────────────────────────────────────────────────────────
const KpiCard = ({ icon: Icon, label, value, color, theme }) => (
  <div className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 shadow-sm ${panelCls(theme)}`}>
    <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md" style={{ background: `${color}1a`, color }}>
      <Icon size={13} />
    </div>
    <div className="min-w-0 leading-tight">
      <div className="text-xs font-bold">{value}</div>
      <div className={`text-[9px] uppercase tracking-wide ${subtleText(theme)}`}>{label}</div>
    </div>
  </div>
)

const KpiBar = ({ stats, theme }) => (
  <div className="absolute top-16 right-4 z-[1000] hidden w-[7.5rem] flex-col gap-1.5 sm:flex">
    <KpiCard icon={Users} label="Peuples" value={stats.total.toLocaleString('fr-FR')} color="#6366f1" theme={theme} />
    <KpiCard icon={MapPin} label="Non atteints" value={stats.unreached.toLocaleString('fr-FR')} color="#ef4444" theme={theme} />
    <KpiCard icon={Church} label="Atteints" value={stats.reached.toLocaleString('fr-FR')} color="#15803d" theme={theme} />
    <KpiCard icon={BarChart3} label="Population" value={formatCompact(stats.population)} color="#0ea5e9" theme={theme} />
  </div>
)

// ── DMM engagement indicators (counts by stage, filter-aware, clickable) ─────
// The four DMM stages. `key` matches the raw `p.dmmStatus` value AND the
// dmmStatusFilter <select> values ('dmm' = Movement), so a click toggles the
// same filter used by the sidebar select.
// Couleurs ALIGNÉES sur la légende « Couverture DMM » (STATUS_COLORS_FILL) pour
// que le tableau des indicateurs DMM et la légende soient cohérents. On ajoute
// aussi les étapes « Non-atteint » et « Non renseigné » présentes dans la légende.
const DMM_STAGE_META = [
  { key: 'pioneer',        label: 'Pionnier',      color: '#f97316' },
  { key: 'midway',         label: 'Mi-parcours',   color: '#eab308' },
  { key: 'tipping-point',  label: 'Basculement',   color: '#22c55e' },
  { key: 'dmm',            label: 'Mouvement',     color: '#15803d' },
  { key: 'unreached',      label: 'Non-atteint',   color: '#ef4444' },
  { key: 'unknown',        label: 'Non renseigné', color: '#e5e7eb' },
]

// Panel listing the number of engagements per DMM stage, with a coloured dot.
// `counts` is keyed by the four stage keys above (+ derived total) and comes
// from the already-filtered engagement list, so it obeys the active filters.
// Clicking a stage toggles the map's DMM status filter (activeFilter shows
// which one is currently applied); a "Total" row is shown at the bottom.
const DmmIndicatorsPanel = ({ counts, total, theme, style, activeFilters, onToggleStage }) => (
  <div
    style={style}
    className={`absolute right-4 z-[1000] hidden w-[7.5rem] flex-col gap-1 rounded-lg px-2.5 py-2 shadow-sm sm:flex ${panelCls(theme)}`}
  >
    <div className={`mb-0.5 text-[9px] font-semibold uppercase tracking-wide ${subtleText(theme)}`}>
      Engagements DMM
    </div>
    {DMM_STAGE_META.map(({ key, label, color }) => {
      const active = activeFilters.has(key)
      return (
        <button
          key={key}
          type="button"
          onClick={() => onToggleStage(key)}
          title={active ? 'Retirer le filtre' : `Filtrer : ${label}`}
          aria-pressed={active}
          className={`flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left leading-tight transition-colors ${
            active ? 'bg-indigo-500/15 ring-1 ring-indigo-400' : 'hover:bg-black/5'
          } ${activeFilters.size > 0 && !active ? 'opacity-50' : ''}`}
        >
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
          <span className="min-w-0 flex-1 truncate text-[10px]">{label}</span>
          <span className="text-xs font-bold">{(counts[key] || 0).toLocaleString('fr-FR')}</span>
        </button>
      )
    })}
    <div className={`mt-1 flex items-center gap-1.5 border-t pt-1 leading-tight ${theme === 'dark' ? 'border-neutral-700' : 'border-black/10'}`}>
      <span className="h-2.5 w-2.5 flex-shrink-0" />
      <span className={`min-w-0 flex-1 truncate text-[10px] font-semibold ${subtleText(theme)}`}>Total</span>
      <span className="text-xs font-bold">{(total || 0).toLocaleString('fr-FR')}</span>
    </div>
  </div>
)

// ── Status distribution chart ────────────────────────────────────────────────
const StatusChart = ({ data, theme }) => {
  if (!data || !data.length) return null
  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: theme === 'dark' ? '#404040' : '#e5e7eb' }}>
      <p className={`mb-1 text-xs font-semibold ${theme === 'dark' ? 'text-neutral-300' : 'text-gray-600'}`}>
        Répartition par statut
      </p>
      <ResponsiveContainer width="100%" height={140}>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={35} outerRadius={60} paddingAngle={2}>
            {data.map((d) => <Cell key={d.key} fill={d.color} />)}
          </Pie>
          <ReTooltip formatter={(v, n) => [Number(v).toLocaleString('fr-FR'), n]} />
        </PieChart>
      </ResponsiveContainer>
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
        {data.map((d) => (
          <div key={d.key} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-sm" style={{ background: d.color }} />
            <span className="truncate">{d.name}</span>
            <span className={`ml-auto ${subtleText(theme)}`}>{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Mini-map (overview) ──────────────────────────────────────────────────────
const MiniViewport = ({ mainMap }) => {
  const [bounds, setBounds] = useState(null)
  useEffect(() => {
    if (!mainMap) return undefined
    const update = () => setBounds(mainMap.getBounds())
    update()
    mainMap.on('moveend zoomend', update)
    return () => mainMap.off('moveend zoomend', update)
  }, [mainMap])
  useMapEvents({
    click(e) { if (mainMap) mainMap.setView(e.latlng, mainMap.getZoom(), { animate: true }) },
  })
  if (!bounds) return null
  return (
    <Rectangle
      bounds={bounds}
      pathOptions={{ color: '#6366f1', weight: 2, fillColor: '#6366f1', fillOpacity: 0.15 }}
    />
  )
}

const OverviewMiniMap = ({ mainMap, theme, collapsed, onToggle }) => {
  if (collapsed) {
    return (
      <button
        onClick={onToggle}
        title="Afficher la mini-carte"
        className={`absolute bottom-6 right-4 z-[1000] flex h-9 w-9 items-center justify-center rounded-lg shadow-lg ${panelCls(theme)}`}
      >
        <MapIcon size={18} />
      </button>
    )
  }
  return (
    <div
      className={`absolute bottom-6 right-4 z-[1000] overflow-hidden rounded-xl shadow-xl ${panelCls(theme)}`}
      style={{ width: 200 }}
    >
      <div className="flex items-center justify-between px-2 py-1 text-[11px] font-semibold">
        <span>Vue d'ensemble</span>
        <button onClick={onToggle} title="Réduire"><Minimize2 size={13} /></button>
      </div>
      <div style={{ width: 200, height: 140 }}>
        <MapContainer
          center={[7, 20]}
          zoom={2}
          style={{ width: '100%', height: '100%' }}
          zoomControl={false}
          attributionControl={false}
          dragging={false}
          scrollWheelZoom={false}
          doubleClickZoom={false}
          boxZoom={false}
          keyboard={false}
          touchZoom={false}
        >
          <TileLayer key={theme} url={THEME_TILES[theme].url} attribution="" />
          <MiniViewport mainMap={mainMap} />
        </MapContainer>
      </div>
    </div>
  )
}

// ── Export helpers ───────────────────────────────────────────────────────────
const csvEscape = (v) => {
  const s = String(v ?? '')
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
const buildCsv = (rows) => {
  const headers = ['name', 'country', 'status', 'population', 'sources', 'lng', 'lat']
  const lines = [headers.join(',')]
  for (const m of rows) {
    lines.push([
      m.name,
      m.country,
      m.status,
      m.population || 0,
      (m.sourceTypes || []).join('|'),
      m.coordinates?.[0] ?? '',
      m.coordinates?.[1] ?? '',
    ].map(csvEscape).join(','))
  }
  return lines.join('\n')
}
const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
const exportPng = async (mapInstance) => {
  if (!mapInstance) return
  const el = mapInstance.getContainer()
  const { default: html2canvas } = await import('html2canvas')
  const canvas = await html2canvas(el, { useCORS: true, backgroundColor: null, logging: false })
  await new Promise((resolve) => {
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `carte-peuples-${new Date().toISOString().slice(0, 10)}.png`)
      resolve()
    }, 'image/png')
  })
}

// ── Export menu ──────────────────────────────────────────────────────────────
const ExportMenu = ({ markers, mapInstance, theme }) => {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const doCsv = () => {
    const csv = '\ufeff' + buildCsv(markers)
    downloadBlob(
      new Blob([csv], { type: 'text/csv;charset=utf-8' }),
      `peuples-visibles-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    setOpen(false)
  }
  const doPng = async () => {
    setBusy(true)
    try { await exportPng(mapInstance) } catch (e) { console.error(e) } finally { setBusy(false); setOpen(false) }
  }
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        title="Exporter"
        className={`flex h-9 w-9 items-center justify-center rounded-full shadow-md ${panelCls(theme)}`}
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
      </button>
      {open && (
        <div className={`absolute right-0 z-[1200] mt-2 w-52 overflow-hidden rounded-xl shadow-xl ${panelCls(theme)}`}>
          <button
            onMouseDown={doPng}
            disabled={!mapInstance || busy}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 disabled:opacity-50"
          >
            <MapIcon size={14} /> Exporter la carte (PNG)
          </button>
          <button
            onMouseDown={doCsv}
            disabled={!markers.length}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-black/5 disabled:opacity-50"
          >
            <BarChart3 size={14} /> Exporter les données ({markers.length} · CSV)
          </button>
        </div>
      )}
    </div>
  )
}

// ── Top 5 pays (peuples non atteints) ────────────────────────────────────────
const TopCountries = ({ data, theme }) => {
  if (!data || !data.length) return null
  const max = data[0].count || 1
  return (
    <div className="mt-3 border-t pt-2" style={{ borderColor: theme === 'dark' ? '#404040' : '#e5e7eb' }}>
      <p className={`mb-1.5 text-xs font-semibold ${theme === 'dark' ? 'text-neutral-300' : 'text-gray-600'}`}>
        Top 5 pays · peuples non atteints
      </p>
      <div className="flex flex-col gap-1.5">
        {data.map((d, i) => (
          <div key={d.code} className="flex items-center gap-2 text-[11px]">
            <span className="w-4 text-right tabular-nums opacity-60">{i + 1}</span>
            <div className="flex-1">
              <div className="mb-0.5 flex items-center justify-between">
                <span className="truncate">{d.label}</span>
                <span className="ml-2 font-semibold">{d.count.toLocaleString('fr-FR')}</span>
              </div>
              <div className={`h-1.5 w-full rounded-full ${theme === 'dark' ? 'bg-neutral-800' : 'bg-gray-100'}`}>
                <div
                  className="h-1.5 rounded-full"
                  style={{ width: `${Math.max(6, (d.count / max) * 100)}%`, background: '#ef4444' }}
                />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function UnifiedMapView() {
  const navigate = useNavigate()
  const { isEnglish } = useLanguage()
  const [activeSources, setActiveSources] = useState(() => new Set(['DMM']))
  // Filtres multi-sélection : Set des statuts ACTIFS (vide = tous affichés).
  // Permet d'activer/désactiver un ou plusieurs statuts à la fois.
  const [statusFilters, setStatusFilters] = useState(() => new Set())
  // Filtre par statut d'engagement DMM (Set actifs ; vide = tous) et sélection
  // fine des engagements DMM à afficher (Set des ids MASQUÉS ; vide = tout affiché).
  const [dmmStatusFilters, setDmmStatusFilters] = useState(() => new Set())
  const [hiddenDmmIds, setHiddenDmmIds] = useState(() => new Set())
  const [selected, setSelected] = useState(null)
  // Peuple ciblé via la recherche : la carte n'affiche QUE ses localisations.
  const [focusedPeople, setFocusedPeople] = useState(null) // marker object or null
  const [mapMode, setMapMode] = useState('coverage') // 'terrain' | 'coverage'
  // Calque « Lieux / Locations » : affiche les POINTS des peuples et engagements
  // (comme en mode terrain) ; peut être actif EN MÊME TEMPS que la couverture,
  // pour voir simultanément la couverture et les points.
  const [showLocations, setShowLocations] = useState(true)

  // Thème clair/sombre (persisté).
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem('unifiedMap.theme') || 'light' } catch { return 'light' }
  })
  useEffect(() => {
    try { localStorage.setItem('unifiedMap.theme', theme) } catch { /* noop */ }
  }, [theme])
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [legendOpen, setLegendOpen] = useState(true)
  const [mapInstance, setMapInstance] = useState(null)
  const [levelOverride, setLevelOverride] = useState(null) // null = auto (zoom)
  const [zooming, setZooming] = useState(false)
  // Sélection de niveaux administratifs en cascade : { 1: 'Région', 2: 'Dépt', ... }.
  const [adminSel, setAdminSel] = useState({})
  const [showKpis, setShowKpis] = useState(true)
  const [showDmmIndicators, setShowDmmIndicators] = useState(true)
  const [detailTab, setDetailTab] = useState('apercu')
  // Pays sélectionné, PARTAGÉ entre le mode terrain et le mode couverture.
  // '' = tous les pays (terrain) ; sinon un code ISO alpha-3.
  // Pays actif restauré depuis localStorage ; Cameroun (CMR) par défaut.
  const [selectedCountry, setSelectedCountry] = useState(() => {
    try {
      const saved = localStorage.getItem('unifiedMap.selectedCountry')
      // '' est une valeur valide (« Tous les pays »), donc on teste null explicitement.
      return saved !== null ? saved : 'CMR'
    } catch {
      return 'CMR'
    }
  })
  // Mémorise le pays sélectionné pour le restaurer à la prochaine ouverture.
  useEffect(() => {
    try {
      localStorage.setItem('unifiedMap.selectedCountry', selectedCountry)
    } catch { /* localStorage indisponible */ }
  }, [selectedCountry])
  // Le mode couverture exige un pays concret disposant de fonds admin ; on se
  // rabat sur CMR si le pays courant n'en a pas (ex. « Tous les pays »).
  const coverageCountry = COUNTRY_DATA_FILES[selectedCountry] ? selectedCountry : 'CMR'

  // Fetch all markers once; toggles filter client-side for instant response.
  const { data, isLoading, error } = useQuery({
    queryKey: ['master-people-markers'],
    queryFn: async () => (await masterPeopleApi.getMarkers({ limit: 20000 })).data,
    staleTime: 5 * 60 * 1000,
  })

  // Régions NG (pour construire la navigation vers la fiche d'un peuple depuis
  // le popup couverture). On en déduit la table alpha3 → { regionId, code2 }.
  const regionsQuery = useQuery({
    queryKey: ['ng-regions-nav'],
    queryFn: async () => {
      const res = await reportingApi.getRegions()
      return Array.isArray(res?.data?.data) ? res.data.data : []
    },
    staleTime: 10 * 60 * 1000,
  })
  const countryNav = useMemo(() => {
    const map = {}
    for (const region of regionsQuery.data || []) {
      for (const c of region.countries || []) {
        const alpha3 = c.code3 || c.code
        if (!alpha3) continue
        map[alpha3] = { regionId: region.id, code2: c.code2 || c.code }
      }
    }
    return map
  }, [regionsQuery.data])

  // Ouvre la fiche d'un peuple : /regions/:regionId/countries/:code2/peoples/:id.
  // Utilise les infos portées par le point ; sinon déduit regionId/code2 du pays.
  const goToPeopleSheet = useCallback((person) => {
    if (!person) return
    const id = person.masterPeopleId || person.id
    if (!id) return
    let regionId = person.regionId
    let code2 = person.countryCode2
    if ((!regionId || !code2) && person.countryCode3 && countryNav[person.countryCode3]) {
      regionId = regionId || countryNav[person.countryCode3].regionId
      code2 = code2 || countryNav[person.countryCode3].code2
    }
    if (regionId && code2) navigate(`/regions/${regionId}/countries/${code2}/peoples/${id}`)
  }, [navigate, countryNav])

  // ── Filtres administratifs en cascade (région → département → …) ──────────
  // Fond administratif du pays courant (mêmes fichiers que le mode couverture).
  const adminCode3 = useMemo(() => {
    if (!selectedCountry) return null
    const up = selectedCountry.toUpperCase()
    if (up.length === 3) return up
    const cfg = getCountryConfig(up)
    return cfg?.code3 || cfg?.code || null
  }, [selectedCountry])

  const adminQuery = useQuery({
    queryKey: ['admin-geo', adminCode3],
    enabled: !!(adminCode3 && COUNTRY_DATA_FILES[adminCode3]?.admin),
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(COUNTRY_DATA_FILES[adminCode3].admin)
      return res.ok ? res.json() : null
    },
  })
  const adminFeatures = adminQuery.data?.features || []

  // Réinitialise la sélection admin quand on change de pays.
  useEffect(() => { setAdminSel({}) }, [selectedCountry])

  // Niveaux disponibles pour ce pays (1..N) avec un libellé lisible.
  const adminLevels = useMemo(() => {
    if (!adminFeatures.length) return []
    const levelsPresent = new Set(adminFeatures.map((f) => inferAdminLevel(f.properties)))
    const cfg = SUPPORTED_COUNTRIES[adminCode3]?.adminLevels || {}
    return [1, 2, 3]
      .filter((lvl) => levelsPresent.has(lvl))
      .map((lvl) => ({ level: lvl, label: cfg[lvl]?.name || `Niveau ${lvl}` }))
  }, [adminFeatures, adminCode3])

  // Nom d'une entité à un niveau donné (NAME_1/2/3).
  const nameAtLevel = useCallback((props, lvl) => {
    if (lvl === 1) return props.NAME_1 || ''
    if (lvl === 2) return props.NAME_2 || ''
    return props.NAME_3 || ''
  }, [])

  // Options d'un niveau, filtrées par les sélections parentes (cascade).
  const adminOptions = useCallback((lvl) => {
    const names = new Set()
    for (const f of adminFeatures) {
      const p = f.properties || {}
      if (inferAdminLevel(p) < lvl) continue
      // Respecte les niveaux parents sélectionnés.
      let ok = true
      for (let parent = 1; parent < lvl; parent++) {
        if (adminSel[parent] && nameAtLevel(p, parent) !== adminSel[parent]) { ok = false; break }
      }
      if (!ok) continue
      const nm = nameAtLevel(p, lvl)
      if (nm) names.add(nm)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [adminFeatures, adminSel, nameAtLevel])

  // Change la sélection d'un niveau et purge les niveaux enfants.
  const setAdminLevel = useCallback((lvl, value) => {
    setAdminSel((prev) => {
      const next = {}
      for (let l = 1; l < lvl; l++) if (prev[l]) next[l] = prev[l]
      if (value) next[lvl] = value
      return next
    })
  }, [])

  // Entité administrative la plus profonde sélectionnée (pour filtrer + centrer).
  const selectedAdminFeature = useMemo(() => {
    const levels = Object.keys(adminSel).map(Number).sort((a, b) => a - b)
    if (!levels.length) return null
    const deepest = levels[levels.length - 1]
    return adminFeatures.find((f) => {
      const p = f.properties || {}
      if (inferAdminLevel(p) !== deepest) return false
      for (const l of levels) if (nameAtLevel(p, l) !== adminSel[l]) return false
      return true
    }) || null
  }, [adminSel, adminFeatures, nameAtLevel])

  // Contour du PAYS sélectionné : union visuelle de toutes ses entités admin
  // niveau 1 (FeatureCollection). Sert à tracer en orange le pays entier même
  // quand aucun sous-niveau administratif n'est encore choisi.
  const countryOutlineFeature = useMemo(() => {
    if (!selectedCountry || !adminFeatures.length) return null
    const lvl1 = adminFeatures.filter((f) => inferAdminLevel(f.properties) === 1)
    const feats = lvl1.length ? lvl1 : adminFeatures
    if (!feats.length) return null
    return { type: 'FeatureCollection', features: feats }
  }, [selectedCountry, adminFeatures])

  // Entité réellement tracée en orange : le sous-niveau admin si choisi, sinon
  // le contour du pays sélectionné.
  const outlineFeature = selectedAdminFeature || countryOutlineFeature

  // Prédicat : un point [lng,lat] tombe-t-il dans l'entité admin sélectionnée ?
  const inSelectedAdmin = useCallback((lngLat) => {
    if (!selectedAdminFeature) return true
    if (!Array.isArray(lngLat) || lngLat.length < 2) return false
    return pointInFeature([Number(lngLat[0]), Number(lngLat[1])], selectedAdminFeature)
  }, [selectedAdminFeature])

  // Fetch DMM engagements once — rendered as a SEPARATE layer (distinct from the
  // JP/IMB unified markers). ONE point per DMM engagement (village-level), so the
  // count matches the "Villages / statut DMM" layer (e.g. 80 for the Cameroon),
  // labelled "nom, Village" and carrying the
  // /regions/:regionId/countries/:countryCode2/peoples/:masterPeopleId navigation target.
  const dmmPeoplesQuery = useQuery({
    queryKey: ['dmm-engagements'],
    queryFn: async () => (await masterPeopleApi.getDmmEngagements({ limit: 20000 })).data,
    staleTime: 5 * 60 * 1000,
  })
  // Bounding box du pays sélectionné (null = « Tous les pays »). Sert à filtrer
  // géographiquement la couche DMM au pays courant.
  const countryBounds = useMemo(
    () => (selectedCountry ? SUPPORTED_COUNTRIES[selectedCountry]?.bounds || null : null),
    [selectedCountry],
  )

  // Couche « peuples DMM » restreinte au pays sélectionné.
  // IMPORTANT: on filtre par pays (countryCode3), PAS par bounding box sur les
  // coordonnées. Certains engagements n'ont pas encore de géolocalisation
  // (coordonnées 0,0) ; un filtre bbox les faisait disparaître (66 au lieu de 80).
  // La liste doit contenir les 80 engagements du pays ; seuls les marqueurs
  // sans coordonnées valides ne seront pas dessinés sur la carte.
  const dmmPeoples = useMemo(() => {
    let all = dmmPeoplesQuery.data?.peoples || []
    if (selectedCountry) all = all.filter((v) => !v.countryCode3 || v.countryCode3 === selectedCountry)
    // Filtre par niveau administratif : ne garde que les engagements géolocalisés
    // qui tombent dans l'entité sélectionnée (ceux sans coordonnées restent visibles
    // dans la liste, ils ne sont juste pas dessinés).
    if (selectedAdminFeature) {
      all = all.filter((v) => {
        const c = v.coordinates
        if (!Array.isArray(c) || c.length < 2 || (Number(c[0]) === 0 && Number(c[1]) === 0)) return false
        return inSelectedAdmin(c)
      })
    }
    return all
  }, [dmmPeoplesQuery.data, selectedCountry, selectedAdminFeature, inSelectedAdmin])

  // Liste des peuples DMM obéissant AUSSI aux filtres Statut (reached-status) et
  // Statut d'engagement DMM. (Le filtre Pays est déjà appliqué ci-dessus.)
  const dmmPeoplesFiltered = useMemo(() => {
    return dmmPeoples.filter((p) => {
      // Engagements carry no JP/IMB "reached" status — only apply that filter
      // when the point actually has one (backward-compat with the peoples layer).
      if (statusFilters.size && p.status !== undefined && !statusFilters.has(p.status)) return false
      if (dmmStatusFilters.size && !dmmStatusFilters.has(p.dmmStatus || 'unknown')) return false
      return true
    })
  }, [dmmPeoples, statusFilters, dmmStatusFilters])

  // Helper: un engagement a-t-il des coordonnées exploitables (≠ null et ≠ 0,0) ?
  const hasValidCoords = React.useCallback((p) => {
    const c = p?.coordinates
    return Array.isArray(c) && c.length >= 2 && !(Number(c[0]) === 0 && Number(c[1]) === 0)
  }, [])

  // Peuples DMM réellement affichés = liste filtrée MOINS ceux décochés.
  const dmmVisible = useMemo(
    () => dmmPeoplesFiltered.filter((p) => !hiddenDmmIds.has(String(p.id))),
    [dmmPeoplesFiltered, hiddenDmmIds],
  )

  // Statistiques DMM calculées sur la SÉLECTION affichée.
  const dmmStats = useMemo(() => {
    let churches = 0
    const byStatus = {}
    for (const p of dmmVisible) {
      churches += p.totalChurches || 0
      const s = p.dmmStatus || 'unknown'
      byStatus[s] = (byStatus[s] || 0) + 1
    }
    return { total: dmmVisible.length, churches, byStatus }
  }, [dmmVisible])

  // Counts per DMM stage computed over the ALREADY-FILTERED engagement list, so
  // the indicators obey the country / admin / status filters. Keyed by the raw
  // `p.dmmStatus` value (pioneer / midway / tipping-point / dmm=Movement) so the
  // panel keys line up with the dmmStatusFilter values used for click-to-filter.
  const dmmStageCounts = useMemo(() => {
    const counts = { pioneer: 0, midway: 0, 'tipping-point': 0, dmm: 0, unreached: 0, unknown: 0 }
    for (const p of dmmVisible) {
      const key = p.dmmStatus || 'unknown'
      if (counts[key] !== undefined) counts[key] += 1
      else counts.unknown += 1
    }
    return counts
  }, [dmmVisible])

  const toggleDmm = useCallback((id) => {
    const key = String(id)
    setHiddenDmmIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])
  const setAllDmm = useCallback((show) => {
    setHiddenDmmIds(() => {
      if (show) return new Set()
      return new Set(dmmPeoplesFiltered.map((p) => String(p.id)))
    })
  }, [dmmPeoplesFiltered])

  const markers = useMemo(() => {
    let arr = data?.markers || []
    if (statusFilters.size) arr = arr.filter((m) => statusFilters.has(m.status))
    if (selectedCountry) arr = arr.filter((m) => m.country === selectedCountry)
    // Filtre par niveau administratif sélectionné (région/département/…).
    if (selectedAdminFeature) arr = arr.filter((m) => inSelectedAdmin(m.coordinates))
    return arr
  }, [data, statusFilters, selectedCountry, selectedAdminFeature, inSelectedAdmin])

  // Liste des pays réellement présents dans les marqueurs (code ISO alpha-3).
  // On affiche un nom FR pour les pays supportés, sinon le code brut.
  const availableCountries = useMemo(() => {
    const set = new Set()
    for (const m of data?.markers || []) if (m.country) set.add(m.country)
    if (selectedCountry) set.add(selectedCountry) // garde l'option courante même sans marqueurs
    const label = (code) => SUPPORTED_COUNTRIES[code]?.nameFr || code
    return [...set]
      .map((code) => ({ code, label: label(code) }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [data, selectedCountry])

  const sourceVisibleMarkers = useMemo(
    () => markers.filter((m) => (m.sourceTypes || []).some((t) => activeSources.has(t))),
    [markers, activeSources]
  )
  const visibleCount = sourceVisibleMarkers.length

  // KPI + répartition par statut (calculés sur les marqueurs visibles).
  const stats = useMemo(() => {
    let unreached = 0, reached = 0, population = 0
    for (const m of sourceVisibleMarkers) {
      population += m.population || 0
      if (m.status === 'UNREACHED' || m.status === 'FRONTIER') unreached += 1
      else if (m.status === 'REACHED') reached += 1
    }
    return { total: sourceVisibleMarkers.length, unreached, reached, population }
  }, [sourceVisibleMarkers])

  const statusChartData = useMemo(() => {
    const counts = {}
    for (const m of sourceVisibleMarkers) {
      const s = m.status || 'UNKNOWN'
      counts[s] = (counts[s] || 0) + 1
    }
    return Object.entries(counts)
      .map(([key, value]) => ({
        key,
        value,
        name: STATUS_LABELS[key] || key,
        color: STATUS_COLORS[key] || STATUS_COLORS.UNKNOWN,
      }))
      .sort((a, b) => b.value - a.value)
  }, [sourceVisibleMarkers])

  // Top 5 pays par nombre de peuples non atteints (UNREACHED + FRONTIER).
  const topUnreachedCountries = useMemo(() => {
    const counts = {}
    for (const m of sourceVisibleMarkers) {
      if (m.status === 'UNREACHED' || m.status === 'FRONTIER') {
        const c = m.country || '—'
        counts[c] = (counts[c] || 0) + 1
      }
    }
    return Object.entries(counts)
      .map(([code, count]) => ({ code, count, label: SUPPORTED_COUNTRIES[code]?.nameFr || code }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }, [sourceVisibleMarkers])

  // Toutes les localisations connues du peuple ciblé (une par village/point).
  const { data: focusedCoords } = useQuery({
    queryKey: ['master-people-coordinates', focusedPeople?.id],
    enabled: !!focusedPeople?.id,
    queryFn: async () => (await masterPeopleApi.getCoordinates(focusedPeople.id)).data,
  })

  // Points [lng,lat] du peuple ciblé (dédupliqués). Repli sur le point du marqueur.
  const focusedPoints = useMemo(() => {
    if (!focusedPeople) return []
    const raw = focusedCoords?.coordinates || []
    const pts = []
    const seen = new Set()
    const push = (lng, lat) => {
      const x = Number(lng); const y = Number(lat)
      if (!Number.isFinite(x) || !Number.isFinite(y)) return
      const k = `${x.toFixed(5)},${y.toFixed(5)}`
      if (seen.has(k)) return
      seen.add(k)
      pts.push([x, y])
    }
    for (const c of raw) {
      const gc = c?.geom?.coordinates
      if (Array.isArray(gc) && gc.length === 2) push(gc[0], gc[1])
      else if (c?.longitude != null && c?.latitude != null) push(c.longitude, c.latitude)
    }
    if (!pts.length && Array.isArray(focusedPeople.coordinates) && focusedPeople.coordinates.length === 2) {
      push(focusedPeople.coordinates[0], focusedPeople.coordinates[1])
    }
    return pts
  }, [focusedPeople, focusedCoords])

  // Adapte les marqueurs "master people" au format attendu par CoverageLayer.
  // PERF: on ne calcule QUE en mode couverture, et on pré-filtre par la
  // bounding box du pays sélectionné pour éviter un point-in-polygon sur les
  // ~20 000 marqueurs mondiaux à chaque changement de pays.
  const coveragePeoples = useMemo(() => {
    if (mapMode !== 'coverage') return []
    if (focusedPeople) {
      return focusedPoints.map((c) => ({
        location: { coordinates: c },
        engagementStatus: STATUS_TO_COVERAGE[focusedPeople.status] || 'unknown',
        population: focusedPeople.population || 0,
        numberOfChurches: 0,
        maxGeneration: 0,
        name: focusedPeople.name,
        source: (focusedPeople.sourceTypes || []).join(' + '),
        sourceGroup: 'JP/IMB',
        id: focusedPeople.id,
        countryCode3: focusedPeople.country,
      }))
    }
    const b = SUPPORTED_COUNTRIES[coverageCountry]?.bounds // [minLng, minLat, maxLng, maxLat]
    const inBounds = (c) => !b || (c[0] >= b[0] && c[0] <= b[2] && c[1] >= b[1] && c[1] <= b[3])
    const out = []
    // On part des marqueurs VISIBLES (statut + pays + sources déjà appliqués)
    // pour que le mode couverture respecte le filtre des peuples, et non des
    // marqueurs bruts.
    if (activeSources.has('JP') || activeSources.has('IMB') || activeSources.has('CPPI')) {
      for (const m of sourceVisibleMarkers) {
        const c = m.coordinates
        if (!c || c.length < 2) continue
        if (!inBounds(c)) continue
        out.push({
          location: { coordinates: c },
          engagementStatus: STATUS_TO_COVERAGE[m.status] || 'unknown',
          population: m.population || 0,
          numberOfChurches: 0,
          maxGeneration: 0,
          name: m.name,
          source: (m.sourceTypes || []).join(' + '),
          sourceGroup: 'JP/IMB',
          id: m.id,
          countryCode3: m.country,
        })
      }
    }
    // Les ENGAGEMENTS DMM doivent AUSSI alimenter la couverture et obéir aux
    // filtres. dmmVisible = déjà filtré par pays + statut + statut DMM + cases
    // décochées. Auparavant ils étaient absents du mode couverture (d'où
    // l'impression que la couverture n'obéissait pas aux filtres DMM).
    if (activeSources.has('DMM')) {
      for (const p of dmmVisible) {
        const c = p.coordinates
        if (!c || c.length < 2) continue
        if (Number(c[0]) === 0 && Number(c[1]) === 0) continue
        if (!inBounds(c)) continue
        // Les engagements DMM portent leur propre vocabulaire de statut dans
        // `dmmStatus` (pioneer/midway/tipping-point/dmm/unreached/unknown), qui
        // correspond DÉJÀ aux clés de STATUS_COLORS_FILL / DMM_PRIORITY. On NE
        // doit PAS passer par STATUS_TO_COVERAGE[p.status] : `p.status` est
        // absent des engagements → le fallback 'dmm' rendait toute zone verte
        // (« Mouvement ») quel que soit le zoom.
        out.push({
          location: { coordinates: c },
          engagementStatus: p.dmmStatus || 'unknown',
          population: p.population || 0,
          numberOfChurches: p.totalChurches || 0,
          maxGeneration: p.maxGeneration || 0,
          name: p.villageName ? `${p.name}, ${p.villageName}` : p.name,
          source: 'DMM',
          sourceGroup: 'DMM',
          masterPeopleId: p.masterPeopleId || p.id,
          regionId: p.regionId || null,
          countryCode2: p.countryCode2 || null,
          countryCode3: p.countryCode3 || null,
        })
      }
    }
    return out
  }, [sourceVisibleMarkers, dmmVisible, activeSources, mapMode, coverageCountry, focusedPeople, focusedPoints])

  const toggleSource = (s) => {
    setActiveSources((prev) => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  // Active/désactive un statut (peuples) dans le filtre multi-sélection.
  const toggleStatusFilter = useCallback((k) => {
    setStatusFilters((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }, [])

  // Active/désactive un statut d'engagement DMM dans le filtre multi-sélection.
  const toggleDmmStatusFilter = useCallback((k) => {
    setDmmStatusFilters((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      return next
    })
  }, [])

  const handleSearchPick = useCallback((m) => {
    setSelected(m)
    setFocusedPeople(m)
  }, [])

  const clearFocus = useCallback(() => setFocusedPeople(null), [])

  // Un marqueur par localisation du peuple ciblé (même identité/statut/source).
  const focusedMarkers = useMemo(() => {
    if (!focusedPeople) return []
    return focusedPoints.map((c, i) => ({
      ...focusedPeople,
      id: `${focusedPeople.id}::loc${i}`,
      coordinates: c,
    }))
  }, [focusedPeople, focusedPoints])

  // Recentre/zoome la carte sur toutes les localisations du peuple ciblé.
  useEffect(() => {
    if (!mapInstance || !focusedPoints.length) return
    if (focusedPoints.length === 1) {
      const [lng, lat] = focusedPoints[0]
      mapInstance.setView([lat, lng], 11, { animate: true })
      return
    }
    const bounds = L.latLngBounds(focusedPoints.map(([lng, lat]) => [lat, lng]))
    mapInstance.fitBounds(bounds, { padding: [60, 60], maxZoom: 12, animate: true })
  }, [mapInstance, focusedPoints])

  // Detail (all sources + aliases) for the selected master people.
  const { data: detail } = useQuery({
    queryKey: ['master-people-detail', selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => {
      const [srcs, aliases] = await Promise.all([
        masterPeopleApi.getSources(selected.id),
        masterPeopleApi.getAliases(selected.id),
      ])
      return { sources: srcs.data.sources || [], aliases: aliases.data.aliases || [] }
    },
  })

  // Profil consolidé (langue, religion, photo, description, synchro, coords).
  const { data: profile } = useQuery({
    queryKey: ['master-people-profile', selected?.id],
    enabled: !!selected?.id,
    queryFn: async () => (await masterPeopleApi.getProfile(selected.id)).data,
  })

  // Couverture territoriale (polygones admin + villages), à la demande.
  const { data: coverage } = useQuery({
    queryKey: ['master-people-coverage', selected?.id],
    enabled: !!selected?.id && detailTab === 'localisation',
    queryFn: async () => (await masterPeopleApi.getCoverage(selected.id)).data,
  })

  // Activités liées (via PeopleGroup), à la demande.
  const { data: activities } = useQuery({
    queryKey: ['master-people-activities', selected?.id],
    enabled: !!selected?.id && detailTab === 'activites',
    queryFn: async () => (await masterPeopleApi.getActivities(selected.id)).data,
  })

  const ov = profile?.overview || {}
  const fmtDate = (d) => {
    if (!d) return null
    const dt = new Date(d)
    return Number.isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('fr-FR')
  }

  const activeSourceRows = (detail?.sources || []).filter((src) => activeSources.has(src.sourceType))
  const aliasNames = detail
    ? [...new Set(
        detail.aliases
          .filter((a) => ['NAME_ACROSS', 'NAME_IN_COUNTRY', 'DISPLAY', 'ALTERNATE'].includes(a.aliasType))
          .map((a) => a.alias)
      )].slice(0, 15)
    : []

  const displayMarkers = useMemo(() => {
    if (focusedPeople) return focusedMarkers
    return markers
  }, [focusedPeople, focusedMarkers, markers])

  const resetFilters = () => {
    setActiveSources(new Set(ALL_SOURCES))
    setStatusFilters(new Set())
    setSelectedCountry('')
    setAdminSel({})
    setDmmStatusFilters(new Set())
    setHiddenDmmIds(new Set())
    setFocusedPeople(null)
  }

  useEffect(() => {
    if (!mapInstance) return
    mapInstance.setView([5.9631, 12.3486], 5, { animate: false })
    const onZoomStart = () => setZooming(true)
    const onZoomEnd = () => setZooming(false)
    mapInstance.on('zoomstart', onZoomStart)
    mapInstance.on('zoomend', onZoomEnd)
    return () => {
      mapInstance.off('zoomstart', onZoomStart)
      mapInstance.off('zoomend', onZoomEnd)
    }
  }, [mapInstance])


  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 56px)' }}>
      {/* Recherche + bascule thème (haut-droite) */}
      <div className="absolute top-3 right-4 z-[1001] flex items-center gap-2">
        <SearchBox markers={sourceVisibleMarkers} onPick={handleSearchPick} onClear={clearFocus} theme={theme} />
        <ExportMenu markers={sourceVisibleMarkers} mapInstance={mapInstance} theme={theme} />
        <button
          onClick={() => setShowKpis((v) => !v)}
          title={showKpis ? 'Masquer les indicateurs' : 'Afficher les indicateurs'}
          aria-pressed={showKpis}
          className={`flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-colors ${
            showKpis
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : theme === 'dark'
                ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                : 'bg-white text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          <BarChart3 size={16} />
        </button>
        <button
          onClick={() => setShowDmmIndicators((v) => !v)}
          title={showDmmIndicators ? 'Masquer les indicateurs DMM' : 'Afficher les indicateurs DMM'}
          aria-pressed={showDmmIndicators}
          className={`flex h-9 w-9 items-center justify-center rounded-full shadow-md transition-colors ${
            showDmmIndicators
              ? 'bg-indigo-600 text-white hover:bg-indigo-700'
              : theme === 'dark'
                ? 'bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                : 'bg-white text-neutral-600 hover:bg-neutral-100'
          }`}
        >
          <Layers size={16} />
        </button>
      </div>
      {/* Cartes KPI — colonne discrète à droite, masquables et cachées quand un peuple est sélectionné */}
      {!isLoading && !error && !selected && showKpis && <KpiBar stats={stats} theme={theme} />}
      {/* Indicateurs DMM — sous la colonne KPI quand elle est visible, sinon en haut, pour ne jamais la masquer. */}
      {!isLoading && !error && !selected && showDmmIndicators && (
        <DmmIndicatorsPanel
          counts={dmmStageCounts}
          total={dmmVisible.length}
          activeFilters={dmmStatusFilters}
          onToggleStage={toggleDmmStatusFilter}
          theme={theme}
          style={{ top: showKpis ? '16rem' : '4rem' }}
        />
      )}
      {/* ── Mode toggle (Terrain / Couverture) ───────── */}
      <MapModeToggle mode={mapMode} onChange={setMapMode} theme={theme} />

      {/* Bandeau « peuple ciblé » — visible dans tous les modes quand une recherche cible un peuple */}
      {focusedPeople && (
        <div className={`absolute ${mapMode === 'coverage' ? 'top-24' : 'top-14'} left-1/2 -translate-x-1/2 z-[1002] flex max-w-md items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-medium shadow-md ${panelCls(theme)}`}>
          <MapPin size={13} className="flex-shrink-0 text-indigo-500" />
          <span
            className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
            style={{ background: STATUS_COLORS[focusedPeople.status] || STATUS_COLORS.UNKNOWN }}
            title={STATUS_LABELS[focusedPeople.status] || STATUS_LABELS.UNKNOWN}
          />
          <span className="truncate">
            <b>{focusedPeople.villageName ? `${focusedPeople.name}, ${focusedPeople.villageName}` : focusedPeople.name}</b>
            {' · '}
            {STATUS_LABELS[focusedPeople.status] || STATUS_LABELS.UNKNOWN}
            {focusedPeople.country && (
              <span className="hidden md:inline">{' · '}{SUPPORTED_COUNTRIES[focusedPeople.country]?.nameFr || focusedPeople.country}</span>
            )}
            {focusedPeople.population > 0 && (
              <span className="hidden md:inline">{' · '}Pop. {formatCompact(focusedPeople.population)}</span>
            )}
            {' · '}
            {focusedPoints.length > 0
              ? `${focusedPoints.length} localisation${focusedPoints.length > 1 ? 's' : ''}`
              : 'Chargement des localisations…'}
          </span>
          <button
            onClick={clearFocus}
            className="ml-1 flex-shrink-0 rounded-full bg-indigo-600 px-2.5 py-1 text-[10px] font-semibold text-white transition-colors hover:bg-indigo-700"
          >
            Afficher tous les peuples
          </button>
        </div>
      )}

      {/* Légende de statut — coin bas-droite (là où était la mini-carte),
          panneau vertical rétractable vers le bas. */}
      {mapMode !== 'coverage' && (
        <div className={`absolute bottom-4 right-4 z-[1001] w-44 rounded-xl px-3 py-2 shadow-lg ${panelCls(theme)}`}>
          <button
            type="button"
            onClick={() => setLegendOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-left"
            title={legendOpen ? 'Réduire la légende' : 'Afficher la légende'}
          >
            <span className={`text-[10px] font-bold uppercase tracking-wide ${subtleText(theme)}`}>Légende</span>
            <ChevronDown size={14} className={`transition-transform ${legendOpen ? '' : '-rotate-90'}`} />
          </button>
          {legendOpen && (
            <div className="mt-2 flex flex-col gap-1">
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5 text-[11px]">
                  <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: STATUS_COLORS[k] }} />
                  {v}
                </span>
              ))}
              <span className="mt-1 flex items-center gap-1.5 border-t border-black/10 pt-1.5 text-[11px]">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: '#6b7280' }} />
                master people
              </span>
              <span className="flex items-center gap-1.5 text-[11px]">
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: 'transparent', border: '2px solid #6b7280' }} />
                village
              </span>
            </div>
          )}
        </div>
      )}


      {/* La légende « Couverture DMM » a été retirée : les couleurs des statuts
          sont désormais portées par le tableau des indicateurs DMM. */}

      {/* ── Barre latérale rétractable ───────────────────────────────── */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className={`absolute top-4 left-4 z-[1000] flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold shadow-lg ${panelCls(theme)}`}
          title="Afficher le panneau"
        >
          <ChevronRight size={16} /> Filtres
        </button>
      )}
      {sidebarOpen && (
      <div className={`absolute top-4 left-16 z-[1000] w-64 max-h-[85vh] overflow-y-auto rounded-xl p-4 shadow-lg bg-opacity-30 ${panelCls(theme)}`}>
        <div className="mb-1 flex items-start justify-between">
          <h3 className="font-bold">{uiLabel('title', isEnglish)}</h3>
          <button onClick={() => setSidebarOpen(false)} className={subtleText(theme)} title="Réduire le panneau">
            <ChevronLeft size={18} />
          </button>
        </div>
        {/* ── Calques / Layers ─────────────────────────────────────────
            Groupe des calques superposables : Limites administratives (couverture),
            Sources actifs, et Lieux (points des peuples/engagements). */}
        <div className="mb-3 rounded-lg border border-neutral-200/50 p-2">
          <p className={`mb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide ${subtleText(theme)}`}>
            <Layers size={12} /> {uiLabel('layers', isEnglish)}
          </p>

          {/* Calque « Limites administratives » (ex-« Niveau »). Pilote le niveau
              administratif affiché par la couche de couverture. */}
          <div className="mb-2">
            <p className="mb-1 text-xs font-semibold text-gray-600">{uiLabel('adminBoundaries', isEnglish)}</p>
            <select
              value={levelOverride || ''}
              onChange={(e) => setLevelOverride(e.target.value || null)}
              className={`w-full rounded border px-2 py-1 text-sm ${inputCls(theme)}`}
            >
              <option value="">{isEnglish ? 'Auto (by zoom)' : 'Auto (selon le zoom)'}</option>
              <option value="region">{isEnglish ? 'Region' : 'Région'}</option>
              <option value="departement">{isEnglish ? 'Department' : 'Département'}</option>
              <option value="arrondissement">{isEnglish ? 'Subdivision' : 'Arrondissement'}</option>
              <option value="village">{isEnglish ? 'Village' : 'Village'}</option>
            </select>
          </div>

          {/* Calque « Sources actifs » (ex-« Sources »). */}
          <div className="mb-2">
            <p className="mb-1 text-xs font-semibold text-gray-600">{uiLabel('activeSources', isEnglish)}</p>
            {ALL_SOURCES.map((s) => (
              <label key={s} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                <input type="checkbox" checked={activeSources.has(s)} onChange={() => toggleSource(s)} />
                <span>{SOURCE_LABELS[s]}</span>
              </label>
            ))}
          </div>

          {/* Calque « Lieux / Locations » : affiche les POINTS des peuples et des
              engagements (comme en mode terrain). Peut être actif EN MÊME TEMPS
              que la couverture → voir couverture + points simultanément. */}
          <div>
            <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm font-semibold text-gray-600">
              <input type="checkbox" checked={showLocations} onChange={() => setShowLocations((v) => !v)} />
              <MapPin size={12} /> <span>{uiLabel('locations', isEnglish)}</span>
            </label>
          </div>
        </div>

        {/* Pays, puis le Statut — ordre demandé pour le panneau de filtres. */}
        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-gray-600">{uiLabel('country', isEnglish)}</p>
          <select
            value={selectedCountry}
            onChange={(e) => setSelectedCountry(e.target.value)}
            className="w-full rounded border px-2 py-1 text-sm"
          >
            <option value="">{uiLabel('allCountries', isEnglish)}</option>
            {availableCountries.map(({ code, label }) => (
              <option key={code} value={code}>{label}</option>
            ))}
          </select>
        </div>

        {/* Sélecteurs administratifs en cascade (région → département → …),
            disponibles dans tous les modes dès qu'un pays est choisi. La carte
            se recentre sur le niveau sélectionné et l'affichage suit le filtre. */}
        {selectedCountry && adminLevels.length > 0 && adminLevels.map(({ level, label }) => {
          // On n'affiche un niveau que si le niveau parent est déjà renseigné.
          const parentLevel = adminLevels.find((l) => l.level === level - 1)
          if (parentLevel && !adminSel[parentLevel.level]) return null
          const opts = adminOptions(level)
          if (opts.length === 0) return null
          return (
            <div className="mb-3" key={`admin-${level}`}>
              <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-gray-600">
                <MapPin size={12} /> {label}
              </p>
              <select
                value={adminSel[level] || ''}
                onChange={(e) => setAdminLevel(level, e.target.value || null)}
                className={`w-full rounded border px-2 py-1 text-sm ${inputCls(theme)}`}
              >
                <option value="">Tou(te)s</option>
                {opts.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
          )
        })}

        <div className="mb-3">
          <p className="mb-1 text-xs font-semibold text-gray-600">{uiLabel('peopleStatus', isEnglish)}</p>
          {/* Multi-sélection : cochez un ou plusieurs statuts (aucun coché = tous). */}
          <div className="rounded border border-neutral-200/50 p-1">
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <label key={k} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm hover:bg-neutral-500/10 rounded px-1">
                <input
                  type="checkbox"
                  checked={statusFilters.has(k)}
                  onChange={() => toggleStatusFilter(k)}
                />
                <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: STATUS_COLORS[k] }} />
                <span>{v}</span>
              </label>
            ))}
          </div>
        </div>

        {/* ── Filtres DMM (couche séparée) ─────────────────────────── */}
        {activeSources.has('DMM') && (
          <>
            <div className="mb-3">
              <p className="mb-1 text-xs font-semibold text-gray-600">{uiLabel('dmmEngagementStatus', isEnglish)}</p>
              {/* Multi-sélection : cochez un ou plusieurs statuts (aucun coché = tous). */}
              <div className="rounded border border-neutral-200/50 p-1">
                {DMM_STAGE_META.map(({ key, label, color }) => (
                  <label key={key} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm hover:bg-neutral-500/10 rounded px-1">
                    <input
                      type="checkbox"
                      checked={dmmStatusFilters.has(key)}
                      onChange={() => toggleDmmStatusFilter(key)}
                    />
                    <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: color }} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mb-3">
              <div className="mb-1 flex items-center justify-between">
                <p className="text-xs font-semibold text-gray-600">
                  Engagements DMM{' '}
                  <span className="text-gray-400">({dmmVisible.length}/{dmmPeoplesFiltered.length})</span>
                </p>
                <div className="flex gap-1">
                  <button
                    onClick={() => setAllDmm(true)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${inputCls(theme)}`}
                    title="Tout cocher"
                  >
                    Tout
                  </button>
                  <button
                    onClick={() => setAllDmm(false)}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${inputCls(theme)}`}
                    title="Tout décocher"
                  >
                    Aucun
                  </button>
                </div>
              </div>
              <div className="max-h-44 overflow-y-auto rounded border border-neutral-200/50 p-1">
                {dmmPeoplesFiltered.length === 0 && (
                  <p className="px-1 py-1 text-[11px] text-gray-400">Aucun engagement DMM pour ce filtre.</p>
                )}
                {dmmPeoplesFiltered.map((p) => {
                  const key = String(p.id)
                  const checked = !hiddenDmmIds.has(key)
                  const color = DMM_ENGAGEMENT_COLORS[p.dmmStatus] || DMM_ENGAGEMENT_COLORS.unknown
                  return (
                    <label key={key} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-neutral-500/10">
                      <input type="checkbox" checked={checked} onChange={() => toggleDmm(p.id)} className="mt-0.5" />
                      <span
                        className="mt-1 h-2 w-2 flex-shrink-0 rotate-45"
                        style={{ background: color }}
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium" title={p.villageName ? `${p.name}, ${p.villageName}` : p.name}>
                          {/* Nom de l'engagement + village (déplacé ici depuis la
                              carte pour ne pas l'encombrer). Ex: "Arabs, Kousseri". */}
                          {p.name || '—'}
                          {p.villageName ? (
                            <span className="font-normal text-gray-500">, {p.villageName}</span>
                          ) : null}
                          {!hasValidCoords(p) ? (
                            <span className="ml-1 text-[10px] font-normal italic text-amber-500" title="Pas de géolocalisation — non affiché sur la carte">
                              (sans position)
                            </span>
                          ) : null}
                        </span>

                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Stats de la sélection DMM */}
            <div className="mb-3 rounded-lg border border-neutral-200/50 p-2 text-xs">
              <p className="mb-1 font-semibold text-gray-600">Sélection DMM</p>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-gray-500">Peuples affichés</span>
                <b>{dmmStats.total.toLocaleString('fr-FR')}</b>
              </div>
              <div className="flex items-center justify-between py-0.5">
                <span className="text-gray-500">Églises</span>
                <b>{dmmStats.churches.toLocaleString('fr-FR')}</b>
              </div>
              {['dmm', 'tipping-point', 'midway', 'pioneer'].map((k) =>
                dmmStats.byStatus[k] ? (
                  <div key={k} className="flex items-center justify-between py-0.5">
                    <span className="flex items-center gap-1 text-gray-500">
                      <span className="h-2 w-2 rotate-45" style={{ background: DMM_ENGAGEMENT_COLORS[k] }} />
                      {DMM_ENGAGEMENT_LABELS[k]}
                    </span>
                    <b>{dmmStats.byStatus[k]}</b>
                  </div>
                ) : null,
              )}
            </div>
          </>
        )}

        <div className="mb-2 flex items-center justify-between">
          <button
            onClick={resetFilters}
            className={`flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold ${inputCls(theme)}`}
            title="Réinitialiser les filtres"
          >
            <RotateCcw size={12} /> Réinitialiser
          </button>
        </div>

        <div className="text-xs text-gray-600">
          {isLoading && 'Chargement des marqueurs…'}
          {error && <span className="text-red-600">Erreur de chargement des données.</span>}
          {!isLoading && !error && (
            <span>
              Peuples affichés : <b>{visibleCount.toLocaleString('fr-FR')}</b> sur{' '}
              {(data?.count ?? (data?.markers?.length || 0)).toLocaleString('fr-FR')}
            </span>
          )}
        </div>

        {/* Répartition par statut */}
        {!isLoading && !error && <StatusChart data={statusChartData} theme={theme} />}

        {/* Top 5 pays par peuples non atteints */}
        {!isLoading && !error && <TopCountries data={topUnreachedCountries} theme={theme} />}

        <div className="mt-3 border-t pt-2">
          <p className="mb-1 text-xs font-semibold text-gray-600">Légende (statut)</p>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 py-0.5 text-xs">
              <span className="h-3 w-3 rounded-full" style={{ background: STATUS_COLORS[k] }} />
              {v}
            </div>
          ))}
          <p className="mt-2 text-[11px] text-gray-400">
            Le double anneau indique un peuple présent dans plusieurs sources (fusionné).
          </p>
        </div>
      </div>
      )}

      {/* ── Selected people detail ────────────────────────────────── */}
      {selected && (
        <div className={`absolute top-16 right-4 z-[1000] w-96 max-w-[90vw] max-h-[80vh] overflow-y-auto rounded-xl p-4 shadow-xl ${panelCls(theme)}`}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-bold">{selected.name}</h3>
              <p className={`text-xs ${subtleText(theme)}`}>
                ROP3 {selected.rop3 || '—'} · {selected.country || '—'}
              </p>
            </div>
            <button onClick={() => setSelected(null)} className={subtleText(theme)}>
              ✕
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1">
            {(selected.sourceTypes || []).map((t) => (
              <span
                key={t}
                className={`rounded-full px-2 py-0.5 text-[10px] ${
                  activeSources.has(t)
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-400 line-through'
                }`}
              >
                {SOURCE_LABELS[t] || t}
              </span>
            ))}
          </div>

          {/* Onglets */}
          <div className="mt-3 flex gap-1 overflow-x-auto border-b border-neutral-200/40 pb-1">
            {[
              ['apercu', 'Aperçu'],
              ['sources', 'Sources'],
              ['population', 'Population'],
              ['localisation', 'Localisation'],
              ['activites', 'Activités'],
              ['notes', 'Notes'],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => setDetailTab(key)}
                className={`whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-semibold transition-colors ${
                  detailTab === key
                    ? 'bg-indigo-100 text-indigo-700'
                    : `${subtleText(theme)} hover:bg-black/5`
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="mt-3 text-xs">
            {detailTab === 'apercu' && (
              <div className="flex flex-col gap-1.5">
                {ov.photoUrl ? (
                  <img
                    src={ov.photoUrl}
                    alt={selected.name}
                    className="h-32 w-full rounded-lg object-cover"
                    onError={(e) => { e.currentTarget.style.display = 'none' }}
                  />
                ) : (
                  <div className="flex h-24 w-full items-center justify-center rounded-lg bg-neutral-200/40 text-[11px] text-neutral-400">
                    Photo indisponible
                  </div>
                )}
                <div className="grid grid-cols-2 gap-1">
                  <span>Statut</span><b className="text-right">{STATUS_LABELS[selected.status] || '—'}</b>
                  <span>Pays</span><b className="text-right">{selected.country || '—'}</b>
                  <span>Région</span><b className="text-right">{ov.region || '—'}</b>
                  {/* Population affichée PAR SOURCE (pas de cumul JP+IMB).
                      Chaque source garde son propre chiffre de population. */}
                  {activeSourceRows.filter((s) => s.population).map((src) => (
                    <React.Fragment key={`pop-${src._id}`}>
                      <span>Population {SOURCE_LABELS[src.sourceType] || src.sourceType}</span>
                      <b className="text-right">{Number(src.population).toLocaleString('fr-FR')}</b>
                    </React.Fragment>
                  ))}
                  <span>Langue principale</span><b className="text-right">{ov.language || '—'}</b>
                  <span>Religion principale</span><b className="text-right">{ov.religion || '—'}</b>
                </div>
                {ov.description ? (
                  <p className={`mt-1 ${subtleText(theme)}`}>
                    {ov.description.length > 220 ? ov.description.slice(0, 220) + '…' : ov.description}
                  </p>
                ) : (
                  <p className={`mt-1 italic ${subtleText(theme)}`}>{profile ? 'Aucune description.' : 'Chargement…'}</p>
                )}
              </div>
            )}

            {detailTab === 'sources' && (
              <div>
                <p className="mb-1 font-semibold">Sources actives ({activeSourceRows.length})</p>
                {activeSourceRows.map((src) => (
                  <div key={src._id} className="mb-2 rounded-lg border border-neutral-200/40 p-2">
                    <div className="font-semibold">{SOURCE_LABELS[src.sourceType] || src.sourceType}</div>
                    <div className={subtleText(theme)}>{src.sourceName || '—'} · {src.countryName || src.countryCode || ''}</div>
                    {src.population ? <div className={subtleText(theme)}>Population : {Number(src.population).toLocaleString('fr-FR')}</div> : null}
                    <div className={subtleText(theme)}>ID {src.sourceType} : {src.sourceRecordId}</div>
                    <div className={subtleText(theme)}>Dernière synchro : {fmtDate((profile?.sources || []).find((p) => p.sourceRecordId === src.sourceRecordId)?.lastSyncedAt) || '—'}</div>
                  </div>
                ))}
                {detail && activeSourceRows.length === 0 && (
                  <p className={`italic ${subtleText(theme)}`}>Aucune source active — activez une source pour voir ses attributs.</p>
                )}
                {!detail && <p className={subtleText(theme)}>Chargement des sources…</p>}
                {detail?.sources?.length ? (
                  <p className="mt-1 text-[11px] text-indigo-500">Voir toutes les sources ({detail.sources.length})</p>
                ) : null}
              </div>
            )}

            {detailTab === 'population' && (
              <div className="flex flex-col gap-1.5">
                {/* Population par source, jamais cumulée : chaque source (JP,
                    IMB/CPPI, …) conserve son propre chiffre. */}
                <p className="font-semibold">Population par source</p>
                {activeSourceRows.length ? activeSourceRows.map((src) => (
                  <div key={src._id} className="flex items-center justify-between">
                    <span>{SOURCE_LABELS[src.sourceType] || src.sourceType}</span>
                    <span>{src.population ? Number(src.population).toLocaleString('fr-FR') : '—'}</span>
                  </div>
                )) : <p className={`italic ${subtleText(theme)}`}>Non disponible.</p>}
                <p className={`mt-1 text-[11px] italic ${subtleText(theme)}`}>
                  Les populations ne sont pas additionnées entre sources (une même
                  population peut être décrite par plusieurs sources).
                </p>
              </div>
            )}

            {detailTab === 'localisation' && (
              <div className="flex flex-col gap-1.5">
                <p className="font-semibold">Point représentatif <span className={`font-normal ${subtleText(theme)}`}>(méthode : {profile?.localisation?.method || 'Calculée'})</span></p>
                {(() => {
                  const rep = profile?.localisation?.representative
                    || (Array.isArray(selected.coordinates) && selected.coordinates.length === 2 ? selected.coordinates : null)
                  return (
                    <p className={subtleText(theme)}>
                      {rep ? `Lat ${Number(rep[1]).toFixed(4)}, Lng ${Number(rep[0]).toFixed(4)}` : '—'}
                    </p>
                  )
                })()}
                {profile?.localisation?.sourcePoints?.length ? (
                  <>
                    <p className="mt-1 font-semibold">Points des sources</p>
                    {profile.localisation.sourcePoints.map((sp) => (
                      <div key={sp.sourceType} className={`flex items-center justify-between ${subtleText(theme)}`}>
                        <span>{SOURCE_LABELS[sp.sourceType] || sp.sourceType}</span>
                        <span>{Number(sp.coordinates[1]).toFixed(3)}, {Number(sp.coordinates[0]).toFixed(3)}</span>
                      </div>
                    ))}
                  </>
                ) : null}
                {aliasNames.length > 0 && (
                  <>
                    <p className="mt-1 font-semibold">Autres noms</p>
                    <p className={subtleText(theme)}>{aliasNames.join(', ')}</p>
                  </>
                )}
                <p className="mt-1 font-semibold">Couverture territoriale</p>
                {coverage ? (
                  <>
                    <p className={subtleText(theme)}>
                      Région : {coverage.counts.region} · Districts : {coverage.counts.departement} · Sous-districts : {coverage.counts.arrondissement} · Villages : {coverage.counts.village}
                    </p>
                    {coverage.territories?.length ? (
                      <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-neutral-200/40">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className={subtleText(theme)}>
                              <th className="px-2 py-1 text-left font-semibold">Territoire</th>
                              <th className="px-2 py-1 text-left font-semibold">Niveau</th>
                              <th className="px-2 py-1 text-right font-semibold">Pop.</th>
                            </tr>
                          </thead>
                          <tbody>
                            {coverage.territories.slice(0, 30).map((t, i) => (
                              <tr key={`${t.level}-${t.name}-${i}`} className="border-t border-neutral-200/30">
                                <td className="px-2 py-1">{t.name}</td>
                                <td className="px-2 py-1">{t.level}</td>
                                <td className="px-2 py-1 text-right">{t.population ? Number(t.population).toLocaleString('fr-FR') : '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className={`italic ${subtleText(theme)}`}>Aucun territoire rattaché.</p>
                    )}
                  </>
                ) : (
                  <p className={subtleText(theme)}>Calcul de la couverture…</p>
                )}
                <button
                  onClick={() => { setMapMode('coverage'); if (selected.country) setSelectedCountry(selected.country) }}
                  className="mt-1 self-start rounded-md bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700"
                >
                  Voir en mode Couverture
                </button>
              </div>
            )}

            {detailTab === 'activites' && (
              <div className="flex flex-col gap-1.5">
                {!activities && <p className={subtleText(theme)}>Chargement des activités…</p>}
                {activities && activities.activities.length === 0 && (
                  <p className={`italic ${subtleText(theme)}`}>Aucune activité liée à ce peuple.</p>
                )}
                {activities && activities.activities.map((a) => (
                  <div key={a.id} className="rounded-lg border border-neutral-200/40 p-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{a.type}</span>
                      <span className={subtleText(theme)}>{fmtDate(a.date) || '—'}</span>
                    </div>
                    <p className={subtleText(theme)}>{a.description}</p>
                    <div className={`mt-0.5 flex items-center gap-2 text-[10px] ${subtleText(theme)}`}>
                      {a.village && <span>📍 {a.village}</span>}
                      {a.participants ? <span>👥 {a.participants}</span> : null}
                      {a.user && <span>· {a.user}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {detailTab === 'notes' && (
              <p className={`italic ${subtleText(theme)}`}>Aucune note (données backend requises).</p>
            )}
          </div>
        </div>
      )}

      {/* ── Map ───────────────────────────────────────────────────── */}
      {zooming && mapMode === 'coverage' && (
        <div className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-[1001] rounded-full px-3 py-1 text-[11px] font-medium shadow-md backdrop-blur-md ${panelCls(theme)}`}>
          Affichage : {LEVEL_LABELS[levelOverride] || 'Auto (zoom)'} — Zoom {mapInstance?.getZoom?.() || 5}
        </div>
      )}

      <MapContainer ref={setMapInstance} center={[7, 20]} zoom={5} className="h-full w-full" preferCanvas worldCopyJump>
        <TileLayer
          key={theme}
          url={THEME_TILES[theme].url}
          attribution={THEME_TILES[theme].attribution}
          crossOrigin="anonymous"
        />
        {/* Recentre la carte sur le niveau administratif sélectionné. */}
        {selectedAdminFeature && <FitToFeature feature={selectedAdminFeature} />}
        {/* Tracé orange de la sélection : sous-niveau admin si choisi, sinon le
            contour du PAYS sélectionné. Obéit au filtre. */}
        {outlineFeature && <SelectionOutline feature={outlineFeature} />}
        {mapMode === 'coverage' && (
          <CoverageLayer visible countryCode={coverageCountry} peoples={coveragePeoples} levelOverride={levelOverride} onPeopleClick={goToPeopleSheet} />
        )}
        {/* Calque « Lieux / Locations » : les POINTS des peuples et engagements.
            Affiché en mode terrain OU dès que le calque Lieux est actif — donc
            possible SIMULTANÉMENT avec la couverture. */}
        {(mapMode !== 'coverage' || showLocations) && !isLoading && !error && (
          <>
            {/* Pastilles rondes JP/IMB (« master people »). */}
            <MasterPeopleLayer markers={displayMarkers} activeSources={activeSources} onSelect={setSelected} />
            {/* Couche SÉPARÉE des peuples DMM (distincte des points JP / IMB).
                Un clic ouvre un popup avec un bouton vers la fiche du peuple. */}
            {activeSources.has('DMM') && (
              <DmmPeopleLayer peoples={dmmVisible.filter(hasValidCoords)} />
            )}
          </>
        )}
      </MapContainer>
    </div>
  )
}
