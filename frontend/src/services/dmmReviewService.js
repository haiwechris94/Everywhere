/**
 * DMM Review Service
 * Handles API calls for the DMM match review queue (approve/reject merge candidates)
 */
import api from './api'

/**
 * DMM Review API endpoints
 */
export const dmmReviewApi = {
  /**
   * Get the review queue (paginated, optionally filtered by country)
   * @param {Object} params - Query parameters (page, limit, country)
   * @returns {Promise} Review queue with pagination metadata
   */
  getQueue: (params) => api.get('/api/dmm-review/queue', { params }),

  /**
   * Get the count of pending matches awaiting review
   * @returns {Promise} Pending count
   */
  getCount: () => api.get('/api/dmm-review/queue/count'),

  /**
   * Approve a match (merge candidate)
   * @param {string} matchId - Match record ID
   * @returns {Promise} Approval confirmation
   */
  approve: (matchId) => api.post(`/api/dmm-review/${matchId}/approve`),

  /**
   * Reject a match with an optional reason
   * @param {string} matchId - Match record ID
   * @param {string} reason - Rejection reason
   * @returns {Promise} Rejection confirmation
   */
  reject: (matchId, reason) => api.post(`/api/dmm-review/${matchId}/reject`, { reason }),
}

export default dmmReviewApi
