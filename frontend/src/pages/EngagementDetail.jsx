import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { peopleGroupsApi, masterPeopleApi } from '../services/api'
import { StateLoading, StateError, StatCard } from './geography/geoComponents'
import {
  dmmEngagementDisplay, dmmLevelForEngagement, dmmLevelLabel,
  dmmStageFromChurches, normalizeDmmStage, dmmStageColors, dmmStageLabel, DMM_STAGE,
} from '../utils/dmmEngagement'
import { useLanguage } from '../i18n'

// Rang numérique d'un stade DMM (Pionnier=1 … Mouvement=4) pour tracer la
// progression d'un engagement sur l'axe Y.
const STAGE_RANK = {
  [DMM_STAGE.PIONEER]: 1,
  [DMM_STAGE.MIDWAY]: 2,
  [DMM_STAGE.TIPPING_POINT]: 3,
  [DMM_STAGE.MOVEMENT]: 4,
}
// Ordre trimestriel « <q>Q<yy> » → entier comparable (année*4 + trimestre).
const quarterOrder = (period) => {
  const m = /^\s*([1-4])\s*Q\s*(\d{2,4})\s*$/i.exec(String(period || ''))
  if (!m) return -1
  const q = parseInt(m[1], 10)
  let yy = parseInt(m[2], 10)
  if (yy < 100) yy = 2000 + yy
  return yy * 4 + q
}

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

// Nom d'affichage unifié d'un engagement : « nom du peuple + nom du village ».
function engagementDisplayName(peopleName, villageName, fallback) {
  const p = (peopleName || '').trim()
  const v = (villageName || '').trim()
  if (p && v) return `${p}, ${v}`
  return p || v || fallback || '—'
}

// Statuts d'engagement autorisés (mêmes valeurs que le formulaire de PeopleDetailLite).
const ENGAGEMENT_STATUSES = ['pioneer', 'midway', 'tipping-point', 'movement']

