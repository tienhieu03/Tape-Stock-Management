import React, { useState, useEffect } from 'react';
import { Users, Plus, Trash2, Edit2, Save, X, AlertTriangle, Search } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermission } from '../context/PermissionContext';

const API_BASE = '/api/vendors';
const headers = () => ({
  'Authorization': `Bearer ${sessionStorage.getItem('token')}`,
  'Content-Type': 'application/json'
});

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Form State
  const [vendorName, setVendorName] = useState('');
  const [category, setCategory] = useState('');
  
  // Editing State
  const [editingId, setEditingId] = useState(null); // Will hold editing category name
  const [editingOldCategory, setEditingOldCategory] = useState(null);
  
  const toast = useToast();
  const { confirm } = useConfirm();
  const { hasPermission } = usePermission();

  useEffect(() => {
    if (hasPermission('po.vendor')) {
      fetchVendors();
    }
  }, [hasPermission]);

  useEffect(() => {
    // Group vendors by category
    const grouped = vendors.reduce((acc, v) => {
      const cat = v.nvl_category || 'Chưa phân loại';
      if (!acc[cat]) {
        acc[cat] = {
          category: cat,
          vendors: []
        };
      }
      acc[cat].vendors.push(v);
      return acc;
    }, {});

    let result = Object.values(grouped);

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(group =>
        group.category.toLowerCase().includes(s) ||
        group.vendors.some(v => (v.vendor_name || '').toLowerCase().includes(s))
      );
    }
    setFiltered(result);
  }, [search, vendors]);

  const fetchVendors = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_BASE, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setVendors(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      toast.error('Lỗi khi tải danh sách nhà cung cấp.');
    }
    setLoading(false);
  };

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!vendorName.trim()) return toast.error('Vui lòng nhập tên nhà cung cấp.');
    if (!category.trim()) return toast.error('Vui lòng chọn hoặc nhập khu vực sử dụng.');

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ vendor_name: vendorName.trim(), nvl_category: category.trim() })
      });
      if (res.ok) {
        toast.success('Đã thêm nhà cung cấp.');
        setVendorName('');
        setCategory('');
        fetchVendors();
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi khi thêm.');
      }
    } catch (e) {
      toast.error('Lỗi kết nối.');
    }
  };

  const handleStartEdit = (group) => {
    setEditingId(group.category);
    setEditingOldCategory(group.category);
    setCategory(group.category);
    setVendorName(group.vendors.map(v => v.vendor_name).join('\n'));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingOldCategory(null);
    setVendorName('');
    setCategory('');
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!vendorName.trim()) return toast.error('Tên nhà cung cấp không được để trống.');
    if (!category.trim()) return toast.error('Khu vực sử dụng không được để trống.');

    const newNames = vendorName.split(/[,\n]/).map(n => n.trim()).filter(Boolean);
    if (newNames.length === 0) return toast.error('Tên nhà cung cấp không hợp lệ.');

    try {
      const res = await fetch(`${API_BASE}/category/sync`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          old_category: editingOldCategory,
          nvl_category: category.trim(),
          vendor_names: newNames
        })
      });
      if (res.ok) {
        toast.success('Đã cập nhật nhà cung cấp.');
        setEditingId(null);
        setEditingOldCategory(null);
        setVendorName('');
        setCategory('');
        fetchVendors();
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi khi cập nhật.');
      }
    } catch (e) {
      toast.error('Lỗi kết nối.');
    }
  };

  const handleDelete = async (categoryName) => {
    confirm({
      title: 'Xóa toàn bộ nhà cung cấp trong khu vực',
      message: `Bạn có chắc chắn muốn xóa tất cả nhà cung cấp trong khu vực "${categoryName}"? Điều này có thể ảnh hưởng đến các PO và nguyên vật liệu liên quan.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/category/${encodeURIComponent(categoryName)}`, {
            method: 'DELETE',
            headers: headers()
          });
          if (res.ok) {
            toast.success('Đã xóa tất cả nhà cung cấp trong khu vực.');
            fetchVendors();
          } else {
            const err = await res.json();
            toast.error(err.message || 'Lỗi khi xóa.');
          }
        } catch (e) {
          toast.error('Lỗi kết nối.');
        }
      }
    });
  };

  // Derive unique categories for autocomplete datalist
  const existingCategories = [...new Set(vendors.map(v => v.nvl_category).filter(Boolean))];

  if (!hasPermission('po.vendor')) {
    return (
      <div className="empty-state-container">
        <AlertTriangle size={48} color="var(--color-warning)" />
        <h2>Truy cập bị từ chối</h2>
        <p>Bạn không có quyền xem trang này. Vui lòng liên hệ Admin.</p>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
          <Users size={24} color="var(--color-accent)" />
        </div>
        <h1 className="home-title" style={{ margin: 0 }}>Quản lý Nhà cung cấp (Vendors)</h1>
      </div>

      <div className="settings-content" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', alignItems: 'start' }}>
        
        {/* FORM CARD */}
        <div className="settings-card" style={{ height: 'fit-content' }}>
          <h3>{editingId ? 'Chỉnh sửa nhà cung cấp' : 'Thêm nhà cung cấp mới'}</h3>
          <form onSubmit={editingId ? handleUpdate : handleAdd} className="settings-form" style={{ marginTop: '16px' }}>
            
            <div className="input-group">
              <label>Khu vực sử dụng (nvl_category)</label>
              <input
                list="category-datalist"
                placeholder="Nhập hoặc chọn khu vực..."
                value={category}
                onChange={e => setCategory(e.target.value)}
                required
              />
              <datalist id="category-datalist">
                {existingCategories.map(cat => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>

            <div className="input-group">
              <label>
                {editingId 
                  ? 'Tên nhà cung cấp (Mỗi nhà cung cấp một dòng hoặc cách nhau bằng dấu phẩy)' 
                  : 'Tên các nhà cung cấp (Có thể nhập nhiều, cách nhau bằng dấu phẩy hoặc xuống dòng)'
                }
              </label>
              <textarea
                placeholder="Ví dụ: Công ty A, Công ty B hoặc nhập mỗi công ty một dòng..."
                value={vendorName}
                onChange={e => setVendorName(e.target.value)}
                required
                rows={5}
                style={{ width: '100%', resize: 'vertical', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', outline: 'none', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
              {editingId && (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ flex: 1, height: '42px' }}
                  onClick={handleCancelEdit}
                >
                  <X size={16} style={{ marginRight: '8px' }} /> Hủy
                </button>
              )}
              <button
                type="submit"
                className="btn-primary"
                style={{ flex: 2, height: '42px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
              >
                {editingId ? <Save size={16} /> : <Plus size={16} />}
                {editingId ? 'Cập nhật' : 'Thêm mới'}
              </button>
            </div>

          </form>
        </div>

        {/* TABLE CARD */}
        <div className="settings-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>Danh sách nhà cung cấp</h3>
            <div className="search-box" style={{ width: '250px', margin: 0 }}>
              <Search size={16} style={{ color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && <X size={16} onClick={() => setSearch('')} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} />}
            </div>
          </div>

          <div style={{ border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
            <table className="nvl-table" style={{ margin: 0 }}>
              <thead style={{ background: 'var(--bg-sidebar)' }}>
                <tr>
                  <th style={{ width: '60px', paddingLeft: '20px' }}>STT</th>
                  <th style={{ width: '180px' }}>Khu vực sử dụng</th>
                  <th>Tên nhà cung cấp</th>
                  <th style={{ width: '120px', textAlign: 'right', paddingRight: '20px' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody style={{ background: 'var(--bg-main)' }}>
                {loading ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      Đang tải...
                    </td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', padding: '30px', color: 'var(--text-secondary)' }}>
                      Chưa có nhà cung cấp nào.
                    </td>
                  </tr>
                ) : filtered.map((group, idx) => (
                  <tr key={group.category} className={editingId === group.category ? 'row-editing' : ''}>
                    <td style={{ paddingLeft: '20px', fontWeight: 500 }}>{idx + 1}</td>
                    <td>
                      <span className="badge" style={{ backgroundColor: 'rgba(245, 78, 0, 0.1)', color: 'var(--color-accent)', padding: '4px 8px', borderRadius: '6px', fontSize: '12px', fontWeight: 600 }}>
                        {group.category}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {group.vendors.map(v => (
                          <span key={v.id} className="badge" style={{ backgroundColor: 'rgba(38, 37, 30, 0.05)', color: 'var(--text-primary)', padding: '4px 8px', borderRadius: '6px', fontSize: '13px', border: '1px solid var(--border-color)', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                            {v.vendor_name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', paddingRight: '16px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="action-btn edit"
                          onClick={() => handleStartEdit(group)}
                          title="Sửa"
                          disabled={editingId === group.category}
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          className="action-btn delete"
                          onClick={() => handleDelete(group.category)}
                          title="Xóa"
                          disabled={editingId === group.category}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
