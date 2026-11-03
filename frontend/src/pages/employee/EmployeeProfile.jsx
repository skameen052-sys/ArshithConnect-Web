import React, { useState, useEffect, useRef } from 'react';
import {
  User,
  Mail,
  Phone,
  Building2,
  Briefcase,
  Calendar,
  Shield,
  MapPin,
  CheckCircle,
  CreditCard,
  Landmark,
  FileText,
  ShieldCheck,
  Edit3,
  Save,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Info,
  Camera,
  Upload,
} from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';
import { employeeService } from '../../services/employeeService';
import { compressImageFile } from '../../utils/imageUtils';

export default function EmployeeProfile() {
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState({ type: '', text: '' });
  const avatarInputRef = useRef(null);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsSaving(true);
      const compressed = await compressImageFile(file, 400, 400, 0.85);
      await employeeService.updateMyProfile({ profile_photo: compressed });
      setProfile((prev) => ({ ...(prev || {}), profile_photo: compressed, profilePhoto: compressed }));
      const stored = JSON.parse(localStorage.getItem('arshith_user') || '{}');
      stored.profile_photo = compressed;
      stored.profilePhoto = compressed;
      localStorage.setItem('arshith_user', JSON.stringify(stored));
      setFeedbackMsg({ type: 'success', text: 'Profile photo updated successfully from your laptop!' });
    } catch (err) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Failed to upload profile photo' });
    } finally {
      setIsSaving(false);
    }
  };

  // Form edit states
  const [formData, setFormData] = useState({
    fullName: '',
    role: '',
    phone: '',
    bankName: '',
    accountNumber: '',
    panNumber: '',
    uanNumber: '',
  });

  const syncFormFromProfile = (data) => {
    if (!data) return;
    setFormData({
      fullName: data.fullName || data.name || '',
      role: data.role || data.designation || '',
      phone: data.phone && data.phone !== '--' ? data.phone : '',
      bankName: data.bankName || data.bank_name || '',
      accountNumber: data.accountNumber || data.account_number || data.bank_account_no || '',
      panNumber: data.panNumber || data.pan_number || data.pan || '',
      uanNumber: data.uanNumber || data.uan_number || data.uan || data.pf_number || '',
    });
  };

  const fetchProfile = async () => {
    try {
      setIsLoading(true);
      const data = await employeeService.getProfile('me');
      if (data) {
        setProfile(data);
        syncFormFromProfile(data);
      }
    } catch (err) {
      console.warn('Failed to fetch personal profile', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchProfile();
  }, []);

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('arshith_user')) || null;
    } catch {
      return null;
    }
  })();

  const employeeName = profile?.name || profile?.fullName || storedUser?.name || 'Employee';
  const employeeEmail = profile?.email || storedUser?.email || 'employee@arshith.com';
  const employeeId = profile?.id || profile?.employeeId || storedUser?.employeeId || 'AFI-001';
  const designation = profile?.designation || profile?.role || 'Operations Associate';
  const department = profile?.department || profile?.dept || 'Operations & Attendance';
  const phone = profile?.phone || '+91 98765 43210';
  const joiningDate = profile?.joining || 'April 10, 2024';
  const location = profile?.location || 'HQ Office • Hybrid Mode';

  const bankName = profile?.bankName || profile?.bank_name || '';
  const accountNumber = profile?.accountNumber || profile?.account_number || profile?.bank_account_no || '';
  const panNumber = profile?.panNumber || profile?.pan_number || profile?.pan || '';
  const uanNumber = profile?.uanNumber || profile?.uan_number || profile?.uan || profile?.pf_number || '';
  const profilePhoto = profile?.profile_photo || profile?.profilePhoto || storedUser?.profile_photo || storedUser?.profilePhoto || '';

  const handleEditToggle = () => {
    if (!isEditing) {
      syncFormFromProfile(profile);
      setFeedbackMsg({ type: '', text: '' });
    }
    setIsEditing(!isEditing);
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: field === 'panNumber' ? value.toUpperCase() : value,
    }));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setFeedbackMsg({ type: '', text: '' });

    // Validation
    const cleanPan = formData.panNumber.trim().toUpperCase();
    if (cleanPan && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(cleanPan)) {
      setFeedbackMsg({
        type: 'error',
        text: 'Invalid PAN card format. Please enter a valid 10-character PAN (e.g. ABCDE1234F).',
      });
      setIsSaving(false);
      return;
    }

    const cleanUan = formData.uanNumber.trim();
    if (cleanUan && !/^\d{10,12}$/.test(cleanUan)) {
      setFeedbackMsg({
        type: 'error',
        text: 'UAN (PF Number) should be a 10 to 12 digit number.',
      });
      setIsSaving(false);
      return;
    }

    try {
      const payload = {
        fullName: formData.fullName.trim() || undefined,
        name: formData.fullName.trim() || undefined,
        role: formData.role.trim() || undefined,
        designation: formData.role.trim() || undefined,
        phone: formData.phone.trim() || undefined,
        bankName: formData.bankName.trim(),
        bank_name: formData.bankName.trim(),
        accountNumber: formData.accountNumber.trim(),
        account_number: formData.accountNumber.trim(),
        panNumber: cleanPan,
        pan_number: cleanPan,
        pan: cleanPan,
        uanNumber: cleanUan,
        uan_number: cleanUan,
        uan: cleanUan,
        pf_number: cleanUan,
      };

      const updated = await employeeService.updateMyProfile(payload);
      if (updated) {
        setProfile(updated);
        syncFormFromProfile(updated);

        // Synchronize local storage user details if changed
        try {
          const userStr = localStorage.getItem('arshith_user');
          if (userStr) {
            const parsed = JSON.parse(userStr);
            parsed.name = updated.name || updated.fullName || parsed.name;
            parsed.fullName = updated.fullName || updated.name || parsed.fullName;
            parsed.role_title = updated.role || updated.designation || parsed.role_title;
            localStorage.setItem('arshith_user', JSON.stringify(parsed));
          }
        } catch {
          // ignore localStorage parsing errors
        }

        setFeedbackMsg({
          type: 'success',
          text: 'Personal and banking information saved successfully! These details will now appear on your official payslips.',
        });
        setIsEditing(false);
      }
    } catch (err) {
      setFeedbackMsg({
        type: 'error',
        text: err.message || 'Failed to save personal details. Please try again.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="employee-profile-view animate-fade-in" style={{ maxWidth: '1100px', margin: '0 auto', paddingBottom: '30px' }}>
      <PageHeader
        title="My Profile"
        subtitle="Personal records, banking information, statutory PF/PAN credentials, and organizational mapping"
        breadcrumb={[{ label: 'Employee', path: '/employee/dashboard' }, { label: 'Profile' }]}
      />

      {feedbackMsg.text && (
        <div
          style={{
            marginBottom: '18px',
            padding: '12px 18px',
            borderRadius: '10px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.88rem',
            fontWeight: '600',
            backgroundColor: feedbackMsg.type === 'error' ? '#fef2f2' : '#ecfdf5',
            color: feedbackMsg.type === 'error' ? '#991b1b' : '#065f46',
            border: `1px solid ${feedbackMsg.type === 'error' ? '#fecaca' : '#a7f3d0'}`,
          }}
        >
          {feedbackMsg.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{feedbackMsg.text}</span>
        </div>
      )}

      {/* Main Profile Header Card */}
      <div
        style={{
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          padding: '24px',
          marginBottom: '20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '20px',
          flexWrap: 'wrap',
          boxShadow: '0 2px 6px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {/* Hidden file input for laptop upload */}
          <input
            type="file"
            ref={avatarInputRef}
            accept="image/png, image/jpeg, image/jpg, image/webp"
            style={{ display: 'none' }}
            onChange={handleAvatarChange}
          />
          <div
            onClick={() => avatarInputRef.current?.click()}
            style={{
              position: 'relative',
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              backgroundColor: '#0b3d2b',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.8rem',
              fontWeight: '800',
              cursor: 'pointer',
              border: '3px solid #e2e8f0',
              overflow: 'hidden',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              flexShrink: 0,
            }}
            title="Click to change profile photo from laptop"
          >
            {profilePhoto ? (
              <img
                src={profilePhoto}
                alt={employeeName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span>{employeeName.charAt(0).toUpperCase()}</span>
            )}

            <div
              style={{
                position: 'absolute',
                bottom: '0',
                right: '0',
                left: '0',
                backgroundColor: 'rgba(11, 61, 43, 0.78)',
                color: '#ffffff',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background-color 0.2s ease',
              }}
              title="Upload new photo"
            >
              <Camera size={13} />
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.35rem', fontWeight: '800', color: '#0b3d2b', margin: 0 }}>
                {employeeName}
              </h2>
              <span
                style={{
                  backgroundColor: '#ecfdf5',
                  color: '#047857',
                  fontSize: '0.75rem',
                  fontWeight: '700',
                  padding: '2px 8px',
                  borderRadius: '6px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <CheckCircle size={12} />
                <span>Active Staff</span>
              </span>
            </div>

            <div style={{ fontSize: '0.88rem', color: '#64748b', marginTop: '4px' }}>
              Staff ID: <strong style={{ color: '#0b3d2b' }}>{employeeId}</strong> &bull; {designation}
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleEditToggle}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '9px 18px',
            backgroundColor: isEditing ? '#f1f5f9' : '#0b3d2b',
            color: isEditing ? '#334155' : '#ffffff',
            border: isEditing ? '1px solid #cbd5e1' : 'none',
            borderRadius: '10px',
            fontSize: '0.88rem',
            fontWeight: '700',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
          }}
        >
          {isEditing ? (
            <>
              <X size={16} />
              <span>Cancel Editing</span>
            </>
          ) : (
            <>
              <Edit3 size={16} />
              <span>Edit Personal Information</span>
            </>
          )}
        </button>
      </div>

      {/* Edit Form Section (When Edit Mode is active) */}
      {isEditing && (
        <div
          className="management-page-card animate-scale-up"
          style={{
            marginBottom: '22px',
            border: '2px solid #0b3d2b',
            borderRadius: '16px',
            backgroundColor: '#ffffff',
            padding: '24px',
            boxShadow: '0 10px 25px -5px rgba(11, 61, 43, 0.1)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0b3d2b', margin: 0 }}>
                Update Personal, Banking &amp; Statutory Information
              </h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.825rem', color: '#64748b' }}>
                Keep your bank and PF account details accurate so the admin can generate your monthly payslips with exact records.
              </p>
            </div>
            <span
              style={{
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.75rem',
                fontWeight: '700',
              }}
            >
              Payroll Master Sync
            </span>
          </div>

          <form onSubmit={handleSaveProfile}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 250px), 1fr))', gap: '16px' }}>
              {/* Full Name */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                  Full Legal Name *
                </label>
                <input
                  type="text"
                  required
                  className="form-input-auth"
                  placeholder="e.g. Rahul Sharma"
                  value={formData.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  style={{ width: '100%', height: '40px', fontSize: '0.88rem' }}
                />
              </div>

              {/* Office Role / Designation */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                  Role in the Office (Designation) *
                </label>
                <input
                  type="text"
                  required
                  className="form-input-auth"
                  placeholder="e.g. Python Developer / Operations Associate"
                  value={formData.role}
                  onChange={(e) => handleInputChange('role', e.target.value)}
                  style={{ width: '100%', height: '40px', fontSize: '0.88rem' }}
                />
              </div>

              {/* Contact Phone */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                  Contact Phone Number
                </label>
                <input
                  type="text"
                  className="form-input-auth"
                  placeholder="e.g. 9876543210"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  style={{ width: '100%', height: '40px', fontSize: '0.88rem' }}
                />
              </div>

              {/* Bank Name */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                  Bank Name *
                </label>
                <input
                  type="text"
                  required
                  className="form-input-auth"
                  placeholder="e.g. HDFC Bank / State Bank of India / IDFC FIRST"
                  value={formData.bankName}
                  onChange={(e) => handleInputChange('bankName', e.target.value)}
                  style={{ width: '100%', height: '40px', fontSize: '0.88rem' }}
                />
              </div>

              {/* Bank Account Number */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                  Bank Account Number *
                </label>
                <input
                  type="text"
                  required
                  className="form-input-auth"
                  placeholder="e.g. 50100234567890"
                  value={formData.accountNumber}
                  onChange={(e) => handleInputChange('accountNumber', e.target.value)}
                  style={{ width: '100%', height: '40px', fontSize: '0.88rem' }}
                />
              </div>

              {/* PAN Card Number */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                  PAN Card Number *
                </label>
                <input
                  type="text"
                  required
                  maxLength={10}
                  className="form-input-auth"
                  placeholder="e.g. ABCDE1234F"
                  value={formData.panNumber}
                  onChange={(e) => handleInputChange('panNumber', e.target.value)}
                  style={{ width: '100%', height: '40px', fontSize: '0.88rem', textTransform: 'uppercase', letterSpacing: '1px' }}
                />
              </div>

              {/* UAN / PF Account Number */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: '700', color: '#334155' }}>
                  UAN Number (PF Number after account created) *
                </label>
                <input
                  type="text"
                  required
                  maxLength={12}
                  className="form-input-auth"
                  placeholder="e.g. 100904321234 (12 digits)"
                  value={formData.uanNumber}
                  onChange={(e) => handleInputChange('uanNumber', e.target.value)}
                  style={{ width: '100%', height: '40px', fontSize: '0.88rem', letterSpacing: '1px' }}
                />
              </div>
            </div>

            <div
              style={{
                marginTop: '16px',
                padding: '12px 14px',
                backgroundColor: '#f8fafc',
                borderRadius: '8px',
                fontSize: '0.785rem',
                color: '#475569',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <Info size={16} style={{ color: '#0b3d2b', flexShrink: 0 }} />
              <span>
                <strong>Official Notice:</strong> The information entered here is stored directly in your employee personnel record. Whenever administration runs monthly payroll or issues locked PDF payslips, these exact details will be displayed on your payslip.
              </span>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                disabled={isSaving}
                style={{
                  padding: '9px 18px',
                  backgroundColor: '#f1f5f9',
                  color: '#475569',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 24px',
                  backgroundColor: '#0b3d2b',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  fontWeight: '700',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  opacity: isSaving ? 0.75 : 1,
                  boxShadow: '0 2px 4px rgba(11, 61, 43, 0.2)',
                }}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    <span>Save Personal Details</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Profile Details Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '18px', marginBottom: '32px' }}>
        {/* Personal & Statutory Information Card (The Core Highlight) */}
        <div
          className="management-page-card"
          style={{
            gridColumn: '1 / -1',
            border: '1px solid #cbd5e1',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            padding: '24px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  backgroundColor: '#ecfdf5',
                  color: '#0b3d2b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Landmark size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.05rem', fontWeight: '800', color: '#0b3d2b', margin: 0 }}>
                  Personal, Banking &amp; Statutory Information
                </h3>
                <span style={{ fontSize: '0.785rem', color: '#64748b' }}>
                  Primary details for salary disbursement, EPF contribution, and monthly payslip generation
                </span>
              </div>
            </div>

            {!isEditing && (
              <button
                type="button"
                onClick={handleEditToggle}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 14px',
                  backgroundColor: '#f8fafc',
                  color: '#0b3d2b',
                  border: '1px solid #cbd5e1',
                  borderRadius: '8px',
                  fontSize: '0.8rem',
                  fontWeight: '700',
                  cursor: 'pointer',
                }}
              >
                <Edit3 size={14} />
                <span>Update Details</span>
              </button>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: '16px', fontSize: '0.88rem' }}>
            {/* Role in Office */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <Briefcase size={18} style={{ color: '#0b3d2b', marginTop: '2px' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>
                  Role in Office
                </span>
                <strong style={{ color: '#0f172a', fontSize: '0.92rem', display: 'block', marginTop: '2px' }}>
                  {designation || 'Operations Associate'}
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#047857', fontWeight: '600' }}>Official Corporate Role</span>
              </div>
            </div>

            {/* Bank Name */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <Landmark size={18} style={{ color: '#0b3d2b', marginTop: '2px' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>
                  Bank Name
                </span>
                <strong style={{ color: '#0f172a', fontSize: '0.92rem', display: 'block', marginTop: '2px' }}>
                  {bankName || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 'normal' }}>Not configured (Default: IDFC FIRST BANK)</span>}
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Salary Credited To</span>
              </div>
            </div>

            {/* Account Number */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <CreditCard size={18} style={{ color: '#0b3d2b', marginTop: '2px' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>
                  Account Number
                </span>
                <strong style={{ color: '#0f172a', fontSize: '0.92rem', display: 'block', marginTop: '2px', letterSpacing: '0.5px' }}>
                  {accountNumber || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 'normal' }}>Not configured</span>}
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Disbursement Account</span>
              </div>
            </div>

            {/* PAN Card Number */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <FileText size={18} style={{ color: '#0b3d2b', marginTop: '2px' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>
                  PAN Card Number
                </span>
                <strong style={{ color: '#0f172a', fontSize: '0.92rem', display: 'block', marginTop: '2px', letterSpacing: '1px' }}>
                  {panNumber || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 'normal' }}>Not configured</span>}
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>TDS &amp; Tax Assessment</span>
              </div>
            </div>

            {/* UAN / PF Account Number */}
            <div
              style={{
                padding: '14px',
                backgroundColor: '#f8fafc',
                borderRadius: '12px',
                border: '1px solid #f1f5f9',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '12px',
              }}
            >
              <ShieldCheck size={18} style={{ color: '#0b3d2b', marginTop: '2px' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem', fontWeight: '600', textTransform: 'uppercase' }}>
                  UAN (PF Number)
                </span>
                <strong style={{ color: '#0f172a', fontSize: '0.92rem', display: 'block', marginTop: '2px', letterSpacing: '1px' }}>
                  {uanNumber || <span style={{ color: '#94a3b8', fontStyle: 'italic', fontWeight: 'normal' }}>Not configured (Pending PF account creation)</span>}
                </strong>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>Employees' Provident Fund</span>
              </div>
            </div>
          </div>
        </div>

        {/* Employment Information */}
        <div className="management-page-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxSizing: 'border-box', maxWidth: '100%' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0b3d2b', marginBottom: '16px' }}>
            Employment Details
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Briefcase size={16} style={{ color: '#0b3d2b' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Designation</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>{designation}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Building2 size={16} style={{ color: '#0b3d2b' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Department</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>{department}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Calendar size={16} style={{ color: '#0b3d2b' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Joining Date</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>{joiningDate}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <MapPin size={16} style={{ color: '#0b3d2b' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Work Location</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>{location}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Contact & Security */}
        <div className="management-page-card" style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '24px', border: '1px solid #e2e8f0', boxSizing: 'border-box', maxWidth: '100%' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#0b3d2b', marginBottom: '16px' }}>
            Contact &amp; Security
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '0.88rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Mail size={16} style={{ color: '#0b3d2b' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Official Email</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>{employeeEmail}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Phone size={16} style={{ color: '#0b3d2b' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Contact Phone</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>{phone}</span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Shield size={16} style={{ color: '#0b3d2b' }} />
              <div>
                <span style={{ color: '#64748b', display: 'block', fontSize: '0.75rem' }}>Role Permission</span>
                <span style={{ fontWeight: '600', color: '#1e293b' }}>Standard Employee Access</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
