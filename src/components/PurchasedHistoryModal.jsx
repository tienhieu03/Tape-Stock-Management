import React, { useState, useEffect } from 'react';
import { X, Search, Trash2 } from 'lucide-react';
import ColumnFilter from './ColumnFilter';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermission } from '../context/PermissionContext';

const API_BASE = '/api/po/list?received=true';
const headers = () => ({ 'Authorization': `Bearer ${sessionStorage.getItem('token')}` });

export default function PurchasedHistoryModal({ onClose }) {
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const toast = useToast();
  const { confirm } = useConfirm();
  const { hasPermission } = usePermission();

  useEffect(() => {
    fetchHistory();
  }, []);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const fetchHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_BASE, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    let result = items;
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(i =>
        (i.po_number || '').toLowerCase().includes(s) ||
        (i.nvl_name || '').toLowerCase().includes(s) ||
        (i.vendor_name || '').toLowerCase().includes(s)
      );
    }
    Object.keys(filters).forEach(key => {
      const allowedSet = filters[key];
      if (allowedSet && allowedSet.size > 0) {
        result = result.filter(item => allowedSet.has(item[key]));
      }
    });
    setFiltered(result);
  }, [search, items, filters]);

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    const selectedPoIds = Array.from(new Set(items.filter(i => selected.has(i.id)).map(i => i.po_id)));
    confirm({
      title: 'Xóa Lịch Sử PO',
      message: `Bạn có chắc chắn muốn xóa ${selectedPoIds.length} đơn hàng đã nhận? Hành động này không thể hoàn tác.`,
      type: 'danger',
      verificationText: 'delete',
      onConfirm: async () => {
        try {
          for (const id of selectedPoIds) {
            await fetch(`/api/po/${id}`, { method: 'DELETE', headers: headers() });
          }
          toast.success(`Đã xóa các lịch sử PO.`);
          setSelected(new Set());
          fetchHistory();
        } catch {
          toast.error('Lỗi khi xóa.');
        }
      }
    });
  };

  const toggleSelect = (id, e) => {
    e.stopPropagation();
    setSelected(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map(i => i.id)));
  };

  const formatPrice = (p) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(p || 0);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: '1200px', width: '95%', height: '90vh' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Lịch sử hàng đã nhận (Purchased History)</h2>
          <button className="action-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="modal-content" style={{ padding: '20px', display: 'flex', flexDirection: 'column' }}>
          <div className="nvl-toolbar" style={{ marginBottom: '16px', flexShrink: 0 }}>
            <div className="search-box">
              <Search size={16} style={{ color: 'var(--text-secondary)' }} />
              <input
                type="text"
                placeholder="Tìm mã PO, NVL, Nhà cung cấp..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              {selected.size > 0 && hasPermission('po.delete_history') && (
                <button className="btn-primary" style={{ backgroundColor: 'var(--color-error)', display: 'inline-flex', alignItems: 'center' }} onClick={handleBulkDelete}>
                  <Trash2 size={16} style={{ marginRight: '8px' }}/> Xóa ({selected.size})
                </button>
              )}
              <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{filtered.length} kết quả</span>
            </div>
          </div>

          <div className="nvl-table-wrap" style={{ flex: 1, maxHeight: 'none' }}>
            <table className="nvl-table">
              <thead style={{ background: 'var(--bg-sidebar)', position: 'sticky', top: 0, zIndex: 10 }}>
                <tr>
                  <th style={{ width: '40px' }}>
                    <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                  </th>
                  <th style={{ width: '12%' }}><ColumnFilter columnKey="po_number" items={items} filters={filters} setFilters={setFilters}>Mã PO</ColumnFilter></th>
                  <th style={{ width: '15%' }}><ColumnFilter columnKey="nvl_name" items={items} filters={filters} setFilters={setFilters}>Tên NVL</ColumnFilter></th>
                  <th style={{ width: '10%' }}><ColumnFilter columnKey="order_date" items={items} filters={filters} setFilters={setFilters}>Ngày đặt</ColumnFilter></th>
                  <th style={{ width: '12%' }}><ColumnFilter columnKey="vendor_name" items={items} filters={filters} setFilters={setFilters}>Vendor</ColumnFilter></th>
                  <th style={{ width: '8%' }}><ColumnFilter columnKey="quantity" items={items} filters={filters} setFilters={setFilters}>Qty</ColumnFilter></th>
                  <th style={{ width: '10%' }}><ColumnFilter columnKey="total_amount" items={items} filters={filters} setFilters={setFilters}>Amount</ColumnFilter></th>
                  <th style={{ width: '10%' }}><ColumnFilter columnKey="received_date" items={items} filters={filters} setFilters={setFilters}>Ngày nhận</ColumnFilter></th>
                  <th style={{ width: '10%' }}><ColumnFilter columnKey="receiver_name" items={items} filters={filters} setFilters={setFilters}>Người nhận</ColumnFilter></th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px' }}>Đang tải...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: 'center', padding: '40px' }}>Không tìm thấy dữ liệu</td></tr>
                ) : filtered.map(item => (
                  <tr key={item.id} className={`nvl-row ${selected.has(item.id) ? 'selected' : ''}`} style={{ cursor: 'default' }}>
                    <td onClick={e => toggleSelect(item.id, e)}>
                      <input type="checkbox" checked={selected.has(item.id)} onChange={() => {}} />
                    </td>
                    <td><code style={{ fontSize: '12px' }}>{item.po_number || '—'}</code></td>
                    <td><span style={{ fontWeight: 500 }}>{item.nvl_name}</span></td>
                    <td>{item.order_date || '—'}</td>
                    <td>{item.vendor_name}</td>
                    <td>{item.quantity} <small style={{ color: 'var(--text-secondary)' }}>({item.nvl_unit || '—'})</small></td>
                    <td style={{ fontFamily: 'berkeleyMono' }}>{formatPrice(item.total_amount)}</td>
                    <td>{item.received_date && !String(item.received_date).toLowerCase().includes('invalid') ? item.received_date : '—'}</td>
                    <td>{item.receiver_name}</td>
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
