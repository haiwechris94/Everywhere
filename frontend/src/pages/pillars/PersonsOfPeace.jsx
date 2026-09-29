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
    title={(isFrench) => (isFrench ? 'Personnes de paix' : 'Persons of peace')}
    subtitle={(isFrench) =>
      isFrench
        ? 'Pilier DMM transverse — personnes de paix identifiées, tous peuples confondus.'
        : 'Cross-cutting DMM pillar — identified persons of peace, across all people groups.'}
    queryKey="pillar-persons-of-peace"
    fetcher={() => personsOfPeaceApi.list({ limit: 500 })}
    columns={[
      { key: 'name', label: (isFrench) => (isFrench ? 'Nom' : 'Name'), render: (r) => r.name || '—' },
      { key: 'status', label: (isFrench) => (isFrench ? 'Statut' : 'Status'), render: (r) => r.status || '—' },
      { key: 'village', label: 'Village', render: villageName },
      { key: 'createdAt', label: (isFrench) => (isFrench ? 'Créé le' : 'Created on'), render: (r) => fmtDate(r.createdAt) },
    ]}
  />
)

export default PersonsOfPeace