// Formulaire d'édition en ligne d'un engagement (réutilise la logique de
// PeopleDetailLite : nom du village, statut, # églises, génération).
function EditEngagementForm({ engagement, onSaved, onCancel }) {
  const { isFrench } = useLanguage()
  const coords = Array.isArray(engagement.location?.coordinates) ? engagement.location.coordinates : []
  const [form, setForm] = useState({
    villageName: engagement.villageName || '',
    engagementStatus: engagement.engagementStatus || 'pioneer',
    numberOfChurches: engagement.numberOfChurches ?? 0,
    churchGeneration: engagement.churchGeneration ?? 0,
    latitude: coords[1] != null ? String(coords[1]) : '',
    longitude: coords[0] != null ? String(coords[0]) : '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')

    // Build the payload. Only send villageName when it actually changed
    // (the backend rejects unknown village names with 400 VILLAGE_NOT_FOUND).
    // On n'envoie PAS engagementStatus : le backend le recalcule à partir du
    // nombre d'églises et de la génération (tableau DMM). Le statut n'est donc
    // jamais saisi manuellement.
    const payload = {
      numberOfChurches: Number(form.numberOfChurches) || 0,
      churchGeneration: Number(form.churchGeneration) || 0,
    }

    const nextVillage = form.villageName.trim()
    if (nextVillage !== (engagement.villageName || '')) {
      payload.villageName = nextVillage
    }

    // Latitude / longitude → GeoJSON Point [lng, lat]. Only include when both
    // are provided and valid; validate ranges.
    const latRaw = String(form.latitude).trim()
    const lngRaw = String(form.longitude).trim()
    if (latRaw !== '' || lngRaw !== '') {
      const lat = Number(latRaw)
      const lng = Number(lngRaw)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        setSaving(false)
        setError(isFrench ? 'Latitude et longitude doivent être des nombres valides.' : 'Latitude and longitude must be valid numbers.')
        return
      }
      if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setSaving(false)
        setError(isFrench ? 'Coordonnées hors limites (lat ∈ [-90,90], lng ∈ [-180,180]).' : 'Coordinates out of range (lat ∈ [-90,90], lng ∈ [-180,180]).')
        return
      }
      payload.location = { type: 'Point', coordinates: [lng, lat] }
    }

    try {
      await peopleGroupsApi.update(engagement._id, payload)
      onSaved && onSaved()
    } catch (err) {
      setError(err?.response?.data?.error || (isFrench ? 'Échec de la modification de l’engagement.' : 'Failed to update the engagement.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="text-xs text-slate-500">
          {isFrench ? 'Nom du village' : 'Village name'}
          <input value={form.villageName} onChange={set('villageName')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        {/* Le statut d'engagement n'est PAS modifiable : il est dérivé
            automatiquement du nombre d'églises et de la génération max selon le
            tableau DMM. On ne l'envoie donc plus dans le formulaire. */}
        <label className="text-xs text-slate-500">
          {isFrench ? "# d'églises" : '# churches'}
          <input type="number" min="0" value={form.numberOfChurches} onChange={set('numberOfChurches')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? 'Génération max' : 'Max generation'}
          <input type="number" min="0" value={form.churchGeneration} onChange={set('churchGeneration')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? 'Latitude' : 'Latitude'}
          <input type="number" step="any" min="-90" max="90" value={form.latitude} onChange={set('latitude')} placeholder={isFrench ? 'ex. 4.0511' : 'e.g. 4.0511'} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? 'Longitude' : 'Longitude'}
          <input type="number" step="any" min="-180" max="180" value={form.longitude} onChange={set('longitude')} placeholder={isFrench ? 'ex. 9.7679' : 'e.g. 9.7679'} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
          {saving ? (isFrench ? 'Enregistrement…' : 'Saving…') : (isFrench ? 'Enregistrer' : 'Save')}
        </button>
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          {isFrench ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}

/**
 * EngagementDetail — fiche d'un engagement DMM (un « village » du modèle).
 *
 * Intégrée au funnel de la page Regions :
 *   Regions ▸ Pays ▸ Peuple ▸ Engagement
 *   /regions/:regionId/countries/:countryCode/peoples/:peopleId/engagements/:engagementId
 *
 * Atteignable en cliquant le nom d'un engagement depuis :
 *   - la fiche d'un peuple (PeopleDetailLite)
 *   - la section « Engagements » d'un pays (CountryPeoples)
 *   - la liste des engagements d'un implanteur (PlanterEngagements)
 *
 * Les points/statuts colorés suivent les règles du tableau DMM (nombre
 * d'églises) et les couleurs imposées — voir utils/dmmEngagement.js.
 */
export default function EngagementDetail() {
  const { isFrench } = useLanguage()
  const { regionId, countryCode, peopleId, engagementId } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['engagement', engagementId],
    queryFn: async () => (await peopleGroupsApi.getById(engagementId)).data,
    enabled: !!engagementId,
    retry: false,
  })

  const eng = data || {}
  const masterId = peopleId || eng.masterPeopleId

  // Nom du peuple parent (pour composer « nom du peuple + nom du village »).
  const { data: parentName } = useQuery({
    queryKey: ['engagement-parent-name', masterId],
    queryFn: async () => {
      const res = await masterPeopleApi.getById(masterId)
      return res?.data?.canonicalName || res?.data?.name || null
    },
    enabled: !!masterId,
    retry: false,
  })

  const refresh = () => {
    // Refresh this page…
    queryClient.invalidateQueries({ queryKey: ['engagement', engagementId] })
    // …and every view that renders this engagement's coordinates / metrics so
    // an edited lat/lng moves the marker on the unified map and updates the
    // country / people sheets without a manual reload.
    ;[
      ['dmm-engagements'],
      ['dmm-peoples'],
      ['master-people-markers'],
      ['ng-country-peoples'],
      ['ng-region-country'],
      ['ng-person-profile'],
      ['ng-person-row'],
    ].forEach((queryKey) => queryClient.invalidateQueries({ queryKey }))
  }

  if (isLoading) return <div className="p-6"><StateLoading label={isFrench ? "Chargement de l'engagement…" : 'Loading engagement…'} /></div>
  if (isError) {
    const notFound = error?.response?.status === 404
    return <div className="p-6"><StateError label={notFound ? (isFrench ? 'Engagement introuvable.' : 'Engagement not found.') : (isFrench ? 'Erreur de chargement.' : 'Loading error.')} /></div>
  }

  // Nom d'affichage : « nom du peuple + nom du village ». Repli sur le nom
  // stocké du peuple (eng.name) puis le nom du village.
  const peopleName = parentName || eng.name || ''
  const engagementName = engagementDisplayName(peopleName, eng.villageName, eng.name || (isFrench ? 'Engagement' : 'Engagement'))
  const { label: stageLabel, colors } = dmmEngagementDisplay(eng, isFrench)

  // Niveau DMM (I–IV) d'après la génération max, selon le tableau DMM.
  const level = dmmLevelForEngagement(eng)
  const levelText = level ? dmmLevelLabel(level, isFrench) : '—'

  const handleDelete = async () => {
    if (!window.confirm(isFrench ? 'Supprimer cet engagement ?' : 'Delete this engagement?')) return
    setDeleting(true)
    try {
      await peopleGroupsApi.delete(engagementId)
      // Retour à la fiche du peuple parent si on est dans le funnel, sinon en arrière.
      if (regionId && countryCode && masterId) {
        navigate(`/regions/${regionId}/countries/${countryCode}/peoples/${masterId}`)
      } else {
        navigate(-1)
      }
    } catch (err) {
      window.alert(err?.response?.data?.error || (isFrench ? 'Échec de la suppression de l’engagement.' : 'Failed to delete the engagement.'))
      setDeleting(false)
    }
  }

  // Fil d'Ariane funnel — on ne montre les segments géographiques que si l'URL
  // les fournit (accès direct depuis un implanteur peut ne pas les porter).
  const inFunnel = regionId && countryCode && peopleId

  // Valeurs CUMULÉES sur tous les trimestres de l'engagement.
  // - Mesures d'ÉTAT (églises, génération, DBS, COM, CAT, leaders, coachs) :
  //   on prend la valeur du trimestre le plus récent = état courant.
  // - Mesures de FLUX (nouveaux disciples/baptisés, formations tenues) :
  //   on SOMME tous les trimestres pour un vrai cumul.
  // Repli sur les champs top-level quand l'historique trimestriel est absent
  // (docs legacy).
  const quarters = Array.isArray(eng.quarterlyReports) ? eng.quarterlyReports : []
  const sumQ = (k, fallback) => (quarters.length
    ? quarters.reduce((s, q) => s + (Number(q?.[k]) || 0), 0)
    : (Number(fallback) || 0))
  const cumNewDisciples = sumQ('newDisciples', eng.newDisciples)
  const cumNewBaptisms = sumQ('newBaptisms', eng.newBaptisms)
  const cumTrainings = sumQ('trainingsHeld', eng.trainingsHeld)

  // Progression du stade DMM (Pionnier → Mouvement) trimestre par trimestre.
  // Chaque point : rang de stade (1–4) + nombre d'églises, trié par trimestre.
  const progression = [...quarters]
    .filter((q) => q && q.reportPeriod)
    .sort((a, b) => quarterOrder(a.reportPeriod) - quarterOrder(b.reportPeriod))
    .map((q) => {
      const churches = Number(q.numberOfChurches) || 0
      const stage = dmmStageFromChurches(churches) // null si 0 église
      return {
        label: q.reportPeriod,
        churches,
        generation: Number(q.churchGeneration) || 0,
        stageRank: stage ? STAGE_RANK[stage] : 0,
        stageLabel: stage ? dmmStageLabel(stage, isFrench) : (isFrench ? 'Non engagé' : 'Not engaged'),
      }
    })
  // Libellés d'axe Y pour les stades (0 = non engagé).
  const stageTick = (v) => {
    const map = {
      0: isFrench ? 'Non eng.' : 'None',
      1: dmmStageLabel(DMM_STAGE.PIONEER, isFrench),
      2: dmmStageLabel(DMM_STAGE.MIDWAY, isFrench),
      3: dmmStageLabel(DMM_STAGE.TIPPING_POINT, isFrench),
      4: dmmStageLabel(DMM_STAGE.MOVEMENT, isFrench),
    }
    return map[v] ?? ''
  }

  const stats = [
    { label: isFrench ? "# d'églises" : '# churches', value: fmt(eng.numberOfChurches ?? 0), accent: 'blue' },
    { label: isFrench ? '# Max Gen' : '# Max Gen', value: fmt(eng.churchGeneration ?? 0), accent: 'blue' },
    { label: '# DBS', value: fmt(eng.dbs ?? 0), accent: 'indigo' },
    { label: '# COM', value: fmt(eng.com ?? 0), accent: 'indigo' },
    { label: '# CAT', value: fmt(eng.cat ?? 0), accent: 'indigo' },
    { label: isFrench ? '# Leaders en formation' : '# Leaders in training', value: fmt(eng.leadersInTraining ?? 0), accent: 'amber' },
    { label: isFrench ? '# Coachs actifs' : '# Active coaches', value: fmt(eng.activeCoaches ?? 0), accent: 'amber' },
    { label: isFrench ? '# Nouveaux disciples' : '# New disciples', value: fmt(cumNewDisciples), accent: 'green' },
    { label: isFrench ? '# Nouveaux baptisés' : '# New baptisms', value: fmt(cumNewBaptisms), accent: 'green' },
    { label: isFrench ? '# Formations tenues' : '# Trainings held', value: fmt(cumTrainings), accent: 'green' },
  ]

  const engCoords = Array.isArray(eng.location?.coordinates) ? eng.location.coordinates : []
  const engLat = engCoords[1]
  const engLng = engCoords[0]

  // Détails = identité + localisation UNIQUEMENT. Les mesures chiffrées
  // (DBS/COM/CAT, leaders, coachs, formations…) sont désormais affichées en
  // cases « # » plus haut. La ligne « Période de rapport » est retirée : la
  // fiche montre l'état CUMULÉ de tous les trimestres, pas un trimestre isolé.
  const detailRows = [
    [isFrench ? 'Village' : 'Village', eng.villageName || '—'],
    [isFrench ? 'Région' : 'Region', eng.region || '—'],
    ['Admin 2', eng.admin2 || eng.departement || '—'],
    ['Admin 3', eng.admin3 || eng.arrondissement || '—'],
    ['Latitude', Number.isFinite(engLat) ? engLat : '—'],
    ['Longitude', Number.isFinite(engLng) ? engLng : '—'],
  ]

  return (
    <div className="p-6 space-y-6">
      {/* Fil d'Ariane : Regions ▸ Pays ▸ Peuple ▸ Engagement */}
      <p className="text-sm text-gray-500">
        {inFunnel ? (
          <>
            <Link to="/regions" className="hover:text-slate-700">Regions</Link> /{' '}
            <Link to={`/regions/${regionId}`} className="hover:text-slate-700">{regionId}</Link> /{' '}
            <Link to={`/regions/${regionId}/countries/${countryCode}`} className="hover:text-slate-700">{countryCode}</Link> /{' '}
            <Link to={`/regions/${regionId}/countries/${countryCode}/peoples/${peopleId}`} className="hover:text-slate-700">{peopleName || (isFrench ? 'Peuple' : 'People group')}</Link> /{' '}
            {engagementName}
          </>
        ) : (
          <>
            <Link to="/regions" className="hover:text-slate-700">Regions</Link> / {engagementName}
          </>
        )}
      </p>

      <div className="flex items-start justify-between gap-4">
        <h1 className="text-4xl font-bold text-slate-900">{engagementName}</h1>
        {/* Boutons Modifier / Supprimer (logique reprise de PeopleDetailLite). */}
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            {editing ? (isFrench ? 'Fermer' : 'Close') : (isFrench ? 'Modifier' : 'Edit')}
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="rounded border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
          >
            {deleting ? (isFrench ? 'Suppression…' : 'Deleting…') : (isFrench ? 'Supprimer' : 'Delete')}
          </button>
        </div>
      </div>

      {editing && (
        <EditEngagementForm
          engagement={eng}
          onSaved={() => { setEditing(false); refresh() }}
          onCancel={() => setEditing(false)}
        />
      )}

      {/* Carte Statut DMM : point + libellé colorés selon la règle du tableau,
          suivi du NIVEAU DMM (I–IV) déduit de la génération max. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-500 mb-2">{isFrench ? 'Statut DMM' : 'DMM status'}</p>
            <div className="flex items-center gap-3">
              <span className="inline-block h-4 w-4 rounded-full" style={{ backgroundColor: colors.hex }} />
              <span className="text-xl font-bold" style={{ color: colors.hex }}>{stageLabel}</span>
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-500 mb-2">{isFrench ? "Niveau d'engagement" : 'Engagement level'}</p>
            <span className="text-xl font-bold text-slate-800">{levelText}</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-400">
          {isFrench
            ? `Statut déterminé par le nombre d'églises (${fmt(eng.numberOfChurches ?? 0)}) et niveau par la génération max (${fmt(eng.churchGeneration ?? 0)}), selon le tableau DMM.`
            : `Status determined by the number of churches (${fmt(eng.numberOfChurches ?? 0)}) and level by max generation (${fmt(eng.churchGeneration ?? 0)}), per the DMM table.`}
        </p>
      </section>

      {/* Mesures de l'engagement — toutes en cases « # », état cumulé. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
          {isFrench ? 'Mesures (cumul des trimestres)' : 'Measures (cumulative across quarters)'}
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {stats.map((s) => (
            <StatCard key={s.label} label={s.label} value={s.value} accent={s.accent} />
          ))}
        </div>
      </section>

      {/* ── Progression DMM (Pionnier → Mouvement) par trimestre ─────────────
          Trace, à partir de l'historique trimestriel accumulé, l'évolution du
          stade DMM (axe gauche, Pionnier→Mouvement) et du nombre d'églises
          (axe droit). Visualise le passage d'un peuple de Pionnier à Mouvement
          au fil des trimestres. */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="mb-1 text-xl font-bold">
          {isFrench ? "Progression de l'engagement" : 'Engagement progression'}
        </h2>
        <p className="mb-4 text-sm text-slate-400">
          {isFrench
            ? 'Évolution du stade DMM et du nombre d’églises, trimestre par trimestre.'
            : 'DMM stage and number of churches, quarter by quarter.'}
        </p>
        {progression.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            {isFrench
              ? 'Aucun historique trimestriel. Importez des données trimestrielles (colonne « Report period », ex. 1Q26, 2Q26) pour voir la progression.'
              : 'No quarterly history yet. Import quarterly data (the "Report period" column, e.g. 1Q26, 2Q26) to see progression.'}
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={progression} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              {/* Axe gauche : stade DMM (0–4). */}
              <YAxis
                yAxisId="stage"
                domain={[0, 4]}
                ticks={[0, 1, 2, 3, 4]}
                tickFormatter={stageTick}
                tick={{ fontSize: 10 }}
                width={90}
              />
              {/* Axe droit : nombre d'églises. */}
              <YAxis yAxisId="churches" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value, name, props) => {
                  if (props?.dataKey === 'stageRank') return [props.payload.stageLabel, isFrench ? 'Stade DMM' : 'DMM stage']
                  return [fmt(value), name]
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {/* Seuils de stade (34 / 67 / 100 églises) en repères légers. */}
              <ReferenceLine yAxisId="churches" y={34} stroke="#eab308" strokeDasharray="2 4" />
              <ReferenceLine yAxisId="churches" y={67} stroke="#22c55e" strokeDasharray="2 4" />
              <ReferenceLine yAxisId="churches" y={100} stroke="#15803d" strokeDasharray="2 4" />
              <Line yAxisId="stage" type="stepAfter" dataKey="stageRank" name={isFrench ? 'Stade DMM' : 'DMM stage'} stroke="#6366f1" strokeWidth={3} dot={{ r: 4 }} />
              <Line yAxisId="churches" type="monotone" dataKey="churches" name={isFrench ? "# d'églises" : '# churches'} stroke="#0ea5e9" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}

        {/* Tableau d'historique trimestriel (chiffres par trimestre). */}
        {progression.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? 'Trimestre' : 'Quarter'}</th>
                  <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? "# d'églises" : '# churches'}</th>
                  <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? 'Génération' : 'Generation'}</th>
                  <th className="py-2 pl-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? 'Stade' : 'Stage'}</th>
                </tr>
              </thead>
              <tbody>
                {progression.map((p) => {
                  const stage = dmmStageFromChurches(p.churches)
                  const col = dmmStageColors(stage)
                  return (
                    <tr key={p.label} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 pr-4 font-medium text-slate-700">{p.label}</td>
                      <td className="py-2 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(p.churches)}</td>
                      <td className="py-2 px-4 text-right tabular-nums text-slate-600">{fmt(p.generation)}</td>
                      <td className="py-2 pl-4">
                        <span className="inline-flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: col.hex }} />
                          <span className="font-medium" style={{ color: col.hex }}>{p.stageLabel}</span>
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Implanteur — cliquable vers ses engagements, comme ailleurs. */}
      {eng.churchPlanter && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-sm font-semibold text-slate-500 mb-1">{isFrench ? 'Implanteur' : 'Church planter'}</p>
          <Link
            to={`/planters/${encodeURIComponent(eng.churchPlanter)}/engagements`}
            className="text-blue-600 hover:underline text-lg font-medium"
          >
            {eng.churchPlanter}
          </Link>
        </section>
      )}

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold mb-4">{isFrench ? "Détails de l'engagement" : 'Engagement details'}</h2>
        <div className="divide-y divide-slate-100">
          {detailRows.map(([label, value]) => (
            <div key={label} className="flex justify-between py-1.5">
              <span className="text-slate-400 text-sm">{label}</span>
              <span className="text-slate-800 text-sm font-medium text-right">{value}</span>
            </div>
          ))}
        </div>
        {eng.description && (
          <p className="mt-4 text-sm text-slate-600 whitespace-pre-line leading-relaxed">{eng.description}</p>
        )}
      </section>
    </div>
  )
}
