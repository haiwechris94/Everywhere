import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Home,
  MoreVertical,
  MapPin,
  BookOpen,
  MessageSquare,
  Users,
  AlertTriangle,
  Globe,
  Target,
  Calendar,
} from 'lucide-react'
import { reportingApi, initiativesApi } from '../services/reportingApi'
import { masterPeopleApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { StateLoading, StateError, StatCard } from './geography/geoComponents'
import { jpStageFor, evangelicalRangeFor, bibleStatusLabel } from '../utils/joshuaProjectScales'
import { getCountryFlag } from '../utils/countryUtils'
import { DmmStatusDot } from '../components/DmmStatusBadge'
import { useLanguage } from '../i18n'
import { initiativeDisplayName } from '../utils/initiativeLabel'

// ── Palette de statut canonique ──────────────────────────────────────────────
// Hex alignés sur STATUS_COLORS / STATUS_COLORS_FILL de UnifiedMapView.jsx.
// On mappe un statut (JP stage, DMM status, status.global) vers l'un de ces
// tons de base, puis on en dérive les teintes claires / translucides pour la
// grande carte extérieure et le dégradé de la carte « Statut ».
const STATUS_HEX = {
  movement: '#15803d',      // Movement / reached (vert foncé)
  reached: '#15803d',
  tippingpoint: '#22c55e',  // Basculement (vert)
  midway: '#eab308',        // Mi-parcours (jaune)
  pioneer: '#f97316',       // Pionnier / frontier (orange)
  frontier: '#f97316',
  unreached: '#ef4444',     // Non-atteint (rouge)
  unknown: '#9ca3af',       // Inconnu / sans info (gris)
  noinfo: '#9ca3af',
}

// Normalise un libellé de statut (JP stage, DMM, status.global) vers une clé
// de STATUS_HEX. Couvre les libellés JP (« Significantly reached », « Unreached
// (Frontier) », « Partially reached », …) et le vocabulaire DMM.
function statusKeyFor(status) {
  const raw = String(status || '').toLowerCase()
  const norm = raw.replace(/[\s_()-]+/g, '')
  if (STATUS_HEX[norm]) return norm
  if (norm.includes('frontier') || norm.includes('pioneer')) return 'pioneer'
  if (norm.includes('tipping')) return 'tippingpoint'
  if (norm.includes('midway') || norm.includes('minimallyreached')) return 'midway'
  if (
    norm.includes('significantlyreached') ||
    norm.includes('partiallyreached') ||
    norm.includes('movement') ||
    norm.includes('dmm') ||
    (norm.includes('reached') && !norm.includes('unreached'))
  ) {
    return 'movement'
  }
  if (norm.includes('unreached') || norm.includes('unengaged')) return 'unreached'
  return 'unknown'
}

// Hex de base pour un statut (ajouté car statusColorFor n'exposait que des
// classes Tailwind, pas de hex). Réutilise la palette canonique ci-dessus.
function statusHexFor(status) {
  return STATUS_HEX[statusKeyFor(status)] || STATUS_HEX.unknown
}

// Convertit un hex #rrggbb en « rgba(r,g,b,alpha) » pour les teintes/translucides.
function hexToRgba(hex, alpha) {
  const h = String(hex || '').replace('#', '')
  if (h.length !== 6) return `rgba(148,163,184,${alpha})`
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// Libellés lisibles pour les codes de source de population.
const SOURCE_LABELS = {
  JP: 'Joshua Project',
  CPPI: 'IMB / PeopleGroups.org',
  DMM: 'DMM',
  FTT: 'Finishing the Task',
  SURVEY: 'Enquête',
  MANUAL: 'Manuel',
}
const sourceLabel = (code) => SOURCE_LABELS[code] || code || '—'

// Formate un nombre à la française, ou '—' si absent.
const fmtNum = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : '—')

// Formate un point [lng, lat] en « lat, lng ».
const fmtPoint = (pt) =>
  Array.isArray(pt) && pt.length >= 2 && pt[0] != null && pt[1] != null
    ? `${Number(pt[1]).toFixed(4)}, ${Number(pt[0]).toFixed(4)}`
    : null

// ── Jauge circulaire (SVG) de la carte « Statut » ───────────────────────────
// Piste blanche translucide + arc de progression (jpScale / 5) plus clair, avec
// un disque blanc au centre portant une icône « groupe de personnes » colorée.
function StatusGauge({ progress, statusHex }) {
  const size = 92
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const dash = Math.max(0, Math.min(1, progress || 0)) * c
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="shrink-0"
      role="img"
      aria-label={`Progression Joshua Project ${Math.round((progress || 0) * 100)}%`}
    >
      {/* Piste de fond translucide. */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth={stroke}
      />
      {/* Arc de progression (blanc plus clair). */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${c - dash}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      {/* Disque blanc central + icône groupe. */}
      <circle cx={size / 2} cy={size / 2} r={r - stroke - 4} fill="#ffffff" />
      <g transform={`translate(${size / 2 - 9}, ${size / 2 - 9})`} style={{ color: statusHex }}>
        {/* Icône « group of people » (contour simple, 18x18). */}
        <path
          d="M6 8a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 6 8Zm6 0a2.4 2.4 0 1 0 0-4.8A2.4 2.4 0 0 0 12 8ZM2 15c0-2.2 1.8-3.6 4-3.6s4 1.4 4 3.6M10 15c0-2.2 1.8-3.6 4-3.6s2 .6 2.6 1.4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  )
}

// ── Menu d'actions (kebab vertical) de la barre supérieure ──────────────────
// Réutilise les actions existantes de la fiche (ajouter un engagement).
function ActionsMenu({ isFrench, onAddEngagement }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={isFrench ? 'Actions' : 'Actions'}
      >
        <MoreVertical className="h-5 w-5" aria-hidden="true" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          role="menu"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onAddEngagement && onAddEngagement() }}
            className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            {isFrench ? 'Ajouter un engagement' : 'Add an engagement'}
          </button>
        </div>
      )}
    </div>
  )
}

