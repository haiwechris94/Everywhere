import React from 'react'
import { Users, Church } from 'lucide-react'
import { useLanguage } from '../../i18n'

/**
 * StatsBadge – top-right floating badge showing live counts of peoples and churches.
 * Hidden on very small screens when sidebar is open (parent controls).
 */
const StatsBadge = ({ peopleCount = 0, churchCount = 0, className = '' }) => {
  const { t } = useLanguage()
  const tx = (key, fb) => {
    const v = t(key)
    return v && v !== key ? v : fb
  }

  return (
    <div
      className={`bg-white/95 backdrop-blur rounded-xl shadow-md border border-neutral-100 px-3 py-2 flex items-center gap-3 text-xs ${className}`}
    >
      <div className="flex items-center gap-1.5">
        <Users size={14} className="text-primary-600" />
        <span className="font-semibold text-neutral-800 tabular-nums">{peopleCount}</span>
        <span className="text-neutral-500 hidden sm:inline">
          {tx('map.stats.peoples', 'people groups')}
        </span>
      </div>
      <div className="w-px h-4 bg-neutral-200" />
      <div className="flex items-center gap-1.5">
        <Church size={14} className="text-emerald-600" />
        <span className="font-semibold text-neutral-800 tabular-nums">{churchCount}</span>
        <span className="text-neutral-500 hidden sm:inline">
          {tx('map.stats.churches', 'churches')}
        </span>
      </div>
    </div>
  )
}

export default StatsBadge
