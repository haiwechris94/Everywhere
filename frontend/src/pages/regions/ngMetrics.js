/**
 * Shared, null-safe mapping from a numerical DMM report (<NUMREPORT> from
 * /api/reporting) to the flat metric cards used across the NG funnel pages
 * (region and country levels). Keeps RegionCountries and CountryPeoples
 * consistent.
 */

/**
 * Highest numeric generation level reached, or 0.
 * Prefer the backend-computed churches.maxGeneration (a $max over all
 * engagements' churchGeneration). Fall back to the byGeneration histogram keys
 * only when maxGeneration is absent. This is why the value looked "frozen":
 * byGeneration is empty for imported field data, so we must read maxGeneration.
 */
export const maxGeneration = (metrics) => {
  const direct = metrics?.churches?.maxGeneration
  if (typeof direct === 'number' && direct > 0) return direct
  const byGen = metrics?.churches?.byGeneration || {}
  const keys = Object.keys(byGen)
    .map((k) => parseInt(k, 10))
    .filter((n) => !Number.isNaN(n))
  return keys.length ? Math.max(...keys) : (direct || 0)
}

/**
 * Build the ordered list of { label, value } stat cards for a metrics object.
 * Every value is coerced to a number (?? 0) so a region/country with no data
 * renders zeros instead of blanks.
 */
export const metricCards = (metrics) => {
  const m = metrics || {}
  return [
    // Total engagements = count of DMM engagements (churches.engagements /
    // dmmFieldMetrics.engagements). It was wrongly reading discoveryGroups.total.
    { label: 'Engagements', value: m.churches?.engagements ?? m.dmmFieldMetrics?.engagements ?? 0 },
    { label: 'Churches', value: m.churches?.total ?? 0 },
    { label: 'Max Generation', value: maxGeneration(m) },
    { label: 'Commissioned', value: m.churches?.commissioned ?? 0 },
    { label: 'Catalytic', value: m.churches?.catalytic ?? 0 },
    { label: 'New Believers', value: m.disciples?.newDisciples ?? 0 },
    { label: 'Baptized', value: m.disciples?.baptized ?? 0 },
    { label: 'Discovery Groups', value: m.discoveryGroups?.total ?? 0 },
    { label: 'Active Groups', value: m.discoveryGroups?.active ?? 0 },
    { label: 'Persons of Peace', value: m.personsOfPeace?.total ?? 0 },
    { label: 'Leaders in Training', value: m.leaders?.inTraining ?? 0 },
    { label: 'Active Coaches', value: m.leaders?.activeCoaches ?? 0 },
  ]
}
