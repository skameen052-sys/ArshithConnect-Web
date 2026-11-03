import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Calendar,
  Briefcase,
  FileText,
  LogOut,
  CheckCircle,
  Plus,
  CalendarDays,
  Clock,
  AlertCircle,
  Receipt,
  Coins,
  Award,
  UserMinus,
  ChevronRight,
  Star,
  Sparkles,
  CheckCircle2,
  XCircle,
  CreditCard,
  Download,
  Landmark,
} from 'lucide-react';
import AttendanceCard from '../../components/employee/AttendanceCard';
import QuickActionCard from '../../components/employee/QuickActionCard';
import ApplyLeaveModal from '../../components/employee/ApplyLeaveModal';
import Modal from '../../components/common/Modal';
import { announcementService } from '../../services/announcementService';
import { meetingService } from '../../services/meetingService';
import { assignmentService } from '../../services/assignmentService';
import { holidayService } from '../../services/holidayService';
import { leaveService } from '../../services/leaveService';
import { performanceService } from '../../services/performanceService';
import { separationService } from '../../services/separationService';
import { loanService } from '../../services/loanService';
import { payslipService } from '../../services/payslipService';
import { authService } from '../../services/authService';
import { notificationService } from '../../services/notificationService';

export default function EmployeeDashboard() {
  const navigate = useNavigate();

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('arshith_user')) || null;
    } catch {
      return null;
    }
  })();
  const userGreetingName = storedUser?.name ? storedUser.name.split(' ')[0].toLowerCase() : 'employee';
  const employeeId = storedUser?.employeeId || storedUser?.employee_id || storedUser?.id || storedUser?.uid || '';

  // Modals for Quick Actions
  const [activeModal, setActiveModal] = useState(null); // 'announcements' | 'meetings' | 'assignments' | 'leaves'

  // Live data states
  const [announcements, setAnnouncements] = useState([]);
  const [meetings, setMeetings] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [latestReview, setLatestReview] = useState(null);
  const [latestResignation, setLatestResignation] = useState(null);
  const [latestLoan, setLatestLoan] = useState(null);
  const [latestPayslip, setLatestPayslip] = useState(null);
  const [downloadingPayslip, setDownloadingPayslip] = useState(false);

  // Dynamic notification counts for Quick Actions
  const [unreadCounts, setUnreadCounts] = useState(
    notificationService.getCachedCounts()
  );

  useEffect(() => {
    const unsub = notificationService.subscribe((summary) => {
      setUnreadCounts(summary);
    });
    return () => unsub();
  }, [employeeId]);

  const handleOpenQuickAction = (modalKey) => {
    setActiveModal(modalKey);
    notificationService.markAsRead(modalKey);
    setUnreadCounts((prev) => ({
      ...prev,
      [modalKey]: 0,
    }));
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [annRes, mtgRes, asgRes, holRes, perfRes, sepRes, loanRes, payslipRes] = await Promise.allSettled([
          announcementService.getAnnouncements(),
          meetingService.getMeetings(),
          assignmentService.getAssignments(),
          holidayService.getHolidays(),
          performanceService.getReviews(employeeId || storedUser?.email || null),
          separationService.getRequests(employeeId || storedUser?.email),
          loanService.getLoans(employeeId || storedUser?.email || null),
          payslipService.getPayslips(),
        ]);
        if (annRes.status === 'fulfilled' && Array.isArray(annRes.value)) setAnnouncements(annRes.value);
        if (mtgRes.status === 'fulfilled' && Array.isArray(mtgRes.value)) setMeetings(mtgRes.value);
        if (asgRes.status === 'fulfilled' && Array.isArray(asgRes.value)) setAssignments(asgRes.value);
        if (holRes.status === 'fulfilled' && Array.isArray(holRes.value)) setHolidays(holRes.value);
        if (perfRes.status === 'fulfilled' && Array.isArray(perfRes.value) && perfRes.value.length > 0) {
          setLatestReview(perfRes.value[0]);
        } else {
          setLatestReview(null);
        }
        if (sepRes.status === 'fulfilled' && Array.isArray(sepRes.value) && sepRes.value.length > 0) {
          setLatestResignation(sepRes.value[0]);
        } else {
          setLatestResignation(null);
        }
        if (loanRes.status === 'fulfilled' && Array.isArray(loanRes.value) && loanRes.value.length > 0) {
          setLatestLoan(loanRes.value[0]);
        } else {
          setLatestLoan(null);
        }
        if (payslipRes.status === 'fulfilled' && Array.isArray(payslipRes.value) && payslipRes.value.length > 0) {
          setLatestPayslip(payslipRes.value[0]);
        } else {
          setLatestPayslip(null);
        }
      } catch (err) {
        console.warn('Dashboard data fetch error', err);
      }
    };
    loadData();
  }, [employeeId]);

  const handleLogout = async () => {
    await authService.logout();
    navigate('/login');
  };

  return (
    <div className="employee-dashboard-content animate-fade-in">
      {/* Welcome Greeting (matches screenshot) */}
      <h1 className="employee-greeting-title">
        <span>Welcome,</span>
        <span style={{ textTransform: 'lowercase' }}>{userGreetingName}</span>
      </h1>

      {/* Main Today's Attendance Card */}
      <AttendanceCard />

      {/* Official Performance Appraisal Banner (when admin has submitted an appraisal) */}
      {latestReview && (
        <div
          onClick={() => navigate('/employee/performance')}
          style={{
            backgroundColor: '#ffffff',
            border: '1.5px solid #a7f3d0',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            marginBottom: '24px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
            boxShadow: '0 2px 10px rgba(11, 61, 43, 0.04)',
            transition: 'all 0.2s ease',
          }}
          title="Click to view your full performance scorecard & manager feedback"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: '#d1fae5',
                color: '#047857',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Award size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.925rem', fontWeight: 800, color: '#0b3d2b' }}>
                  Performance Appraisal Published
                </span>
                <span
                  style={{
                    fontSize: '0.75rem',
                    fontWeight: 800,
                    color: '#d97706',
                    backgroundColor: '#fef3c7',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  ⭐ {Number(latestReview.rating).toFixed(1)} / 5.0
                </span>
                {latestReview.recommended_increment_pct > 0 && (
                  <span
                    style={{
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      color: '#047857',
                      backgroundColor: '#d1fae5',
                      padding: '2px 8px',
                      borderRadius: '999px',
                    }}
                  >
                    +{latestReview.recommended_increment_pct}% Increment
                  </span>
                )}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                {latestReview.review_period} &bull; Evaluated by {latestReview.evaluated_by || 'Management'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#047857', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
            <span>View Appraisal</span>
            <ChevronRight size={18} />
          </div>
        </div>
      )}

      {/* Official Resignation / Exit Status Banner */}
      {latestResignation && (
        <div
          onClick={() => navigate('/employee/resignation')}
          style={{
            backgroundColor: '#ffffff',
            border: latestResignation.status === 'APPROVED' 
              ? '1.5px solid #a7f3d0' 
              : latestResignation.status === 'REJECTED' 
                ? '1.5px solid #fca5a5' 
                : latestResignation.status === 'SETTLED'
                  ? '1.5px solid #86efac'
                  : '1.5px solid #fde68a',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            marginBottom: '24px',
            background: latestResignation.status === 'APPROVED' 
              ? 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)' 
              : latestResignation.status === 'REJECTED' 
                ? 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)' 
                : latestResignation.status === 'SETTLED'
                  ? 'linear-gradient(135deg, #ffffff 0%, #ecfdf5 100%)'
                  : 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            transition: 'all 0.2s ease',
          }}
          title="Click to view separation & notice period details"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: latestResignation.status === 'APPROVED' 
                  ? '#d1fae5' 
                  : latestResignation.status === 'REJECTED' 
                    ? '#fee2e2' 
                    : latestResignation.status === 'SETTLED'
                      ? '#bbf7d0'
                      : '#fef3c7',
                color: latestResignation.status === 'APPROVED' 
                  ? '#047857' 
                  : latestResignation.status === 'REJECTED' 
                    ? '#b91c1c' 
                    : latestResignation.status === 'SETTLED'
                      ? '#15803d'
                      : '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {latestResignation.status === 'APPROVED' && <CheckCircle2 size={22} />}
              {latestResignation.status === 'REJECTED' && <XCircle size={22} />}
              {latestResignation.status === 'SETTLED' && <CheckCircle size={22} />}
              {latestResignation.status === 'SUBMITTED' && <Clock size={22} />}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.925rem', fontWeight: 800, color: latestResignation.status === 'REJECTED' ? '#991b1b' : '#0b3d2b' }}>
                  {latestResignation.status === 'APPROVED' && 'Resignation Approved by HR'}
                  {latestResignation.status === 'REJECTED' && 'Resignation Request Declined'}
                  {latestResignation.status === 'SETTLED' && 'Full & Final Settlement Settled'}
                  {latestResignation.status === 'SUBMITTED' && 'Resignation Under HR Review'}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: latestResignation.status === 'APPROVED' ? '#047857' : latestResignation.status === 'REJECTED' ? '#b91c1c' : '#b45309',
                    backgroundColor: latestResignation.status === 'APPROVED' ? '#d1fae5' : latestResignation.status === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  {latestResignation.status === 'APPROVED' ? 'APPROVED' : latestResignation.status === 'REJECTED' ? 'DECLINED' : latestResignation.status === 'SETTLED' ? 'SETTLED' : 'PENDING NOTICE'}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                {latestResignation.status === 'APPROVED' && `Official Last Day: ${latestResignation.last_working_date || latestResignation.intended_last_date} • Notice handover active`}
                {latestResignation.status === 'REJECTED' && `HR Remarks: ${latestResignation.rejection_reason || 'Please consult with HR or submit revised request'}`}
                {latestResignation.status === 'SETTLED' && `Statement Ready • Net: ₹${parseFloat(latestResignation.fnf_settlement?.net_settlement || 0).toLocaleString('en-IN')}`}
                {latestResignation.status === 'SUBMITTED' && `Submitted on ${latestResignation.resignation_date || latestResignation.created_at?.split('T')[0]} • ${latestResignation.notice_period_days || 30} Days Notice`}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#047857', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
            <span>View Exit Status</span>
            <ChevronRight size={18} />
          </div>
        </div>
      )}

      {/* Official Loan & Salary Advance Status Banner */}
      {latestLoan && (
        <div
          onClick={() => navigate('/employee/loans')}
          style={{
            backgroundColor: '#ffffff',
            border: ['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase())
              ? '1.5px solid #a7f3d0'
              : (latestLoan.status || '').toUpperCase() === 'REJECTED'
                ? '1.5px solid #fca5a5'
                : '1.5px solid #fde68a',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            marginBottom: '24px',
            background: ['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase())
              ? 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)'
              : (latestLoan.status || '').toUpperCase() === 'REJECTED'
                ? 'linear-gradient(135deg, #ffffff 0%, #fef2f2 100%)'
                : 'linear-gradient(135deg, #ffffff 0%, #fffbeb 100%)',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            transition: 'all 0.2s ease',
          }}
          title="Click to view loan details & repayment schedule"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                backgroundColor: ['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase())
                  ? '#d1fae5'
                  : (latestLoan.status || '').toUpperCase() === 'REJECTED'
                    ? '#fee2e2'
                    : '#fef3c7',
                color: ['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase())
                  ? '#047857'
                  : (latestLoan.status || '').toUpperCase() === 'REJECTED'
                    ? '#b91c1c'
                    : '#b45309',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <CreditCard size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.925rem', fontWeight: 800, color: (latestLoan.status || '').toUpperCase() === 'REJECTED' ? '#991b1b' : '#0b3d2b' }}>
                  {['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase())
                    ? `${latestLoan.loan_type} Approved`
                    : (latestLoan.status || '').toUpperCase() === 'REJECTED'
                      ? `${latestLoan.loan_type} Declined`
                      : `${latestLoan.loan_type} Under Review`}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: ['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase()) ? '#047857' : (latestLoan.status || '').toUpperCase() === 'REJECTED' ? '#b91c1c' : '#b45309',
                    backgroundColor: ['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase()) ? '#d1fae5' : (latestLoan.status || '').toUpperCase() === 'REJECTED' ? '#fee2e2' : '#fef3c7',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  {['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase()) ? 'APPROVED' : (latestLoan.status || '').toUpperCase() === 'REJECTED' ? 'REJECTED' : 'PENDING'}
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#134e4a', backgroundColor: '#e6fffa', padding: '2px 8px', borderRadius: '999px' }}>
                  ₹{parseFloat(latestLoan.principal_amount || 0).toLocaleString('en-IN')}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '2px' }}>
                {['APPROVED', 'ACTIVE'].includes((latestLoan.status || '').toUpperCase()) && (
                  <span>
                    Monthly EMI: ₹{parseFloat(latestLoan.monthly_installment || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })} &bull; Remaining: ₹{parseFloat(latestLoan.remaining_balance || 0).toLocaleString('en-IN')}
                    {latestLoan.approved_by ? ` &bull; Approved by ${latestLoan.approved_by}` : ''}
                  </span>
                )}
                {(latestLoan.status || '').toUpperCase() === 'REJECTED' && (
                  <span>
                    {latestLoan.rejection_reason || 'Application was declined during administrative verification.'}
                  </span>
                )}
                {(latestLoan.status || '').toUpperCase() === 'PENDING' && (
                  <span>
                    Applied on {latestLoan.applied_date || latestLoan.created_at?.split('T')[0]} &bull; Tenure: {latestLoan.term_months} Months &bull; Awaiting administrative approval
                  </span>
                )}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#047857', fontWeight: 700, fontSize: '0.8rem', flexShrink: 0 }}>
            <span>View Loans</span>
            <ChevronRight size={18} />
          </div>
        </div>
      )}

      {/* Official Monthly Payslip / Salary Disbursed Banner */}
      {latestPayslip && (
        <div
          style={{
            backgroundColor: '#ffffff',
            border: '1.5px solid #a7f3d0',
            borderRadius: '16px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '24px',
            background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
            boxShadow: '0 2px 10px rgba(0, 0, 0, 0.03)',
            transition: 'all 0.2s ease',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '12px',
                backgroundColor: '#d1fae5',
                color: '#047857',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <Receipt size={22} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0b3d2b' }}>
                  Salary Slip Disbursed • {latestPayslip.month_name || latestPayslip.month} {latestPayslip.year}
                </span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    color: '#047857',
                    backgroundColor: '#d1fae5',
                    padding: '2px 8px',
                    borderRadius: '999px',
                  }}
                >
                  DISBURSED
                </span>
                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f766e', backgroundColor: '#e6fffa', padding: '2px 8px', borderRadius: '999px' }}>
                  Take Home: ₹{parseFloat(latestPayslip.net_salary || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '3px' }}>
                Payable: {latestPayslip.payable_days} Days (Incl. {latestPayslip.sundays || 4} Sundays & {latestPayslip.holidays || 0} Festival Holidays) &bull; EPF (12%): ₹{parseFloat(latestPayslip.employee_pf || 0).toLocaleString('en-IN')} &bull; Ref: {latestPayslip.payslip_number || latestPayslip.id}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              className="hrms-btn-primary"
              style={{ fontSize: '0.78rem', padding: '6px 12px', backgroundColor: '#0f766e', display: 'flex', alignItems: 'center', gap: '5px' }}
              onClick={async (e) => {
                e.stopPropagation();
                setDownloadingPayslip(true);
                try {
                  await payslipService.downloadPayslipPdf(latestPayslip.id || latestPayslip.payslip_number, `Payslip_${latestPayslip.month}_${latestPayslip.year}.pdf`);
                } catch {
                  alert('Could not download payslip PDF.');
                } finally {
                  setDownloadingPayslip(false);
                }
              }}
              disabled={downloadingPayslip}
            >
              <Download size={14} /> {downloadingPayslip ? 'Downloading...' : 'Download PDF'}
            </button>
            <button
              type="button"
              className="hrms-btn-secondary"
              style={{ fontSize: '0.78rem', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '4px' }}
              onClick={() => navigate('/employee/payslips')}
            >
              <span>View All</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Payroll & Employee Self-Service Section (matching user screenshot) */}
      <section style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#0b3d2b', margin: 0 }}>
              Payroll & Self-Service
            </h2>
            <p style={{ fontSize: '0.8rem', color: '#64748b', margin: '2px 0 0 0' }}>
              Access your payslips, loans, performance and settlement
            </p>
          </div>
          <span style={{ fontSize: '0.8rem', color: '#0d9488', fontWeight: '600' }}>HRMS Portal</span>
        </div>

        <div className="quick-actions-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}>
          <QuickActionCard
            title="Personal & Banking"
            icon={Landmark}
            iconBg="#eff6ff"
            iconColor="#2563eb"
            onClick={() => navigate('/employee/profile')}
          />
          <QuickActionCard
            title="My Payslips"
            icon={Receipt}
            iconBg="#ecfdf5"
            iconColor="#059669"
            onClick={() => navigate('/employee/payslips')}
          />
          <QuickActionCard
            title="My Loans & Advances"
            icon={Coins}
            iconBg="#fffbeb"
            iconColor="#d97706"
            onClick={() => navigate('/employee/loans')}
          />
          <QuickActionCard
            title="My Performance"
            icon={Award}
            iconBg="#f0fdf4"
            iconColor="#047857"
            onClick={() => navigate('/employee/performance')}
          />
          <QuickActionCard
            title="Resignation & Settlement"
            icon={UserMinus}
            iconBg="#fef2f2"
            iconColor="#dc2626"
            onClick={() => navigate('/employee/resignation')}
          />
        </div>
      </section>

      {/* Quick Actions Section */}
      <section className="quick-actions-section">
        <h2 className="section-title">Quick Actions</h2>
        <p className="section-desc">Everything you need, in one place</p>

        <div className="quick-actions-grid">
          <QuickActionCard
            title="Announcements"
            icon={Bell}
            iconBg="#f3f0ff"
            iconColor="#6941c6"
            badgeCount={unreadCounts?.announcements || 0}
            onClick={() => handleOpenQuickAction('announcements')}
          />
          <QuickActionCard
            title="Meetings"
            icon={Calendar}
            iconBg="#e0f2fe"
            iconColor="#0284c7"
            badgeCount={unreadCounts?.meetings || 0}
            onClick={() => handleOpenQuickAction('meetings')}
          />
          <QuickActionCard
            title="Work Assignments"
            icon={Briefcase}
            iconBg="#ecfdf5"
            iconColor="#0d9488"
            badgeCount={unreadCounts?.assignments || 0}
            onClick={() => handleOpenQuickAction('assignments')}
          />
          <QuickActionCard
            title="Leave Management"
            icon={FileText}
            iconBg="#fff7ed"
            iconColor="#ea580c"
            badgeCount={unreadCounts?.leaves || 0}
            onClick={() => handleOpenQuickAction('leaves')}
          />
        </div>
      </section>

      {/* Upcoming Holidays Strip */}
      <section style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h2 style={{ fontSize: '1.15rem', fontWeight: '700', color: '#0b3d2b', margin: 0 }}>
            Upcoming Company Holidays
          </h2>
          <span style={{ fontSize: '0.8rem', color: '#0d9488', fontWeight: '600' }}>2026 Calendar</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {(holidays.length > 0 ? holidays.slice(0, 2) : []).map((holiday) => (
            <div
              key={holiday.id}
              style={{
                backgroundColor: '#ffffff',
                borderRadius: '16px',
                padding: '14px 18px',
                border: '1px solid #e2e8f0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: '10px',
                    backgroundColor: '#fff7ed',
                    color: '#ea580c',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <CalendarDays size={18} />
                </div>
                <div>
                  <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#1e293b' }}>
                    {holiday.name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    {holiday.type} &bull; {holiday.description}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  color: '#ea580c',
                  backgroundColor: '#fff7ed',
                  padding: '4px 10px',
                  borderRadius: '999px'
                }}
              >
                {holiday.date}
              </span>
            </div>
          ))}
          {holidays.length === 0 && (
            <div style={{ padding: '16px', color: '#64748b', fontSize: '0.85rem' }}>
              No upcoming company holidays listed.
            </div>
          )}
        </div>
      </section>

      {/* Log Out Button (matches screenshot) */}
      <button
        type="button"
        className="btn-logout-bottom"
        onClick={handleLogout}
      >
        <LogOut size={16} />
        <span>Log Out</span>
      </button>

      {/* Quick Action Modals */}
      {/* 1. Announcements Modal */}
      <Modal
        isOpen={activeModal === 'announcements'}
        onClose={() => setActiveModal(null)}
        title="Company Announcements"
        subtitle="Latest updates from management & HR"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {announcements.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '16px' }}>No announcements found.</div>
          ) : (
            announcements.map((item) => (
              <div
                key={item.id}
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#6941c6', fontWeight: '700' }}>{item.author}</span>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{item.date}</span>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0b3d2b', marginBottom: '6px' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '0.825rem', color: '#475569', lineHeight: 1.45, margin: 0 }}>
                  {item.message}
                </p>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* 2. Meetings Modal */}
      <Modal
        isOpen={activeModal === 'meetings'}
        onClose={() => setActiveModal(null)}
        title="Your Scheduled Meetings"
        subtitle="Today & upcoming team briefings"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {meetings.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '16px' }}>No scheduled meetings.</div>
          ) : (
            meetings.map((item) => (
              <div
                key={item.id}
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: '700' }}>{item.time}</span>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>{item.date}</span>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0b3d2b', marginBottom: '4px' }}>
                  {item.title}
                </h3>
                <p style={{ fontSize: '0.8rem', color: '#475569', marginBottom: '8px' }}>
                  {item.description}
                </p>
                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                  Location / Link: <strong>{item.room || item.link || 'Online'}</strong>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* 3. Work Assignments Modal */}
      <Modal
        isOpen={activeModal === 'assignments'}
        onClose={() => setActiveModal(null)}
        title="Work Assignments"
        subtitle="Current sprint tasks and deliverables"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {assignments.length === 0 ? (
            <div style={{ textAlign: 'center', color: '#64748b', padding: '16px' }}>No tasks assigned.</div>
          ) : (
            assignments.map((task) => (
              <div
                key={task.id}
                style={{
                  backgroundColor: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '14px',
                  padding: '16px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#059669', fontWeight: '700' }}>
                    Deadline: {task.deadline}
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      color: task.priority === 'High' ? '#dc2626' : '#2563eb',
                      backgroundColor: task.priority === 'High' ? '#fef2f2' : '#eff6ff',
                      padding: '2px 8px',
                      borderRadius: '999px'
                    }}
                  >
                    {task.priority} Priority
                  </span>
                </div>
                <h3 style={{ fontSize: '0.95rem', fontWeight: '700', color: '#0b3d2b', marginBottom: '8px' }}>
                  {task.title}
                </h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{ flex: 1, height: '6px', backgroundColor: '#e2e8f0', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{ width: `${task.progress || 0}%`, height: '100%', backgroundColor: '#10b981' }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: '#475569' }}>
                    {task.progress || 0}%
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Modal>

      {/* 4. Leave Management & Apply Modal (Authoritative Apply for Leave form from screenshot 1) */}
      <ApplyLeaveModal
        isOpen={activeModal === 'leaves'}
        onClose={() => setActiveModal(null)}
        recentDecisions={notificationService.getDecidedLeaves()}
      />
    </div>
  );
}
