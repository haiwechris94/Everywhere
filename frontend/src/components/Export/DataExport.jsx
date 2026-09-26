import { useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import api, { villagesApi } from '../../services/api'
import {
  Download,
  FileJson,
  FileSpreadsheet,
  CheckSquare,
  Square,
  Loader2,
  Database,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '../../i18n'

// Available people-group data sources. The new IMB (PeopleGroups.org) and
// Finishing the Task (FTT) sources are included so exports can be filtered by source.
const SOURCE_OPTIONS = [
  { value: 'PeopleGroups.org', label: 'IMB / PeopleGroups.org' },
  { value: 'Finishing the Task', label: 'Finishing the Task' },
  { value: 'Joshua Project', label: 'Joshua Project' },
  { value: 'DMM', label: 'DMM' },
  { value: 'Survey', label: 'Survey' },
  { value: 'manual', label: 'Manual' },
]

const DataExport = () => {
  const { t } = useLanguage()
  const [format, setFormat] = useState('json')
  const [selectedVillages, setSelectedVillages] = useState([])
  const [exportType, setExportType] = useState('all') // 'all' or 'selected'
  const [selectedSources, setSelectedSources] = useState([]) // empty = all sources

  // Fetch villages for selection
  const { data: villagesData, isLoading: villagesLoading } = useQuery({
    queryKey: ['villages'],
    queryFn: async () => {
      const response = await villagesApi.getAll({ limit: 500 })
      return response.data.villages || response.data.data || []
    },
  })

  // Export all mutation
  const exportAllMutation = useMutation({
    mutationFn: async () => {
      const sourceParam = selectedSources.length > 0
        ? `&source=${encodeURIComponent(selectedSources.join(','))}`
        : ''
      const response = await api.get(`/api/export/all?format=${format}${sourceParam}`, {
        responseType: 'blob'
      })
      return response
    },
    onSuccess: (response) => {
      const contentType = response.headers['content-type']
      const extension = format === 'csv' ? 'csv' : 'json'
      const filename = `church-planting-map-all-${new Date().toISOString().split('T')[0]}.${extension}`
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Export downloaded!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Export failed')
    }
  })

  // Export selected villages mutation
  const exportSelectedMutation = useMutation({
    mutationFn: async () => {
      const response = await api.post('/api/export/villages', {
        villageIds: selectedVillages,
        format,
        includeActivities: true,
        includePeopleGroups: true
      }, {
        responseType: 'blob'
      })
      return response
    },
    onSuccess: (response) => {
      const extension = format === 'csv' ? 'csv' : 'json'
      const filename = `church-planting-map-villages-${new Date().toISOString().split('T')[0]}.${extension}`
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Export downloaded!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Export failed')
    }
  })

  // Export people groups mutation
  const exportPeopleGroupsMutation = useMutation({
    mutationFn: async () => {
      const sourceParam = selectedSources.length > 0
        ? `&source=${encodeURIComponent(selectedSources.join(','))}`
        : ''
      const response = await api.get(`/api/export/people-groups?format=${format}${sourceParam}`, {
        responseType: 'blob'
      })
      return response
    },
    onSuccess: (response) => {
      const extension = format === 'csv' ? 'csv' : 'json'
      const filename = `people-groups-${new Date().toISOString().split('T')[0]}.${extension}`
      
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', filename)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Export downloaded!')
    },
    onError: (error) => {
      toast.error(error.response?.data?.message || 'Export failed')
    }
  })

  const handleVillageToggle = (villageId) => {
    setSelectedVillages(prev => 
      prev.includes(villageId)
        ? prev.filter(id => id !== villageId)
        : [...prev, villageId]
    )
  }

  const handleSourceToggle = (source) => {
    setSelectedSources(prev =>
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source]
    )
  }

  const handleSelectAll = () => {
    if (villagesData) {
      if (selectedVillages.length === villagesData.length) {
        setSelectedVillages([])
      } else {
        setSelectedVillages(villagesData.map(v => v._id))
      }
    }
  }

  const handleExport = () => {
    if (exportType === 'all') {
      exportAllMutation.mutate()
    } else if (selectedVillages.length > 0) {
      exportSelectedMutation.mutate()
    } else {
      toast.error('Please select at least one village')
    }
  }

  const isExporting = exportAllMutation.isPending || exportSelectedMutation.isPending || exportPeopleGroupsMutation.isPending

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Download size={24} />
        Export Data
      </h2>

      {/* Export Type Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Export Type
        </label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="exportType"
              value="all"
              checked={exportType === 'all'}
              onChange={(e) => setExportType(e.target.value)}
              className="text-primary-600"
            />
            <span>All Data</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="exportType"
              value="selected"
              checked={exportType === 'selected'}
              onChange={(e) => setExportType(e.target.value)}
              className="text-primary-600"
            />
            <span>Selected Villages</span>
          </label>
        </div>
      </div>

      {/* Format Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Format
        </label>
        <div className="flex gap-4">
          <button
            onClick={() => setFormat('json')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
              format === 'json'
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <FileJson size={20} />
            JSON
          </button>
          <button
            onClick={() => setFormat('csv')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 transition-colors ${
              format === 'csv'
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <FileSpreadsheet size={20} />
            CSV
          </button>
        </div>
      </div>

      {/* Village Selection (when exportType is 'selected') */}
      {exportType === 'selected' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700">
              Select Villages ({selectedVillages.length} selected)
            </label>
            <button
              onClick={handleSelectAll}
              className="text-sm text-primary-600 hover:underline"
            >
              {selectedVillages.length === villagesData?.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          
          {villagesLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-primary-600" size={24} />
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto border rounded-lg p-2 space-y-1">
              {villagesData && villagesData.length > 0 ? (
                villagesData.map((village) => (
                  <label
                    key={village._id}
                    className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer"
                  >
                    <button
                      onClick={() => handleVillageToggle(village._id)}
                      className="text-gray-500 hover:text-primary-600"
                    >
                      {selectedVillages.includes(village._id) ? (
                        <CheckSquare size={20} className="text-primary-600" />
                      ) : (
                        <Square size={20} />
                      )}
                    </button>
                    <span className="flex-1">{village.name}</span>
                    {village.region && (
                      <span className="text-sm text-gray-500">{village.region}</span>
                    )}
                  </label>
                ))
              ) : (
                <p className="text-center text-gray-500 py-4">No villages found</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Source Filter (applies to "Export People Groups Only") */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter People Groups by Source <span className="text-gray-400 font-normal">(optional — empty = all sources)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {SOURCE_OPTIONS.map((src) => (
            <button
              key={src.value}
              type="button"
              onClick={() => handleSourceToggle(src.value)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-sm transition-colors ${
                selectedSources.includes(src.value)
                  ? 'border-primary-500 bg-primary-50 text-primary-700'
                  : 'border-gray-200 hover:border-gray-300 text-gray-600'
              }`}
            >
              {selectedSources.includes(src.value) ? (
                <CheckSquare size={16} className="text-primary-600" />
              ) : (
                <Square size={16} />
              )}
              {src.label}
            </button>
          ))}
        </div>
      </div>

      {/* Export Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          onClick={handleExport}
          disabled={isExporting || (exportType === 'selected' && selectedVillages.length === 0)}
          className="btn-primary flex items-center gap-2"
        >
          {isExporting ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Download size={18} />
          )}
          {exportType === 'all' ? 'Export All Data' : `Export ${selectedVillages.length} Villages`}
        </button>

        <button
          onClick={() => exportPeopleGroupsMutation.mutate()}
          disabled={isExporting}
          className="btn-secondary flex items-center gap-2"
        >
          {exportPeopleGroupsMutation.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Database size={18} />
          )}
          Export People Groups Only
        </button>
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h4 className="font-medium text-gray-800 mb-2">Export Information</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>• <strong>All Data:</strong> Exports villages, people groups, and activities</li>
          <li>• <strong>Selected Villages:</strong> Exports selected villages with their related people groups and activities</li>
          <li>• <strong>JSON format:</strong> Best for data backup and programmatic use</li>
          <li>• <strong>CSV format:</strong> Best for spreadsheet applications (Excel, Google Sheets)</li>
        </ul>
      </div>
    </div>
  )
}

export default DataExport
