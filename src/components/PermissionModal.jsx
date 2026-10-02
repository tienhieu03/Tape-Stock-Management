import React, { useState, useEffect } from 'react';
import { X, Shield, ShieldCheck, Loader, ToggleLeft, ToggleRight } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const MODULES = [
  {
    key: 'nvl',
    label: 'Nguyên Vật Liệu (NVL)',
    icon: '📦',
    permissions: [
      { slug: 'nvl.view', label: 'Xem danh sách' },
      { slug: 'nvl.create', label: 'Thêm mới' },
      { slug: 'nvl.edit', label: 'Chỉnh sửa' },
      { slug: 'nvl.delete', label: 'Xóa' },
      { slug: 'nvl.stock', label: 'Cập nhật Stock' },
      { slug: 'nvl.import', label: 'Nhập Excel' },
    ]
  },
  {
    key: 'po',
    label: 'Purchase Orders (PO)',
    icon: '🛒',
    permissions: [
      { slug: 'po.view', label: 'Xem danh sách' },
      { slug: 'po.edit', label: 'Tạo / Chỉnh sửa' },
      { slug: 'po.delete', label: 'Xóa' },
      { slug: 'po.receive', label: 'Nhận hàng' },
      { slug: 'po.buy', label: 'Mua hàng (Tạo PO nháp)' },
      { slug: 'po.vendor', label: 'Quản lý Vendor' },
      { slug: 'po.detail.add', label: 'Thêm hàng trong PO' },
      { slug: 'po.detail.delete', label: 'Xóa hàng trong PO' },
      { slug: 'po.delete_history', label: 'Xóa Lịch Sử PO' },
    ]
  },
  {
    key: 'tape',
    label: 'Quản lý Bonding ACF Tape - Flux - Solder',
    icon: '🎞️',
    permissions: [
      { slug: 'tape.view', label: 'Xem danh sách' },
      { slug: 'tape.create', label: 'Thêm mới' },
      { slug: 'tape.edit', label: 'Chỉnh sửa' },
      { slug: 'tape.delete', label: 'Xóa' },
      { slug: 'tape.history', label: 'Xem Lịch Sử' },
    ]
  },
  {
    key: 'expense',
    label: 'Quản lý Equipment Expense',
    icon: '📊',
    permissions: [
      { slug: 'expense.view', label: 'Xem danh sách' },
      { slug: 'expense.edit', label: 'Chỉnh sửa / Cập nhật' }
    ]
  },
  {
    key: 'rate',
    label: 'Tỷ giá ngoại tệ (USD/JPY)',
    icon: '💱',
    permissions: [
      { slug: 'rate.view', label: 'Xem tỷ giá' },
      { slug: 'rate.edit', label: 'Chỉnh sửa tỷ giá' },
      { slug: 'rate.delete', label: 'Xóa / Đặt lại tỷ giá' }
    ]
  }
];

