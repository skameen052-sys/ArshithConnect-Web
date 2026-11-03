import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import AdminNavbar from '../components/admin/AdminNavbar';
import AdminSidebar from '../components/AdminSidebar';
import '../styles/global.css';
import '../styles/admin.css';
import '../styles/responsive.css';

/**
 * AdminLayout - Master Administrator Application Shell
 *
 * Implements a strict two-column viewport layout:
 * - Left: Fixed 270px sidebar with pinned branded header and independently scrollable nav.
 * - Right: Independent scroll container with sticky top header and scrollable dashboard body.
 *
 * Ensures scrolling the sidebar never moves the dashboard, and vice versa.
 */
export default function AdminLayout() {
  const location = useLocation();
  const mainAreaRef = useRef(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Close drawer and reset main area scroll on route change
  useEffect(() => {
    setIsDrawerOpen(false);
    if (mainAreaRef.current) {
      mainAreaRef.current.scrollTop = 0;
    }
  }, [location.pathname]);

  // Close drawer on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isDrawerOpen) {
        setIsDrawerOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDrawerOpen]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (isDrawerOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isDrawerOpen]);

  const toggleSidebar = useCallback(() => {
    setIsDrawerOpen((prev) => !prev);
  }, []);

  const isMainPage = location.pathname === '/admin' || location.pathname === '/admin/dashboard';

  return (
    <div className={`admin-portal-wrapper admin-layout ${isMainPage ? 'admin-main-page-active' : ''}`}>
      {/* Mobile / Desktop Drawer Backdrop Overlay */}
      {isDrawerOpen && (
        <div
          className="admin-nav-backdrop"
          onClick={() => setIsDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Single Unified Slide-Out Navigation Drawer */}
      <aside
        className={`admin-nav-drawer admin-mobile-drawer ${isDrawerOpen ? 'open' : ''}`}
        aria-label="Administrator Navigation Drawer"
        role="dialog"
        aria-modal={isDrawerOpen}
      >
        <AdminSidebar onClose={() => setIsDrawerOpen(false)} />
      </aside>

      {/* Main Content Area: Independently Scrollable Container */}
      <div
        ref={mainAreaRef}
        className={`admin-main-area admin-main ${isMainPage ? 'admin-main-page-wrapper' : ''}`}
        id="admin-main-scroll-container"
      >
        {/* Dedicated Admin Portal Main Page Background Layer */}
        {isMainPage ? (
          <div className="admin-main-page-bg" aria-hidden="true" />
        ) : (
          <div className="dashboard-bg-decoration" />
        )}

        {/* Sticky Header within Main Area */}
        <div className="admin-header-wrapper admin-header">
          <div className="admin-header-container">
            <AdminNavbar onToggleSidebar={toggleSidebar} />
          </div>
        </div>

        {/* Independently Scrollable Content Container */}
        <div className="dashboard-container admin-content">
          <main className="admin-page-content animate-fade-in" key={location.pathname}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
