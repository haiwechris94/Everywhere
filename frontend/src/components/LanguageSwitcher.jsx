import { useState, useRef, useEffect } from 'react'
import { Globe, ChevronDown, Check } from 'lucide-react'
import { useLanguage, LANGUAGES, LANGUAGE_NAMES } from '../i18n'

const LanguageSwitcher = ({ variant = 'dropdown', className = '' }) => {
  const { language, setLanguage, t } = useLanguage()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Toggle variant - simple button that switches between languages
  if (variant === 'toggle') {
    return (
      <button
        onClick={() => setLanguage(language === LANGUAGES.EN ? LANGUAGES.FR : LANGUAGES.EN)}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors ${className}`}
        title={t('language.select')}
      >
        <Globe size={18} className="text-gray-600 dark:text-slate-300" />
        <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
          {language.toUpperCase()}
        </span>
      </button>
    )
  }

  // Compact variant - just shows flag/code
  if (variant === 'compact') {
    return (
      <div className={`relative ${className}`} ref={dropdownRef}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1 px-2 py-1 rounded-md hover:bg-gray-100 transition-colors dark:hover:bg-slate-700"
          title={t('language.select')}
        >
          <Globe size={16} className="text-gray-600 dark:text-slate-300" />
          <span className="text-xs font-medium text-gray-700 uppercase dark:text-slate-300">{language}</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-1 w-28 bg-white rounded-lg shadow-lg py-1 z-50 animate-fade-in dark:bg-slate-800">
            {Object.entries(LANGUAGES).map(([key, code]) => (
              <button
                key={code}
                onClick={() => {
                  setLanguage(code)
                  setIsOpen(false)
                }}
                className={`w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${
                  language === code ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
                }`}
              >
                <span>{LANGUAGE_NAMES[code]}</span>
                {language === code && <Check size={14} />}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  // Default dropdown variant
  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200 dark:border-slate-700 dark:hover:bg-slate-700"
      >
        <Globe size={18} className="text-gray-600 dark:text-slate-300" />
        <span className="text-sm font-medium text-gray-700 dark:text-slate-300">
          {LANGUAGE_NAMES[language]}
        </span>
        <ChevronDown
          size={16}
          className={`text-gray-500 dark:text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white rounded-lg shadow-lg py-2 z-50 animate-fade-in dark:bg-slate-800">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 dark:text-slate-400 uppercase">
            {t('language.select')}
          </div>
          {Object.entries(LANGUAGES).map(([key, code]) => (
            <button
              key={code}
              onClick={() => {
                setLanguage(code)
                setIsOpen(false)
              }}
              className={`w-full flex items-center justify-between px-4 py-2 text-sm hover:bg-gray-50 ${
                language === code ? 'text-primary-600 bg-primary-50' : 'text-gray-700'
              }`}
            >
              <span>{LANGUAGE_NAMES[code]}</span>
              {language === code && <Check size={16} className="text-primary-600 dark:text-primary-300" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default LanguageSwitcher
