import { discoveryGroupsApi } from '../../services/api'
import PillarListPage from './PillarListPage'

const villageName = (r) => r.village?.name || r.village || '—'

const DiscoveryGroups = () => (
  <PillarListPage
    title={(isFrench) => (isFrench ? 'Groupes de découverte' : 'Discovery groups')}
    subtitle={(isFrench) =>
      isFrench
        ? 'Pilier DMM transverse — groupes de découverte (DBS discovery groups), tous peuples confondus.'
        : 'Cross-cutting DMM pillar — discovery groups (DBS discovery groups), across all people groups.'}
    queryKey="pillar-discovery-groups"
    fetcher={() => discoveryGroupsApi.list({ limit: 500 })}
    columns={[
      { key: 'name', label: (isFrench) => (isFrench ? 'Nom' : 'Name'), render: (r) => r.name || '—' },
      { key: 'status', label: (isFrench) => (isFrench ? 'Statut' : 'Status'), render: (r) => r.status || '—' },
      { key: 'village', label: 'Village', render: villageName },
      {
        key: 'memberCount',
        label: (isFrench) => (isFrench ? 'Membres' : 'Members'),
        render: (r) => r.memberCount ?? r.members?.length ?? '—',
      },
    ]}
  />
)

export default DiscoveryGroups