export default function PermissionModal({ user, onClose, onUpdated }) {
  const toast = useToast();
  const [activePerms, setActivePerms] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchPermissions();
  }, [user.id]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [saving, onClose]);

  const fetchPermissions = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setActivePerms(new Set(data.permissions));
      }
    } catch (err) {
      toast.error('Lỗi khi tải quyền hạn.');
    }
    setLoading(false);
  };

  const togglePerm = (slug) => {
    setActivePerms(prev => {
      const next = new Set(prev);
      if (next.has(slug)) {
        next.delete(slug);
      } else {
        next.add(slug);
      }
      return next;
    });
  };

  const toggleModule = (moduleKey) => {
    const module = MODULES.find(m => m.key === moduleKey);
    if (!module) return;
    const slugs = module.permissions.map(p => p.slug);
    const allActive = slugs.every(s => activePerms.has(s));

    setActivePerms(prev => {
      const next = new Set(prev);
      if (allActive) {
        slugs.forEach(s => next.delete(s));
      } else {
        slugs.forEach(s => next.add(s));
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.id}/permissions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionStorage.getItem('token')}`
        },
        body: JSON.stringify({ permissions: [...activePerms] })
      });
      if (res.ok) {
        toast.success(`Đã cập nhật quyền hạn cho ${user.full_name}.`);
        if (onUpdated) onUpdated();
        onClose();
      } else {
        const data = await res.json();
        toast.error(data.message || 'Lỗi khi cập nhật quyền hạn.');
      }
    } catch (err) {
      toast.error('Lỗi kết nối server.');
    }
    setSaving(false);
  };

  const isAdminUser = user.primary_role?.role_name === 'admin';

  return (
    <div className="modal-overlay" onClick={() => !saving && onClose()}>
      <div className="modal-box permission-modal" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              background: 'linear-gradient(135deg, var(--color-accent), #ff7733)',
              padding: '8px',
              borderRadius: '10px',
              color: 'white',
              display: 'flex'
            }}>
              <Shield size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Phân quyền người dùng</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, fontWeight: 400 }}>
                {user.full_name} — <code style={{ fontSize: '12px' }}>{user.username}</code>
              </p>
            </div>
          </div>
          <button className="action-btn" onClick={onClose}><X size={20} /></button>
        </div>

        {/* Content */}
        <div className="modal-content" style={{ padding: '0 24px 24px' }}>
          {isAdminUser ? (
            <div className="perm-admin-notice">
              <ShieldCheck size={40} style={{ color: 'var(--color-accent)', marginBottom: '8px' }} />
              <h3>Quản trị viên (Admin)</h3>
              <p>Tài khoản Admin tự động có <strong>tất cả quyền</strong>. Không cần phân quyền.</p>
            </div>
          ) : loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0' }}>
              <Loader size={28} className="spin" style={{ color: 'var(--color-accent)' }} />
            </div>
          ) : (
            <div className="perm-modules">
              {MODULES.map(mod => {
                const slugs = mod.permissions.map(p => p.slug);
                const activeCount = slugs.filter(s => activePerms.has(s)).length;
                const allActive = activeCount === slugs.length;

                return (
                  <div className="perm-module-card" key={mod.key}>
                    <div className="perm-module-header">
                      <div className="perm-module-title">
                        <span className="perm-module-icon">{mod.icon}</span>
                        <span>{mod.label}</span>
                        <span className="perm-count-badge">
                          {activeCount}/{slugs.length}
                        </span>
                      </div>
                      <button
                        className={`perm-toggle-all ${allActive ? 'active' : ''}`}
                        onClick={() => toggleModule(mod.key)}
                        title={allActive ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                      >
                        {allActive ? <ToggleRight size={20} /> : <ToggleLeft size={20} />}
                        <span>{allActive ? 'Tất cả' : 'Chọn hết'}</span>
                      </button>
                    </div>
                    <div className="perm-list">
                      {mod.permissions.map(p => (
                        <label
                          key={p.slug}
                          className={`perm-item ${activePerms.has(p.slug) ? 'active' : ''}`}
                        >
                          <div className="perm-toggle-switch" onClick={() => togglePerm(p.slug)}>
                            <div className={`perm-switch-track ${activePerms.has(p.slug) ? 'on' : ''}`}>
                              <div className="perm-switch-thumb" />
                            </div>
                          </div>
                          <div className="perm-item-info">
                            <span className="perm-item-label">{p.label}</span>
                            <code className="perm-item-slug">{p.slug}</code>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {!isAdminUser && !loading && (
          <div className="perm-modal-footer">
            <button className="btn-secondary" onClick={onClose} disabled={saving}>Hủy</button>
            <button className="btn-primary" onClick={handleSave} disabled={saving}>
              {saving ? (
                <><Loader size={16} className="spin" style={{ marginRight: '8px' }} /> Đang lưu...</>
              ) : (
                <><ShieldCheck size={16} style={{ marginRight: '8px' }} /> Lưu quyền hạn</>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
