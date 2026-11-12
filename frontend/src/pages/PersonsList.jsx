/**
 * PersonsList — « Personnes » (FR) / « People » (EN)
 *
 * Registry of every person recorded in the app: directors (directeurs),
 * church planters (implanteurs) and coordinators (coordinateurs).
 * Filterable by role, country and administrative levels. Admin/supervisor
 * users can add, edit and (reversibly) archive persons.
 */
import { useId, useMemo, useState } from 'react'
import { useDialog } from '../components/ui/useDialog'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Search, Plus, Pencil, Archive, ArchiveRestore, X } from 'lucide-react'
import { personsApi } from '../services/personsApi'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'
import { PageHeader, StateLoading, StateError, StateEmpty } from './geography/geoComponents'

const toArray = (res) => {
  const d = res?.data
  if (Array.isArray(d)) return d
  if (Array.isArray(d?.data)) return d.data
  return []
}

const ROLE_VALUES = ['director', 'national_coordinator', 'church_planter', 'coordinator', 'sic', 'sst', 'other']
const roleLabel = (role, isFrench) =>
  ({
    director: isFrench ? 'Directeur' : 'Director',
    national_coordinator: isFrench ? 'Coordinateur national' : 'National coordinator',
    church_planter: isFrench ? 'Implanteur' : 'Church planter',
    coordinator: isFrench ? 'Coordinateur' : 'Coordinator',
    sic: 'SIC (Shepherding Insight Coach)',
    sst: 'SST (Shepherding Support Team)',
    other: isFrench ? 'Autre' : 'Other',
  }[role] || role || '—')
const roleClass = (role) =>
  ({
    director: 'bg-purple-100 text-purple-800',
    national_coordinator: 'bg-indigo-100 text-indigo-800',
    church_planter: 'bg-green-100 text-green-800',
    coordinator: 'bg-blue-100 text-blue-800',
    sic: 'bg-teal-100 text-teal-800',
    sst: 'bg-amber-100 text-amber-800',
    other: 'bg-neutral-100 text-neutral-600',
  }[role] || 'bg-neutral-100 text-neutral-600')

const distinct = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => a.localeCompare(b, 'fr'))

const emptyForm = {
  name: '',
  role: 'director',
  email: '',
  phone: '',
  organization: '',
  country: '',
  countryCode: '',
  region: '',
  admin2: '',
  admin3: '',
  notes: '',
}

