/**
 * Persons API Service
 * CRUD for the people registry (directors, church planters, coordinators).
 * Backed by backend/routes/persons.js (mounted at /api/persons).
 */
import api from './api'

export const personsApi = {
  /**
   * List persons.
   * @param {Object} params - role, country, countryCode, region, admin2, admin3,
   *                           search, page, limit, includeArchived, onlyArchived
   */
  getAll: (params = {}) => api.get('/api/persons', { params }),
  getById: (id) => api.get(`/api/persons/${id}`),
  create: (data) => api.post('/api/persons', data),
  update: (id, data) => api.put(`/api/persons/${id}`, data),
  archive: (id) => api.patch(`/api/persons/${id}/archive`),
  unarchive: (id) => api.patch(`/api/persons/${id}/unarchive`),
  remove: (id) => api.delete(`/api/persons/${id}`),
}

export default personsApi
