import React, { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BarChart3, ChevronRight, Loader2, EyeOff, Eye } from 'lucide-react'
import { reportingApi } from '../../services/api'

const VISIBILITY_KEY = 'dmmSummaryVisible'

/**
 * DmmReportingSummary — carte de synthèse du reporting DMM (trimestre en cours)
 * affichée dans le tableau de bord. Reprend le format numérique Cityteam et
 * renvoie vers la page détaillée /dmm-reporting.
 *
 * L'utilisateur peut masquer/afficher la carte ; la préférence est mémorisée
 * dans le localStorage (clé "dmmSummaryVisible").
 */
const now = new Date()
const YEAR = now.getUTCFullYear()
const QUARTER = Math.floor(now.getUTCMonth() / 3) + 1

function Metric({ label, value, accent = '#1A1A1A' }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-xl font-bold" style={{ color: accent }}>{value ?? 0}</p>
    </div>
  )
}

export default function DmmReportingSummary() {
  const navigate = useNavigate()
  const [visible, setVisible] = useState(() => localStorage.getItem(VISIBILITY_KEY) !== 'false')
  const toggleVisible = (next) => {
    setVisible(next)
    try { localStorage.setItem(VISIBILITY_KEY, String(next)) } catch { /* ignore */ }
  }

  const { data: report, isLoading } = useQuery({
    queryKey: ['reporting', 'summary', YEAR, QUARTER],
    queryFn: () => reportingApi.quarterly({ year: YEAR, quarter: QUARTER }).then((r) => r.data?.data),
    refetchInterval: 60000,
    enabled: visible,
  })

  const gen = report?.churches?.byGeneration || {}
  const maxGen = useMemo(() => Math.max(1, ...Object.values(gen).map((v) => v || 0)), [gen])

  // Vue repliée : bouton discret pour réafficher la synthèse.
  if (!visible) {
    return (
      <div className="mb-8 flex items-center justify-between rounded-2xl border border-dashed border-gray-200 bg-white/60 px-6 py-3 relative z-10">
        <span className="flex items-center gap-2 text-sm text-gray-500">
          <BarChart3 size={16} className="text-indigo-500" /> Synthèse DMM masquée
        </span>
        <button
          onClick={() => toggleVisible(true)}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
        >
          <Eye size={16} /> Afficher
        </button>
      </div>
    )
  }

  return (
    <div className="mb-8 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm relative z-10">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <BarChart3 size={18} />
          </span>
          <div>
            <h3 className="text-base font-bold text-slate-900">Synthèse DMM — T{QUARTER} {YEAR}</h3>
            <p className="text-xs text-gray-500">Format numérique Cityteam (trimestre en cours)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/dmm-reporting')}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Rapport complet <ChevronRight size={16} />
          </button>
          <button
            onClick={() => toggleVisible(false)}
            title="Masquer la synthèse"
            className="flex items-center rounded-lg border border-gray-200 px-2.5 py-1.5 text-gray-500 hover:bg-gray-50"
          >
            <EyeOff size={16} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="animate-spin text-indigo-600" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Metric label="Nouveaux disciples" value={report?.disciples?.newDisciples} accent="#10B981" />
            <Metric label="Baptisés" value={report?.disciples?.baptized} accent="#10B981" />
            <Metric label="Groupes DBS actifs" value={report?.discoveryGroups?.active} accent="#5B5FEF" />
            <Metric label="Églises actives" value={report?.churches?.total} />
            <Metric label="Coachs actifs" value={report?.leaders?.activeCoaches} accent="#5B5FEF" />
          </div>

          {/* Églises par génération */}
          <div className="mt-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Églises par génération</p>
            <div className="flex items-end gap-3">
              {[['1', '1G'], ['2', '2G'], ['3', '3G'], ['4plus', '4G+']].map(([k, lbl]) => (
                <div key={k} className="flex flex-1 flex-col items-center">
                  <span className="mb-1 text-xs font-semibold text-slate-700">{gen[k] || 0}</span>
                  <div className="flex h-20 w-full items-end rounded bg-gray-100">
                    <div className="w-full rounded bg-indigo-500" style={{ height: `${((gen[k] || 0) / maxGen) * 100}%` }} />
                  </div>
                  <span className="mt-1 text-[11px] text-gray-500">{lbl}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
