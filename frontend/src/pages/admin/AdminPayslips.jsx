import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, Download, Search, RefreshCw, Eye, CheckCircle2, 
  Calendar, Users, DollarSign, X, Check, AlertTriangle, Clock,
  ShieldCheck, FileCheck, AlertCircle, Filter, ChevronRight, User,
  Building2
} from 'lucide-react';
import payslipService from '../../services/payslipService';

export default function AdminPayslips() {
  const [activeTab, setActiveTab] = useState('requests'); // 'requests' | 'directory'
  
  // Data States
  const [summary, setSummary] = useState({
    total_requests: 0,
    pending_requests: 0,
    approved_requests: 0,
    rejected_requests: 0,
  });
  const [requests, setRequests] = useState([]);
  const [directoryPayslips, setDirectoryPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Filters for Requests
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [monthFilter, setMonthFilter] = useState('ALL');

  // Modal States
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [approveConfirmModal, setApproveConfirmModal] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [previewPayslip, setPreviewPayslip] = useState(null);

  // Load Requests from Backend
  const fetchRequests = useCallback(async () => {
    try {
      const params = {};
      if (statusFilter !== 'ALL') params.status = statusFilter;
      if (monthFilter !== 'ALL') params.month = parseInt(monthFilter, 10);
      if (searchTerm.trim()) params.search = searchTerm.trim();

      const data = await payslipService.getAdminRequests(params);
      if (data) {
        setSummary(data.summary || {
          total_requests: 0,
          pending_requests: 0,
          approved_requests: 0,
          rejected_requests: 0,
        });
        setRequests(data.requests || []);
      }
    } catch (err) {
      console.error('Failed to load payslip requests', err);
    }
  }, [statusFilter, monthFilter, searchTerm]);

  // Load Directory Payslips
  const fetchDirectory = useCallback(async () => {
    try {
      const slips = await payslipService.getPayslips();
      setDirectoryPayslips(slips || []);
    } catch (err) {
      console.error('Failed to load directory payslips', err);
    }
  }, []);

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.allSettled([fetchRequests(), fetchDirectory()]);
    setLoading(false);
  }, [fetchRequests, fetchDirectory]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  // Approve Request Handler
  const handleApprove = async () => {
    if (!approveConfirmModal) return;
    setActionLoading(true);
    setFeedback({ type: '', text: '' });

    try {
      const res = await payslipService.approveRequest(approveConfirmModal.id, approvalNotes.trim());
      setFeedback({
        type: 'success',
        text: res.message || `Request for ${approveConfirmModal.employee_name} approved successfully.`,
      });
      setApproveConfirmModal(null);
      setApprovalNotes('');
      await loadAllData();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to approve request.';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Reject Request Handler
  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectModal) return;
    if (!rejectionReason.trim()) {
      setFeedback({ type: 'error', text: 'A mandatory rejection reason must be provided.' });
      return;
    }

    setActionLoading(true);
    setFeedback({ type: '', text: '' });

    try {
      const res = await payslipService.rejectRequest(rejectModal.id, rejectionReason.trim());
      setFeedback({
        type: 'success',
        text: res.message || `Request for ${rejectModal.employee_name} was rejected.`,
      });
      setRejectModal(null);
      setRejectionReason('');
      await loadAllData();
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to reject request.';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setActionLoading(false);
    }
  };

  // Secure PDF Download Handler
  const handleDownload = async (targetId, empId, month, year) => {
    setDownloadingId(targetId);
    setFeedback({ type: '', text: '' });

    try {
      await payslipService.downloadPayslipPdf(targetId, `Payslip_${empId}_${month}_${year}.pdf`);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Failed to download payslip PDF.';
      setFeedback({ type: 'error', text: msg });
    } finally {
      setDownloadingId(null);
    }
  };

  const totalDisbursed = directoryPayslips.reduce((acc, p) => acc + (parseFloat(p.net_salary) || 0), 0);

  return (
    <div className="hrms-page-container animate-fade-in">
      {/* Top Header */}
      <div className="hrms-page-header">
        <div className="hrms-page-title-group">
          <h1>
            <FileText size={28} className="text-forest" />
            Payslip Management &amp; Approvals
          </h1>
          <p className="hrms-page-subtitle">
            Authorize employee payslip download requests, verify file availability, and audit issuance records.
          </p>
        </div>

        <div className="hrms-actions-group">
          <button type="button" className="hrms-btn-secondary" onClick={loadAllData} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Records</span>
          </button>
        </div>
      </div>

      {/* Alert Feedback */}
      {feedback.text && (
        <div
          style={{
            marginBottom: '1.25rem',
            padding: '12px 18px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.88rem',
            fontWeight: '600',
            backgroundColor: feedback.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: feedback.type === 'error' ? '#991b1b' : '#065f46',
            border: `1px solid ${feedback.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          }}
        >
          {feedback.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid #e2e8f0',
          marginBottom: '20px',
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab('requests')}
          style={{
            padding: '10px 20px',
            fontSize: '0.92rem',
            fontWeight: 700,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'requests' ? '3px solid #134e4a' : '3px solid transparent',
            color: activeTab === 'requests' ? '#134e4a' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <FileCheck size={18} />
          <span>Employee Download Requests</span>
          {summary.pending_requests > 0 && (
            <span
              style={{
                backgroundColor: '#fef3c7',
                color: '#92400e',
                fontSize: '0.72rem',
                padding: '2px 8px',
                borderRadius: '999px',
                fontWeight: 800,
              }}
            >
              {summary.pending_requests} Pending
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('directory')}
          style={{
            padding: '10px 20px',
            fontSize: '0.92rem',
            fontWeight: 700,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'directory' ? '3px solid #134e4a' : '3px solid transparent',
            color: activeTab === 'directory' ? '#134e4a' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Building2 size={18} />
          <span>Generated Payslips Registry</span>
          <span
            style={{
              backgroundColor: '#eff6ff',
              color: '#1d4ed8',
              fontSize: '0.72rem',
              padding: '2px 8px',
              borderRadius: '999px',
              fontWeight: 800,
            }}
          >
            {directoryPayslips.length}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PAYSLIP DOWNLOAD REQUESTS MANAGEMENT                               */}
      {/* ========================================================================= */}
      {activeTab === 'requests' && (
        <>
          {/* Summary KPI Cards */}
          <div className="hrms-metrics-grid" style={{ marginBottom: '20px' }}>
            <div className="hrms-metric-card">
              <div className="hrms-metric-header">
                <span className="hrms-metric-label">Total Requests</span>
                <div className="hrms-metric-icon-wrap" style={{ backgroundColor: '#eff6ff', color: '#2563eb' }}>
                  <FileText size={18} />
                </div>
              </div>
              <div className="hrms-metric-value">{summary.total_requests}</div>
              <div className="hrms-metric-subtext">All submitted employee requests</div>
            </div>

            <div className="hrms-metric-card" style={{ borderLeft: '4px solid #f59e0b' }}>
              <div className="hrms-metric-header">
                <span className="hrms-metric-label">Pending Approval</span>
                <div className="hrms-metric-icon-wrap" style={{ backgroundColor: '#fffbeb', color: '#b45309' }}>
                  <Clock size={18} />
                </div>
              </div>
              <div className="hrms-metric-value" style={{ color: '#b45309' }}>
                {summary.pending_requests}
              </div>
              <div className="hrms-metric-subtext">Awaiting administrative decision</div>
            </div>

            <div className="hrms-metric-card" style={{ borderLeft: '4px solid #10b981' }}>
              <div className="hrms-metric-header">
                <span className="hrms-metric-label">Approved &amp; Unlocked</span>
                <div className="hrms-metric-icon-wrap" style={{ backgroundColor: '#ecfdf5', color: '#047857' }}>
                  <CheckCircle2 size={18} />
                </div>
              </div>
              <div className="hrms-metric-value" style={{ color: '#047857' }}>
                {summary.approved_requests}
              </div>
              <div className="hrms-metric-subtext">Secure downloads authorized</div>
            </div>

            <div className="hrms-metric-card" style={{ borderLeft: '4px solid #ef4444' }}>
              <div className="hrms-metric-header">
                <span className="hrms-metric-label">Declined Requests</span>
                <div className="hrms-metric-icon-wrap" style={{ backgroundColor: '#fef2f2', color: '#b91c1c' }}>
                  <AlertTriangle size={18} />
                </div>
              </div>
              <div className="hrms-metric-value" style={{ color: '#b91c1c' }}>
                {summary.rejected_requests}
              </div>
              <div className="hrms-metric-subtext">Requests rejected with feedback</div>
            </div>
          </div>

          {/* Search & Filter Bar */}
          <div className="hrms-card" style={{ marginBottom: '18px' }}>
            <div className="hrms-card-body" style={{ padding: '14px 20px' }}>
              <div className="hrms-filter-bar" style={{ margin: 0, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                <div className="hrms-search-input-wrap" style={{ flex: '1 1 260px' }}>
                  <Search size={16} />
                  <input
                    type="text"
                    className="hrms-input"
                    placeholder="Search by employee name, ID, code or month..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <select
                  className="hrms-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  style={{ width: '180px' }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="PENDING">Pending Only</option>
                  <option value="APPROVED">Approved Only</option>
                  <option value="REJECTED">Declined Only</option>
                </select>

                <select
                  className="hrms-select"
                  value={monthFilter}
                  onChange={(e) => setMonthFilter(e.target.value)}
                  style={{ width: '160px' }}
                >
                  <option value="ALL">All Months</option>
                  <option value="1">January</option>
                  <option value="2">February</option>
                  <option value="3">March</option>
                  <option value="4">April</option>
                  <option value="5">May</option>
                  <option value="6">June</option>
                  <option value="7">July</option>
                  <option value="8">August</option>
                  <option value="9">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
              </div>
            </div>
          </div>

          {/* Requests Table */}
          <div className="hrms-card">
            <div className="hrms-table-container">
              <table className="hrms-table">
                <thead>
                  <tr>
                    <th>Employee Name</th>
                    <th>Employee ID</th>
                    <th>Payslip Month</th>
                    <th>Reason for Request</th>
                    <th>Additional Details</th>
                    <th>Request Date</th>
                    <th>Request Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.length === 0 ? (
                    <tr>
                      <td colSpan="8">
                        <div className="hrms-empty-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                          <FileCheck size={40} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
                          <h4 style={{ margin: '0 0 4px', color: '#334155', fontWeight: 700 }}>No requests match the criteria</h4>
                          <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                            Adjust your status or month filters to inspect employee requests.
                          </p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    requests.map((r) => {
                      const isPending = r.status === 'PENDING';
                      const isApproved = r.status === 'APPROVED';
                      const isRejected = r.status === 'REJECTED';

                      return (
                        <tr key={r.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              <div
                                style={{
                                  width: '32px',
                                  height: '32px',
                                  borderRadius: '50%',
                                  backgroundColor: '#eff6ff',
                                  color: '#2563eb',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontWeight: 700,
                                  fontSize: '0.85rem',
                                  flexShrink: 0,
                                }}
                              >
                                {r.employee_name?.charAt(0).toUpperCase()}
                              </div>
                              <div>
                                <strong style={{ color: '#0f172a' }}>{r.employee_name}</strong>
                                <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{r.employee_email}</div>
                              </div>
                            </div>
                          </td>

                          <td>
                            <span style={{ fontWeight: 700, color: '#134e4a' }}>{r.employee_id}</span>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.request_code}</div>
                          </td>

                          <td>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>{r.payslip_month}</span>
                          </td>

                          <td>
                            <div style={{ fontWeight: 600, color: '#334155', fontSize: '0.82rem' }}>{r.reason}</div>
                          </td>

                          <td>
                            <div
                              style={{
                                fontSize: '0.78rem',
                                color: r.additional_details ? '#475569' : '#94a3b8',
                                maxWidth: '200px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                fontStyle: r.additional_details ? 'normal' : 'italic',
                              }}
                              title={r.additional_details || 'No additional details provided'}
                            >
                              {r.additional_details || 'None'}
                            </div>
                          </td>

                          <td>
                            <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                              {r.submitted_at?.split('T')[0]}
                            </div>
                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                              {r.submitted_at?.split('T')[1]?.substring(0, 5)} UTC
                            </div>
                          </td>

                          <td>
                            {isApproved && (
                              <span className="hrms-badge hrms-badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <CheckCircle2 size={12} /> Approved
                              </span>
                            )}
                            {isPending && (
                              <span
                                className="hrms-badge"
                                style={{
                                  backgroundColor: '#fffbeb',
                                  color: '#b45309',
                                  borderColor: '#fde68a',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                              >
                                <Clock size={12} /> Pending Review
                              </span>
                            )}
                            {isRejected && (
                              <span className="hrms-badge hrms-badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                <AlertTriangle size={12} /> Declined
                              </span>
                            )}
                          </td>

                          <td>
                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                              {isPending && (
                                <>
                                  <button
                                    type="button"
                                    className="hrms-btn-primary"
                                    style={{
                                      padding: '0.35rem 0.65rem',
                                      fontSize: '0.75rem',
                                      backgroundColor: '#059669',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                    onClick={() => setApproveConfirmModal(r)}
                                    title="Approve download authorization"
                                  >
                                    <Check size={12} />
                                    <span>Approve</span>
                                  </button>

                                  <button
                                    type="button"
                                    className="hrms-btn-secondary"
                                    style={{
                                      padding: '0.35rem 0.65rem',
                                      fontSize: '0.75rem',
                                      color: '#b91c1c',
                                      borderColor: '#fca5a5',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '4px',
                                    }}
                                    onClick={() => {
                                      setRejectModal(r);
                                      setRejectionReason('');
                                    }}
                                    title="Decline download authorization"
                                  >
                                    <X size={12} />
                                    <span>Reject</span>
                                  </button>
                                </>
                              )}

                              <button
                                type="button"
                                className="hrms-btn-secondary"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.75rem',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                onClick={() => setSelectedRequest(r)}
                                title="View full request history & audit"
                              >
                                <Eye size={12} />
                                <span>Details</span>
                              </button>

                              <button
                                type="button"
                                className="hrms-btn-secondary"
                                style={{
                                  padding: '0.35rem 0.65rem',
                                  fontSize: '0.75rem',
                                  backgroundColor: isApproved ? '#eff6ff' : '#ffffff',
                                  color: isApproved ? '#2563eb' : '#475569',
                                  borderColor: isApproved ? '#93c5fd' : '#cbd5e1',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: '4px',
                                }}
                                onClick={() => handleDownload(r.id, r.employee_id, r.month, r.year)}
                                disabled={downloadingId === r.id}
                                title="Inspect or stream official PDF"
                              >
                                <Download size={12} />
                                <span>{downloadingId === r.id ? 'Loading...' : 'PDF'}</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: GENERATED PAYSLIPS REGISTRY (EXISTING DIRECTORY)                   */}
      {/* ========================================================================= */}
      {activeTab === 'directory' && (
        <>
          <div className="hrms-metrics-grid" style={{ marginBottom: '20px' }}>
            <div className="hrms-metric-card">
              <div className="hrms-metric-header">
                <span className="hrms-metric-label">Published Payslips</span>
                <div className="hrms-metric-icon-wrap"><FileText size={18} /></div>
              </div>
              <div className="hrms-metric-value">{directoryPayslips.length}</div>
              <div className="hrms-metric-subtext">Archived in digital registry</div>
            </div>

            <div className="hrms-metric-card">
              <div className="hrms-metric-header">
                <span className="hrms-metric-label">Total Net Compensation</span>
                <div className="hrms-metric-icon-wrap"><DollarSign size={18} /></div>
              </div>
              <div className="hrms-metric-value">₹{totalDisbursed.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
              <div className="hrms-metric-subtext">Disbursed salary value</div>
            </div>
          </div>

          <div className="hrms-card">
            <div className="hrms-table-container">
              <table className="hrms-table">
                <thead>
                  <tr>
                    <th>Payslip Reference</th>
                    <th>Employee</th>
                    <th>Period</th>
                    <th>Payable Days</th>
                    <th>Gross Pay</th>
                    <th>Total Deductions</th>
                    <th>Net Salary</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {directoryPayslips.length === 0 ? (
                    <tr>
                      <td colSpan="8">
                        <div className="hrms-empty-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                          <Building2 size={36} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
                          <p>No generated payslips found in registry.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    directoryPayslips.map((p) => {
                      const pId = p.id || p._firestore_id || p.payslip_number;
                      return (
                        <tr key={pId}>
                          <td>
                            <strong>{p.payslip_number || pId}</strong>
                            <div className="hrms-metric-subtext">{p.generated_at?.split('T')[0]}</div>
                          </td>
                          <td>
                            <strong>{p.employee_name}</strong>
                            <div className="hrms-metric-subtext">{p.employee_id} &bull; {p.department}</div>
                          </td>
                          <td>{p.month_name || p.month} {p.year}</td>
                          <td>
                            <span style={{ color: '#16a34a', fontWeight: '600' }}>{p.payable_days} Days</span>
                          </td>
                          <td>₹{parseFloat(p.gross_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td style={{ color: '#dc2626' }}>- ₹{parseFloat(p.total_deductions || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                          <td>
                            <strong style={{ color: '#134e4a', fontSize: '0.95rem' }}>
                              ₹{parseFloat(p.net_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </strong>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.5rem' }}>
                              <button
                                type="button"
                                className="hrms-btn-secondary"
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                onClick={() => setPreviewPayslip(p)}
                                title="Quick Preview"
                              >
                                <Eye size={13} /> View
                              </button>
                              <button
                                type="button"
                                className="hrms-btn-primary"
                                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
                                onClick={() => handleDownload(pId, p.employee_id, p.month, p.year)}
                                disabled={downloadingId === pId}
                                title="Download PDF"
                              >
                                <Download size={13} /> {downloadingId === pId ? 'Downloading...' : 'PDF'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* APPROVAL CONFIRMATION MODAL                                              */}
      {/* ========================================================================= */}
      {approveConfirmModal && (
        <div className="hrms-modal-overlay" onClick={() => setApproveConfirmModal(null)}>
          <div className="hrms-modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="hrms-modal-header">
              <h3 className="hrms-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#047857' }}>
                <CheckCircle2 size={20} /> Authorize Payslip Download
              </h3>
              <button type="button" className="hrms-modal-close" onClick={() => setApproveConfirmModal(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="hrms-modal-body">
              <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#334155', lineHeight: '1.5' }}>
                Are you sure you want to approve the payslip download request for <strong>{approveConfirmModal.employee_name}</strong> ({approveConfirmModal.employee_id}) for <strong>{approveConfirmModal.payslip_month}</strong>?
              </p>

              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', padding: '12px 14px', marginBottom: '14px', fontSize: '0.82rem', color: '#166534' }}>
                <strong>Audit Note:</strong> Approving unlocks direct PDF downloads for the employee in their portal. This action is permanently logged with your administrative ID.
              </div>

              <div className="hrms-form-group">
                <label className="hrms-label">Administrative Notes (Optional):</label>
                <input
                  type="text"
                  className="hrms-input"
                  placeholder="e.g. Authorized for bank loan verification"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                />
              </div>
            </div>

            <div className="hrms-modal-footer">
              <button type="button" className="hrms-btn-secondary" onClick={() => setApproveConfirmModal(null)} disabled={actionLoading}>
                Cancel
              </button>
              <button
                type="button"
                className="hrms-btn-primary"
                style={{ backgroundColor: '#059669', display: 'flex', alignItems: 'center', gap: '6px' }}
                onClick={handleApprove}
                disabled={actionLoading}
              >
                {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                <span>Confirm &amp; Unlock</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MANDATORY REJECTION REASON MODAL                                         */}
      {/* ========================================================================= */}
      {rejectModal && (
        <div className="hrms-modal-overlay" onClick={() => setRejectModal(null)}>
          <div className="hrms-modal-content" style={{ maxWidth: '480px' }} onClick={(e) => e.stopPropagation()}>
            <div className="hrms-modal-header">
              <h3 className="hrms-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#b91c1c' }}>
                <AlertTriangle size={20} /> Decline Payslip Download Request
              </h3>
              <button type="button" className="hrms-modal-close" onClick={() => setRejectModal(null)}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleReject}>
              <div className="hrms-modal-body">
                <p style={{ margin: '0 0 1rem 0', fontSize: '0.9rem', color: '#334155' }}>
                  Declining request for <strong>{rejectModal.employee_name}</strong> for <strong>{rejectModal.payslip_month}</strong>.
                </p>

                <div className="hrms-form-group">
                  <label className="hrms-label" style={{ fontWeight: 700 }}>
                    Mandatory Rejection Reason <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <textarea
                    rows={3}
                    required
                    className="hrms-input"
                    placeholder="Explain why this request is declined (e.g., Attendance discrepancies pending resolution / Please consult HR directly)..."
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                  />
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                    This reason will be displayed directly to the employee on their portal dashboard.
                  </div>
                </div>
              </div>

              <div className="hrms-modal-footer">
                <button type="button" className="hrms-btn-secondary" onClick={() => setRejectModal(null)} disabled={actionLoading}>
                  Cancel
                </button>
                <button
                  type="submit"
                  className="hrms-btn-danger"
                  style={{ backgroundColor: '#dc2626', color: '#ffffff', display: 'flex', alignItems: 'center', gap: '6px' }}
                  disabled={actionLoading}
                >
                  {actionLoading ? <RefreshCw size={14} className="animate-spin" /> : <X size={14} />}
                  <span>Decline Request</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* DETAILED REQUEST AUDIT MODAL                                              */}
      {/* ========================================================================= */}
      {selectedRequest && (
        <div className="hrms-modal-overlay" onClick={() => setSelectedRequest(null)}>
          <div className="hrms-modal-content" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
            <div className="hrms-modal-header">
              <h3 className="hrms-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShieldCheck size={20} className="text-forest" />
                Request Audit Lifecycle &bull; {selectedRequest.request_code}
              </h3>
              <button type="button" className="hrms-modal-close" onClick={() => setSelectedRequest(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="hrms-modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Employee Name</span>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedRequest.employee_name}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Staff Code</span>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedRequest.employee_id}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Salary Month</span>
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{selectedRequest.payslip_month}</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Current Status</span>
                  <div style={{ marginTop: '2px' }}>
                    <span className={`hrms-badge ${selectedRequest.status === 'APPROVED' ? 'hrms-badge-success' : selectedRequest.status === 'REJECTED' ? 'hrms-badge-danger' : 'hrms-badge-warning'}`}>
                      {selectedRequest.status}
                    </span>
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Stated Purpose / Reason</span>
                  <div style={{ fontWeight: 600, color: '#334155' }}>{selectedRequest.reason}</div>
                  {selectedRequest.additional_details && (
                    <div style={{ marginTop: '4px', padding: '8px 12px', backgroundColor: '#f8fafc', borderRadius: '6px', fontSize: '0.82rem', color: '#475569' }}>
                      {selectedRequest.additional_details}
                    </div>
                  )}
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Submitted At</span>
                  <div style={{ color: '#334155' }}>{selectedRequest.submitted_at?.replace('T', ' ').substring(0, 19)} UTC</div>
                </div>
                <div>
                  <span style={{ color: '#64748b', fontSize: '0.75rem', textTransform: 'uppercase' }}>Reviewed By</span>
                  <div style={{ color: '#334155' }}>{selectedRequest.reviewed_by || 'Pending Review'}</div>
                </div>
                {selectedRequest.rejection_reason && (
                  <div style={{ gridColumn: '1 / -1', backgroundColor: '#fef2f2', border: '1px solid #fecaca', padding: '10px 14px', borderRadius: '6px' }}>
                    <span style={{ color: '#991b1b', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>Rejection Reason:</span>
                    <div style={{ color: '#b91c1c', marginTop: '2px' }}>{selectedRequest.rejection_reason}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="hrms-modal-footer">
              <button type="button" className="hrms-btn-secondary" onClick={() => setSelectedRequest(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK VIEW STATEMENT PREVIEW MODAL                                        */}
      {/* ========================================================================= */}
      {previewPayslip && (
        <div className="hrms-modal-overlay" onClick={() => setPreviewPayslip(null)}>
          <div className="hrms-modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="hrms-modal-header">
              <h3 className="hrms-modal-title">Payslip Details ({previewPayslip.payslip_number})</h3>
              <button type="button" className="hrms-modal-close" onClick={() => setPreviewPayslip(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="hrms-modal-body">
              <div style={{ backgroundColor: '#f0fdf4', padding: '1rem', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '1.25rem', textAlign: 'center' }}>
                <div style={{ fontSize: '0.85rem', color: '#166534' }}>Net Take-Home Pay</div>
                <div style={{ fontSize: '1.75rem', fontWeight: '700', color: '#134e4a' }}>
                  ₹{parseFloat(previewPayslip.net_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                  Period: {previewPayslip.month_name || previewPayslip.month} {previewPayslip.year}
                </div>
              </div>
            </div>

            <div className="hrms-modal-footer">
              <button type="button" className="hrms-btn-secondary" onClick={() => setPreviewPayslip(null)}>
                Close
              </button>
              <button
                type="button"
                className="hrms-btn-primary"
                onClick={() => handleDownload(previewPayslip.id || previewPayslip.payslip_number, previewPayslip.employee_id, previewPayslip.month, previewPayslip.year)}
              >
                <Download size={14} /> Download PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
