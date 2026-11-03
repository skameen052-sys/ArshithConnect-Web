import api from './api';

/**
 * WorkUpdateService - Daily Standup Logs, Work Schedules & Submission Management
 * Connected to FastAPI backend with Firestore & PostgreSQL dual-persistence
 */
export const workUpdateService = {
  /**
   * Retrieve today's work schedules and real-time availability window for employee
   */
  async getTodaySchedules() {
    try {
      const response = await api.get('/api/work-updates/today-schedules');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Could not fetch today work schedules');
    }
  },

  /**
   * Submit an employee daily work update for a specific schedule/section
   */
  async submitWorkUpdate(payload) {
    try {
      const response = await api.post('/api/work-updates', {
        scheduleId: payload.scheduleId,
        section: payload.section,
        workSchedule: payload.workSchedule,
        submissionWindow: payload.submissionWindow,
        scheduleName: payload.scheduleName,
        updateText: payload.updateText || payload.tasksCompleted,
        date: payload.date,
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Failed to submit work update');
    }
  },

  /**
   * Retrieve all employee work updates with filtering (Admin & Employee)
   */
  async getWorkUpdates(params = {}) {
    try {
      const response = await api.get('/api/work-updates', { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Could not fetch work updates');
    }
  },

  /**
   * Delete an individual work update document
   */
  async deleteWorkUpdate(docId, path = null) {
    try {
      const response = await api.delete(`/api/work-updates/${docId}`, {
        params: path ? { path } : {},
      });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Failed to delete work update');
    }
  },

  /**
   * Delete work updates in bulk (by date or all)
   */
  async deleteAllWorkUpdates(params = {}) {
    try {
      const response = await api.delete('/api/work-updates', { params });
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Failed to delete work updates');
    }
  },

  /**
   * Retrieve configured daily work schedules
   */
  async getWorkSchedules() {
    try {
      const response = await api.get('/api/work-schedules');
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Could not fetch work schedules');
    }
  },

  /**
   * Create a new work schedule (Admin only)
   */
  async createWorkSchedule(data) {
    try {
      const response = await api.post('/api/work-schedules', data);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Failed to create work schedule');
    }
  },

  /**
   * Update an existing work schedule (Admin only)
   */
  async updateWorkSchedule(id, data) {
    try {
      const response = await api.put(`/api/work-schedules/${id}`, data);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Failed to update work schedule');
    }
  },

  /**
   * Delete a work schedule (Admin only)
   */
  async deleteWorkSchedule(id) {
    try {
      const response = await api.delete(`/api/work-schedules/${id}`);
      return response.data;
    } catch (error) {
      throw new Error(error.response?.data?.detail || error.response?.data?.message || 'Failed to delete work schedule');
    }
  },
};

export default workUpdateService;
