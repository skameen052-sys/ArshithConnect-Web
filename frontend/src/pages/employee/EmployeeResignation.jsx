import React, { useState, useEffect } from 'react';
import { 
  UserMinus, CheckCircle2, Clock, AlertTriangle, Download, 
  Send, RefreshCw, X, XCircle, Info, FileText 
} from 'lucide-react';
import separationService from '../../services/separationService';

export default function EmployeeResignation() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [isReapplying, setIsReapplying] = useState(false);

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('arshith_user')) || null;
    } catch {
      return null;
    }
  })();
  const employeeId = storedUser?.employeeId || storedUser?.employee_id || storedUser?.id || storedUser?.uid || '';
  const employeeName = storedUser?.name || storedUser?.fullName || storedUser?.full_name || 'Employee';
  const employeeEmail = storedUser?.email || '';
  const employeeDept = storedUser?.department || storedUser?.dept || 'Operations';

  const [formState, setFormState] = useState({
    reason: '',
    intended_last_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    notice_period_days: 30,
  });

  const fetchMyResignation = async () => {
    setLoading(true);
    try {
      const data = await separationService.getRequests(employeeId || storedUser?.email);
      setRequests(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
      setError('Failed to fetch separation records.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyResignation();
  }, [employeeId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!window.confirm('Are you sure you want to submit your formal resignation? This will initiate the official HR exit procedure.')) {
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await separationService.submitResignation({
        employee_id: employeeId,
        employee_name: employeeName,
        employee_email: employeeEmail,
        department: employeeDept,
        reason: formState.reason.trim(),
        intended_last_date: formState.intended_last_date,
        notice_period_days: parseInt(formState.notice_period_days, 10) || 30,
      });
      setSuccessMsg('Formal resignation submitted successfully. HR Administration has been notified.');
      setIsReapplying(false);
      fetchMyResignation();
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to submit resignation.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadStatement = async (separationId) => {
    try {
      await separationService.downloadStatementPdf(separationId, `My_FnF_Statement_${employeeId}.pdf`);
    } catch (err) {
      alert('Could not download FnF Statement PDF.');
    }
  };

  const activeReq = requests.length > 0 ? requests[0] : null;

  const getStatusBadge = (status) => {
    const s = (status || 'SUBMITTED').toUpperCase();
    if (s === 'SETTLED') return <span className="hrms-badge hrms-badge-success"><CheckCircle2 size={12} /> FULL & FINAL SETTLED</span>;
    if (s === 'APPROVED') return <span className="hrms-badge hrms-badge-info"><CheckCircle2 size={12} /> APPROVED BY HR</span>;
    if (s === 'REJECTED') return <span className="hrms-badge" style={{ backgroundColor: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5' }}><XCircle size={12} /> REJECTED BY HR</span>;
    return <span className="hrms-badge hrms-badge-warning"><Clock size={12} /> AWAITING HR REVIEW</span>;
  };

  return (
    <div className="hrms-page-container animate-fade-in" style={{ maxWidth: '100%', boxSizing: 'border-box', marginBottom: '36px' }}>
      {/* Header */}
      <div className="hrms-page-header">
        <div className="hrms-page-title-group">
          <h1><UserMinus size={28} className="text-forest" /> Resignation & Full-and-Final (FnF)</h1>
          <p className="hrms-page-subtitle">
            Submit formal resignation, track handover notice period, and download official Full & Final settlement statements.
          </p>
        </div>

        <div className="hrms-actions-group">
          <button type="button" className="hrms-btn-secondary" onClick={fetchMyResignation} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="hrms-card" style={{ borderColor: '#fca5a5', backgroundColor: '#fef2f2', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#991b1b' }}>
            <AlertTriangle size={18} />
            <span>{error}</span>
          </div>
        </div>
      )}

      {successMsg && (
        <div className="hrms-card" style={{ borderColor: '#86efac', backgroundColor: '#f0fdf4', padding: '1rem', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#166534' }}>
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        </div>
      )}

      {/* Active Resignation Status View */}
      {activeReq && !isReapplying ? (
        <div className="hrms-card">
          <div className="hrms-card-header">
            <h2 className="hrms-card-title"><Clock size={20} /> Exit Process Status</h2>
            {getStatusBadge(activeReq.status)}
          </div>

          <div className="hrms-card-body">
            {/* Status-specific Alerts */}
            {activeReq.status === 'SUBMITTED' && (
              <div style={{ backgroundColor: '#fffbeb', border: '1px solid #fde68a', borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <Clock size={20} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#92400e' }}>
                    Resignation Application Under HR Review
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#78350f', marginTop: '3px', lineHeight: 1.4 }}>
                    Your formal resignation request has been forwarded to HR Administration. Your reporting manager and administration are verifying your notice period and exit handover schedule.
                  </div>
                </div>
              </div>
            )}

            {activeReq.status === 'APPROVED' && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <CheckCircle2 size={20} color="#15803d" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#166534' }}>
                    Resignation Approved by HR Administration
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#14532d', marginTop: '3px', lineHeight: 1.4 }}>
                    Your resignation has been officially accepted. Please coordinate with your department lead to complete all project knowledge transfers and clearance procedures before your official last working day.
                  </div>
                  {activeReq.notes && (
                    <div style={{ marginTop: '8px', fontSize: '0.825rem', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #dcfce7', color: '#166534' }}>
                      <strong>HR Instructions:</strong> {activeReq.notes}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeReq.status === 'REJECTED' && (
              <div style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '14px 16px', marginBottom: '1.5rem', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                <XCircle size={20} color="#dc2626" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.925rem', fontWeight: 700, color: '#991b1b' }}>
                    Resignation Request Declined by HR
                  </div>
                  <div style={{ fontSize: '0.825rem', color: '#7f1d1d', marginTop: '3px', lineHeight: 1.4 }}>
                    Your resignation application could not be approved at this time. Please review the official comments below or discuss with your reporting manager.
                  </div>
                  <div style={{ marginTop: '8px', fontSize: '0.825rem', backgroundColor: '#ffffff', padding: '8px 12px', borderRadius: '6px', border: '1px solid #fee2e2', color: '#991b1b' }}>
                    <strong>HR Reason:</strong> {activeReq.rejection_reason || activeReq.notes || 'Please contact HR for details.'}
                  </div>
                  <div style={{ marginTop: '12px' }}>
                    <button
                      type="button"
                      className="hrms-btn-secondary"
                      style={{ padding: '0.4rem 0.85rem', fontSize: '0.8rem' }}
                      onClick={() => {
                        setIsReapplying(true);
                        setFormState((prev) => ({ ...prev, reason: '' }));
                      }}
                    >
                      Submit New Resignation Request
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Metrics Overview Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1.25rem', marginBottom: '1.5rem' }}>
              <div>
                <div className="hrms-metric-subtext">Resignation Submitted On</div>
                <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>
                  {activeReq.resignation_date || activeReq.created_at?.split('T')[0]}
                </div>
              </div>

              <div>
                <div className="hrms-metric-subtext">
                  {activeReq.status === 'APPROVED' || activeReq.status === 'SETTLED' ? 'Confirmed Last Working Day' : 'Intended Last Working Day'}
                </div>
                <div style={{ fontSize: '1.05rem', fontWeight: '700', color: activeReq.status === 'APPROVED' ? '#047857' : '#134e4a' }}>
                  {activeReq.last_working_date || activeReq.intended_last_date}
                </div>
              </div>

              <div>
                <div className="hrms-metric-subtext">Notice Period Commitment</div>
                <div style={{ fontSize: '1.05rem', fontWeight: '700', color: '#0f172a' }}>
                  {activeReq.notice_period_days || 30} Days
                  {activeReq.notice_shortfall_days > 0 && (
                    <span style={{ fontSize: '0.75rem', color: '#dc2626', marginLeft: '6px' }}>
                      ({activeReq.notice_shortfall_days} shortfall)
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div style={{ backgroundColor: '#f8fafc', padding: '1rem', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1.5rem' }}>
              <div style={{ fontSize: '0.85rem', fontWeight: '600', color: '#334155', marginBottom: '0.25rem' }}>Reason on Record:</div>
              <div style={{ fontSize: '0.85rem', color: '#64748b' }}>{activeReq.reason}</div>
            </div>

            {/* FnF Settlement Card */}
            {activeReq.status === 'SETTLED' && activeReq.fnf_settlement && (
              <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
                <div>
                  <span className="hrms-badge hrms-badge-success" style={{ marginBottom: '0.5rem' }}>
                    Statement Ready & Published
                  </span>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', color: '#134e4a' }}>
                    Net Settlement: ₹{parseFloat(activeReq.fnf_settlement.net_settlement || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#166534', marginTop: '2px' }}>
                    Includes prorated final month earnings, leave encashment, gratuity, and loan adjustments.
                  </div>
                </div>

                <button
                  type="button"
                  className="hrms-btn-primary"
                  onClick={() => handleDownloadStatement(activeReq.id || activeReq._firestore_id)}
                >
                  <Download size={15} /> Download FnF Statement PDF
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Resignation Submission Form */
        <div className="hrms-card" style={{ maxWidth: '720px', margin: '0 auto 36px auto', width: '100%', boxSizing: 'border-box' }}>
          <div className="hrms-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
            <h2 className="hrms-card-title"><UserMinus size={20} /> Formal Resignation Submission</h2>
            {isReapplying && (
              <button
                type="button"
                className="hrms-btn-secondary"
                style={{ padding: '0.25rem 0.65rem', fontSize: '0.75rem' }}
                onClick={() => setIsReapplying(false)}
              >
                Cancel Reapplication
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="hrms-card-body">
              <p style={{ fontSize: '0.85rem', color: '#64748b', marginBottom: '1.25rem' }}>
                Submitting this formal notice initiates your official handover notice period with HR Administration. Your request will reflect in the management dashboard for verification and approval.
              </p>

              <div className="hrms-form-group">
                <label>Intended Last Working Day *</label>
                <input
                  type="date"
                  className="hrms-input"
                  value={formState.intended_last_date}
                  onChange={(e) => setFormState({ ...formState, intended_last_date: e.target.value })}
                  required
                />
              </div>

              <div className="hrms-form-group">
                <label>Notice Period (Days) *</label>
                <input
                  type="number"
                  className="hrms-input"
                  value={formState.notice_period_days}
                  onChange={(e) => setFormState({ ...formState, notice_period_days: e.target.value })}
                  min="0"
                  required
                />
              </div>

              <div className="hrms-form-group">
                <label>Formal Reason for Separation *</label>
                <textarea
                  rows="4"
                  className="hrms-input"
                  placeholder="Provide your official reason for leaving..."
                  value={formState.reason}
                  onChange={(e) => setFormState({ ...formState, reason: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="hrms-card-header" style={{ justifyContent: 'flex-end', borderTop: '1px solid #f1f5f9', borderBottom: 'none', padding: '1rem 1.5rem', flexWrap: 'wrap', gap: '8px' }}>
              <button type="submit" className="hrms-btn-primary" disabled={submitting}>
                <Send size={15} /> {submitting ? 'Submitting to HR...' : 'Submit Resignation'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
