import { churchesApi } from '../../services/api'
import PillarListPage from './PillarListPage'

const villageName = (r) => r.village?.name || r.village || '—'
const peopleGroupName = (r) => r.peopleGroup?.name || '—'

const statusLabel = (s, isFrench) => {
  const map = isFrench
    ? {
        planning: 'Planification',
        planted: 'Plantée',
        growing: 'En croissance',
        multiplying: 'En multiplication',
        inactive: 'Inactive',
      }
    : {
        planning: 'Planning',
        planted: 'Planted',
        growing: 'Growing',
        multiplying: 'Multiplying',
        inactive: 'Inactive',
      }
  return map[s] || s || '—'
}

/**
 * Églises — new list page (backend /api/churches, réparé en Phase 0).
 * Métrique de multiplication rattachée à un peuple.
 */
const ChurchesList = () => (
  <PillarListPage
    title={(isFrench) => (isFrench ? 'Églises' : 'Churches')}
    subtitle={(isFrench) =>
      isFrench
        ? 'Métrique de multiplication — églises plantées (généalogie, générations 1→4+), rattachées à un peuple.'
        : 'Multiplication metric — planted churches (genealogy, generations 1→4+), tied to a people group.'}
    queryKey="pillar-churches"
    fetcher={() => churchesApi.getAll({ limit: 500 })}
    searchText={(r) => `${r.name || ''} ${r.status || ''} ${r.leader || ''}`}
    columns={[
      { key: 'name', label: (isFrench) => (isFrench ? 'Nom' : 'Name'), render: (r) => r.name || '—' },
      { key: 'status', label: (isFrench) => (isFrench ? 'Statut' : 'Status'), render: (r, isFrench) => statusLabel(r.status, isFrench) },
      { key: 'generation', label: (isFrench) => (isFrench ? 'Génération' : 'Generation'), render: (r) => r.generation ?? '—' },
      { key: 'peopleGroup', label: (isFrench) => (isFrench ? 'Peuple' : 'People group'), render: peopleGroupName },
      { key: 'village', label: 'Village', render: villageName },
      { key: 'memberCount', label: (isFrench) => (isFrench ? 'Membres' : 'Members'), render: (r) => r.memberCount ?? '—' },
      { key: 'baptizedCount', label: (isFrench) => (isFrench ? 'Baptisés' : 'Baptized'), render: (r) => r.baptizedCount ?? '—' },
    ]}
  />
)

export default ChurchesList
