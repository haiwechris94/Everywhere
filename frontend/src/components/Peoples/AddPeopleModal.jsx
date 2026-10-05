/**
 * AddPeopleModal Component
 * Modal form for adding new peoples/population data
 */
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../../context/AuthContext'
import { peoplesApi } from '../../services/peoplesApi'
import { villagesApi } from '../../services/api'
import { SUPPORTED_COUNTRIES } from '../../config/supportedCountries'
import toast from 'react-hot-toast'
import { useLanguage } from '../../i18n'

// Status options
const STATUS_OPTIONS = [
  { value: 'unreached', label: 'Unreached', color: 'red' },
  { value: 'pioneer', label: 'Pioneer', color: 'yellow' },
  { value: 'midway', label: 'Midway', color: 'blue' },
  { value: 'tipping-point', label: 'Tipping Point', color: 'orange' },
  { value: 'dmm', label: 'DMM', color: 'green' },
]

// Data type options for source selection
const DATA_TYPE_OPTIONS = [
  { 
    value: 'organization', 
    label: "Données d'organisation", 
    description: 'Données collectées par votre organisation',
    icon: 'building'
  },
  { 
    value: 'survey', 
    label: "Données d'enquête", 
    description: "Données collectées lors d'une enquête terrain",
    icon: 'clipboard'
  },
]

// Initial form state
const INITIAL_FORM_STATE = {
  name: '',
  villageName: '',
  polygonId: '',
  population: '',
  households: '',
  language: '',
  religion: '',
  ethnicity: '',
  description: '',
  region: '',
  departement: '',
  arrondissement: '',
  country: 'Cameroon',
  status: 'unreached',
  believersCount: '',
  churchesCount: '',
  dataSource: '',
  dataYear: new Date().getFullYear(),
  demographics: {
    maleCount: '',
    femaleCount: '',
    childrenCount: '',
    adultsCount: '',
    elderlyCount: '',
  },
}

/**
 * AddPeopleModal - Form modal for creating new people records
 * @param {boolean} isOpen - Whether modal is open
 * @param {function} onClose - Callback when modal is closed
 * @param {function} onSuccess - Callback when people is created successfully
 * @param {Object} initialData - Initial data to pre-fill form
 */
// Country options from supported countries config
const COUNTRY_OPTIONS = Object.values(SUPPORTED_COUNTRIES).map(c => ({
  code: c.code,
  name: c.name,
  nameFr: c.nameFr
}))

