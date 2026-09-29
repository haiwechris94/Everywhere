import { dbsSessionsApi } from '../../services/api'
import PillarListPage from './PillarListPage'

const fmtDate = (v) => {
  if (!v) return '—'
  const d = new Date(v)
  return isNaN(d) ? '—' : d.toLocaleDateString('fr-FR')
}

const DbsSessions = () => (
  <PillarListPage
    title={(isFrench) => (isFrench ? 'Sessions DBS' : 'DBS Sessions')}
    subtitle={(isFrench) =>
      isFrench
        ? "Pilier DMM transverse — sessions d'études bibliques de découverte (Discovery Bible Study)."
        : 'Cross-cutting DMM pillar — Discovery Bible Study sessions.'}
    queryKey="pillar-dbs-sessions"
    fetcher={() => dbsSessionsApi.list({ limit: 500 })}
    searchText={(r) => `${r.title || r.name || ''} ${r.passage || ''} ${r.status || ''}`}
    columns={[
      { key: 'title', label: 'Session', render: (r) => r.title || r.name || '—' },
      { key: 'passage', label: 'Passage', render: (r) => r.passage || r.scripture || '—' },
      { key: 'date', label: 'Date', render: (r) => fmtDate(r.date || r.sessionDate || r.createdAt) },
      { key: 'status', label: (isFrench) => (isFrench ? 'Statut' : 'Status'), render: (r) => r.status || '—' },
    ]}
  />
)

export default DbsSessions
