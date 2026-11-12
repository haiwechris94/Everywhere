import { useState } from 'react'

/**
 * Formulaires admin pour créer / modifier un Peuple (MasterPeople) et un
 * Engagement DMM (PeopleGroup « village »). Texte bilingue via `isFrench`.
 */

const errMsg = (err, isFrench) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  (isFrench ? 'Une erreur est survenue. Veuillez réessayer.' : 'Something went wrong. Please try again.')

const REACHED_STATUSES = ['', 'UNREACHED', 'FRONTIER', 'MINIMALLY_REACHED', 'REACHED', 'UNKNOWN']

export function PeopleForm({ mode = 'create', initial = {}, onSubmit, onCancel, isFrench }) {
  const ref = initial.referenceData || {}
  const coords = Array.isArray(initial.primaryLocation?.coordinates) ? initial.primaryLocation.coordinates : []
  const [canonicalName, setCanonicalName] = useState(initial.canonicalName || '')
  const [primaryCountryCode, setPrimaryCountryCode] = useState(initial.primaryCountryCode || '')
  const [primaryLanguageName, setPrimaryLanguageName] = useState(initial.primaryLanguageName || '')
  const [totalPopulation, setTotalPopulation] = useState(initial.totalPopulation ?? '')
  const [latitude, setLatitude] = useState(coords[1] != null ? String(coords[1]) : '')
  const [longitude, setLongitude] = useState(coords[0] != null ? String(coords[0]) : '')
  const [population, setPopulation] = useState(ref.population ?? '')
  const [primaryReligion, setPrimaryReligion] = useState(ref.primaryReligion || '')
  const [primaryLanguage, setPrimaryLanguage] = useState(ref.primaryLanguage || '')
  const [percentEvangelical, setPercentEvangelical] = useState(ref.percentEvangelical ?? '')
  const [reachedStatus, setReachedStatus] = useState(ref.reachedStatus || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!canonicalName.trim()) {
      setError(isFrench ? 'Le nom du peuple est requis.' : 'People name is required.')
      return
    }
    const body = {
      canonicalName: canonicalName.trim(),
      primaryCountryCode: primaryCountryCode ? primaryCountryCode.toUpperCase() : undefined,
      primaryLanguageName: primaryLanguageName || undefined,
      totalPopulation: totalPopulation !== '' ? Number(totalPopulation) : undefined,
      population: population !== '' ? Number(population) : undefined,
      primaryReligion: primaryReligion || undefined,
      primaryLanguage: primaryLanguage || undefined,
      percentEvangelical: percentEvangelical !== '' ? Number(percentEvangelical) : undefined,
      reachedStatus: reachedStatus || undefined,
    }
    const latRaw = String(latitude).trim()
    const lngRaw = String(longitude).trim()
    if (latRaw !== '' && lngRaw !== '') {
      const lat = Number(latRaw)
      const lng = Number(lngRaw)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setError(isFrench ? 'Coordonnées invalides (lat ∈ [-90,90], lng ∈ [-180,180]).' : 'Invalid coordinates (lat ∈ [-90,90], lng ∈ [-180,180]).')
        return
      }
      body.latitude = lat
      body.longitude = lng
    }
    setSaving(true)
    try {
      await onSubmit(body)
    } catch (err) {
      setError(errMsg(err, isFrench))
    } finally {
      setSaving(false)
    }
  }

  const field = 'mt-1 w-full rounded border px-2 py-1 text-sm'
  const lbl = 'text-xs text-slate-500'

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
      <h3 className="text-sm font-semibold text-slate-700">
        {mode === 'create'
          ? (isFrench ? 'Nouveau peuple' : 'New people')
          : (isFrench ? 'Modifier le peuple' : 'Edit people')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={lbl}>
          {isFrench ? 'Nom du peuple' : 'People name'}
          <input value={canonicalName} onChange={(e) => setCanonicalName(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? 'Code pays (ISO3, ex. CMR)' : 'Country code (ISO3, e.g. CMR)'}
          <input value={primaryCountryCode} onChange={(e) => setPrimaryCountryCode(e.target.value.toUpperCase())} maxLength={3} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? 'Langue principale' : 'Primary language'}
          <input value={primaryLanguageName} onChange={(e) => setPrimaryLanguageName(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? 'Population totale' : 'Total population'}
          <input type="number" min="0" value={totalPopulation} onChange={(e) => setTotalPopulation(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          Latitude
          <input type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => setLatitude(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          Longitude
          <input type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => setLongitude(e.target.value)} className={field} />
        </label>
      </div>

      <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
        {isFrench ? 'Informations de référence' : 'Reference information'}
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={lbl}>
          {isFrench ? 'Population (référence)' : 'Population (reference)'}
          <input type="number" min="0" value={population} onChange={(e) => setPopulation(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? 'Religion principale' : 'Primary religion'}
          <input value={primaryReligion} onChange={(e) => setPrimaryReligion(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? 'Langue (référence)' : 'Language (reference)'}
          <input value={primaryLanguage} onChange={(e) => setPrimaryLanguage(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? '% évangéliques' : '% evangelical'}
          <input type="number" step="any" min="0" max="100" value={percentEvangelical} onChange={(e) => setPercentEvangelical(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? 'Statut d’atteinte' : 'Reached status'}
          <select value={reachedStatus} onChange={(e) => setReachedStatus(e.target.value)} className={field}>
            {REACHED_STATUSES.map((s) => (
              <option key={s || 'none'} value={s}>{s || (isFrench ? '—' : '—')}</option>
            ))}
          </select>
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

export function EngagementForm({ mode = 'create', initial = {}, onSubmit, onCancel, isFrench }) {
  const coords = Array.isArray(initial.location?.coordinates) ? initial.location.coordinates : []
  const [villageName, setVillageName] = useState(initial.villageName || '')
  const [numberOfChurches, setNumberOfChurches] = useState(initial.numberOfChurches ?? 0)
  const [churchGeneration, setChurchGeneration] = useState(initial.churchGeneration ?? 0)
  const [latitude, setLatitude] = useState(coords[1] != null ? String(coords[1]) : '')
  const [longitude, setLongitude] = useState(coords[0] != null ? String(coords[0]) : '')
  const [region, setRegion] = useState(initial.region || '')
  const [admin2, setAdmin2] = useState(initial.admin2 || initial.departement || '')
  const [admin3, setAdmin3] = useState(initial.admin3 || initial.arrondissement || '')
  const [description, setDescription] = useState(initial.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!villageName.trim()) {
      setError(isFrench ? 'Le nom du village est requis.' : 'Village name is required.')
      return
    }
    const body = {
      villageName: villageName.trim(),
      numberOfChurches: Number(numberOfChurches) || 0,
      churchGeneration: Number(churchGeneration) || 0,
      region: region || undefined,
      admin2: admin2 || undefined,
      admin3: admin3 || undefined,
      description: description || undefined,
    }
    const latRaw = String(latitude).trim()
    const lngRaw = String(longitude).trim()
    if (latRaw !== '' && lngRaw !== '') {
      const lat = Number(latRaw)
      const lng = Number(lngRaw)
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        setError(isFrench ? 'Coordonnées invalides (lat ∈ [-90,90], lng ∈ [-180,180]).' : 'Invalid coordinates (lat ∈ [-90,90], lng ∈ [-180,180]).')
        return
      }
      body.latitude = lat
      body.longitude = lng
    }
    setSaving(true)
    try {
      await onSubmit(body)
    } catch (err) {
      setError(errMsg(err, isFrench))
    } finally {
      setSaving(false)
    }
  }

  const field = 'mt-1 w-full rounded border px-2 py-1 text-sm'
  const lbl = 'text-xs text-slate-500'

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 p-4 space-y-3 bg-slate-50">
      <h3 className="text-sm font-semibold text-slate-700">
        {mode === 'create'
          ? (isFrench ? 'Nouvel engagement' : 'New engagement')
          : (isFrench ? "Modifier l'engagement" : 'Edit engagement')}
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className={lbl}>
          {isFrench ? 'Nom du village' : 'Village name'}
          <input value={villageName} onChange={(e) => setVillageName(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? "# d'églises" : '# churches'}
          <input type="number" min="0" value={numberOfChurches} onChange={(e) => setNumberOfChurches(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? 'Génération max' : 'Max generation'}
          <input type="number" min="0" value={churchGeneration} onChange={(e) => setChurchGeneration(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          {isFrench ? 'Région' : 'Region'}
          <input value={region} onChange={(e) => setRegion(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          Admin 2
          <input value={admin2} onChange={(e) => setAdmin2(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          Admin 3
          <input value={admin3} onChange={(e) => setAdmin3(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          Latitude
          <input type="number" step="any" min="-90" max="90" value={latitude} onChange={(e) => setLatitude(e.target.value)} className={field} />
        </label>
        <label className={lbl}>
          Longitude
          <input type="number" step="any" min="-180" max="180" value={longitude} onChange={(e) => setLongitude(e.target.value)} className={field} />
        </label>
      </div>
      <label className={lbl}>
        {isFrench ? 'Commentaire' : 'Comment'}
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} className={field} />
      </label>
      <p className="text-xs text-slate-400">
        {isFrench
          ? 'Le statut DMM est calculé automatiquement à partir du nombre d’églises et de la génération.'
          : 'DMM status is derived automatically from the number of churches and generation.'}
      </p>
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
