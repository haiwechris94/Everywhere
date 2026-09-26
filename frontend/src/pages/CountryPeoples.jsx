import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Users, MapPin } from 'lucide-react'
import { reportingApi } from '../services/reportingApi'
import { StateLoading, StateError, StateEmpty, StatCard } from './geography/geoComponents'
import { metricCards } from './regions/ngMetrics'

const StatusBadge = ({ status }) => {
  if (!status) return null
  const map = {
    dmm: 'bg-green-100 text-green-700',
    engaged: 'bg-blue-100 text-blue-700',
    unreached: 'bg-amber-100 text-amber-700',
    UNKNOWN: 'bg-slate-100 text-slate-600',
  }
  const cls = map[status] || 'bg-slate-100 text-slate-600'
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>
}

const CountryPeoples = () => {
  const { regionId, countryCode } = useParams()

  const countryQuery = useQuery({
    queryKey: ['ng-region-country', regionId, countryCode],
    queryFn: async () => {
      const res = await reportingApi.getRegionCountry(regionId, countryCode)
      return res?.data?.data
    },
    enabled: !!regionId && !!countryCode,
    retry: false,
  })

  const peoplesQuery = useQuery({
    queryKey: ['ng-country-peoples', countryCode],
    queryFn: async () => {
      const res = await reportingApi.getPeoples({ countries: countryCode, limit: 100 })
      return Array.isArray(res?.data?.data) ? res.data.data : []
    },
    enabled: !!countryCode,
    retry: false,
  })

  if (countryQuery.isLoading) return <div className="p-6"><StateLoading label="Chargement du pays…" /></div>
  if (countryQuery.isError) {
    const notFound = countryQuery.error?.response?.status === 404
    return <div className="p-6"><StateError label={notFound ? 'Pays introuvable.' : 'Erreur de chargement.'} /></div>
  }

  const detail = countryQuery.data
  const region = detail?.region
  const country = detail?.country
  if (!country) return <div className="p-6">Pays introuvable.</div>

  const cards = metricCards(detail.metrics)
  const peoples = peoplesQuery.data || []
  const dmmPeoples = peoples.filter((p) => p.isNGEngaged)
  const engagements = dmmPeoples.flatMap((p) =>
    (p.dmm?.engagements || []).map((e) => ({ ...e, masterPeopleId: p.masterPeopleId }))
  )
  const reportingCount = dmmPeoples.reduce((sum, p) => sum + (p.dmm?.engagementCount || 0), 0)

  return (
    <div className="p-6 space-y-6">
      <p className="text-sm text-gray-500">
        <Link to="/regions" className="hover:text-slate-700">Regions</Link> /{' '}
        <Link to={`/regions/${region?.id}`} className="hover:text-slate-700">{region?.name}</Link> / {country.name || country.nameEn}
      </p>
      <div>
        <h1 className="text-4xl font-bold text-slate-900">{country.name || country.nameEn}</h1>
        <p className="text-slate-500 mt-1">{country.capital ? `Capitale : ${country.capital}` : ''} · {country.code}</p>
        <p className="text-xs text-slate-500 mt-2">Vérification DMM: {reportingCount} engagement(s) chargé(s) depuis le reporting.</p>
      </div>

      <div className="flex flex-wrap gap-3">
        {cards.map((c) => (
          <StatCard key={c.label} label={c.label} value={c.value} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <Users size={18} />
              </span>
              Peuples
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600">
              {peoplesQuery.isLoading ? '…' : dmmPeoples.length}
            </span>
          </div>

          <div className="p-4 lg:max-h-[70vh] lg:overflow-y-auto">
            {peoplesQuery.isLoading ? (
              <StateLoading label="Chargement des peuples…" />
            ) : peoplesQuery.isError ? (
              <StateError label="Impossible de charger les peuples." />
            ) : dmmPeoples.length === 0 ? (
              <StateEmpty label="Aucun peuple DMM pour ce pays." />
            ) : (
              <div className="space-y-2.5">
                {dmmPeoples.map((p) => (
                  <Link
                    key={p.masterPeopleId}
                    to={`/regions/${regionId}/countries/${countryCode}/peoples/${p.masterPeopleId}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-indigo-200 hover:bg-indigo-50/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 truncate">{p.canonicalName}</p>
                        <StatusBadge status={p.status?.global} />
                        {p.isNGEngaged && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-medium">NG</span>
                        )}
                      </div>
                      {p.dmm && (
                        <p className="text-sm text-slate-500 mt-1">
                          {p.dmm.engagementCount ?? 0} engagements · {p.dmm.totalChurches ?? 0} churches · gen {p.dmm.maxGeneration ?? 0}
                        </p>
                      )}
                    </div>
                    <ChevronRight size={18} className="text-slate-300 shrink-0 transition-colors group-hover:text-indigo-500" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col">
          <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <MapPin size={18} />
              </span>
              Engagements
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-sm font-medium text-slate-600">
              {peoplesQuery.isLoading ? '…' : engagements.length}
            </span>
          </div>

          <div className="p-4 lg:max-h-[70vh] lg:overflow-y-auto">
            {peoplesQuery.isLoading ? (
              <StateLoading label="Chargement des engagements…" />
            ) : peoplesQuery.isError ? (
              <StateError label="Impossible de charger les engagements." />
            ) : engagements.length === 0 ? (
              <StateEmpty label="Aucun engagement pour ce pays." />
            ) : (
              <div className="space-y-2.5">
                {engagements.map((e) => (
                  <Link
                    key={e.peopleGroupId}
                    to={`/regions/${regionId}/countries/${countryCode}/peoples/${e.masterPeopleId}`}
                    className="group flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4 transition-colors hover:border-emerald-200 hover:bg-emerald-50/40"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-slate-900 truncate">{e.name}</p>
                        <StatusBadge status={e.engagementStatus} />
                      </div>
                      <p className="text-sm text-slate-500 mt-1">
                        {[
                          e.villageName || '—',
                          e.region || e.admin2 || '',
                          `${e.numberOfChurches ?? 0} églises`,
                          `gen ${e.churchGeneration ?? 0}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                    <ChevronRight size={18} className="text-slate-300 shrink-0 transition-colors group-hover:text-emerald-500" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

export default CountryPeoples
