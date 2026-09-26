import { personsOfPeaceApi } from '../../services/api'
import PillarListPage from './PillarListPage'

const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR')
}
const villageName = (r) => r.village?.name || r.village || '—'

const PersonsOfPeace = () => (
  <PillarListPage
    title="Personnes de paix"
    subtitle="Pilier DMM transverse — personnes de paix identifiées, tous peuples confondus."
    queryKey="pillar-persons-of-peace"
    fetcher={() => personsOfPeaceApi.list({ limit: 500 })}
    columns={[
      { key: 'name', label: 'Nom', render: (r) => r.name || '—' },
      { key: 'status', label: 'Statut', render: (r) => r.status || '—' },
      { key: 'village', label: 'Village', render: villageName },
      { key: 'createdAt', label: 'Créé le', render: (r) => fmtDate(r.createdAt) },
    ]}
  />
)

export default PersonsOfPeace
