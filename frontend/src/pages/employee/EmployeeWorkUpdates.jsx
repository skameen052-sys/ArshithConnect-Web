import React, { useState, useEffect, useCallback } from 'react';
import { 
  RefreshCw, CheckCircle2, Clock, AlertCircle, Send, X, 
  Calendar, User, Mail, Hash, Layers
} from 'lucide-react';
import { workUpdateService } from '../../services/workUpdateService';

export default function EmployeeWorkUpdates() {
  const [schedulesData, setSchedulesData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Submission modal state
  const [activeSchedule, setActiveSchedule] = useState(null);
  const [updateText, setUpdateText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState('');

  const fetchTodaySchedules = useCallback(async (isSilent = false) => {
    try {
      if (!isSilent) setIsLoading(true);
      else setIsRefreshing(true);
      setErrorMessage('');

      const data = await workUpdateService.getTodaySchedules();
      setSchedulesData(data);
    } catch (err) {
      console.warn('Failed to fetch today work schedules:', err);
      setErrorMessage(err.message || 'Could not load today work schedules');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchTodaySchedules();
    // Auto-refresh every 30 seconds to recalculate real-time time window availability
    const interval = setInterval(() => {
      fetchTodaySchedules(true);
    }, 30000);
    return () => clearInterval(interval);
  }, [fetchTodaySchedules]);

  const handleOpenModal = (sch) => {
    if (!sch.is_open || sch.has_submitted) return;
    setActiveSchedule(sch);
    setUpdateText('');
    setModalError('');
  };

  const handleCloseModal = () => {
    if (isSubmitting) return;
    setActiveSchedule(null);
    setUpdateText('');
    setModalError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!updateText.trim()) {
      setModalError('Enter your work update before submitting.');
      return;
    }

    if (!activeSchedule) return;

    try {
      setIsSubmitting(true);
      setModalError('');

      await workUpdateService.submitWorkUpdate({
        scheduleId: activeSchedule.schedule_id,
        section: activeSchedule.section,
        workSchedule: activeSchedule.work_schedule_str,
        submissionWindow: activeSchedule.submission_window_str,
        scheduleName: activeSchedule.name,
        updateText: updateText.trim(),
        date: schedulesData?.date,
      });

      handleCloseModal();
      setSuccessMessage(`Work update for ${activeSchedule.name} submitted successfully!`);
      setTimeout(() => setSuccessMessage(''), 4000);

      // Refresh today schedules to reflect the submitted status
      await fetchTodaySchedules(true);
    } catch (err) {
      setModalError(err.message || 'Failed to submit work update');
    } finally {
      setIsSubmitting(false);
    }
  };

  const employee = schedulesData?.employee || {};
  const schedules = schedulesData?.schedules || [];

  return (
    <div style={{ maxWidth: '820px', margin: '0 auto', padding: '16px 20px 48px' }}>
      {/* Top Header matching Mobile Screenshot 3 */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '12px 0 20px',
          borderBottom: '1px solid #ede9fe',
          marginBottom: '24px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button
            type="button"
            onClick={() => fetchTodaySchedules(true)}
            title="Refresh schedules"
            disabled={isRefreshing}
            style={{
              background: '#f5f3ff',
              border: '1px solid #ddd6fe',
              color: '#7651E8',
              borderRadius: '50%',
              width: '42px',
              height: '42px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: isRefreshing ? 'wait' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <RefreshCw size={20} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: '800', color: '#251E32', margin: 0, lineHeight: 1.2 }}>
              Work Update
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#777180', margin: '2px 0 0', fontWeight: '500' }}>
              Today's work schedules • {schedulesData?.date || 'Today'} {schedulesData?.currentTime ? `(${schedulesData.currentTime})` : ''}
            </p>
          </div>
        </div>

        {employee?.name && (
          <div style={{ textAlign: 'right', display: 'none', sm: 'block' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#251E32' }}>{employee.name}</span>
            <span style={{ fontSize: '0.75rem', color: '#777180', display: 'block' }}>{employee.employee_id}</span>
          </div>
        )}
      </div>

      {/* Title & Description matching Screenshots 3 and 4 */}
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '1.65rem', fontWeight: '800', color: '#251E32', margin: 0, letterSpacing: '-0.02em' }}>
          Daily Work Updates
        </h2>
        <p style={{ fontSize: '0.95rem', color: '#777180', margin: '6px 0 0', lineHeight: 1.5 }}>
          Submit your update during the available time window for each schedule.
        </p>
      </div>

      {/* Success notification */}
      {successMessage && (
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '0.9rem',
            fontWeight: '600',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error notification */}
      {errorMessage && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '12px',
            padding: '12px 16px',
            fontSize: '0.9rem',
            fontWeight: '600',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
          }}
        >
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Loading Skeleton */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {[1, 2, 3, 4].map((i) => (
            <div 
              key={i} 
              style={{ 
                height: '170px', 
                backgroundColor: '#ffffff', 
                borderRadius: '18px', 
                border: '1px solid #ede9fe',
                padding: '22px',
                animation: 'pulse 1.5s infinite',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)'
              }} 
            />
          ))}
        </div>
      ) : (
        /* Work Schedule Cards (matching Screenshots 3 & 4) */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {schedules.map((sch) => {
            const isSubmitted = sch.has_submitted;
            const isOpen = sch.is_open;
            
            // Determine button colors and styling based on state
            let buttonBg = '#7651E8';
            let buttonCursor = 'default';
            let buttonOpacity = 1;

            if (isSubmitted) {
              buttonBg = '#7651E8';
              buttonOpacity = 0.88;
            } else if (isOpen) {
              buttonBg = '#7651E8';
              buttonCursor = 'pointer';
            } else {
              buttonBg = '#7651E8';
              buttonOpacity = 0.82;
            }

            return (
              <div
                key={sch.schedule_id || sch.section}
                style={{
                  backgroundColor: '#ffffff',
                  border: isOpen ? '1.5px solid #c4b5fd' : '1px solid #ede9fe',
                  borderRadius: '18px',
                  padding: '22px 24px',
                  boxShadow: isOpen 
                    ? '0 6px 20px rgba(118, 81, 232, 0.12)' 
                    : '0 2px 10px rgba(0, 0, 0, 0.03)',
                  transition: 'all 0.2s ease',
                  position: 'relative',
                }}
              >
                {/* Schedule Tag / Number: e.g. WORK UPDATE 01 */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <span
                    style={{
                      color: '#7651E8',
                      fontSize: '0.78rem',
                      fontWeight: '800',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {sch.name ? sch.name.toUpperCase() : `WORK UPDATE 0${sch.section}`}
                  </span>
                  {isOpen && (
                    <span 
                      style={{ 
                        fontSize: '0.75rem', 
                        fontWeight: '700', 
                        color: '#15803d', 
                        backgroundColor: '#dcfce7',
                        padding: '3px 9px',
                        borderRadius: '20px'
                      }}
                    >
                      ● Window Open
                    </span>
                  )}
                </div>

                {/* Work Time: e.g. 9:30 AM - 11:00 AM */}
                <div
                  style={{
                    color: '#251E32',
                    fontSize: '1.35rem',
                    fontWeight: '800',
                    lineHeight: 1.3,
                    letterSpacing: '-0.01em',
                  }}
                >
                  {sch.work_schedule_str}
                </div>

                {/* Submission Window: e.g. Update window: 10:30 AM - 11:00 AM */}
                <div
                  style={{
                    color: '#777180',
                    fontSize: '0.88rem',
                    fontWeight: '500',
                    marginTop: '5px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <span>Update window: {sch.submission_window_str}</span>
                </div>

                {/* Status line matching Screenshot 3 & 4 */}
                <div
                  style={{
                    marginTop: '14px',
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    color: isSubmitted 
                      ? '#288246' // Green for already submitted
                      : isOpen 
                        ? '#288246' // Green for update available now
                        : '#4b5563', // Dark gray for closed/upcoming
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {isSubmitted && <CheckCircle2 size={16} color="#288246" />}
                  <span>{sch.status_text}</span>
                </div>

                {/* Action Button matching Purple buttons in Screenshots 3 & 4 */}
                <button
                  type="button"
                  disabled={!isOpen || isSubmitted}
                  onClick={() => handleOpenModal(sch)}
                  style={{
                    width: '100%',
                    height: '50px',
                    marginTop: '16px',
                    backgroundColor: buttonBg,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '0.9rem',
                    fontWeight: '800',
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    cursor: buttonCursor,
                    opacity: buttonOpacity,
                    boxShadow: isOpen ? '0 4px 14px rgba(118, 81, 232, 0.28)' : 'none',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                  }}
                  onMouseOver={(e) => {
                    if (isOpen && !isSubmitted) {
                      e.currentTarget.style.backgroundColor = '#643ddb';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (isOpen && !isSubmitted) {
                      e.currentTarget.style.backgroundColor = buttonBg;
                    }
                  }}
                >
                  {isOpen && !isSubmitted && <Send size={15} />}
                  <span>{sch.button_text}</span>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* SUBMISSION MODAL (Section 6 of requirements) */}
      {activeSchedule && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={handleCloseModal}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              maxWidth: '560px',
              width: '100%',
              padding: '28px',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
              position: 'relative',
              animation: 'fadeIn 0.2s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <div>
                <span style={{ color: '#7651E8', fontSize: '0.78rem', fontWeight: '800', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Section {activeSchedule.section}
                </span>
                <h3 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#251E32', margin: '2px 0 0' }}>
                  {activeSchedule.name}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                disabled={isSubmitting}
                style={{
                  background: '#f3f4f6',
                  border: 'none',
                  borderRadius: '50%',
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  cursor: 'pointer',
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Schedule Info Banner */}
            <div
              style={{
                backgroundColor: '#f5f3ff',
                border: '1px solid #ddd6fe',
                borderRadius: '12px',
                padding: '12px 16px',
                fontSize: '0.85rem',
                color: '#4c1d95',
                marginBottom: '18px',
                lineHeight: 1.5,
              }}
            >
              <div><strong>Work schedule:</strong> {activeSchedule.work_schedule_str}</div>
              <div><strong>Update window:</strong> {activeSchedule.submission_window_str}</div>
            </div>

            {modalError && (
              <div
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  color: '#b91c1c',
                  borderRadius: '10px',
                  padding: '10px 14px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <AlertCircle size={16} />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit}>
              {/* Read-only Employee & Context Fields */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', marginBottom: '4px' }}>
                    Employee Name
                  </label>
                  <input
                    type="text"
                    value={employee.name || ''}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: '#374151',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', marginBottom: '4px' }}>
                    Employee ID
                  </label>
                  <input
                    type="text"
                    value={employee.employee_id || ''}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: '#374151',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', marginBottom: '4px' }}>
                    Work Date
                  </label>
                  <input
                    type="text"
                    value={schedulesData?.date || ''}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '600',
                      color: '#374151',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: '700', color: '#6b7280', marginBottom: '4px' }}>
                    Section
                  </label>
                  <input
                    type="text"
                    value={`Section: ${activeSchedule.section}`}
                    readOnly
                    style={{
                      width: '100%',
                      padding: '8px 12px',
                      backgroundColor: '#f9fafb',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      fontSize: '0.85rem',
                      fontWeight: '700',
                      color: '#087F5B',
                    }}
                  />
                </div>
              </div>

              {/* Work Update Multiline Textarea */}
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '800', color: '#251E32', marginBottom: '6px' }}>
                  Work Update <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  value={updateText}
                  onChange={(e) => setUpdateText(e.target.value)}
                  placeholder="Enter your work update (describe tasks completed, progress, etc.)..."
                  rows={6}
                  required
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    borderRadius: '12px',
                    border: '1.5px solid #d1d5db',
                    fontSize: '0.9rem',
                    fontFamily: 'inherit',
                    outline: 'none',
                    resize: 'vertical',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = '#7651E8'}
                  onBlur={(e) => e.target.style.borderColor = '#d1d5db'}
                />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  style={{
                    padding: '11px 22px',
                    borderRadius: '10px',
                    border: '1px solid #d1d5db',
                    backgroundColor: '#ffffff',
                    color: '#374151',
                    fontSize: '0.9rem',
                    fontWeight: '700',
                    cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !updateText.trim()}
                  style={{
                    padding: '11px 26px',
                    borderRadius: '10px',
                    border: 'none',
                    backgroundColor: '#7651E8',
                    color: '#ffffff',
                    fontSize: '0.9rem',
                    fontWeight: '800',
                    cursor: isSubmitting || !updateText.trim() ? 'not-allowed' : 'pointer',
                    opacity: isSubmitting || !updateText.trim() ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    boxShadow: '0 4px 12px rgba(118, 81, 232, 0.3)',
                  }}
                >
                  {isSubmitting ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
                  <span>{isSubmitting ? 'Submitting...' : 'Submit'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
