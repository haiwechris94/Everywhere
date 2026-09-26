/**
 * PillarListPage — generic, defensive list scaffold for the DMM pillars
 * (persons of peace, discovery groups, DBS sessions, churches).
 * Grouped under the transverse "Piliers DMM" navigation section.
 */
import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import {
  PageHeader,
  StateLoading,
  StateError,
  StateEmpty,
} from '../geography/geoComponents'

const extractArray = (res) => {
  const d = res?.data
  const arr = d?.data || d?.items || d?.peopleGroups || d?.villages || d
  return Array.isArray(arr) ? arr : []
}

/**
 * @param {string} title
 * @param {string} subtitle
 * @param {string} queryKey
 * @param {Function} fetcher - returns an axios promise
 * @param {Array<{key:string,label:string,render?:Function}>} columns
 * @param {Function} [searchText] - (row) => string used for filtering
 * @param {ReactNode} [icon]
 */
const PillarListPage = ({
  title,
  subtitle,
  queryKey,
  fetcher,
  columns,
  searchText,
}) => {
  const [search, setSearch] = useState('')

  const { data, isLoading, isError } = useQuery({
    queryKey: [queryKey],
    queryFn: async () => extractArray(await fetcher()),
  })

  const rows = Array.isArray(data) ? data : []
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    const toText =
      searchText ||
      ((r) => `${r.name || r.title || ''} ${r.status || ''}`)
    return rows.filter((r) => String(toText(r)).toLowerCase().includes(q))
  }, [rows, search, searchText])

  return (
    <div>
      <PageHeader
        breadcrumb={[{ label: 'Piliers DMM' }, { label: title }]}
        title={title}
        subtitle={subtitle}
        stats={[{ label: 'Total', value: rows.length }]}
      />

      <div className="relative mb-4 max-w-md">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 text-sm focus:outline-none focus:ring-2 focus:ring-neutral-300"
        />
      </div>

      {isLoading ? (
        <StateLoading />
      ) : isError ? (
        <StateError />
      ) : filtered.length === 0 ? (
        <StateEmpty label="Aucun enregistrement." />
      ) : (
        <div className="bg-white rounded-xl border border-neutral-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-neutral-400 border-b border-neutral-200 bg-neutral-50">
                {columns.map((c) => (
                  <th key={c.key} className="py-2.5 px-4 font-medium whitespace-nowrap">
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row, i) => (
                <tr key={row._id || i} className="border-b border-neutral-100 hover:bg-neutral-50">
                  {columns.map((c) => (
                    <td key={c.key} className="py-2.5 px-4 text-neutral-700">
                      {c.render ? c.render(row) : row[c.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default PillarListPage
