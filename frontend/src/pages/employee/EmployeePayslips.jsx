import React, { useState, useEffect, useMemo } from 'react';
import { 
  FileText, Download, Eye, Calendar, CheckCircle2, 
  RefreshCw, X, Lock, Clock, AlertTriangle, Send, ShieldCheck, 
  Building2, User, Hash, AlertCircle, FileCheck, Check, RotateCcw,
  Info, ChevronRight
} from 'lucide-react';
import payslipService from '../../services/payslipService';
import { employeeService } from '../../services/employeeService';

export default function EmployeePayslips() {
  const [activeTab, setActiveTab] = useState('request'); // 'request' | 'history' | 'registry'
  const [profile, setProfile] = useState(null);
  const [myRequests, setMyRequests] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [feedback, setFeedback] = useState({ type: '', text: '' });

  // Form State
  const [selectedMonth, setSelectedMonth] = useState('');
  const [selectedReason, setSelectedReason] = useState('Personal financial records');
  const [additionalDetails, setAdditionalDetails] = useState('');

  // Selected statement for preview modal
  const [selectedPayslip, setSelectedPayslip] = useState(null);

  // Fallback to localStorage user
  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('arshith_user')) || null;
    } catch {
      return null;
    }
  })();

  const employeeName = profile?.fullName || profile?.name || storedUser?.name || 'Employee';
  const employeeId = profile?.employeeId || profile?.id || storedUser?.employeeId || 'AFI-001';

  // Compute valid past and current salary months (up to current month, no future months)
  const validMonths = useMemo(() => {
    const list = [];
    const now = new Date();
    // Default reference is October 2026 or current year
    const refYear = 2026;
    const refMonth = 10; // October
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Generate past 12 months up to current month (October 2026)
    for (let i = 0; i < 12; i++) {
      let m = refMonth - i;
      let y = refYear;
      if (m <= 0) {
        m += 12;
        y -= 1;
      }
      list.push({
        month: m,
        year: y,
        label: `${monthNames[m - 1]} ${y}`,
        value: `${m}-${y}`,
      });
    }
    return list;
  }, []);

  // Initialize selectedMonth to latest valid month
  useEffect(() => {
    if (validMonths.length > 0 && !selectedMonth) {
      setSelectedMonth(validMonths[0].value);
    }
  }, [validMonths, selectedMonth]);

  // Load profile, requests, and payslips
  const loadData = async () => {
    setLoading(true);
    try {
      const [profData, reqsData, slipsData] = await Promise.allSettled([
        employeeService.getProfile('me'),
        payslipService.getMyRequests(),
        payslipService.getPayslips(),
      ]);

      if (profData.status === 'fulfilled' && profData.value) {
        setProfile(profData.value);
      }
      if (reqsData.status === 'fulfilled' && reqsData.value) {
        setMyRequests(reqsData.value);
      }
      if (slipsData.status === 'fulfilled' && slipsData.value) {
        setPayslips(slipsData.value);
      }
    } catch (err) {
      console.warn('Error loading payslip management data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Check if current selected month in the form already has a request
  const currentMonthRequest = useMemo(() => {
    if (!selectedMonth || !myRequests) return null;
    const [m, y] = selectedMonth.split('-').map(Number);
    return myRequests.find((r) => r.month === m && r.year === y) || null;
  }, [selectedMonth, myRequests]);

  // Form Reset
  const handleResetForm = () => {
    if (validMonths.length > 0) {
      setSelectedMonth(validMonths[0].value);
    }
    setSelectedReason('Personal financial records');
    setAdditionalDetails('');
    setFeedback({ type: '', text: '' });
  };

  // Form Submit Handler
  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    if (submitting) return;

    if (!selectedMonth) {
      setFeedback({ type: 'error', text: 'Please select a valid salary month.' });
      return;
    }

    if (currentMonthRequest && currentMonthRequest.status === 'PENDING') {
      setFeedback({
        type: 'error',
        text: `You already have a pending payslip request for ${currentMonthRequest.payslip_month}. Please wait for administrator approval.`,
      });
      return;
    }

    setSubmitting(true);
    setFeedback({ type: '', text: '' });

    const [m, y] = selectedMonth.split('-').map(Number);

    try {
      const res = await payslipService.submitRequest({
        month: m,
        year: y,
        reason: selectedReason,
        additional_details: additionalDetails.trim(),
      });

      setFeedback({
        type: 'success',
        text: res.message || 'Payslip request submitted successfully. Awaiting administrator approval.',
      });

      // Refresh requests list
      const updatedReqs = await payslipService.getMyRequests();
      setMyRequests(updatedReqs);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || err.message || 'Failed to submit payslip request.';
      setFeedback({
        type: 'error',
        text: errorMsg,
      });
    } finally {
      setSubmitting(false);
    }
  };

  // PDF Download Handler
  const handleDownload = async (targetId, fallbackMonth, fallbackYear) => {
    setDownloadingId(targetId);
    setFeedback({ type: '', text: '' });

    const cleanEmp = employeeId.replace(/\s+/g, '_');
    const safeFilename = `Payslip_${cleanEmp}_${fallbackMonth}_${fallbackYear}.pdf`;

    try {
      await payslipService.downloadPayslipPdf(targetId, safeFilename);
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Could not download payslip. Please verify unlock approval status.';
      setFeedback({
        type: 'error',
        text: msg,
      });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="hrms-page-container animate-fade-in" style={{ maxWidth: '100%', boxSizing: 'border-box' }}>
      {/* Top Header */}
      <div className="hrms-page-header">
        <div className="hrms-page-title-group">
          <h1>
            <FileText size={26} className="text-forest" />
            Payslip Management
          </h1>
          <p className="hrms-page-subtitle">
            Request official salary statements, monitor administrative approval status, and securely download high-resolution PDF payslips.
          </p>
        </div>

        <div className="hrms-actions-group">
          <button
            type="button"
            className="hrms-btn-secondary"
            onClick={loadData}
            disabled={loading}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
            <span>Refresh Status</span>
          </button>
        </div>
      </div>

      {/* Global Alert Notification */}
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

      {/* Navigation Tabs matching screenshot design */}
      <div
        style={{
          display: 'flex',
          gap: '8px',
          borderBottom: '2px solid #e2e8f0',
          marginBottom: '24px',
          overflowX: 'auto',
        }}
      >
        <button
          type="button"
          onClick={() => {
            setActiveTab('request');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
          style={{
            padding: '10px 18px',
            fontSize: '0.9rem',
            fontWeight: 700,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'request' ? '3px solid #134e4a' : '3px solid transparent',
            color: activeTab === 'request' ? '#134e4a' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <FileCheck size={18} />
          <span>Payslip Download Request</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('history');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
          style={{
            padding: '10px 18px',
            fontSize: '0.9rem',
            fontWeight: 700,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'history' ? '3px solid #134e4a' : '3px solid transparent',
            color: activeTab === 'history' ? '#134e4a' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <Clock size={18} />
          <span>My Request History</span>
          {myRequests.length > 0 && (
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
              {myRequests.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab('registry');
            window.scrollTo({ top: 0, behavior: 'instant' });
          }}
          style={{
            padding: '10px 18px',
            fontSize: '0.9rem',
            fontWeight: 700,
            border: 'none',
            background: 'none',
            cursor: 'pointer',
            borderBottom: activeTab === 'registry' ? '3px solid #134e4a' : '3px solid transparent',
            color: activeTab === 'registry' ? '#134e4a' : '#64748b',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.2s ease',
          }}
        >
          <Eye size={18} />
          <span>Statement Previews</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PAYSLIP DOWNLOAD REQUEST FORM                                      */}
      {/* ========================================================================= */}
      {activeTab === 'request' && (
        <div style={{ maxWidth: '850px', margin: '0 auto', width: '100%', boxSizing: 'border-box' }}>
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 4px 18px rgba(0, 0, 0, 0.04)',
              overflow: 'hidden',
              marginBottom: '36px',
              boxSizing: 'border-box',
              maxWidth: '100%',
            }}
          >
            {/* Card Header with subtle light-blue background highlight */}
            <div
              style={{
                backgroundColor: '#f8fafc',
                borderBottom: '1px solid #e2e8f0',
                padding: '20px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '10px',
                    backgroundColor: '#eff6ff',
                    color: '#2563eb',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                    Payslip Download Request Form
                  </h2>
                  <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
                    Corporate Policy: Official salary statements require administrator authorization prior to file unlock.
                  </p>
                </div>
              </div>

              {/* Status Indicator for Current Selection */}
              {currentMonthRequest && (
                <div>
                  {currentMonthRequest.status === 'PENDING' && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#fffbeb',
                        color: '#b45309',
                        border: '1px solid #fde68a',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      <Clock size={14} />
                      <span>Pending Approval</span>
                    </span>
                  )}
                  {currentMonthRequest.status === 'APPROVED' && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#ecfdf5',
                        color: '#047857',
                        border: '1px solid #a7f3d0',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      <CheckCircle2 size={14} />
                      <span>Approved &amp; Unlocked</span>
                    </span>
                  )}
                  {currentMonthRequest.status === 'REJECTED' && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        backgroundColor: '#fef2f2',
                        color: '#b91c1c',
                        border: '1px solid #fecaca',
                        padding: '6px 12px',
                        borderRadius: '8px',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                      }}
                    >
                      <AlertTriangle size={14} />
                      <span>Request Declined</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Existing Status Notice Banner */}
            {currentMonthRequest && (
              <div
                style={{
                  padding: '14px 24px',
                  backgroundColor: currentMonthRequest.status === 'PENDING' ? '#eff6ff' : currentMonthRequest.status === 'APPROVED' ? '#f0fdf4' : '#fff1f2',
                  borderBottom: '1px solid #e2e8f0',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <Info size={18} style={{ color: currentMonthRequest.status === 'PENDING' ? '#2563eb' : currentMonthRequest.status === 'APPROVED' ? '#16a34a' : '#e11d48' }} />
                  <span style={{ fontSize: '0.85rem', color: '#1e293b' }}>
                    {currentMonthRequest.status === 'PENDING' && (
                      <>
                        Your payslip request for <strong>{currentMonthRequest.payslip_month}</strong> is <strong>awaiting administrator approval</strong> (Ref: {currentMonthRequest.request_code}).
                      </>
                    )}
                    {currentMonthRequest.status === 'APPROVED' && (
                      <>
                        Your request for <strong>{currentMonthRequest.payslip_month}</strong> has been <strong>approved</strong>. You may download your official PDF below.
                      </>
                    )}
                    {currentMonthRequest.status === 'REJECTED' && (
                      <>
                        Your request for <strong>{currentMonthRequest.payslip_month}</strong> was declined: <em>"{currentMonthRequest.rejection_reason || 'Administrative restriction'}"</em>.
                      </>
                    )}
                  </span>
                </div>

                {currentMonthRequest.status === 'APPROVED' && (
                  <button
                    type="button"
                    onClick={() => handleDownload(currentMonthRequest.id, currentMonthRequest.month, currentMonthRequest.year)}
                    disabled={downloadingId === currentMonthRequest.id}
                    className="hrms-btn-primary"
                    style={{
                      padding: '6px 14px',
                      fontSize: '0.8rem',
                      backgroundColor: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                    }}
                  >
                    <Download size={14} />
                    <span>{downloadingId === currentMonthRequest.id ? 'Downloading...' : 'Download Unlocked PDF'}</span>
                  </button>
                )}
              </div>
            )}

            {/* The Form */}
            <form onSubmit={handleSubmitRequest} style={{ padding: '24px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '20px' }}>
                {/* 1. Employee Name (Read-only) */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#334155',
                      marginBottom: '6px',
                    }}
                  >
                    <User size={15} style={{ color: '#64748b' }} />
                    <span>Employee Name</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>(Read-only)</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={employeeName}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'not-allowed',
                    }}
                  />
                </div>

                {/* 2. Employee ID (Read-only) */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#334155',
                      marginBottom: '6px',
                    }}
                  >
                    <Hash size={15} style={{ color: '#64748b' }} />
                    <span>Employee ID</span>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 'normal' }}>(Read-only)</span>
                  </label>
                  <input
                    type="text"
                    readOnly
                    value={employeeId}
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      backgroundColor: '#f1f5f9',
                      color: '#475569',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'not-allowed',
                    }}
                  />
                </div>

                {/* 3. Payslip Month Dropdown */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#334155',
                      marginBottom: '6px',
                    }}
                  >
                    <Calendar size={15} style={{ color: '#2563eb' }} />
                    <span>Payslip Month &amp; Year *</span>
                  </label>
                  <select
                    value={selectedMonth}
                    onChange={(e) => {
                      setSelectedMonth(e.target.value);
                      setFeedback({ type: '', text: '' });
                    }}
                    required
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #93c5fd',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    {validMonths.map((vm) => (
                      <option key={vm.value} value={vm.value}>
                        {vm.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 4. Reason for Request Dropdown */}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      color: '#334155',
                      marginBottom: '6px',
                    }}
                  >
                    <ShieldCheck size={15} style={{ color: '#2563eb' }} />
                    <span>Reason for Request *</span>
                  </label>
                  <select
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                    required
                    style={{
                      width: '100%',
                      height: '42px',
                      padding: '0 12px',
                      borderRadius: '8px',
                      border: '1.5px solid #93c5fd',
                      backgroundColor: '#ffffff',
                      color: '#0f172a',
                      fontSize: '0.88rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      outline: 'none',
                    }}
                  >
                    <option value="Personal financial records">Personal financial records</option>
                    <option value="Bank loan application">Bank loan application</option>
                    <option value="Income verification">Income verification</option>
                    <option value="Visa or official documentation">Visa or official documentation</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                {/* 5. Additional Details (Multiline with live 0/500 character counter) */}
                <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                    <label
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: '#334155',
                      }}
                    >
                      Additional Details <span style={{ fontWeight: 'normal', color: '#64748b' }}>(Optional)</span>
                    </label>
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: additionalDetails.length > 450 ? '#dc2626' : '#64748b',
                        fontWeight: 600,
                      }}
                    >
                      {additionalDetails.length}/500
                    </span>
                  </div>
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={additionalDetails}
                    onChange={(e) => setAdditionalDetails(e.target.value)}
                    placeholder="Provide any specific requirements, institution reference, or urgent notes for the administrative officer..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.88rem',
                      lineHeight: '1.5',
                      outline: 'none',
                      resize: 'vertical',
                      backgroundColor: '#ffffff',
                    }}
                  />
                </div>
              </div>

              {/* Form Action Buttons */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  gap: '12px',
                  marginTop: '24px',
                  paddingTop: '16px',
                  borderTop: '1px solid #f1f5f9',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={handleResetForm}
                  disabled={submitting}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '9px 18px',
                    backgroundColor: '#f1f5f9',
                    color: '#475569',
                    border: '1px solid #cbd5e1',
                    borderRadius: '8px',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  <RotateCcw size={15} />
                  <span>Reset</span>
                </button>

                <button
                  type="submit"
                  disabled={submitting || (currentMonthRequest && currentMonthRequest.status === 'PENDING')}
                  className="hrms-btn-primary"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '9px 24px',
                    backgroundColor: currentMonthRequest && currentMonthRequest.status === 'PENDING' ? '#94a3b8' : '#134e4a',
                    cursor: (currentMonthRequest && currentMonthRequest.status === 'PENDING') || submitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  {submitting ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Submitting Request...</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} />
                      <span>Submit Request</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MY PAYSLIP REQUEST HISTORY                                         */}
      {/* ========================================================================= */}
      {activeTab === 'history' && (
        <div className="hrms-card animate-fade-in">
          <div className="hrms-card-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                My Payslip Download Requests
              </h3>
              <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
                Track the approval lifecycle of your submitted download requests
              </p>
            </div>
          </div>

          <div className="hrms-table-container">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Request Code</th>
                  <th>Salary Month</th>
                  <th>Reason for Request</th>
                  <th>Submission Date</th>
                  <th>Status</th>
                  <th>Admin Review</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {myRequests.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <div className="hrms-empty-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                        <Clock size={36} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
                        <h4 style={{ margin: '0 0 4px', color: '#334155', fontWeight: 700 }}>No requests submitted yet</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                          Use the Request Form tab above to submit an unlock authorization request for any month.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  myRequests.map((req) => {
                    const isApproved = req.status === 'APPROVED';
                    const isPending = req.status === 'PENDING';
                    const isRejected = req.status === 'REJECTED';

                    return (
                      <tr key={req.id}>
                        <td>
                          <strong>{req.request_code || req.id}</strong>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{req.payslip_month}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: '#334155' }}>{req.reason}</div>
                          {req.additional_details && (
                            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px', maxWidth: '240px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {req.additional_details}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ fontSize: '0.82rem', color: '#475569' }}>
                            {req.submitted_at?.split('T')[0] || 'Today'}
                          </div>
                          <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                            {req.submitted_at?.split('T')[1]?.substring(0, 5) || ''} UTC
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
                          {isApproved && (
                            <div style={{ fontSize: '0.78rem', color: '#047857' }}>
                              Authorized by {req.reviewed_by || 'HR Admin'}
                            </div>
                          )}
                          {isPending && (
                            <div style={{ fontSize: '0.78rem', color: '#b45309', fontStyle: 'italic' }}>
                              Awaiting admin approval
                            </div>
                          )}
                          {isRejected && (
                            <div style={{ fontSize: '0.78rem', color: '#b91c1c' }}>
                              Reason: {req.rejection_reason || 'Declined'}
                            </div>
                          )}
                        </td>
                        <td>
                          {isApproved ? (
                            <button
                              type="button"
                              className="hrms-btn-primary"
                              style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.78rem',
                                backgroundColor: '#059669',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                              }}
                              onClick={() => handleDownload(req.id, req.month, req.year)}
                              disabled={downloadingId === req.id}
                              title="Download official PDF file"
                            >
                              <Download size={13} />
                              <span>{downloadingId === req.id ? 'Downloading...' : 'Download PDF'}</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="hrms-btn-secondary"
                              style={{
                                padding: '0.4rem 0.85rem',
                                fontSize: '0.78rem',
                                opacity: 0.6,
                                cursor: 'not-allowed',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '5px',
                              }}
                              disabled
                              title="Download locked until administrator approval"
                            >
                              <Lock size={13} />
                              <span>Locked</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: STATEMENT PREVIEWS (COMPANY ARCHIVE)                              */}
      {/* ========================================================================= */}
      {activeTab === 'registry' && (
        <div className="hrms-card animate-fade-in">
          <div className="hrms-card-header" style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
              Official Monthly Statement Directory
            </h3>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
              Preview itemized company calculations and deduction breakdowns
            </p>
          </div>

          <div className="hrms-table-container">
            <table className="hrms-table">
              <thead>
                <tr>
                  <th>Payslip Ref</th>
                  <th>Salary Period</th>
                  <th>Payable Days</th>
                  <th>Gross Salary</th>
                  <th>Deductions</th>
                  <th>Net Take-Home</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody>
                {payslips.length === 0 ? (
                  <tr>
                    <td colSpan="7">
                      <div className="hrms-empty-state" style={{ padding: '3rem 1rem', textAlign: 'center' }}>
                        <FileText size={36} style={{ color: '#94a3b8', margin: '0 auto 12px' }} />
                        <h4 style={{ margin: '0 0 4px', color: '#334155', fontWeight: 700 }}>No statements published yet</h4>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                          Statements will appear here once monthly payroll is finalized by administration.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  payslips.map((p) => {
                    const pId = p.id || p._firestore_id || p.payslip_number;
                    return (
                      <tr key={pId}>
                        <td>
                          <strong>{p.payslip_number || pId}</strong>
                        </td>
                        <td>
                          <span style={{ fontWeight: 700, color: '#0f172a' }}>{p.month_name || p.month} {p.year}</span>
                        </td>
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
                          <button
                            type="button"
                            className="hrms-btn-secondary"
                            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                            onClick={() => setSelectedPayslip(p)}
                            title="Inspect official payslip preview"
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* OFFICIAL COMPANY STATEMENT PREVIEW MODAL                                  */}
      {/* ========================================================================= */}
      {selectedPayslip && (
        <div className="hrms-modal-overlay" onClick={() => setSelectedPayslip(null)}>
          <div className="hrms-modal-content" style={{ maxWidth: '860px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
            <div className="hrms-modal-header">
              <h3 className="hrms-modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Building2 size={20} className="text-forest" />
                Arshith Fresh India Pvt Ltd &bull; Official Payslip Preview
              </h3>
              <button type="button" className="hrms-modal-close" onClick={() => setSelectedPayslip(null)}>
                <X size={20} />
              </button>
            </div>

            <div className="hrms-modal-body" style={{ maxHeight: '78vh', overflowY: 'auto' }}>
              <div style={{ border: '2px solid #000000', padding: '1.25rem', backgroundColor: '#ffffff', color: '#000000', fontFamily: 'Inter, system-ui, sans-serif' }}>
                {/* Header */}
                <div style={{ textAlign: 'center', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '1.35rem', fontWeight: '800', letterSpacing: '0.02em', textTransform: 'uppercase' }}>
                    ARSHITH FRESH INDIA PVT LTD
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#222222', marginTop: '0.2rem' }}>
                    Bangalore, Karnataka, Pincode: 560102
                  </div>
                </div>

                {/* Shaded Period Banner */}
                <div style={{ backgroundColor: '#d1d5db', border: '1px solid #000000', textAlign: 'center', padding: '0.35rem 0', fontWeight: '700', fontSize: '0.9rem', marginBottom: '0.75rem' }}>
                  Payslip for the Month of : {selectedPayslip.month_name || selectedPayslip.month} {selectedPayslip.year}
                </div>

                {/* 3-Column Metadata Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.2fr 0.9fr', gap: '0.5rem 1.5rem', fontSize: '0.8rem', marginBottom: '0.85rem', lineHeight: '1.45' }}>
                  <div>
                    <div><strong>Employee Code:</strong> {selectedPayslip.employee_code || selectedPayslip.employeeId || selectedPayslip.employee_id || 'AFI-XXXX'}</div>
                    <div><strong>Name:</strong> {selectedPayslip.employee_name || 'Employee name'}</div>
                    <div><strong>Date of Joining:</strong> {selectedPayslip.date_of_joining || '16-Jan-2025'}</div>
                    <div><strong>Location:</strong> {selectedPayslip.location || 'Bangalore'}</div>
                    <div><strong>Department:</strong> {selectedPayslip.department || 'Operations'}</div>
                    <div><strong>Designation:</strong> {selectedPayslip.designation || 'WEB DEVELOPER'}</div>
                  </div>

                  <div>
                    <div><strong>Bank Name.:</strong> {selectedPayslip.bank_name || selectedPayslip.bankName || '—'}</div>
                    <div><strong>Bank Account No.:</strong> {selectedPayslip.account_number || selectedPayslip.accountNumber || '—'}</div>
                    <div><strong>PAN.:</strong> {selectedPayslip.pan_number || selectedPayslip.panNumber || '—'}</div>
                    <div><strong>UAN.:</strong> {selectedPayslip.uan_number || selectedPayslip.uanNumber || '—'}</div>
                  </div>

                  <div>
                    <div><strong>Paid Days:</strong> {parseFloat(selectedPayslip.payable_days || selectedPayslip.total_days || 31).toFixed(1)}</div>
                    <div><strong>LOP Days:</strong> {selectedPayslip.unpaid_days || 0}</div>
                    <div><strong>Arrear Days:</strong> 0.0</div>
                    <div><strong>Days in Month:</strong> {parseFloat(selectedPayslip.total_days || 31).toFixed(1)}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1.5px solid #000000', margin: '0.65rem 0' }} />

                {/* Financial Table */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0', fontSize: '0.8rem', border: '1px solid #000000' }}>
                  <div style={{ borderRight: '1.5px solid #000000', padding: '0.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr', fontWeight: '700', borderBottom: '1px solid #000000', paddingBottom: '0.35rem', marginBottom: '0.4rem', textDecoration: 'underline' }}>
                      <span>Earning</span>
                      <span style={{ textAlign: 'right' }}>Master</span>
                      <span style={{ textAlign: 'right' }}>Paid</span>
                      <span style={{ textAlign: 'right' }}>Arrear</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr', padding: '0.2rem 0' }}>
                      <span>Basic</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.basic_salary || 17500).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.paid_basic || selectedPayslip.basic_salary || 17500).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>0.00</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr', padding: '0.2rem 0' }}>
                      <span>HRA</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.hra || 10500).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.paid_hra || selectedPayslip.hra || 10500).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>0.00</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr', padding: '0.2rem 0' }}>
                      <span>OTHER ALLOWANCES</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.other_allowances || 7000).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.paid_other || selectedPayslip.other_allowances || 7000).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>0.00</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1.2fr 0.8fr', fontWeight: '700', borderTop: '1px solid #000000', borderBottom: '1px solid #000000', padding: '0.35rem 0', marginTop: '0.5rem' }}>
                      <span>Total Earnings</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.gross_salary || 35000).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.adjusted_gross || selectedPayslip.gross_salary || 35000).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>0.00</span>
                    </div>
                  </div>

                  <div style={{ padding: '0.5rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr', fontWeight: '700', borderBottom: '1px solid #000000', paddingBottom: '0.35rem', marginBottom: '0.4rem', textDecoration: 'underline' }}>
                      <span>Deduction</span>
                      <span style={{ textAlign: 'right' }}>Amount</span>
                      <span style={{ textAlign: 'right' }}>Arrear</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr', padding: '0.2rem 0' }}>
                      <span>PF</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.employee_pf || 1800).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>0.00</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr', padding: '0.2rem 0' }}>
                      <span>Professional Tax</span>
                      <span style={{ textAlign: 'right' }}>{parseFloat(selectedPayslip.professional_tax || 200).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>0.00</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr', fontWeight: '700', borderTop: '1px solid #000000', borderBottom: '1px solid #000000', padding: '0.35rem 0', marginTop: '1.25rem' }}>
                      <span>Total Deductions</span>
                      <span style={{ textAlign: 'right', color: '#dc2626' }}>{parseFloat(selectedPayslip.total_deductions || 2000).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      <span style={{ textAlign: 'right' }}>0.00</span>
                    </div>
                  </div>
                </div>

                {/* Net Pay Banner */}
                <div style={{ padding: '0.5rem', marginTop: '0.5rem', backgroundColor: '#f3f4f6', border: '1px solid #000000', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: '700', fontSize: '0.85rem' }}>
                    Net Amount Payable: ₹{parseFloat(selectedPayslip.net_salary || 33000).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </div>
                  <div style={{ fontSize: '0.75rem', fontStyle: 'italic' }}>
                    Ref: {selectedPayslip.payslip_number || selectedPayslip.id}
                  </div>
                </div>
              </div>
            </div>

            <div className="hrms-modal-footer">
              <button type="button" className="hrms-btn-secondary" onClick={() => setSelectedPayslip(null)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
