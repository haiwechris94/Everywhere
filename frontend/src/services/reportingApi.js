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
  getRegion: (regionId, params = {}) =>
    api.get(`/api/reporting/regions/${regionId}`, { params }),
  getRegionCountry: (regionId, code, params = {}) =>
    api.get(`/api/reporting/regions/${regionId}/countries/${code}`, { params }),
  getPeoples: (params = {}) => api.get('/api/reporting/peoples', { params }),
  getPerson: (id) => api.get(`/api/master-people/${id}/profile`),
}

export default reportingApi
