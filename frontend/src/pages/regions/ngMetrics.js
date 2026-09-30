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
    // ── Primary cards (shown by default) ──────────────────────────────────────
    // Total engagements = count of DMM engagements (churches.engagements /
    // dmmFieldMetrics.engagements). It was wrongly reading discoveryGroups.total.
    { label: '# of engagements', row: 1, accent: 'blue', primary: true, value: m.churches?.engagements ?? m.dmmFieldMetrics?.engagements ?? 0 },
    { label: '# of churches', row: 1, accent: 'blue', primary: true, value: m.churches?.total ?? 0 },
    { label: 'Max Gen Reached', row: 1, accent: 'blue', primary: true, value: maxGeneration(m) },
    { label: 'Total believers', row: 2, accent: 'green', primary: true, value: m.disciples?.newDisciples ?? 0 },
    // ── Secondary cards (revealed via « View more metrics ») ──────────────────
    { label: '# of commissioned', row: 1, accent: 'blue', value: m.churches?.commissioned ?? 0 },
    { label: '# of catalytic', row: 1, accent: 'blue', value: m.churches?.catalytic ?? 0 },
    { label: '# of discovery groups', row: 1, accent: 'blue', value: m.discoveryGroups?.total ?? 0 },
    { label: '# of active groups', row: 1, accent: 'blue', value: m.discoveryGroups?.active ?? 0 },
    { label: '# of persons of peace', row: 2, accent: 'green', value: m.personsOfPeace?.total ?? 0 },
    { label: '# of baptized', row: 2, accent: 'green', value: m.disciples?.baptized ?? 0 },
    { label: '# of leaders in training', row: 2, accent: 'green', value: m.leaders?.inTraining ?? 0 },
    { label: '# of active coaches', row: 2, accent: 'green', value: m.leaders?.activeCoaches ?? 0 },
  ]
}
