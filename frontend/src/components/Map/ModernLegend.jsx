import React, { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useLanguage } from '../../i18n'

const STATUSES = [
  { key: 'unreached',    color: '#dc2626', labelKey: 'peopleMap.status.unreached',    fallback: 'Unreached' },
  { key: 'pioneer',      color: '#f97316', labelKey: 'peopleMap.status.pioneer',      fallback: 'Pioneer' },
  { key: 'mid-journey',  color: '#eab308', labelKey: 'peopleMap.status.midway',       fallback: 'Mid-journey' },
  { key: 'tipping-point',color: '#10b981', labelKey: 'peopleMap.status.tippingPoint', fallback: 'Tipping point' },
  { key: 'movement',     color: '#15803d', labelKey: 'peopleMap.status.dmm',          fallback: 'DMM (Reached)' },
]

/**
 * ModernLegend – floating bottom-right collapsible card showing the 5 DMM
 * statuses with live counts derived from the visible peoples list.
 *
 * Props:
 *   counts: { unreached, pioneer, 'mid-journey', 'tipping-point', movement } | { unreached, pioneer, midway, tippingPoint, dmm }
 */
const ModernLegend = ({ counts = {}, total = 0 }) => {
  const { t } = useLanguage()
  const [collapsed, setCollapsed] = useState(false)

  // Support both engagementStatus keys and legacy stats keys
  const getCount = (status) => {
    if (counts[status.key] != null) return counts[status.key]
    const legacyMap = {
      'unreached': 'unreached',
      'pioneer': 'pioneer',
      'mid-journey': 'midway',
      'tipping-point': 'tippingPoint',
      'movement': 'dmm',
    }
    return counts[legacyMap[status.key]] || 0
  }

  const tx = (key, fb) => {
    const v = t(key)
    return v && v !== key ? v : fb
  }

  return (
    <div className="absolute bottom-4 right-4 z-[1000] w-56 max-w-[80vw] bg-white/95 backdrop-blur rounded-xl shadow-xl border border-neutral-100 overflow-hidden dark:border-slate-700">
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-neutral-50 transition-colors dark:hover:bg-slate-700"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wider uppercase text-neutral-700 dark:text-slate-300">
            {tx('map.legend.title', 'Legend')}
          </span>
          <span className="text-xs text-neutral-500 dark:text-slate-400">· {total}</span>
        </div>
        {collapsed ? (
          <ChevronUp size={14} className="text-neutral-500 dark:text-slate-400" />
        ) : (
          <ChevronDown size={14} className="text-neutral-500 dark:text-slate-400" />
        )}
      </button>
      {!collapsed && (
        <div className="px-3 pb-3 pt-1 space-y-1.5">
          {STATUSES.map((s) => {
            const count = getCount(s)
            return (
              <div
                key={s.key}
                className="flex items-center gap-2 text-xs text-neutral-700 dark:text-slate-300"
              >
                <span
                  className="w-3 h-3 rounded-full ring-2 ring-white shadow-sm flex-shrink-0"
                  style={{ backgroundColor: s.color }}
                />
                <span className="flex-1 truncate">{tx(s.labelKey, s.fallback)}</span>
                <span className="text-xs font-semibold text-neutral-500 tabular-nums">
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default ModernLegend
