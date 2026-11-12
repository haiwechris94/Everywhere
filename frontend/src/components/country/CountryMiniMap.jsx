import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { MapContainer, ImageOverlay, CircleMarker, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { MapPin, ArrowRight } from 'lucide-react'

/**
 * CountryMiniMap — mini-carte de localisation.
 * Affiche la carte d'Afrique (image statique servie depuis /public) dans un
 * conteneur Leaflet (CRS.Simple) et met en évidence le pays concerné à l'aide
 * d'un repère coloré positionné à partir du centroïde approximatif du pays.
 */

const AFRICA_IMG = '/afrique_fr09.webp'

// Boîte englobante approximative de la carte d'Afrique (projection ~équirectangulaire).
const BBOX = { west: -18, east: 52, north: 38, south: -35 }

// Centroïdes approximatifs (lat, lng) par code ISO alpha-2 — pour placer le repère.
const CENTROIDS = {
  DZ: [28.0, 2.6], AO: [-11.2, 17.9], BJ: [9.3, 2.3], BW: [-22.3, 24.7], BF: [12.3, -1.7],
  BI: [-3.4, 29.9], CM: [5.7, 12.7], CV: [16.0, -24.0], CF: [6.6, 20.9], TD: [15.4, 18.7],
  KM: [-11.6, 43.3], CG: [-0.7, 15.8], CD: [-2.9, 23.6], CI: [7.5, -5.5], DJ: [11.8, 42.6],
  EG: [26.8, 30.8], GQ: [1.6, 10.5], ER: [15.2, 39.8], SZ: [-26.5, 31.5], ET: [9.1, 40.5],
  GA: [-0.6, 11.8], GM: [13.4, -15.3], GH: [7.9, -1.0], GN: [9.9, -9.7], GW: [12.0, -15.0],
  KE: [0.2, 37.9], LS: [-29.6, 28.2], LR: [6.4, -9.4], LY: [26.3, 17.2], MG: [-18.8, 46.9],
  MW: [-13.3, 34.3], ML: [17.6, -4.0], MR: [21.0, -10.9], MU: [-20.3, 57.6], MA: [31.8, -7.1],
  MZ: [-18.7, 35.5], NA: [-22.0, 18.5], NE: [17.6, 8.1], NG: [9.1, 8.7], RW: [-2.0, 29.9],
  SN: [14.5, -14.5], SL: [8.5, -11.8], SO: [5.2, 46.2], ZA: [-29.0, 25.0], SS: [7.3, 30.3],
  SD: [15.6, 30.2], TZ: [-6.4, 34.9], TG: [8.6, 0.8], TN: [33.9, 9.6], UG: [1.4, 32.3],
  ZM: [-13.1, 27.8], ZW: [-19.0, 29.8],
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

function FitBounds({ bounds }) {
  const map = useMap()
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [6, 6] })
  }, [bounds, map])
  return null
}

export default function CountryMiniMap({ country = null, region = null, code = null, mapTo = null, isFrench = true }) {
  const [dims, setDims] = useState(null)

  useEffect(() => {
    let active = true
    const img = new Image()
    img.onload = () => { if (active) setDims({ w: img.naturalWidth || 1000, h: img.naturalHeight || 1000 }) }
    img.onerror = () => { if (active) setDims({ w: 1000, h: 1000 }) }
    img.src = AFRICA_IMG
    return () => { active = false }
  }, [])

  const iso2 = String(code || country?.code || '').toUpperCase()
  const name = country?.name || country?.nameEn || iso2 || (isFrench ? 'Pays' : 'Country')
  const regionName = region?.name || country?.region || null

  const bounds = dims ? [[0, 0], [dims.h, dims.w]] : null

  const markerPos = useMemo(() => {
    if (!dims) return null
    const c = CENTROIDS[iso2]
      || (Array.isArray(country?.defaultCenter) ? [country.defaultCenter[1], country.defaultCenter[0]] : null)
    if (!c) return null
    const [lat, lng] = c
    const nx = clamp01((lng - BBOX.west) / (BBOX.east - BBOX.west))
    const ny = clamp01((BBOX.north - lat) / (BBOX.north - BBOX.south))
    return [dims.h * (1 - ny), dims.w * nx]
  }, [dims, iso2, country])

  return (
    <section className="rounded-[20px] border border-[#DCE6F5] bg-white p-4 shadow-[0_4px_20px_rgba(30,60,120,0.06)] dark:bg-slate-800">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin size={18} className="text-[#2563EB]" />
          <div>
            <p className="text-sm font-bold text-[#0F2A5C]">{name}</p>
            {regionName && <p className="text-xs text-[#6B7A99]">{regionName}</p>}
          </div>
        </div>
        {mapTo && (
          <Link to={mapTo} className="inline-flex items-center gap-1 text-xs font-semibold text-[#2563EB] hover:underline">
            {isFrench ? 'Voir le pays' : 'View country'} <ArrowRight size={14} />
          </Link>
        )}
      </div>

      <div className="h-72 w-full overflow-hidden rounded-[14px] bg-[#EAF2FE]">
        {bounds ? (
          <MapContainer
            crs={L.CRS.Simple}
            bounds={bounds}
            minZoom={-5}
            maxZoom={4}
            zoomControl={false}
            attributionControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            touchZoom={false}
            boxZoom={false}
            keyboard={false}
            className="h-full w-full"
            style={{ background: '#EAF2FE' }}
          >
            <ImageOverlay url={AFRICA_IMG} bounds={bounds} />
            {markerPos && (
              <CircleMarker
                center={markerPos}
                radius={17}
                pathOptions={{ color: '#f97316', weight: 2, fillColor: '#f97316', fillOpacity: 0.22 }}
              />
            )}
            {markerPos && (
              <CircleMarker
                center={markerPos}
                radius={6}
                pathOptions={{ color: '#ea580c', weight: 2, fillColor: '#f97316', fillOpacity: 0.95 }}
              >
                <Tooltip permanent direction="top" offset={[0, -8]} className="!border-0 !bg-transparent !p-0 !shadow-none">
                  <span className="rounded bg-[#0F2A5C] px-1.5 py-0.5 text-xs font-semibold text-white">{name}</span>
                </Tooltip>
              </CircleMarker>
            )}
            <FitBounds bounds={bounds} />
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[#6B7A99]">…</div>
        )}
      </div>

      {!markerPos && (
        <p className="mt-2 text-xs text-[#6B7A99]">
          {isFrench
            ? 'Localisation approximative indisponible pour ce pays.'
            : 'Approximate location unavailable for this country.'}
        </p>
      )}
    </section>
  )
}
