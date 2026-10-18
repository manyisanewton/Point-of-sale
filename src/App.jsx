import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { AuthProvider } from './AuthContext.jsx';
import ProtectedRoute from './ProtectedRoute.jsx';
import LoginPage from './LoginPage.jsx';
import POSLayout from './POSLayout.jsx';
import AdminDashboard from './AdminDashboard.jsx';
import ReceiptPage from './ReceiptPage.jsx';
import NotFound from './NotFound.jsx';
import OrdersPage from './OrdersPage.jsx';
import CustomersPage from './CustomersPage.jsx';
import PaymentsPage from './PaymentsPage.jsx';
import ReportsPage from './ReportsPage.jsx';
import ExpensesPage from './ExpensesPage.jsx';
import SettingsPage from './SettingsPage.jsx';
import OfflinePOSPage from './OfflinePOSPage.jsx';
import POSSalePage from './POSSalePage.jsx';
import './styles.css';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}


// Page wrappers (inline for POS-specific pages)
function AdminPageWrapper() {
  return (
    <>
      <Helmet>
        <title>Admin Dashboard | Open Doors Laundromat</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="Admin dashboard for managing Open Doors Laundromat." />
      </Helmet>
      <AdminDashboard />
    </>
  );
}

function ReceiptPageWrapper() {
  return (
    <>
      <Helmet>
        <title>Receipt | Open Doors Laundromat</title>
        <meta name="robots" content="noindex, nofollow" />
        <meta name="description" content="Your Open Doors Laundromat service request receipt." />
      </Helmet>
      <ReceiptPage />
    </>
  );
}

// Main App with AuthProvider and proper routing
export default function App() {
  useEffect(() => {
    const handleUnauthorized = () => {};
    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('auth:unauthorized', handleUnauthorized);
  }, []);

  return (
    <AuthProvider>
      <ScrollToTop />
      <Routes>
        {/* Public marketing pages are removed; the login is the public entry point. */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/services" element={<Navigate to="/login" replace />} />
        <Route path="/process" element={<Navigate to="/login" replace />} />
        <Route path="/pricing" element={<Navigate to="/login" replace />} />
        <Route path="/about" element={<Navigate to="/login" replace />} />
        <Route path="/contact" element={<Navigate to="/login" replace />} />
        <Route path="/booking" element={<Navigate to="/login" replace />} />
        <Route path="/faq" element={<Navigate to="/login" replace />} />

        {/* Login route (public) */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected POS routes */}
        <Route path="/admin" element={
          <ProtectedRoute>
            <POSLayout><AdminPageWrapper /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/admin/*" element={
          <ProtectedRoute>
            <POSLayout><AdminPageWrapper /></POSLayout>
          </ProtectedRoute>
        } />

        {/* Protected POS routes */}
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <POSLayout><AdminPageWrapper /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/orders" element={
          <ProtectedRoute>
            <POSLayout><OrdersPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/new-order" element={
          <ProtectedRoute>
            <POSLayout><POSSalePage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/customers" element={
          <ProtectedRoute>
            <POSLayout><CustomersPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/payments" element={
          <ProtectedRoute>
            <POSLayout><PaymentsPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/reports" element={
          <ProtectedRoute>
            <POSLayout><ReportsPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/expenses" element={
          <ProtectedRoute>
            <POSLayout><ExpensesPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/settings" element={
          <ProtectedRoute>
            <POSLayout><SettingsPage /></POSLayout>
          </ProtectedRoute>
        } />
        <Route path="/offline-pos" element={
          <ProtectedRoute>
            <POSLayout><OfflinePOSPage /></POSLayout>
          </ProtectedRoute>
        } />

        {/* Receipt (public) */}
        <Route path="/receipt/:token" element={<ReceiptPageWrapper />} />

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AuthProvider>
  );
}
