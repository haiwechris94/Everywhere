import { useId, useState } from 'react'

/**
 * Shared admin forms for editable Region / Country overlays.
 * All visible text is bilingual via the `isFrench` prop.
 */

const errMsg = (err, isFrench) =>
  err?.response?.data?.error ||
  err?.response?.data?.message ||
  (isFrench ? 'Une erreur est survenue. Veuillez réessayer.' : 'Something went wrong. Please try again.')

export function LeadersEditor({ leaders = [], onChange, isFrench }) {
  const groupId = useId()
  const update = (idx, field, value) => {
    const next = leaders.map((l, i) => (i === idx ? { ...l, [field]: value } : l))
    onChange(next)
  }
  const remove = (idx) => {
    onChange(leaders.filter((_, i) => i !== idx))
  }
  const add = () => {
    onChange([...leaders, { role: '', name: '', email: '', phone: '' }])
  }

  return (
    <div className="space-y-2" role="group" aria-labelledby={groupId}>
      <span id={groupId} className="text-xs text-slate-500">{isFrench ? 'Responsables' : 'Leaders'}</span>
      {leaders.map((leader, idx) => (
        <div key={idx} className="flex flex-wrap items-center gap-2">
          <input
            className="mt-1 w-24 rounded border px-2 py-1 text-sm"
            placeholder={isFrench ? 'Rôle' : 'Role'}
            value={leader.role || ''}
            onChange={(e) => update(idx, 'role', e.target.value)}
          />
          <input
            className="mt-1 flex-1 min-w-[8rem] rounded border px-2 py-1 text-sm"
            placeholder={isFrench ? 'Nom' : 'Name'}
            value={leader.name || ''}
            onChange={(e) => update(idx, 'name', e.target.value)}
          />
          <input
            className="mt-1 flex-1 min-w-[8rem] rounded border px-2 py-1 text-sm"
            placeholder="Email"
            value={leader.email || ''}
            onChange={(e) => update(idx, 'email', e.target.value)}
          />
          <input
            className="mt-1 w-32 rounded border px-2 py-1 text-sm"
            placeholder={isFrench ? 'Téléphone' : 'Phone'}
            value={leader.phone || ''}
            onChange={(e) => update(idx, 'phone', e.target.value)}
          />
          <button
            type="button"
            onClick={() => remove(idx)}
            aria-label={isFrench ? 'Supprimer' : 'Remove'}
            className="rounded border px-2 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            ×
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="rounded border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
      >
        {isFrench ? '＋ Ajouter un responsable' : '＋ Add a leader'}
      </button>
    </div>
  )
}

export function RegionForm({ mode = 'create', initial = {}, onSubmit, onCancel, isFrench }) {
  const [regionId, setRegionId] = useState(initial.regionId || initial.id || '')
  const [name, setName] = useState(initial.name || '')
  const [fullName, setFullName] = useState(initial.fullName || '')
  const [description, setDescription] = useState(initial.description || '')
  const [responsibleName, setResponsibleName] = useState(initial.responsibleName || '')
  const [leaders, setLeaders] = useState(Array.isArray(initial.leaders) ? initial.leaders : [])
  const [countryCodesText, setCountryCodesText] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (mode === 'create') {
      if (!regionId || !/^[A-Za-z]{2,6}$/.test(regionId)) {
        setError(isFrench ? "L'identifiant de région doit comporter 2 à 6 lettres." : 'Region ID must be 2–6 letters.')
        return
      }
    }
    if (!name.trim()) {
      setError(isFrench ? 'Le nom est requis.' : 'Name is required.')
      return
    }

    const body = {
      regionId: regionId.toUpperCase(),
      name,
      fullName,
      description,
      responsibleName,
      leaders,
    }
    if (mode === 'create' && countryCodesText.trim()) {
      body.countryCodes = countryCodesText
        .split(/[\s,]+/)
        .filter(Boolean)
        .map((s) => s.toUpperCase())
    }

    try {
      setSaving(true)
      await onSubmit(body)
    } catch (err) {
      setError(errMsg(err, isFrench))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <h3 className="text-lg font-bold text-slate-900">
        {mode === 'edit'
          ? isFrench ? 'Modifier la région' : 'Edit region'
          : isFrench ? 'Créer une région' : 'New region'}
      </h3>

      <div>
        <label htmlFor="region-country-forms-region-id-code" className="text-xs text-slate-500">{isFrench ? 'Identifiant (sigle)' : 'Region ID (code)'}</label>
        <input
          id="region-country-forms-region-id-code"
          className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-slate-100"
          value={regionId}
          disabled={mode === 'edit'}
          onChange={(e) => setRegionId(e.target.value.toUpperCase())}
          placeholder="FCA"
        />
      </div>

      <div>
        <label htmlFor="region-country-forms-name" className="text-xs text-slate-500">{isFrench ? 'Nom' : 'Name'}</label>
        <input
          id="region-country-forms-name"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="region-country-forms-full-name" className="text-xs text-slate-500">{isFrench ? 'Nom complet' : 'Full name'}</label>
        <input
          id="region-country-forms-full-name"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="region-country-forms-description" className="text-xs text-slate-500">{isFrench ? 'Description' : 'Description'}</label>
        <textarea
          id="region-country-forms-description"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="region-country-forms-responsible" className="text-xs text-slate-500">{isFrench ? 'Responsable' : 'Responsible'}</label>
        <input
          id="region-country-forms-responsible"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={responsibleName}
          onChange={(e) => setResponsibleName(e.target.value)}
        />
      </div>

      <LeadersEditor leaders={leaders} onChange={setLeaders} isFrench={isFrench} />

      {mode === 'create' && (
        <div>
          <label htmlFor="region-country-forms-country-codes" className="text-xs text-slate-500">{isFrench ? 'Codes pays' : 'Country codes'}</label>
          <input
            id="region-country-forms-country-codes"
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={countryCodesText}
            onChange={(e) => setCountryCodesText(e.target.value)}
            placeholder="CM, TD, GA"
          />
          <p className="mt-1 text-xs text-slate-400">{isFrench ? 'séparés par des virgules' : 'comma separated'}</p>
        </div>
      )}

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? (isFrench ? 'Enregistrement…' : 'Saving…') : isFrench ? 'Enregistrer' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          {isFrench ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}

export function CountryForm({ mode = 'create', initial = {}, regionId, onSubmit, onCancel, isFrench }) {
  const [code, setCode] = useState(initial.code || '')
  const [code3, setCode3] = useState(initial.code3 || '')
  const [nameFr, setNameFr] = useState(initial.nameFr || initial.name || '')
  const [nameEn, setNameEn] = useState(initial.nameEn || '')
  const [capital, setCapital] = useState(initial.capital || '')
  const [lat, setLat] = useState(
    initial.defaultCenter?.lat !== undefined && initial.defaultCenter?.lat !== null ? String(initial.defaultCenter.lat) : ''
  )
  const [lng, setLng] = useState(
    initial.defaultCenter?.lng !== undefined && initial.defaultCenter?.lng !== null ? String(initial.defaultCenter.lng) : ''
  )
  const [description, setDescription] = useState(initial.description || '')
  const [responsibleName, setResponsibleName] = useState(initial.responsibleName || '')
  const [leaders, setLeaders] = useState(Array.isArray(initial.leaders) ? initial.leaders : [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (mode === 'create') {
      if (!code || !/^[A-Za-z]{2}$/.test(code)) {
        setError(isFrench ? 'Le code pays doit comporter 2 lettres.' : 'Country code must be 2 letters.')
        return
      }
    }
    if (!nameFr.trim() && !nameEn.trim()) {
      setError(isFrench ? 'Un nom (FR ou EN) est requis.' : 'A name (FR or EN) is required.')
      return
    }

    const body = {
      code: code.toUpperCase(),
      code3: (code3 || '').toUpperCase(),
      nameFr,
      nameEn,
      capital,
      regionId,
      responsibleName,
      leaders,
      description,
    }
    if (lat !== '' && lng !== '') {
      body.defaultCenter = { lat: Number(lat), lng: Number(lng) }
    }

    try {
      setSaving(true)
      await onSubmit(body)
    } catch (err) {
      setError(errMsg(err, isFrench))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <h3 className="text-lg font-bold text-slate-900">
        {mode === 'edit'
          ? isFrench ? 'Modifier le pays' : 'Edit country'
          : isFrench ? 'Créer un pays' : 'New country'}
      </h3>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="region-country-forms-code-2-letters" className="text-xs text-slate-500">{isFrench ? 'Code (2 lettres)' : 'Code (2 letters)'}</label>
          <input
            id="region-country-forms-code-2-letters"
            className="mt-1 w-full rounded border px-2 py-1 text-sm disabled:bg-slate-100"
            value={code}
            disabled={mode === 'edit'}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="CM"
          />
        </div>
        <div className="flex-1">
          <label htmlFor="region-country-forms-code-3-letters" className="text-xs text-slate-500">{isFrench ? 'Code (3 lettres)' : 'Code (3 letters)'}</label>
          <input
            id="region-country-forms-code-3-letters"
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={code3}
            onChange={(e) => setCode3(e.target.value.toUpperCase())}
            placeholder="CMR"
          />
        </div>
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="region-country-forms-name-fr" className="text-xs text-slate-500">{isFrench ? 'Nom (FR)' : 'Name (FR)'}</label>
          <input
            id="region-country-forms-name-fr"
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={nameFr}
            onChange={(e) => setNameFr(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="region-country-forms-name-en" className="text-xs text-slate-500">{isFrench ? 'Nom (EN)' : 'Name (EN)'}</label>
          <input
            id="region-country-forms-name-en"
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="region-country-forms-capital" className="text-xs text-slate-500">{isFrench ? 'Capitale' : 'Capital'}</label>
        <input
          id="region-country-forms-capital"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={capital}
          onChange={(e) => setCapital(e.target.value)}
        />
      </div>

      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor="region-country-forms-latitude" className="text-xs text-slate-500">{isFrench ? 'Latitude' : 'Latitude'}</label>
          <input
            id="region-country-forms-latitude"
            type="number"
            step="any"
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
          />
        </div>
        <div className="flex-1">
          <label htmlFor="region-country-forms-longitude" className="text-xs text-slate-500">{isFrench ? 'Longitude' : 'Longitude'}</label>
          <input
            id="region-country-forms-longitude"
            type="number"
            step="any"
            className="mt-1 w-full rounded border px-2 py-1 text-sm"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
          />
        </div>
      </div>

      <div>
        <label htmlFor="region-country-forms-description-2" className="text-xs text-slate-500">{isFrench ? 'Description' : 'Description'}</label>
        <textarea
          id="region-country-forms-description-2"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label htmlFor="region-country-forms-responsible-2" className="text-xs text-slate-500">{isFrench ? 'Responsable' : 'Responsible'}</label>
        <input
          id="region-country-forms-responsible-2"
          className="mt-1 w-full rounded border px-2 py-1 text-sm"
          value={responsibleName}
          onChange={(e) => setResponsibleName(e.target.value)}
        />
      </div>

      <LeadersEditor leaders={leaders} onChange={setLeaders} isFrench={isFrench} />

      {error && <p className="text-sm font-semibold text-red-600">{error}</p>}

      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {saving ? (isFrench ? 'Enregistrement…' : 'Saving…') : isFrench ? 'Enregistrer' : 'Save'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded border px-3 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
        >
          {isFrench ? 'Annuler' : 'Cancel'}
        </button>
      </div>
    </form>
  )
}
