import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, UserPlus, Eye, Mail, Phone, Building, AlertCircle, Trash2, CheckCircle2, MessageSquare } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import Modal from '../../components/common/Modal';
import { employeeService } from '../../services/employeeService';

export default function AdminEmployeeList() {
  const navigate = useNavigate();
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [selectedEmp, setSelectedEmp] = useState(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Add Employee Form States
  const [formName, setFormName] = useState('');
  const [formId, setFormId] = useState('');
  const [formRole, setFormRole] = useState('');
  const [formDept, setFormDept] = useState('Operations');
  const [formEmail, setFormEmail] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formError, setFormError] = useState('');

  // Load registered employees from PostgreSQL
  const loadEmployees = async () => {
    setIsLoading(true);
    try {
      const records = await employeeService.getEmployees();
      const clean = records.filter(
        (e) => e && e.name && e.name.trim().toLowerCase() !== 'unnamed employee'
      );
      setEmployees(clean);
    } catch (err) {
      console.error('Failed to load employees', err);
      setEmployees([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadEmployees();
  }, []);

  // Filtered employees
  const filtered = useMemo(() => {
    return employees.filter((e) => {
      const q = search.toLowerCase();
      const name = (e.name || e.fullName || '').toLowerCase();
      const id = (e.id || e.employeeId || '').toLowerCase();
      const role = (e.role || e.designation || '').toLowerCase();
      const dept = (e.dept || e.department || '').toLowerCase();

      const matchesSearch = name.includes(q) || id.includes(q) || role.includes(q) || dept.includes(q);
      const matchesDept = deptFilter === 'ALL' || dept.toLowerCase() === deptFilter.toLowerCase();
      return matchesSearch && matchesDept;
    });
  }, [employees, search, deptFilter]);

  // Handle Add Employee with validation
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!formName.trim()) {
      setFormError('Employee full name is required.');
      return;
    }
    if (!formId.trim()) {
      setFormError('Employee ID is required (e.g. AFI-001).');
      return;
    }
    if (!formEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail)) {
      setFormError('Please enter a valid official email address.');
      return;
    }

    const newStaff = {
      employeeId: formId.trim().toUpperCase(),
      name: formName.trim(),
      fullName: formName.trim(),
      role: formRole.trim() || 'Team Member',
      designation: formRole.trim() || 'Team Member',
      dept: formDept,
      department: formDept,
      email: formEmail.trim(),
      phone: formPhone.trim() || '--',
      status: 'Active',
    };

    try {
      await employeeService.addEmployee(newStaff);
      await loadEmployees();

      setFormName('');
      setFormId('');
      setFormRole('');
      setFormEmail('');
      setFormPhone('');
      setIsAddModalOpen(false);

      setFeedback(`Employee ${newStaff.name} added successfully.`);
      setTimeout(() => setFeedback(''), 3000);
    } catch (err) {
      setFormError(err.message || 'Failed to add employee record.');
    }
  };

  const handleDeleteEmployee = async (id, name) => {
    if (window.confirm(`Are you sure you want to remove ${name} from the employee directory?`)) {
      try {
        await employeeService.deleteEmployee(id);
        await loadEmployees();
        setFeedback(`Employee ${name} removed.`);
        setTimeout(() => setFeedback(''), 3000);
      } catch (err) {
        console.error('Failed to remove employee', err);
        setFeedback(err.message || 'Failed to remove employee.');
        setTimeout(() => setFeedback(''), 3000);
      }
    }
  };

  return (
    <div className="employee-list-view animate-fade-in">
      <PageHeader
        title="Employees"
        subtitle="Manage company workforce directory and departmental assignments"
        breadcrumb={[{ label: 'Admin', path: '/admin/dashboard' }, { label: 'Employee List' }]}
        actionButton={
          <button
            type="button"
            className="btn-primary-action"
            onClick={() => {
              setFormError('');
              setIsAddModalOpen(true);
            }}
          >
            <UserPlus size={15} />
            <span>Add Employee</span>
          </button>
        }
      />

      {feedback && (
        <div
          style={{
            backgroundColor: '#ecfdf5',
            border: '1px solid #a7f3d0',
            color: '#065f46',
            padding: '10px 16px',
            borderRadius: '10px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.85rem',
            fontWeight: '600',
          }}
        >
          <CheckCircle2 size={16} />
          <span>{feedback}</span>
        </div>
      )}


      <div className="management-page-card">
        {/* Search and Department Filter Toolbar */}
        <div className="filter-toolbar">
          <div className="search-input-box">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              placeholder="Search employees by name, role or ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-actions-group">
            <select
              className="filter-select"
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
            >
              <option value="ALL">All Departments</option>
              <option value="Operations">Operations</option>
              <option value="Web Developer">Web Developer</option>
              <option value="Python Developer">Python Developer</option>
              <option value="Human Resources">Human Resources</option>
              <option value="Finance">Finance</option>
            </select>
          </div>
        </div>

        {/* Directory Table matching Screenshot 5 */}
        {filtered.length === 0 ? (
          <EmptyState
            title={employees.length === 0 ? 'No employee records available.' : 'No employees found matching filter'}
            description={
              employees.length === 0
                ? 'No staff members have been added to the directory yet. Click "+ Add Employee" above to add your first employee.'
                : 'Try adjusting your search keyword or department filter.'
            }
          />
        ) : (
          <div className="table-responsive-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>EMPLOYEE</th>
                  <th>DEPARTMENT</th>
                  <th>EMAIL</th>
                  <th>STATUS</th>
                  <th style={{ textAlign: 'right' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => {
                  const empName = emp.name || emp.fullName || '';
                  const empId = emp.id || emp.employeeId || '--';
                  const empRole = emp.role || emp.designation || 'Staff Member';
                  const empDept = emp.dept || emp.department || 'Operations';
                  const empEmail = emp.email || '';
                  const empStatus = emp.status || 'Active';

                  return (
                    <tr key={emp.id || emp.email}>
                      <td>
                        <div style={{ fontWeight: '600', color: '#0b3d2b', fontSize: '0.925rem' }}>{empName}</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                          {empId} &bull; {empRole}
                        </div>
                      </td>
                      <td style={{ color: '#334155', fontSize: '0.875rem' }}>{empDept}</td>
                      <td style={{ color: '#475569', fontSize: '0.85rem' }}>{empEmail}</td>
                      <td>
                        <span className={`badge-status ${empStatus === 'Active' ? 'badge-present' : 'badge-late'}`}>
                          {empStatus}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                          <button
                            type="button"
                            className="table-action-btn"
                            style={{
                              backgroundColor: '#eef2ff',
                              border: '1px solid #c7d2fe',
                              color: '#4f46e5',
                            }}
                            onClick={() => navigate(`/admin/chat?user=${encodeURIComponent(empId)}`)}
                            title="Chat with Employee"
                          >
                            <MessageSquare size={13} />
                            <span>Chat</span>
                          </button>
                          <button
                            type="button"
                            className="table-action-btn"
                            style={{
                              backgroundColor: '#f8fafc',
                              border: '1px solid #e2e8f0',
                              color: '#334155',
                            }}
                            onClick={() => setSelectedEmp(emp)}
                            title="View Employee Profile"
                          >
                            <Eye size={13} />
                            <span>View</span>
                          </button>
                          <button
                            type="button"
                            className="table-action-btn"
                            style={{
                              backgroundColor: '#fff1f2',
                              border: '1px solid #fecdd3',
                              color: '#e11d48',
                            }}
                            onClick={() => handleDeleteEmployee(emp.id, empName)}
                            title="Remove Employee"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      <Modal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Add New Employee"
        subtitle="Register a new staff member into the organizational directory"
      >
        <form onSubmit={handleAddEmployee} noValidate>
          {formError && (
            <div
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                padding: '10px 14px',
                borderRadius: '8px',
                marginBottom: '14px',
                fontSize: '0.825rem',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <AlertCircle size={15} />
              <span>{formError}</span>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Full Name *</label>
            <input
              type="text"
              required
              className="form-input-auth"
              placeholder="e.g. John Doe"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Employee ID *</label>
              <input
                type="text"
                required
                className="form-input-auth"
                placeholder="e.g. AFI-003"
                value={formId}
                onChange={(e) => setFormId(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Designation / Role</label>
              <input
                type="text"
                className="form-input-auth"
                placeholder="e.g. Associate"
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
            <div className="form-group">
              <label className="form-label">Department</label>
              <select
                className="form-input-auth"
                value={formDept}
                onChange={(e) => setFormDept(e.target.value)}
              >
                <option value="Operations">Operations</option>
                <option value="Web Developer">Web Developer</option>
                <option value="Python Developer">Python Developer</option>
                <option value="Human Resources">Human Resources</option>
                <option value="Finance">Finance</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="text"
                className="form-input-auth"
                placeholder="e.g. +91 98765 43210"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Official Email Address *</label>
            <input
              type="email"
              required
              className="form-input-auth"
              placeholder="e.g. employee@arshithgroup.com"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              className="btn-secondary-gray"
              style={{ width: 'auto', padding: '0 16px', height: '38px' }}
              onClick={() => setIsAddModalOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary-purple"
              style={{ width: 'auto', padding: '0 18px', height: '38px' }}
            >
              Save Employee
            </button>
          </div>
        </form>
      </Modal>

      {/* View Employee Profile Modal */}
      <Modal
        isOpen={Boolean(selectedEmp)}
        onClose={() => setSelectedEmp(null)}
        title="Employee Profile Details"
        subtitle={selectedEmp ? `${selectedEmp.name} (${selectedEmp.id})` : ''}
      >
        {selectedEmp && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  backgroundColor: '#0b3d2b',
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.2rem',
                  fontWeight: '700',
                }}
              >
                {(selectedEmp.name || 'E').charAt(0).toUpperCase()}
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: '700', color: '#0f172a' }}>{selectedEmp.name}</h4>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                  {selectedEmp.role || selectedEmp.designation || 'Staff Member'} &bull; {selectedEmp.dept || selectedEmp.department}
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '0.88rem' }}>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Employee ID</span>
                <strong>{selectedEmp.id}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Status</span>
                <span className={`badge-status ${selectedEmp.status === 'Active' ? 'badge-present' : 'badge-late'}`}>
                  {selectedEmp.status || 'Active'}
                </span>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Joining Date</span>
                <strong>{selectedEmp.joining || '--'}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Phone</span>
                <strong>{selectedEmp.phone || '--'}</strong>
              </div>
              <div style={{ gridColumn: 'span 2' }}>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Email Address</span>
                <strong>{selectedEmp.email}</strong>
              </div>
            </div>

            {/* Banking & Statutory Details Section */}
            <div style={{ marginTop: '8px', padding: '14px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: '0.8rem', fontWeight: '700', color: '#0b3d2b', textTransform: 'uppercase', marginBottom: '10px' }}>
                Payroll &amp; Statutory Credentials (Employee Kept)
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.725rem' }}>Office Role / Designation</span>
                  <strong style={{ color: '#0f172a' }}>{selectedEmp.designation || selectedEmp.role || 'Not Set'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.725rem' }}>Bank Name</span>
                  <strong style={{ color: '#0f172a' }}>{selectedEmp.bank_name || selectedEmp.bankName || 'IDFC FIRST BANK (Default)'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.725rem' }}>Bank Account Number</span>
                  <strong style={{ color: '#0f172a' }}>{selectedEmp.account_number || selectedEmp.accountNumber || '87387687323 (Default)'}</strong>
                </div>
                <div>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.725rem' }}>PAN Card Number</span>
                  <strong style={{ color: '#0f172a', letterSpacing: '0.5px' }}>{selectedEmp.pan_number || selectedEmp.panNumber || selectedEmp.pan || 'GF837FEYB73 (Default)'}</strong>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <span style={{ color: '#64748b', display: 'block', fontSize: '0.725rem' }}>UAN (PF Number)</span>
                  <strong style={{ color: '#0f172a', letterSpacing: '0.5px' }}>{selectedEmp.uan_number || selectedEmp.uanNumber || selectedEmp.uan || selectedEmp.pf_number || '27368873212 (Default)'}</strong>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button
                type="button"
                className="btn-secondary-gray"
                style={{ width: 'auto', padding: '0 18px', height: '38px' }}
                onClick={() => setSelectedEmp(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
