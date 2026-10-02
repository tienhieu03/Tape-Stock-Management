import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { io } from 'socket.io-client';

const PermissionContext = createContext();

export function PermissionProvider({ children }) {
  const [permissions, setPermissions] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);

  const loadPermissions = useCallback(() => {
    const userStr = sessionStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setIsAdmin(user.role === 'admin');
        setPermissions(user.permissions || []);
      } catch (e) {
        setPermissions([]);
        setIsAdmin(false);
      }
    } else {
      setPermissions([]);
      setIsAdmin(false);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const token = sessionStorage.getItem('token');
    if (!token) return;
    
    try {
      const res = await fetch('/api/auth/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        sessionStorage.setItem('user', JSON.stringify(data));
        if (localStorage.getItem('keepLogin') === 'true') {
          localStorage.setItem('user', JSON.stringify(data));
        }
        loadPermissions();
        // Trigger a custom event to notify other parts of the app if needed
        window.dispatchEvent(new Event('user-data-refreshed'));
      }
    } catch (e) {
      console.error("Failed to refresh profile:", e);
    }
  }, [loadPermissions]);

  useEffect(() => {
    loadPermissions();

    const socket = io(window.location.protocol + "//" + window.location.hostname + ":1908");
    
    socket.on('user-update', (data) => {
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.id === data.userId) {
          console.log('[🛡️] Permissions/Role updated. Refreshing...');
          refreshProfile();
        }
      }
    });

    // Listen for storage changes (e.g. login/logout)
    const handleStorage = () => loadPermissions();
    window.addEventListener('storage', handleStorage);
    
    return () => {
      socket.disconnect();
      window.removeEventListener('storage', handleStorage);
    };
  }, [loadPermissions, refreshProfile]);

  const hasPermission = useCallback((slug) => {
    if (isAdmin) return true;
    return permissions.includes(slug);
  }, [isAdmin, permissions]);

  return (
    <PermissionContext.Provider value={{ permissions, isAdmin, hasPermission, reloadPermissions: loadPermissions }}>
      {children}
    </PermissionContext.Provider>
  );
}

export function usePermission() {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermission must be used within a PermissionProvider');
  }
  return context;
}
