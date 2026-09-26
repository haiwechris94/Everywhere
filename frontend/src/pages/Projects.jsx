import { useState } from 'react'
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
} from 'lucide-react'
import toast from 'react-hot-toast'
import { projectsApi } from '../services/api'
import { useAuth } from '../context/AuthContext'

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
      toast.success('Projet créé')
      setShowModal(false)
      setForm(emptyForm)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erreur lors de la création'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => projectsApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-stats'] })
      toast.success('Projet mis à jour')
      setShowModal(false)
      setForm(emptyForm)
      setEditingId(null)
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erreur lors de la mise à jour'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id) => projectsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      queryClient.invalidateQueries({ queryKey: ['projects-stats'] })
      toast.success('Projet supprimé')
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Erreur lors de la suppression'),
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
      toast.error('Le nom du projet est requis')
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
    if (window.confirm(`Supprimer le projet "${name}" ?`)) {
      deleteMutation.mutate(id)
    }
  }

  const headerStats = [
    { label: 'Projects', value: stats.projects, icon: FolderKanban },
    { label: 'Countries', value: stats.countries, icon: Globe2 },
    { label: 'Teams', value: stats.teams, icon: Users2 },
    { label: 'Churches', value: stats.churches, icon: FileText },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 text-white overflow-hidden shadow-xl">
        <div className="px-6 py-8 sm:px-8 lg:px-10 flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
          <div className="max-w-2xl space-y-4">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
              <FolderKanban size={14} />
              Projects
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Projects dashboard</h1>
              <p className="text-sm sm:text-base text-slate-200 max-w-xl">
                Track church planting initiatives, ownership, progress, and regional coverage from one central view.
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

      <section className="rounded-2xl border border-neutral-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">Projects list</h2>
            <p className="text-sm text-neutral-500">Current initiatives and their execution status.</p>
          </div>
          {canManage && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
            >
              <Plus size={16} />
              New project
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
              placeholder="Rechercher un projet par nom..."
              className="w-full rounded-lg border border-neutral-300 pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900 sm:w-48"
          >
            <option value="all">Tous les statuts</option>
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
            <h3 className="mt-4 text-base font-semibold text-neutral-900">Aucun projet pour le moment</h3>
            <p className="mt-1 text-sm text-neutral-500">
              Commencez par créer votre premier projet réel.
            </p>
            {canManage && (
              <button
                onClick={openCreate}
                className="mt-5 inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
              >
                <Plus size={16} />
                Créer un projet
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
                      <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} /> {project.churches || 0} churches</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-full sm:w-48">
                      <div className="mb-2 flex items-center justify-between text-xs font-medium text-neutral-500">
                        <span>Progress</span>
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
                        title="Modifier"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(project._id, project.name)}
                        className="p-2 rounded-lg text-neutral-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Supprimer"
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
              <h3 className="text-lg font-semibold text-neutral-900">{editingId ? 'Modifier le projet' : 'Nouveau projet'}</h3>
              <button onClick={closeModal} className="p-1.5 rounded-lg hover:bg-neutral-100 text-neutral-500">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Nom du projet *</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  placeholder="Ex: Nigeria Church Planting Initiative"
                  autoFocus
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Statut</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  >
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Responsable</label>
                  <input
                    type="text"
                    value={form.owner}
                    onChange={(e) => setForm({ ...form, owner: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                    placeholder="Ex: Regional Team"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Pays</label>
                  <input
                    type="text"
                    value={form.country}
                    onChange={(e) => setForm({ ...form, country: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Région</label>
                  <input
                    type="text"
                    value={form.region}
                    onChange={(e) => setForm({ ...form, region: e.target.value })}
                    className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Progression (%)</label>
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
                  <label className="block text-sm font-medium text-neutral-700 mb-1">Nombre d'églises</label>
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
                <label className="block text-sm font-medium text-neutral-700 mb-1">Description</label>
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
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="inline-flex items-center gap-2 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
                >
                  {(createMutation.isPending || updateMutation.isPending) && <Loader2 size={15} className="animate-spin" />}
                  {editingId ? 'Enregistrer' : 'Créer'}
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
