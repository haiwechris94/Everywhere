// Helper to resolve the user-facing DISPLAY label for an initiative.
//
// IMPORTANT: this only changes the DISPLAYED label. The internal key /
// identifier ('YCS', 'ESP300', …) used in code logic, API calls, THEME maps,
// routes, membership objects and the backend model stays untouched.
//
// Currently only 'YCS' has a localized display name:
//   - English: "Yearly Celebration and Strengthening (YCS)"
//   - French:  "Célébration Annuel et Renforcement (CAR)"
// Any other initiative is returned unchanged (ESP300, etc.).

/**
 * Returns the localized display label for an initiative.
 *
 * @param {string} nameOrKey - the initiative name or key (e.g. 'YCS', 'ESP 300').
 * @param {object} lang - the object from useLanguage(), providing { t, isFrench }.
 * @param {string} [original] - optional explicit original label to fall back to.
 * @returns {string} the localized display label, or the original name.
 */
export function initiativeDisplayName(nameOrKey, lang, original) {
  const value = String(nameOrKey ?? '').trim()
  const fallback = original != null ? original : nameOrKey
  // Match the YCS key or name case-insensitively.
  if (value.toUpperCase() === 'YCS') {
    const t = lang?.t
    if (typeof t === 'function') {
      return t(
        'initiatives.ycsName',
        lang?.isFrench
          ? 'Célébration Annuel et Renforcement (CAR)'
          : 'Yearly Celebration and Strengthening (YCS)'
      )
    }
    return lang?.isFrench
      ? 'Célébration Annuel et Renforcement (CAR)'
      : 'Yearly Celebration and Strengthening (YCS)'
  }
  return fallback
}

export default initiativeDisplayName
