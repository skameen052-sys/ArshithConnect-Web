import api from './api';

export const payslipService = {
  // =========================================================================
  // Payslip Directory & Records
  // =========================================================================
  getPayslips: async () => {
    const response = await api.get('/api/payslips');
    return response.data;
  },

  getPayslip: async (id) => {
    const response = await api.get(`/api/payslips/${id}`);
    return response.data;
  },

  // =========================================================================
  // Official Payslip Download Request Module (User Spec)
  // =========================================================================

  /**
   * Submit an official payslip download request (Employee Portal)
   */
  submitRequest: async ({ month, year, reason, additional_details }) => {
    const response = await api.post('/api/payslip-requests', {
      month: parseInt(month, 10),
      year: parseInt(year, 10),
      reason,
      additional_details: additional_details || '',
    });
    return response.data;
  },

  /**
   * Retrieve personal payslip request history with live status (Employee Portal)
   */
  getMyRequests: async () => {
    const response = await api.get('/api/payslip-requests/my-requests');
    return response.data;
  },

  /**
   * Retrieve all employee payslip requests with search, filter, and KPI metrics (Admin Portal)
   */
  getAdminRequests: async (params = {}) => {
    const response = await api.get('/api/admin/payslip-requests', { params });
    return response.data;
  },

  /**
   * Get single request details for review (Admin Portal)
   */
  getAdminRequestById: async (id) => {
    const response = await api.get(`/api/admin/payslip-requests/${id}`);
    return response.data;
  },

  /**
   * Admin approves an employee's payslip download request
   */
  approveRequest: async (id, notes = '') => {
    const response = await api.patch(`/api/admin/payslip-requests/${id}/approve`, {
      notes,
    });
    return response.data;
  },

  /**
   * Admin rejects an employee's payslip download request with mandatory reason
   */
  rejectRequest: async (id, rejection_reason = '') => {
    const response = await api.patch(`/api/admin/payslip-requests/${id}/reject`, {
      rejection_reason,
    });
    return response.data;
  },

  // =========================================================================
  // Legacy Unlock Methods (Preserved for compatibility)
  // =========================================================================
  requestDownload: async (id, reason = '') => {
    const response = await api.post(`/api/payslips/${id}/request-download`, {
      reason,
    });
    return response.data;
  },

  getDownloadRequests: async () => {
    const response = await api.get('/api/payslips/requests/list');
    return response.data;
  },

  approveDownload: async (id, notes = '') => {
    const response = await api.post(`/api/payslips/${id}/approve-download`, {
      notes,
    });
    return response.data;
  },

  rejectDownload: async (id, reason = '') => {
    const response = await api.post(`/api/payslips/${id}/reject-download`, {
      reason,
    });
    return response.data;
  },

  // =========================================================================
  // High-Security PDF Streaming & Browser Download
  // =========================================================================
  downloadPayslipPdf: async (id, fallbackName = 'Payslip.pdf') => {
    // Try payslip-requests download first, fallback to payslips download
    const endpoint = String(id).startsWith('REQ-') || String(id).startsWith('PSR-')
      ? `/api/payslip-requests/${id}/download`
      : `/api/payslips/${id}/download`;

    const response = await api.get(endpoint, {
      responseType: 'blob',
    });

    const blob = new Blob([response.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;

    const disposition = response.headers['content-disposition'];
    let filename = fallbackName;
    if (disposition && disposition.indexOf('filename=') !== -1) {
      const match = disposition.match(/filename="?([^"]+)"?/);
      if (match && match[1]) {
        filename = match[1];
      }
    }

    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  },
};

export default payslipService;
