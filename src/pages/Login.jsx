import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, User, Eye, Sparkles } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermission } from '../context/PermissionContext';

export default function Login({ setUser }) {
  const toast = useToast();
  const { reloadPermissions } = usePermission();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('123456');
  const [keepLogin, setKeepLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const doLogin = async (uname, pwd) => {
    setLoading(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: pwd })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        if (keepLogin) {
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
          localStorage.setItem('keepLogin', 'true');
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('keepLogin');
        }
        sessionStorage.setItem('token', data.token);
        sessionStorage.setItem('user', JSON.stringify(data.user));
        
        setUser(data.user);
        reloadPermissions();
        toast.success(`Chào mừng trở lại, ${data.user.full_name}!`);
        navigate('/');
      } else {
        toast.error(data.message || 'Đăng nhập thất bại.');
      }
    } catch (err) {
      toast.error('Không thể kết nối đến máy chủ.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    doLogin(username, password);
  };

  const handleQuickLogin = (uname) => {
    setUsername(uname);
    setPassword('123456');
    doLogin(uname, '123456');
  };

  return (
    <div className="login-container">
      <div className="login-card" style={{ maxWidth: '440px' }}>
        <div style={{ textAlign: 'center', marginBottom: '8px' }}>
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(245, 78, 0, 0.1)',
            color: 'var(--color-accent)',
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.5px'
          }}>
            <Sparkles size={13} /> Interactive Portfolio Demo
          </span>
        </div>

        <h1 className="login-title">Material Control</h1>
        <p className="login-subtitle">Hệ thống Quản lý Nguyên Vật Liệu & Đơn Mua Hàng QA Lab</p>

        {/* Quick Demo Login Cards for Recruiters */}
        <div style={{
          background: 'var(--bg-sidebar)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          padding: '12px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px'
        }}>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.5px' }}>
            ⚡ Đăng nhập nhanh 1-Click để test CV
          </div>

          <button
            type="button"
            onClick={() => handleQuickLogin('admin')}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(245, 78, 0, 0.2)',
              background: 'white',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldCheck size={16} color="var(--color-accent)" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Admin (Toàn quyền)</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>CRUD NVL, Keo, Duyệt PO, Phân quyền RBAC</div>
              </div>
            </div>
            <span style={{ fontSize: '11px', color: 'var(--color-accent)', fontWeight: 600 }}>Chọn &rarr;</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLogin('user_lab')}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'white',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={16} color="#3182ce" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Kỹ thuật viên (User Lab)</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Cập nhật Stock, Tạo PO nháp, Nhận hàng</div>
              </div>
            </div>
            <span style={{ fontSize: '11px', color: '#3182ce', fontWeight: 600 }}>Chọn &rarr;</span>
          </button>

          <button
            type="button"
            onClick={() => handleQuickLogin('guest')}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              background: 'white',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s ease'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Eye size={16} color="#718096" />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Khách xem (Chỉ Xem)</div>
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Xem danh mục & tỷ giá, không được sửa/xóa</div>
              </div>
            </div>
            <span style={{ fontSize: '11px', color: '#718096', fontWeight: 600 }}>Chọn &rarr;</span>
          </button>
        </div>
        
        <form onSubmit={handleLogin} className="login-form">
          <div className="input-group">
            <label htmlFor="username">Tài khoản</label>
            <input 
              type="text" 
              id="username" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Nhập tên đăng nhập"
              autoComplete="username"
              required 
            />
          </div>
          
          <div className="input-group">
            <label htmlFor="password">Mật khẩu</label>
            <input 
              type="password" 
              id="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required 
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px', cursor: 'pointer', userSelect: 'none' }}>
            <input 
              type="checkbox" 
              id="keepLogin" 
              checked={keepLogin} 
              onChange={(e) => setKeepLogin(e.target.checked)} 
              style={{ cursor: 'pointer' }}
            />
            <label htmlFor="keepLogin" style={{ cursor: 'pointer', fontSize: '14px', margin: 0, color: 'var(--text-secondary)' }}>
              Duy trì đăng nhập
            </label>
          </div>
          
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Đang xử lý...' : 'Đăng nhập thủ công'}
          </button>
        </form>
      </div>
    </div>
  );
}