// Format d'affichage unifié : « nom du peuple, nom du village ».
function peopleVillageLabel(peopleName, villageName) {
  const p = (peopleName || '').trim()
  const v = (villageName || '').trim()
  if (p && v) return `${p}, ${v}`
  return p || v || '—'
}

// Formulaire d'ajout manuel d'un village (engagement DMM) à un peuple.
function AddVillageForm({ peopleId, peopleName, onAdded, openSignal, onConsumeOpen }) {
  const { isFrench } = useLanguage()
  const empty = {
    villageName: '', latitude: '', longitude: '',
    engagementStatus: 'pioneer', numberOfChurches: 0, churchGeneration: 0,
  }
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Ouvre le formulaire quand le menu kebab déclenche « Ajouter un engagement ».
  if (openSignal && !open) {
    setOpen(true)
    onConsumeOpen && onConsumeOpen()
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.villageName.trim()) { setError(isFrench ? 'Le nom du village est requis.' : 'The village name is required.'); return }
    setSaving(true); setError('')
    try {
      await masterPeopleApi.addVillage(peopleId, {
        villageName: form.villageName.trim(),
        latitude: form.latitude !== '' ? Number(form.latitude) : undefined,
        longitude: form.longitude !== '' ? Number(form.longitude) : undefined,
        engagementStatus: form.engagementStatus,
        numberOfChurches: Number(form.numberOfChurches) || 0,
        churchGeneration: Number(form.churchGeneration) || 0,
      })
      setForm(empty); setOpen(false)
      onAdded && onAdded()
    } catch (err) {
      setError(err?.response?.data?.error || (isFrench ? 'Échec de l’ajout de l’engagement.' : 'Failed to add the engagement.'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        {isFrench ? '+ Ajouter un engagement' : '+ Add an engagement'}
      </button>
    )
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
      <p className="text-sm font-semibold text-slate-700">{isFrench ? `Nouvel engagement pour « ${peopleName} »` : `New engagement for “${peopleName}”`}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-500">
          {isFrench ? 'Nom du village *' : 'Village name *'}
          <input value={form.villageName} onChange={set('villageName')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? "Statut d'engagement" : 'Engagement status'}
          <select value={form.engagementStatus} onChange={set('engagementStatus')} className="mt-1 w-full rounded border px-2 py-1 text-sm">
            <option value="pioneer">{isFrench ? 'Pionnier' : 'Pioneer'}</option>
            <option value="midway">{isFrench ? 'Mi-parcours' : 'Midway'}</option>
            <option value="tipping-point">{isFrench ? 'Basculement' : 'Tipping point'}</option>
            <option value="dmm">{isFrench ? 'Mouvement' : 'Movement'}</option>
            <option value="unreached">{isFrench ? 'Non-atteint' : 'Unreached'}</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          Latitude
          <input value={form.latitude} onChange={set('latitude')} type="number" step="any" placeholder={isFrench ? '(par défaut : point du peuple)' : '(default: people group point)'} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          Longitude
          <input value={form.longitude} onChange={set('longitude')} type="number" step="any" placeholder={isFrench ? '(par défaut : point du peuple)' : '(default: people group point)'} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? "Nombre d'églises" : 'Number of churches'}
          <input value={form.numberOfChurches} onChange={set('numberOfChurches')} type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? "Génération d'églises" : 'Church generation'}
          <input value={form.churchGeneration} onChange={set('churchGeneration')} type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? (isFrench ? 'Ajout…' : 'Adding…') : (isFrench ? 'Enregistrer' : 'Save')}
        </button>
        <button type="button" onClick={() => { setOpen(false); setError('') }} className="rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-600">
          {isFrench ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}

