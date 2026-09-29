import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { reportingApi } from '../services/reportingApi'
import { masterPeopleApi } from '../services/api'
import { StateLoading, StateError, StatCard } from './geography/geoComponents'
import { jpStageFor, evangelicalRangeFor, bibleStatusLabel } from '../utils/joshuaProjectScales'
import { useLanguage } from '../i18n'

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

// Format d'affichage unifié : « nom du peuple, nom du village ».
function peopleVillageLabel(peopleName, villageName) {
  const p = (peopleName || '').trim()
  const v = (villageName || '').trim()
  if (p && v) return `${p}, ${v}`
  return p || v || '—'
}

// Formulaire d'ajout manuel d'un village (engagement DMM) à un peuple.
function AddVillageForm({ peopleId, peopleName, onAdded }) {
  const { isFrench } = useLanguage()
  const empty = {
    villageName: '', latitude: '', longitude: '',
    engagementStatus: 'pioneer', numberOfChurches: 0, churchGeneration: 0,
  }
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

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
  const [editingId, setEditingId] = useState(null)

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
  const jpScaleValue = overview.jpScale ?? row?.status?.jpScale ?? null
  const jpStage = jpStageFor(jpScaleValue)
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

  // Couleur associée au statut du peuple (réutilisée pour le point rond et pour
  // colorer le texte du statut). Aligné sur la palette de StatusBadge.
  const statusColorFor = (status) => {
    const norm = String(status || '').toLowerCase().replace(/[\s_-]+/g, '')
    const map = {
      pioneer: { dot: 'bg-amber-500', text: 'text-amber-700' },
      midway: { dot: 'bg-blue-500', text: 'text-blue-700' },
      tippingpoint: { dot: 'bg-purple-500', text: 'text-purple-700' },
      movement: { dot: 'bg-green-500', text: 'text-green-700' },
      dmm: { dot: 'bg-green-500', text: 'text-green-700' },
      engaged: { dot: 'bg-blue-500', text: 'text-blue-700' },
      unreached: { dot: 'bg-red-500', text: 'text-red-700' },
      reached: { dot: 'bg-green-500', text: 'text-green-700' },
    }
    return map[norm] || { dot: 'bg-slate-400', text: 'text-slate-700' }
  }
  const statusColors = statusColorFor(statusGlobal)

  const cards = [
    { label: 'Country', value: overview.country || row?.primaryCountryCode || countryCode },
    // ROP3 retiré de la fiche des peuples (remplacé par les indicateurs Joshua Project ci-dessous).
    {
      label: 'JP Scale',
      value: jpScaleValue != null ? (jpStage ? `${jpScaleValue} — ${jpStage}` : jpScaleValue) : '—',
    },
    { label: 'Least Reached', value: (overview.leastReached ?? row?.status?.leastReached) ? 'Yes' : 'No' },
    // Population retirée des cartes du haut : elle est désormais présentée
    // uniquement PAR SOURCE (jamais cumulée) dans la section « Population par source ».
    // Indicateurs Joshua Project : toujours affichés (repli sur « — » si absent),
    // pour que les 54 fiches montrent systématiquement ces cases.
    { label: isFrench ? 'Langue principale' : 'Primary language', value: primaryLanguageName || '—' },
    { label: isFrench ? '% Évangéliques' : '% Evangelical', value: pctEvangelicalRange || '—' },
    { label: isFrench ? 'Traduction biblique' : 'Bible translation', value: bibleTranslationStatus || '—' },
    ...(overview.religion ? [{ label: 'Religion', value: overview.religion }] : []),
  ]

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
  const subtitleChips = [overview.region, overview.language, overview.religion].filter(Boolean)

  // # Churches = somme des églises de TOUS les engagements du peuple.
  // On additionne engagements[].numberOfChurches ; repli sur le rollup
  // totalChurches lorsque la liste détaillée des engagements est absente.
  const totalChurchesFromEngagements = Array.isArray(dmm?.engagements)
    ? dmm.engagements.reduce((sum, e) => sum + (Number(e.numberOfChurches) || 0), 0)
    : 0
  const churchesTotal = totalChurchesFromEngagements || (dmm?.totalChurches ?? 0)

  // # Total believers = total des nouveaux disciples/croyants des engagements du peuple.
  // On additionne engagements[].newDisciples ; repli sur le rollup
  // totalNewDisciples, puis sur la fenêtre DBS (window.newDisciples).
  const believersFromEngagements = Array.isArray(dmm?.engagements)
    ? dmm.engagements.reduce((sum, e) => sum + (Number(e.newDisciples) || 0), 0)
    : 0
  const totalBelievers =
    believersFromEngagements ||
    dmm?.totalNewDisciples ||
    dmm?.window?.newDisciples ||
    0

  const dmmCards = dmm
    ? [
        { label: '# Engagements', value: dmm.engagementCount ?? 0 },
        { label: '# Churches', value: churchesTotal },
        { label: '# max Gen reached', value: dmm.maxGeneration ?? 0 },
        { label: '# Total believers', value: totalBelievers },
        { label: '# Villages Touched', value: dmm.villagesTouched ?? 0 },
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
      <p className="text-sm text-gray-500">
        <Link to="/regions" className="hover:text-slate-700">Regions</Link> /{' '}
        <Link to={`/regions/${regionId}`} className="hover:text-slate-700">{regionId}</Link> /{' '}
        <Link to={`/regions/${regionId}/countries/${countryCode}`} className="hover:text-slate-700">{countryCode}</Link> / {name}
      </p>
      <div className="flex items-start gap-4">
        {photoUrl && (
          <img
            src={photoUrl}
            alt={name}
            onError={(e) => { e.currentTarget.style.display = 'none' }}
            className="w-20 h-20 rounded-xl object-cover border border-slate-200 shrink-0"
          />
        )}
        <div className="min-w-0">
          <h1 className="text-4xl font-bold text-slate-900">{name}</h1>
          {subtitleChips.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {subtitleChips.map((chip, i) => (
                <span
                  key={i}
                  className="rounded-full bg-slate-100 text-slate-600 px-2.5 py-0.5 text-xs font-medium"
                >
                  {chip}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {/* Carte Statut : point rond coloré selon le statut + texte coloré (cas « unreached » en rouge). */}
        <div className="bg-white rounded-lg border border-neutral-200 border-t border-neutral-200 px-3 py-2 w-36">
          <p className="text-[10.5px] font-bold leading-tight text-neutral-400">Status</p>
          <p className="text-xl font-bold mt-0.5 flex items-center gap-1.5">
            <span className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${statusColors.dot}`} />
            <span className={statusColors.text}>{statusGlobal}</span>
          </p>
        </div>
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} />
        ))}
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
              [isFrench ? 'Donateur' : 'Donor', dmmDetail.donor],
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
          {dmmDetail.description && (
            <p className="mt-4 text-sm text-slate-600 whitespace-pre-line leading-relaxed">{dmmDetail.description}</p>
          )}
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
          <AddVillageForm peopleId={peopleId} peopleName={name} onAdded={refreshPerson} />
        </div>
        {villages.length === 0 ? (
          <p className="text-sm text-slate-400">{isFrench ? 'Aucun engagement enregistré pour ce peuple. Ajoutez-en un avec le bouton ci-dessus.' : 'No engagement recorded for this people group. Add one with the button above.'}</p>
        ) : (
          <div className="space-y-3">
            {villages.map((v) => (
              <div key={v.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{peopleVillageLabel(name, v.villageName)}</p>
                    <p className="text-sm text-slate-500 mt-1">
                      {[v.region, v.admin2, v.admin3].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <p className="text-sm text-slate-500 mt-1">
                      {isFrench
                        ? `${v.numberOfChurches ?? 0} église(s) · gén ${v.churchGeneration ?? 0} · ${v.engagementStatus || 'n/a'}`
                        : `${v.numberOfChurches ?? 0} church(es) · gen ${v.churchGeneration ?? 0} · ${v.engagementStatus || 'n/a'}`}
                    </p>
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

export default PeopleDetailLite
