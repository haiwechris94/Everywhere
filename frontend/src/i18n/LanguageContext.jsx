import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import translations from './translations'
import extraTranslations from './translationsExtra'

// Fusion profonde : translations.js garde la priorité, translationsExtra.js
// comble les clés manquantes (sinon l'écran affiche la clé brute).
const deepMerge = (base, over) => {
  const out = { ...base }
  for (const key of Object.keys(over || {})) {
    const a = out[key]
    const b = over[key]
    out[key] = a && b && typeof a === 'object' && typeof b === 'object' ? deepMerge(a, b) : b
  }
  return out
}
const MERGED = Object.fromEntries(
  Object.keys(translations).map((lang) => [lang, deepMerge(extraTranslations[lang] || {}, translations[lang])])
)

const LanguageContext = createContext(null)

// Supported languages
export const LANGUAGES = {
  EN: 'en',
  FR: 'fr',
}

export const LANGUAGE_NAMES = {
  en: 'English',
  fr: 'Français',
}

// Storage key for persisting language preference
const LANGUAGE_STORAGE_KEY = 'app_language'

export const useLanguage = () => {
  const context = useContext(LanguageContext)
  if (!context) {
    throw new Error('useLanguage must be used within a LanguageProvider')
  }
  return context
}

export const LanguageProvider = ({ children }) => {
  // Initialize language from localStorage or default to French
  const [language, setLanguageState] = useState(() => {
    const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    return savedLanguage && Object.values(LANGUAGES).includes(savedLanguage)
      ? savedLanguage
      : LANGUAGES.FR
  })

  // Get current translations based on selected language
  const currentTranslations = MERGED[language]

  // Function to change language
  const setLanguage = useCallback((newLanguage) => {
    if (Object.values(LANGUAGES).includes(newLanguage)) {
      setLanguageState(newLanguage)
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLanguage)
    }
  }, [])

  // Toggle between languages
  const toggleLanguage = useCallback(() => {
    const newLanguage = language === LANGUAGES.EN ? LANGUAGES.FR : LANGUAGES.EN
    setLanguage(newLanguage)
  }, [language, setLanguage])

  // Helper function to get nested translation by key path
  // This is the main translation function - aliased as 't' for convenience
  const translate = useCallback((keyPath, fallback = '') => {
    const keys = keyPath.split('.')
    let result = currentTranslations
    for (const key of keys) {
      if (result && typeof result === 'object' && key in result) {
        result = result[key]
      } else {
        return fallback || keyPath
      }
    }
    return result || fallback || keyPath
  }, [currentTranslations])

  // Alias translate as 't' for common i18n convention
  const t = translate

  // Persist language preference
  useEffect(() => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
  }, [language])

  // Keep <html lang> in sync so screen readers pronounce the UI in the right language
  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  const value = {
    language,
    setLanguage,
    toggleLanguage,
    t, // Translation function (alias for translate) - use t('key.path')
    translate, // Translation function - use translate('key.path')
    translations: currentTranslations, // Direct access to translation object if needed
    isEnglish: language === LANGUAGES.EN,
    isFrench: language === LANGUAGES.FR,
    languages: LANGUAGES,
    languageNames: LANGUAGE_NAMES,
  }

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export default LanguageContext
