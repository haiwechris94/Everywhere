import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowUpDown, ArrowUp, ArrowDown, Search, X } from 'lucide-react'
import { reportingApi } from '../services/reportingApi'
import { StateLoading, StateError, StateEmpty } from './geography/geoComponents'
import { useLanguage } from '../i18n'

// Locale-aware thousands formatting for the numeric columns (e.g. 45000 -> 45 000).
// Identique au formatage utilisé dans la section "countries" des fiches Régions.
const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('fr-FR') : (n ?? '—'))

// Sortable column keys. `name` sorts alphabetically; the others are numeric.
const SORT_ACCESSORS = {
  name: (c) => (c.name || c.nameEn || '').toLowerCase(),
  engagements: (c) => c.summary?.engagements ?? 0,
  totalPGs: (c) => c.summary?.totalPGs ?? 0,
  unreachedPGs: (c) => c.summary?.unreachedPGs ?? 0,
}

/**
 * Page « Pays » (Countries).
 *
 * Liste à plat de TOUS les pays présents dans les différentes régions de la page
 * Regions. La source de vérité est l'endpoint /api/reporting/countries, lui-même
 * dérivé de NG_AREAS + COUNTRY_CONFIG : la liste se met donc à jour
 * automatiquement lorsqu'un pays est ajouté à une région existante ou qu'une
 * nouvelle région/pays est introduite.
 *
 * Chaque nom de pays renvoie vers la fiche détaillée du pays
 * (/regions/:regionId/countries/:code), c.-à-d. la même page que depuis la
 * section "countries" d'une fiche Région.
 *
 * Colonnes : #  |  Nom  |  # Engagements  |  Total PGs  |  Unreached PGs
 * - Barre de recherche pour filtrer les pays par nom.
 * - En-têtes cliquables pour trier (asc/desc) sur chaque colonne.
 * - Ligne de total en bas qui additionne les 3 colonnes numériques.
 * Présentation en mode liste (pas de cartes), même police et mêmes couleurs que
 * la section "countries" des fiches Régions.
 */
