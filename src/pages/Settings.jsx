import React, { useState, useEffect } from 'react';
import { UserPlus, Key, Users, RefreshCw, Edit2, Trash2, Check, X, Shield, Sliders } from 'lucide-react';
import { useConfirm } from '../context/ConfirmContext';
import { useToast } from '../context/ToastContext';
import PermissionModal from '../components/PermissionModal';

export default function Settings({ user }) {
  const [activeTab, setActiveTab] = useState('password');
  const { confirm } = useConfirm();
  const { success, error } = useToast();
  
  // Password Change State
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [passMsg, setPassMsg] = useState({ text: '', type: '' });

  // User Management State (Admin only)
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    username: '',
    password: '',
    full_name: '',
    role_name: 'user'
  });
  const [userMsg, setUserMsg] = useState({ text: '', type: '' });
  
  // Editing State
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    username: '',
    full_name: '',
    role_name: ''
  });

  // Permission Modal State
  const [permUser, setPermUser] = useState(null);

  useEffect(() => {
    if (user.role === 'admin' && activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab, user]);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (res.ok) setUsers(data);
    } catch (err) {
      console.error('Error fetching users:', err);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      return setPassMsg({ text: 'Mật khẩu xác nhận không khớp.', type: 'error' });
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });
      const data = await res.json();
      if (res.ok) {
        setPassMsg({ text: 'Đổi mật khẩu thành công.', type: 'success' });
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        setPassMsg({ text: data.message, type: 'error' });
      }
    } catch (err) {
      error('Lỗi kết nối server.');
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify(newUser)
      });
      const data = await res.json();
      if (res.ok) {
        setUserMsg({ text: 'Tạo tài khoản thành công.', type: 'success' });
        setNewUser({ username: '', password: '', full_name: '', role_name: 'user' });
        fetchUsers();
      } else {
        setUserMsg({ text: data.message, type: 'error' });
      }
    } catch (err) {
      setUserMsg({ text: 'Lỗi server.', type: 'error' });
    }
  };

  const handleResetPassword = async (userId, name) => {
    confirm({
      title: 'Xác nhận Reset Mật khẩu',
      message: `Bạn có chắc muốn reset mật khẩu của ${name} về mặc định (12345678)?`,
      type: 'warning',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/users/${userId}/reset-password`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
          });
          const data = await res.json();
          if (res.ok) {
            success(data.message);
          } else {
            error(data.message || 'Lỗi khi reset mật khẩu.');
          }
        } catch (err) {
          error('Lỗi kết nối server.');
        }
      }
    });
  };

  const startEdit = (u) => {
    setEditingId(u.id);
    setEditForm({
      username: u.username,
      full_name: u.full_name,
      role_name: u.primary_role?.role_name || 'user'
    });
  };

  const handleUpdateUser = async (uId) => {
    try {
      const res = await fetch(`/api/users/${uId}`, {
        method: 'PUT',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify(editForm)
      });
      const data = await res.json();
      if (res.ok) {
        setEditingId(null);
        fetchUsers();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Lỗi khi cập nhật người dùng.');
    }
  };

  const handleDeleteUser = async (uId, name) => {
    confirm({
      title: 'Xác nhận Xóa Người dùng',
      message: `Bạn có chắc muốn XÓA vĩnh viễn tài khoản của ${name}? Hành động này không thể hoàn tác.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/users/${uId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
          });
          const data = await res.json();
          if (res.ok) {
            success(`Đã xóa người dùng ${name}`);
            fetchUsers();
          } else {
            error(data.message || 'Lỗi khi xóa người dùng.');
          }
        } catch (err) {
          error('Lỗi kết nối server.');
        }
      }
    });
  };

  const handleRowClick = (u) => {
    // Don't open permission modal if currently editing
    if (editingId !== null) return;
    setPermUser(u);
  };

  return (
    <div className="settings-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
          <Sliders size={24} color="var(--color-accent)" />
        </div>
        <h1 className="home-title" style={{ margin: 0 }}>Cài đặt hệ thống</h1>
      </div>
      
      <div className="settings-tabs">
        <button 
          className={`tab-btn ${activeTab === 'password' ? 'active' : ''}`}
          onClick={() => setActiveTab('password')}
        >
          <Key size={18} /> Đổi mật khẩu
        </button>
        {user.role === 'admin' && (
          <button 
            className={`tab-btn ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            <Users size={18} /> Quản lý người dùng
          </button>
        )}
      </div>

      <div className="settings-content">
        {activeTab === 'password' && (
          <div className="settings-card">
            <h3>Thay đổi mật khẩu đăng nhập</h3>
            <form onSubmit={handleChangePassword} className="settings-form">
              {passMsg.text && (
                <div className={`form-msg ${passMsg.type}`}>{passMsg.text}</div>
              )}
              <div className="input-group">
                <label>Mật khẩu hiện tại</label>
                <input 
                  type="password" 
                  required 
                  value={passwordForm.currentPassword}
                  onChange={e => setPasswordForm({...passwordForm, currentPassword: e.target.value})}
                />
              </div>
              <div className="input-group">
                <label>Mật khẩu mới</label>
                <input 
                  type="password" 
                  required 
                  value={passwordForm.newPassword}
                  onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})}
                />
              </div>
              <div className="input-group">
                <label>Xác nhận mật khẩu mới</label>
                <input 
                  type="password" 
                  required 
                  value={passwordForm.confirmPassword}
                  onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})}
                />
              </div>
              <button type="submit" className="login-btn">Cập nhật mật khẩu</button>
            </form>
          </div>
        )}

        {activeTab === 'users' && user.role === 'admin' && (
          <div className="users-management">
            <div className="settings-card">
              <h3>Tạo tài khoản mới</h3>
              <form onSubmit={handleCreateUser} className="settings-form horizontal">
                <input 
                  type="text" placeholder="Tên đăng nhập" required
                  value={newUser.username} onChange={e => setNewUser({...newUser, username: e.target.value})}
                />
                <input 
                  type="password" placeholder="Mật khẩu" required
                  value={newUser.password} onChange={e => setNewUser({...newUser, password: e.target.value})}
                />
                <input 
                  type="text" placeholder="Họ và tên" required
                  value={newUser.full_name} onChange={e => setNewUser({...newUser, full_name: e.target.value})}
                />
                <select 
                  value={newUser.role_name} onChange={e => setNewUser({...newUser, role_name: e.target.value})}
                  className="settings-select"
                >
                  <option value="user">Người dùng (User)</option>
                  <option value="admin">Quản trị viên (Admin)</option>
                </select>
                <button type="submit" className="login-btn compact"><UserPlus size={18}/> Thêm</button>
              </form>
              {userMsg.text && <div className={`form-msg ${userMsg.type}`} style={{marginTop: '10px'}}>{userMsg.text}</div>}
            </div>

            <div className="settings-card" style={{marginTop: '24px'}}>
              <h3>Danh sách người dùng</h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '-4px 0 16px' }}>
                <Shield size={13} style={{ verticalAlign: '-2px', marginRight: '4px' }} />
                Click vào dòng người dùng để phân quyền chi tiết
              </p>
              <table className="user-table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Họ tên</th>
                    <th>Quyền</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr 
                      key={u.id} 
                      className={`user-row-clickable ${editingId === u.id ? 'editing' : ''}`}
                      onClick={() => handleRowClick(u)}
                    >
                      <td>
                        {editingId === u.id ? (
                          <input 
                            className="table-input"
                            value={editForm.username} 
                            onChange={e => setEditForm({...editForm, username: e.target.value})}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : u.username}
                      </td>
                      <td>
                        {editingId === u.id ? (
                          <input 
                            className="table-input"
                            value={editForm.full_name} 
                            onChange={e => setEditForm({...editForm, full_name: e.target.value})}
                            onClick={e => e.stopPropagation()}
                          />
                        ) : u.full_name}
                      </td>
                      <td>
                        {editingId === u.id ? (
                          <select 
                            className="table-select"
                            value={editForm.role_name} 
                            onChange={e => setEditForm({...editForm, role_name: e.target.value})}
                            onClick={e => e.stopPropagation()}
                          >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                          </select>
                        ) : (
                          <span className={`role-badge ${u.primary_role?.role_name || 'user'}`}>
                            {u.primary_role?.role_name || 'user'}
                          </span>
                        )}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div className="table-actions">
                          {editingId === u.id ? (
                            <>
                              <button className="action-btn save" onClick={() => handleUpdateUser(u.id)} title="Lưu"><Check size={16}/></button>
                              <button className="action-btn cancel" onClick={() => setEditingId(null)} title="Hủy"><X size={16}/></button>
                            </>
                          ) : (
                            <>
                              <button className="action-btn" onClick={() => setPermUser(u)} title="Phân quyền">
                                <Shield size={16} style={{ color: 'var(--color-accent)' }}/>
                              </button>
                              <button className="action-btn edit" onClick={() => startEdit(u)} title="Sửa"><Edit2 size={16}/></button>
                              <button className="action-btn-reset" title="Reset mật khẩu" onClick={() => handleResetPassword(u.id, u.full_name)}>
                                <RefreshCw size={14} />
                              </button>
                              <button className="action-btn delete" onClick={() => handleDeleteUser(u.id, u.full_name)} title="Xóa"><Trash2 size={16}/></button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Permission Modal */}
      {permUser && (
        <PermissionModal 
          user={permUser} 
          onClose={() => setPermUser(null)}
          onUpdated={fetchUsers}
        />
      )}
    </div>
  );
}
