import { useState } from 'react'
import { useDialog } from '../components/ui/useDialog'
import { Link } from 'react-router-dom'
import { Plus, Pencil, ChevronRight } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { reportingApi, regionAdminApi } from '../services/reportingApi'
import { StateLoading, StateError, StateEmpty } from './geography/geoComponents'
import { useLanguage } from '../i18n'
import { useAuth } from '../context/AuthContext'
import { RegionForm } from '../components/admin/RegionCountryForms'

const Regions = () => {
  const { isFrench } = useLanguage()
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const canManage = !!user && (user.role === 'admin' || user.role === 'supervisor')
  const [creating, setCreating] = useState(false)
  const [editRegion, setEditRegion] = useState(null)
  const editDialogRef = useDialog(!!editRegion, () => setEditRegion(null))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ng-regions'],
    queryFn: async () => {
      const res = await reportingApi.getRegions()
      return Array.isArray(res?.data?.data) ? res.data.data : []
    },
  })

  const regions = data || []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{isFrench ? 'Régions' : 'Regions'}</h1>
          <p className="page-subtitle">
            {isFrench
              ? 'Choisissez une région pour voir ses pays et ses peuples.'
              : 'Pick a region to see its countries and peoples.'}
          </p>
        </div>
        {canManage && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="btn-primary btn-sm whitespace-nowrap"
          >
            <Plus size={18} aria-hidden="true" />
            {isFrench ? 'Créer une région' : 'New region'}
          </button>
        )}
      </div>

      {creating && (
        <RegionForm
          mode="create"
          onCancel={() => setCreating(false)}
          onSubmit={async (body) => {
            await regionAdminApi.createRegion(body)
            await queryClient.invalidateQueries({ queryKey: ['ng-regions'] })
            setCreating(false)
          }}
          isFrench={isFrench}
        />
      )}

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des régions…' : 'Loading regions…'} />
      ) : isError ? (
        <StateError label={isFrench ? 'Impossible de charger les régions.' : 'Unable to load regions.'} />
      ) : regions.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucune région disponible.' : 'No region available.'} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {regions.map((region) => (
            <Link
              key={region.id}
              to={`/regions/${region.id}`}
              className="group relative flex min-h-[9rem] flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 text-center transition-colors hover:border-primary-500 hover:bg-primary-50/40 dark:hover:bg-slate-700"
            >
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setEditRegion(region)
                  }}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  <Pencil size={14} aria-hidden="true" />
                  {isFrench ? 'Modifier' : 'Edit'}
                </button>
              )}
              {/* Sigle mis en avant, nom complet juste en dessous.
                  Ex. « FCA » puis « Francophone Central Africa ». */}
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{region.name}</h2>
              {region.fullName && (
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{region.fullName}</p>
              )}
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-primary-700 dark:text-primary-300">
                {isFrench ? 'Ouvrir' : 'Open'}
                <ChevronRight size={16} aria-hidden="true" className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ))}
        </div>
      )}

      {editRegion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div ref={editDialogRef} className="max-w-lg w-full bg-white dark:bg-slate-800 rounded-xl p-5 max-h-[85vh] overflow-y-auto">
            <RegionForm
              mode="edit"
              initial={editRegion}
              onCancel={() => setEditRegion(null)}
              onSubmit={async (body) => {
                await regionAdminApi.updateRegion(editRegion.id, body)
                await queryClient.invalidateQueries({ queryKey: ['ng-regions'] })
                setEditRegion(null)
              }}
              isFrench={isFrench}
            />
            {editRegion.isCustom && (
              <div className="mt-3 border-t border-slate-200 pt-3 dark:border-slate-700">
                <button
                  type="button"
                  onClick={async () => {
                    const ok = window.confirm(
                      isFrench ? 'Supprimer cette région ?' : 'Delete this region?'
                    )
                    if (!ok) return
                    await regionAdminApi.deleteRegion(editRegion.id)
                    await queryClient.invalidateQueries({ queryKey: ['ng-regions'] })
                    setEditRegion(null)
                  }}
                  className="btn-danger-outline btn-sm"
                >
                  {isFrench ? 'Supprimer la région' : 'Delete region'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default Regions
