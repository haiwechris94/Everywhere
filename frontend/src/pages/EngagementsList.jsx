/**
 * EngagementsList — « Engagements » (FR/EN)
 *
 * Global, filterable list of ALL DMM engagements across every country. The
 * server returns only the canonical engagement set (source ∈ {DMM,Survey,manual}
 * — the same filter the map's /map/dmm-engagements layer uses), so Joshua Project
 * / PeopleGroups.org reference peoples are never listed. isDmmEngagement() from
 * utils/dmmEngagement is applied as a shared client-side safety net.
 * Filters cascade Country -> Admin 1 -> Admin 2 -> Admin 3, plus a status filter.
 * Admin/supervisor users can add, edit and (reversibly) archive engagements.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Search, Plus, Pencil, Archive, ArchiveRestore, X } from 'lucide-react'
import { peopleGroupsApi, fetchAllPages } from '../services/api'
import {
  isDmmEngagement,
  DMM_ENGAGEMENT_SOURCES,
  normalizeDmmStage,
  dmmStageColors,
} from '../utils/dmmEngagement'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import { PageHeader, StateLoading, StateError, StateEmpty } from './geography/geoComponents'

const countryOf = (pg) => pg.country || pg.countryCode || ''
const admin1Of = (pg) => pg.region || ''
const admin2Of = (pg) => pg.admin2 || pg.departement || ''
const admin3Of = (pg) => pg.admin3 || pg.arrondissement || ''

const STATUS_OPTIONS = ['unreached', 'pioneer', 'midway', 'tipping-point', 'dmm']
// Pastille d'un statut d'ENGAGEMENT (échelle DMM). Les couleurs viennent de la
// palette canonique unique (utils/dmmEngagement.js) : Pionnier=orange,
// Mi-parcours=jaune, Basculement=vert clair, Mouvement=vert foncé.
// 'unreached' n'est pas une étape DMM (état pré-engagement) → rouge neutre.
const statusClass = (s) => {
  if (s === 'unreached') return 'bg-red-100 text-red-800'
  const stage = normalizeDmmStage(s)
  return stage ? dmmStageColors(stage).badge : 'bg-neutral-100 text-neutral-600'
}

const distinct = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'))

const emptyForm = {
  name: '',
  villageName: '',
  country: '',
  countryCode: '',
  region: '',
  admin2: '',
  admin3: '',
  status: '',
  numberOfChurches: '',
  churchGeneration: '',
  donor: '',
  nationalCoordinator: '',
  churchPlanter: '',
  description: '',
}

const EngagementsList = () => {
  const { isFrench } = useLanguage()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = !!user && (user.role === 'admin' || user.role === 'supervisor')

  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [fCountry, setFCountry] = useState('')
  const [fAdmin1, setFAdmin1] = useState('')
  const [fAdmin2, setFAdmin2] = useState('')
  const [fAdmin3, setFAdmin3] = useState('')
  const [fStatus, setFStatus] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  // Fetch the engagement set the SERVER already filtered down to, across ALL
  // countries, instead of pulling the first page of all 27k people groups and
  // filtering client-side. The source filter mirrors the map's canonical layer
  // (GET /api/master-people/map/dmm-engagements → source ∈ {DMM,Survey,manual}),
  // so Joshua Project / PeopleGroups.org reference peoples are excluded at the DB.
  // The set is small (~80), but fetchAllPages keeps it robust if it ever grows.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['eng-list', showArchived],
    queryFn: () =>
      fetchAllPages(
        (params) => peopleGroupsApi.getAll(params),
        {
          source: DMM_ENGAGEMENT_SOURCES.join(','),
          ...(showArchived ? { onlyArchived: 'true' } : {}),
        },
        { limit: 500 }
      ),
  })

  // Safety net only: the server already restricts to engagement sources, but we
  // re-apply the shared canonical definition so a stray reference record can
  // never slip in and a real DMM engagement is never hidden.
  const engagements = useMemo(() => (Array.isArray(data) ? data.filter(isDmmEngagement) : []), [data])

  const countryOptions = useMemo(() => distinct(engagements.map(countryOf)), [engagements])
  const admin1Options = useMemo(
    () => distinct(engagements.filter((p) => !fCountry || countryOf(p) === fCountry).map(admin1Of)),
    [engagements, fCountry]
  )
  const admin2Options = useMemo(
    () =>
      distinct(
        engagements
          .filter((p) => (!fCountry || countryOf(p) === fCountry) && (!fAdmin1 || admin1Of(p) === fAdmin1))
          .map(admin2Of)
      ),
    [engagements, fCountry, fAdmin1]
  )
  const admin3Options = useMemo(
    () =>
      distinct(
        engagements
          .filter(
            (p) =>
              (!fCountry || countryOf(p) === fCountry) &&
              (!fAdmin1 || admin1Of(p) === fAdmin1) &&
              (!fAdmin2 || admin2Of(p) === fAdmin2)
          )
          .map(admin3Of)
      ),
    [engagements, fCountry, fAdmin1, fAdmin2]
  )
  const statusOptions = useMemo(() => distinct(engagements.map((p) => p.status)), [engagements])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return engagements.filter((p) => {
      if (fCountry && countryOf(p) !== fCountry) return false
      if (fAdmin1 && admin1Of(p) !== fAdmin1) return false
      if (fAdmin2 && admin2Of(p) !== fAdmin2) return false
      if (fAdmin3 && admin3Of(p) !== fAdmin3) return false
      if (fStatus && p.status !== fStatus) return false
      if (q) {
        const hay = `${p.name || ''} ${p.churchPlanter || ''} ${p.nationalCoordinator || ''} ${countryOf(p)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [engagements, fCountry, fAdmin1, fAdmin2, fAdmin3, fStatus, search])

  const saveMutation = useMutation({
    mutationFn: (payload) => {
      const body = { ...payload }
      ;['numberOfChurches', 'churchGeneration'].forEach((k) => {
        if (body[k] === '' || body[k] === null || body[k] === undefined) delete body[k]
        else body[k] = Number(body[k])
      })
      Object.keys(body).forEach((k) => {
        if (typeof body[k] === 'string' && body[k].trim() === '') delete body[k]
      })
      if (!editing) {
        // New engagements are manual DMM engagements by default.
        body.source = 'manual'
        body.isNGEngaged = true
      }
      return editing ? peopleGroupsApi.update(editing._id, body) : peopleGroupsApi.create(body)
    },
    onSuccess: () => {
      toast.success(editing ? (isFrench ? 'Engagement mis à jour' : 'Engagement updated') : isFrench ? 'Engagement ajouté' : 'Engagement added')
      // Refresh this list AND every page derived from the same engagement data,
      // so the whole app stays consistent whenever an engagement is saved:
      //  - 'eng-list'      -> this Engagements list
      //  - 'ng-countries'  -> Pays page per-country engagement/PG counts
      //  - 'persons-list'  -> Personnes page (coordinators/planters come from engagements)
      queryClient.invalidateQueries({ queryKey: ['eng-list'] })
      queryClient.invalidateQueries({ queryKey: ['ng-countries'] })
      queryClient.invalidateQueries({ queryKey: ['persons-list'] })
      closeForm()
    },
    onError: (e) => toast.error(e?.response?.data?.message || (isFrench ? 'Échec de l’enregistrement' : 'Save failed')),
  })

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }) => (archived ? peopleGroupsApi.unarchive(id) : peopleGroupsApi.archive(id)),
    onSuccess: (_r, v) => {
      toast.success(v.archived ? (isFrench ? 'Engagement désarchivé' : 'Unarchived') : isFrench ? 'Engagement archivé' : 'Archived')
      queryClient.invalidateQueries({ queryKey: ['eng-list'] })
      queryClient.invalidateQueries({ queryKey: ['ng-countries'] })
      queryClient.invalidateQueries({ queryKey: ['persons-list'] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || (isFrench ? 'Action impossible' : 'Action failed')),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }
  const openEdit = (pg) => {
    setEditing(pg)
    setForm({
      name: pg.name || '',
      villageName: pg.villageName || '',
      country: pg.country || '',
      countryCode: pg.countryCode || '',
      region: pg.region || '',
      admin2: pg.admin2 || pg.departement || '',
      admin3: pg.admin3 || pg.arrondissement || '',
      status: pg.status || '',
      numberOfChurches: pg.numberOfChurches ?? '',
      churchGeneration: pg.churchGeneration ?? '',
      donor: pg.donor || '',
      nationalCoordinator: pg.nationalCoordinator || '',
      churchPlanter: pg.churchPlanter || '',
      description: pg.description || '',
    })
    setFormOpen(true)
  }
  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
  }
  const onField = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const FilterSelect = ({ value, onChange, options, placeholder }) =>
    options.length > 0 ? (
      <select
        value={value}
        onChange={onChange}
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    ) : null

  return (
    <div className="p-6">
      <PageHeader
        breadcrumb={[{ label: 'Engagements' }]}
        title="Engagements"
        subtitle={
          isFrench
            ? 'Liste de tous les engagements DMM, filtrable par pays et niveaux administratifs 1, 2 et 3.'
            : 'All DMM engagements, filterable by country and administrative levels 1, 2 and 3.'
        }
        stats={[{ label: 'Engagements', value: filtered.length }]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            <Plus size={16} /> {isFrench ? 'Ajouter un engagement' : 'Add engagement'}
          </button>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-neutral-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {isFrench ? 'Afficher les archivés' : 'Show archived'}
        </label>
        <div className="relative ml-auto w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isFrench ? 'Rechercher…' : 'Search…'}
            className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <FilterSelect
          value={fCountry}
          onChange={(e) => {
            setFCountry(e.target.value)
            setFAdmin1('')
            setFAdmin2('')
            setFAdmin3('')
          }}
          options={countryOptions}
          placeholder={isFrench ? 'Tous les pays' : 'All countries'}
        />
        <FilterSelect
          value={fAdmin1}
          onChange={(e) => {
            setFAdmin1(e.target.value)
            setFAdmin2('')
            setFAdmin3('')
          }}
          options={admin1Options}
          placeholder={isFrench ? 'Admin 1 (région)' : 'Admin 1 (region)'}
        />
        <FilterSelect
          value={fAdmin2}
          onChange={(e) => {
            setFAdmin2(e.target.value)
            setFAdmin3('')
          }}
          options={admin2Options}
          placeholder="Admin 2"
        />
        <FilterSelect value={fAdmin3} onChange={(e) => setFAdmin3(e.target.value)} options={admin3Options} placeholder="Admin 3" />
        <FilterSelect value={fStatus} onChange={(e) => setFStatus(e.target.value)} options={statusOptions} placeholder={isFrench ? 'Tous les statuts' : 'All statuses'} />
      </div>

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des engagements…' : 'Loading engagements…'} />
      ) : isError ? (
        <StateError label={isFrench ? 'Erreur de chargement.' : 'Loading error.'} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucun engagement.' : 'No engagements.'} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <tr>
                <th className="px-4 py-3">{isFrench ? 'Nom' : 'Name'}</th>
                <th className="px-4 py-3">{isFrench ? 'Pays' : 'Country'}</th>
                <th className="px-4 py-3">Admin 1</th>
                <th className="px-4 py-3">Admin 2</th>
                <th className="px-4 py-3">Admin 3</th>
                <th className="px-4 py-3">{isFrench ? 'Statut' : 'Status'}</th>
                <th className="px-4 py-3">{isFrench ? 'Implanteur' : 'Church planter'}</th>
                <th className="px-4 py-3">{isFrench ? 'Coordinateur' : 'Coordinator'}</th>
                <th className="px-4 py-3 text-right">{isFrench ? 'Églises' : 'Churches'}</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.map((pg) => (
                <tr key={pg._id} className="hover:bg-neutral-50">
                  <td className="px-4 py-3 font-medium"><Link to={`/engagements/${pg._id}`} className="text-blue-600 hover:underline">{pg.name}</Link></td>
                  <td className="px-4 py-3 text-neutral-600">{countryOf(pg) || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{admin1Of(pg) || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{admin2Of(pg) || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{admin3Of(pg) || '—'}</td>
                  <td className="px-4 py-3">
                    {pg.status ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(pg.status)}`}>{pg.status}</span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-600">{pg.churchPlanter || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600">{pg.nationalCoordinator || '—'}</td>
                  <td className="px-4 py-3 text-right text-neutral-600">{pg.numberOfChurches ?? 0}</td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(pg)}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
                        >
                          <Pencil size={14} /> {isFrench ? 'Modifier' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          disabled={archiveMutation.isPending}
                          onClick={() => {
                            const isArch = !!pg.isArchived
                            if (window.confirm(isArch ? (isFrench ? 'Désarchiver cet engagement ?' : 'Unarchive this engagement?') : isFrench ? 'Archiver cet engagement ?' : 'Archive this engagement?')) {
                              archiveMutation.mutate({ id: pg._id, archived: isArch })
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100"
                        >
                          {pg.isArchived ? (
                            <>
                              <ArchiveRestore size={14} /> {isFrench ? 'Désarchiver' : 'Unarchive'}
                            </>
                          ) : (
                            <>
                              <Archive size={14} /> {isFrench ? 'Archiver' : 'Archive'}
                            </>
                          )}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">
                {editing ? (isFrench ? 'Modifier l’engagement' : 'Edit engagement') : isFrench ? 'Ajouter un engagement' : 'Add engagement'}
              </h2>
              <button type="button" onClick={closeForm} className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
                <X size={18} />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!form.name.trim()) {
                  toast.error(isFrench ? 'Le nom est requis' : 'Name is required')
                  return
                }
                saveMutation.mutate(form)
              }}
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <Field label={isFrench ? 'Nom *' : 'Name *'} value={form.name} onChange={onField('name')} />
              <Field label={isFrench ? 'Village' : 'Village'} value={form.villageName} onChange={onField('villageName')} />
              <Field label={isFrench ? 'Pays' : 'Country'} value={form.country} onChange={onField('country')} />
              <Field label={isFrench ? 'Code pays' : 'Country code'} value={form.countryCode} onChange={onField('countryCode')} />
              <Field label="Admin 1 (région)" value={form.region} onChange={onField('region')} />
              <Field label="Admin 2" value={form.admin2} onChange={onField('admin2')} />
              <Field label="Admin 3" value={form.admin3} onChange={onField('admin3')} />
              <div>
                <label className="mb-1 block text-xs font-medium text-neutral-600">{isFrench ? 'Statut' : 'Status'}</label>
                <select value={form.status} onChange={onField('status')} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm">
                  <option value="">—</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <Field label={isFrench ? 'Implanteur' : 'Church planter'} value={form.churchPlanter} onChange={onField('churchPlanter')} />
              <Field label={isFrench ? 'Coordinateur national' : 'National coordinator'} value={form.nationalCoordinator} onChange={onField('nationalCoordinator')} />
              <Field label={isFrench ? 'Directeur / Donateur' : 'Director / Donor'} value={form.donor} onChange={onField('donor')} />
              <Field label={isFrench ? 'Nombre d’églises' : 'Number of churches'} type="number" value={form.numberOfChurches} onChange={onField('numberOfChurches')} />
              <Field label={isFrench ? 'Génération d’église' : 'Church generation'} type="number" value={form.churchGeneration} onChange={onField('churchGeneration')} />
              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-medium text-neutral-600">Description</label>
                <textarea value={form.description} onChange={onField('description')} rows={3} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm" />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100">
                  {isFrench ? 'Annuler' : 'Cancel'}
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60">
                  {saveMutation.isPending ? (isFrench ? 'Enregistrement…' : 'Saving…') : isFrench ? 'Enregistrer' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const Field = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="mb-1 block text-xs font-medium text-neutral-600">{label}</label>
    <input type={type} value={value} onChange={onChange} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
  </div>
)

export default EngagementsList
