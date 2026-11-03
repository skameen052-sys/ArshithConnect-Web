import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, Shield } from 'lucide-react';
import BrandLogo from '../../components/common/BrandLogo';
import { authService } from '../../services/authService';
import '../../styles/auth.css';

export default function EmployeeLogin() {
  const navigate = useNavigate();

  // If already authenticated as employee, redirect directly to dashboard
  useEffect(() => {
    const role = localStorage.getItem('arshith_role');
    const user = localStorage.getItem('arshith_user');
    const token = localStorage.getItem('arshith_auth_token');
    if (role === 'employee' && user && token) {
      navigate('/employee/dashboard', { replace: true });
    }
  }, [navigate]);

  // Form fields start completely empty
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);

  const validate = () => {
    const newErrors = {};
    const emailTrimmed = formData.email.trim();
    const passwordTrimmed = formData.password;

    // Case A: Email or password missing
    if (!emailTrimmed || !passwordTrimmed) {
      newErrors.form = 'Please enter your company email and password.';
      if (!emailTrimmed) newErrors.email = 'Please enter your company email and password.';
      if (!passwordTrimmed) newErrors.password = 'Please enter your company email and password.';
      setErrors(newErrors);
      return false;
    }

    // Case B: Invalid email format or unsupported domain
    if (!/^[a-zA-Z0-9_.+-]+@arshithgroup\.com$/i.test(emailTrimmed)) {
      newErrors.email = 'Please use your company email ending with @arshithgroup.com.';
      newErrors.form = 'Please use your company email ending with @arshithgroup.com.';
      setErrors(newErrors);
      return false;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;
    if (!validate()) return;

    setIsLoading(true);
    setErrors((prev) => ({ ...prev, form: '' }));
    try {
      await authService.login({
        email: formData.email,
        password: formData.password,
      });
      navigate('/employee/dashboard');
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        form: err.message || 'Invalid employee email or password.',
      }));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-container animate-fade-in">
        {/* Top Brand Logo */}
        <div className="auth-header">
          <BrandLogo size="compact" />
          <p className="auth-subtitle-brand">Employee Attendance Portal</p>
        </div>

        {/* Login Card */}
        <div className="auth-card">
          {/* Subtle Small Admin Login at Top-Right Corner */}
          <button
            type="button"
            onClick={() => navigate('/admin/login')}
            className="admin-corner-btn"
            title="Switch to Admin Portal"
          >
            <Shield size={11} color="#6941c6" />
            <span>Admin</span>
          </button>

          <h1 className="auth-card-title">Welcome Back</h1>
          <p className="auth-card-desc">Sign in to manage your attendance</p>

          <form onSubmit={handleSubmit} noValidate>
            {errors.form && (
              <div
                style={{
                  backgroundColor: (errors.form.toLowerCase().includes('pending') || errors.form.toLowerCase().includes('awaiting')) ? '#fffbeb' : '#fef2f2',
                  border: `1px solid ${(errors.form.toLowerCase().includes('pending') || errors.form.toLowerCase().includes('awaiting')) ? '#fde68a' : '#fecaca'}`,
                  color: (errors.form.toLowerCase().includes('pending') || errors.form.toLowerCase().includes('awaiting')) ? '#92400e' : '#b91c1c',
                  padding: '10px 14px',
                  borderRadius: '8px',
                  fontSize: '0.85rem',
                  lineHeight: '1.45',
                  marginBottom: '16px',
                  textAlign: 'center',
                  fontWeight: '500',
                }}
              >
                {errors.form}
              </div>
            )}
            {/* Email Field */}
            <div className="form-group">
              <label className="form-label" htmlFor="emp-email">Email</label>
              <div className="input-wrapper">
                <input
                  id="emp-email"
                  type="email"
                  className={`form-input-auth ${errors.email ? 'form-input-error' : ''}`}
                  placeholder="Enter your email"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value });
                    if (errors.email || errors.form) {
                      setErrors((prev) => ({ ...prev, email: '', form: '' }));
                    }
                  }}
                  disabled={isLoading}
                  autoComplete="email"
                />
              </div>
              {errors.email && <span className="input-error-msg">{errors.email}</span>}
            </div>

            {/* Password Field */}
            <div className="form-group">
              <label className="form-label" htmlFor="emp-password">Password</label>
              <div className="input-wrapper">
                <input
                  id="emp-password"
                  type={showPassword ? 'text' : 'password'}
                  className={`form-input-auth ${errors.password ? 'form-input-error' : ''}`}
                  placeholder="Enter your password"
                  value={formData.password}
                  onChange={(e) => {
                    setFormData({ ...formData, password: e.target.value });
                    if (errors.password || errors.form) {
                      setErrors((prev) => ({ ...prev, password: '', form: '' }));
                    }
                  }}
                  disabled={isLoading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="input-icon-right"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <span className="input-error-msg">{errors.password}</span>}
            </div>

            {/* Buttons Stack */}
            <div className="auth-button-stack">
              <button
                type="submit"
                className="btn-primary-purple"
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>LOGGING IN...</span>
                  </>
                ) : (
                  'LOGIN'
                )}
              </button>

              <button
                type="button"
                className="btn-tertiary-purple"
                onClick={() => navigate('/register')}
              >
                REGISTER
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <footer className="auth-footer">
          Arshith Connect &bull; Employee Portal
        </footer>
      </div>
    </div>
  );
}
