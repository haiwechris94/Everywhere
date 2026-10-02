import { useState, useRef } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../../services/api'
import {
  Upload,
  Download,
  FileText,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Info,
  AlertTriangle,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '../../i18n'

// Maximum file size: 10MB
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const PeopleGroupImport = ({ onSuccess }) => {
  const { t, isFrench } = useLanguage()
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [validationResult, setValidationResult] = useState(null)
  const [importResult, setImportResult] = useState(null)
  const fileInputRef = useRef(null)

  // Download template
  const downloadTemplate = async () => {
    try {
      const response = await api.get('/api/import/people-groups/template', {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', 'people-groups-template.csv')
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success(isFrench ? 'Modèle téléchargé !' : 'Template downloaded!')
    } catch (error) {
      toast.error(isFrench ? 'Échec du téléchargement du modèle' : 'Failed to download template')
    }
  }

  // Validate mutation
  const validateMutation = useMutation({
    mutationFn: async (formData) => {
      const response = await api.post('/api/import/people-groups/validate', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return response.data
    },
    onSuccess: (data) => {
      setValidationResult(data)
      if (data.summary.invalid === 0) {
        toast.success(isFrench ? `Les ${data.summary.valid} lignes sont valides !` : `All ${data.summary.valid} rows are valid!`)
      } else {
        toast.warning(isFrench ? `${data.summary.valid} valides, ${data.summary.invalid} lignes invalides` : `${data.summary.valid} valid, ${data.summary.invalid} invalid rows`)
      }
    },
    onError: (error) => {
      const message = error.response?.data?.message || (isFrench ? 'Échec de la validation' : 'Validation failed')
      toast.error(message)
      console.error('Validation error:', error.response?.data)
    }
  })

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (formData) => {
      const response = await api.post('/api/import/people-groups', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return response.data
    },
    onSuccess: (data) => {
      setImportResult(data)
      toast.success(isFrench ? `${data.summary.imported} groupes de peuple importés !` : `Imported ${data.summary.imported} people groups!`)
      if (onSuccess) onSuccess()
    },
    onError: (error) => {
      const message = error.response?.data?.message || (isFrench ? "Échec de l'importation" : 'Import failed')
      const details = error.response?.data?.errors || []
      toast.error(message)
      console.error('Import error:', error.response?.data)
      // Show detailed errors if available
      if (details.length > 0) {
        setImportResult({
          success: false,
          summary: { total: 0, imported: 0, skipped: details.length },
          skipped: details.map(e => ({ row: e.row, reason: e.error })),
          errors: details
        })
      }
    }
  })

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0]
    setFileError(null)
    setValidationResult(null)
    setImportResult(null)
    
    if (!selectedFile) {
      setFile(null)
      return
    }
    
    // Validate file type
    const isCSV = selectedFile.name.toLowerCase().endsWith('.csv') ||
                  selectedFile.type === 'text/csv' ||
                  selectedFile.type === 'application/csv'
    
    if (!isCSV) {
      setFileError(isFrench ? 'Veuillez sélectionner un fichier CSV (.csv)' : 'Please select a CSV file (.csv)')
      setFile(null)
      return
    }
    
    // Validate file size
    if (selectedFile.size > MAX_FILE_SIZE) {
      setFileError(isFrench ? `Le fichier est trop volumineux. La taille maximale est de ${MAX_FILE_SIZE / (1024 * 1024)} Mo` : `File is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`)
      setFile(null)
      return
    }
    
    // Validate file is not empty
    if (selectedFile.size === 0) {
      setFileError(isFrench ? 'Le fichier est vide. Veuillez sélectionner un fichier contenant des données.' : 'File is empty. Please select a file with data.')
      setFile(null)
      return
    }
    
    setFile(selectedFile)
  }

  const handleValidate = () => {
    if (!file) {
      toast.error(isFrench ? "Veuillez d'abord sélectionner un fichier" : 'Please select a file first')
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    validateMutation.mutate(formData)
  }

  const handleImport = () => {
    if (!file) {
      toast.error(isFrench ? "Veuillez d'abord sélectionner un fichier" : 'Please select a file first')
      return
    }
    const formData = new FormData()
    formData.append('file', file)
    importMutation.mutate(formData)
  }

  const resetForm = () => {
    setFile(null)
    setFileError(null)
    setValidationResult(null)
    setImportResult(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Upload size={24} />
        {isFrench ? 'Importer des groupes de peuple' : 'Import People Groups'}
      </h2>

      {/* Instructions */}
      <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex gap-3">
          <Info className="text-blue-500 flex-shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h3 className="font-medium text-blue-800 mb-2">{isFrench ? 'Démarrage rapide' : 'Quick Start'}</h3>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• <strong>{isFrench ? 'Champs requis :' : 'Required fields:'}</strong> name, latitude, longitude</li>
              <li>• <strong>{isFrench ? 'Formats pris en charge :' : 'Supported formats:'}</strong> {isFrench ? 'CSV avec séparateur virgule (,) ou point-virgule (;)' : 'CSV with comma (,) or semicolon (;) delimiter'}</li>
              <li>• <strong>{isFrench ? 'Encodage :' : 'Encoding:'}</strong> {isFrench ? 'UTF-8 (avec ou sans BOM)' : 'UTF-8 (with or without BOM)'}</li>
              <li>• <strong>{isFrench ? 'Taille max du fichier :' : 'Max file size:'}</strong> 10MB</li>
            </ul>
            <button
              onClick={downloadTemplate}
              className="mt-3 btn-secondary flex items-center gap-2 text-sm"
            >
              <Download size={16} />
              {isFrench ? 'Télécharger le modèle' : 'Download Template'}
            </button>
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {isFrench ? 'Sélectionner un fichier CSV' : 'Select CSV File'}
        </label>
        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv,application/csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary-50 file:text-primary-700 hover:file:bg-primary-100"
          />
          {file && (
            <button
              onClick={resetForm}
              className="text-gray-500 hover:text-gray-700"
              title={isFrench ? 'Effacer la sélection' : 'Clear selection'}
            >
              <XCircle size={20} />
            </button>
          )}
        </div>
        
        {/* File Error */}
        {fileError && (
          <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
            <AlertTriangle size={16} />
            {fileError}
          </div>
        )}
        
        {/* File Info */}
        {file && !fileError && (
          <p className="mt-2 text-sm text-gray-500 flex items-center gap-2">
            <FileText size={16} />
            {file.name} ({(file.size / 1024).toFixed(1)} {isFrench ? 'Ko' : 'KB'})
          </p>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 mb-6">
        <button
          onClick={handleValidate}
          disabled={!file || validateMutation.isPending}
          className="btn-secondary flex items-center gap-2"
        >
          {validateMutation.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <CheckCircle size={18} />
          )}
          {isFrench ? 'Valider' : 'Validate'}
        </button>
        <button
          onClick={handleImport}
          disabled={!file || importMutation.isPending}
          className="btn-primary flex items-center gap-2"
        >
          {importMutation.isPending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <Upload size={18} />
          )}
          {isFrench ? 'Importer' : 'Import'}
        </button>
      </div>

      {/* Validation Results */}
      {validationResult && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
          <h3 className="font-semibold text-gray-800 mb-3">{isFrench ? 'Résultats de la validation' : 'Validation Results'}</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-white rounded-lg shadow-sm">
              <p className="text-2xl font-bold text-gray-800">{validationResult.summary.total}</p>
              <p className="text-sm text-gray-500">{isFrench ? 'Total des lignes' : 'Total Rows'}</p>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-lg border border-green-200">
              <p className="text-2xl font-bold text-green-600">{validationResult.summary.valid}</p>
              <p className="text-sm text-green-600">{isFrench ? 'Prêtes à importer' : 'Ready to Import'}</p>
            </div>
            <div className="text-center p-3 bg-red-50 rounded-lg border border-red-200">
              <p className="text-2xl font-bold text-red-600">{validationResult.summary.invalid}</p>
              <p className="text-sm text-red-600">{isFrench ? 'À corriger' : 'Need Fixes'}</p>
            </div>
          </div>

          {/* Warnings */}
          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="font-medium text-yellow-700 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                {isFrench ? 'Remarques' : 'Notes'} ({validationResult.warnings.length})
              </h4>
              <div className="max-h-32 overflow-y-auto space-y-1 text-sm text-yellow-700">
                {validationResult.warnings.slice(0, 5).map((item, index) => (
                  <div key={index}>
                    {isFrench ? 'Ligne' : 'Row'} {item.row}: {item.warnings.map(w => w.message).join('; ')}
                  </div>
                ))}
                {validationResult.warnings.length > 5 && (
                  <div className="text-yellow-600 font-medium">
                    {isFrench ? `... et ${validationResult.warnings.length - 5} de plus` : `... and ${validationResult.warnings.length - 5} more`}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Invalid Rows */}
          {validationResult.invalidRows && validationResult.invalidRows.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-red-600 mb-2 flex items-center gap-2">
                <AlertCircle size={16} />
                {isFrench ? 'Lignes avec des erreurs' : 'Rows with Errors'} ({validationResult.invalidRows.length})
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {validationResult.invalidRows.map((row, index) => (
                  <div key={index} className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
                    <div className="font-medium text-red-800">{isFrench ? 'Ligne' : 'Row'} {row.row}</div>
                    <ul className="mt-1 space-y-1 text-red-700">
                      {row.errors.map((error, i) => (
                        <li key={i}>• {error}</li>
                      ))}
                    </ul>
                    {row.details && row.details[0]?.suggestion && (
                      <p className="mt-1 text-red-600 text-xs italic">
                        💡 {row.details[0].suggestion}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Success message if all valid */}
          {validationResult.summary.invalid === 0 && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
              <CheckCircle size={18} />
              <span>{isFrench ? 'Toutes les lignes sont valides ! Cliquez sur « Importer » pour les ajouter à la base de données.' : 'All rows are valid! Click "Import" to add them to the database.'}</span>
            </div>
          )}
        </div>
      )}

      {/* Import Results */}
      {importResult && (
        <div className={`p-4 rounded-lg border ${importResult.summary.imported > 0 ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
          <h3 className={`font-semibold mb-3 flex items-center gap-2 ${importResult.summary.imported > 0 ? 'text-green-800' : 'text-yellow-800'}`}>
            {importResult.summary.imported > 0 ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
            {isFrench ? 'Importation ' : 'Import '}{importResult.summary.imported > 0 ? (isFrench ? 'terminée' : 'Complete') : (isFrench ? 'terminée avec des problèmes' : 'Finished with Issues')}
          </h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div className="text-center p-3 bg-white rounded-lg shadow-sm">
              <p className="text-2xl font-bold text-gray-800">{importResult.summary.total}</p>
              <p className="text-sm text-gray-500">{isFrench ? 'Total des lignes' : 'Total Rows'}</p>
            </div>
            <div className="text-center p-3 bg-green-100 rounded-lg border border-green-200">
              <p className="text-2xl font-bold text-green-600">{importResult.summary.imported}</p>
              <p className="text-sm text-green-600">{isFrench ? 'Importées' : 'Imported'}</p>
            </div>
            <div className="text-center p-3 bg-yellow-100 rounded-lg border border-yellow-200">
              <p className="text-2xl font-bold text-yellow-600">{importResult.summary.skipped}</p>
              <p className="text-sm text-yellow-600">{isFrench ? 'Ignorées' : 'Skipped'}</p>
            </div>
          </div>

          {/* Created vs Updated breakdown */}
          <div className="flex flex-wrap gap-2 mb-4 text-sm">
            <span className="px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-700">
              {importResult.summary.created ?? 0} {isFrench ? 'créés' : 'created'}
            </span>
            <span className="px-2 py-1 rounded bg-blue-50 border border-blue-200 text-blue-700">
              {importResult.summary.updated ?? 0} {isFrench ? 'mis à jour' : 'updated'}
            </span>
          </div>

          {/* Updated rows (quarter → quarter) */}
          {importResult.report?.updated?.length > 0 && (
            <div className="mt-2">
              <h4 className="font-medium text-blue-700 mb-2">{isFrench ? 'Mises à jour' : 'Updates'}</h4>
              <div className="max-h-40 overflow-y-auto space-y-1">
                {importResult.report.updated.map((item, index) => (
                  <div key={index} className="p-2 bg-blue-50 border border-blue-200 rounded text-sm text-blue-800">
                    <span className="font-medium">{isFrench ? 'Ligne' : 'Row'} {item.row}:</span>{' '}
                    {item.name}
                    {item.previousReportPeriod && item.newReportPeriod && (
                      <span className="text-blue-600"> ({item.previousReportPeriod} → {item.newReportPeriod})</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skipped Rows with Details */}
          {importResult.skipped && importResult.skipped.length > 0 && (
            <div className="mt-4">
              <h4 className="font-medium text-yellow-700 mb-2 flex items-center gap-2">
                <AlertTriangle size={16} />
                {isFrench ? 'Lignes ignorées' : 'Skipped Rows'}
              </h4>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {importResult.skipped.map((item, index) => (
                  <div key={index} className="p-2 bg-yellow-50 border border-yellow-200 rounded text-sm">
                    <span className="font-medium text-yellow-800">{isFrench ? 'Ligne' : 'Row'} {item.row}:</span>{' '}
                    <span className="text-yellow-700">{item.reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Success message */}
          {importResult.summary.imported > 0 && importResult.summary.skipped === 0 && (
            <div className="mt-4 p-3 bg-green-100 border border-green-300 rounded-lg flex items-center gap-2 text-green-800">
              <CheckCircle size={18} />
              <span>{isFrench ? `Les ${importResult.summary.imported} groupes de peuple ont été importés avec succès !` : `All ${importResult.summary.imported} people groups imported successfully!`}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default PeopleGroupImport
