import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, MessageSquare } from 'lucide-react';
import BrandLogo from '../common/BrandLogo';
import { chatService } from '../../services/chatService';

/**
 * EmployeeNavbar - Top application header for the Employee Portal
 * Matches the reference design in Screenshot 4.
 */
export default function EmployeeNavbar({ onOpenDrawer }) {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = () => {
    localStorage.removeItem('arshith_role');
    localStorage.removeItem('arshith_user');
    localStorage.removeItem('arshith_auth_token');
    navigate('/login', { replace: true });
  };

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

  const storedUser = (() => {
    try {
      return JSON.parse(localStorage.getItem('arshith_user')) || null;
    } catch {
      return null;
    }
  })();
  const employeeName = storedUser?.name || 'Employee';
  const employeeId = storedUser?.employeeId || 'AFI-001';

  return (
    <header className="employee-top-navbar portal-navbar">
      {/* Left: Stepped Mint Hamburger Toggle Button matching Screenshot 4 */}
      <div className="portal-nav-left">
        <button
          type="button"
          className="employee-hamburger-btn"
          onClick={onOpenDrawer}
          aria-label="Open employee navigation menu"
          title="Open Menu"
        >
          <span className="employee-hamburger-line line-1" />
          <span className="employee-hamburger-line line-2" />
          <span className="employee-hamburger-line line-3" />
        </button>
      </div>

      {/* Center: ARSHITH Connect Logo matching Screenshot 4 */}
      <div
        className="employee-navbar-logo"
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/employee/dashboard')}
        title="Arshith Connect Employee Portal"
      >
        <BrandLogo size="medium" />
      </div>

      {/* Right: Chat, User Avatar & Logout Button matching Screenshot 4 */}
      <div className="portal-nav-right">
        {/* Teams Chat Icon Button with Floating Unread Badge */}
        <button
          type="button"
          onClick={() => navigate('/employee/chat')}
          className="navbar-team-chat-btn"
          title={`Teams Chat${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
          aria-label="Teams Chat"
        >
          <MessageSquare size={18} />
          {unreadCount > 0 && (
            <span className="navbar-chat-badge">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        <div
          className="user-profile-badge"
          onClick={() => navigate('/employee/profile')}
          style={{ cursor: 'pointer' }}
          title={`${employeeName} (${employeeId}) - View Profile`}
        >
          <div className="user-avatar" style={{ backgroundColor: '#0b3d2b', overflow: 'hidden' }}>
            {(storedUser?.profile_photo || storedUser?.profilePhoto) ? (
              <img
                src={storedUser.profile_photo || storedUser.profilePhoto}
                alt={employeeName}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              employeeName.charAt(0).toUpperCase()
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="employee-logout-btn"
          title="Sign out of employee session"
          aria-label="Log Out"
        >
          <LogOut size={16} />
        </button>
      </div>
    </header>
  );
}
