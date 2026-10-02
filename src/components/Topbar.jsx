import { useState, useEffect } from 'react';
import { Settings as SettingsIcon, LogOut, UserCircle, Sun, Moon, RotateCcw, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import NotificationCenter from './NotificationCenter';
import ExchangeRateWidget from './ExchangeRateWidget';
import { resetDemoData } from '../services/mockServer';
import { useToast } from '../context/ToastContext';

export default function Topbar({ user, setUser }) {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const navigate = useNavigate();
  const toast = useToast();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
    setIsOpen(false);
  };

  const handleResetData = () => {
    if (window.confirm('Khôi phục toàn bộ dữ liệu mẫu ban đầu (NVL, Keo, PO, Kế hoạch chi phí, Nhà cung cấp)?')) {
      resetDemoData();
      toast.success('Đã khôi phục dữ liệu demo ban đầu thành công!');
      setIsOpen(false);
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('keepLogin');
    setUser(null);
    setIsOpen(false);
    navigate('/login');
  };

  return (
    <div className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '5px',
          background: 'rgba(245, 78, 0, 0.1)',
          color: 'var(--color-accent)',
          border: '1px solid rgba(245, 78, 0, 0.25)',
          padding: '3px 10px',
          borderRadius: '16px',
          fontSize: '11px',
          fontWeight: 600,
          letterSpacing: '0.4px',
          textTransform: 'uppercase'
        }}>
          <Sparkles size={12} /> Portfolio Demo
        </span>
      </div>

      <div style={{ flex: 1 }}></div>
      <ExchangeRateWidget />
      <NotificationCenter />

      <button
        type="button"
        onClick={handleResetData}
        title="Khôi phục lại dữ liệu mẫu gốc"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          color: 'var(--text-secondary)',
          borderRadius: '8px',
          padding: '6px 10px',
          fontSize: '12px',
          fontWeight: 500,
          cursor: 'pointer'
        }}
      >
        <RotateCcw size={13} />
        <span>Reset Data</span>
      </button>

      <div className="user-profile" onClick={() => setIsOpen(!isOpen)}>
        <UserCircle size={24} />
        <span style={{ fontWeight: 500, fontSize: '15px' }}>{user?.full_name || 'Người dùng'}</span>
      </div>

      {isOpen && (
        <div className="user-dropdown">
          <div className="dropdown-item" onClick={toggleTheme}>
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
            <span>Đổi giao diện ({theme === 'light' ? 'Tối' : 'Sáng'})</span>
          </div>
          <div className="dropdown-item" onClick={handleResetData}>
            <RotateCcw size={18} />
            <span>Khôi phục dữ liệu mẫu</span>
          </div>
          <div className="dropdown-item" onClick={() => { navigate('/settings'); setIsOpen(false); }}>
            <SettingsIcon size={18} />
            <span>Cài đặt & Phân quyền</span>
          </div>
          <div className="dropdown-item text-error" onClick={handleLogout}>
            <LogOut size={18} />
            <span>Đăng xuất</span>
          </div>
        </div>
      )}
    </div>
  );
}
