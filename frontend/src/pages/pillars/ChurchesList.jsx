import { churchesApi } from '../../services/api'
import PillarListPage from './PillarListPage'

const villageName = (r) => r.village?.name || r.village || '—'
const peopleGroupName = (r) => r.peopleGroup?.name || '—'

const statusLabel = (s) => {
  const map = {
    planning: 'Planification',
    planted: 'Plantée',
    growing: 'En croissance',
    multiplying: 'En multiplication',
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
    title="Églises"
    subtitle="Métrique de multiplication — églises plantées (généalogie, générations 1→4+), rattachées à un peuple."
    queryKey="pillar-churches"
    fetcher={() => churchesApi.getAll({ limit: 500 })}
    searchText={(r) => `${r.name || ''} ${r.status || ''} ${r.leader || ''}`}
    columns={[
      { key: 'name', label: 'Nom', render: (r) => r.name || '—' },
      { key: 'status', label: 'Statut', render: (r) => statusLabel(r.status) },
      { key: 'generation', label: 'Génération', render: (r) => r.generation ?? '—' },
      { key: 'peopleGroup', label: 'Peuple', render: peopleGroupName },
      { key: 'village', label: 'Village', render: villageName },
      { key: 'memberCount', label: 'Membres', render: (r) => r.memberCount ?? '—' },
      { key: 'baptizedCount', label: 'Baptisés', render: (r) => r.baptizedCount ?? '—' },
    ]}
  />
)

export default ChurchesList
