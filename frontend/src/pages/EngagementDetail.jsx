import { useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { peopleGroupsApi, masterPeopleApi } from '../services/api'
import { StateLoading, StateError, StatCard } from './geography/geoComponents'
import { dmmEngagementDisplay, dmmLevelForEngagement, dmmLevelLabel } from '../utils/dmmEngagement'
import { useLanguage } from '../i18n'

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

// Nom d'affichage unifié d'un engagement : « nom du peuple + nom du village ».
function engagementDisplayName(peopleName, villageName, fallback) {
  const p = (peopleName || '').trim()
  const v = (villageName || '').trim()
  if (p && v) return `${p} ${v}`
  return p || v || fallback || '—'
}

// Statuts d'engagement autorisés (mêmes valeurs que le formulaire de PeopleDetailLite).
const ENGAGEMENT_STATUSES = ['pioneer', 'midway', 'tipping-point', 'movement']

// Formulaire d'édition en ligne d'un engagement (réutilise la logique de
// PeopleDetailLite : nom du village, statut, # églises, génération).
function EditEngagementForm({ engagement, onSaved, onCancel }) {
  const { isFrench } = useLanguage()
  const [form, setForm] = useState({
    villageName: engagement.villageName || '',
    engagementStatus: engagement.engagementStatus || 'pioneer',
    numberOfChurches: engagement.numberOfChurches ?? 0,
    churchGeneration: engagement.churchGeneration ?? 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true); setError('')
    try {
      await peopleGroupsApi.update(engagement._id, {
        villageName: form.villageName.trim(),
        engagementStatus: form.engagementStatus,
        numberOfChurches: Number(form.numberOfChurches) || 0,
        churchGeneration: Number(form.churchGeneration) || 0,
      })
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
        <label className="text-xs text-slate-500">
          {isFrench ? "Statut d'engagement" : 'Engagement status'}
          <select value={form.engagementStatus} onChange={set('engagementStatus')} className="mt-1 w-full rounded border px-2 py-1 text-sm">
            {ENGAGEMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? "# d'églises" : '# churches'}
          <input type="number" min="0" value={form.numberOfChurches} onChange={set('numberOfChurches')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
        </label>
        <label className="text-xs text-slate-500">
          {isFrench ? 'Génération max' : 'Max generation'}
          <input type="number" min="0" value={form.churchGeneration} onChange={set('churchGeneration')} className="mt-1 w-full rounded border px-2 py-1 text-sm" />
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

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['engagement', engagementId] })

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

  const stats = [
    { label: isFrench ? "# d'églises" : '# churches', value: fmt(eng.numberOfChurches ?? 0), accent: 'blue' },
    { label: 'Max Gen', value: fmt(eng.churchGeneration ?? 0), accent: 'blue' },
    { label: isFrench ? 'Nouveaux disciples' : 'New disciples', value: fmt(eng.newDisciples ?? 0), accent: 'green' },
    { label: isFrench ? 'Nouveaux baptisés' : 'New baptisms', value: fmt(eng.newBaptisms ?? 0), accent: 'green' },
  ]

  const detailRows = [
    [isFrench ? 'Village' : 'Village', eng.villageName || '—'],
    [isFrench ? 'Région' : 'Region', eng.region || '—'],
    ['Admin 2', eng.admin2 || eng.departement || '—'],
    ['Admin 3', eng.admin3 || eng.arrondissement || '—'],
    ['DBS', fmt(eng.dbs ?? 0)],
    ['COM', fmt(eng.com ?? 0)],
    ['CAT', fmt(eng.cat ?? 0)],
    [isFrench ? 'Leaders en formation' : 'Leaders in training', fmt(eng.leadersInTraining ?? 0)],
    [isFrench ? 'Coachs actifs' : 'Active coaches', fmt(eng.activeCoaches ?? 0)],
    [isFrench ? 'Formations tenues' : 'Trainings held', fmt(eng.trainingsHeld ?? 0)],
    [isFrench ? 'Période de rapport' : 'Report period', eng.reportPeriod || '—'],
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

      <div className="flex flex-wrap gap-3">
        {stats.map((s) => (
          <StatCard key={s.label} label={s.label} value={s.value} accent={s.accent} />
        ))}
      </div>

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
