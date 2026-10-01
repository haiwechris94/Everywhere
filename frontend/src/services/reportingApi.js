import api from './api'

/**
 * Reporting / NG geography API wrapper.
 * Backed by backend/routes/reporting.js (mounted at /api/reporting) and
 * backend/routes/masterPeople.js (mounted at /api/master-people).
 *
 * Funnel: Regions -> Countries (per region) -> Peoples (per country) -> Person.
 *
 * Response shapes:
 *  - getRegions()        -> { data: [ { id, name, fullName, countryCount, countries:[{code,code3,name,nameEn,capital,...}] } ] }
 *  - getRegion(id)       -> { data: { id, name, fullName, countries:[...], metrics:<NUMREPORT> } }
 *  - getRegionCountry()  -> { data: { region:{id,name}, country:{...}, metrics:<NUMREPORT> } }
 *  - getPeoples(params)  -> { meta:{ totals, pagination }, data:[ { masterPeopleId, canonicalName, status, dmm, ... } ] }
 *  - getPerson(id)       -> { ...profile with nested `overview` }  (no dmm rollup)
 */
export const reportingApi = {
  getRegions: () => api.get('/api/reporting/regions'),
  // Flat list of every country across all regions, with per-country
  // { engagements, totalPGs, unreachedPGs } summaries for the Pays page.
  getCountries: (params = {}) => api.get('/api/reporting/countries', { params }),
  getRegion: (regionId, params = {}) =>
    api.get(`/api/reporting/regions/${regionId}`, { params }),
  getRegionCountry: (regionId, code, params = {}) =>
    api.get(`/api/reporting/regions/${regionId}/countries/${code}`, { params }),
  getPeoples: (params = {}) => api.get('/api/reporting/peoples', { params }),
  getPerson: (id) => api.get(`/api/master-people/${id}/profile`),
}

/**
 * Initiatives API wrapper — the special projects "ESP300" and "YCS".
 * Backed by backend/routes/initiatives.js (mounted at /api/initiatives).
 *
 *  - list()                      -> { data: [ { key, name, fullName, summary, setCount } ] }
 *  - membership(peopleId)        -> { data: { ESP300: bool, YCS: bool } }
 *  - get(key)                    -> { data: { key, name, fullName, summary, sets, peoples:[...] } }
 *  - getPeople(key, peopleId)    -> { data: { initiative, engagement } }
 *  - addPeople(key, body)        -> create/engage a people
 *  - updatePeople(key, id, body) -> update a people's engagement
 *  - removePeople(key, id)       -> remove a people's engagement
 */
export const initiativesApi = {
  list: () => api.get('/api/initiatives'),
  membership: (peopleId) => api.get('/api/initiatives/membership', { params: { peopleId } }),
  get: (key) => api.get(`/api/initiatives/${key}`),
  getPeople: (key, peopleId) => api.get(`/api/initiatives/${key}/peoples/${peopleId}`),
  addPeople: (key, body) => api.post(`/api/initiatives/${key}/peoples`, body),
  updatePeople: (key, peopleId, body) => api.put(`/api/initiatives/${key}/peoples/${peopleId}`, body),
  removePeople: (key, peopleId) => api.delete(`/api/initiatives/${key}/peoples/${peopleId}`),
}

export default reportingApi
