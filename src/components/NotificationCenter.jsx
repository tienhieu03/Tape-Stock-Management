import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Check, BellOff, AlertTriangle, Info, Calendar, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { io } from 'socket.io-client';

const API_BASE = '/api/notifications';
const headers = () => ({ 
  'Authorization': `Bearer ${sessionStorage.getItem('token')}`,
  'Content-Type': 'application/json'
});

const TYPE_CONFIG = {
  red: {
    label: 'Nguy cấp',
    icon: <AlertTriangle size={16} />,
    className: 'noti-red',
    dot: '#e53e3e',
  },
  orange: {
    label: 'Cảnh báo',
    icon: <AlertCircle size={16} />,
    className: 'noti-orange',
    dot: '#dd6b20',
  },
  yellow: {
    label: 'Theo dõi',
    icon: <Info size={16} />,
    className: 'noti-yellow',
    dot: '#d69e2e',
  },
  expiry: {
    label: 'Hết hạn',
    icon: <Calendar size={16} />,
    className: 'noti-expiry',
    dot: '#805ad5',
  },
  info: {
    label: 'Thông tin',
    icon: <Info size={16} />,
    className: 'noti-info',
    dot: '#3182ce',
  },
};

export default function NotificationCenter() {
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const wrapperRef = useRef(null);
  const toast = useToast();

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(API_BASE, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();

    const socket = io(window.location.protocol + '//' + window.location.hostname + ':1908');

    // Listen for login-triggered alarm notifications
    socket.on('notification-update', (data) => {
      const userStr = sessionStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        // Only refresh if the update is for this user (or broadcast)
        if (!data.userId || data.userId === user.id) {
          fetchNotifications();
        }
      }
    });

    return () => socket.disconnect();
  }, [fetchNotifications]);

  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.is_read).length);
  }, [notifications]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const markAsRead = async (id, e) => {
    e?.stopPropagation();
    try {
      const res = await fetch(`${API_BASE}/${id}/read`, {
        method: 'PATCH',
        headers: headers()
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      }
    } catch (e) {
      toast.error('Lỗi khi cập nhật thông báo.');
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch(`${API_BASE}/read-all`, {
        method: 'PATCH',
        headers: headers()
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
        toast.success('Đã đọc tất cả thông báo.');
      }
    } catch (e) {
      toast.error('Lỗi khi cập nhật thông báo.');
    }
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleString('vi-VN', { 
      hour: '2-digit', minute: '2-digit', 
      day: '2-digit', month: '2-digit' 
    });
  };

  const getExpiryText = (expiresAt) => {
    if (!expiresAt) return null;
    const remaining = new Date(expiresAt) - new Date();
    if (remaining <= 0) return 'Đã hết hạn';
    const mins = Math.floor(remaining / 60000);
    if (mins <= 0) return 'Dưới 1 phút';
    return `Còn ${mins} phút`;
  };

  // Count by type for summary header
  const redCount = notifications.filter(n => n.type === 'red' && !n.is_read).length;
  const orangeCount = notifications.filter(n => n.type === 'orange' && !n.is_read).length;

  return (
    <div className="notification-center" ref={wrapperRef}>
      <div 
        className={`noti-bell-wrapper ${unreadCount > 0 ? 'has-notifications' : ''}`} 
        onClick={() => setIsOpen(!isOpen)}
        title={unreadCount > 0 ? `${unreadCount} thông báo chưa đọc` : 'Thông báo'}
      >
        <Bell size={22} className={unreadCount > 0 ? 'bell-ringing' : ''} />
        {unreadCount > 0 && (
          <span className={`noti-badge ${redCount > 0 ? 'badge-red' : orangeCount > 0 ? 'badge-orange' : ''}`}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </div>

      {isOpen && (
        <div className="noti-dropdown">
          <div className="noti-header">
            <div className="noti-header-left">
              <h3>Thông báo Alarm</h3>
              {notifications.length > 0 && (
                <span className="noti-count-label">{notifications.length} mục</span>
              )}
            </div>
            {unreadCount > 0 && (
              <button className="noti-clear-btn" onClick={markAllAsRead}>
                <Check size={14} />
                Đọc tất cả
              </button>
            )}
          </div>

          {/* Summary pills */}
          {unreadCount > 0 && (
            <div className="noti-summary">
              {redCount > 0 && <span className="noti-pill pill-red">🔴 {redCount} nguy cấp</span>}
              {orangeCount > 0 && <span className="noti-pill pill-orange">🟠 {orangeCount} cảnh báo</span>}
              {notifications.filter(n => n.type === 'expiry' && !n.is_read).length > 0 && (
                <span className="noti-pill pill-expiry">
                  📅 {notifications.filter(n => n.type === 'expiry' && !n.is_read).length} hết hạn
                </span>
              )}
            </div>
          )}

          <div className="noti-list">
            {notifications.length === 0 ? (
              <div className="noti-empty">
                <BellOff size={32} />
                <p>Không có cảnh báo nào</p>
                <small>Tất cả hàng hóa đang trong ngưỡng an toàn</small>
              </div>
            ) : (
              notifications.map(noti => {
                const config = TYPE_CONFIG[noti.type] || TYPE_CONFIG.info;
                const expiryText = getExpiryText(noti.expires_at);

                return (
                  <div 
                    key={noti.id} 
                    className={`noti-item ${noti.is_read ? 'read' : 'unread'} ${config.className}`}
                    onClick={() => !noti.is_read && markAsRead(noti.id)}
                  >
                    <div className="noti-icon-wrap" style={{ color: config.dot }}>
                      {config.icon}
                    </div>
                    <div className="noti-body">
                      <div className="noti-title">{noti.title}</div>
                      <div className="noti-message">{noti.message}</div>
                      <div className="noti-meta">
                        <span className="noti-time">{formatTime(noti.created_time)}</span>
                        {noti.reference_type && (
                          <span className={`noti-tag ${noti.reference_type === 'tape' ? 'tag-tape' : 'tag-nvl'}`}>
                            {noti.reference_type === 'tape' ? 'Keo' : 'NVL'}
                          </span>
                        )}
                        {expiryText && (
                          <span className="noti-expiry-countdown">{expiryText}</span>
                        )}
                      </div>
                    </div>
                    {!noti.is_read && (
                      <button 
                        className="noti-mark-btn" 
                        title="Đánh dấu đã đọc"
                        onClick={(e) => markAsRead(noti.id, e)}
                      >
                        <Check size={13} />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div className="noti-footer">
            <small>Thông báo tự xóa sau 30 phút kể từ lúc đăng nhập</small>
          </div>
        </div>
      )}
    </div>
  );
}
