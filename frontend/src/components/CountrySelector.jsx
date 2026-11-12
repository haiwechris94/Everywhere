/**
 * CountrySelector - Dropdown Component for Country Selection
 * 
 * Features:
 * - Dropdown with country flags and names
 * - Search/filter functionality
 * - Keyboard navigation
 * - Responsive design
 * - Integration with CountryContext
 * 
 * @author Church Planting Map Team
 * @version 1.0.0
 */

import { useState, useRef, useEffect, useMemo } from 'react'
import { Globe, ChevronDown, Check, Search, MapPin } from 'lucide-react'
import { useCountry } from '../context/CountryContext'
import { useLanguage } from '../i18n'

// Country flag emoji mapping (ISO 3166-1 alpha-2 to flag emoji)
const getCountryFlag = (code) => {
  if (!code || code.length !== 2) return '🌍'
  const codePoints = code
    .toUpperCase()
    .split('')
    .map(char => 127397 + char.charCodeAt(0))
  return String.fromCodePoint(...codePoints)
}

/**
 * CountrySelector Component
 * @param {string} variant - 'default' | 'compact' | 'minimal'
 * @param {string} className - Additional CSS classes
 * @param {boolean} showFlag - Show country flag emoji
 * @param {boolean} showSearch - Show search input in dropdown
 */
