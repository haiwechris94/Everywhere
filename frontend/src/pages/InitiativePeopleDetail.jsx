import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, Save } from 'lucide-react'
import toast from 'react-hot-toast'
import { initiativesApi } from '../services/reportingApi'
import { StateLoading, StateError } from './geography/geoComponents'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'

// Recording lifecycle for an ESP300 set, with display labels + colour chips.
const SET_STATUS_META = {
  not_started: { fr: 'Non commencé', en: 'Not started', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
  in_progress: { fr: 'En cours', en: 'In progress', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  recorded: { fr: 'Enregistré', en: 'Recorded', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  published: { fr: 'Publié', en: 'Published', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
}
const SET_STATUS_ORDER = ['not_started', 'in_progress', 'recorded', 'published']

const ENGAGEMENT_STATUS = {
  planned: { fr: 'Planifié', en: 'Planned' },
  active: { fr: 'Actif', en: 'Active' },
  completed: { fr: 'Terminé', en: 'Completed' },
  on_hold: { fr: 'En pause', en: 'On hold' },
}

const InitiativePeopleDetail = () => {
  const { isFrench } = useLanguage()
  const { key: rawKey, peopleId } = useParams()
  const key = String(rawKey || '').toUpperCase()
  const { user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'supervisor'
  const queryClient = useQueryClient()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['initiative-people', key, peopleId],
    queryFn: async () => (await initiativesApi.getPeople(key, peopleId)).data?.data,
    retry: false,
  })

  // Local editable copy of the ESP300 per-set progress + generic fields.
  const [sets, setSets] = useState([])
  const [language, setLanguage] = useState('')
  const [status, setStatus] = useState('active')
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (data?.engagement) {
      setSets(data.engagement.esp300Sets || [])
      setLanguage(data.engagement.language || '')
      setStatus(data.engagement.status || 'active')
      setNotes(data.engagement.notes || '')
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () =>
      initiativesApi.updatePeople(key, peopleId, {
        language,
        status,
        notes,
        ...(key === 'ESP300' ? { esp300Sets: sets } : {}),
      }),
    onSuccess: () => {
      toast.success(isFrench ? 'Enregistré' : 'Saved')
      queryClient.invalidateQueries({ queryKey: ['initiative-people', key, peopleId] })
      queryClient.invalidateQueries({ queryKey: ['initiative', key] })
    },
    onError: (err) => toast.error(err.response?.data?.message || (isFrench ? 'Erreur' : 'Error')),
  })

  if (isLoading) return <div className="p-6"><StateLoading label={isFrench ? 'Chargement…' : 'Loading…'} /></div>
  if (isError || !data) return <div className="p-6"><StateError label={isFrench ? 'Détails introuvables.' : 'Details not found.'} /></div>

  const { initiative, engagement } = data
  const curriculum = initiative?.sets || []
  const setMeta = (n) => curriculum.find((s) => s.setNumber === n) || {}

  const updateSet = (setNumber, patch) => {
    setSets((prev) =>
      prev.map((s) => (s.setNumber === setNumber ? { ...s, ...patch } : s))
    )
  }

  return (
    <div className="p-6 space-y-6">
      {/* Fil d'Ariane : Projets ▸ Initiative ▸ Peuple */}
      <p className="text-sm text-gray-500">
        <Link to="/projects" className="hover:text-slate-700">{isFrench ? 'Projets' : 'Projects'}</Link> /{' '}
        <Link to={`/projects/initiatives/${key}`} className="font-bold hover:text-slate-700">{initiative?.name}</Link> /{' '}
        {engagement?.peopleName || peopleId}
      </p>

      <div>
        <h1 className="text-4xl font-bold text-slate-900">{engagement?.peopleName || peopleId}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {initiative?.name}
          {engagement?.countryCode ? ` · ${engagement.countryCode}` : ''}
        </p>
      </div>

      {/* Infos générales de l'engagement */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
        <h2 className="text-lg font-bold text-slate-900">{isFrench ? 'Informations' : 'Overview'}</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="text-xs text-slate-500">
            {isFrench ? 'Langue locale' : 'Local language'}
            <input
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={!canManage}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </label>
          <label className="text-xs text-slate-500">
            {isFrench ? 'Statut' : 'Status'}
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              disabled={!canManage}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {Object.entries(ENGAGEMENT_STATUS).map(([v, lbl]) => (
                <option key={v} value={v}>{isFrench ? lbl.fr : lbl.en}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-xs text-slate-500">
          {isFrench ? 'Notes' : 'Notes'}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={!canManage}
            rows={3}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
      </section>

      {/* ESP300 : progression par série */}
      {key === 'ESP300' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900">
            {isFrench ? 'Progression de l’enregistrement par série' : 'Recording progress by set'}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="py-2 pr-4 text-left text-xs font-semibold tracking-wide text-slate-500 w-12">#</th>
                  <th className="py-2 px-4 text-left text-xs font-semibold tracking-wide text-slate-500">{isFrench ? 'Série' : 'Set'}</th>
                  <th className="py-2 px-4 text-left text-xs font-semibold tracking-wide text-slate-500">{isFrench ? 'Statut' : 'Status'}</th>
                  <th className="py-2 pl-4 text-right text-xs font-semibold tracking-wide text-slate-500">{isFrench ? 'Passages enregistrés' : 'Passages recorded'}</th>
                </tr>
              </thead>
              <tbody>
                {sets.map((s) => {
                  const meta = setMeta(s.setNumber)
                  const m = SET_STATUS_META[s.status] || SET_STATUS_META.not_started
                  return (
                    <tr key={s.setNumber} className="border-b border-slate-100">
                      <td className="py-3 pr-4 text-slate-400">{s.setNumber}</td>
                      <td className="py-3 px-4">
                        <span className="font-medium text-slate-800">{meta.title || `Set ${s.setNumber}`}</span>
                        {meta.subtitle && <span className="block text-xs text-slate-400">{meta.subtitle}</span>}
                      </td>
                      <td className="py-3 px-4">
                        {canManage ? (
                          <select
                            value={s.status}
                            onChange={(e) => updateSet(s.setNumber, { status: e.target.value })}
                            className="rounded-lg border border-slate-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            {SET_STATUS_ORDER.map((st) => (
                              <option key={st} value={st}>{isFrench ? SET_STATUS_META[st].fr : SET_STATUS_META[st].en}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${m.cls}`}>
                            {isFrench ? m.fr : m.en}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-4 text-right">
                        {canManage ? (
                          <input
                            type="number"
                            min={0}
                            value={s.passagesRecorded ?? 0}
                            onChange={(e) => updateSet(s.setNumber, { passagesRecorded: Number(e.target.value) || 0 })}
                            className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-right text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        ) : (
                          <span className="tabular-nums font-bold text-slate-700">{s.passagesRecorded ?? 0}</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {canManage && (
        <div className="flex justify-end">
          <button
            disabled={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saveMutation.isPending ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            {isFrench ? 'Enregistrer' : 'Save'}
          </button>
        </div>
      )}
    </div>
  )
}

export default InitiativePeopleDetail
