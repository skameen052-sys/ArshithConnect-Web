import React, { useState, useEffect } from 'react';
import {
  Award,
  Star,
  TrendingUp,
  AlertCircle,
  Sparkles,
  MessageSquare,
  ThumbsUp,
  Compass,
  RefreshCw,
} from 'lucide-react';
import { performanceService } from '../../services/performanceService';
import '../../styles/hrms.css';

export default function EmployeePerformance() {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('arshith_user')) || null;
    } catch {
      return null;
    }
  })();
  const employeeId = storedUser?.employeeId || storedUser?.employee_id || storedUser?.id || storedUser?.uid || '';
  const employeeEmail = storedUser?.email || '';
  const employeeName = storedUser?.name || storedUser?.full_name || storedUser?.fullName || 'Employee';

  useEffect(() => {
    loadPerformanceData();
  }, [employeeId, employeeEmail]);

  const loadPerformanceData = async () => {
    setLoading(true);
    setError(null);
    try {
      const revData = await performanceService.getReviews(employeeId || employeeEmail || null);
      setReviews(Array.isArray(revData) ? revData : []);
    } catch (err) {
      console.error('Failed to load employee performance data', err);
      setError('Unable to load performance appraisal details. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const latestReview = reviews.length > 0 ? reviews[0] : null;

  const getRatingBadge = (rating) => {
    if (rating >= 4.5) return { label: 'Outstanding (Exceeds All Goals)', color: '#047857', bg: '#ecfdf5', border: '#a7f3d0' };
    if (rating >= 3.5) return { label: 'Exceeds Expectations', color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd' };
    if (rating >= 2.5) return { label: 'Meets Expectations', color: '#d97706', bg: '#fffbeb', border: '#fde68a' };
    return { label: 'Needs Improvement', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  };

  return (
    <div className="hrms-page-container animate-fade-in" style={{ maxWidth: '100%', boxSizing: 'border-box', marginBottom: '36px' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              backgroundColor: '#ecfdf5',
              color: '#047857',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Award size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, color: '#0b3d2b', margin: 0 }}>
              My Performance & Appraisals
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#64748b', margin: 0 }}>
              Official appraisal scorecards, leadership feedback, and merit increment recommendations
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadPerformanceData}
          disabled={loading}
          className="hrms-btn-secondary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="hrms-card" style={{ padding: '48px', textAlign: 'center', color: '#64748b' }}>
          <div className="spinner-border text-success" role="status" style={{ width: '2rem', height: '2rem' }}></div>
          <div style={{ marginTop: '12px', fontWeight: 600 }}>Loading performance appraisals...</div>
        </div>
      ) : error ? (
        <div className="hrms-card" style={{ padding: '24px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={20} />
            <span style={{ fontWeight: 600 }}>{error}</span>
          </div>
        </div>
      ) : (
        <>
          {/* Latest Appraisal Hero Card */}
          {latestReview ? (
            <div
              className="hrms-card"
              style={{
                padding: '24px',
                marginBottom: '24px',
                background: 'linear-gradient(135deg, #ffffff 0%, #f0fdf4 100%)',
                border: '1.5px solid #a7f3d0',
                borderRadius: '18px',
                boxShadow: '0 4px 18px rgba(11, 61, 43, 0.04)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
                <div>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 800,
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      color: '#047857',
                      backgroundColor: '#d1fae5',
                      padding: '4px 12px',
                      borderRadius: '999px',
                      marginBottom: '8px',
                    }}
                  >
                    <Sparkles size={14} /> Official Appraisal &bull; {latestReview.review_period || 'Annual 2026'}
                  </span>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#0b3d2b', margin: 0 }}>
                    {employeeName} — Appraisal Scorecard
                  </h2>
                  <div style={{ fontSize: '0.825rem', color: '#64748b', marginTop: '4px' }}>
                    Evaluated by: <strong>{latestReview.evaluated_by || 'Management'}</strong> &bull; {latestReview.evaluated_at ? new Date(latestReview.evaluated_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Recently'}
                  </div>
                </div>

                {/* Score & Category */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      textAlign: 'center',
                      backgroundColor: '#ffffff',
                      border: '1px solid #d1fae5',
                      padding: '12px 20px',
                      borderRadius: '16px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#f59e0b', marginBottom: '4px' }}>
                      {[...Array(5)].map((_, i) => (
                        <Star
                          key={i}
                          size={18}
                          fill={i < Math.floor(latestReview.rating) ? '#f59e0b' : 'none'}
                          stroke="#f59e0b"
                        />
                      ))}
                    </div>
                    <div style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0b3d2b', lineHeight: 1 }}>
                      {Number(latestReview.rating).toFixed(1)} <span style={{ fontSize: '1rem', color: '#64748b', fontWeight: 600 }}>/ 5.0</span>
                    </div>
                    <div
                      style={{
                        marginTop: '6px',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: getRatingBadge(latestReview.rating).color,
                      }}
                    >
                      {getRatingBadge(latestReview.rating).label}
                    </div>
                  </div>

                  {latestReview.recommended_increment_pct > 0 && (
                    <div
                      style={{
                        backgroundColor: '#ecfdf5',
                        border: '1px solid #a7f3d0',
                        padding: '14px 18px',
                        borderRadius: '16px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px', color: '#047857', fontWeight: 800, fontSize: '0.75rem', textTransform: 'uppercase' }}>
                        <TrendingUp size={14} /> Merit Increment
                      </div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 900, color: '#047857', marginTop: '2px' }}>
                        +{latestReview.recommended_increment_pct}%
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#065f46' }}>Recommended</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Feedback Highlights Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: '14px', marginTop: '16px' }}>
                {/* Strengths */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#059669', fontWeight: 700, fontSize: '0.875rem', marginBottom: '8px' }}>
                    <ThumbsUp size={16} /> Key Strengths & Accomplishments
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
                    {latestReview.strengths || 'Consistent high-quality deliverables and proactive team engagement.'}
                  </p>
                </div>

                {/* Areas of Improvement */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '16px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0284c7', fontWeight: 700, fontSize: '0.875rem', marginBottom: '8px' }}>
                    <Compass size={16} /> Growth & Development Focus
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#334155', lineHeight: 1.5, margin: 0 }}>
                    {latestReview.areas_for_improvement || 'Continue technical certifications and mentor cross-functional team members.'}
                  </p>
                </div>

                {/* Leadership Comments */}
                <div
                  style={{
                    backgroundColor: '#ffffff',
                    border: '1px solid #e2e8f0',
                    borderRadius: '14px',
                    padding: '16px',
                    gridColumn: '1 / -1',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#0b3d2b', fontWeight: 700, fontSize: '0.875rem', marginBottom: '8px' }}>
                    <MessageSquare size={16} /> Leadership Feedback & Comments
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#1e293b', lineHeight: 1.55, margin: 0, fontStyle: 'italic', backgroundColor: '#f8fafc', padding: '12px 16px', borderRadius: '10px', borderLeft: '4px solid #0b3d2b' }}>
                    "{latestReview.manager_feedback || 'Thank you for your dedication, consistency, and exceptional contributions to our team goals.'}"
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div
              className="hrms-card"
              style={{
                padding: '36px',
                textAlign: 'center',
                backgroundColor: '#ffffff',
                borderRadius: '18px',
                border: '1px dashed #cbd5e1',
                marginBottom: '24px',
              }}
            >
              <div
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: '#f1f5f9',
                  color: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 14px auto',
                }}
              >
                <Award size={28} />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#1e293b', marginBottom: '6px' }}>
                Appraisal Review In Progress
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#64748b', maxWidth: '480px', margin: '0 auto' }}>
                No official appraisal scorecard has been published yet for {employeeName}{employeeId ? ` (${employeeId})` : ''}. Once your evaluation is recorded by administration, it will appear here immediately.
              </p>
            </div>
          )}


          {/* Historical Reviews Table */}
          {reviews.length > 1 && (
            <div className="hrms-card" style={{ padding: '22px', borderRadius: '18px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#0b3d2b', marginBottom: '14px' }}>
                Appraisal History
              </h3>
              <div className="hrms-table-container">
                <table className="hrms-table">
                  <thead>
                    <tr>
                      <th>Review Cycle</th>
                      <th>Rating</th>
                      <th>Category</th>
                      <th>Increment %</th>
                      <th>Evaluated By</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.slice(1).map((rev, idx) => {
                      const badge = getRatingBadge(rev.rating);
                      return (
                        <tr key={rev.id || idx}>
                          <td style={{ fontWeight: 600 }}>{rev.review_period}</td>
                          <td>
                            <strong style={{ color: '#0b3d2b' }}>{Number(rev.rating).toFixed(1)}</strong> / 5.0
                          </td>
                          <td>
                            <span className="hrms-badge" style={{ backgroundColor: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                              {badge.label}
                            </span>
                          </td>
                          <td>
                            {rev.recommended_increment_pct ? `+${rev.recommended_increment_pct}%` : '--'}
                          </td>
                          <td>{rev.evaluated_by || 'HR'}</td>
                          <td>
                            {rev.evaluated_at ? new Date(rev.evaluated_at).toLocaleDateString('en-IN') : '--'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
