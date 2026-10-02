import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import './index.css';

import Login from './pages/Login';
import DashboardLayout from './layouts/DashboardLayout';
import Home from './pages/Home';
import Settings from './pages/Settings';
import NVL from './pages/NVL';
import Tape from './pages/Tape';
import FollowPO from './pages/FollowPO';
import EquipmentExpense from './pages/EquipmentExpense';
import Vendors from './pages/Vendors';

import { ToastProvider } from './context/ToastContext';
import ToastContainer from './components/ToastContainer';
import { ConfirmProvider } from './context/ConfirmContext';
import ConfirmModal from './components/ConfirmModal';
import { PermissionProvider } from './context/PermissionContext';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedUser = sessionStorage.getItem('user') || localStorage.getItem('user');
    const savedToken = sessionStorage.getItem('token') || localStorage.getItem('token');
    
    if (savedUser && savedToken) {
      if (!sessionStorage.getItem('user')) {
        sessionStorage.setItem('user', savedUser);
      }
      if (!sessionStorage.getItem('token')) {
        sessionStorage.setItem('token', savedToken);
      }
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);

    const handleRefresh = () => {
      const updatedUser = sessionStorage.getItem('user') || localStorage.getItem('user');
      if (updatedUser) setUser(JSON.parse(updatedUser));
    };
    window.addEventListener('user-data-refreshed', handleRefresh);
    return () => window.removeEventListener('user-data-refreshed', handleRefresh);
  }, []);

  useEffect(() => {
    if (!user) return;

    // If "Keep me logged in" is active, bypass inactivity monitoring
    const isKeepLogin = localStorage.getItem('keepLogin') === 'true';
    if (isKeepLogin) return;

    let timeoutId;

    const logoutUser = () => {
      sessionStorage.removeItem('token');
      sessionStorage.removeItem('user');
      setUser(null);
    };

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(logoutUser, 15 * 60 * 1000); // 15 minutes
    };

    // Listen to user interaction events to reset timer
    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(event => {
      window.addEventListener(event, resetTimer);
    });

    // Initialize the timer
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach(event => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [user]);

  if (loading) return null;

  return (
    <ConfirmProvider>
      <ToastProvider>
        <PermissionProvider>
          <Router>
            <Routes>
              <Route 
                path="/" 
                element={user ? <DashboardLayout user={user} setUser={setUser} /> : <Navigate to="/login" />}
              >
                <Route index element={<Home />} />
                <Route path="settings" element={<Settings user={user} />} />
                <Route path="nvl" element={<NVL />} />
                <Route path="tape" element={<Tape />} />
                <Route path="follow-po" element={<FollowPO />} />
                <Route path="equipment-expense" element={<EquipmentExpense />} />
                <Route path="vendors" element={<Vendors />} />
              </Route>

              <Route path="/login" element={!user ? <Login setUser={setUser} /> : <Navigate to="/" />} />
              
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>
          </Router>
          <ToastContainer />
          <ConfirmModal />
        </PermissionProvider>
      </ToastProvider>
    </ConfirmProvider>
  );
}

export default App;