// Formulaire d'édition en ligne d'un engagement (village) existant.
function EditVillageForm({ peopleId, village, onSaved, onCancel }) {
  const { isFrench } = useLanguage()
  const [form, setForm] = useState({
    villageName: village.villageName || '',
    engagementStatus: village.engagementStatus || 'pioneer',
    numberOfChurches: village.numberOfChurches ?? 0,
    churchGeneration: village.churchGeneration ?? 0,
    region: village.region || '',
    admin2: village.admin2 || '',
    admin3: village.admin3 || '',
    latitude: '',
    longitude: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    if (!form.villageName.trim()) { setError(isFrench ? 'Le nom du village est requis.' : 'The village name is required.'); return }
    setSaving(true); setError('')
    try {
      await masterPeopleApi.updateVillage(peopleId, village.id, {
        villageName: form.villageName.trim(),
        engagementStatus: form.engagementStatus,
        numberOfChurches: Number(form.numberOfChurches) || 0,
        churchGeneration: Number(form.churchGeneration) || 0,
        region: form.region.trim(),
        admin2: form.admin2.trim(),
        admin3: form.admin3.trim(),
        ...(form.latitude !== '' ? { latitude: Number(form.latitude) } : {}),
        ...(form.longitude !== '' ? { longitude: Number(form.longitude) } : {}),
      })
      onSaved && onSaved()
    } catch (err) {
      setError(err?.response?.data?.error || (isFrench ? 'Échec de la modification de l’engagement.' : 'Failed to update the engagement.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 rounded-lg border border-slate-200 p-3 space-y-2 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className="text-xs text-slate-500">
          {isFrench ? 'Nom du village *' : 'Village name *'}
          <input value={form.villageName} onChange={set('villageName')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? "Statut d'engagement" : 'Engagement status'}
          <select value={form.engagementStatus} onChange={set('engagementStatus')} className="mt-1 w-full rounded border px-2 py-1 text-sm">
            <option value="pioneer">{isFrench ? 'Pionnier' : 'Pioneer'}</option>
            <option value="midway">{isFrench ? 'Mi-parcours' : 'Midway'}</option>
            <option value="tipping-point">{isFrench ? 'Basculement' : 'Tipping point'}</option>
            <option value="dmm">{isFrench ? 'Mouvement' : 'Movement'}</option>
            <option value="unreached">{isFrench ? 'Non-atteint' : 'Unreached'}</option>
          </select>
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? "Nombre d'églises" : 'Number of churches'}
          <input value={form.numberOfChurches} onChange={set('numberOfChurches')} type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? "Génération d'églises" : 'Church generation'}
          <input value={form.churchGeneration} onChange={set('churchGeneration')} type="number" min="0" className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? 'Région' : 'Region'}
          <input value={form.region} onChange={set('region')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? 'Département' : 'Department'}
          <input value={form.admin2} onChange={set('admin2')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? 'Arrondissement' : 'Subdivision'}
          <input value={form.admin3} onChange={set('admin3')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? (isFrench ? 'Enregistrement…' : 'Saving…') : (isFrench ? 'Enregistrer' : 'Save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded-lg border px-3 py-1.5 text-sm font-semibold text-slate-600">
          {isFrench ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}

const PeopleDetailLite = () => {
  const { isFrench } = useLanguage()
  const { regionId, countryCode, peopleId } = useParams()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  // Seuls les administrateurs et superviseurs peuvent modifier le commentaire.
  const canManage = !!user && (user.role === 'admin' || user.role === 'supervisor')
  const [editingId, setEditingId] = useState(null)
  // Déclenche l'ouverture du formulaire d'ajout d'engagement depuis le menu kebab.
  const [actionsAddVillage, setActionsAddVillage] = useState(false)

  // Primary: the master-people profile (nested under `overview`, no DMM rollup).
  const profileQuery = useQuery({
    queryKey: ['ng-person-profile', peopleId],
    queryFn: async () => {
      const res = await reportingApi.getPerson(peopleId)
      return res?.data
    },
    enabled: !!peopleId,
    retry: false,
  })

  // Fallback / enrichment: the flat peoples row carries dmm.* + status.global.
  const rowQuery = useQuery({
    queryKey: ['ng-person-row', countryCode, peopleId],
    queryFn: async () => {
      const res = await reportingApi.getPeoples({ countries: countryCode, limit: 200 })
      const list = Array.isArray(res?.data?.data) ? res.data.data : []
      return list.find((p) => String(p.masterPeopleId) === String(peopleId)) || null
    },
    enabled: !!countryCode && !!peopleId,
    retry: false,
  })

  // Appartenance aux initiatives (ESP 300, YCS) pour afficher les cases OUI/NON.
  const membershipQuery = useQuery({
    queryKey: ['initiative-membership', peopleId],
    queryFn: async () => {
      const res = await initiativesApi.membership(peopleId)
      return res?.data?.data || { ESP300: false, YCS: false }
    },
    enabled: !!peopleId,
    retry: false,
  })
  const membership = membershipQuery.data || { ESP300: false, YCS: false }

  const loading = profileQuery.isLoading && rowQuery.isLoading
  if (loading) return <div className="p-6"><StateLoading label={isFrench ? 'Chargement du peuple…' : 'Loading people group…'} /></div>

  const profile = profileQuery.data || null
  const overview = profile?.overview || profile || {}
  const row = rowQuery.data || null

  const name =
    overview.name ||
    profile?.canonicalName ||
    row?.canonicalName ||
    profile?.name ||
    (isFrench ? 'Peuple' : 'People group')

  const hasAnything = profile || row
  if (!hasAnything) {
    if (profileQuery.isError && rowQuery.isError) {
      return <div className="p-6"><StateError label={isFrench ? 'Peuple introuvable.' : 'People group not found.'} /></div>
    }
    return <div className="p-6">{isFrench ? 'Peuple introuvable.' : 'People group not found.'}</div>
  }

  const dmm = row?.dmm || profile?.dmm || null
  // Enriched people details (from the Cameroon_PGs import, surfaced by the
  // master-people profile endpoint as `dmmDetail`). Prefer the detailed
  // profile payload, but fall back to the reporting aggregate so imported rows
  // still render even when the profile payload is thin.
  const reportingDmm = Array.isArray(profile?.dmm?.engagements) && profile.dmm.engagements.length
    ? profile.dmm
    : dmm
  const dmmDetail = profile?.dmmDetail || (reportingDmm ? {
    region: reportingDmm.engagements?.[0]?.region || null,
    department: reportingDmm.engagements?.[0]?.admin2 || null,
    subdivision: reportingDmm.engagements?.[0]?.admin3 || null,
    engagementStatus: reportingDmm.engagements?.[0]?.engagementStatus || null,
    engagementLevel: reportingDmm.engagements?.[0]?.engagementLevel || null,
    language: null,
    religion: null,
    affinityGroup: null,
    urbanRural: null,
    startYear: null,
    population: null,
    donor: null,
    nationalCoordinator: null,
    churchPlanter: null,
    numberOfChurches: reportingDmm.totalChurches ?? 0,
    churchGeneration: reportingDmm.maxGeneration ?? 0,
    villagesTouched: reportingDmm.villagesTouched ?? 0,
    description: null,
    villages: Array.isArray(reportingDmm.engagements) ? reportingDmm.engagements : [],
  } : null)

  const statusGlobal =
    row?.status?.global ||
    (typeof overview.status === 'string' ? overview.status : overview.status?.global) ||
    'UNKNOWN'

  // Valeurs de référence Joshua Project (dérivées de AllProgressLevelsListing.csv).
  const jpScale = overview.jpScale ?? row?.status?.jpScale ?? null
  const jpScaleValue = jpScale // alias historique conservé
  const jpStage = jpStageFor(jpScaleValue)
  // Statut du peuple = statut Joshua Project (JP stage). On n'affiche plus le
  // statut DMM générique dans l'en-tête : le statut JP devient le statut de la
  // fiche (hero/carte Statut). Repli sur status.global si le JP stage est absent.
  const jpStatus = jpStage || statusGlobal
  // Description lisible du JPScale (« 5 — Significantly reached »), repli dérivé.
  const jpScaleDescription =
    overview.jpScaleDescription ||
    overview.jpStage ||
    (jpStage ? `${jpScaleValue ?? ''}${jpScaleValue != null ? ' — ' : ''}${jpStage}` : null)
  // Couleur de base dérivée du statut JP (palette canonique) + teintes.
  const statusHex = statusHexFor(jpStatus)
  const statusTintBg = hexToRgba(statusHex, 0.06)       // fond très clair carte extérieure
  const statusBorder = hexToRgba(statusHex, 0.35)       // bordure fine couleur-statut
  const statusChipBg = hexToRgba(statusHex, 0.1)        // fond des chips pâles
  const statusLabelColor = hexToRgba(statusHex, 0.85)   // petits libellés en couleur-statut
  const statusGradient = `linear-gradient(90deg, ${statusHex} 0%, ${hexToRgba(statusHex, 0.82)} 100%)`
  // Progression de la jauge (jpScale / 5), bornée [0,1].
  const gaugeProgress = jpScaleValue != null ? Math.min(1, Math.max(0, Number(jpScaleValue) / 5)) : 0
  // PctEvangelicalRange : la fourchette officielle liée au JPScale sert de repli
  // lorsqu'aucun pourcentage précis n'est disponible sur le peuple.
  const pctEvangelicalRange =
    overview.percentEvangelical != null
      ? `${overview.percentEvangelical}%`
      : evangelicalRangeFor(jpScaleValue)
  // PrimaryLanguageName : champ dédié du registre, avec repli sur la langue générique.
  const primaryLanguageName = overview.primaryLanguageName || overview.language || null
  // Bible Translation status : « code — signification » (ex. « 4 — New Testament »).
  const bibleTranslationStatus = bibleStatusLabel(
    overview.bibleStatus ?? row?.status?.bibleStatus
  )

  // Données enrichies du profil master-people.
  const aliases = Array.isArray(profile?.aliases) ? profile.aliases.filter(Boolean) : []
  const populationInfo = profile?.population || null
  const bySource = Array.isArray(populationInfo?.bySource) ? populationInfo.bySource : []
  const populationTotal =
    typeof populationInfo?.total === 'number' ? populationInfo.total : null
  const hasPopulationBySource =
    (populationTotal ?? 0) > 0 ||
    bySource.some((s) => typeof s?.population === 'number' && s.population != null)
  const localisation = profile?.localisation || null
  const representativePoint = fmtPoint(localisation?.representative)
  const sourcePoints = Array.isArray(localisation?.sourcePoints) ? localisation.sourcePoints : []
  const hasLocalisation = !!representativePoint || sourcePoints.length > 0
  const photoUrl = overview.photoUrl || null

  // Valeurs présentées dans la mise en page façon maquette (repli « — »).
  const dash = '—'
  const countryCodeDisplay = overview.country || row?.primaryCountryCode || countryCode || dash
  const religionDisplay = overview.religion || dash
  const regionDisplay = overview.region || dash
  const languageDisplay = primaryLanguageName || dash
  const descriptionDisplay = overview.description || (dmmDetail && dmmDetail.description) || null
  const jpScaleDisplay = jpScaleValue != null ? String(jpScaleValue) : dash
  const evangelicalDisplay = pctEvangelicalRange || dash
  const bibleTranslationDisplay = bibleTranslationStatus || dash
  const leastReachedValue = overview.leastReached ?? row?.status?.leastReached
  const leastReachedDisplay =
    leastReachedValue == null ? dash : (leastReachedValue ? (isFrench ? 'Oui' : 'Yes') : (isFrench ? 'Non' : 'No'))
  // ESP 300 / YCS n'ont pas de valeur « simple » exposée sur la fiche peuple :
  // seules les cases OUI/NON (membership) existent plus bas. On affiche donc le
  // statut d'appartenance comme valeur de la carte, avec repli « — ».
  const esp300Display = membership.ESP300 == null ? dash : (membership.ESP300 ? (isFrench ? 'Oui' : 'Yes') : (isFrench ? 'Non' : 'No'))
  const ycsDisplay = membership.YCS == null ? dash : (membership.YCS ? (isFrench ? 'Oui' : 'Yes') : (isFrench ? 'Non' : 'No'))
  const countryFlagEmoji = getCountryFlag(countryCodeDisplay)

  // ── DMM Rollup = CUMUL des mesures d'engagement sur TOUS les engagements ─────
  // Chaque carte additionne la mesure correspondante sur engagements[] ; repli
  // sur le total cumulé renvoyé par le backend (dmm.total*), puis sur le rollup
  // Option-B stocké sur le master (dmm.totalChurches / engagementCount / …).
  // Les engagements proviennent soit de la liste détaillée (profile.dmm /
  // reporting), soit — à défaut — du rollup agrégé.
  const engagementsList = Array.isArray(dmm?.engagements) ? dmm.engagements : []
  const sumEng = (field) =>
    engagementsList.reduce((sum, e) => sum + (Number(e[field]) || 0), 0)
  const maxEng = (field) =>
    engagementsList.reduce((mx, e) => Math.max(mx, Number(e[field]) || 0), 0)

  // # Churches = somme des églises de TOUS les engagements (repli sur les totaux cumulés).
  const churchesTotal = sumEng('numberOfChurches') || (dmm?.totalChurches ?? 0)
  // # max Gen reached = génération maximale atteinte sur l'ensemble des engagements.
  const maxGenerationTotal = Math.max(maxEng('churchGeneration'), dmm?.maxGeneration ?? 0)
  // # Total believers = cumul des nouveaux disciples/croyants.
  const totalBelievers =
    sumEng('newDisciples') ||
    dmm?.totalNewDisciples ||
    dmm?.window?.newDisciples ||
    0
  // # Baptisms = cumul des nouveaux baptisés.
  const totalBaptisms = sumEng('newBaptisms') || (dmm?.totalNewBaptisms ?? 0)
  // # Leaders in training = cumul des leaders en formation.
  const totalLeaders = sumEng('leadersInTraining') || (dmm?.totalLeadersInTraining ?? 0)
  // # Engagements / # Villages touched — nombre d'engagements / de villages distincts.
  const engagementCount = dmm?.engagementCount ?? engagementsList.length ?? 0
  const villagesTouchedTotal =
    dmm?.villagesTouched ??
    new Set(engagementsList.map((e) => (e.villageName || '').trim()).filter(Boolean)).size ??
    0

  const dmmCards = dmm
    ? [
        { label: '# Engagements', value: engagementCount },
        { label: '# Churches', value: churchesTotal },
        { label: '# max Gen reached', value: maxGenerationTotal },
        { label: '# Total believers', value: totalBelievers },
        { label: '# Baptisms', value: totalBaptisms },
        { label: '# Leaders in training', value: totalLeaders },
        { label: '# Villages Touched', value: villagesTouchedTotal },
      ]
    : []

  // Villages (sous-éléments du peuple). Priorité au dmmDetail.villages (grouped),
  // repli sur dmm.engagements. Normalisés pour l'affichage « peuple, village ».
  const villages = (
    Array.isArray(dmmDetail?.villages) && dmmDetail.villages.length
      ? dmmDetail.villages
      : (Array.isArray(dmm?.engagements) ? dmm.engagements : [])
  ).map((v) => ({
    id: v.id || v.peopleGroupId || `${v.villageName}-${v.numberOfChurches}`,
    // Vrai identifiant de l'engagement (document « village ») pour le lien vers
    // la fiche Engagement. Peut être absent pour un engagement non persisté.
    engagementId: v._id || v.id || v.peopleGroupId || null,
    villageName: v.villageName || null,
    engagementStatus: v.engagementStatus || null,
    numberOfChurches: v.numberOfChurches ?? 0,
    churchGeneration: v.churchGeneration ?? 0,
    region: v.region || null,
    admin2: v.admin2 || null,
    admin3: v.admin3 || null,
  }))

  const refreshPerson = () => {
    queryClient.invalidateQueries({ queryKey: ['ng-person-profile', peopleId] })
    queryClient.invalidateQueries({ queryKey: ['ng-person-row', countryCode, peopleId] })
    queryClient.invalidateQueries({ queryKey: ['dmm-peoples'] })
  }

  return (
    <div className="p-6 space-y-6">
      {/* ───────────────────────────────────────────────────────────────────────
          Carte extérieure façon maquette : grand bloc arrondi, fond blanc teinté
          très légèrement de la couleur du statut, bordure fine couleur-statut.
          ─────────────────────────────────────────────────────────────────── */}
      <div
        className="rounded-[24px] p-6 shadow-sm border"
        style={{ backgroundColor: statusTintBg, borderColor: statusBorder }}
      >
        {/* TOP BAR : fil d'Ariane (icône maison + liens) à gauche, kebab à droite. */}
        <div className="flex items-start justify-between gap-3">
          <nav className="flex items-center flex-wrap gap-1.5 text-sm" aria-label="Breadcrumb">
            <Home className="h-4 w-4 shrink-0" style={{ color: statusLabelColor }} aria-hidden="true" />
            <Link to="/regions" className="hover:underline" style={{ color: statusLabelColor }}>
              {isFrench ? 'Régions' : 'Regions'}
            </Link>
            <span style={{ color: statusLabelColor }}>/</span>
            <Link to={`/regions/${regionId}`} className="hover:underline" style={{ color: statusLabelColor }}>
              {regionDisplay !== dash ? regionDisplay : regionId}
            </Link>
            <span style={{ color: statusLabelColor }}>/</span>
            <Link
              to={`/regions/${regionId}/countries/${countryCode}`}
              className="hover:underline"
              style={{ color: statusLabelColor }}
            >
              {countryCode}
            </Link>
            <span style={{ color: statusLabelColor }}>/</span>
            <span className="font-bold text-slate-900">{name}</span>
          </nav>
          <ActionsMenu
            isFrench={isFrench}
            onAddEngagement={() => setActionsAddVillage(true)}
          />
        </div>

        {/* DEUX COLONNES : gauche ~35 %, droite ~65 %, séparateur vertical fin. */}
        <div className="mt-5 flex flex-col lg:flex-row lg:items-stretch gap-6">
          {/* ── COLONNE GAUCHE ─────────────────────────────────────────────── */}
          <div className="lg:w-[35%] lg:border-r lg:pr-6" style={{ borderColor: statusBorder }}>
            {/* 1. Photo paysage ~4:3. */}
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={isFrench ? `Photo du peuple ${name}` : `Photo of the ${name} people group`}
                onError={(e) => { e.currentTarget.style.display = 'none' }}
                className="w-full aspect-[4/3] rounded-2xl object-cover border border-slate-200"
              />
            ) : (
              <div
                className="w-full aspect-[4/3] rounded-2xl border border-slate-200 bg-white flex items-center justify-center"
                role="img"
                aria-label={isFrench ? `Aucune photo disponible pour le peuple ${name}` : `No photo available for the ${name} people group`}
              >
                <Users className="h-10 w-10 text-slate-300" aria-hidden="true" />
              </div>
            )}

            {/* 2. Titre = nom du peuple. */}
            <h1 className="mt-4 text-[36px] leading-tight font-bold text-slate-900">{name}</h1>

            {/* 3-4. Chips : localisation (épingle) + peuple/langue + religion. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: statusChipBg, color: statusLabelColor }}
              >
                <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                {regionDisplay}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: statusChipBg, color: statusLabelColor }}
              >
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                {languageDisplay}
              </span>
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
                style={{ backgroundColor: statusChipBg, color: statusLabelColor }}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                {religionDisplay}
              </span>
            </div>

            {/* 5. Description. */}
            <p className="mt-4 text-sm text-slate-600 leading-relaxed whitespace-pre-line">
              {descriptionDisplay || dash}
            </p>

            {/* 6. Deux petites cartes : drapeau + code pays ; JP Scale. */}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3 flex items-center gap-2">
                <span className="text-2xl leading-none" aria-hidden="true">{countryFlagEmoji}</span>
                <span className="font-bold text-slate-900">{countryCodeDisplay}</span>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-3">
                <p className="text-[11px] font-semibold" style={{ color: statusLabelColor }}>
                  {isFrench ? 'Échelle JP' : 'JP Scale'}
                </p>
                <p className="mt-0.5 font-bold text-slate-900">{jpScaleDisplay}</p>
              </div>
            </div>
          </div>

          {/* ── COLONNE DROITE ─────────────────────────────────────────────── */}
          <div className="lg:w-[65%] space-y-5">
            {/* A) CARTE HERO « STATUT » : dégradé couleur-statut, jauge, panneau 3 stats. */}
            <div
              className="relative rounded-[20px] p-6 pb-24 text-white"
              style={{ background: statusGradient, boxShadow: `0 10px 30px ${hexToRgba(statusHex, 0.35)}` }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-white/80">
                    <Target className="h-3.5 w-3.5" aria-hidden="true" />
                    {isFrench ? 'Statut' : 'Status'}
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <span
                      className="inline-block h-4 w-4 rounded-full ring-2 ring-white shrink-0"
                      style={{ backgroundColor: hexToRgba('#ffffff', 0.9) }}
                      aria-hidden="true"
                    />
                    <span className="text-[40px] leading-none font-bold text-white">{jpStatus || dash}</span>
                  </div>
                  {jpScaleDescription && (
                    <p className="mt-2 text-sm font-semibold text-white/90">{jpScaleDescription}</p>
                  )}
                </div>

                {/* Jauge circulaire (SVG) : piste translucide + arc de progression. */}
                <StatusGauge progress={gaugeProgress} statusHex={statusHex} />
              </div>

              {/* Panneau blanc en bas, chevauchant le dégradé, 3 colonnes. */}
              <div className="absolute left-6 right-6 -bottom-10 rounded-2xl bg-white border border-slate-200 shadow-md">
                <div className="grid grid-cols-3 divide-x divide-slate-100 text-center">
                  <div className="px-3 py-4">
                    <Users className="mx-auto h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                    <p className="mt-1 font-bold text-slate-900">{evangelicalDisplay}</p>
                    <p className="text-[11px] text-slate-500">{isFrench ? 'Évangéliques' : 'Evangelical'}</p>
                  </div>
                  <div className="px-3 py-4">
                    <Target className="mx-auto h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                    <p className="mt-1 font-bold text-slate-900">{jpScaleDisplay}</p>
                    <p className="text-[11px] text-slate-500">{isFrench ? 'Échelle JP' : 'JP Scale'}</p>
                  </div>
                  <div className="px-3 py-4">
                    <AlertTriangle className="mx-auto h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                    <p className="mt-1 font-bold text-slate-900">{leastReachedDisplay}</p>
                    <p className="text-[11px] text-slate-500">{isFrench ? 'Moins atteint' : 'Least Reached'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Espace pour le panneau chevauchant. */}
            <div className="h-10" aria-hidden="true" />

            {/* B) PANNEAU « Informations clés ». */}
            <div className="rounded-2xl p-5" style={{ backgroundColor: statusTintBg }}>
              <h2 className="flex items-center gap-2 font-bold text-slate-900">
                <AlertTriangle className="h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                {isFrench ? 'Informations clés' : 'Key Information'}
              </h2>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <BookOpen className="h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                  <p className="mt-2 text-[11px] font-semibold" style={{ color: statusLabelColor }}>
                    {isFrench ? 'Traduction de la Bible' : 'Bible Translation'}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-900">{bibleTranslationDisplay}</p>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <MessageSquare className="h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                  <p className="mt-2 text-[11px] font-semibold" style={{ color: statusLabelColor }}>
                    {isFrench ? 'Langue principale' : 'Primary Language'}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-900">{languageDisplay}</p>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                  <Users className="h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                  <p className="mt-2 text-[11px] font-semibold" style={{ color: statusLabelColor }}>
                    {isFrench ? 'Religion' : 'Religion'}
                  </p>
                  <p className="mt-0.5 font-bold text-slate-900">{religionDisplay}</p>
                </div>
              </div>
            </div>

            {/* C) Rangée de 3 cartes : Pays, ESP 300, YCS. */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                <Globe className="h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                <p className="mt-2 text-[11px] font-semibold" style={{ color: statusLabelColor }}>
                  {isFrench ? 'Pays' : 'Country'}
                </p>
                <p className="mt-0.5 font-bold text-slate-900 flex items-center gap-1.5">
                  <span className="text-lg leading-none" aria-hidden="true">{countryFlagEmoji}</span>
                  {countryCodeDisplay}
                </p>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                <Target className="h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                <p className="mt-2 text-[11px] font-semibold" style={{ color: statusLabelColor }}>
                  {initiativeDisplayName('ESP300', { isFrench }, 'ESP 300')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900">{esp300Display}</p>
              </div>
              <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4">
                <Calendar className="h-5 w-5" style={{ color: statusHex }} aria-hidden="true" />
                <p className="mt-2 text-[11px] font-semibold" style={{ color: statusLabelColor }}>
                  {initiativeDisplayName('YCS', { isFrench }, 'YCS')}
                </p>
                <p className="mt-0.5 font-bold text-slate-900">{ycsDisplay}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cases « Projets » : ESP 300 et YCS.
          OUI (vert) et cliquable si le peuple est engagé dans le projet → mène
          au projet et au détail de ce peuple dans le projet.
          NON (rouge) et NON cliquable sinon. */}
      <div className="flex flex-wrap gap-3">
        {[
          { key: 'ESP300', projLabel: 'ESP 300' },
          { key: 'YCS', projLabel: initiativeDisplayName('YCS', { isFrench }, 'YCS') },
        ].map(({ key, projLabel }) => {
          const engaged = !!membership[key]
          const base = 'bg-white rounded-lg border border-neutral-200 px-3 py-2 w-36'
          return (
            <div key={key} className={base}>
              <p className="text-[10.5px] font-bold leading-tight text-neutral-400">{initiativeDisplayName(key, { isFrench }, projLabel)}</p>
              {engaged ? (
                <Link
                  to={`/initiatives/${key}/peoples/${peopleId}`}
                  className="mt-0.5 inline-flex items-center text-xl font-bold text-emerald-600 hover:text-emerald-700 hover:underline"
                  title={isFrench ? `Voir le détail ${initiativeDisplayName(key, { isFrench }, projLabel)} de ce peuple` : `View this people's ${initiativeDisplayName(key, { isFrench }, projLabel)} detail`}
                >
                  {isFrench ? 'OUI' : 'YES'}
                </Link>
              ) : (
                <p className="mt-0.5 text-xl font-bold text-red-600">{isFrench ? 'NON' : 'NO'}</p>
              )}
            </div>
          )
        })}
      </div>

      {dmmCards.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold mb-4">DMM Rollup</h2>
          <div className="flex flex-wrap gap-3">
            {dmmCards.map((c) => (
              <StatCard key={c.label} label={c.label} value={c.value} accent="green" />
            ))}
          </div>
        </section>
      )}

      {(aliases.length > 0 || hasPopulationBySource || hasLocalisation) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {aliases.length > 0 && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold mb-4">Alias</h2>
              <div className="flex flex-wrap gap-2">
                {aliases.map((a, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-slate-100 text-slate-600 px-2 py-0.5 text-xs"
                  >
                    {a}
                  </span>
                ))}
              </div>
            </section>
          )}

          {hasPopulationBySource && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold mb-4">{isFrench ? 'Population par source' : 'Population by source'}</h2>
              <div className="space-y-1">
                {bySource.map((s, i) => (
                  <div key={i} className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 text-sm">{sourceLabel(s.sourceType)}</span>
                    <span className="text-slate-800 text-sm font-medium">{fmtNum(s.population)}</span>
                  </div>
                ))}
                {/* Pas de total : les populations ne sont pas additionnées entre
                    sources (une même population peut être décrite par plusieurs sources). */}
                <p className="mt-2 text-[11px] italic text-slate-400">
                  {isFrench ? 'Les populations ne sont pas additionnées entre sources.' : 'Populations are not summed across sources.'}
                </p>
              </div>
            </section>
          )}

          {hasLocalisation && (
            <section className="rounded-2xl border border-slate-200 bg-white p-6">
              <h2 className="text-xl font-bold mb-4">{isFrench ? 'Localisation' : 'Location'}</h2>
              <div className="space-y-1">
                {localisation?.method && (
                  <div className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 text-sm">{isFrench ? 'Méthode' : 'Method'}</span>
                    <span className="text-slate-800 text-sm font-medium text-right">{localisation.method}</span>
                  </div>
                )}
                {representativePoint && (
                  <div className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 text-sm">{isFrench ? 'Point représentatif' : 'Representative point'}</span>
                    <span className="text-slate-800 text-sm font-medium text-right">{representativePoint}</span>
                  </div>
                )}
                {localisation?.coverage != null && localisation.coverage !== '' && (
                  <div className="flex justify-between border-b border-slate-100 py-1.5">
                    <span className="text-slate-500 text-sm">{isFrench ? 'Couverture' : 'Coverage'}</span>
                    <span className="text-slate-800 text-sm font-medium text-right">{localisation.coverage}</span>
                  </div>
                )}
                {sourcePoints.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">{isFrench ? 'Points par source' : 'Points by source'}</p>
                    {sourcePoints.map((sp, i) => {
                      const coord = fmtPoint(sp.coordinates)
                      if (!coord) return null
                      return (
                        <div key={i} className="flex justify-between border-b border-slate-100 py-1.5">
                          <span className="text-slate-500 text-sm">{sourceLabel(sp.sourceType)}</span>
                          <span className="text-slate-800 text-sm font-medium text-right">{coord}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {dmmDetail && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold mb-4">{isFrench ? 'Détails du peuple' : 'People group details'}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2">
            {[
              [isFrench ? 'Région' : 'Region', dmmDetail.region],
              [isFrench ? 'Département' : 'Department', dmmDetail.department],
              [isFrench ? 'Arrondissement' : 'Subdivision', dmmDetail.subdivision],
              [isFrench ? 'Statut DMM' : 'DMM status', dmmDetail.engagementStatus],
              [isFrench ? "Niveau d'engagement" : 'Engagement level', dmmDetail.engagementLevel],
              [isFrench ? 'Langue' : 'Language', dmmDetail.language],
              ['Religion', dmmDetail.religion],
              [isFrench ? "Groupe d'affinité" : 'Affinity group', dmmDetail.affinityGroup],
              [isFrench ? 'Urbain / Rural' : 'Urban / Rural', dmmDetail.urbanRural],
              [isFrench ? 'Année de début' : 'Start year', dmmDetail.startYear],
              ['Population', typeof dmmDetail.population === 'number' ? dmmDetail.population.toLocaleString('fr-FR') : dmmDetail.population],
              [isFrench ? 'Donateur' : 'Donor', dmmDetail.donor ? (
                <Link to={`/donors/${encodeURIComponent(dmmDetail.donor)}/engagements`} className="text-blue-600 hover:underline">
                  {dmmDetail.donor}
                </Link>
              ) : dmmDetail.donor],
              [isFrench ? 'Coordinateur national' : 'National coordinator', dmmDetail.nationalCoordinator],
              [isFrench ? "Implanteur d'église" : 'Church planter', dmmDetail.churchPlanter ? (
                <Link to={`/planters/${encodeURIComponent(dmmDetail.churchPlanter)}/engagements`} className="text-blue-600 hover:underline">
                  {dmmDetail.churchPlanter}
                </Link>
              ) : dmmDetail.churchPlanter],
              [isFrench ? 'Églises' : 'Churches', dmmDetail.numberOfChurches],
              [isFrench ? 'Génération max' : 'Max generation', dmmDetail.churchGeneration],
              [isFrench ? 'Villages touchés' : 'Villages touched', dmmDetail.villagesTouched],
            ]
              .filter(([, v]) => v !== undefined && v !== null && v !== '')
              .map(([label, value]) => (
                <div key={label} className="flex justify-between border-b border-slate-100 py-1.5">
                  <span className="text-slate-400 text-sm">{label}</span>
                  <span className="text-slate-800 text-sm font-medium text-right">{value}</span>
                </div>
              ))}
          </div>
          <PeopleCommentSection
            engagementId={dmmDetail.engagementId || dmmDetail.id || dmmDetail._id}
            description={dmmDetail.description}
            canManage={canManage}
            isFrench={isFrench}
            onSaved={refreshPerson}
          />
        </section>
      )}

      {!dmmDetail && overview.description ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="text-xl font-bold mb-2">Description</h2>
          <p className="text-slate-600 whitespace-pre-line">{overview.description}</p>
        </section>
      ) : null}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">
            Engagements <span className="text-slate-400 text-base">({villages.length})</span>
          </h2>
          <AddVillageForm
            peopleId={peopleId}
            peopleName={name}
            onAdded={refreshPerson}
            openSignal={actionsAddVillage}
            onConsumeOpen={() => setActionsAddVillage(false)}
          />
        </div>
        {villages.length === 0 ? (
          <p className="text-sm text-slate-400">{isFrench ? 'Aucun engagement enregistré pour ce peuple. Ajoutez-en un avec le bouton ci-dessus.' : 'No engagement recorded for this people group. Add one with the button above.'}</p>
        ) : (
          <div className="space-y-3">
            {villages.map((v) => (
              <div key={v.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    {/* Nom de l'engagement cliquable → fiche Engagement (funnel
                        Regions ▸ Pays ▸ Peuple ▸ Engagement). */}
                    {v.engagementId ? (
                      <Link
                        to={`/regions/${regionId}/countries/${countryCode}/peoples/${peopleId}/engagements/${v.engagementId}`}
                        className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {peopleVillageLabel(name, v.villageName)}
                      </Link>
                    ) : (
                      <p className="font-semibold text-slate-900">{peopleVillageLabel(name, v.villageName)}</p>
                    )}
                    <p className="text-sm text-slate-500 mt-1">
                      {[v.region, v.admin2, v.admin3].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-500">
                      <span>
                        {isFrench
                          ? `${v.numberOfChurches ?? 0} église(s) · gén ${v.churchGeneration ?? 0}`
                          : `${v.numberOfChurches ?? 0} church(es) · gen ${v.churchGeneration ?? 0}`}
                      </span>
                      {/* Statut DMM coloré selon le tableau (nombre d'églises). */}
                      <DmmStatusDot engagement={v} />
                    </div>
                  </div>
                  {v.id && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(editingId === v.id ? null : v.id)}
                        className="rounded border px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        {editingId === v.id ? (isFrench ? 'Fermer' : 'Close') : (isFrench ? 'Modifier' : 'Edit')}
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm(isFrench ? 'Supprimer cet engagement ?' : 'Delete this engagement?')) return
                          try {
                            await masterPeopleApi.deleteVillage(peopleId, v.id)
                            if (editingId === v.id) setEditingId(null)
                            refreshPerson()
                          } catch (err) {
                            window.alert(err?.response?.data?.error || (isFrench ? 'Échec de la suppression de l’engagement.' : 'Failed to delete the engagement.'))
                          }
                        }}
                        className="rounded border border-red-200 px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                      >
                        {isFrench ? 'Supprimer' : 'Delete'}
                      </button>
                    </div>
                  )}
                </div>
                {v.id && editingId === v.id && (
                  <EditVillageForm
                    peopleId={peopleId}
                    village={v}
                    onSaved={() => { setEditingId(null); refreshPerson() }}
                    onCancel={() => setEditingId(null)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

/**
 * Section « Commentaire » éditable (PeopleGroup.description) sous le détail du
 * peuple. Lecture pour tous ; édition réservée aux admins / superviseurs.
 */
function PeopleCommentSection({ engagementId, description, canManage, isFrench, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [value, setValue] = useState(description || '')

  const open = () => {
    setValue(description || '')
    setError('')
    setEditing(true)
  }

  const save = async () => {
    if (!engagementId) return
    setSaving(true)
    setError('')
    try {
      await masterPeopleApi.updateComment(engagementId, value)
      setEditing(false)
      onSaved?.()
    } catch (err) {
      if (err?.response?.status === 403) {
        setError(isFrench ? 'Réservé aux administrateurs et superviseurs.' : 'Admins and supervisors only.')
      } else {
        setError(err?.response?.data?.message || err?.response?.data?.error || (isFrench ? "Échec de l'enregistrement." : 'Save failed.'))
      }
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-500 mb-1">{isFrench ? 'Commentaire' : 'Comment'}</p>
        <textarea
          className="w-full rounded-lg border border-slate-300 p-2 text-sm text-slate-700"
          rows={4}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {error && <p className="mt-1 text-sm text-red-600">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? (isFrench ? 'Enregistrement…' : 'Saving…') : (isFrench ? 'Enregistrer' : 'Save')}
          </button>
          <button
            type="button"
            onClick={() => { setEditing(false); setError('') }}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {isFrench ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-4">
      {description ? (
        <p className="text-sm text-slate-600 whitespace-pre-line leading-relaxed">{description}</p>
      ) : (
        canManage && (
          <p className="text-sm italic text-slate-400">{isFrench ? 'Aucun commentaire.' : 'No comment.'}</p>
        )
      )}
      {canManage && engagementId && (
        <button
          type="button"
          onClick={open}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
        >
          {description
            ? (isFrench ? 'Modifier' : 'Edit')
            : (isFrench ? 'Ajouter un commentaire' : 'Add a comment')}
        </button>
      )}
    </div>
  )
}

export default PeopleDetailLite
