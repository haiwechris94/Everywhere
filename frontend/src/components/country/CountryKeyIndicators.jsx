import { useState } from 'react'
import {
  ChevronDown,
  ChevronUp,
  Target,
  Users,
  AlertTriangle,
  TrendingUp,
  Globe,
  Building2,
  Flag,
} from 'lucide-react'

/**
 * CountryKeyIndicators — cartes d'indicateurs clés d'un pays, améliorées avec
 * une icône dans chaque case. Accepte des cartes prêtes (primaryCards /
 * moreCards : { label, value, accent }) et, à défaut, dérive des cartes à
 * partir de `country.summary`.
 */

const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('fr-FR') : (v ?? '—'))

const ACCENTS = {
  indigo: 'bg-indigo-50 text-indigo-600',
  blue: 'bg-blue-50 text-blue-600',
  amber: 'bg-amber-50 text-amber-600',
  green: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  slate: 'bg-slate-100 text-slate-600',
}

function iconFor(label = '') {
  const l = String(label).toLowerCase()
  if (l.includes('engag')) return Target
  if (l.includes('church') || l.includes('église') || l.includes('eglise')) return Building2
  if (l.includes('believ') || l.includes('croyant')) return Users
  if (l.includes('unreach') || l.includes('atteint') || l.includes('non-atteint')) return AlertTriangle
  if (l.includes('pg') || l.includes('peuple') || l.includes('people')) return Globe
  if (l.includes('gen')) return TrendingUp
  return Flag
}

function IndicatorCard({ card }) {
  const Icon = iconFor(card.label)
  const accent = ACCENTS[card.accent] || ACCENTS.slate
  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-[#DCE6F5] bg-white p-4 shadow-[0_2px_10px_rgba(30,60,120,0.05)]">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${accent}`}>
        <Icon size={20} />
      </span>
      <div className="min-w-0">
        <p className="truncate text-2xl font-bold tabular-nums text-[#0F2A5C]">{fmt(card.value)}</p>
        <p className="truncate text-xs font-medium text-[#6B7A99]">{card.label}</p>
      </div>
    </div>
  )
}

export default function CountryKeyIndicators({ country = null, primaryCards = [], moreCards = [], isFrench = true }) {
  const [showMore, setShowMore] = useState(false)

  const base = (primaryCards && primaryCards.length)
    ? primaryCards
    : (country?.summary
      ? [
          { label: isFrench ? '#Engagements DMM' : '#DMM Engagements', value: country.summary.engagements ?? 0, accent: 'indigo' },
          { label: isFrench ? 'Total peuples' : 'Total PGs', value: country.summary.totalPGs ?? 0, accent: 'blue' },
          { label: isFrench ? 'Peuples non atteints' : 'Unreached PGs', value: country.summary.unreachedPGs ?? 0, accent: 'amber' },
        ]
      : [])

  const extra = moreCards || []
  if (!base.length && !extra.length) return null

  const shown = showMore ? [...base, ...extra] : base

  return (
    <section className="rounded-[20px] border border-[#DCE6F5] bg-white p-6 shadow-[0_4px_20px_rgba(30,60,120,0.06)]">
      <h3 className="mb-4 text-base font-semibold uppercase tracking-wide text-[#0F2A5C]">
        {isFrench ? 'Indicateurs clés' : 'Key indicators'}
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((c, i) => <IndicatorCard key={c.label || i} card={c} />)}
      </div>
      {extra.length > 0 && (
        <button
          type="button"
          onClick={() => setShowMore((v) => !v)}
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#2563EB] hover:underline"
        >
          {showMore ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          {showMore ? (isFrench ? 'Voir moins' : 'Show less') : (isFrench ? 'Voir plus' : 'Show more')}
        </button>
      )}
    </section>
  )
}
