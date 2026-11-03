import React, { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import EmployeeNavbar from '../components/employee/EmployeeNavbar';
import EmployeeSidebarDrawer from '../components/employee/EmployeeSidebarDrawer';
import '../styles/global.css';
import '../styles/employee.css';
import '../styles/responsive.css';

/**
 * EmployeeLayout - Dedicated Application Shell for Employee Portal
 *
 * Provides:
 * - Clean EmployeeNavbar at the top
 * - Slide-over EmployeeSidebarDrawer on left with dark backdrop
 * - Independent page content area
 * - Complete isolation from Admin layout
 */
export default function EmployeeLayout() {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const location = useLocation();

  // Auto-close drawer and reset scroll position to top on route transition
  useEffect(() => {
    setIsDrawerOpen(false);
    window.scrollTo(0, 0);
    if (document.documentElement) document.documentElement.scrollTop = 0;
    if (document.body) document.body.scrollTop = 0;
  }, [location.pathname, location.search, location.key]);

  return (
    <div className="employee-portal-wrapper">
      {/* Subtle organic ambient glow */}
      <div className="dashboard-bg-decoration" />

      {/* Slide-over Left Drawer with Dimming Overlay */}
      <EmployeeSidebarDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
      />

      {/* Main Employee Container */}
      <div className="employee-content-container">
        {/* Sticky Employee Header */}
        <EmployeeNavbar onOpenDrawer={() => setIsDrawerOpen(true)} />

        {/* Dynamic Page Content */}
        <main className="employee-main-content animate-fade-in" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
