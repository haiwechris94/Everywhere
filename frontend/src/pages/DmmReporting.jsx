import React, { useMemo, useState, useRef, useEffect } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
  BarChart, Bar, PieChart, Pie, Cell,
} from 'recharts'
import html2canvas from 'html2canvas'
import toast from 'react-hot-toast'
import { Loader2, Download, BarChart3, FileDown, TrendingUp, ImageDown, ArrowUpRight, ArrowDownRight, Minus, ChevronDown, ChevronRight, Users } from 'lucide-react'
import { reportingApi } from '../services/api'
import { StatusBadge } from './geography/geoComponents'
import { useLanguage } from '../i18n'

// Formatage des nombres identique à la section « Peuples » des fiches Pays
// (ex. 45000 -> 45 000).
const peoplesFmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

// Source de référence (non-DMM) pour le statut d'un peuple, ex. JP / IMB / FTT.
// Reprend exactement la logique de la section « Peuples » de CountryPeoples.
const peoplesReferenceSource = (sourceTypes = []) => {
  const preferred = sourceTypes.find((s) => s && s.toUpperCase() !== 'DMM')
  return (preferred || sourceTypes[0] || '').toUpperCase() || null
}

const now = new Date()
const CURRENT_YEAR = now.getUTCFullYear()
const CURRENT_QUARTER = Math.floor(now.getUTCMonth() / 3) + 1

// ── NG Areas & countries ──────────────────────────────────────────────────────
const NG_AREAS = [
  {
    id: 'FCA',
    labelEn: 'Francophone Central Africa (FCA)',
    labelFr: 'Afrique Centrale Francophone (FCA)',
    color: '#6366f1',
    countries: [
      { id: 'CM', en: 'Cameroon',          fr: 'Cameroun' },
      { id: 'TD', en: 'Chad',              fr: 'Tchad' },
      { id: 'CG', en: 'Congo',             fr: 'Congo' },
      { id: 'CD', en: 'DRC',               fr: 'RDC' },
      { id: 'GA', en: 'Gabon',             fr: 'Gabon' },
      { id: 'CF', en: 'CAR',               fr: 'RCA' },
      { id: 'GQ', en: 'Equatorial Guinea', fr: 'Guinée Équatoriale' },
      { id: 'UG', en: 'Uganda',            fr: 'Ouganda' },
    ],
  },
  {
    id: 'AWA',
    labelEn: 'Anglophone West Africa (AWA)',
    labelFr: "Afrique de l'Ouest Anglophone (AWA)",
    color: '#10b981',
    countries: [
      { id: 'SL', en: 'Sierra Leone',  fr: 'Sierra Leone' },
      { id: 'GH', en: 'Ghana',         fr: 'Ghana' },
      { id: 'LR', en: 'Liberia',       fr: 'Libéria' },
      { id: 'GM', en: 'Gambia',        fr: 'Gambie' },
      { id: 'NG', en: 'Nigeria',       fr: 'Nigeria' },
      { id: 'GW', en: 'Guinea-Bissau', fr: 'Guinée Bissau' },
      { id: 'GN', en: 'Guinea',        fr: 'Guinée' },
    ],
  },
  {
    id: 'FWA',
    labelEn: 'Francophone West Africa (FWA)',
    labelFr: "Afrique de l'Ouest Francophone (FWA)",
    color: '#f59e0b',
    countries: [
      { id: 'CI', en: "Côte d'Ivoire", fr: "Côte d'Ivoire" },
      { id: 'BJ', en: 'Benin',         fr: 'Bénin' },
      { id: 'TG', en: 'Togo',          fr: 'Togo' },
      { id: 'NE', en: 'Niger',         fr: 'Niger' },
      { id: 'ML', en: 'Mali',          fr: 'Mali' },
      { id: 'BF', en: 'Burkina Faso',  fr: 'Burkina Faso' },
      { id: 'SN', en: 'Senegal',       fr: 'Sénégal' },
      { id: 'GN', en: 'Guinea',        fr: 'Guinée' },
    ],
  },
]

// ── Aggregation ───────────────────────────────────────────────────────────────
function aggregateReports(reports) {
  if (!reports || reports.length === 0) return null
  if (reports.length === 1) return reports[0]

  const sum = (key, sub) =>
    reports.reduce((acc, r) => acc + (sub ? (r?.[key]?.[sub] ?? 0) : (r?.[key] ?? 0)), 0)
  const max = (key, sub) =>
    Math.max(...reports.map((r) => (sub ? (r?.[key]?.[sub] ?? 0) : (r?.[key] ?? 0))))

  const byGeneration = {}
  ;['1', '2', '3', '4plus'].forEach((k) => {
    byGeneration[k] = reports.reduce((acc, r) => acc + (r?.churches?.byGeneration?.[k] ?? 0), 0)
  })

  const byStatus = {}
  ;['identified', 'engaging', 'confirmed', 'leading', 'inactive'].forEach((k) => {
    byStatus[k] = Math.max(...reports.map((r) => r?.personsOfPeace?.byStatus?.[k] ?? 0))
  })

  return {
    period: { from: reports[0]?.period?.from, to: reports[reports.length - 1]?.period?.to },
    disciples: {
      newDisciples: sum('disciples', 'newDisciples'),
      baptized: sum('disciples', 'baptized'),
    },
    discoveryGroups: {
      total: max('discoveryGroups', 'total'),
      active: max('discoveryGroups', 'active'),
      becameChurch: sum('discoveryGroups', 'becameChurch'),
    },
    churches: {
      total: max('churches', 'total'),
      commissioned: max('churches', 'commissioned'),
      catalytic: max('churches', 'catalytic'),
      // Preserve the engagement count and the highest generation across reports
      // so the region/Data Reporting cards keep working after aggregation.
      engagements: sum('churches', 'engagements'),
      maxGeneration: max('churches', 'maxGeneration'),
      byGeneration,
      mergedOrDied: { merged: 0, died: 0 },
    },
    dmmFieldMetrics: {
      engagements: sum('dmmFieldMetrics', 'engagements'),
      maxGeneration: max('dmmFieldMetrics', 'maxGeneration'),
    },
    leaders: {
      inTraining: max('leaders', 'inTraining'),
      activeCoaches: max('leaders', 'activeCoaches'),
      newLeadersDeployed: sum('leaders', 'newLeadersDeployed'),
    },
    personsOfPeace: {
      total: Math.max(...reports.map((r) => r?.personsOfPeace?.total ?? 0)),
      byStatus,
    },
    _churchesMergedOrDied: {
      merged: reports.reduce((acc, r) => acc + (r?.churches?.mergedOrDied?.merged ?? 0), 0),
      died: reports.reduce((acc, r) => acc + (r?.churches?.mergedOrDied?.died ?? 0), 0),
    },
  }
}

function finalizeReport(r) {
  if (!r) return r
  if (r._churchesMergedOrDied) {
    r.churches.mergedOrDied = r._churchesMergedOrDied
    delete r._churchesMergedOrDied
  }
  return r
}

// Extract a single metric value from a raw report object
function metricValue(r, metricKey) {
  switch (metricKey) {
    case 'disciples': return r?.disciples?.newDisciples ?? 0
    case 'baptized':  return r?.disciples?.baptized ?? 0
    case 'churches':  return r?.churches?.total ?? 0
    case 'dbsActive': return r?.discoveryGroups?.active ?? 0
    default:          return 0
  }
}

const METRICS = [
  { key: 'disciples', color: '#10b981', labelFr: 'Nouveaux disciples', labelEn: 'New disciples' },
  { key: 'baptized',  color: '#3b82f6', labelFr: 'Baptisés',           labelEn: 'Baptized' },
  { key: 'churches',  color: '#6366f1', labelFr: 'Églises actives',    labelEn: 'Active churches' },
  { key: 'dbsActive', color: '#f59e0b', labelFr: 'Groupes DBS actifs', labelEn: 'Active DBS groups' },
]

// ── Growth indicator ──────────────────────────────────────────────────────────
/**
 * GrowthCard — shows % change between first & last period for one metric.
 */
