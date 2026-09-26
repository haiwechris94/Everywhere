/**
 * DataSourcesPanel — Shows import status + CSV upload button for each data source:
 * Joshua Project (API sync), IMB/PeopleGroups.org (CSV), Finishing the Task (CSV)
 */
import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { joshuaProjectApi, imbApi, fttApi } from '../../services/api'
import { useLanguage } from '../../i18n'
import { format } from 'date-fns'
import { fr, enUS } from 'date-fns/locale'
import {
  Globe,
  Upload,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Clock,
  Users,
  Loader2,
} from 'lucide-react'

// ─── Helpers ────────────────────────────────────────────────────────────────

const fmt = (dateStr, locale) => {
  if (!dateStr) return null
  try {
    return format(new Date(dateStr), 'dd MMM yyyy HH:mm', { locale })
  } catch {
    return null
  }
}

// ─── Single source card ──────────────────────────────────────────────────────

const SourceCard = ({
  color,       // tailwind color key: 'blue' | 'emerald' | 'violet'
  icon: Icon,
  title,
  subtitle,
  count,
  lastSync,
  isLoading,
  isError,
  // Action props
  actionType,  // 'sync' | 'csv'
  onSync,
  onCSV,
  isBusy,
  uploadProgress,
  feedback,    // { type: 'success'|'error', message }
  locale,
}) => {
  const colorMap = {
    blue: {
      bg: 'bg-blue-50',
      border: 'border-blue-100',
      badge: 'bg-blue-100 text-blue-700',
      btn: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
      icon: 'text-blue-500',
      bar: 'bg-blue-500',
      title: 'text-blue-700',
    },
    emerald: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-100',
      badge: 'bg-emerald-100 text-emerald-700',
      btn: 'bg-emerald-600 hover:bg-emerald-700 focus:ring-emerald-500',
      icon: 'text-emerald-500',
      bar: 'bg-emerald-500',
      title: 'text-emerald-700',
    },
    violet: {
      bg: 'bg-violet-50',
      border: 'border-violet-100',
      badge: 'bg-violet-100 text-violet-700',
      btn: 'bg-violet-600 hover:bg-violet-700 focus:ring-violet-500',
      icon: 'text-violet-500',
      bar: 'bg-violet-500',
      title: 'text-violet-700',
    },
  }
  const c = colorMap[color] || colorMap.blue
  const syncDate = fmt(lastSync, locale)

  return (
    <div
      className={`relative flex flex-col gap-4 rounded-2xl border ${c.border} ${c.bg} p-5 shadow-sm hover:shadow-md transition-shadow`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl bg-white shadow-sm`}>
            <Icon className={`w-5 h-5 ${c.icon}`} />
          </div>
          <div>
            <p className={`text-sm font-bold ${c.title} leading-tight`}>{title}</p>
            <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
          </div>
        </div>
        {isLoading ? (
          <Loader2 className="w-4 h-4 text-gray-300 animate-spin mt-1 shrink-0" />
        ) : isError ? (
          <AlertCircle className="w-4 h-4 text-red-400 mt-1 shrink-0" />
        ) : null}
      </div>

      {/* Count + last sync */}
      <div className="flex items-end justify-between">
        <div>
          <p className="text-3xl font-bold text-gray-800 leading-none">
            {isLoading ? (
              <span className="inline-block w-12 h-7 bg-gray-200 animate-pulse rounded" />
            ) : (
              (count ?? 0).toLocaleString()
            )}
          </p>
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Users className="w-3 h-3" /> groupes importés
          </p>
        </div>
        <div className="text-right">
          {syncDate ? (
            <p className="text-xs text-gray-500 flex items-center gap-1 justify-end">
              <Clock className="w-3 h-3" />
              {syncDate}
            </p>
          ) : (
            <p className="text-xs text-gray-400 italic">Jamais synchronisé</p>
          )}
        </div>
      </div>

      {/* Progress bar when uploading */}
      {isBusy && uploadProgress != null && (
        <div className="h-1.5 w-full bg-white/60 rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full ${c.bar} transition-all duration-300`}
            style={{ width: `${uploadProgress}%` }}
          />
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div
          className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 ${
            feedback.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-100'
              : 'bg-red-50 text-red-700 border border-red-100'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Action button */}
      {actionType === 'sync' ? (
        <button
          onClick={onSync}
          disabled={isBusy}
          className={`flex items-center justify-center gap-2 w-full py-2 px-4 rounded-xl text-sm font-semibold text-white ${c.btn} focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4" />
          )}
          {isBusy ? 'Synchronisation…' : 'Synchroniser'}
        </button>
      ) : (
        <button
          onClick={onCSV}
          disabled={isBusy}
          className={`flex items-center justify-center gap-2 w-full py-2 px-4 rounded-xl text-sm font-semibold text-white ${c.btn} focus:outline-none focus:ring-2 focus:ring-offset-1 transition-colors disabled:opacity-60 disabled:cursor-not-allowed`}
        >
          {isBusy ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Upload className="w-4 h-4" />
          )}
          {isBusy ? `Import en cours… ${uploadProgress != null ? uploadProgress + '%' : ''}` : 'Importer un CSV'}
        </button>
      )}
    </div>
  )
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

const DataSourcesPanel = () => {
  const { isFrench } = useLanguage()
  const locale = isFrench ? fr : enUS
  const queryClient = useQueryClient()

  // Hidden file inputs
  const imbFileRef = useRef(null)
  const fttFileRef = useRef(null)

  // Per-source busy / progress / feedback state
  const [jpBusy, setJpBusy] = useState(false)
  const [imbBusy, setImbBusy] = useState(false)
  const [fttBusy, setFttBusy] = useState(false)
  const [imbProgress, setImbProgress] = useState(null)
  const [fttProgress, setFttProgress] = useState(null)
  const [jpFeedback, setJpFeedback] = useState(null)
  const [imbFeedback, setImbFeedback] = useState(null)
  const [fttFeedback, setFttFeedback] = useState(null)

  // ── Queries ────────────────────────────────────────────────────────────────

  const {
    data: jpStatus,
    isLoading: jpLoading,
    isError: jpError,
    refetch: refetchJP,
  } = useQuery({
    queryKey: ['datasource-status-jp'],
    queryFn: async () => {
      const res = await joshuaProjectApi.getJoshuaProjectStatus()
      return res.data
    },
    staleTime: 30000,
    retry: 1,
  })

  const {
    data: imbStatus,
    isLoading: imbLoading,
    isError: imbError,
    refetch: refetchIMB,
  } = useQuery({
    queryKey: ['datasource-status-imb'],
    queryFn: async () => {
      const res = await imbApi.getStatus()
      return res.data
    },
    staleTime: 30000,
    retry: 1,
  })

  const {
    data: fttStatus,
    isLoading: fttLoading,
    isError: fttError,
    refetch: refetchFTT,
  } = useQuery({
    queryKey: ['datasource-status-ftt'],
    queryFn: async () => {
      const res = await fttApi.getStatus()
      return res.data
    },
    staleTime: 30000,
    retry: 1,
  })

  // ── Actions ────────────────────────────────────────────────────────────────

  const showFeedback = (setter, type, message) => {
    setter({ type, message })
    setTimeout(() => setter(null), 5000)
  }

  const handleJPSync = async () => {
    setJpBusy(true)
    setJpFeedback(null)
    try {
      // Sync for all known country codes stored in JP data, or use a default
      const countryCodes = jpStatus?.countries || ['CM', 'NG', 'CD', 'ET', 'IN']
      let totalImported = 0
      for (const cc of countryCodes) {
        try {
          const res = await joshuaProjectApi.syncJoshuaProjectData(cc)
          totalImported += res.data?.imported || res.data?.count || 0
        } catch {
          // continue with next country on partial failure
        }
      }
      await refetchJP()
      queryClient.invalidateQueries({ queryKey: ['peopleGroups'] })
      showFeedback(setJpFeedback, 'success', `${totalImported.toLocaleString()} groupes synchronisés.`)
    } catch (err) {
      showFeedback(setJpFeedback, 'error', err?.response?.data?.message || 'Erreur de synchronisation.')
    } finally {
      setJpBusy(false)
    }
  }

  const handleImbCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImbBusy(true)
    setImbProgress(0)
    setImbFeedback(null)
    try {
      const res = await imbApi.importCSV(file, (ev) => {
        if (ev.total) setImbProgress(Math.round((ev.loaded / ev.total) * 100))
      })
      await refetchIMB()
      queryClient.invalidateQueries({ queryKey: ['peopleGroups'] })
      const count = res.data?.imported ?? res.data?.count ?? '?'
      showFeedback(setImbFeedback, 'success', `${count} groupes importés avec succès.`)
    } catch (err) {
      showFeedback(setImbFeedback, 'error', err?.response?.data?.message || 'Erreur d\'import CSV.')
    } finally {
      setImbBusy(false)
      setImbProgress(null)
    }
  }

  const handleFttCSV = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setFttBusy(true)
    setFttProgress(0)
    setFttFeedback(null)
    try {
      const res = await fttApi.importCSV(file, (ev) => {
        if (ev.total) setFttProgress(Math.round((ev.loaded / ev.total) * 100))
      })
      await refetchFTT()
      queryClient.invalidateQueries({ queryKey: ['peopleGroups'] })
      const count = res.data?.imported ?? res.data?.count ?? '?'
      showFeedback(setFttFeedback, 'success', `${count} UUPGs importés avec succès.`)
    } catch (err) {
      showFeedback(setFttFeedback, 'error', err?.response?.data?.message || 'Erreur d\'import CSV.')
    } finally {
      setFttBusy(false)
      setFttProgress(null)
    }
  }

  // ── Extract counts & dates ─────────────────────────────────────────────────

  const jpCount   = jpStatus?.totalPeopleGroups ?? jpStatus?.count ?? jpStatus?.data?.totalPeopleGroups ?? null
  const jpDate    = jpStatus?.lastSync ?? jpStatus?.data?.lastSync ?? jpStatus?.updatedAt ?? null
  const imbCount  = imbStatus?.count ?? imbStatus?.data?.count ?? null
  const imbDate   = imbStatus?.lastSync ?? imbStatus?.data?.lastSync ?? null
  const fttCount  = fttStatus?.count ?? fttStatus?.data?.count ?? null
  const fttDate   = fttStatus?.lastSync ?? fttStatus?.data?.lastSync ?? null

  return (
    <div className="bg-white/80 backdrop-blur-md rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 p-6 relative z-10">
      {/* Panel header */}
      <div className="flex items-center gap-2 mb-5">
        <Globe className="w-5 h-5 text-primary-600" />
        <h3 className="text-lg font-semibold text-gray-800">Sources de données</h3>
        <span className="ml-auto text-xs text-gray-400">3 sources actives</span>
      </div>

      {/* Cards grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Joshua Project */}
        <SourceCard
          color="blue"
          icon={Globe}
          title="Joshua Project"
          subtitle="Synchronisation API REST"
          count={jpCount}
          lastSync={jpDate}
          isLoading={jpLoading}
          isError={jpError}
          actionType="sync"
          onSync={handleJPSync}
          isBusy={jpBusy}
          uploadProgress={null}
          feedback={jpFeedback}
          locale={locale}
        />

        {/* IMB / PeopleGroups.org */}
        <SourceCard
          color="emerald"
          icon={Upload}
          title="IMB / PeopleGroups.org"
          subtitle="Import CSV"
          count={imbCount}
          lastSync={imbDate}
          isLoading={imbLoading}
          isError={imbError}
          actionType="csv"
          onCSV={() => imbFileRef.current?.click()}
          isBusy={imbBusy}
          uploadProgress={imbProgress}
          feedback={imbFeedback}
          locale={locale}
        />

        {/* Finishing the Task */}
        <SourceCard
          color="violet"
          icon={Upload}
          title="Finishing the Task"
          subtitle="Import CSV (UUPGs)"
          count={fttCount}
          lastSync={fttDate}
          isLoading={fttLoading}
          isError={fttError}
          actionType="csv"
          onCSV={() => fttFileRef.current?.click()}
          isBusy={fttBusy}
          uploadProgress={fttProgress}
          feedback={fttFeedback}
          locale={locale}
        />
      </div>

      {/* Hidden file inputs */}
      <input
        ref={imbFileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleImbCSV}
      />
      <input
        ref={fttFileRef}
        type="file"
        accept=".csv"
        className="hidden"
        onChange={handleFttCSV}
      />
    </div>
  )
}

export default DataSourcesPanel
