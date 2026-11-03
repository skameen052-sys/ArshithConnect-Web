import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock, ShieldCheck, Check, Sparkles, MapPin, X, ArrowRight, Sun } from 'lucide-react';

export default function AttendanceCelebrationModal({
  isOpen,
  type = 'check-in', // 'check-in' | 'check-out'
  data = {},
  onClose,
}) {
  const [particles, setParticles] = useState([]);

  // Generate randomized celebration confetti particles on open
  useEffect(() => {
    if (!isOpen) return;

    const colors = type === 'check-in'
      ? ['#10b981', '#34d399', '#059669', '#6ee7b7', '#f59e0b', '#8b5cf6']
      : ['#3b82f6', '#60a5fa', '#2563eb', '#93c5fd', '#8b5cf6', '#ec4899'];

    const newParticles = Array.from({ length: 24 }).map((_, i) => ({
      id: i,
      left: `${10 + Math.random() * 80}%`,
      backgroundColor: colors[Math.floor(Math.random() * colors.length)],
      delay: `${Math.random() * 0.4}s`,
      duration: `${2.2 + Math.random() * 1.2}s`,
      size: `${6 + Math.random() * 7}px`,
    }));

    setParticles(newParticles);

    // Auto-dismiss after 3.8 seconds
    const timer = setTimeout(() => {
      onClose();
    }, 3800);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, type, onClose]);

  if (!isOpen) return null;

  const isCheckIn = type === 'check-in';

  const modalContent = (
    <div className="attendance-celebration-backdrop" onClick={onClose}>
      <div 
        className="attendance-celebration-card" 
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Glow Aura */}
        <div className={`celebration-glow-aura ${isCheckIn ? 'green' : 'blue'}`} />

        {/* Confetti Particles */}
        {particles.map((p) => (
          <div
            key={p.id}
            className="celebration-confetti-particle"
            style={{
              left: p.left,
              backgroundColor: p.backgroundColor,
              width: p.size,
              height: p.size,
              animationDelay: p.delay,
              animationDuration: p.duration,
            }}
          />
        ))}

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: 'none',
            backgroundColor: '#f1f5f9',
            color: '#64748b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            zIndex: 10,
            transition: 'all 0.15s ease',
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#e2e8f0'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
        >
          <X size={16} />
        </button>

        {/* Animated Celebration Icon with Pulsing Rings */}
        <div className="celebration-icon-wrapper">
          <div className={`celebration-pulse-ring ${isCheckIn ? 'green' : 'blue'}`} />
          <div className={`celebration-icon-circle ${isCheckIn ? 'green' : 'blue'}`}>
            {isCheckIn ? (
              <svg className="animated-checkmark-svg" viewBox="0 0 52 52">
                <circle className="animated-checkmark-circle" cx="26" cy="26" r="23" />
                <path className="animated-checkmark-check" d="M14 27l8 8 16-16" />
              </svg>
            ) : (
              <Sun size={38} className="animate-pulse-subtle" />
            )}
          </div>
        </div>

        {/* Title */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
          <Sparkles size={16} color={isCheckIn ? '#10b981' : '#3b82f6'} />
          <span
            style={{
              fontSize: '0.78rem',
              fontWeight: '800',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isCheckIn ? '#059669' : '#2563eb',
            }}
          >
            {isCheckIn ? 'Daily Attendance Confirmed' : 'Shift Recorded & Sealed'}
          </span>
          <Sparkles size={16} color={isCheckIn ? '#10b981' : '#3b82f6'} />
        </div>

        <h2
          style={{
            fontSize: '1.65rem',
            fontWeight: '900',
            color: '#0f172a',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          {isCheckIn ? 'Checked In Successfully!' : 'Checked Out Successfully!'}
        </h2>

        <p
          style={{
            fontSize: '0.92rem',
            color: '#64748b',
            margin: '0 0 22px',
            lineHeight: 1.5,
          }}
        >
          {isCheckIn
            ? 'Welcome to Arshith Connect! Wishing you a productive and impactful day.'
            : 'Outstanding effort today! Rest well and enjoy a wonderful evening.'}
        </p>

        {/* Quick Stats Badges Container */}
        <div
          style={{
            backgroundColor: isCheckIn ? '#f0fdf4' : '#eff6ff',
            border: isCheckIn ? '1px solid #bbf7d0' : '1px solid #bfdbfe',
            borderRadius: '16px',
            padding: '16px 18px',
            display: 'flex',
            justifyContent: 'space-around',
            alignItems: 'center',
            marginBottom: '24px',
            gap: '12px',
          }}
        >
          {/* Stat 1: Time */}
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {isCheckIn ? 'Check-In Time' : 'Check-Out Time'}
            </span>
            <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', marginTop: '3px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
              <Clock size={16} color={isCheckIn ? '#10b981' : '#3b82f6'} />
              <span>{data.time || (isCheckIn ? data.checkInTime : data.checkOutTime) || 'Recorded'}</span>
            </div>
          </div>

          <div style={{ width: '1px', height: '36px', backgroundColor: isCheckIn ? '#bbf7d0' : '#bfdbfe' }} />

          {/* Stat 2: Mode or Duration */}
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {isCheckIn ? 'Work Mode' : 'Shift Duration'}
            </span>
            <div style={{ fontSize: '1.15rem', fontWeight: '800', color: '#0f172a', marginTop: '3px' }}>
              {isCheckIn ? (
                <span
                  style={{
                    backgroundColor: data.workMode === 'WFH' ? '#ede9fe' : '#dcfce7',
                    color: data.workMode === 'WFH' ? '#6d28d9' : '#15803d',
                    padding: '3px 10px',
                    borderRadius: '20px',
                    fontSize: '0.85rem',
                    fontWeight: '800',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                  }}
                >
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'currentColor' }} />
                  {data.workMode || 'WFO'}
                </span>
              ) : (
                <span style={{ color: '#1e3a8a', fontWeight: '800' }}>
                  {data.duration || data.workingDuration || 'Full Shift'}
                </span>
              )}
            </div>
          </div>

          <div style={{ width: '1px', height: '36px', backgroundColor: isCheckIn ? '#bbf7d0' : '#bfdbfe' }} />

          {/* Stat 3: Status */}
          <div style={{ textAlign: 'center' }}>
            <span style={{ fontSize: '0.72rem', fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Status
            </span>
            <div style={{ fontSize: '0.92rem', fontWeight: '800', color: isCheckIn ? '#059669' : '#2563eb', marginTop: '3px' }}>
              {isCheckIn ? (data.status || 'Present') : 'Completed'}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          type="button"
          onClick={onClose}
          style={{
            width: '100%',
            height: '48px',
            backgroundColor: isCheckIn ? '#10b981' : '#2563eb',
            color: '#ffffff',
            borderRadius: '12px',
            border: 'none',
            fontSize: '0.95rem',
            fontWeight: '800',
            letterSpacing: '0.02em',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: isCheckIn
              ? '0 6px 18px rgba(16, 185, 129, 0.35)'
              : '0 6px 18px rgba(37, 99, 235, 0.35)',
            transition: 'all 0.15s ease',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'translateY(-1px)';
            e.currentTarget.style.backgroundColor = isCheckIn ? '#059669' : '#1d4ed8';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.backgroundColor = isCheckIn ? '#10b981' : '#2563eb';
          }}
        >
          <span>{isCheckIn ? "Got it, let's work!" : 'Done for today!'}</span>
          <ArrowRight size={16} />
        </button>

        {/* Countdown Progress Bar */}
        <div className={`celebration-timer-bar ${isCheckIn ? '' : 'blue'}`} />
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}

