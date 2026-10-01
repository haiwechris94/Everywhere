import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  Globe2,
  Users2,
  Plus,
  Trash2,
  Pencil,
  Search,
  X,
  Loader2,
  BookOpenText,
  Headphones,
  ChevronRight,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../i18n'

const STATUS_STYLES = {
  Active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Planning: 'bg-amber-50 text-amber-700 border-amber-200',
  Monitoring: 'bg-blue-50 text-blue-700 border-blue-200',
  Completed: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  'On Hold': 'bg-red-50 text-red-700 border-red-200',
}

const STATUS_OPTIONS = ['Planning', 'Active', 'Monitoring', 'Completed', 'On Hold']

const emptyForm = {
  name: '',
  status: 'Planning',
  owner: '',
  country: '',
  region: '',
  progress: 0,
  churches: 0,
  description: '',
}

const Projects = () => {
  const { isFrench } = useLanguage()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManage = user?.role === 'admin' || user?.role === 'supervisor'
  const isAdmin = user?.role === 'admin'

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editingId, setEditingId] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const { data: projectsRes, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: async () => (await projectsApi.getAll()).data,
  })

  const { data: statsRes } = useQuery({
    queryKey: ['projects-stats'],
    queryFn: async () => (await projectsApi.getStats()).data,
  })

  const allProjects = projectsRes?.data || []
  const stats = statsRes?.data || { projects: 0, countries: 0, teams: 0, churches: 0 }

  // Client-side filtering by status and name search
  const projects = allProjects.filter((p) => {
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter
    const matchesSearch =
      !searchTerm.trim() || (p.name || '').toLowerCase().includes(searchTerm.trim().toLowerCase())
    return matchesStatus && matchesSearch
  })

  const createMutation = useMutation({
    mutationFn: (data) => projectsApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-stats'] })
      toast.success(isFrench ? 'Projet créé' : 'Project created')
      setShowModal(false)
      setForm(emptyForm)
    },
    onError: (err) => toast.error(err.response?.data?.message || (isFrench ? 'Erreur lors de la création' : 'Error while creating')),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-stats'] })
      toast.success(isFrench ? 'Projet mis à jour' : 'Project updated')
      setShowModal(false)
      setForm(emptyForm)
      setEditingId(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || (isFrench ? 'Erreur lors de la mise à jour' : 'Error while updating')),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-stats'] })
      toast.success(isFrench ? 'Projet supprimé' : 'Project deleted')
    },
    onError: (err) => toast.error(err.response?.data?.message || (isFrench ? 'Erreur lors de la suppression' : 'Error while deleting')),
  })

  const openCreate = () => {
    setEditingId(null)
    setForm(emptyForm)
    setShowModal(true)
  }

  const openEdit = (project) => {
    setEditingId(project._id)
    setForm({
      name: project.name || '',
      status: project.status || 'Planning',
      owner: project.owner || '',
      country: project.country || '',
      region: project.region || '',
      progress: project.progress ?? 0,
      churches: project.churches ?? 0,
      description: project.description || '',
    })
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setForm(emptyForm)
    setEditingId(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) {
      toast.error(isFrench ? 'Le nom du projet est requis' : 'Project name is required')
      return
    }
    const payload = {
      ...form,
      progress: Number(form.progress) || 0,
      churches: Number(form.churches) || 0,
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const handleDelete = (id, name) => {
    if (window.confirm(isFrench ? `Supprimer le projet "${name}" ?` : `Delete the project "${name}"?`)) {
      deleteMutation.mutate(id)
    }
  }

  const headerStats = [
    { label: isFrench ? 'Projets' : 'Projects', value: stats.projects, icon: FolderKanban },
    { label: isFrench ? 'Pays' : 'Countries', value: stats.countries, icon: Globe2 },
    { label: isFrench ? 'Équipes' : 'Teams', value: stats.teams, icon: Users2 },
    { label: isFrench ? 'Églises' : 'Churches', value: stats.churches, icon: FileText },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white overflow-hidden shadow-xl">
        <div className="px-6 py-8 sm:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
              <FolderKanban size={14} />
              {isFrench ? 'Projets' : 'Projects'}
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">{isFrench ? 'Tableau de bord des projets' : 'Projects dashboard'}</h1>
              <p className="text-sm sm:text-base text-slate-200 max-w-xl">
                {isFrench ? 'Suivez les initiatives d\'implantation d\'églises, la responsabilité, la progression et la couverture régionale depuis une vue centrale.' : 'Track church planting initiatives, ownership, progress, and regional coverage from one central view.'}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 w-full lg:w-auto lg:min-w-[420px]">
            {headerStats.map((stat) => {
              const Icon = stat.icon
              return (
                <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/8 backdrop-blur px-4 py-4 shadow-lg">
                  <div className="flex items-center justify-between text-white/70 text-xs font-medium uppercase tracking-wider">
                    <span>{stat.label}</span>
                    <Icon size={14} />
                  </div>
                  <div className="mt-3 text-2xl font-bold">{stat.value}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Initiatives spéciales : projets structurés (ESP 300, YCS) avec un suivi
          par peuple. Chaque carte mène à la page dédiée de l'initiative. */}
      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{isFrench ? 'Initiatives' : 'Initiatives'}</h2>
          <p className="text-sm text-neutral-500">
            {isFrench
              ? 'Programmes structurés avec un suivi détaillé par peuple.'
              : 'Structured programs with detailed per-people tracking.'}
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            to="/projects/initiatives/ESP300"
            className="group flex items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <BookOpenText size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-neutral-900">ESP 300</h3>
                <ChevronRight size={18} className="text-neutral-300 transition-colors group-hover:text-blue-500" />
              </div>
              <p className="mt-1 text-sm text-neutral-500 line-clamp-2">
                {isFrench
                  ? 'Ending Scripture Poverty Initiative — traduction audio des histoires bibliques (4 séries de passages) en langues locales.'
                  : 'Ending Scripture Poverty Initiative — audio translation of Bible stories (4 Scripture Sets) into local languages.'}
              </p>
            </div>
          </Link>

          <Link
            to="/projects/initiatives/YCS"
            className="group flex items-start gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm transition-all hover:border-blue-300 hover:shadow-md"
          >
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Headphones size={24} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold text-neutral-900">YCS</h3>
                <ChevronRight size={18} className="text-neutral-300 transition-colors group-hover:text-emerald-500" />
              </div>
              <p className="mt-1 text-sm text-neutral-500 line-clamp-2">
                {isFrench
                  ? 'Initiative YCS — suivi des peuples engagés et de leur progression (contenu enrichi ultérieurement).'
                  : 'YCS initiative — tracking of engaged peoples and their progress (content enriched later).'}
              </p>
            </div>
          </Link>
        </div>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">{isFrench ? 'Liste des projets' : 'Projects list'}</h2>
            <p className="text-sm text-neutral-500">{isFrench ? 'Initiatives actuelles et leur statut d\'exécution.' : 'Current initiatives and their execution status.'}</p>
          </div>
          {canManage && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              <Plus size={16} />
              {isFrench ? 'Nouveau projet' : 'New project'}
            </button>
          )}
        </div>

        {/* Filter toolbar: name search + status filter */}
        <div className="flex flex-col sm:flex-row gap-3 border-b border-neutral-200 px-5 py-3 bg-neutral-50/60">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={isFrench ? 'Rechercher un projet par nom...' : 'Search a project by name...'}
              className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 sm:w-48"
          >
            <option value="all">{isFrench ? 'Tous les statuts' : 'All statuses'}</option>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="animate-spin text-neutral-400" size={28} />
          </div>
        ) : projects.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <FolderKanban className="mx-auto text-neutral-300" size={48} />
            <h3 className="mt-4 text-base font-semibold text-neutral-900">{isFrench ? 'Aucun projet pour le moment' : 'No projects yet'}</h3>
            <p className="mt-1 text-sm text-neutral-500">
              {isFrench ? 'Commencez par créer votre premier projet réel.' : 'Start by creating your first real project.'}
            </p>
            {canManage && (
              <button
                onClick={openCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
              >
                <Plus size={16} />
                {isFrench ? 'Créer un projet' : 'Create a project'}
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {projects.map((project) => (
              <div key={project._id} className="p-5 hover:bg-neutral-50 transition-colors">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-base font-semibold text-neutral-900">{project.name}</h3>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[project.status] || STATUS_STYLES.Planning}`}>{project.status}</span>
                    </div>
                    {project.description && (
                      <p className="text-sm text-neutral-500 max-w-xl">{project.description}</p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-500">
                      {project.owner && <span className="inline-flex items-center gap-1.5"><Building2 size={14} /> {project.owner}</span>}
                      {(project.country || project.region) && <span className="inline-flex items-center gap-1.5"><Globe2 size={14} /> {project.country || project.region}</span>}
                      <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> {project.churches || 0} {isFrench ? 'églises' : 'churches'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-full sm:w-48">
                      <div className="mb-2 flex items-center justify-between text-xs font-medium text-neutral-500">
                        <span>{isFrench ? 'Progression' : 'Progress'}</span>
                        <span>{project.progress || 0}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
                        <div className="h-full rounded-full bg-neutral-900" style={{ width: `${project.progress || 0}%` }} />
                      </div>
                    </div>
                    {canManage && (
                      <button
                        onClick={() => openEdit(project)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-neutral-900 hover:bg-neutral-100 transition-colors"
                        title={isFrench ? 'Modifier' : 'Edit'}
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(project._id, project.name)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title={isFrench ? 'Supprimer' : 'Delete'}
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
              <h3 className="text-lg font-semibold text-neutral-900">{editingId ? (isFrench ? 'Modifier le projet' : 'Edit project') : (isFrench ? 'Nouveau projet' : 'New project')}</h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">{isFrench ? 'Nom du projet *' : 'Project name *'}</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder={isFrench ? 'Ex: Nigeria Church Planting Initiative' : 'e.g. Nigeria Church Planting Initiative'}
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{isFrench ? 'Statut' : 'Status'}</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{isFrench ? 'Responsable' : 'Owner'}</label>
                  <input
                    type="text"
                    value={form.owner}
                    onChange={(e) => setForm({ ...form, owner: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder={isFrench ? 'Ex: Regional Team' : 'e.g. Regional Team'}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{isFrench ? 'Pays' : 'Country'}</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{isFrench ? 'Région' : 'Region'}</label>
                  <input
                    type="text"
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{isFrench ? 'Progression (%)' : 'Progress (%)'}</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={form.progress}
                    onChange={(e) => setForm({ ...form, progress: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">{isFrench ? "Nombre d'églises" : 'Number of churches'}</label>
                  <input
                    type="number"
                    min="0"
                    value={form.churches}
                    onChange={(e) => setForm({ ...form, churches: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">{isFrench ? 'Description' : 'Description'}</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  {isFrench ? 'Annuler' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={15} className="animate-spin" />}
                  {editingId ? (isFrench ? 'Enregistrer' : 'Save') : (isFrench ? 'Créer' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default Projects