const Pays = () => {
  const { isFrench } = useLanguage()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['ng-countries'],
    queryFn: async () => {
      const res = await reportingApi.getCountries()
      return Array.isArray(res?.data?.data) ? res.data.data : []
    },
  })

  const [search, setSearch] = useState('')
  // Tri par défaut : par nom, ordre croissant (comme l'API).
  const [sort, setSort] = useState({ key: 'name', dir: 'asc' })

  const countries = data || []

  // Clic sur un en-tête : bascule asc <-> desc, ou passe sur une nouvelle colonne.
  // Par défaut, les colonnes numériques démarrent en décroissant (plus grand d'abord),
  // la colonne Nom démarre en croissant (A -> Z).
  const toggleSort = (key) => {
    setSort((prev) => {
      if (prev.key === key) {
        return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      }
      return { key, dir: key === 'name' ? 'asc' : 'desc' }
    })
  }

  // Liste filtrée (recherche par nom) puis triée selon la colonne active.
  const visibleCountries = useMemo(() => {
    const term = search.trim().toLowerCase()
    const filtered = term
      ? countries.filter((c) =>
          (c.name || c.nameEn || '').toLowerCase().includes(term)
        )
      : countries
    const accessor = SORT_ACCESSORS[sort.key] || SORT_ACCESSORS.name
    const sorted = [...filtered].sort((a, b) => {
      const av = accessor(a)
      const bv = accessor(b)
      let cmp
      if (typeof av === 'string' || typeof bv === 'string') {
        cmp = String(av).localeCompare(String(bv), 'fr')
      } else {
        cmp = av - bv
      }
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [countries, search, sort])

  // Totaux (sur la liste filtrée) pour la ligne de bas de tableau.
  const totals = useMemo(
    () =>
      visibleCountries.reduce(
        (acc, c) => {
          const s = c.summary || {}
          acc.engagements += s.engagements ?? 0
          acc.totalPGs += s.totalPGs ?? 0
          acc.unreachedPGs += s.unreachedPGs ?? 0
          return acc
        },
        { engagements: 0, totalPGs: 0, unreachedPGs: 0 }
      ),
    [visibleCountries]
  )

  // Petit indicateur de tri rendu dans l'en-tête cliquable.
  const SortIcon = ({ column }) => {
    if (sort.key !== column) return <ArrowUpDown size={12} className="opacity-40" />
    return sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  // En-tête de colonne cliquable (bouton accessible) partageant le style des
  // en-têtes de la section "countries" des fiches Régions.
  const SortableTh = ({ column, align = 'right', children, className = '' }) => (
    <th className={`py-2 text-xs font-semibold tracking-wide text-slate-500 ${className}`}>
      <button
        type="button"
        onClick={() => toggleSort(column)}
        aria-sort={sort.key === column ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
        className={`inline-flex items-center gap-1 hover:text-slate-700 transition-colors ${
          align === 'right' ? 'flex-row-reverse' : ''
        } ${sort.key === column ? 'text-slate-700' : ''}`}
      >
        <SortIcon column={column} />
        <span>{children}</span>
      </button>
    </th>
  )

  return (
    <div className="p-6 space-y-6">
      {/* En-tête : même mise en forme que la page Regions (petit libellé gris en
          gras au-dessus, grand titre slate-900 en dessous). */}
      <div>
        <p className="text-sm font-bold text-gray-500">{isFrench ? 'Pays' : 'Countries'}</p>
        <h1 className="text-4xl font-bold text-slate-900">{isFrench ? 'Pays' : 'Countries'}</h1>
      </div>

      {/* Barre de recherche : filtre la liste par nom de pays. */}
      <div className="relative max-w-sm">
        <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isFrench ? 'Rechercher un pays…' : 'Search a country…'}
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label={isFrench ? 'Effacer la recherche' : 'Clear search'}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isLoading ? (
        <StateLoading label={isFrench ? 'Chargement des pays…' : 'Loading countries…'} />
      ) : isError ? (
        <StateError label={isFrench ? 'Impossible de charger les pays.' : 'Unable to load countries.'} />
      ) : countries.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucun pays disponible.' : 'No country available.'} />
      ) : visibleCountries.length === 0 ? (
        <StateEmpty label={isFrench ? 'Aucun pays ne correspond à la recherche.' : 'No country matches the search.'} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="py-2 pr-4 text-right text-xs font-semibold tracking-wide text-slate-500 w-12">
                  #
                </th>
                <SortableTh column="name" align="left" className="px-4 text-left">
                  {isFrench ? 'Nom' : 'Name'}
                </SortableTh>
                <SortableTh column="engagements" align="right" className="px-4 text-right">
                  #DMM Engagements
                </SortableTh>
                <SortableTh column="totalPGs" align="right" className="px-4 text-right">
                  Total PGs
                </SortableTh>
                <SortableTh column="unreachedPGs" align="right" className="pl-4 text-right">
                  Unreached PGs
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {visibleCountries.map((country, index) => {
                const s = country.summary || {}
                return (
                  <tr
                    key={country.code}
                    className="border-b border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    {/* Numéro de ligne : 1, 2, 3 … jusqu'au dernier pays affiché. */}
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-400">{index + 1}</td>
                    <td className="py-3 px-4">
                      <Link
                        to={`/regions/${country.regionId}/countries/${country.code}`}
                        className="font-medium text-blue-600 hover:text-blue-700 hover:underline"
                      >
                        {country.name || country.nameEn}
                      </Link>
                    </td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(s.engagements ?? 0)}</td>
                    <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-700">{fmt(s.totalPGs ?? 0)}</td>
                    <td className="py-3 pl-4 text-right tabular-nums font-medium text-red-600">{fmt(s.unreachedPGs ?? 0)}</td>
                  </tr>
                )
              })}
            </tbody>
            {/* Ligne de total : additionne les 3 colonnes numériques des pays affichés. */}
            <tfoot>
              <tr className="border-t-2 border-slate-300">
                <td className="py-3 pr-4"></td>
                <td className="py-3 px-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isFrench ? 'Total' : 'Total'}
                </td>
                <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">{fmt(totals.engagements)}</td>
                <td className="py-3 px-4 text-right tabular-nums font-bold text-slate-900">{fmt(totals.totalPGs)}</td>
                <td className="py-3 pl-4 text-right tabular-nums font-bold text-red-600">{fmt(totals.unreachedPGs)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

export default Pays
