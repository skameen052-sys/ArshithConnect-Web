import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Trash2, Search, Filter, Calendar, RefreshCw, 
  Clock, Plus, CheckCircle2, AlertCircle, Edit2, X, AlertTriangle,
  Sliders, Layers, Check
} from 'lucide-react';
import { workUpdateService } from '../../services/workUpdateService';

export default function AdminWorkUpdates() {
  const navigate = useNavigate();

  // Active Tab: 'updates' | 'schedules'
  const [activeTab, setActiveTab] = useState('updates');

  // Work Updates list state
  const [updates, setUpdates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Filtering states
  const [dateFilter, setDateFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [sectionFilter, setSectionFilter] = useState('ALL');

  // Delete modals
  const [singleDeleteTarget, setSingleDeleteTarget] = useState(null);
  const [isDeletingSingle, setIsDeletingSingle] = useState(false);

  const [isDeleteAllModalOpen, setIsDeleteAllModalOpen] = useState(false);
  const [isDeletingAll, setIsDeletingAll] = useState(false);

  // Schedules state
  const [schedules, setSchedules] = useState([]);
  const [isLoadingSchedules, setIsLoadingSchedules] = useState(false);
  const [scheduleModalMode, setScheduleModalMode] = useState(null); // 'create' | 'edit' | null
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);
  const [scheduleFormData, setScheduleFormData] = useState({
    name: '',
    section: 1,
    work_start: '09:30',
    work_end: '11:00',
    window_start: '10:30',
    window_end: '11:00',
    recurrence: 'Daily',
    applicable_to: 'All',
    is_active: true,
  });

  // Fetch Updates
  const fetchWorkUpdates = useCallback(async () => {
    try {
      setIsLoading(true);
      setErrorMessage('');
      const params = {};
      if (dateFilter) params.date = dateFilter;
      const data = await workUpdateService.getWorkUpdates(params);
      setUpdates(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to fetch admin work updates:', err);
      setErrorMessage(err.message || 'Failed to fetch work updates');
    } finally {
      setIsLoading(false);
    }
  }, [dateFilter]);

  // Fetch Schedules
  const fetchSchedules = useCallback(async () => {
    try {
      setIsLoadingSchedules(true);
      const data = await workUpdateService.getWorkSchedules();
      setSchedules(Array.isArray(data) ? data : []);
    } catch (err) {
      console.warn('Failed to fetch schedules:', err);
    } finally {
      setIsLoadingSchedules(false);
    }
  }, []);

  useEffect(() => {
    fetchWorkUpdates();
  }, [fetchWorkUpdates]);

  useEffect(() => {
    if (activeTab === 'schedules') {
      fetchSchedules();
    }
  }, [activeTab, fetchSchedules]);

  // Filtered updates in memory
  const filteredUpdates = useMemo(() => {
    return updates.filter((u) => {
      // Search term
      if (searchTerm.trim()) {
        const s = searchTerm.toLowerCase();
        const matchesName = (u.employeeName || '').toLowerCase().includes(s);
        const matchesEmail = (u.employeeEmail || '').toLowerCase().includes(s);
        const matchesText = (u.update || '').toLowerCase().includes(s);
        if (!matchesName && !matchesEmail && !matchesText) return false;
      }
      // Section filter
      if (sectionFilter !== 'ALL') {
        const secNum = parseInt(sectionFilter, 10);
        if (u.section !== secNum) return false;
      }
      return true;
    });
  }, [updates, searchTerm, sectionFilter]);

  // Handle Delete Single Work Update
  const handleConfirmDeleteSingle = async () => {
    if (!singleDeleteTarget) return;
    try {
      setIsDeletingSingle(true);
      await workUpdateService.deleteWorkUpdate(
        singleDeleteTarget.id,
        singleDeleteTarget.firestorePath
      );
      setSuccessMessage('Work update deleted successfully.');
      setTimeout(() => setSuccessMessage(''), 3500);
      setSingleDeleteTarget(null);
      fetchWorkUpdates();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to delete work update');
    } finally {
      setIsDeletingSingle(false);
    }
  };

  // Handle Delete All Updates
  const handleConfirmDeleteAll = async () => {
    try {
      setIsDeletingAll(true);
      const params = {};
      if (dateFilter) {
        params.date = dateFilter;
      } else {
        params.all = true;
      }
      const res = await workUpdateService.deleteAllWorkUpdates(params);
      setSuccessMessage(res.message || 'Work updates deleted successfully.');
      setTimeout(() => setSuccessMessage(''), 3500);
      setIsDeleteAllModalOpen(false);
      fetchWorkUpdates();
    } catch (err) {
      setErrorMessage(err.message || 'Failed to delete all work updates');
    } finally {
      setIsDeletingAll(false);
    }
  };

  // Handle Schedule Modal open
  const handleOpenScheduleModal = (mode, sch = null) => {
    setScheduleModalMode(mode);
    setEditingSchedule(sch);
    if (mode === 'edit' && sch) {
      setScheduleFormData({
        name: sch.name || '',
        section: sch.section || 1,
        work_start: sch.work_start || '09:30',
        work_end: sch.work_end || '11:00',
        window_start: sch.window_start || '10:30',
        window_end: sch.window_end || '11:00',
        recurrence: sch.recurrence || 'Daily',
        applicable_to: sch.applicable_to || 'All',
        is_active: sch.is_active !== undefined ? sch.is_active : true,
      });
    } else {
      const nextSection = (schedules.length > 0 ? Math.max(...schedules.map(s => s.section || 0)) : 0) + 1;
      setScheduleFormData({
        name: `Work Update 0${nextSection}`,
        section: nextSection,
        work_start: '09:30',
        work_end: '11:00',
        window_start: '10:30',
        window_end: '11:00',
        recurrence: 'Daily',
        applicable_to: 'All',
        is_active: true,
      });
    }
  };

  const handleSaveSchedule = async (e) => {
    e.preventDefault();
    try {
      setIsSavingSchedule(true);
      if (scheduleModalMode === 'create') {
        await workUpdateService.createWorkSchedule(scheduleFormData);
        setSuccessMessage('New work schedule created successfully.');
      } else if (scheduleModalMode === 'edit' && editingSchedule) {
        await workUpdateService.updateWorkSchedule(
          editingSchedule.schedule_id || editingSchedule.id,
          scheduleFormData
        );
        setSuccessMessage('Work schedule updated successfully.');
      }
      setTimeout(() => setSuccessMessage(''), 3500);
      setScheduleModalMode(null);
      fetchSchedules();
    } catch (err) {
      alert(err.message || 'Failed to save schedule');
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleDeleteSchedule = async (sch) => {
    if (!window.confirm(`Are you sure you want to delete ${sch.name}?`)) return;
    try {
      await workUpdateService.deleteWorkSchedule(sch.schedule_id || sch.id);
      setSuccessMessage('Schedule deleted.');
      setTimeout(() => setSuccessMessage(''), 3000);
      fetchSchedules();
    } catch (err) {
      alert(err.message || 'Failed to delete schedule');
    }
  };

  return (
    <div style={{ maxWidth: '860px', margin: '0 auto', padding: '16px 20px 48px', backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      {/* HEADER matching Mobile Screenshot 1 & 2 */}
      <div 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          padding: '12px 0 16px',
          backgroundColor: '#FFFFFF',
          margin: '-16px -20px 20px',
          padding: '16px 20px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
          borderBottom: '1px solid #e2e8f0',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              backgroundColor: '#f1f5f9',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '8px 14px',
              color: '#1e293b',
              fontSize: '0.9rem',
              fontWeight: '700',
              cursor: 'pointer',
            }}
          >
            ‹ Back
          </button>
          <span style={{ fontSize: '1.35rem', fontWeight: '800', color: '#172A24' }}>
            Work Updates
          </span>
        </div>

        {/* Tab switchers: Updates vs Schedule Management */}
        <div style={{ display: 'flex', backgroundColor: '#f1f5f9', borderRadius: '10px', padding: '3px' }}>
          <button
            type="button"
            onClick={() => setActiveTab('updates')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              backgroundColor: activeTab === 'updates' ? '#ffffff' : 'transparent',
              color: activeTab === 'updates' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'updates' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
            }}
          >
            Submitted Updates ({updates.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('schedules')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.82rem',
              fontWeight: '700',
              backgroundColor: activeTab === 'schedules' ? '#ffffff' : 'transparent',
              color: activeTab === 'schedules' ? '#0f172a' : '#64748b',
              boxShadow: activeTab === 'schedules' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              cursor: 'pointer',
            }}
          >
            Schedule Config
          </button>
        </div>
      </div>

      {/* Main Title matching Screenshots 1 & 2 */}
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ fontSize: '1.75rem', fontWeight: '800', color: '#172A24', margin: 0, letterSpacing: '-0.02em' }}>
          {activeTab === 'updates' ? 'Employee Work Updates' : 'Work Schedule Management'}
        </h1>
        <p style={{ fontSize: '0.92rem', color: '#66756F', margin: '4px 0 0', lineHeight: 1.4 }}>
          {activeTab === 'updates' 
            ? 'View work updates submitted by employees.' 
            : 'Configure daily update schedules, times, and submission availability windows.'}
        </p>
      </div>

      {/* Success Notification */}
      {successMessage && (
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '0.9rem',
            fontWeight: '600',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <CheckCircle2 size={18} />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Error Notification */}
      {errorMessage && (
        <div
          style={{
            backgroundColor: '#fef2f2',
            border: '1px solid #fecaca',
            color: '#b91c1c',
            borderRadius: '10px',
            padding: '12px 16px',
            fontSize: '0.9rem',
            fontWeight: '600',
            marginBottom: '18px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <AlertCircle size={18} />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* ============================================================== */}
      {/* TAB 1: WORK UPDATES (Screenshots 1 & 2)                         */}
      {/* ============================================================== */}
      {activeTab === 'updates' && (
        <>
          {/* Top Filter and Search Bar */}
          <div
            style={{
              backgroundColor: '#FFFFFF',
              borderRadius: '14px',
              padding: '14px 16px',
              border: '1px solid #e2e8f0',
              marginBottom: '16px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '12px',
              alignItems: 'center',
              boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
            }}
          >
            {/* Search Input */}
            <div style={{ flex: '1 1 200px', display: 'flex', alignItems: 'center', position: 'relative' }}>
              <Search size={16} color="#94a3b8" style={{ position: 'absolute', left: '12px' }} />
              <input
                type="text"
                placeholder="Search employee or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.88rem',
                  outline: 'none',
                }}
              />
            </div>

            {/* Date Filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  fontSize: '0.85rem',
                  outline: 'none',
                  color: '#334155',
                }}
              />
              {dateFilter && (
                <button
                  type="button"
                  onClick={() => setDateFilter('')}
                  title="Clear date filter"
                  style={{
                    border: 'none',
                    background: '#f1f5f9',
                    color: '#64748b',
                    padding: '8px',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  Clear
                </button>
              )}
            </div>

            {/* Section Filter */}
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                fontSize: '0.85rem',
                outline: 'none',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontWeight: '600',
              }}
            >
              <option value="ALL">All Sections</option>
              <option value="1">Section 1</option>
              <option value="2">Section 2</option>
              <option value="3">Section 3</option>
              <option value="4">Section 4</option>
            </select>

            {/* Refresh Button */}
            <button
              type="button"
              onClick={fetchWorkUpdates}
              title="Refresh"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 14px',
                borderRadius: '8px',
                border: '1px solid #cbd5e1',
                backgroundColor: '#ffffff',
                color: '#334155',
                fontSize: '0.85rem',
                fontWeight: '600',
                cursor: 'pointer',
              }}
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>

          {/* RED BUTTON: "Delete All Updates" (matching Screenshot 1 & 2) */}
          <div style={{ marginBottom: '20px' }}>
            <button
              type="button"
              onClick={() => setIsDeleteAllModalOpen(true)}
              style={{
                width: '100%',
                height: '52px',
                backgroundColor: '#D32F2F',
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '12px',
                fontSize: '1.05rem',
                fontWeight: '700',
                letterSpacing: '0.01em',
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(211, 47, 47, 0.25)',
                transition: 'background-color 0.2s',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b71c1c'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#D32F2F'}
            >
              <Trash2 size={18} />
              <span>Delete All Updates {dateFilter ? `(${dateFilter})` : ''}</span>
            </button>
          </div>

          {/* List of Updates */}
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
              <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px' }} />
              <p style={{ fontWeight: '600' }}>Loading work updates from database...</p>
            </div>
          ) : filteredUpdates.length === 0 ? (
            <div 
              style={{ 
                backgroundColor: '#FFFFFF', 
                borderRadius: '16px', 
                padding: '48px 24px', 
                textAlign: 'center', 
                border: '1px solid #e2e8f0' 
              }}
            >
              <p style={{ fontSize: '1.1rem', fontWeight: '700', color: '#64748b', margin: 0 }}>
                No work updates found.
              </p>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '6px 0 0' }}>
                {dateFilter || searchTerm ? 'Try adjusting your filters.' : 'Employees will appear here once they submit updates.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {filteredUpdates.map((item) => (
                <div
                  key={item.id || item.firestorePath}
                  style={{
                    backgroundColor: '#FFFFFF',
                    borderRadius: '14px',
                    padding: '20px 22px',
                    border: '1px solid #e2e8f0',
                    boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                  }}
                >
                  {/* EMPLOYEE NAME matching Screenshot: e.g. Prathibha Gadde */}
                  <h3
                    style={{
                      fontSize: '1.25rem',
                      fontWeight: '800',
                      color: '#172A24',
                      margin: '0 0 2px 0',
                      letterSpacing: '-0.01em',
                    }}
                  >
                    {item.employeeName}
                  </h3>

                  {/* EMAIL matching Screenshot: prathibhag@arshithgroup.com */}
                  <div style={{ fontSize: '0.85rem', color: '#66756F', fontWeight: '500' }}>
                    {item.employeeEmail}
                  </div>

                  {/* DATE matching Screenshot: Date: 2026-10-28 */}
                  <div style={{ marginTop: '12px', fontSize: '0.88rem', color: '#52635C', fontWeight: '500' }}>
                    Date: {item.date}
                  </div>

                  {/* SECTION matching Screenshot: Section: 1 (Green) */}
                  <div style={{ marginTop: '3px', fontSize: '0.92rem', color: '#087F5B', fontWeight: '800' }}>
                    Section: {item.section !== null ? item.section : '-'}
                  </div>

                  {/* WORK SCHEDULE matching Screenshot: Work Schedule: - */}
                  <div style={{ marginTop: '3px', fontSize: '0.88rem', color: '#52635C', fontWeight: '500' }}>
                    Work Schedule: {item.workSchedule || '-'}
                  </div>

                  {/* SUBMISSION WINDOW matching Screenshot: Submission Window: - */}
                  <div style={{ marginTop: '3px', fontSize: '0.88rem', color: '#52635C', fontWeight: '500' }}>
                    Submission Window: {item.submissionWindow || '-'}
                  </div>

                  {/* WORK UPDATE LABEL matching Screenshot */}
                  <div
                    style={{
                      marginTop: '15px',
                      fontSize: '0.98rem',
                      fontWeight: '800',
                      color: '#172A24',
                    }}
                  >
                    Work Update
                  </div>

                  {/* CONTENT matching Screenshot */}
                  <div
                    style={{
                      marginTop: '4px',
                      fontSize: '0.92rem',
                      color: '#172A24',
                      lineHeight: 1.5,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {item.update}
                  </div>

                  {/* SUBMITTED TIME matching Screenshot: Submitted: 28 Oct 2026, 10:59 AM */}
                  <div
                    style={{
                      marginTop: '14px',
                      fontSize: '0.78rem',
                      color: '#77857F',
                      fontWeight: '500',
                    }}
                  >
                    Submitted: {item.submittedTime}
                  </div>

                  {/* RED BUTTON: Delete Work Update matching Screenshots 1 & 2 */}
                  <div style={{ marginTop: '16px' }}>
                    <button
                      type="button"
                      onClick={() => setSingleDeleteTarget(item)}
                      style={{
                        width: '100%',
                        height: '48px',
                        backgroundColor: '#D32F2F',
                        color: '#FFFFFF',
                        border: 'none',
                        borderRadius: '10px',
                        fontSize: '0.95rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'background-color 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#b71c1c'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#D32F2F'}
                    >
                      <Trash2 size={16} />
                      <span>Delete Work Update</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* TAB 2: WORK SCHEDULE MANAGEMENT (Section 3 of requirements)    */}
      {/* ============================================================== */}
      {activeTab === 'schedules' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div>
              <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                Configured Schedules ({schedules.length})
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', margin: '2px 0 0' }}>
                Employees see these schedules dynamically in their portal.
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleOpenScheduleModal('create')}
              style={{
                backgroundColor: '#7651E8',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                padding: '9px 16px',
                fontSize: '0.85rem',
                fontWeight: '700',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <Plus size={16} />
              <span>Add Schedule</span>
            </button>
          </div>

          {isLoadingSchedules ? (
            <div style={{ textAlign: 'center', padding: '40px 0', color: '#64748b' }}>
              <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
              <p>Loading schedules...</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {schedules.map((sch) => (
                <div
                  key={sch.schedule_id || sch.id}
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '18px 20px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.03)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: '800', color: '#7651E8', textTransform: 'uppercase' }}>
                        Section {sch.section}
                      </span>
                      <span
                        style={{
                          fontSize: '0.7rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          backgroundColor: sch.is_active ? '#dcfce7' : '#f1f5f9',
                          color: sch.is_active ? '#15803d' : '#64748b',
                        }}
                      >
                        {sch.is_active ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>

                    <h4 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#1e293b', margin: '4px 0 2px' }}>
                      {sch.name}
                    </h4>

                    <div style={{ fontSize: '0.88rem', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '6px' }}>
                      <div>
                        <strong>Work Time:</strong> {sch.work_schedule_str}
                      </div>
                      <div>
                        <strong>Window:</strong> {sch.submission_window_str}
                      </div>
                      <div>
                        <strong>Recurrence:</strong> {sch.recurrence || 'Daily'}
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => handleOpenScheduleModal('edit', sch)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        border: '1px solid #cbd5e1',
                        backgroundColor: '#f8fafc',
                        color: '#334155',
                        fontSize: '0.82rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <Edit2 size={13} />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteSchedule(sch)}
                      style={{
                        padding: '7px 12px',
                        borderRadius: '8px',
                        border: '1px solid #fecaca',
                        backgroundColor: '#fef2f2',
                        color: '#b91c1c',
                        fontSize: '0.82rem',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        cursor: 'pointer',
                      }}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRM DELETE SINGLE MODAL                                    */}
      {/* ============================================================== */}
      {singleDeleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => !isDeletingSingle && setSingleDeleteTarget(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '480px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                }}
              >
                <Trash2 size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                  Delete Work Update?
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#64748b' }}>
                  {singleDeleteTarget.employeeName} • Section {singleDeleteTarget.section}
                </span>
              </div>
            </div>

            <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.5, margin: '0 0 20px' }}>
              Are you sure you want to permanently delete this employee's work update? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setSingleDeleteTarget(null)}
                disabled={isDeletingSingle}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteSingle}
                disabled={isDeletingSingle}
                style={{
                  padding: '9px 20px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#D32F2F',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: isDeletingSingle ? 'not-allowed' : 'pointer',
                  opacity: isDeletingSingle ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isDeletingSingle ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{isDeletingSingle ? 'Deleting...' : 'Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CONFIRM DELETE ALL UPDATES MODAL                               */}
      {/* ============================================================== */}
      {isDeleteAllModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => !isDeletingAll && setIsDeleteAllModalOpen(false)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '16px',
              maxWidth: '500px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '14px' }}>
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '50%',
                  backgroundColor: '#fee2e2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#dc2626',
                }}
              >
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                  Delete All Work Updates?
                </h3>
                <span style={{ fontSize: '0.82rem', color: '#dc2626', fontWeight: '700' }}>
                  Irreversible Administrative Action
                </span>
              </div>
            </div>

            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                borderRadius: '10px',
                padding: '12px',
                fontSize: '0.88rem',
                color: '#991b1b',
                marginBottom: '16px',
              }}
            >
              <strong>Scope of deletion:</strong>{' '}
              {dateFilter 
                ? `All employee work updates submitted for date ${dateFilter}` 
                : 'ALL work updates across ALL employees and ALL dates.'}
            </div>

            <p style={{ fontSize: '0.9rem', color: '#475569', lineHeight: 1.5, margin: '0 0 20px' }}>
              Are you sure you want to permanently delete all matching employee work updates? This action cannot be undone.
            </p>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setIsDeleteAllModalOpen(false)}
                disabled={isDeletingAll}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid #cbd5e1',
                  backgroundColor: '#ffffff',
                  color: '#334155',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteAll}
                disabled={isDeletingAll}
                style={{
                  padding: '9px 22px',
                  borderRadius: '8px',
                  border: 'none',
                  backgroundColor: '#D32F2F',
                  color: '#ffffff',
                  fontSize: '0.88rem',
                  fontWeight: '700',
                  cursor: isDeletingAll ? 'not-allowed' : 'pointer',
                  opacity: isDeletingAll ? 0.7 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                {isDeletingAll ? <RefreshCw size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{isDeletingAll ? 'Deleting All...' : 'Confirm Delete All'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* CREATE / EDIT SCHEDULE MODAL                                   */}
      {/* ============================================================== */}
      {scheduleModalMode && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(3px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '16px',
          }}
          onClick={() => !isSavingSchedule && setScheduleModalMode(null)}
        >
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '18px',
              maxWidth: '540px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h3 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#1e293b', margin: 0 }}>
                {scheduleModalMode === 'create' ? 'Create Work Schedule' : 'Edit Work Schedule'}
              </h3>
              <button
                type="button"
                onClick={() => setScheduleModalMode(null)}
                style={{ border: 'none', background: '#f1f5f9', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer' }}
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                    Schedule Name
                  </label>
                  <input
                    type="text"
                    required
                    value={scheduleFormData.name}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, name: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                    Section Number
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="10"
                    required
                    disabled={scheduleModalMode === 'edit'}
                    value={scheduleFormData.section}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, section: parseInt(e.target.value, 10) })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                    Work Start Time
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduleFormData.work_start}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, work_start: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                    Work End Time
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduleFormData.work_end}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, work_end: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                    Submission Window Start
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduleFormData.window_start}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, window_start: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#475569', marginBottom: '4px' }}>
                    Submission Window End
                  </label>
                  <input
                    type="time"
                    required
                    value={scheduleFormData.window_end}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, window_end: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '18px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={scheduleFormData.is_active}
                    onChange={(e) => setScheduleFormData({ ...scheduleFormData, is_active: e.target.checked })}
                  />
                  <span style={{ fontSize: '0.85rem', fontWeight: '700', color: '#334155' }}>
                    Schedule is active and accessible to employees
                  </span>
                </label>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setScheduleModalMode(null)}
                  disabled={isSavingSchedule}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#ffffff',
                    color: '#334155',
                    fontSize: '0.88rem',
                    fontWeight: '700',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingSchedule}
                  style={{
                    padding: '9px 20px',
                    borderRadius: '8px',
                    border: 'none',
                    backgroundColor: '#7651E8',
                    color: '#ffffff',
                    fontSize: '0.88rem',
                    fontWeight: '700',
                    cursor: isSavingSchedule ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingSchedule ? 'Saving...' : 'Save Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