const AddPeopleModal = ({ isOpen, onClose, onSuccess, initialData = {} }) => {
  const { t, isFrench } = useLanguage()
  const { user } = useAuth()
  const [formData, setFormData] = useState(INITIAL_FORM_STATE)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState({})
  const [showDemographics, setShowDemographics] = useState(false)
  
  // Data type state (organization vs survey)
  const [dataType, setDataType] = useState('organization')
  
  // Latitude and longitude state
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  
  // Village dropdown state
  const [villages, setVillages] = useState([])
  const [loadingVillages, setLoadingVillages] = useState(false)
  const [villageSearchTerm, setVillageSearchTerm] = useState('')

  // Check if user can add peoples
  const canAddPeople = user && ['admin', 'supervisor', 'missionary'].includes(user.role)

  // Fetch villages by country
  const fetchVillagesByCountry = useCallback(async (countryCode) => {
    if (!countryCode) {
      setVillages([])
      return
    }
    
    setLoadingVillages(true)
    try {
      // Map country name to ISO code if needed
      const countryConfig = SUPPORTED_COUNTRIES[countryCode] || 
        Object.values(SUPPORTED_COUNTRIES).find(c => 
          c.name.toLowerCase() === countryCode.toLowerCase() ||
          c.nameFr.toLowerCase() === countryCode.toLowerCase()
        )
      
      const code = countryConfig?.code || countryCode
      const response = await villagesApi.getAll({ country: code, limit: 500 })
      setVillages(response.data.villages || [])
    } catch (error) {
      console.error('Error fetching villages:', error)
      setVillages([])
    } finally {
      setLoadingVillages(false)
    }
  }, [])

  // Reset form when modal opens/closes or initialData changes
  useEffect(() => {
    if (isOpen) {
      const newFormData = {
        ...INITIAL_FORM_STATE,
        ...initialData,
        demographics: {
          ...INITIAL_FORM_STATE.demographics,
          ...(initialData.demographics || {}),
        },
      }
      setFormData(newFormData)
      setErrors({})
      setVillageSearchTerm('')
      setDataType('organization')
      setLatitude('')
      setLongitude('')
      
      // Fetch villages for initial country
      if (newFormData.country) {
        fetchVillagesByCountry(newFormData.country)
      }
    }
  }, [isOpen, initialData, fetchVillagesByCountry])

  // Fetch villages when country changes
  useEffect(() => {
    if (isOpen && formData.country) {
      fetchVillagesByCountry(formData.country)
      // Clear village selection when country changes
      if (formData.villageName) {
        setFormData(prev => ({ ...prev, villageName: '' }))
      }
    }
  }, [formData.country, isOpen, fetchVillagesByCountry])

  // Filter villages based on search term
  const filteredVillages = villages.filter(village => 
    village.name?.toLowerCase().includes(villageSearchTerm.toLowerCase())
  ).slice(0, 50) // Limit to 50 results for performance

  // Handle input change
  const handleChange = (e) => {
    const { name, value, type } = e.target
    
    // Handle nested demographics fields
    if (name.startsWith('demographics.')) {
      const field = name.split('.')[1]
      setFormData(prev => ({
        ...prev,
        demographics: {
          ...prev.demographics,
          [field]: type === 'number' ? (value === '' ? '' : parseInt(value, 10)) : value,
        },
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: type === 'number' ? (value === '' ? '' : parseInt(value, 10)) : value,
      }))
    }

    // Clear error for this field
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }))
    }
  }

  // Validate form
  const validateForm = () => {
    const newErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required'
    }

    if (formData.population && formData.population < 0) {
      newErrors.population = 'Population cannot be negative'
    }

    if (formData.households && formData.households < 0) {
      newErrors.households = 'Households cannot be negative'
    }

    if (formData.believersCount && formData.believersCount < 0) {
      newErrors.believersCount = 'Believers count cannot be negative'
    }

    if (formData.churchesCount && formData.churchesCount < 0) {
      newErrors.churchesCount = 'Churches count cannot be negative'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setLoading(true)

    try {
      // Determine source based on dataType
      const source = dataType === 'survey' 
        ? 'Survey' 
        : (user?.organization || 'DMM')
      
      // Build location object if lat/lng are provided
      let location = undefined
      if (latitude !== '' && longitude !== '') {
        const lat = parseFloat(latitude)
        const lng = parseFloat(longitude)
        if (!isNaN(lat) && !isNaN(lng)) {
          location = {
            type: 'Point',
            coordinates: [lng, lat]
          }
        }
      }
      
      // Prepare data - convert empty strings to undefined
      const submitData = {
        ...formData,
        source,
        location,
        population: formData.population || undefined,
        households: formData.households || undefined,
        believersCount: formData.believersCount || undefined,
        churchesCount: formData.churchesCount || undefined,
        dataYear: formData.dataYear || undefined,
        demographics: showDemographics ? {
          maleCount: formData.demographics.maleCount || undefined,
          femaleCount: formData.demographics.femaleCount || undefined,
          childrenCount: formData.demographics.childrenCount || undefined,
          adultsCount: formData.demographics.adultsCount || undefined,
          elderlyCount: formData.demographics.elderlyCount || undefined,
        } : undefined,
      }

      // Remove empty string fields
      Object.keys(submitData).forEach(key => {
        if (submitData[key] === '' || submitData[key] === undefined) {
          delete submitData[key]
        }
      })

      const response = await peoplesApi.create(submitData)
      
      toast.success(isFrench ? 'Données de population ajoutées avec succès !' : 'Population data added successfully!')
      
      if (onSuccess) {
        onSuccess(response.data.people)
      }
      
      onClose()
    } catch (error) {
      console.error('Error creating people:', error)
      const message = error.response?.data?.message || 'Failed to add population data'
      toast.error(message)
      
      if (error.response?.data?.details) {
        setErrors(error.response.data.details)
      }
    } finally {
      setLoading(false)
    }
  }

  // Don't render if user doesn't have permission
  if (!canAddPeople) {
    return null
  }

  // Don't render if modal is closed
  if (!isOpen) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-800">
              Add Population Data
            </h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-1"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Data Type Selection */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
                Type de données
              </h3>
              
              <div className="grid grid-cols-2 gap-4">
                {DATA_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setDataType(option.value)}
                    className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                      dataType === option.value
                        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* Icon */}
                      <div className={`flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center ${
                        dataType === option.value ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {option.icon === 'building' ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                          </svg>
                        )}
                      </div>
                      
                      {/* Text */}
                      <div className="flex-1 min-w-0">
                        <p className={`font-medium ${dataType === option.value ? 'text-blue-700' : 'text-gray-700'}`}>
                          {option.label}
                        </p>
                        <p className={`text-xs mt-0.5 ${dataType === option.value ? 'text-blue-600' : 'text-gray-500'}`}>
                          {option.description}
                        </p>
                      </div>
                      
                      {/* Check indicator */}
                      {dataType === option.value && (
                        <div className="absolute top-2 right-2">
                          <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
              
              {/* Source indicator */}
              <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-md">
                <span className="font-medium">Source:</span>{' '}
                {dataType === 'survey' ? 'Survey' : (user?.organization || 'DMM')}
              </p>
            </div>

            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
                Basic Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.name ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder={isFrench ? 'Nom du groupe de peuple' : 'People group name'}
                  />
                  {errors.name && (
                    <p className="mt-1 text-xs text-red-500">{errors.name}</p>
                  )}
                </div>

                {/* Village Name - Dropdown filtered by country */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Village Name
                    {loadingVillages && (
                      <span className="ml-2 text-xs text-gray-400">(Loading...)</span>
                    )}
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={villages.length > 0 ? "Search or type village name..." : "Type village name..."}
                      value={villageSearchTerm || formData.villageName}
                      onChange={(e) => {
                        setVillageSearchTerm(e.target.value)
                        // Also update formData for manual entry
                        setFormData(prev => ({ ...prev, villageName: e.target.value }))
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    {/* Dropdown list */}
                    {villageSearchTerm && filteredVillages.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-48 overflow-y-auto">
                        {filteredVillages.map((village) => (
                          <button
                            key={village._id}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, villageName: village.name }))
                              setVillageSearchTerm('')
                              // Auto-fill lat/lng from village coordinates if available
                              if (village.location?.coordinates) {
                                const [lng, lat] = village.location.coordinates
                                setLongitude(lng?.toString() || '')
                                setLatitude(lat?.toString() || '')
                              }
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none text-sm"
                          >
                            <span className="font-medium">{village.name}</span>
                            {village.region && (
                              <span className="text-gray-500 ml-2">({village.region})</span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* No results message */}
                    {villageSearchTerm && filteredVillages.length === 0 && villages.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg p-3 text-sm text-gray-500">
                        No villages found matching "{villageSearchTerm}"
                      </div>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {villages.length > 0 
                      ? `${villages.length} villages available for ${formData.country}`
                      : 'Type to enter village name manually'}
                  </p>
                </div>

                {/* Status */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Status
                  </label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {STATUS_OPTIONS.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Polygon ID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Polygon ID
                  </label>
                  <input
                    type="text"
                    name="polygonId"
                    value={formData.polygonId}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'ID du polygone associé' : 'Associated polygon ID'}
                  />
                </div>
              </div>
            </div>

            {/* Population Data */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
                Population Data
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Population
                  </label>
                  <input
                    type="number"
                    name="population"
                    value={formData.population}
                    onChange={handleChange}
                    min="0"
                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                      errors.population ? 'border-red-500' : 'border-gray-300'
                    }`}
                    placeholder="0"
                  />
                  {errors.population && (
                    <p className="mt-1 text-xs text-red-500">{errors.population}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Households
                  </label>
                  <input
                    type="number"
                    name="households"
                    value={formData.households}
                    onChange={handleChange}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Believers
                  </label>
                  <input
                    type="number"
                    name="believersCount"
                    value={formData.believersCount}
                    onChange={handleChange}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Churches
                  </label>
                  <input
                    type="number"
                    name="churchesCount"
                    value={formData.churchesCount}
                    onChange={handleChange}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Demographics Toggle */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowDemographics(!showDemographics)}
                  className="text-sm text-blue-600 hover:text-blue-800 flex items-center gap-1"
                >
                  <svg 
                    className={`w-4 h-4 transition-transform ${showDemographics ? 'rotate-90' : ''}`} 
                    fill="none" 
                    stroke="currentColor" 
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                  {showDemographics ? 'Hide' : 'Show'} Demographics Breakdown
                </button>
              </div>

              {/* Demographics Fields */}
              {showDemographics && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Male
                    </label>
                    <input
                      type="number"
                      name="demographics.maleCount"
                      value={formData.demographics.maleCount}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Female
                    </label>
                    <input
                      type="number"
                      name="demographics.femaleCount"
                      value={formData.demographics.femaleCount}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Children
                    </label>
                    <input
                      type="number"
                      name="demographics.childrenCount"
                      value={formData.demographics.childrenCount}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Adults
                    </label>
                    <input
                      type="number"
                      name="demographics.adultsCount"
                      value={formData.demographics.adultsCount}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Elderly
                    </label>
                    <input
                      type="number"
                      name="demographics.elderlyCount"
                      value={formData.demographics.elderlyCount}
                      onChange={handleChange}
                      min="0"
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Cultural Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
                Cultural Information
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Language
                  </label>
                  <input
                    type="text"
                    name="language"
                    value={formData.language}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'Langue principale' : 'Primary language'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Religion
                  </label>
                  <input
                    type="text"
                    name="religion"
                    value={formData.religion}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'Religion principale' : 'Primary religion'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ethnicity
                  </label>
                  <input
                    type="text"
                    name="ethnicity"
                    value={formData.ethnicity}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'Groupe ethnique' : 'Ethnic group'}
                  />
                </div>
              </div>
            </div>

            {/* Location Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
                Location
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Country
                  </label>
                  <select
                    name="country"
                    value={formData.country}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select country...</option>
                    {COUNTRY_OPTIONS.map(country => (
                      <option key={country.code} value={country.name}>
                        {country.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Region
                  </label>
                  <input
                    type="text"
                    name="region"
                    value={formData.region}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'Région' : 'Region'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Departement
                  </label>
                  <input
                    type="text"
                    name="departement"
                    value={formData.departement}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'Département' : 'Departement'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Arrondissement
                  </label>
                  <input
                    type="text"
                    name="arrondissement"
                    value={formData.arrondissement}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'Arrondissement' : 'Arrondissement'}
                  />
                </div>
              </div>
              
              {/* Coordinates */}
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Latitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 5.9631"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Decimal degrees (e.g., 5.9631)
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Longitude
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., 10.1591"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Decimal degrees (e.g., 10.1591)
                  </p>
                </div>
              </div>
              
              {latitude && longitude && (
                <p className="text-xs text-green-600 bg-green-50 px-3 py-2 rounded-md flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Coordonnées: {latitude}, {longitude}
                </p>
              )}
            </div>

            {/* Data Source */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-700 uppercase tracking-wide">
                Data Source
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source
                  </label>
                  <input
                    type="text"
                    name="dataSource"
                    value={formData.dataSource}
                    onChange={handleChange}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'Source des données (ex. Recensement 2020)' : 'Data source (e.g., Census 2020)'}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Year
                  </label>
                  <input
                    type="number"
                    name="dataYear"
                    value={formData.dataYear}
                    onChange={handleChange}
                    min="1900"
                    max="2100"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder={isFrench ? 'Année' : 'Year'}
                  />
                </div>
              </div>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description / Notes
              </label>
              <textarea
                name="description"
                value={formData.description}
                onChange={handleChange}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder={isFrench ? 'Notes ou description supplémentaires...' : 'Additional notes or description...'}
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                disabled={loading}
              >
                {loading && (
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                )}
                {loading ? 'Saving...' : 'Save Population Data'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default AddPeopleModal
