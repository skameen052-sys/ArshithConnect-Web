import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, MessageSquare } from 'lucide-react';
import BrandLogo from '../common/BrandLogo';
import { chatService } from '../../services/chatService';

export default function AdminNavbar({ onToggleSidebar }) {
  const navigate = useNavigate();
  const [unreadCount, setUnreadCount] = useState(0);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('arshith_role');
    localStorage.removeItem('arshith_user');
    navigate('/admin/login');
  }, [navigate]);

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
  const adminName = storedUser?.name || 'Administrator';
  const adminEmail = storedUser?.email || 'admin@arshith.com';

  return (
    <header className="portal-navbar">
      <div className="portal-nav-left">
        <button
          type="button"
          className="nav-hamburger-btn"
          onClick={onToggleSidebar}
          aria-label="Toggle admin navigation menu"
          title="Toggle Navigation Menu"
        >
          <span className="hamburger-line" />
          <span className="hamburger-line" />
          <span className="hamburger-line" />
        </button>
      </div>

      <div
        style={{ cursor: 'pointer' }}
        onClick={() => navigate('/admin/dashboard')}
        title="Arshith Connect Admin Portal"
      >
        <BrandLogo size="medium" />
      </div>

      <div className="portal-nav-right">
        {/* Teams Chat Icon Button with Floating Unread Badge */}
        <button
          type="button"
          onClick={() => navigate('/admin/chat')}
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

        <div className="user-profile-badge" title={`${adminName} (${adminEmail})`}>
          <div className="user-avatar" style={{ backgroundColor: '#0b3d2b' }}>
            {adminName.charAt(0).toUpperCase()}
          </div>
          <div className="user-info-text">
            <div className="user-name">{adminName}</div>
            <div className="user-role">Admin</div>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          style={{
            padding: '7px 11px',
            borderRadius: '8px',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            fontSize: '0.8rem',
            fontWeight: '600',
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.15s ease'
          }}
          title="Sign out of Administrator session"
        >
          <LogOut size={14} />
          <span className="navbar-logout-text">Logout</span>
        </button>
      </div>
    </header>
  );
}
