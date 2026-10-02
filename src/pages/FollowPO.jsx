import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { 
  Trash2, Edit2, Search, X, Package, 
  Users, CheckCircle, History, ShoppingCart, Download
} from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import ColumnFilter from '../components/ColumnFilter';
import POFormModal from '../components/POFormModal';
import PurchasedHistoryModal from '../components/PurchasedHistoryModal';
import { usePermission } from '../context/PermissionContext';
import { io } from 'socket.io-client';
import { useResizableColumns } from '../hooks/useResizableColumns';

const API_BASE = '/api/po';
const headers = () => ({ 'Authorization': `Bearer ${sessionStorage.getItem('token')}` });

export default function FollowPO() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const location = useLocation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [showHistory, setShowHistory] = useState(false);
  const [editPO, setEditItem] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [preselectedNvls, setPreselectedNvls] = useState(null);

  // Resizable columns: [checkbox, poNumber, nvlName, orderDate, costType, vendor, quantity, amount, eta, receivedDate, receiver]
  const { widths: colWidths, startResize } = useResizableColumns([40, 130, 160, 110, 160, 130, 90, 120, 110, 110, 120]);

  // Permissions
  const { hasPermission, isAdmin } = usePermission();

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/list`, { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setItems(data);
      } else {
        toast.error('Lỗi tải danh sách PO.');
      }
    } catch (e) {
      toast.error('Lỗi kết nối backend.');
    }
    setLoading(false);
  };

  useEffect(() => { 
    fetchAll();
  }, [location]);

  // Real-time update listener
  useEffect(() => {
    const socket = io(window.location.protocol + "//" + window.location.hostname + ":1908");
    socket.on('data-update', (data) => {
      if (data.type === 'po') {
        fetchAll();
      }
    });
    return () => socket.disconnect();
  }, []);

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
      title: 'Xóa Purchase Orders',
      message: `Bạn có chắc chắn muốn xóa ${selectedPoIds.length} đơn hàng đã chọn? Hành động này không thể hoàn tác.`,
      type: 'danger',
      verificationText: 'delete',
      onConfirm: async () => {
        try {
          for (const id of selectedPoIds) {
            await fetch(`${API_BASE}/${id}`, { method: 'DELETE', headers: headers() });
          }
          toast.success(`Đã xóa các đơn hàng.`);
          setSelected(new Set());
          fetchAll();
        } catch {
          toast.error('Lỗi khi xóa.');
        }
      }
    });
  };

  const handleReceived = async () => {
    if (selected.size === 0) return;
    const selectedPoItems = items.filter(i => selected.has(i.id));
    const selectedPoIds = Array.from(new Set(selectedPoItems.map(i => i.po_id)));
    
    const hasNoPoNum = selectedPoItems.some(i => i.po_number && i.po_number.startsWith('DRAFT-'));
    const hasNoVendor = selectedPoItems.some(i => !i.vendor_name || i.vendor_name === '—');
    const hasNoOrderDate = selectedPoItems.some(i => !i.order_date);
    const hasNoEta = selectedPoItems.some(i => !i.eta);
    const hasNoReceiver = selectedPoItems.some(i => !i.receiver_name || i.receiver_name === '—');
    const hasZeroQty = selectedPoItems.some(i => !i.quantity || i.quantity <= 0);
    const hasNoAmount = selectedPoItems.some(i => !i.total_amount || i.total_amount <= 0);

    if (hasNoPoNum) return toast.error('Thiếu Mã PO hoặc Mã PO không hợp lệ.');
    if (hasNoVendor) return toast.error('Vui lòng chọn Nhà cung cấp.');
    if (hasNoOrderDate) return toast.error('Vui lòng nhập Ngày đặt hàng.');
    if (hasNoEta) return toast.error('Vui lòng nhập Ngày ETA.');
    if (hasNoReceiver) return toast.error('Vui lòng nhập Tên người nhận hàng.');
    if (hasZeroQty) return toast.error('Số lượng (Quantity) phải lớn hơn 0.');
    if (hasNoAmount) return toast.error('Số tiền (Amount) phải lớn hơn 0.');

    confirm({
      title: 'Xác nhận Nhận Hàng',
      message: 'Vui lòng nhập Ngày thực tế nhận hàng:',
      type: 'info',
      inputType: 'date',
      inputValue: new Date().toISOString().split('T')[0],
      onConfirm: async (receivedDate) => {
        if (!receivedDate) {
          toast.error('Vui lòng chọn ngày nhận.');
          return;
        }
        try {
          for (const id of selectedPoIds) {
            await fetch(`${API_BASE}/${id}`, {
              method: 'PUT',
              headers: { ...headers(), 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 3, received_date: receivedDate })
            });
          }
          toast.success('Đã nhận hàng và cập nhật kho.');
          setSelected(new Set());
          fetchAll();
        } catch {
          toast.error('Lỗi cập nhật.');
        }
      }
    });
  };

  const handleBulkDeleteClick = (e) => {
    if (selected.size === 0) {
      toast.error('Bạn chưa chọn sản phẩm nào.');
      return;
    }
    handleBulkDelete(e);
  };

  const handleReceivedClick = (e) => {
    if (selected.size === 0) {
      toast.error('Bạn chưa chọn sản phẩm nào.');
      return;
    }
    handleReceived(e);
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

  const handleExportExcel = async () => {
    try {
      const itemsToExport = selected.size > 0
        ? filtered.filter(item => selected.has(item.id))
        : filtered;

      if (!itemsToExport || itemsToExport.length === 0) {
        toast.error('Không có dữ liệu để xuất báo cáo.');
        return;
      }

      toast.info('Đang tạo báo cáo theo mẫu chuẩn...');

      const token = sessionStorage.getItem('token');
      const response = await fetch('/api/po/export-request', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ items: itemsToExport })
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.message || 'Lỗi khi tạo báo cáo từ máy chủ.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `Request_Purchasing_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

      toast.success('Xuất báo cáo Request Purchasing thành công!');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Lỗi khi xuất báo cáo Excel.');
    }
  };

  return (
    <div className="nvl-page">
      <div className="nvl-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
            <ShoppingCart size={24} color="var(--color-accent)" />
          </div>
          <h1 className="home-title" style={{ margin: 0 }}>Theo dõi Purchase Orders (Follow PO)</h1>
        </div>
        <div className="nvl-header-actions">
          <div style={{ display: 'flex', gap: '12px' }}>
            {hasPermission('po.delete') && (
              <button 
                className="btn-primary" 
                style={{ 
                  backgroundColor: 'var(--color-error)', 
                  display: 'inline-flex', 
                  alignItems: 'center',
                  opacity: selected.size === 0 ? 0.5 : 1,
                  transition: 'opacity 0.2s'
                }} 
                onClick={handleBulkDeleteClick}
              >
                <Trash2 size={16} style={{ marginRight: '8px' }}/> Xóa {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            )}
            {hasPermission('po.receive') && (
              <button 
                className="btn-primary" 
                style={{ 
                  backgroundColor: 'var(--color-success)', 
                  display: 'inline-flex', 
                  alignItems: 'center',
                  opacity: selected.size === 0 ? 0.5 : 1,
                  transition: 'opacity 0.2s'
                }} 
                onClick={handleReceivedClick}
              >
                <CheckCircle size={16} style={{ marginRight: '8px' }}/> Nhận Hàng {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            )}
          </div>
          <button className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center' }} onClick={() => setShowHistory(true)}>
            <History size={16} style={{ marginRight: '8px' }}/> Hàng đã mua
          </button>
          <button className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }} onClick={handleExportExcel}>
            <Download size={16} /> Xuất Excel
          </button>
          {hasPermission('po.vendor') && (
            <button className="btn-secondary" style={{ display: 'inline-flex', alignItems: 'center' }} onClick={() => navigate('/vendors')}>
              <Users size={16} style={{ marginRight: '8px' }}/> Quản lý Vendors
            </button>
          )}
        </div>
      </div>

      <div className="nvl-toolbar">
        <div className="search-box">
          <Search size={16} style={{ color: 'var(--text-secondary)' }}/>
          <input
            type="text"
            placeholder="Tìm kiếm PO, NVL, Nhà cung cấp..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <X size={16} onClick={() => setSearch('')} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }}/>}
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {Object.keys(filters).length > 0 && (
            <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '13px' }} onClick={() => setFilters({})}>
              Xóa Filter
            </button>
          )}
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{filtered.length} đơn chưa nhận</span>
        </div>
      </div>

      <div className="nvl-table-wrap">
        <table className="nvl-table">
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th>
                <div className="col-filter-trigger" style={{ justifyContent: 'center', cursor: 'default', padding: '12px 8px' }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={toggleSelectAll} />
                </div>
                <div className="col-resize-handle" onMouseDown={e => startResize(0, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="po_number" items={items} filters={filters} setFilters={setFilters}>Mã PO</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(1, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_name" items={items} filters={filters} setFilters={setFilters}>Tên NVL</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(2, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="order_date" items={items} filters={filters} setFilters={setFilters}>Ngày đặt</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(3, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="cost_type" items={items} filters={filters} setFilters={setFilters}>Loại chi phí</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(4, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="vendor_name" items={items} filters={filters} setFilters={setFilters}>Vendor</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(5, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="quantity" items={items} filters={filters} setFilters={setFilters}>Quantity</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(6, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="total_amount" items={items} filters={filters} setFilters={setFilters}>Amount (USD)</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(7, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="eta" items={items} filters={filters} setFilters={setFilters}>ETA</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(8, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="received_date" items={items} filters={filters} setFilters={setFilters}>Ngày nhận</ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(9, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="receiver_name" items={items} filters={filters} setFilters={setFilters}>Người nhận</ColumnFilter>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px' }}>Đang tải...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px' }}>Chưa có dữ liệu theo dõi</td></tr>
            ) : filtered.map(item => (
              <tr key={item.id} className={`nvl-row ${selected.has(item.id) ? 'selected' : ''}`} onClick={() => setEditItem(item)}>
                <td onClick={e => toggleSelect(item.id, e)}>
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => {}} />
                </td>
                <td><code style={{ fontSize: '12px' }}>{item.po_number || '—'}</code></td>
                <td><span style={{ fontWeight: 500 }}>{item.nvl_name}</span></td>
                <td>{item.order_date || '—'}</td>
                <td><small>{item.cost_type || '—'}</small></td>
                <td>{item.vendor_name}</td>
                <td>{item.quantity} <small style={{ color: 'var(--text-secondary)' }}>({item.nvl_unit || '—'})</small></td>
                <td style={{ fontFamily: 'berkeleyMono' }}>{formatPrice(item.total_amount)}</td>
                <td>{item.eta || '—'}</td>
                <td>{item.received_date && !String(item.received_date).toLowerCase().includes('invalid') ? item.received_date : '—'}</td>
                <td>{item.receiver_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>


      {showHistory && <PurchasedHistoryModal onClose={() => setShowHistory(false)} />}
      
      {(isCreating || editPO) && (
        <POFormModal 
          po={editPO} 
          initialDetails={preselectedNvls}
          onClose={() => { setEditItem(null); setIsCreating(false); setPreselectedNvls(null); }} 
          onRefresh={fetchAll}
        />
      )}
    </div>
  );
}