const CountrySelector = ({ 
  variant = 'default', 
  className = '',
  showFlag = true,
  showSearch = true,
}) => {
  const { 
    selectedCountry, 
    setSelectedCountry, 
    countries, 
    countriesLoading,
    currentCountryConfig,
  } = useCountry()
  const { language, t } = useLanguage()
  
  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [highlightedIndex, setHighlightedIndex] = useState(0)
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)
  
  // Get display name based on language
  const getDisplayName = (country) => {
    if (language === 'en') {
      return country.nameEn || country.name
    }
    return country.name || country.nameEn
  }
  
  // Filter countries based on search query
  const filteredCountries = useMemo(() => {
    if (!searchQuery.trim()) return countries
    
    const query = searchQuery.toLowerCase()
    return countries.filter(country => 
      country.name?.toLowerCase().includes(query) ||
      country.nameEn?.toLowerCase().includes(query) ||
      country.code?.toLowerCase().includes(query) ||
      country.code3?.toLowerCase().includes(query)
    )
  }, [countries, searchQuery])
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
        setSearchQuery('')
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])
  
  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && showSearch && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen, showSearch])
  
  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    
    const handleKeyDown = (e) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setHighlightedIndex(prev => 
            prev < filteredCountries.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setHighlightedIndex(prev => 
            prev > 0 ? prev - 1 : filteredCountries.length - 1
          )
          break
        case 'Enter':
          e.preventDefault()
          if (filteredCountries[highlightedIndex]) {
            handleSelect(filteredCountries[highlightedIndex].code)
          }
          break
        case 'Escape':
          setIsOpen(false)
          setSearchQuery('')
          break
      }
    }
    
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, highlightedIndex, filteredCountries])
  
  // Reset highlighted index when search changes
  useEffect(() => {
    setHighlightedIndex(0)
  }, [searchQuery])
  
  const handleSelect = (countryCode) => {
    setSelectedCountry(countryCode)
    setIsOpen(false)
    setSearchQuery('')
  }
  
  const toggleDropdown = () => {
    setIsOpen(!isOpen)
    if (!isOpen) {
      setSearchQuery('')
      setHighlightedIndex(0)
    }
  }
  
  // Loading state
  if (countriesLoading) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 ${className}`}>
        <div className="animate-spin h-4 w-4 border-2 border-primary-500 border-t-transparent rounded-full" />
        <span className="text-sm text-gray-500">Loading...</span>
      </div>
    )
  }
  
  // Minimal variant - just icon and code
  if (variant === 'minimal') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          onClick={toggleDropdown}
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors dark:hover:bg-slate-700"
          title={t('country.select') || 'Select country'}
        >
          {showFlag && <span className="text-lg">{getCountryFlag(selectedCountry)}</span>}
          <span className="text-xs font-medium text-gray-700 dark:text-slate-300">{selectedCountry}</span>
        </button>
        
        {isOpen && (
          <div className="absolute right-0 mt-1 w-48 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50 animate-fade-in max-h-64 overflow-y-auto dark:bg-slate-800 dark:border-slate-700">
            {filteredCountries.map((country, index) => (
              <button
                key={country.code}
                onClick={() => handleSelect(country.code)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 ${
                  selectedCountry === country.code ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                } ${highlightedIndex === index ? 'bg-gray-100' : ''}`}
              >
                {showFlag && <span>{getCountryFlag(country.code)}</span>}
                <span className="flex-1 text-left truncate">{getDisplayName(country)}</span>
                {selectedCountry === country.code && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }
  
  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          onClick={toggleDropdown}
          className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 dark:border-slate-700 dark:hover:bg-slate-700"
          title={t('country.select') || 'Select country'}
        >
          {showFlag && <span className="text-lg">{getCountryFlag(selectedCountry)}</span>}
          <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
            {currentCountryConfig?.name || selectedCountry}
          </span>
          <ChevronDown
            size={16}
            className={`text-gray-500 dark:text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
        
        {isOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-xl border border-gray-200 py-2 z-50 animate-fade-in dark:bg-slate-800 dark:border-slate-700">
            {showSearch && (
              <div className="px-3 pb-2 border-b border-gray-100 dark:border-slate-700">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t('country.search') || 'Search...'}
                    className="w-full pl-7 pr-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:border-slate-700"
                  />
                </div>
              </div>
            )}
            
            <div className="max-h-64 overflow-y-auto py-1">
              {filteredCountries.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-500 text-center">
                  {t('country.noResults') || 'No countries found'}
                </div>
              ) : (
                filteredCountries.map((country, index) => (
                  <button
                    key={country.code}
                    onClick={() => handleSelect(country.code)}
                    className={`w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 transition-colors ${
                      selectedCountry === country.code ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                    } ${highlightedIndex === index ? 'bg-gray-100' : ''}`}
                  >
                    {showFlag && <span className="text-lg">{getCountryFlag(country.code)}</span>}
                    <span className="flex-1 text-left truncate">{getDisplayName(country)}</span>
                    {selectedCountry === country.code && <Check size={16} className="text-primary-600 dark:text-primary-300" />}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    )
  }
  
  // Default variant - full featured
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className="flex items-center gap-3 px-4 py-2.5 rounded-xl hover:bg-gray-50 transition-all border border-gray-200 bg-white shadow-sm dark:bg-slate-800 dark:border-slate-700 dark:hover:bg-slate-700"
        title={t('country.select') || 'Select country'}
      >
        <div className="flex items-center gap-2">
          {showFlag && <span className="text-xl">{getCountryFlag(selectedCountry)}</span>}
          <MapPin size={16} className="text-gray-500 dark:text-slate-400" />
        </div>
        <div className="flex flex-col items-start">
          <span className="text-xs text-gray-500 dark:text-slate-400 uppercase tracking-wide">
            {t('country.label') || 'Country'}
          </span>
          <span className="text-sm font-semibold text-gray-800 dark:text-slate-100">
            {currentCountryConfig?.name || selectedCountry}
          </span>
        </div>
        <ChevronDown
          size={18}
          className={`text-gray-500 dark:text-slate-400 transition-transform ml-2 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-soft-xl border border-gray-200 py-2 z-50 animate-scale-in dark:bg-slate-800 dark:border-slate-700">
          {/* Header */}
          <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-700">
            <h3 className="text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase tracking-wide">
              {t('country.selectCountry') || 'Select Country'}
            </h3>
          </div>
          
          {/* Search */}
          {showSearch && (
            <div className="px-3 py-2 border-b border-gray-100 dark:border-slate-700">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-slate-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('country.searchPlaceholder') || 'Search countries...'}
                  className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent dark:border-slate-700"
                />
              </div>
            </div>
          )}
          
          {/* Countries List */}
          <div className="max-h-72 overflow-y-auto py-1">
            {filteredCountries.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <Globe size={32} className="mx-auto text-gray-500 dark:text-slate-400 mb-2" />
                <p className="text-sm text-gray-500">
                  {t('country.noResults') || 'No countries found'}
                </p>
              </div>
            ) : (
              filteredCountries.map((country, index) => (
                <button
                  key={country.code}
                  onClick={() => handleSelect(country.code)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors ${
                    selectedCountry === country.code 
                      ? 'bg-primary-50 border-l-4 border-primary-500' 
                      : 'border-l-4 border-transparent'
                  } ${highlightedIndex === index ? 'bg-gray-100' : ''}`}
                >
                  {showFlag && (
                    <span className="text-2xl">{getCountryFlag(country.code)}</span>
                  )}
                  <div className="flex-1 text-left">
                    <div className={`font-medium ${
                      selectedCountry === country.code ? 'text-primary-700' : 'text-gray-800'
                    }`}>
                      {getDisplayName(country)}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-slate-400">
                      {country.code} • {country.capital || country.code3}
                    </div>
                  </div>
                  {selectedCountry === country.code && (
                    <Check size={18} className="text-primary-600 dark:text-primary-300" />
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default CountrySelector
