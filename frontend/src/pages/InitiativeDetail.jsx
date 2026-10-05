import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ChevronDown, Plus, Search, Users2, BookOpenText, Loader2, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { initiativesApi } from '../services/reportingApi'
import { masterPeopleApi } from '../services/api'
import { StateLoading, StateError, StateEmpty } from './geography/geoComponents'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import { initiativeDisplayName } from '../utils/initiativeLabel'
import AnalyseQualitative from './AnalyseQualitative'

// Accent colours per initiative so each page has its own identity.
const THEME = {
  ESP300: { chip: 'bg-blue-50 text-blue-700 border-blue-200', icon: 'bg-blue-50 text-blue-600' },
  YCS: { chip: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: 'bg-emerald-50 text-emerald-600' },
}

// One collapsible Scripture Set card (ESP300 curriculum).
const SetCard = ({ set }) => {
  const [open, setOpen] = useState(set.setNumber === 1)
  const passages = set.passages || []
  const groups = set.groups || []
  const total = passages.length || groups.reduce((n, g) => n + (g.passages?.length || 0), 0)

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        {open ? <ChevronDown size={18} className="text-blue-600 shrink-0" /> : <ChevronRight size={18} className="text-blue-600 shrink-0" />}
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">
          {set.setNumber}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-900">{set.title}</span>
          {set.subtitle && <span className="block text-xs text-slate-500">{set.subtitle}</span>}
        </span>
        <span className="shrink-0 text-xs text-slate-400">{total}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 px-4 py-3 space-y-3">
          {set.note && <p className="text-xs italic text-slate-500">{set.note}</p>}
          {passages.length > 0 && (
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-700 marker:text-slate-400">
              {passages.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ol>
          )}
          {groups.map((g) => (
            <div key={g.theme} className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.theme}</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700 marker:text-slate-300">
                {(g.passages || []).map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Modal to engage a people group in the initiative (managers only).
const AddPeopleModal = ({ initiativeKey, onClose, onAdded }) => {
  const { isFrench } = useLanguage()
  const [term, setTerm] = useState('')
  const [language, setLanguage] = useState('')
  const [selected, setSelected] = useState(null)

  const { data, isFetching } = useQuery({
    queryKey: ['mp-picker', term],
    queryFn: async () => {
      const res = await masterPeopleApi.getAll({ q: term, limit: 20 })
      return Array.isArray(res?.data?.items) ? res.data.items : []
    },
  })
  const results = data || []

  const addMutation = useMutation({
    mutationFn: () =>
      initiativesApi.addPeople(initiativeKey, {
        masterPeopleId: selected._id,
        language,
      }),
    onSuccess: () => {
      toast.success(isFrench ? 'Peuple ajouté' : 'People group added')
      onAdded()
      onClose()
    },
    onError: (err) => toast.error(err.response?.data?.message || (isFrench ? 'Erreur' : 'Error')),
  })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">
            {isFrench ? 'Ajouter un peuple' : 'Add a people group'}
          </h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:text-slate-600"><X size={18} /></button>
        </div>

        <div className="relative mb-3">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder={isFrench ? 'Rechercher un peuple par nom…' : 'Search a people group by name…'}
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="max-h-56 overflow-y-auto rounded-lg border border-slate-100">
          {isFetching ? (
            <div className="flex items-center justify-center py-6 text-slate-400"><Loader2 className="animate-spin" size={18} /></div>
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">{isFrench ? 'Aucun résultat' : 'No result'}</p>
          ) : (
            results.map((p) => (
              <button
                key={p._id}
                onClick={() => setSelected(p)}
                className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50 ${
                  selected?._id === p._id ? 'bg-blue-50' : ''
                }`}
              >
                <span className="font-medium text-slate-700">{p.canonicalName}</span>
                <span className="text-xs text-slate-400">{p.primaryCountryCode || ''}</span>
              </button>
            ))
          )}
        </div>

        <label className="mt-3 block text-xs text-slate-500">
          {isFrench ? 'Langue locale (optionnel)' : 'Local language (optional)'}
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            {isFrench ? 'Annuler' : 'Cancel'}
          </button>
          <button
            disabled={!selected || addMutation.isPending}
            onClick={() => addMutation.mutate()}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {addMutation.isPending && <Loader2 className="animate-spin" size={14} />}
            {isFrench ? 'Ajouter' : 'Add'}
          </button>
        </div>
      </div>
    </div>
  )
}

const InitiativeDetail = () => {
  const { isFrench } = useLanguage()
  const { key: rawKey } = useParams()
  const key = String(rawKey || '').toUpperCase()
  const theme = THEME[key] || THEME.ESP300
  const { user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'supervisor'
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['initiative', key],
    queryFn: async () => (await initiativesApi.get(key)).data?.data,
    retry: false,
  })

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['initiative', key] })

  if (isLoading) return <div className="p-6"><StateLoading label={isFrench ? 'Chargement du projet…' : 'Loading project…'} /></div>
  if (isError || !data) return <div className="p-6"><StateError label={isFrench ? 'Projet introuvable.' : 'Project not found.'} /></div>

  const sets = data.sets || []
  const peoples = data.peoples || []

  return (
    <div className="p-6 space-y-6">
      {/* Fil d'Ariane */}
      <p className="text-sm text-gray-500">
        <Link to="/initiatives" className="font-bold hover:text-slate-700">{isFrench ? 'Initiatives' : 'Initiatives'}</Link> / {initiativeDisplayName(key || data.name, { isFrench }, data.name)}
      </p>

      {/* En-tête */}
      <div className="flex items-start gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${theme.icon}`}>
          <BookOpenText size={28} />
        </div>
        <div className="min-w-0">
          <h1 className="text-4xl font-bold text-slate-900">{initiativeDisplayName(key || data.name, { isFrench }, data.name)}</h1>
          {data.fullName && data.fullName !== data.name && key !== 'YCS' && (
            <p className="mt-1 text-sm text-slate-500">{data.fullName}</p>
          )}
        </div>
      </div>

      {data.summary && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <p className="text-slate-600 whitespace-pre-line">{data.summary}</p>
        </section>
      )}

      {/* Curriculum (séries ESP 300) */}
      {sets.length > 0 && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <h2 className="mb-4 text-xl font-bold text-slate-900">
            {isFrench ? `Séries de passages (${sets.length})` : `Scripture Sets (${sets.length})`}
          </h2>
          <div className="space-y-3">
            {sets.map((s) => (
              <SetCard key={s.setNumber} set={s} />
            ))}
          </div>
        </section>
      )}

      {/* Analyse Qualitative — affichée uniquement pour l'initiative YCS.
          Le contenu, les composants et la configuration proviennent de la page
          AnalyseQualitative, désormais rendue ici (ne s'affiche pas pour
          ESP300 ni les autres initiatives). */}
      {key === 'YCS' && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6">
          <AnalyseQualitative />
        </section>
      )}

      {showAdd && (
        <AddPeopleModal initiativeKey={key} onClose={() => setShowAdd(false)} onAdded={refresh} />
      )}
    </div>
  )
}

export default InitiativeDetail
