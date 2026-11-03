import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * ScrollToTop - Automatically scrolls the viewport window and document to the top
 * on every route transition or search query change.
 * Prevents pages from inheriting previous scroll positions.
 */
export default function ScrollToTop() {
  const { pathname, search } = useLocation();

  useEffect(() => {
    // Reset window scroll position instantly
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: 'instant',
    });

    // Reset document element and body scroll
    if (document.documentElement) {
      document.documentElement.scrollTop = 0;
    }
    if (document.body) {
      document.body.scrollTop = 0;
    }

    // Reset any scrollable main content containers
    const employeeWrapper = document.querySelector('.employee-portal-wrapper');
    if (employeeWrapper) employeeWrapper.scrollTop = 0;

    const employeeContent = document.querySelector('.employee-content-container');
    if (employeeContent) employeeContent.scrollTop = 0;

    const employeeMain = document.querySelector('.employee-main-content');
    if (employeeMain) employeeMain.scrollTop = 0;
  }, [pathname, search]);

  return null;
}
