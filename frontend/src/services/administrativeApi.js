import api from './api'

/**
 * Administrative API wrapper (Cameroon hierarchy)
 * Backed by backend/routes/administrative.js
 * Response shapes:
 *  - getRegions()      -> { success, count, regions: [...] }
 *  - getDepartments()  -> { success, count, departments: [...] }
 *  - getSubdivisions() -> { success, count, subdivisions: [...] }
 *  - getVillages()     -> { success, count, villages: [...] }
 */
export const administrativeApi = {
  getRegions: () => api.get('/api/administrative/regions'),
  getDepartments: (region) =>
    api.get('/api/administrative/departments', { params: region ? { region } : {} }),
  getSubdivisions: (department) =>
    api.get('/api/administrative/subdivisions', { params: department ? { department } : {} }),
  getVillages: (subdivision) =>
    api.get('/api/administrative/villages', { params: subdivision ? { subdivision } : {} }),
}

export default administrativeApi
