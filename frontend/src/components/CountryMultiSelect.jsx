import { useState, useRef, useEffect } from 'react';
import { ChevronDown, X, Check, Globe } from 'lucide-react';
import COUNTRY_CONFIG from '../config/countryConfig';
import { useLanguage } from '../contexts/LanguageContext';

// Convert COUNTRY_CONFIG object to array of country objects for the component
const AVAILABLE_COUNTRIES = Object.values(COUNTRY_CONFIG);

/**
 * CountryMultiSelect Component
 * 
 * A multi-select dropdown for selecting countries to filter peoples data.
 * Supports selecting multiple countries with visual feedback.
 * 
 * @param {Object} props
 * @param {string[]} props.selectedCountries - Array of selected country codes
 * @param {function} props.onChange - Callback when selection changes
 * @param {string} props.placeholder - Placeholder text when no selection
 * @param {string} props.className - Additional CSS classes
 * @param {boolean} props.disabled - Whether the component is disabled
 */
const CountryMultiSelect = ({
  selectedCountries = [],
  onChange,
  placeholder = '',
  className = '',
  disabled = false,
}) => {
  const { t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef(null);
  const inputRef = useRef(null);
  
  // Use provided placeholder or default from translations
  const displayPlaceholder = placeholder || t('peopleMap.selectCountries') || 'Select countries...';

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Filter countries based on search term
  const filteredCountries = AVAILABLE_COUNTRIES.filter(country =>
    country?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    country?.nameEn?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    country?.code?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Toggle country selection
  const toggleCountry = (countryCode) => {
    if (disabled) return;
    
    const newSelection = selectedCountries.includes(countryCode)
      ? selectedCountries.filter(c => c !== countryCode)
      : [...selectedCountries, countryCode];
    
    onChange(newSelection);
  };

  // Remove a specific country from selection
  const removeCountry = (countryCode, e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange(selectedCountries.filter(c => c !== countryCode));
  };

  // Clear all selections
  const clearAll = (e) => {
    e.stopPropagation();
    if (disabled) return;
    onChange([]);
  };

  // Select all countries
  const selectAll = () => {
    if (disabled) return;
    onChange(AVAILABLE_COUNTRIES.map(c => c.code));
  };

  // Get country name by code
  const getCountryName = (code) => {
    const country = AVAILABLE_COUNTRIES.find(c => c.code === code);
    return country ? country.name : code;
  };

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      {/* Main button/input area */}
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={`
          min-h-[38px] px-3 py-2 border rounded-lg cursor-pointer
          flex items-center flex-wrap gap-1
          ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white hover:border-primary-400'}
          ${isOpen ? 'border-primary-500 ring-2 ring-primary-200' : 'border-gray-300'}
        `}
      >
        {/* Selected countries as tags */}
        {selectedCountries.length > 0 ? (
          <>
            {selectedCountries.slice(0, 3).map(code => (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2 py-0.5 bg-primary-100 text-primary-700 rounded text-xs font-medium"
              >
                {getCountryName(code)}
                <button aria-label={t('common.remove')}
                  onClick={(e) => removeCountry(code, e)}
                  className="hover:text-primary-900"
                  disabled={disabled}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
            {selectedCountries.length > 3 && (
              <span className="text-xs text-gray-500">
                +{selectedCountries.length - 3} {t('common.all')?.toLowerCase() || 'more'}
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-400 text-sm flex items-center gap-2">
            <Globe size={14} />
            {displayPlaceholder}
          </span>
        )}
        
        {/* Clear and dropdown icons */}
        <div className="ml-auto flex items-center gap-1">
          {selectedCountries.length > 0 && !disabled && (
            <button aria-label={t('common.reset') || 'Clear all'}
              onClick={clearAll}
              className="p-1 hover:bg-gray-100 rounded"
              title={t('common.reset') || 'Clear all'}
            >
              <X size={14} className="text-gray-400" />
            </button>
          )}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </div>
      </div>

      {/* Dropdown menu */}
      {isOpen && !disabled && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-hidden">
          {/* Search input */}
          <div className="p-2 border-b">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={t('common.search') + '...' || 'Search...'}
              className="w-full px-3 py-1.5 text-sm border rounded focus:ring-2 focus:ring-primary-200 focus:border-primary-400"
              autoFocus
            />
          </div>

          {/* Quick actions */}
          <div className="px-2 py-1.5 border-b bg-gray-50 flex gap-2">
            <button
              onClick={selectAll}
              className="text-xs text-primary-600 hover:text-primary-800"
            >
              {t('common.all') || 'Select all'}
            </button>
            <span className="text-gray-300">|</span>
            <button
              onClick={(e) => clearAll(e)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {t('common.none') || 'Clear all'}
            </button>
          </div>

          {/* Country list */}
          <div className="overflow-y-auto max-h-48">
            {filteredCountries.length === 0 ? (
              <div className="px-3 py-4 text-center text-gray-500 text-sm">
                {t('common.noResults') || 'No country found'}
              </div>
            ) : (
              filteredCountries.map(country => {
                const isSelected = selectedCountries.includes(country.code);
                return (
                  <div
                    key={country.code}
                    onClick={() => toggleCountry(country.code)}
                    className={`
                      px-3 py-2 cursor-pointer flex items-center justify-between
                      ${isSelected ? 'bg-primary-50' : 'hover:bg-gray-50'}
                    `}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-700">
                        {country.name}
                      </span>
                      <span className="text-xs text-gray-400">
                        ({country.code})
                      </span>
                    </div>
                    {isSelected && (
                      <Check size={16} className="text-primary-600" />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CountryMultiSelect;
