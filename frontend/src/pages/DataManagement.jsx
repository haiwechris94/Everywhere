import { useState, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api, { peopleGroupsApi } from '../services/api'
import { useLanguage } from '../i18n'
import {
  Upload,
  Download,
  FileSpreadsheet,
  FileText,
  AlertCircle,
  CheckCircle,
  Loader2,
  Users,
  Info,
  X,
  Globe,
  File,
  Table,
  FileType,
  Printer,
  FolderOpen,
  Calendar,
  TrendingUp,
  BarChart2,
  Church,
  BookOpen,
  Zap,
  RefreshCw,
  Clock,
  Play,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import toast from 'react-hot-toast'

// Country templates configuration for download
const COUNTRY_TEMPLATES = [
  { key: 'cameroun', name: 'Cameroun', code: 'CM', flag: '🇨🇲' },
  { key: 'congo-brazzaville', name: 'Congo Brazzaville', code: 'CG', flag: '🇨🇬' },
  { key: 'congo-rdc', name: 'Congo RDC', code: 'CD', flag: '🇨🇩' },
  { key: 'centrafrique', name: 'République Centrafricaine', code: 'CF', flag: '🇨🇫' },
  { key: 'tchad', name: 'Tchad', code: 'TD', flag: '🇹🇩' },
  { key: 'gabon', name: 'Gabon', code: 'GA', flag: '🇬🇦' },
  { key: 'guinee-equatoriale', name: 'Guinée Équatoriale', code: 'GQ', flag: '🇬🇶' },
]

// Selectable export columns (field -> French label). Used by the export tab so
// the user can pick a country and exactly which metrics to export.
const EXPORT_METRIC_FIELDS = [
  { key: 'name', label: 'Peuple / Nom' },
  { key: 'villageName', label: 'Village' },
  { key: 'country', label: 'Pays' },
  { key: 'region', label: 'Région' },
  { key: 'reportPeriod', label: 'Période' },
  { key: 'engagementStatus', label: 'Statut' },
  { key: 'numberOfChurches', label: 'Églises (TOTAL)' },
  { key: 'churchGeneration', label: 'Génération (Max GEN)' },
  { key: 'avgChurchSize', label: 'Taille moyenne église' },
  { key: 'dbs', label: 'DBS' },
  { key: 'com', label: 'COM' },
  { key: 'cat', label: 'CAT' },
  { key: 'newDisciples', label: 'Nouveaux disciples' },
  { key: 'newBaptisms', label: 'Nouveaux baptisés' },
  { key: 'leadersInTraining', label: 'Leaders en formation' },
  { key: 'activeCoaches', label: 'Coachs actifs' },
  { key: 'trainingsHeld', label: 'Formations tenues' },
  { key: 'lostChurches', label: 'Églises perdues' },
  { key: 'mergedChurches', label: 'Églises fusionnées' },
]

// Export format configurations
const EXPORT_FORMATS = [
  {
    id: 'csv',
    name: 'CSV',
    description: 'Format universel compatible avec tous les tableurs',
    icon: FileText,
    color: 'from-green-500 to-emerald-600',
    bgColor: 'bg-green-50',
    textColor: 'text-green-700',
    borderColor: 'border-green-200',
  },
  {
    id: 'excel',
    name: 'Excel',
    description: 'Format Microsoft Excel avec mise en forme',
    icon: FileSpreadsheet,
    color: 'from-blue-500 to-indigo-600',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-700',
    borderColor: 'border-blue-200',
  },
  {
    id: 'pdf',
    name: 'PDF',
    description: 'Document imprimable avec mise en page professionnelle',
    icon: Printer,
    color: 'from-red-500 to-rose-600',
    bgColor: 'bg-red-50',
    textColor: 'text-red-700',
    borderColor: 'border-red-200',
  },
]

const DataManagement = () => {
  const { t, isFrench } = useLanguage()
  const queryClient = useQueryClient()
  const fileInputRef = useRef(null)
  const [activeTab, setActiveTab] = useState('import')
  const [importFile, setImportFile] = useState(null)
  const [importPreview, setImportPreview] = useState(null)
  const [importError, setImportError] = useState(null)
  const [importReport, setImportReport] = useState(null) // backend { summary, errors, skipped }
  // Export filters
  const [exportCountry, setExportCountry] = useState('all')
  const [exportMetrics, setExportMetrics] = useState(() => new Set(['name', 'country', 'numberOfChurches', 'churchGeneration']))
  const [isProcessing, setIsProcessing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  // ── JP Live Sync state ───────────────────────────────────────────────────
  const [jpSelectedCountry, setJpSelectedCountry] = useState('')
  const [jpIsDryRun, setJpIsDryRun] = useState(false)
  const [jpShowStats, setJpShowStats] = useState(false)

  const JP_COUNTRIES = [
    { code: 'CM', name: 'Cameroun' },
    { code: 'GA', name: 'Gabon' },
    { code: 'TD', name: 'Tchad' },
    { code: 'CG', name: 'Congo Brazzaville' },
    { code: 'CF', name: 'Centrafrique' },
    { code: 'GQ', name: 'Guinée Équatoriale' },
    { code: 'CD', name: 'RD Congo' },
    { code: 'RW', name: 'Rwanda' },
    { code: 'NG', name: 'Nigeria' },
    { code: 'ET', name: 'Éthiopie' },
    { code: 'KE', name: 'Kenya' },
    { code: 'SN', name: 'Sénégal' },
  ]

  const { data: jpStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['jp-sync-status'],
    queryFn: () => api.get('/api/jp-sync/status').then(r => r.data),
    enabled: activeTab === 'jp-sync',
    refetchInterval: (data) => data?.isRunning ? 5000 : 30000,
  })

  const { data: jpStats } = useQuery({
    queryKey: ['jp-sync-stats'],
    queryFn: () => api.get('/api/jp-sync/stats').then(r => r.data),
    enabled: activeTab === 'jp-sync' && jpShowStats,
  })

  const triggerGlobalSync = async () => {
    try {
      const res = await api.post('/api/jp-sync/trigger', { dryRun: jpIsDryRun })
      if (res.data.alreadyRunning) {
        toast(isFrench ? '⏳ Sync déjà en cours...' : '⏳ Sync already running...', { icon: '🔄' })
      } else {
        toast.success(isFrench ? '🚀 Synchronisation JP démarrée !' : '🚀 JP sync started!')
        refetchStatus()
      }
    } catch (err) {
      toast.error(`❌ ${err?.response?.data?.message || err.message}`)
    }
  }

  const triggerCountrySync = async () => {
    if (!jpSelectedCountry) return
    try {
      const res = await api.post('/api/jp-sync/trigger-country', {
        countryCode: jpSelectedCountry,
        dryRun: jpIsDryRun,
      })
      toast.success(`✅ Sync ${JP_COUNTRIES.find(c => c.code === jpSelectedCountry)?.name || jpSelectedCountry} démarrée !`)
      refetchStatus()
    } catch (err) {
      toast.error(`❌ ${err?.response?.data?.message || err.message}`)
    }
  }

  const STATUS_LABELS_JP = {
    unreached: { label: 'Non-atteint', color: 'text-red-600', bg: 'bg-red-50' },
    pioneer: { label: 'Pionnier', color: 'text-orange-600', bg: 'bg-orange-50' },
    midway: { label: 'Mi-parcours', color: 'text-yellow-600', bg: 'bg-yellow-50' },
    'tipping-point': { label: 'Basculement', color: 'text-green-600', bg: 'bg-green-50' },
    dmm: { label: 'Mouvement', color: 'text-emerald-700', bg: 'bg-emerald-50' },
  }

  // Fetch peoples data for export
  const { data: peoplesData, isLoading: isLoadingPeoples } = useQuery({
    queryKey: ['peopleGroups', 'dataManagement'],
    queryFn: async () => {
      console.log('[DataManagement] Fetching people groups WITHOUT geometry for export...')
      const response = await peopleGroupsApi.getAll()
      return response.data.data || response.data || []
    },
  })

  // Authoritative total from the backend (the fetched array may be paginated/capped).
  const { data: peoplesTotal } = useQuery({
    queryKey: ['peopleGroups', 'dataManagement', 'count'],
    queryFn: async () => {
      const res = await api.get('/api/people-groups', { params: { limit: 1, page: 1 } })
      const meta = res.data?.meta || res.data?.pagination || {}
      return meta.totalCount ?? meta.total ?? res.data?.total ?? null
    },
  })
  // Real number of peoples to display everywhere on this page.
  const peoplesCount = (peoplesTotal ?? (Array.isArray(peoplesData) ? peoplesData.length : 0))

  // Handle drag events
  const handleDragEnter = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
  }, [])

  const handleDrop = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    
    const files = e.dataTransfer.files
    if (files && files.length > 0) {
      handleFileProcess(files[0])
    }
  }, [])

  // Handle file selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0]
    if (file) {
      handleFileProcess(file)
    }
  }

  const handleFileProcess = (file) => {
    setImportError(null)
    setImportFile(file)

    // Parse CSV/Excel preview
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const text = event.target.result
        const lines = text.split('\n').filter(line => line.trim())
        // Auto-detect separator (semicolon vs comma) based on header line
        const separator = (lines[0].match(/;/g) || []).length >= (lines[0].match(/,/g) || []).length ? ';' : ','
        const headers = lines[0].split(separator).map(h => h.trim().replace(/"/g, ''))
        
        // Preview first 5 rows
        const previewData = lines.slice(1, 6).map(line => {
          const values = line.split(separator).map(v => v.trim().replace(/"/g, ''))
          const row = {}
          headers.forEach((header, i) => {
            row[header] = values[i] || ''
          })
          return row
        })

        setImportPreview({
          headers,
          data: previewData,
          totalRows: lines.length - 1,
        })
      } catch (err) {
        setImportError(t('dataManagement.import.parseError') || 'Error parsing file')
      }
    }
    reader.readAsText(file)
  }

  // Import mutation
  const importMutation = useMutation({
    // Send the raw file to the backend bulk-import route. The backend handles
    // delimiter detection, French decimals, optional coordinates, full metric
    // mapping and returns a detailed per-row/per-column error report.
    mutationFn: async (file) => {
      const fd = new FormData()
      fd.append('file', file)
      const { data } = await api.post('/api/import/people-groups', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      return data // { success, message, summary, imported, skipped, errors }
    },
    onSuccess: (results) => {
      // Rafraîchir la liste des peuples ET tous les widgets du tableau de bord
      // (les imports trimestriels modifient KPI, statuts DMM, couverture et analytics).
      queryClient.invalidateQueries(['peopleGroups'])
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardKPI'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardStatusDistribution'] })
      queryClient.invalidateQueries({ queryKey: ['dashboardCoverage'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-ai-summary'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-monthly-activity'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-weekly-activity'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-metric'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-dmm-growth'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-top-regions'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-people-groups'] })
      queryClient.invalidateQueries({ queryKey: ['analytics-pg-timeline'] })

      // Lightweight verification: ensure reporting-focused people queries refresh after import.
      queryClient.invalidateQueries({ queryKey: ['peopleGroups', 'reporting'] })
      queryClient.invalidateQueries({ queryKey: ['peopleGroups', 'detail'] })

      const summary = results?.summary || {}
      const imported = summary.imported ?? results?.imported?.length ?? 0
      const skipped = summary.skipped ?? results?.skipped?.length ?? 0
      const errors = results?.errors || []

      // Keep the detailed report on screen so the user can fix the flagged cells.
      setImportReport(results)

      toast.success(
        `${t('dataManagement.import.success') || 'Import terminé'}: ${imported} ${t('dataManagement.import.successCount') || 'lignes importées'}`
      )
      if (errors.length > 0 || skipped > 0) {
        toast.error(`${errors.length || skipped} ${t('dataManagement.import.failedCount') || 'ligne(s) en erreur'}`)
        console.warn('[DataManagement] Import errors:', errors)
      }
      console.log('[DataManagement] Reporting visibility refresh triggered after import', {
        imported,
        skipped,
        errors: errors.length,
      })
      // Clear the file/preview but KEEP importReport visible.
      setImportFile(null)
      setImportPreview(null)
      setImportError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    },
    onError: (error) => {
      const msg = error?.response?.data?.message || error?.message || t('dataManagement.import.error') || "Échec de l'import"
      toast.error(msg)
    },
  })

  // Process import — send the raw file to the backend bulk-import route.
  const handleImport = async () => {
    if (!importFile) return
    setIsProcessing(true)
    setImportReport(null)
    try {
      await importMutation.mutateAsync(importFile)
    } catch (err) {
      // onError already toasts; nothing else to do here
    } finally {
      setIsProcessing(false)
    }
  }


  // Reset import state
  const resetImport = () => {
    setImportFile(null)
    setImportPreview(null)
    setImportError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // ── Export helpers: filter by country + only the selected metric columns ──
  const getExportRows = () => {
    const all = Array.isArray(peoplesData) ? peoplesData : []
    if (exportCountry === 'all') return all
    const want = exportCountry.toLowerCase()
    return all.filter(p => {
      const c = (p.country || '').toLowerCase()
      // Accept FR/EN variants (Cameroun/Cameroon, etc.)
      return c === want || (want === 'cameroun' && c === 'cameroon') || (want === 'cameroon' && c === 'cameroun')
    })
  }
  // Selected fields in their canonical order; always keep at least the name.
  const getSelectedFields = () => {
    const chosen = EXPORT_METRIC_FIELDS.filter(f => exportMetrics.has(f.key))
    return chosen.length ? chosen : EXPORT_METRIC_FIELDS.filter(f => f.key === 'name')
  }
  const cellValue = (p, key) => {
    if (key === 'country') return p.country || ''
    if (key === 'name') return p.name || ''
    if (key === 'villageName') return p.villageName || ''
    if (key === 'region') return p.region || ''
    if (key === 'reportPeriod') return p.reportPeriod || ''
    if (key === 'engagementStatus') return p.engagementStatus || ''
    const v = p[key]
    return v === undefined || v === null ? '' : v
  }

  // Export to CSV (respects the country filter + selected metric columns)
  const exportToCSV = () => {
    const rows = getExportRows()
    if (rows.length === 0) {
      toast.error(t('dataManagement.export.noData') || 'Aucune donnée à exporter')
      return
    }
    const fields = getSelectedFields()
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`
    const csvContent = [
      fields.map(f => esc(f.label)).join(','),
      ...rows.map(p => fields.map(f => esc(cellValue(p, f.key))).join(',')),
    ].join('\n')
    downloadFile('\uFEFF' + csvContent, 'peoples_export.csv', 'text/csv')
    toast.success(t('dataManagement.export.success') || 'Export terminé')
  }

  // Export to Excel (';'-delimited, respects country filter + selected metrics)
  const exportToExcel = () => {
    const rows = getExportRows()
    if (rows.length === 0) {
      toast.error(t('dataManagement.export.noData') || 'Aucune donnée à exporter')
      return
    }
    const fields = getSelectedFields()
    const esc = (v) => `"${String(v).replace(/"/g, '""')}"`
    const csvContent = '\uFEFF' + [
      fields.map(f => esc(f.label)).join(';'),
      ...rows.map(p => fields.map(f => esc(cellValue(p, f.key))).join(';')),
    ].join('\n')
    downloadFile(csvContent, 'peoples_export.xls', 'application/vnd.ms-excel')
    toast.success(t('dataManagement.export.success') || 'Export terminé')
  }

  // Export to PDF
  const exportToPDF = () => {
    if (!peoplesData || peoplesData.length === 0) {
      toast.error(t('dataManagement.export.noData') || 'No data to export')
      return
    }

    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Peoples Data Export</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          h1 { color: #4f46e5; border-bottom: 3px solid #4f46e5; padding-bottom: 10px; }
          .meta { color: #666; margin-bottom: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #ddd; padding: 10px; text-align: left; font-size: 12px; }
          th { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; }
          tr:nth-child(even) { background-color: #f9fafb; }
          tr:hover { background-color: #f3f4f6; }
          .status-pioneer { color: #f97316; font-weight: bold; }
          .status-midway { color: #eab308; font-weight: bold; }
          .status-tipping-point { color: #22c55e; font-weight: bold; }
          .status-dmm { color: #15803d; font-weight: bold; }
          .status-unreached { color: #ef4444; font-weight: bold; }
          .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 10px; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <h1>🌍 EVERYWHERE - Rapport des Peuples</h1>
        <div class="meta">
          <p><strong>Date de génération:</strong> ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          <p><strong>Total des enregistrements:</strong> ${peoplesData.length}</p>
        </div>
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Village</th>
              <th>Statut</th>
              <th>Niveau</th>
              <th>Églises</th>
              <th>Région</th>
            </tr>
          </thead>
          <tbody>
            ${peoplesData.map(p => `
              <tr>
                <td>${p.name || '-'}</td>
                <td>${p.villageName || '-'}</td>
                <td class="status-${p.engagementStatus}">${p.engagementStatus || '-'}</td>
                <td>${p.engagementLevel || '-'}</td>
                <td>${p.numberOfChurches || 0}</td>
                <td>${p.region || '-'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
        <div class="footer">
          <p>EVERYWHERE Church Planting Map Application</p>
          <p>Document généré automatiquement - Ne pas modifier</p>
        </div>
      </body>
      </html>
    `

    const printWindow = window.open('', '_blank')
    printWindow.document.write(printContent)
    printWindow.document.close()
    printWindow.print()
    
    toast.success(t('dataManagement.export.pdfReady') || 'PDF ready for printing')
  }

  // Helper function to download file
  const downloadFile = (content, filename, mimeType) => {
    const blob = new Blob([content], { type: mimeType })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  // Télécharge un CSV PRÉ-REMPLI avec les engagements DMM déjà présents dans
  // l'appli, au format exact du modèle d'import people-groups, afin de pouvoir
  // ajuster puis ré-importer facilement via le même flux d'import.
  const handleExport = (formatId) => {
    switch (formatId) {
      case 'csv':
        exportToCSV()
        break
      case 'excel':
        exportToExcel()
        break
      case 'pdf':
        exportToPDF()
        break
      default:
        break
    }
  }

  return (
    <div className="max-w-6xl mx-auto animate-fade-in space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-700 rounded-2xl p-8 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold mb-2">
              {t('dataManagement.title') || 'Gestion des données'}
            </h1>
            <p className="text-indigo-100 text-lg">
              {t('dataManagement.subtitle') || 'Importez et exportez vos données de peuples'}
            </p>
          </div>
          <div className="flex items-center gap-3 bg-white/15 backdrop-blur-sm px-4 py-3 rounded-xl">
            <Users size={24} />
            <div>
              <p className="text-sm text-indigo-100">Total des peuples</p>
              <p className="text-2xl font-bold">{peoplesCount}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="border-b border-gray-100">
          <div className="flex">
            <button
              onClick={() => setActiveTab('import')}
              className={`flex-1 px-6 py-4 text-sm font-semibold flex items-center justify-center gap-3 transition-all ${
                activeTab === 'import'
                  ? 'text-indigo-600 border-b-3 border-indigo-600 bg-indigo-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Upload size={20} />
              {t('dataManagement.tabs.import') || 'Importer des données'}
            </button>
            <button
              onClick={() => setActiveTab('export')}
              className={`flex-1 px-6 py-4 text-sm font-semibold flex items-center justify-center gap-3 transition-all ${
                activeTab === 'export'
                  ? 'text-indigo-600 border-b-3 border-indigo-600 bg-indigo-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Download size={20} />
              {t('dataManagement.tabs.export') || 'Exporter des données'}
            </button>
            <button
              onClick={() => setActiveTab('jp-sync')}
              className={`flex-1 px-6 py-4 text-sm font-semibold flex items-center justify-center gap-3 transition-all ${
                activeTab === 'jp-sync'
                  ? 'text-indigo-600 border-b-3 border-indigo-600 bg-indigo-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Globe size={20} />
              JP Live Sync
              {jpStatus?.isRunning && (
                <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                  <Loader2 size={10} className="animate-spin" /> En cours
                </span>
              )}
            </button>
          </div>
        </div>

        <div className="p-6">
          {/* Import Tab */}
          {activeTab === 'import' && (
            <div className="space-y-6">
              {/* Country Templates Section */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-200">
                <div className="flex items-start gap-4 mb-6">
                  <div className="w-14 h-14 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Globe className="text-white" size={28} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 mb-1">
                      {t('dataManagement.import.downloadTemplate') || 'Télécharger un modèle CSV'}
                    </h3>
                    <p className="text-gray-600">
                      {t('dataManagement.import.templateDescription') || 'Sélectionnez votre pays pour télécharger un modèle CSV pré-formaté'}
                    </p>
                  </div>
                </div>
                
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {COUNTRY_TEMPLATES.map((country) => (
                    <a
                      key={country.key}
                      href={`${import.meta.env.VITE_API_URL || 'http://localhost:5000'}/api/import/people-groups/template/${country.key}`}
                      className="group flex items-center gap-3 px-4 py-3 bg-white rounded-xl border-2 border-blue-100 hover:border-indigo-400 hover:shadow-md transition-all"
                      download
                    >
                      <span className="text-2xl">{country.flag}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 group-hover:text-indigo-600 truncate transition-colors">
                          {country.name}
                        </p>
                      </div>
                      <Download size={16} className="text-gray-400 group-hover:text-indigo-500 transition-colors" />
                    </a>
                  ))}
                </div>

              </div>

              {/* Drag & Drop Upload Zone */}
              <div
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                className={`relative border-3 border-dashed rounded-2xl p-12 text-center transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50 scale-[1.02]'
                    : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload"
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <div className={`w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center transition-all ${
                    isDragging ? 'bg-indigo-500 scale-110' : 'bg-gray-100'
                  }`}>
                    <Upload size={40} className={isDragging ? 'text-white' : 'text-gray-400'} />
                  </div>
                  <p className="text-xl font-semibold text-gray-700 mb-2">
                    {isDragging 
                      ? 'Déposez le fichier ici...'
                      : t('dataManagement.import.dropzone') || 'Cliquez ou glissez-déposez votre fichier'}
                  </p>
                  <p className="text-gray-500">
                    Formats acceptés: <span className="font-medium">CSV, XLS, XLSX</span> (max 10MB)
                  </p>
                </label>
                
                {/* File type indicators */}
                <div className="flex justify-center gap-4 mt-6">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 rounded-full">
                    <FileText size={16} className="text-green-600" />
                    <span className="text-sm font-medium text-green-700">CSV</span>
                  </div>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-100 rounded-full">
                    <FileSpreadsheet size={16} className="text-blue-600" />
                    <span className="text-sm font-medium text-blue-700">Excel</span>
                  </div>
                </div>
              </div>

              {/* Import Error */}
              {importError && (
                <div className="bg-red-50 border-2 border-red-200 rounded-xl p-4 flex items-center gap-4 animate-fade-in">
                  <div className="p-2 bg-red-100 rounded-lg">
                    <AlertCircle className="text-red-500" size={24} />
                  </div>
                  <span className="flex-1 text-red-700 font-medium">{importError}</span>
                  <button onClick={resetImport} className="p-2 hover:bg-red-100 rounded-lg transition-colors">
                    <X size={20} className="text-red-500" />
                  </button>
                </div>
              )}

              {/* Preview */}
              {importPreview && (
                <div className="space-y-4 animate-fade-in">
                  <div className="flex items-center justify-between p-4 bg-green-50 border-2 border-green-200 rounded-xl">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-green-100 rounded-xl">
                        <CheckCircle className="text-green-600" size={24} />
                      </div>
                      <div>
                        <p className="font-semibold text-gray-800">{importFile?.name}</p>
                        <p className="text-sm text-gray-600">
                          {importPreview.totalRows} {t('dataManagement.import.rows') || 'lignes'} détectées
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={resetImport}
                      className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                    >
                      <X size={20} className="text-gray-500" />
                    </button>
                  </div>

                  {/* Preview Table */}
                  <div className="bg-white border-2 border-gray-200 rounded-xl overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex items-center gap-2">
                      <Table size={18} className="text-gray-500" />
                      <span className="font-semibold text-gray-700">Aperçu des données</span>
                      <span className="text-sm text-gray-500">(5 premières lignes)</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-full">
                        <thead className="bg-gray-100">
                          <tr>
                            {importPreview.headers.map((header, i) => (
                              <th key={i} className="px-4 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {importPreview.data.map((row, i) => (
                            <tr key={i} className="hover:bg-gray-50 transition-colors">
                              {importPreview.headers.map((header, j) => (
                                <td key={j} className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">
                                  {row[header] || '-'}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Import Button */}
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={resetImport}
                      className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors font-medium"
                    >
                      Annuler
                    </button>
                    <button
                      onClick={handleImport}
                      disabled={isProcessing}
                      className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl hover:from-indigo-700 hover:to-purple-700 transition-all font-semibold shadow-lg disabled:opacity-50 flex items-center gap-2"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 size={20} className="animate-spin" />
                          Importation en cours...
                        </>
                      ) : (
                        <>
                          <Upload size={20} />
                          Importer {importPreview.totalRows} lignes
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Rapport d'import : lignes/colonnes en erreur */}
              {importReport && (
                <div className="mt-6 space-y-4">
                  {(importReport.summary?.imported ?? 0) > 0 && (
                    <div className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-green-800">
                      <CheckCircle size={18} />
                      <span className="font-medium">
                        {importReport.summary.imported} ligne(s) importée(s)
                        {(importReport.summary?.skipped ?? 0) > 0 ? ` · ${importReport.summary.skipped} ignorée(s)` : ''}
                      </span>
                    </div>
                  )}
                  {Array.isArray(importReport.errors) && importReport.errors.length > 0 && (
                    <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                      <div className="mb-3 flex items-center gap-2 text-red-800">
                        <AlertCircle size={18} />
                        <span className="font-semibold">
                          Lignes en erreur — corrigez ces cases puis ré-importez ({importReport.errors.length})
                        </span>
                      </div>
                      <div className="max-h-80 overflow-auto rounded-lg border border-red-100 bg-white">
                        <table className="min-w-full text-sm">
                          <thead className="bg-red-100/60 text-red-900">
                            <tr>
                              <th className="px-3 py-2 text-left font-semibold">Ligne</th>
                              <th className="px-3 py-2 text-left font-semibold">Colonne</th>
                              <th className="px-3 py-2 text-left font-semibold">Valeur</th>
                              <th className="px-3 py-2 text-left font-semibold">Problème</th>
                              <th className="px-3 py-2 text-left font-semibold">Correction</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-red-100">
                            {importReport.errors.map((er, i) => (
                              <tr key={i} className="align-top">
                                <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-800">{er.row ?? er.line ?? '-'}</td>
                                <td className="px-3 py-2 whitespace-nowrap text-gray-700">{er.column || er.field || '-'}</td>
                                <td className="px-3 py-2 text-gray-600">{er.value === '' || er.value === undefined ? '—' : String(er.value)}</td>
                                <td className="px-3 py-2 text-red-700">{er.error || er.reason || '-'}</td>
                                <td className="px-3 py-2 text-gray-600">{er.suggestion || ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <button
                        type="button"
                        onClick={() => setImportReport(null)}
                        className="mt-3 text-sm font-medium text-red-700 hover:underline"
                      >
                        Masquer le rapport
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Export Tab */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              {/* Filtres d'export : pays + métriques à exporter */}
              <div className="rounded-2xl border border-indigo-100 bg-indigo-50/50 p-5">
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Globe size={20} className="text-indigo-600" />
                  Filtres d'export
                </h3>
                <div className="mb-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-1">Pays</label>
                  <select
                    value={exportCountry}
                    onChange={(e) => setExportCountry(e.target.value)}
                    className="w-full sm:w-72 rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="all">Tous les pays</option>
                    {[...new Set((peoplesData || []).map(p => p.country).filter(Boolean))].sort().map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-700 mb-2">Métriques à exporter</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {EXPORT_METRIC_FIELDS.map(f => (
                      <label key={f.key} className="flex items-center gap-2 text-sm text-gray-700 bg-white rounded-lg border border-gray-200 px-3 py-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={exportMetrics.has(f.key)}
                          onChange={() => setExportMetrics(prev => {
                            const next = new Set(prev)
                            if (next.has(f.key)) next.delete(f.key); else next.add(f.key)
                            return next
                          })}
                        />
                        {f.label}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {exportCountry === 'all' ? 'Tous les pays' : exportCountry} · {getExportRows().length} ligne(s) · {getSelectedFields().length} colonne(s)
                  </p>
                </div>
              </div>

              {/* Export Format Cards */}
              <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <FileType size={20} className="text-indigo-600" />
                  Choisissez un format d'export
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {EXPORT_FORMATS.map((format) => {
                    const Icon = format.icon
                    return (
                      <button
                        key={format.id}
                        onClick={() => handleExport(format.id)}
                        disabled={isLoadingPeoples || !peoplesData?.length}
                        className={`group relative p-6 rounded-2xl border-2 ${format.borderColor} ${format.bgColor} hover:shadow-lg transition-all text-left disabled:opacity-50 disabled:cursor-not-allowed`}
                      >
                        <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${format.color} flex items-center justify-center mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                          <Icon size={28} className="text-white" />
                        </div>
                        <h4 className={`text-xl font-bold ${format.textColor} mb-2`}>{format.name}</h4>
                        <p className="text-gray-600 text-sm">{format.description}</p>
                        <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Download size={20} className={format.textColor} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Data Summary */}
              {peoplesData && peoplesData.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                    <Info size={18} className="text-gray-500" />
                    Résumé des données à exporter
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                      <p className="text-sm text-gray-500">Total des peuples</p>
                      <p className="text-2xl font-bold text-gray-900">{peoplesData.length}</p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                      <p className="text-sm text-gray-500">Avec coordonnées</p>
                      <p className="text-2xl font-bold text-green-600">
                        {peoplesData.filter(p => p.location?.coordinates).length}
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                      <p className="text-sm text-gray-500">Pays uniques</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {new Set(peoplesData.map(p => p.country).filter(Boolean)).size}
                      </p>
                    </div>
                    <div className="bg-white p-4 rounded-xl border border-gray-200">
                      <p className="text-sm text-gray-500">Régions uniques</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {new Set(peoplesData.map(p => p.region).filter(Boolean)).size}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* No Data Message */}
              {(!peoplesData || peoplesData.length === 0) && !isLoadingPeoples && (
                <div className="text-center py-12 bg-gray-50 rounded-xl">
                  <div className="w-20 h-20 bg-gray-200 rounded-full flex items-center justify-center mx-auto mb-4">
                    <FolderOpen size={40} className="text-gray-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">Aucune donnée à exporter</h3>
                  <p className="text-gray-500">Commencez par importer des données ou créer des peuples</p>
                </div>
              )}
            </div>
          )}
          {/* ── JP Live Sync Tab ── */}
          {activeTab === 'jp-sync' && (
            <div className="space-y-6">

              {/* Header */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-2xl p-6 border border-indigo-200">
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-lg">
                    <Globe className="text-white" size={28} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="text-xl font-bold text-gray-900">Joshua Project — Sync Live</h3>
                      {jpStatus?.isRunning && (
                        <span className="flex items-center gap-1 bg-blue-100 text-blue-700 text-xs font-bold px-2.5 py-1 rounded-full border border-blue-200 animate-pulse">
                          <Loader2 size={11} className="animate-spin" /> En cours...
                        </span>
                      )}
                    </div>
                    <p className="text-gray-600 text-sm">
                      Synchronise automatiquement les données de tous les peuples non-atteints du monde
                      depuis l'API Joshua Project. Mise à jour hebdomadaire + déclenchement manuel.
                    </p>
                  </div>
                </div>
                {/* Infos CRON */}
                <div className="mt-4 flex flex-wrap gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} />
                    Dernière sync : {jpStatus?.lastSync
                      ? new Date(jpStatus.lastSync).toLocaleString('fr-FR')
                      : 'Jamais'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Clock size={12} />
                    Prochaine : {jpStatus?.nextSync
                      ? new Date(jpStatus.nextSync).toLocaleString('fr-FR')
                      : 'Non planifiée'}
                  </span>
                  <span className={`flex items-center gap-1.5 font-semibold ${jpStatus?.cronEnabled ? 'text-green-600' : 'text-red-500'}`}>
                    {jpStatus?.cronEnabled ? <CheckCircle size={12} /> : <AlertCircle size={12} />}
                    CRON {jpStatus?.cronEnabled ? 'actif (hebdo)' : 'désactivé'}
                  </span>
                </div>
              </div>

              {/* Progression en temps réel */}
              {jpStatus?.isRunning && jpStatus?.progress && (
                <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5">
                  <h4 className="font-bold text-blue-800 mb-4 flex items-center gap-2">
                    <Loader2 size={18} className="animate-spin text-blue-600" />
                    Synchronisation en cours...
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                      { label: 'Récupérés', value: jpStatus.progress.totalFetched, color: 'text-blue-700' },
                      { label: '✅ Créés', value: jpStatus.progress.created, color: 'text-green-700' },
                      { label: '🔄 Mis à jour', value: jpStatus.progress.updated, color: 'text-purple-700' },
                      { label: '❌ Erreurs', value: jpStatus.progress.errors, color: 'text-red-600' },
                    ].map((s, i) => (
                      <div key={i} className="bg-white rounded-xl p-3 text-center border border-blue-100">
                        <p className={`text-2xl font-bold ${s.color}`}>{s.value || 0}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Option Dry Run */}
              <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <input
                  type="checkbox"
                  id="jp-dryrun"
                  checked={jpIsDryRun}
                  onChange={e => setJpIsDryRun(e.target.checked)}
                  className="w-4 h-4 rounded accent-amber-600"
                />
                <label htmlFor="jp-dryrun" className="text-sm text-amber-800 font-medium cursor-pointer">
                  Mode test (dry run) — analyse sans sauvegarder dans la base de données
                </label>
              </div>

              {/* Actions */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Sync mondiale */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-indigo-300 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
                      <Globe size={20} className="text-indigo-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800">Sync mondiale</h4>
                      <p className="text-xs text-gray-500">Tous les pays — 10 à 30 min</p>
                    </div>
                  </div>
                  <button
                    onClick={triggerGlobalSync}
                    disabled={jpStatus?.isRunning}
                    className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {jpStatus?.isRunning
                      ? <><Loader2 size={18} className="animate-spin" /> En cours...</>
                      : <><RefreshCw size={18} /> {jpIsDryRun ? 'Tester la sync mondiale' : 'Lancer la sync mondiale'}</>
                    }
                  </button>
                </div>

                {/* Sync par pays */}
                <div className="bg-white border border-gray-200 rounded-2xl p-5 hover:border-teal-300 transition-colors">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center">
                      <Zap size={20} className="text-teal-600" />
                    </div>
                    <div>
                      <h4 className="font-bold text-gray-800">Sync par pays</h4>
                      <p className="text-xs text-gray-500">Rapide — 1 à 2 minutes</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={jpSelectedCountry}
                      onChange={e => setJpSelectedCountry(e.target.value)}
                      className="flex-1 text-sm border border-gray-200 rounded-xl px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-300"
                    >
                      <option value="">Choisir un pays...</option>
                      {JP_COUNTRIES.map(c => (
                        <option key={c.code} value={c.code}>{c.name}</option>
                      ))}
                    </select>
                    <button
                      onClick={triggerCountrySync}
                      disabled={!jpSelectedCountry || jpStatus?.isRunning}
                      className="px-4 py-2 bg-teal-600 text-white rounded-xl font-semibold hover:bg-teal-700 transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    >
                      <Play size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats dernière sync */}
              <div>
                <button
                  onClick={() => setJpShowStats(!jpShowStats)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-800 mb-3"
                >
                  {jpShowStats ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  Statistiques de la dernière synchronisation
                </button>

                {jpShowStats && jpStats?.hasData && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-5 space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {[
                        { label: 'Total récupérés', value: jpStats.totalFetched },
                        { label: '✅ Créés', value: jpStats.created },
                        { label: '🔄 Mis à jour', value: jpStats.updated },
                        { label: '❌ Erreurs', value: jpStats.errors },
                      ].map((s, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3 text-center">
                          <p className="text-xl font-bold text-gray-800">{s.value || 0}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{s.label}</p>
                        </div>
                      ))}
                    </div>
                    <div className="text-xs text-gray-500 flex gap-4">
                      {jpStats.duration && <span>⏱ Durée : {jpStats.duration}</span>}
                      {jpStats.startedAt && <span>📅 {new Date(jpStats.startedAt).toLocaleString('fr-FR')}</span>}
                    </div>
                    {/* Répartition par statut */}
                    {jpStats.byStatus && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Répartition par statut DMM</p>
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(jpStats.byStatus).map(([status, count]) => {
                            const s = STATUS_LABELS_JP[status] || { label: status, color: 'text-gray-600', bg: 'bg-gray-50' }
                            return (
                              <span key={status} className={`px-3 py-1 rounded-full text-xs font-semibold ${s.bg} ${s.color} border border-gray-200`}>
                                {s.label} : {count}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    )}
                    {/* Top pays */}
                    {jpStats.byCountry && (
                      <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Top pays</p>
                        <div className="space-y-1.5">
                          {Object.entries(jpStats.byCountry)
                            .sort((a, b) => b[1] - a[1])
                            .slice(0, 8)
                            .map(([country, count]) => {
                              const max = Object.values(jpStats.byCountry).reduce((a, b) => Math.max(a, b), 1)
                              const pct = Math.round((count / max) * 100)
                              return (
                                <div key={country} className="flex items-center gap-2 text-xs">
                                  <span className="w-32 text-gray-700 truncate flex-shrink-0">{country}</span>
                                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-indigo-400 rounded-full" style={{ width: `${pct}%` }} />
                                  </div>
                                  <span className="text-gray-500 w-8 text-right flex-shrink-0">{count}</span>
                                </div>
                              )
                            })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {jpShowStats && !jpStats?.hasData && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-center text-gray-400 text-sm">
                    Aucune synchronisation effectuée depuis le démarrage du serveur.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DataManagement