function GrowthCard({ label, first, last, isFrench }) {
  const delta = last - first
  const pct = first === 0 ? (last > 0 ? 100 : 0) : (delta / first) * 100
  const up = delta > 0
  const flat = delta === 0
  const color = flat ? 'text-gray-500' : up ? 'text-emerald-600' : 'text-red-600'
  const Icon = flat ? Minus : up ? ArrowUpRight : ArrowDownRight

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <div className={`mt-1 flex items-center gap-1 text-2xl font-bold ${color}`}>
        <Icon size={20} />
        {first === 0 && last > 0 ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`}
      </div>
      <p className="mt-0.5 text-xs text-gray-400">
        {first} → {last}
      </p>
    </div>
  )
}

// ── Trend chart ───────────────────────────────────────────────────────────────
/**
 * TrendChart — shown only when pairs.length > 1.
 * Two modes:
 *   - "metric": one line per metric (aggregated across areas), the default.
 *   - "area":   one line per selected NG area, for a single chosen metric.
 */
function TrendChart({ chartRef, metricData, areaData, areas, isFrench, onExport, exporting }) {
  const hasAreaComparison = areas.length > 1
  const [mode, setMode] = useState('metric')
  const [activeMetrics, setActiveMetrics] = useState(['disciples', 'churches'])
  const [areaMetric, setAreaMetric] = useState('disciples')

  const toggleMetric = (key) => {
    setActiveMetrics((prev) =>
      prev.includes(key)
        ? prev.length > 1 ? prev.filter((k) => k !== key) : prev
        : [...prev, key]
    )
  }

  const effectiveMode = hasAreaComparison ? mode : 'metric'
  const data = effectiveMode === 'area' ? areaData : metricData

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-600">
          <TrendingUp size={15} className="text-indigo-500" />
          {isFrench ? 'Tendance par période' : 'Trend by period'}
        </h2>

        <div className="flex flex-wrap items-center gap-2">
          {/* Mode switch (only when >1 area selected) */}
          {hasAreaComparison && (
            <div className="flex overflow-hidden rounded-lg border border-gray-200 text-xs">
              <button
                onClick={() => setMode('metric')}
                className={`px-2.5 py-1 font-medium ${effectiveMode === 'metric' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {isFrench ? 'Par métrique' : 'By metric'}
              </button>
              <button
                onClick={() => setMode('area')}
                className={`px-2.5 py-1 font-medium ${effectiveMode === 'area' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
              >
                {isFrench ? 'Par zone' : 'By area'}
              </button>
            </div>
          )}

          {/* Export button */}
          <button
            onClick={onExport}
            disabled={exporting}
            title={isFrench ? 'Exporter en image PNG' : 'Export as PNG image'}
            className="flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1 text-xs font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <ImageDown size={14} />}
            {isFrench ? 'Image' : 'Image'}
          </button>
        </div>
      </div>

      {/* Controls row */}
      <div className="mb-3 flex flex-wrap gap-2">
        {effectiveMode === 'metric'
          ? METRICS.map((m) => (
              <button
                key={m.key}
                onClick={() => toggleMetric(m.key)}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity ${activeMetrics.includes(m.key) ? 'opacity-100' : 'opacity-35'}`}
                style={{ background: m.color + '22', color: m.color, border: `1px solid ${m.color}55` }}
              >
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: m.color }} />
                {isFrench ? m.labelFr : m.labelEn}
              </button>
            ))
          : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">{isFrench ? 'Métrique :' : 'Metric:'}</span>
              <select
                value={areaMetric}
                onChange={(e) => setAreaMetric(e.target.value)}
                className="rounded border border-gray-300 px-2 py-1 text-xs"
              >
                {METRICS.map((m) => (
                  <option key={m.key} value={m.key}>{isFrench ? m.labelFr : m.labelEn}</option>
                ))}
              </select>
            </div>
          )}
      </div>

      {/* Chart (wrapped in ref target for export) */}
      <div ref={chartRef} className="bg-white p-2">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={{ stroke: '#e5e7eb' }} />
            <YAxis tick={{ fontSize: 11, fill: '#6b7280' }} tickLine={false} axisLine={false} width={36} />
            <Tooltip
              contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              formatter={(value, name) => {
                if (effectiveMode === 'metric') {
                  const m = METRICS.find((x) => x.key === name)
                  return [value, isFrench ? m?.labelFr : m?.labelEn]
                }
                const area = areas.find((a) => a.id === name)
                return [value, isFrench ? area?.labelFr : area?.labelEn]
              }}
            />
            <Legend
              formatter={(value) => {
                if (effectiveMode === 'metric') {
                  const m = METRICS.find((x) => x.key === value)
                  return <span style={{ fontSize: 11, color: '#6b7280' }}>{isFrench ? m?.labelFr : m?.labelEn}</span>
                }
                const area = areas.find((a) => a.id === value)
                return <span style={{ fontSize: 11, color: '#6b7280' }}>{isFrench ? area?.labelFr : area?.labelEn}</span>
              }}
            />
            {effectiveMode === 'metric'
              ? METRICS.filter((m) => activeMetrics.includes(m.key)).map((m) => (
                  <Line key={m.key} type="monotone" dataKey={m.key} stroke={m.color} strokeWidth={2} dot={{ r: 4, fill: m.color, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                ))
              : areas.map((a) => (
                  <Line key={a.id} type="monotone" dataKey={`${a.id}_${areaMetric}`} name={a.id} stroke={a.color} strokeWidth={2} dot={{ r: 4, fill: a.color, strokeWidth: 0 }} activeDot={{ r: 6 }} />
                ))}
          </LineChart>
        </ResponsiveContainer>
        {effectiveMode === 'area' && (
          <p className="mt-1 px-2 text-center text-xs text-gray-400">
            {isFrench ? 'Comparaison : ' : 'Comparing: '}
            {METRICS.find((m) => m.key === areaMetric) && (isFrench ? METRICS.find((m) => m.key === areaMetric).labelFr : METRICS.find((m) => m.key === areaMetric).labelEn)}
          </p>
        )}
      </div>
    </div>
  )
}

