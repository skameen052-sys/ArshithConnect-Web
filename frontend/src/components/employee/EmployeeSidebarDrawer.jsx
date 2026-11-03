import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  User,
  Bell,
  Calendar,
  Briefcase,
  FileText,
  Clock,
  Home,
  X,
  FileClock,
  Receipt,
  Coins,
  UserMinus,
  Award,
  MessageSquare,
} from 'lucide-react';
import BrandLogo from '../common/BrandLogo';
import { chatService } from '../../services/chatService';

/**
 * EmployeeSidebarDrawer - Left-side slide-over navigation drawer
 * Exactly matches the reference mobile design in Screenshot 3.
 */
export default function EmployeeSidebarDrawer({ isOpen, onClose }) {
  const navigate = useNavigate();
  const location = useLocation();

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock document scroll while drawer is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('arshith_user')) || null;
    } catch {
      return null;
    }
  })();
  const employeeName = storedUser?.name || 'Employee';
  const employeeId = storedUser?.employeeId || 'AFI-001';
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchUnread = async () => {
      try {
        const count = await chatService.getUnreadCount();
        if (isMounted) setUnreadCount(count);
      } catch {}
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 8000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const handleNavigate = (path) => {
    navigate(path);
    onClose();
  };

  // Canonical employee nav items with HRMS self-service extensions
  const navItems = [
    { label: 'Dashboard', path: '/employee/dashboard', icon: Home },
    { label: 'Attendance', path: '/employee/attendance', icon: Clock },
    { label: 'Teams Chat', path: '/employee/chat', icon: MessageSquare, isChat: true },
    { label: 'Leave Management', path: '/employee/leaves', icon: FileText },
    { label: 'My Payslips', path: '/employee/payslips', icon: Receipt },
    { label: 'My Loans & Advances', path: '/employee/loans', icon: Coins },
    { label: 'My Performance', path: '/employee/performance', icon: Award },
    { label: 'Resignation & Settlement', path: '/employee/resignation', icon: UserMinus },
    { label: 'Work Assignments', path: '/employee/assignments', icon: Briefcase },
    { label: 'Work Update', path: '/employee/updates', icon: FileClock },
    { label: 'Meetings', path: '/employee/meetings', icon: Calendar },
    { label: 'Announcements', path: '/employee/announcements', icon: Bell },
    { label: 'Profile', path: '/employee/profile', icon: User },
  ];

  return (
    <>
      {/* Semi-transparent dark overlay */}
      <div
        className={`employee-drawer-overlay ${isOpen ? 'open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-out Left Drawer */}
      <aside
        className={`employee-nav-drawer ${isOpen ? 'open' : ''}`}
        aria-label="Employee Navigation Menu"
        role="dialog"
        aria-modal="true"
      >
        {/* Drawer Header matching Screenshot 3: Mint green background, centered Logo, "Employee Portal" */}
        <div className="employee-drawer-header">
          <button
            type="button"
            className="employee-drawer-close-btn"
            onClick={onClose}
            aria-label="Close navigation drawer"
            title="Close menu"
          >
            <X size={18} />
          </button>

          <div
            className="employee-drawer-logo-wrap"
            onClick={() => handleNavigate('/employee/dashboard')}
            title="Arshith Connect - Home"
          >
            <BrandLogo size="medium" />
          </div>
          <div className="employee-drawer-portal-title">Employee Portal</div>
        </div>

        {/* Profile Card */}
        <div className="employee-drawer-profile-card">
          <div className="drawer-user-avatar">
            {employeeName.charAt(0).toUpperCase()}
          </div>
          <div className="drawer-user-meta">
            <div className="drawer-user-name">{employeeName}</div>
            <div className="drawer-user-id">{employeeId} &bull; Staff Member</div>
          </div>
        </div>

        {/* Navigation Item Links matching Screenshot 3 */}
        <nav className="employee-drawer-nav" aria-label="Employee Menu">
          {navItems.map((item, idx) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;

            return (
              <button
                key={idx}
                type="button"
                className={`employee-drawer-nav-item ${isActive ? 'active' : ''}`}
                onClick={() => handleNavigate(item.path)}
                aria-current={isActive ? 'page' : undefined}
                style={{ display: 'flex', alignItems: 'center', width: '100%' }}
              >
                <span className="drawer-item-icon">
                  <Icon size={20} />
                </span>
                <span className="drawer-item-label">{item.label}</span>
                {item.isChat && unreadCount > 0 && (
                  <span
                    style={{
                      marginLeft: 'auto',
                      backgroundColor: '#F04491',
                      color: '#ffffff',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: '10px',
                    }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
