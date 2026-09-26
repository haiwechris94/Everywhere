import { discoveryGroupsApi } from '../../services/api'
import PillarListPage from './PillarListPage'

const villageName = (r) => r.village?.name || r.village || '—'

const DiscoveryGroups = () => (
  <PillarListPage
    title="Groupes de découverte"
    subtitle="Pilier DMM transverse — groupes de découverte (DBS discovery groups), tous peuples confondus."
    queryKey="pillar-discovery-groups"
    fetcher={() => discoveryGroupsApi.list({ limit: 500 })}
    columns={[
      { key: 'name', label: 'Nom', render: (r) => r.name || '—' },
      { key: 'status', label: 'Statut', render: (r) => r.status || '—' },
      { key: 'village', label: 'Village', render: villageName },
      {
        key: 'memberCount',
        label: 'Membres',
        render: (r) => r.memberCount ?? r.members?.length ?? '—',
      },
    ]}
  />
)

export default DiscoveryGroups