// ── MultiSelect ───────────────────────────────────────────────────────────────
function MultiSelect({ label, options, selected, onChange, allLabel }) {
  const [open, setOpen] = useState(false)
  const allSelected = selected.length === options.length && options.length > 0

  const toggle = (id) => {
    if (selected.includes(id)) onChange(selected.filter((s) => s !== id))
    else onChange([...selected, id])
  }
  const toggleAll = () => {
    if (allSelected) onChange([])
    else onChange(options.map((o) => o.id))
  }

  const displayLabel =
    options.length === 0
      ? label
      : selected.length === 0
      ? label
      : allSelected
      ? allLabel
      : selected.length === 1
      ? options.find((o) => o.id === selected[0])?.label ?? label
      : `${selected.length} sélectionnés`

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex min-w-[140px] items-center justify-between gap-1 rounded border border-gray-300 bg-white px-2 py-1.5 text-sm shadow-sm hover:border-indigo-400 focus:outline-none"
      >
        <span className="max-w-[160px] truncate">{displayLabel}</span>
        <svg className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-20 mt-1 max-h-60 min-w-[180px] overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
            <label className="flex cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 text-xs font-semibold text-indigo-600 hover:bg-indigo-50">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-indigo-600" />
              {allLabel}
            </label>
            {options.map((opt) => (
              <label key={opt.id} className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-gray-50">
                <input type="checkbox" checked={selected.includes(opt.id)} onChange={() => toggle(opt.id)} className="accent-indigo-600" />
                {opt.label}
              </label>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ── Stat & Section ────────────────────────────────────────────────────────────
function Stat({ label, value, accent = 'text-gray-900' }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${accent}`}>{value ?? 0}</p>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-600">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>
    </div>
  )
}

// ── CSV helpers ───────────────────────────────────────────────────────────────
// Escape a single CSV cell (values may contain commas, quotes, accents)
function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v)
  return `"${s.replace(/"/g, '""')}"`
}

// Turn an array of row-arrays into a CSV string
function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

// Extract the standard rubric list from a report object (label + value)
function reportRubrics(r) {
  return [
    ['Nouveaux disciples', r?.disciples?.newDisciples ?? 0],
    ['Nouveaux baptisés', r?.disciples?.baptized ?? 0],
    ['Groupes DBS (total)', r?.discoveryGroups?.total ?? 0],
    ['Groupes DBS actifs', r?.discoveryGroups?.active ?? 0],
    ['Groupes devenus églises', r?.discoveryGroups?.becameChurch ?? 0],
    ['Églises (total actives)', r?.churches?.total ?? 0],
    ['Églises commissionnées', r?.churches?.commissioned ?? 0],
    ['Églises catalytiques', r?.churches?.catalytic ?? 0],
    ['Églises 1G', r?.churches?.byGeneration?.['1'] ?? 0],
    ['Églises 2G', r?.churches?.byGeneration?.['2'] ?? 0],
    ['Églises 3G', r?.churches?.byGeneration?.['3'] ?? 0],
    ['Églises 4G+', r?.churches?.byGeneration?.['4plus'] ?? 0],
    ['Églises fusionnées', r?.churches?.mergedOrDied?.merged ?? 0],
    ['Églises disparues', r?.churches?.mergedOrDied?.died ?? 0],
    ['Leaders en formation', r?.leaders?.inTraining ?? 0],
    ['Coachs actifs', r?.leaders?.activeCoaches ?? 0],
    ['Nouveaux leaders déployés', r?.leaders?.newLeadersDeployed ?? 0],
    ['Personnes de paix (total)', r?.personsOfPeace?.total ?? 0],
  ]
}

/**
 * Simple single-report CSV (fallback for a single period, no area comparison).
 */
function toCsv(r) {
  if (!r) return ''
  const rows = [
    ['Rubrique', 'Valeur'],
    ['Période', `${r.period?.from || ''} → ${r.period?.to || ''}`],
    ...reportRubrics(r),
  ]
  return rowsToCsv(rows)
}

/**
 * Rich CSV export reflecting the current selection.
 *
 * @param {object} ctx
 * @param {object}   ctx.report       - aggregated total report
 * @param {object[]} ctx.periodReports - [{ label, report }] one per period (aggregated across areas)
 * @param {object[]} ctx.areaReports   - [{ areaLabel, label, report }] one per (area × period), or [] if not comparing
 * @param {object[]} ctx.selectedAreas - [{ id, labelFr }]
 * @param {boolean}  ctx.isFrench
 */
function buildRichCsv({ report, periodReports = [], areaReports = [], selectedAreas = [], selectedPeopleLabels = [], isFrench = true }) {
  const sections = []

  const multiPeriod = periodReports.length > 1
  const multiArea = selectedAreas.length > 1

  // ── Section 0: NG (DMM) peoples selection (header) ──
  // When the user has narrowed the report to specific NG peoples, list them so the
  // exported file states exactly which peoples the figures below correspond to.
  if (selectedPeopleLabels.length > 0) {
    const peopleSection = [
      [isFrench ? '# Peuples NG (DMM) sélectionnés' : '# Selected NG (DMM) people groups'],
      [isFrench ? 'Peuple' : 'People group'],
      ...selectedPeopleLabels.map((lbl) => [lbl]),
      [`${isFrench ? 'Total peuples sélectionnés' : 'Total selected people groups'} : ${selectedPeopleLabels.length}`],
    ]
    sections.push(rowsToCsv(peopleSection))
  }

  // ── Section A: rubrics × periods (one column per period + Total) ──
  if (multiPeriod) {
    const rubricLabels = reportRubrics(report).map((row) => row[0])
    const header = ['Rubrique', ...periodReports.map((p) => p.label), 'Total']
    const bodyRows = rubricLabels.map((label, idx) => {
      const cells = periodReports.map((p) => reportRubrics(p.report)[idx][1])
      const total = reportRubrics(report)[idx][1]
      return [label, ...cells, total]
    })
    sections.push(rowsToCsv([['# Données par période'], header, ...bodyRows]))
  } else {
    // single period → simple rubric/value table
    const header = ['Rubrique', 'Valeur']
    const bodyRows = reportRubrics(report)
    sections.push(rowsToCsv([['# Rapport consolidé'], header, ...bodyRows]))
  }

  // ── Section B: area comparison (one column per area, per period) ──
  if (multiArea && areaReports.length > 0) {
    // Group areaReports by period label; columns = one per area
    const periodLabels = [...new Set(areaReports.map((a) => a.label))]
    const areaLabels = selectedAreas.map((a) => (isFrench ? a.labelFr : a.labelEn))
    const rubricLabels = reportRubrics(report).map((row) => row[0])

    const areaSection = []
    areaSection.push(['# Comparaison par zone'])

    periodLabels.forEach((periodLabel) => {
      areaSection.push([]) // blank spacer row
      areaSection.push([`Période : ${periodLabel}`])
      areaSection.push(['Rubrique', ...areaLabels])
      rubricLabels.forEach((rl, idx) => {
        const cells = selectedAreas.map((area) => {
          const match = areaReports.find(
            (a) => a.label === periodLabel && a.areaId === area.id
          )
          return match ? reportRubrics(match.report)[idx][1] : 0
        })
        areaSection.push([rl, ...cells])
      })
    })
    sections.push(rowsToCsv(areaSection))
  }

  // Join sections with a blank line between them
  return sections.join('\n\n')
}

// NG engagement quarterly matrix, canonical 20-column model matching the CMR
// Import Template Excel model. Each entry has key, fr, en header labels. First
// block is identity/structure; rest are the quarter metrics the user fills in.
// Re-import key is NG_Engagment_Name plus People_Group plus Country.
const QUARTER_COLUMNS = [
  // Identity / structure block.
  { key: 'date',              fr: 'Date',                          en: 'Date' },
  { key: 'reportPeriod',      fr: 'Periode (ex 2Q26)',             en: 'Report period' },
  { key: 'region',            fr: 'Region',                        en: 'Region' },
  { key: 'country',           fr: 'Pays',                          en: 'Country' },
  { key: 'ngEngagementName',  fr: "Nom d'engagement NG",            en: 'NG_Engagment_Name' },
  { key: 'peopleGroup',       fr: 'Groupe de peuple',              en: 'People_Group' },
  // Quarter metrics
  { key: 'dbs',               fr: 'DBS',                           en: 'DBS' },
  { key: 'com',               fr: 'COM (Commissionnees)',          en: 'COM' },
  { key: 'cat',               fr: 'CAT (Catalytiques)',            en: 'CAT' },
  { key: 'total',             fr: 'TOTAL (eglises)',               en: 'TOTAL' },
  { key: 'maxGen',            fr: 'Max GEN (generation max)',      en: 'Max GEN' },
  { key: 'avgChurchSize',     fr: 'Taille moyenne eglise',         en: 'Avg church size' },
  { key: 'newDisciples',      fr: 'Nouveaux disciples',            en: '# New Disciples' },
  { key: 'newBaptisms',       fr: 'Nouveaux baptises',             en: '# New Baptisms' },
  { key: 'leadersInTraining', fr: 'Leaders en formation',          en: 'LEADERS IN TRAINING' },
  { key: 'activeCoaches',     fr: 'Coachs/formateurs actifs',      en: 'ACTIVE TRAINERS/COACHES' },
  { key: 'trainingsHeld',     fr: 'Formations tenues ce trimestre', en: '# OF TRAININGS HELD IN QUARTER' },
  { key: 'lostChurches',      fr: 'Eglises perdues',               en: 'LOST CHS' },
  { key: 'mergedChurches',    fr: 'Eglises fusionnees',            en: 'MERGED CHS' },
  { key: 'notes',             fr: 'Notes',                         en: 'NOTES' },
]

// Compose an engagement display name from the people and village so a row is
// unambiguous when the same people is engaged in several villages. Falls back to
// just the people name when no village is known, and to just the village when
// the people name is missing. Used on-screen and in the import and export
// templates for the NG_Engagment_Name value.
function peopleVillageName(peopleName, villageName) {
  const p = (peopleName || '').trim()
  const v = (villageName || '').trim()
  if (p && v) return `${p}, ${v}`
  return p || v || ''
}

// Build the 2Q26 style period label from a year and quarter pair.
function reportPeriodLabel(year, quarter) {
  if (year === undefined || year === null || quarter === undefined || quarter === null) return ''
  return `${quarter}Q${String(year).slice(-2)}`
}

// Map a peoples alpha-3 primaryCountryCode to a human-readable country name via
// NG_AREAS (which stores alpha-2 codes). Falls back to the raw code when the
// alpha-3 to alpha-2 mapping is unavailable.
const ALPHA3_TO_ALPHA2 = {
  CMR: 'CM', TCD: 'TD', COG: 'CG', COD: 'CD', GAB: 'GA', CAF: 'CF', GNQ: 'GQ',
  UGA: 'UG', SLE: 'SL', GHA: 'GH', LBR: 'LR', GMB: 'GM', NGA: 'NG', GNB: 'GW',
  GIN: 'GN', CIV: 'CI', BEN: 'BJ', TGO: 'TG', NER: 'NE', MLI: 'ML', BFA: 'BF',
  SEN: 'SN',
}
function countryLabelFromCode(code, isFrench) {
  if (!code) return ''
  const alpha2 = code.length === 3 ? (ALPHA3_TO_ALPHA2[code.toUpperCase()] || null) : code.toUpperCase()
  if (alpha2) {
    for (const area of NG_AREAS) {
      const match = area.countries.find((c) => c.id === alpha2)
      if (match) return isFrench ? match.fr : match.en
    }
  }
  return code
}

// Flatten the current peoples selection into one row per (people x village) engagement.
// Returns people and engagement entries, preserving the API order.
function engagementsFromPeoples(peoplesRows = []) {
  const out = []
  peoplesRows.forEach((p) => {
    const engagements = p?.dmm?.engagements || []
    engagements.forEach((eng) => out.push({ people: p, engagement: eng }))
  })
  return out
}

// Header row for the NG engagement matrix.
function quarterHeaderRow(isFrench) {
  return QUARTER_COLUMNS.map((c) => (isFrench ? c.fr : c.en))
}

/**
 * Blank quarterly IMPORT template, one row per NG engagement (20-column model).
 * Identity/structure columns are pre-filled from the current selection, Date
 * left blank; quarterly metric columns stay blank for the user to fill in.
 * The user downloads, fills, and re-imports per country. Re-import key is
 * NG_Engagment_Name + People_Group + Country.
 */
function templateCsv(peoplesRows = [], primaryPair = {}, isFrench = true) {
  const period = reportPeriodLabel(primaryPair.year, primaryPair.quarter)
  const entries = engagementsFromPeoples(peoplesRows)

  // Re-import key is NG_Engagment_Name + People_Group + Country.
  const comment = [
    isFrench
      ? '# Modele import trimestriel - 1 ligne par engagement NG. Cle de re-import: NG_Engagment_Name + People_Group + Pays.'
      : '# Quarterly import template - one row per NG engagement. Re-import key: NG_Engagment_Name + People_Group + Country.',
  ]
  const header = quarterHeaderRow(isFrench)
  const rows = [comment, header]

  if (entries.length === 0) {
    // No engagement in the selection: header plus one commented example row.
    const example = QUARTER_COLUMNS.map((c) => {
      if (c.key === 'ngEngagementName') return isFrench ? '# ex: Bakola, Lolodorf' : '# eg Bakola, Lolodorf'
      if (c.key === 'peopleGroup') return isFrench ? 'ex: Bakola' : 'eg Bakola'
      if (c.key === 'reportPeriod') return period
      return ''
    })
    rows.push(example)
    return rowsToCsv(rows)
  }

  entries.forEach(({ people, engagement }) => {
    const country = countryLabelFromCode(people?.primaryCountryCode, isFrench)
    const row = QUARTER_COLUMNS.map((c) => {
      switch (c.key) {
        case 'date':             return '' // left blank
        case 'reportPeriod':     return period
        case 'region':           return engagement.region || ''
        case 'country':          return country
        case 'ngEngagementName': return peopleVillageName(engagement.name || people?.canonicalName, engagement.villageName)
        case 'peopleGroup':      return people?.canonicalName || engagement.name || ''
        default:                 return '' // all quarterly metrics blank in the template
      }
    })
    rows.push(row)
  })

  return rowsToCsv(rows)
}

/**
 * Rich CSV export, one row per NG engagement (20-column model), same columns as
 * the import template, but pre-filled with known DB values.
 * total from engagement numberOfChurches; newDisciples from people-level window
 * newDisciples (first row only); newBaptisms from people-level window baptisms
 * (first row only). Other metric columns stay blank.
 *
 * Per-people window figures go on the FIRST engagement row of each people, 0 on
 * the rest so they are not double counted.
 */
function buildPeopleVillageCsv(peoplesRows = [], primaryPair = {}, isFrench = true) {
  const period = reportPeriodLabel(primaryPair.year, primaryPair.quarter)
  const entries = engagementsFromPeoples(peoplesRows)

  // Re-import key is NG_Engagment_Name + People_Group + Country.
  const comment = [
    isFrench
      ? '# Export DMM - 1 ligne par engagement NG. Cle de re-import: NG_Engagment_Name + People_Group + Pays. Nouveaux disciples/baptises sont au niveau du peuple (places sur la 1re ligne, 0 sur les suivantes).'
      : '# DMM export - one row per NG engagement. Re-import key: NG_Engagment_Name + People_Group + Country. New disciples/baptisms are people-level (placed on the first row, 0 on the following rows).',
  ]
  const header = quarterHeaderRow(isFrench)
  const rows = [comment, header]

  // Track which people already received their people-level window figures.
  const windowUsed = new Set()

  entries.forEach(({ people, engagement }) => {
    const country = countryLabelFromCode(people?.primaryCountryCode, isFrench)
    const win = people?.dmm?.window || {}
    const pid = people?.masterPeopleId
    const firstOfPeople = !windowUsed.has(pid)
    if (firstOfPeople) windowUsed.add(pid)

    const row = QUARTER_COLUMNS.map((c) => {
      switch (c.key) {
        case 'date':             return '' // left blank
        case 'reportPeriod':     return period
        case 'region':           return engagement.region || ''
        case 'country':          return country
        case 'ngEngagementName': return peopleVillageName(engagement.name || people?.canonicalName, engagement.villageName)
        case 'peopleGroup':      return people?.canonicalName || engagement.name || ''
        case 'total':            return engagement.numberOfChurches ?? 0
        case 'newDisciples':     return firstOfPeople ? (win.newDisciples ?? 0) : 0
        case 'newBaptisms':      return firstOfPeople ? (win.baptisms ?? 0) : 0
        default:                 return '' // metrics we don't have a clean mapping for
      }
    })
    rows.push(row)
  })

  if (entries.length === 0) {
    rows.push(QUARTER_COLUMNS.map((c) => (c.key === 'reportPeriod' ? period : '')))
  }

  return rowsToCsv(rows)
}

// ── Main component ────────────────────────────────────────────────────────────
// ── Analyses graphiques riches (comparaisons, taux, tendances, mesures) ──────
// Alimentée par `periodReports` (séries trimestrielles, chaque entrée =
// { label, report }) et `peoplesRows` (engagements DMM de la sélection, chaque
// entrée = { canonicalName, dmm:{ engagementCount, totalChurches, maxGeneration },
// status:{ global } }). Tolère des données vides sans planter.
const RA_COLORS = ['#6366f1', '#22c55e', '#eab308', '#f97316', '#06b6d4', '#ec4899', '#8b5cf6', '#64748b']
const RA_STATUS_COLORS = {
  MOVEMENT: '#15803d', 'TIPPING-POINT': '#22c55e', MIDWAY: '#eab308', PIONEER: '#f97316',
  ENGAGED: '#6366f1', UNREACHED: '#64748b', FRONTIER: '#f97316', UNKNOWN: '#94a3b8',
}
const raNum = (n) => (typeof n === 'number' && isFinite(n) ? n : 0)

function RichAnalytics({ report = {}, periodReports = [], areaReports = [], selectedAreas = [], peoplesRows = [], isFrench = true }) {
  const L = (fr, en) => (isFrench ? fr : en)

  // NB : toutes les données reçues (report, periodReports, areaReports,
  // peoplesRows) proviennent de requêtes déjà filtrées par les « Engagements DMM »
  // sélectionnés (param `peoples` / `peopleIds`). Ces graphiques respectent donc
  // automatiquement le filtre DMM Engagements, en plus de Zone/Pays/Trimestres.

  // 1) Tendances trimestrielles : églises, nouveaux disciples, baptisés, groupes actifs.
  const trend = (periodReports || []).map((p) => ({
    label: p.label,
    churches: raNum(p.report?.churches?.total),
    disciples: raNum(p.report?.disciples?.newDisciples),
    baptized: raNum(p.report?.disciples?.baptized),
    dbsActive: raNum(p.report?.discoveryGroups?.active),
  }))

  // 1b) Taux de croissance trimestre sur trimestre (QoQ) des églises et des
  // nouveaux disciples. Pour chaque trimestre t>0 : (v[t]-v[t-1]) / v[t-1] * 100.
  const growth = trend.map((row, i) => {
    if (i === 0) return { label: row.label, churchesGrowth: null, disciplesGrowth: null }
    const prev = trend[i - 1]
    const pct = (cur, old) => (old > 0 ? Math.round(((cur - old) / old) * 1000) / 10 : null)
    return {
      label: row.label,
      churchesGrowth: pct(row.churches, prev.churches),
      disciplesGrowth: pct(row.disciples, prev.disciples),
    }
  })
  // Dernière variation QoQ non nulle (pour les badges d'indicateur).
  const lastGrowth = [...growth].reverse().find((g) => g.churchesGrowth !== null || g.disciplesGrowth !== null) || {}
  const churchesQoQ = lastGrowth.churchesGrowth
  const disciplesQoQ = lastGrowth.disciplesGrowth

  // 1c) Comparaison PAR ZONE NG (uniquement quand ≥ 2 zones sélectionnées).
  // On pivote areaReports ([{areaId, areaLabel, label, report}]) en une série
  // par trimestre, avec une colonne « églises » par zone.
  const hasAreaCompare = Array.isArray(areaReports) && areaReports.length > 0 && (selectedAreas || []).length > 1
  const areaCompare = (() => {
    if (!hasAreaCompare) return []
    const byLabel = new Map()
    for (const ar of areaReports) {
      if (!byLabel.has(ar.label)) byLabel.set(ar.label, { label: ar.label })
      byLabel.get(ar.label)[ar.areaId] = raNum(ar.report?.churches?.total)
    }
    return [...byLabel.values()]
  })()

  // 2) Comparaison des mesures clés (snapshot agrégé courant).
  const measures = [
    { key: 'churches',  label: L('Églises', 'Churches'),       value: raNum(report?.churches?.total) },
    { key: 'disciples', label: L('Nv. disciples', 'New disciples'), value: raNum(report?.disciples?.newDisciples) },
    { key: 'baptized',  label: L('Baptisés', 'Baptized'),      value: raNum(report?.disciples?.baptized) },
    { key: 'dbs',       label: L('EBD actifs', 'Active DBS'),  value: raNum(report?.discoveryGroups?.active) },
    { key: 'leaders',   label: L('Coachs', 'Coaches'),         value: raNum(report?.leaders?.activeCoaches) },
  ]

  // 3) Répartition des engagements DMM par statut (part relative).
  const statusCounts = {}
  for (const p of peoplesRows || []) {
    const s = (p?.status?.global || 'UNKNOWN').toUpperCase()
    statusCounts[s] = (statusCounts[s] || 0) + 1
  }
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }))

  // 4) Top 8 des peuples par nombre d'églises (mesure comparative).
  const topChurches = [...(peoplesRows || [])]
    .map((p) => ({ name: p.canonicalName || '—', churches: raNum(p?.dmm?.totalChurches), engagements: raNum(p?.dmm?.engagementCount) }))
    .sort((a, b) => b.churches - a.churches)
    .slice(0, 8)

  // 5) Taux / indicateurs dérivés.
  const totalEng = (peoplesRows || []).reduce((s, p) => s + raNum(p?.dmm?.engagementCount), 0)
  const totalChurches = raNum(report?.churches?.total)
  const movements = statusCounts['MOVEMENT'] || 0
  const peoplesCount = (peoplesRows || []).length
  const dbsTotal = raNum(report?.discoveryGroups?.total)
  const dbsBecameChurch = raNum(report?.discoveryGroups?.becameChurch)
  const baptismRate = (() => {
    const nd = raNum(report?.disciples?.newDisciples)
    const nb = raNum(report?.disciples?.baptized)
    return nd > 0 ? Math.round((nb / nd) * 100) : 0
  })()
  const dbsConversion = dbsTotal > 0 ? Math.round((dbsBecameChurch / dbsTotal) * 100) : 0
  const avgChurchesPerPeople = peoplesCount > 0 ? (totalChurches / peoplesCount) : 0
  const movementRate = peoplesCount > 0 ? Math.round((movements / peoplesCount) * 100) : 0

  // Formatage d'une variation QoQ en texte signé (ex. +12.5 %, −4 %, —).
  const fmtGrowth = (g) => (g === null || g === undefined ? '—' : `${g > 0 ? '+' : ''}${g}%`)
  const growthAccent = (g) => (g === null || g === undefined ? 'text-gray-400' : g > 0 ? 'text-emerald-600' : g < 0 ? 'text-red-600' : 'text-gray-500')

  const kpis = [
    { label: L("Engagements DMM", 'DMM engagements'), value: peoplesFmt(totalEng), accent: 'text-indigo-600' },
    { label: L('Taux de baptême', 'Baptism rate'), value: `${baptismRate}%`, accent: 'text-emerald-600' },
    { label: L('EBD → églises', 'DBS → churches'), value: `${dbsConversion}%`, accent: 'text-blue-600' },
    { label: L('Églises / peuple', 'Churches / people group'), value: peoplesFmt(Math.round(avgChurchesPerPeople * 10) / 10), accent: 'text-amber-600' },
    { label: L('Taux de mouvements', 'Movement rate'), value: `${movementRate}%`, accent: 'text-green-700' },
    // Indicateurs de croissance trimestre sur trimestre (QoQ).
    { label: L('Croissance églises (QoQ)', 'Churches growth (QoQ)'), value: fmtGrowth(churchesQoQ), accent: growthAccent(churchesQoQ) },
    { label: L('Croissance disciples (QoQ)', 'Disciples growth (QoQ)'), value: fmtGrowth(disciplesQoQ), accent: growthAccent(disciplesQoQ) },
  ]

  const card = 'rounded-2xl border border-slate-200 bg-white p-4 shadow-sm'
  const titleCls = 'mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-gray-600'

  return (
    <div className="mt-6 space-y-4">
      <h2 className="flex items-center gap-2 text-base font-semibold text-black uppercase">
        <BarChart3 size={18} className="text-indigo-600" /> {L('Analyses & tendances DMM', 'DMM analytics & trends')}
      </h2>

      {/* Bandeau d'indicateurs (taux & mesures) */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <div key={k.label} className={card}>
            <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-500">{k.label}</p>
            <p className={`mt-1 text-xl font-extrabold tabular-nums ${k.accent}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Tendance trimestrielle (multi-mesures) */}
        <div className={card}>
          <p className={titleCls}><TrendingUp size={16} /> {L('Tendance par trimestre', 'Trend by quarter')}</p>
          {trend.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{L('Aucune donnée de période.', 'No period data.')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="churches"  name={L('Églises', 'Churches')} stroke="#6366f1" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="disciples" name={L('Nv. disciples', 'New disciples')} stroke="#22c55e" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="baptized"  name={L('Baptisés', 'Baptized')} stroke="#06b6d4" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="dbsActive" name={L('EBD actifs', 'Active DBS')} stroke="#f97316" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Comparaison des mesures clés */}
        <div className={card}>
          <p className={titleCls}><BarChart3 size={16} /> {L('Comparaison des mesures', 'Measures comparison')}</p>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={measures} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {measures.map((m, i) => <Cell key={m.key} fill={RA_COLORS[i % RA_COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Répartition par statut d'engagement */}
        <div className={card}>
          <p className={titleCls}><Users size={16} /> {L("Répartition par statut", 'Breakdown by status')}</p>
          {statusData.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{L('Aucun engagement.', 'No engagements.')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.name} (${e.value})`} labelLine={false}>
                  {statusData.map((d) => <Cell key={d.name} fill={RA_STATUS_COLORS[d.name] || '#94a3b8'} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Top peuples par nombre d'églises */}
        <div className={card}>
          <p className={titleCls}><TrendingUp size={16} /> {L("Top peuples (églises)", 'Top people groups (churches)')}</p>
          {topChurches.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{L('Aucun engagement.', 'No engagements.')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart layout="vertical" data={topChurches} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="churches" name={L('Églises', 'Churches')} fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Taux de croissance trimestre sur trimestre (QoQ) */}
        <div className={card}>
          <p className={titleCls}><TrendingUp size={16} /> {L('Croissance QoQ (%)', 'QoQ growth (%)')}</p>
          {growth.filter((g) => g.churchesGrowth !== null || g.disciplesGrowth !== null).length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">{L('Au moins deux trimestres requis.', 'At least two quarters required.')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={growth} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip formatter={(v) => (v === null || v === undefined ? '—' : `${v}%`)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="churchesGrowth"  name={L('Églises (QoQ)', 'Churches (QoQ)')} stroke="#6366f1" strokeWidth={2} connectNulls dot />
                <Line type="monotone" dataKey="disciplesGrowth" name={L('Disciples (QoQ)', 'Disciples (QoQ)')} stroke="#22c55e" strokeWidth={2} connectNulls dot />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Comparaison par Zone NG (églises par trimestre, une série par zone) */}
        <div className={`${card} lg:col-span-2`}>
          <p className={titleCls}><BarChart3 size={16} /> {L('Comparaison par Zone NG (églises)', 'Comparison by NG area (churches)')}</p>
          {!hasAreaCompare ? (
            <p className="py-10 text-center text-sm text-gray-400">{L('Sélectionnez au moins 2 Zones NG pour comparer.', 'Select at least 2 NG areas to compare.')}</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={areaCompare} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {(selectedAreas || []).map((a, i) => (
                  <Bar
                    key={a.id}
                    dataKey={a.id}
                    name={isFrench ? a.labelFr : a.labelEn}
                    fill={a.color || RA_COLORS[i % RA_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

export default function DmmReporting() {
  const { t, isFrench } = useLanguage()

  const [years, setYears]           = useState([CURRENT_YEAR])
  // Tous les trimestres actifs par défaut (T1–T4).
  const [quarters, setQuarters]     = useState([1, 2, 3, 4])
  const [areaIds, setAreaIds]       = useState([])
  const [countryIds, setCountryIds] = useState([])
  const [peopleIds, setPeopleIds]   = useState([]) // selected NG (DMM) masterPeopleIds
  const [exporting, setExporting]   = useState(false)
  const [peoplesPage, setPeoplesPage] = useState(1);
  const [expandedPeoples, setExpandedPeoples] = useState(() => new Set());
  const [sourceFilter, setSourceFilter] = useState('');

  const chartRef = useRef(null)

  const availableCountries = useMemo(() => {
    if (areaIds.length === 0) return []
    const seen = new Set()
    const list = []
    NG_AREAS.filter((a) => areaIds.includes(a.id)).forEach((area) => {
      area.countries.forEach((c) => {
        if (!seen.has(c.id)) { seen.add(c.id); list.push({ id: c.id, label: isFrench ? c.fr : c.en }) }
      })
    })
    return list
  }, [areaIds, isFrench])

  const handleAreaChange = (ids) => {
    setAreaIds(ids)
    const seen = new Set()
    const all = []
    NG_AREAS.filter((a) => ids.includes(a.id)).forEach((area) => {
      area.countries.forEach((c) => { if (!seen.has(c.id)) { seen.add(c.id); all.push(c.id) } })
    })
    setCountryIds(all)
    // The available peoples depend on the area/country scope, so reset the
    // peoples selection whenever the geographic scope changes.
    setPeopleIds([])
  }

  const handleCountryChange = (ids) => {
    setCountryIds(ids)
    setPeopleIds([])
  }

  const areaOptions       = NG_AREAS.map((a) => ({ id: a.id, label: isFrench ? a.labelFr : a.labelEn }))
  const effectiveYears    = years.length    > 0 ? years    : [CURRENT_YEAR]
  const effectiveQuarters = quarters.length > 0 ? quarters : [CURRENT_QUARTER]

  const pairs = useMemo(() => {
    const result = []
    const ys = [...effectiveYears].sort((a, b) => a - b)
    const qs = [...effectiveQuarters].sort((a, b) => a - b)
    ys.forEach((y) => qs.forEach((q) => result.push({ year: y, quarter: q })))
    return result
  }, [effectiveYears, effectiveQuarters])

  const selectedAreas = useMemo(() => NG_AREAS.filter((a) => areaIds.includes(a.id)), [areaIds])
  const compareAreas  = selectedAreas.length > 1

  // ── Build the query list ──
  // When comparing >1 area, we need per-(period × area) data → one query per pair per area.
  // Otherwise one query per pair (using the combined area/country filter).
  const queryDescriptors = useMemo(() => {
    if (compareAreas) {
      const list = []
      pairs.forEach((p) => {
        selectedAreas.forEach((area) => {
          list.push({ ...p, areaId: area.id, areaCountries: area.countries.map((c) => c.id) })
        })
      })
      return list
    }
    return pairs.map((p) => ({ ...p, areaId: null }))
  }, [pairs, selectedAreas, compareAreas])

  // Serialize the selected NG (DMM) peoples so it can be part of the query key.
  const peoplesParam = useMemo(() => [...peopleIds].sort().join(','), [peopleIds])

  const queryResults = useQueries({
    queries: queryDescriptors.map((d) => ({
      queryKey: ['reporting', d.year, d.quarter, d.areaId ?? areaIds.join(','), d.areaId ? '' : countryIds.join(','), peoplesParam],
      queryFn: () => {
        // Determine filter params for this query
        let params = { year: d.year, quarter: d.quarter }
        if (d.areaId) {
          // per-area query
          params.areas = d.areaId
          params.countries = d.areaCountries.join(',')
        } else {
          if (areaIds.length > 0) params.areas = areaIds.join(',')
          if (countryIds.length > 0) params.countries = countryIds.join(',')
        }
        // Restrict the whole report to the selected NG (DMM) peoples.
        if (peopleIds.length > 0) params.peoples = peoplesParam
        return reportingApi.quarterly(params).then((r) => r.data?.data)
      },
    })),
  })

  const isLoading = queryResults.some((q) => q.isLoading)
  const hasError  = queryResults.some((q) => q.isError)

  // Aggregated totals (across ALL successful queries)
  const report = useMemo(() => {
    const ok = queryResults.filter((q) => q.isSuccess && q.data).map((q) => q.data)
    return finalizeReport(aggregateReports(ok))
  }, [queryResults])

  // ── Trend data (by metric) — one point per period, aggregated across areas ──
  const metricData = useMemo(() => {
    return pairs.map((p) => {
      // gather all query results for this period (across areas if comparing)
      const matches = queryDescriptors
        .map((d, i) => ({ d, data: queryResults[i]?.data }))
        .filter((x) => x.d.year === p.year && x.d.quarter === p.quarter && x.data)
        .map((x) => x.data)
      const merged = finalizeReport(aggregateReports(matches)) || {}
      return {
        label: `T${p.quarter} ${p.year}`,
        disciples: merged?.disciples?.newDisciples ?? 0,
        baptized:  merged?.disciples?.baptized ?? 0,
        churches:  merged?.churches?.total ?? 0,
        dbsActive: merged?.discoveryGroups?.active ?? 0,
      }
    })
  }, [pairs, queryDescriptors, queryResults])

  // ── Trend data (by area) — one point per period, keyed by "<areaId>_<metric>" ──
  const areaData = useMemo(() => {
    if (!compareAreas) return []
    return pairs.map((p) => {
      const point = { label: `T${p.quarter} ${p.year}` }
      selectedAreas.forEach((area) => {
        const idx = queryDescriptors.findIndex(
          (d) => d.year === p.year && d.quarter === p.quarter && d.areaId === area.id
        )
        const r = idx >= 0 ? queryResults[idx]?.data : null
        METRICS.forEach((m) => {
          point[`${area.id}_${m.key}`] = metricValue(r, m.key)
        })
      })
      return point
    })
  }, [compareAreas, pairs, selectedAreas, queryDescriptors, queryResults])

  const showTrend = pairs.length > 1

  // ── Growth (% change first → last period) ──
  const growth = useMemo(() => {
    if (metricData.length < 2) return null
    const first = metricData[0]
    const last  = metricData[metricData.length - 1]
    return {
      disciples: { first: first.disciples, last: last.disciples },
      baptized:  { first: first.baptized,  last: last.baptized },
      churches:  { first: first.churches,  last: last.churches },
      dbsActive: { first: first.dbsActive, last: last.dbsActive },
      firstLabel: first.label,
      lastLabel:  last.label,
    }
  }, [metricData])

  const primaryPair = pairs[0] ?? { year: CURRENT_YEAR, quarter: CURRENT_QUARTER }
  const peoplesQuery = useQuery({
    queryKey: ['reporting-peoples', primaryPair.year, primaryPair.quarter, areaIds.join(','), countryIds.join(','), peopleIds.join(','), sourceFilter, peoplesPage],
    queryFn: () => reportingApi.peoples({
      areas: areaIds.length ? areaIds.join(',') : undefined,
      countries: countryIds.length ? countryIds.join(',') : undefined,
      peoples: peopleIds.length ? peopleIds.join(',') : undefined,
      year: primaryPair.year,
      quarter: primaryPair.quarter,
      sourceTypes: sourceFilter || undefined,
      page: peoplesPage,
      limit: 50,
    }).then((r) => r.data),
    enabled: areaIds.length > 0 || countryIds.length > 0,
    keepPreviousData: true,
  });
  const peoplesData = peoplesQuery.data;
  const peoplesRows = peoplesData?.data || [];
  const peoplesMeta = peoplesData?.meta;

  // ── NG (DMM) peoples available for the current geographic scope ──
  // Feeds the "peoples" filter box. Restricted to NG-engaged peoples (sourceTypes=DMM),
  // independent of the year/quarter so the option list stays stable while the user
  // switches periods.
  const peopleOptionsQuery = useQuery({
    queryKey: ['reporting-people-options', areaIds.join(','), countryIds.join(',')],
    queryFn: () => reportingApi.peoples({
      areas: areaIds.length ? areaIds.join(',') : undefined,
      countries: countryIds.length ? countryIds.join(',') : undefined,
      sourceTypes: 'DMM',
      page: 1,
      limit: 200,
    }).then((r) => r.data),
    enabled: areaIds.length > 0 || countryIds.length > 0,
    keepPreviousData: true,
  });
  const peopleOptions = useMemo(() => {
    const rows = peopleOptionsQuery.data?.data || [];
    return rows
      .filter((p) => p.isNGEngaged)
      .map((p) => ({
        id: String(p.masterPeopleId),
        label: p.primaryCountryCode ? `${p.canonicalName} (${p.primaryCountryCode})` : p.canonicalName,
      }));
  }, [peopleOptionsQuery.data]);

  // Human-readable labels for the currently selected NG (DMM) peoples, used in
  // CSV exports (header section + template columns + file name).
  const selectedPeopleLabels = useMemo(
    () => peopleIds.map((id) => peopleOptions.find((o) => o.id === id)?.label || id),
    [peopleIds, peopleOptions]
  );

  // File-name suffix summarising the selected NG peoples (used for CSV downloads).
  // e.g. "_peuple-Bakola" for a single people, "_3-peuples" for several, "" for none.
  const peoplesFileSuffix = useMemo(() => {
    if (selectedPeopleLabels.length === 0) return '';
    if (selectedPeopleLabels.length === 1) {
      const slug = selectedPeopleLabels[0]
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
        .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        .slice(0, 40);
      return `_peuple-${slug}`;
    }
    return `_${selectedPeopleLabels.length}-peuples`;
  }, [selectedPeopleLabels]);
  const togglePeople = (id) => setExpandedPeoples((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const gen    = report?.churches?.byGeneration || {}
  const maxGen = useMemo(() => Math.max(1, ...Object.values(gen).map((v) => v || 0)), [gen])

  // Build per-period aggregated reports (one entry per period, merged across areas)
  const periodReports = useMemo(() => {
    return pairs.map((p) => {
      const matches = queryDescriptors
        .map((d, i) => ({ d, data: queryResults[i]?.data }))
        .filter((x) => x.d.year === p.year && x.d.quarter === p.quarter && x.data)
        .map((x) => x.data)
      return { label: `T${p.quarter} ${p.year}`, report: finalizeReport(aggregateReports(matches)) || {} }
    })
  }, [pairs, queryDescriptors, queryResults])

  // Build per-(area × period) reports when comparing areas
  const areaReports = useMemo(() => {
    if (!compareAreas) return []
    const list = []
    pairs.forEach((p) => {
      selectedAreas.forEach((area) => {
        const idx = queryDescriptors.findIndex(
          (d) => d.year === p.year && d.quarter === p.quarter && d.areaId === area.id
        )
        const r = idx >= 0 ? queryResults[idx]?.data : null
        list.push({
          areaId: area.id,
          areaLabel: isFrench ? area.labelFr : area.labelEn,
          label: `T${p.quarter} ${p.year}`,
          report: r || {},
        })
      })
    })
    return list
  }, [compareAreas, pairs, selectedAreas, queryDescriptors, queryResults, isFrench])

  const [downloadingCsv, setDownloadingCsv] = useState(false)
  const downloadCsv = async () => {
    // Export ALL peoples matching the current filters (Zone NG / année / trimestre),
    // not just the paginated page currently shown on screen.
    if (areaIds.length === 0 && countryIds.length === 0) {
      toast.error(isFrench ? 'Sélectionnez au moins une Zone NG ou un pays' : 'Select at least an NG area or a country')
      return
    }
    setDownloadingCsv(true)
    try {
      const resp = await reportingApi.peoples({
        areas: areaIds.length ? areaIds.join(',') : undefined,
        countries: countryIds.length ? countryIds.join(',') : undefined,
        peoples: peopleIds.length ? peopleIds.join(',') : undefined,
        year: primaryPair.year,
        quarter: primaryPair.quarter,
        page: 1,
        limit: 100000,
      })
      const allRows = resp?.data?.data || resp?.data || []
      if (!allRows.length) {
        toast.error(isFrench ? 'Aucune donnée à exporter pour cette sélection' : 'No data to export for this selection')
        return
      }
      const csv = buildPeopleVillageCsv(allRows, primaryPair, isFrench)
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
      const url  = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `rapport-dmm-${primaryPair.year}-T${primaryPair.quarter}${peoplesFileSuffix}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export CSV failed:', err)
      toast.error(isFrench ? "Échec de l'export" : 'Export failed')
    } finally {
      setDownloadingCsv(false)
    }
  }

  // ── Export the trend chart to PNG ──
  const exportChart = async () => {
    if (!chartRef.current) return
    setExporting(true)
    try {
      const canvas = await html2canvas(chartRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        useCORS: true,
      })
      const link = document.createElement('a')
      link.download = `tendance-dmm-${primaryPair.year}.png`
      link.href = canvas.toDataURL('image/png')
      link.click()
      toast.success(isFrench ? 'Graphique exporté' : 'Chart exported')
    } catch (err) {
      console.error('Chart export failed:', err)
      toast.error(isFrench ? "Échec de l'export" : 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  const yearOptions = [CURRENT_YEAR - 2, CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map((y) => ({ id: String(y), label: String(y) }))
  const quarterOptions = [1, 2, 3, 4].map((q) => ({ id: String(q), label: `T${q}` }))

  const periodLabel = useMemo(() => {
    if (pairs.length === 1) return `${pairs[0].year} · T${pairs[0].quarter}`
    const ys = [...new Set(pairs.map((p) => p.year))].sort()
    const qs = [...new Set(pairs.map((p) => p.quarter))].sort()
    return `${ys.join(', ')} · ${qs.map((q) => `T${q}`).join(', ')}`
  }, [pairs])

  return (
    <div className="mx-auto max-w-5xl p-6">
      {/* ── Header ── */}
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="text-indigo-600" />
            {t('dmmReporting.title')}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <MultiSelect label={t('dmmReporting.filterArea')} options={areaOptions} selected={areaIds} onChange={handleAreaChange} allLabel={t('dmmReporting.allAreas')} />
          {areaIds.length > 0 && (
            <MultiSelect label={t('dmmReporting.filterCountry')} options={availableCountries} selected={countryIds} onChange={handleCountryChange} allLabel={t('dmmReporting.allCountries')} />
          )}
          <MultiSelect label={t('dmmReporting.filterYear')} options={yearOptions} selected={years.map(String)} onChange={(ids) => setYears(ids.map(Number))} allLabel={t('dmmReporting.allYears')} />
          <MultiSelect label={t('dmmReporting.filterQuarter')} options={quarterOptions} selected={quarters.map(String)} onChange={(ids) => setQuarters(ids.map(Number))} allLabel={t('dmmReporting.allQuarters')} />
          {(areaIds.length > 0 || countryIds.length > 0) && (
            <MultiSelect
              label={isFrench ? 'Engagements DMM' : 'DMM Engagements'}
              options={peopleOptions}
              selected={peopleIds}
              onChange={setPeopleIds}
              allLabel={isFrench ? 'Tous les engagements DMM' : 'All DMM engagements'}
            />
          )}
          <button onClick={downloadCsv} disabled={downloadingCsv || (areaIds.length === 0 && countryIds.length === 0)} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">
            {downloadingCsv ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} {t('dmmReporting.exportCsv')}
          </button>
        </div>
      </div>

      {/* Les « puces » de filtres sélectionnés (période / zone / année /
          trimestre) ont été retirées à la demande. L'état des filtres reste
          visible dans les menus déroulants ci-dessus. */}

      {/* ── Data ── */}
      {isLoading ? (
        <div className="flex flex-col items-center gap-2 py-16">
          <Loader2 className="animate-spin text-indigo-600" />
          {pairs.length > 1 && (
            <p className="text-sm text-gray-500">{isFrench ? `Chargement de ${pairs.length} périodes…` : `Loading ${pairs.length} periods…`}</p>
          )}
        </div>
      ) : hasError ? (
        <p className="rounded-lg bg-red-50 p-4 text-sm text-red-700">Erreur de chargement du rapport.</p>
      ) : report ? (
        <>
          {/* ── Trend chart (multi-period only) ── */}
          {showTrend && (
            <TrendChart
              chartRef={chartRef}
              metricData={metricData}
              areaData={areaData}
              areas={selectedAreas}
              isFrench={isFrench}
              onExport={exportChart}
              exporting={exporting}
            />
          )}

          {/* ── Growth cards (multi-period only) ── */}
          {showTrend && growth && (
            <div className="mb-6">
              <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-600">
                {isFrench ? `Croissance (${growth.firstLabel} → ${growth.lastLabel})` : `Growth (${growth.firstLabel} → ${growth.lastLabel})`}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <GrowthCard label={isFrench ? 'Nouveaux disciples' : 'New disciples'} first={growth.disciples.first} last={growth.disciples.last} isFrench={isFrench} />
                <GrowthCard label={isFrench ? 'Baptisés' : 'Baptized'} first={growth.baptized.first} last={growth.baptized.last} isFrench={isFrench} />
                <GrowthCard label={isFrench ? 'Églises actives' : 'Active churches'} first={growth.churches.first} last={growth.churches.last} isFrench={isFrench} />
                <GrowthCard label={isFrench ? 'Groupes DBS actifs' : 'Active DBS groups'} first={growth.dbsActive.first} last={growth.dbsActive.last} isFrench={isFrench} />
              </div>
            </div>
          )}

          <Section title="Disciples">
            <Stat label="Nouveaux disciples" value={report.disciples?.newDisciples} accent="text-emerald-600" />
            <Stat label="Nouveaux baptisés"  value={report.disciples?.baptized}     accent="text-emerald-600" />
          </Section>

          <Section title="Groupes de découverte (DBS)">
            <Stat label="Total"            value={report.discoveryGroups?.total} />
            <Stat label="Actifs"           value={report.discoveryGroups?.active}       accent="text-blue-600" />
            <Stat label="Devenus églises"  value={report.discoveryGroups?.becameChurch} accent="text-emerald-600" />
          </Section>

          <Section title="Églises">
            <Stat label="Total actives"        value={report.churches?.total} />
            <Stat label="Commissionnées"       value={report.churches?.commissioned} />
            <Stat label="Catalytiques"         value={report.churches?.catalytic} />
            <Stat label="Fusionnées / disparues" value={(report.churches?.mergedOrDied?.merged || 0) + (report.churches?.mergedOrDied?.died || 0)} accent="text-orange-600" />
          </Section>

          {/* Générations */}
          <div className="mb-6">
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-gray-600">Églises par génération</h2>
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              {[['1','1ʳᵉ génération'],['2','2ᵉ génération'],['3','3ᵉ génération'],['4plus','4ᵉ génération +']].map(([k, lbl]) => (
                <div key={k} className="mb-2 flex items-center gap-3">
                  <span className="w-32 text-xs text-gray-600">{lbl}</span>
                  <div className="h-4 flex-1 rounded bg-gray-100">
                    <div className="h-4 rounded bg-indigo-500" style={{ width: `${((gen[k] || 0) / maxGen) * 100}%` }} />
                  </div>
                  <span className="w-8 text-right text-sm font-bold">{gen[k] || 0}</span>
                </div>
              ))}
              <p className="mt-1 text-xs text-gray-400">Un mouvement (DMM) = 100+ églises sur 4 générations.</p>
            </div>
          </div>

          <Section title="Leaders">
            <Stat label="En formation"       value={report.leaders?.inTraining}          accent="text-blue-600" />
            <Stat label="Coachs actifs"      value={report.leaders?.activeCoaches}       accent="text-indigo-600" />
            <Stat label="Nouveaux déployés"  value={report.leaders?.newLeadersDeployed}  accent="text-emerald-600" />
            <Stat label="Personnes de paix"  value={report.personsOfPeace?.total} />
          </Section>

          {/* ── Analyses graphiques riches ──────────────────────────────────
              Remplace l'ancienne liste « Peuples engagés par zone / pays » par
              des graphiques analytiques : tendances par trimestre, comparaisons,
              taux de progression DMM et mesures clés. Toutes les données
              proviennent de `periodReports` (séries trimestrielles) et de
              `peoplesRows` (engagements DMM de la sélection). */}
          <RichAnalytics
            report={report}
            periodReports={periodReports}
            areaReports={areaReports}
            selectedAreas={selectedAreas}
            peoplesRows={peoplesRows}
            isFrench={isFrench}
          />

          {/* Bloc historique conservé pour mémoire mais désactivé (false). */}
          {false && (
          <div className="mt-6">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-black uppercase">
                <Users size={16} /> {isFrench ? 'Peuples engagés par zone / pays' : 'People groups engaged by area / country'}
              </h2>
              <div className="flex items-center gap-2">
                <select className="form-input text-sm" value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setPeoplesPage(1); }}>
                  <option value="">{isFrench ? 'Toutes les sources' : 'All sources'}</option>
                  <option value="DMM">{isFrench ? 'Engagés NG (DMM)' : 'NG engaged (DMM)'}</option>
                  <option value="JP">Joshua Project</option>
                  <option value="CPPI">CPPI / IMB</option>
                </select>
                {peoplesMeta?.totals?.peoples != null && (
                  <span className="text-sm text-gray-500">{peoplesMeta.totals.peoples} {isFrench ? 'peuples' : 'people groups'}</span>
                )}
              </div>
            </div>
            {(areaIds.length === 0 && countryIds.length === 0) ? (
              <div className="bg-white rounded-xl shadow-sm p-4 text-sm text-gray-500">{isFrench ? 'Sélectionnez une zone NG ou un pays pour voir les peuples.' : 'Select an NG area or a country to see the people groups.'}</div>
            ) : peoplesQuery.isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
            ) : peoplesQuery.isError ? (
              <div className="bg-red-50 text-red-600 rounded-xl p-4 text-sm">{isFrench ? 'Erreur lors du chargement des peuples.' : 'Failed to load people groups.'}</div>
            ) : peoplesRows.length === 0 ? (
              <div className="bg-white rounded-xl shadow-sm p-4 text-sm text-gray-500">{isFrench ? 'Aucun peuple pour cette sélection.' : 'No people groups for this selection.'}</div>
            ) : (
              // Liste des peuples au MÊME format que la section « Peuples » des
              // fiches Pays (CountryPeoples) : tableau à plat, mêmes colonnes,
              // mêmes intitulés, mêmes badges de statut.
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? 'Peuple' : 'People group'}</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? "# d'engagements" : '# engagements'}</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? "# d'églises" : '# churches'}</th>
                      <th className="py-2 px-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Max Gen</th>
                      <th className="py-2 pl-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{isFrench ? 'Statut' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peoplesRows.map((p) => {
                      // Source de référence pour le statut du peuple, en excluant
                      // « DMM » (on ne veut plus afficher le suffixe « (DMM) »).
                      const rawSrc = peoplesReferenceSource(p.sourceTypes)
                      const src = rawSrc && rawSrc.toUpperCase() !== 'DMM' ? rawSrc : null
                      const status = p.status?.global || 'UNKNOWN'
                      return (
                        <tr key={p.masterPeopleId} className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors">
                          <td className="py-3 pr-4">
                            <span className="font-medium text-blue-600">{p.canonicalName}</span>
                          </td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{peoplesFmt(p.dmm?.engagementCount ?? 0)}</td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{peoplesFmt(p.dmm?.totalChurches ?? 0)}</td>
                          <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{peoplesFmt(p.dmm?.maxGeneration ?? 0)}</td>
                          <td className="py-3 pl-4 text-left text-slate-700">
                            <StatusBadge status={`${status}${src ? ` (${src})` : ''}`} />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {peoplesMeta?.pagination && peoplesMeta.pagination.totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 mt-3">
                <button className="btn-secondary" disabled={peoplesPage <= 1} onClick={() => setPeoplesPage(peoplesPage - 1)}>{isFrench ? 'Précédent' : 'Previous'}</button>
                <span className="text-sm text-gray-600">Page {peoplesMeta.pagination.page} / {peoplesMeta.pagination.totalPages}</span>
                <button className="btn-secondary" disabled={peoplesPage >= peoplesMeta.pagination.totalPages} onClick={() => setPeoplesPage(peoplesPage + 1)}>{isFrench ? 'Suivant' : 'Next'}</button>
              </div>
            )}
          </div>
          )}
        </>
      ) : null}
    </div>
  )
}