const PersonsList = () => {
  const { isFrench } = useLanguage()
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const canManage = !!user && (user.role === 'admin' || user.role === 'supervisor')

  const [showArchived, setShowArchived] = useState(false)
  const [search, setSearch] = useState('')
  const [fRole, setFRole] = useState('')
  const [fCountry, setFCountry] = useState('')
  const [fAdmin1, setFAdmin1] = useState('')
  const [fAdmin2, setFAdmin2] = useState('')
  const [fAdmin3, setFAdmin3] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const formDialogRef = useDialog(formOpen, () => setFormOpen(false))
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['persons-list', showArchived],
    queryFn: () => personsApi.getAll(showArchived ? { limit: 1000, onlyArchived: 'true' } : { limit: 1000 }),
    select: toArray,
  })

  const list = Array.isArray(data) ? data : []

  const countryOf = (p) => p.country || p.countryCode || ''
  const countryOptions = useMemo(() => distinct(list.map(countryOf)), [list])
  const admin1Options = useMemo(
    () => distinct(list.filter((p) => !fCountry || countryOf(p) === fCountry).map((p) => p.region || '')),
    [list, fCountry]
  )
  const admin2Options = useMemo(
    () =>
      distinct(
        list
          .filter((p) => (!fCountry || countryOf(p) === fCountry) && (!fAdmin1 || (p.region || '') === fAdmin1))
          .map((p) => p.admin2 || '')
      ),
    [list, fCountry, fAdmin1]
  )
  const admin3Options = useMemo(
    () =>
      distinct(
        list
          .filter(
            (p) =>
              (!fCountry || countryOf(p) === fCountry) &&
              (!fAdmin1 || (p.region || '') === fAdmin1) &&
              (!fAdmin2 || (p.admin2 || '') === fAdmin2)
          )
          .map((p) => p.admin3 || '')
      ),
    [list, fCountry, fAdmin1, fAdmin2]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return list.filter((p) => {
      if (fRole && p.role !== fRole) return false
      if (fCountry && countryOf(p) !== fCountry) return false
      if (fAdmin1 && (p.region || '') !== fAdmin1) return false
      if (fAdmin2 && (p.admin2 || '') !== fAdmin2) return false
      if (fAdmin3 && (p.admin3 || '') !== fAdmin3) return false
      if (q) {
        const hay = `${p.name || ''} ${p.email || ''} ${p.organization || ''} ${countryOf(p)}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [list, fRole, fCountry, fAdmin1, fAdmin2, fAdmin3, search])

  const saveMutation = useMutation({
    mutationFn: (payload) => {
      const body = { ...payload }
      Object.keys(body).forEach((k) => {
        if (typeof body[k] === 'string' && body[k].trim() === '' && k !== 'role' && k !== 'name') delete body[k]
      })
      return editing ? personsApi.update(editing._id, body) : personsApi.create(body)
    },
    onSuccess: () => {
      toast.success(editing ? (isFrench ? 'Personne mise à jour' : 'Person updated') : isFrench ? 'Personne ajoutée' : 'Person added')
      queryClient.invalidateQueries({ queryKey: ['persons-list'] })
      closeForm()
    },
    onError: (e) => toast.error(e?.response?.data?.message || (isFrench ? 'Échec de l’enregistrement' : 'Save failed')),
  })

  const archiveMutation = useMutation({
    mutationFn: ({ id, archived }) => (archived ? personsApi.unarchive(id) : personsApi.archive(id)),
    onSuccess: (_r, v) => {
      toast.success(v.archived ? (isFrench ? 'Personne désarchivée' : 'Unarchived') : isFrench ? 'Personne archivée' : 'Archived')
      queryClient.invalidateQueries({ queryKey: ['persons-list'] })
    },
    onError: (e) => toast.error(e?.response?.data?.message || (isFrench ? 'Action impossible' : 'Action failed')),
  })

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormOpen(true)
  }
  const openEdit = (p) => {
    setEditing(p)
    setForm({
      name: p.name || '',
      role: p.role || 'director',
      email: p.email || '',
      phone: p.phone || '',
      organization: p.organization || '',
      country: p.country || '',
      countryCode: p.countryCode || '',
      region: p.region || '',
      admin2: p.admin2 || '',
      admin3: p.admin3 || '',
      notes: p.notes || '',
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
        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700"
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
        breadcrumb={[{ label: isFrench ? 'Personnes' : 'People' }]}
        title={isFrench ? 'Personnes' : 'People'}
        subtitle={
          isFrench
            ? 'Registre de toutes les personnes enregistrées : directeurs, implanteurs et coordinateurs.'
            : 'Registry of everyone recorded in the app: directors, church planters and coordinators.'
        }
        stats={[{ label: isFrench ? 'Personnes' : 'People', value: filtered.length }]}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        {canManage && (
          <button
            type="button"
            onClick={openCreate}
            className="btn-primary btn-sm gap-1.5"
          >
            <Plus size={16} /> {isFrench ? 'Ajouter une personne' : 'Add person'}
          </button>
        )}
        <label className="inline-flex items-center gap-2 text-sm text-neutral-600 dark:text-slate-300">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          {isFrench ? 'Afficher les archivés' : 'Show archived'}
        </label>
        <div className="relative ml-auto w-full max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500 dark:text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isFrench ? 'Rechercher…' : 'Search…'}
            className="w-full rounded-lg border border-neutral-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700"
          />
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-3">
        <select
          value={fRole}
          onChange={(e) => setFRole(e.target.value)}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:bg-slate-800 dark:border-slate-700"
        >
          <option value="">{isFrench ? 'Tous les rôles' : 'All roles'}</option>
          {ROLE_VALUES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(r, isFrench)}
            </option>
          ))}
        </select>
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
      </div>

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des personnes…' : 'Loading people…'} />
      ) : isError ? (
        <StateError label={isFrench ? 'Erreur de chargement.' : 'Loading error.'} onRetry={refetch} />
      ) : filtered.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucune personne enregistrée.' : 'No people recorded.'} />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:bg-slate-800 dark:border-slate-700">
          <table className="min-w-full divide-y divide-neutral-200 text-sm dark:divide-slate-700">
            <thead className="bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500 dark:bg-slate-900">
              <tr>
                <th className="px-4 py-3">{isFrench ? 'Nom' : 'Name'}</th>
                <th className="px-4 py-3">{isFrench ? 'Rôle' : 'Role'}</th>
                <th className="px-4 py-3">{isFrench ? 'Organisation' : 'Organization'}</th>
                <th className="px-4 py-3">{isFrench ? 'Pays' : 'Country'}</th>
                <th className="px-4 py-3">Admin 1</th>
                <th className="px-4 py-3">{isFrench ? 'Contact' : 'Contact'}</th>
                {canManage && <th className="px-4 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 dark:divide-slate-700">
              {filtered.map((p) => {
                const isRegistry = p.origin === 'registry' && !!p._id
                const sourceHint =
                  p.origin === 'engagement'
                    ? isFrench
                      ? "issu d'un engagement"
                      : 'from engagement'
                    : p.origin === 'overlay'
                    ? isFrench
                      ? 'responsable région/pays'
                      : 'region/country leader'
                    : ''
                return (
                <tr key={p._id || p.id} className="hover:bg-neutral-50 dark:hover:bg-slate-700">
                  <td className="px-4 py-3 font-medium text-neutral-900 dark:text-slate-100">
                    {p.name}
                    {!isRegistry && sourceHint ? (
                      <span className="ml-2 text-xs font-normal italic text-neutral-500 dark:text-slate-400">{sourceHint}</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleClass(p.role)}`}>{roleLabel(p.role, isFrench)}</span>
                  </td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{p.organization || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{countryOf(p) || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">{p.region || '—'}</td>
                  <td className="px-4 py-3 text-neutral-600 dark:text-slate-300">
                    {p.email || p.phone ? (
                      <span>
                        {p.email || ''}
                        {p.email && p.phone ? ' · ' : ''}
                        {p.phone || ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      {isRegistry ? (
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(p)}
                            className="btn-secondary btn-sm gap-1"
                          >
                            <Pencil size={14} /> {isFrench ? 'Modifier' : 'Edit'}
                          </button>
                          <button
                            type="button"
                            disabled={archiveMutation.isPending}
                            onClick={() => {
                              const isArch = !!p.isArchived
                              if (window.confirm(isArch ? (isFrench ? 'Désarchiver cette personne ?' : 'Unarchive this person?') : isFrench ? 'Archiver cette personne ?' : 'Archive this person?')) {
                                archiveMutation.mutate({ id: p._id, archived: isArch })
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 px-2 py-1 text-xs text-neutral-700 hover:bg-neutral-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-700"
                          >
                            {p.isArchived ? (
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
                      ) : (
                        <div className="flex items-center justify-end">
                          <span className="text-xs text-neutral-500 dark:text-slate-400">—</span>
                        </div>
                      )}
                    </td>
                  )}
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div ref={formDialogRef} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-xl dark:bg-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900 dark:text-slate-100">
                {editing ? (isFrench ? 'Modifier la personne' : 'Edit person') : isFrench ? 'Ajouter une personne' : 'Add person'}
              </h2>
              <button aria-label={isFrench ? "Fermer" : "Close"} type="button" onClick={closeForm} className="rounded p-1 text-neutral-500 dark:text-slate-400 hover:bg-neutral-100 dark:hover:bg-slate-700">
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
              <div>
                <label htmlFor="persons-list-role" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-slate-300">{isFrench ? 'Rôle *' : 'Role *'}</label>
                <select id="persons-list-role" value={form.role} onChange={onField('role')} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-slate-700">
                  {ROLE_VALUES.map((r) => (
                    <option key={r} value={r}>
                      {roleLabel(r, isFrench)}
                    </option>
                  ))}
                </select>
              </div>
              <Field label="Email" type="email" value={form.email} onChange={onField('email')} />
              <Field label={isFrench ? 'Téléphone' : 'Phone'} value={form.phone} onChange={onField('phone')} />
              <Field label={isFrench ? 'Organisation' : 'Organization'} value={form.organization} onChange={onField('organization')} />
              <Field label={isFrench ? 'Pays' : 'Country'} value={form.country} onChange={onField('country')} />
              <Field label={isFrench ? 'Code pays' : 'Country code'} value={form.countryCode} onChange={onField('countryCode')} />
              <Field label="Admin 1 (région)" value={form.region} onChange={onField('region')} />
              <Field label="Admin 2" value={form.admin2} onChange={onField('admin2')} />
              <Field label="Admin 3" value={form.admin3} onChange={onField('admin3')} />
              <div className="sm:col-span-2">
                <label htmlFor="persons-list-notes" className="mb-1 block text-xs font-medium text-neutral-600 dark:text-slate-300">Notes</label>
                <textarea id="persons-list-notes" value={form.notes} onChange={onField('notes')} rows={3} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-slate-700" />
              </div>
              <div className="sm:col-span-2 flex justify-end gap-2 pt-2">
                <button type="button" onClick={closeForm} className="btn-secondary btn-sm">
                  {isFrench ? 'Annuler' : 'Cancel'}
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary btn-sm">
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

const Field = ({ label, value, onChange, type = 'text' }) => {
  const id = useId()
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-neutral-600 dark:text-slate-300">{label}</label>
      <input id={id} type={type} value={value} onChange={onChange} className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700" />
    </div>
  )
}

export default PersonsList
