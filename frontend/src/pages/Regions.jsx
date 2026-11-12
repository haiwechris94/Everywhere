import { useState } from 'react'
import { Link } from 'react-router-dom'
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

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ng-regions'],
    queryFn: async () => {
      const res = await reportingApi.getRegions()
      return Array.isArray(res?.data?.data) ? res.data.data : []
    },
  })

  const regions = data || []

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-gray-500 dark:text-slate-400">Regions</p>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-slate-100">Regions</h1>
        </div>
        {canManage && !creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {isFrench ? '＋ Créer une région' : '＋ New region'}
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
        <div className="grid gap-4 md:grid-cols-3">
          {regions.map((region) => (
            <Link
              key={region.id}
              to={`/regions/${region.id}`}
              className="relative flex flex-col items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-6 text-center shadow-sm hover:shadow-md transition-shadow"
            >
              {canManage && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    setEditRegion(region)
                  }}
                  className="absolute right-2 top-2 rounded border px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                >
                  {isFrench ? '✎ Modifier' : '✎ Edit'}
                </button>
              )}
              {/* Sigle mis en avant, nom complet juste en dessous.
                  Ex. « FCA » puis « Francophone Central Africa ». */}
              <h2 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{region.name}</h2>
              {region.fullName && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{region.fullName}</p>
              )}
            </Link>
          ))}
        </div>
      )}

      {editRegion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-w-lg w-full bg-white rounded-xl p-4 max-h-[85vh] overflow-y-auto">
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
              <div className="mt-3 border-t border-slate-200 pt-3">
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
                  className="rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"
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
