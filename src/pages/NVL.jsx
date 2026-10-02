import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Trash2, Edit2, Search, X, Package,
  ChevronDown, Check, AlertTriangle, ZoomIn, Upload,
  RotateCw, Download, ZoomOut, ShoppingCart
} from 'lucide-react';
import OptimizedImage from '../components/OptimizedImage';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import ColumnFilter from '../components/ColumnFilter';
import StockChartModal from '../components/StockChartModal';
import { TrendingUp } from 'lucide-react';
import { usePermission } from '../context/PermissionContext';
import { io } from 'socket.io-client';
import { useResizableColumns } from '../hooks/useResizableColumns';
import * as XLSX from 'xlsx-js-style';

// Convert display leadtime (weeks) to days
const toDays = (weeks) => {
  const v = parseFloat(weeks) || 0;
  return v * 7;
};

// Convert days to display value (weeks)
const fromDays = (days) => {
  if (!days) return { value: '' };
  return { value: days / 7 };
};

const UNIT_LABEL = { day: 'Ngày', week: 'Tuần', month: 'Tháng' };

const API_BASE = '/api/nvl';
const headers = () => ({ 'Authorization': `Bearer ${sessionStorage.getItem('token')}` });

const EMPTY_FORM = {
  nvl_name: '', nvl_item_code: '', nvl_price: '', nvl_money_type: 'VND',
  nvl_unit: '', nvl_leadtime_value: '',
  nvl_stock: '', nvl_min_order: '', nvl_alarm: '', nvl_description: '', imageFile: null,
  nvl_category: '', nvl_exp: '', nvl_is_date: false,
  vendor_id: '',
  quoteImageFile: null
};

export default function NVLPage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [filters, setFilters] = useState({}); // Custom column tabular filters
  const [vendors, setVendors] = useState([]);

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/vendors', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        setVendors(data);
      }
    } catch (e) {
      console.error(e);
    }
  };
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [detail, setDetail] = useState(null);     // popup detail view
  const [editItem, setEditItem] = useState(null); // popup edit/create
  const [chartItem, setChartItem] = useState(null); // popup chart view
  const [isCreating, setIsCreating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [quotePreviewUrl, setQuotePreviewUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [zoomImage, setZoomImage] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const fileRef = useRef();
  const quoteFileRef = useRef();
  const [showCatDropdown, setShowCatDropdown] = useState(false);
  const [catSearch, setCatSearch] = useState('');
  const catDropdownRef = useRef();

  const getCommonVendorsForCats = (cats) => {
    if (!cats || cats.length === 0) return [];
    
    // For each category, get vendor names
    const vendorSets = cats.map(cat => {
      const names = vendors
        .filter(v => v.nvl_category === cat)
        .map(v => v.vendor_name);
      return new Set(names);
    });

    if (vendorSets.length === 0) return [];
    let commonNames = Array.from(vendorSets[0]);
    for (let i = 1; i < vendorSets.length; i++) {
      commonNames = commonNames.filter(name => vendorSets[i].has(name));
    }

    const uniqueCommonVendors = [];
    const seenNames = new Set();
    
    commonNames.forEach(name => {
      if (!seenNames.has(name)) {
        const matched = vendors.find(v => v.vendor_name === name && cats.includes(v.nvl_category));
        if (matched) {
          uniqueCommonVendors.push(matched);
          seenNames.add(name);
        }
      }
    });

    return uniqueCommonVendors;
  };

  const toggleCategory = (cat) => {
    const currentCats = form.nvl_category ? form.nvl_category.split(',').map(s => s.trim()).filter(Boolean) : [];
    let newCats;
    if (currentCats.includes(cat)) {
      newCats = currentCats.filter(c => c !== cat);
    } else {
      newCats = [...currentCats, cat];
    }
    const commonVendors = getCommonVendorsForCats(newCats);
    const hasCurrentVendor = commonVendors.some(v => String(v.id) === String(form.vendor_id));
    
    setForm(f => ({
      ...f,
      nvl_category: newCats.join(', '),
      vendor_id: hasCurrentVendor ? f.vendor_id : ''
    }));
  };

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (catDropdownRef.current && !catDropdownRef.current.contains(e.target)) {
        setShowCatDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Resizable columns: [checkbox, stt, name, itemCode, category, price, unit, leadtime, stock, alarm, minOrder, chart]
  const { widths: colWidths, startResize } = useResizableColumns([36, 50, 240, 150, 150, 110, 70, 130, 90, 90, 100, 70]);

  const tooltipTimeout = useRef(null);
  const [tooltip, setTooltip] = useState({ text: '', x: 0, y: 0, visible: false });

  const showTooltip = (text, e) => {
    if (!text || text === '—') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    tooltipTimeout.current = setTimeout(() => {
      setTooltip({
        text,
        x: rect.left + rect.width / 2,
        y: rect.top - 8,
        visible: true
      });
    }, 300); // 800ms delay
  };

  const hideTooltip = () => {
    if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    setTooltip(prev => ({ ...prev, visible: false }));
  };

  useEffect(() => {
    return () => {
      if (tooltipTimeout.current) clearTimeout(tooltipTimeout.current);
    };
  }, []);

  // Permissions
  const { hasPermission, isAdmin } = usePermission();

  useEffect(() => {
    let result = items;

    // Global text search
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(i =>
        (i.nvl_name || '').toLowerCase().includes(s) ||
        (i.nvl_item_code || '').toLowerCase().includes(s) ||
        (i.nvl_category || '').toLowerCase().includes(s) ||
        (i.nvl_unit || '').toLowerCase().includes(s)
      );
    }

    // Column Filters (intersection)
    Object.keys(filters).forEach(key => {
      const allowedSet = filters[key];
      if (allowedSet && allowedSet.size > 0) {
        result = result.filter(item => {
          if (key === 'nvl_category' && item[key]) {
            const itemCats = item[key].split(',').map(s => s.trim()).filter(Boolean);
            return itemCats.some(cat => allowedSet.has(cat));
          }
          return allowedSet.has(item[key]);
        });
      }
    });

    setFiltered(result);
  }, [search, items, filters]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_BASE, { headers: headers() });
      const data = await res.json();

      const getSeverity = (stock, alarm) => {
        if (!alarm || alarm <= 0) return 0;
        if (stock <= alarm) return 3;
        return 0;
      };

      const sortedData = (Array.isArray(data) ? data : []).sort((a, b) => {
        const sevA = getSeverity(a.nvl_stock, a.nvl_alarm);
        const sevB = getSeverity(b.nvl_stock, b.nvl_alarm);
        if (sevB !== sevA) return sevB - sevA;
        return (a.nvl_name || '').localeCompare(b.nvl_name || '');
      });

      const itemsWithDisplay = sortedData.map(item => ({
        ...item,
        nvl_leadtime_display: formatLeadtime(item.nvl_leadtime)
      }));
      setItems(itemsWithDisplay);
    } catch (e) {
      toast.error('Lỗi kết nối backend.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    fetchVendors();
  }, []);

  // Real-time update listener
  useEffect(() => {
    const socket = io(window.location.protocol + "//" + window.location.hostname + ":1908");
    socket.on('data-update', (data) => {
      if (data.type === 'nvl') {
        fetchAll();
      }
    });
    return () => socket.disconnect();
  }, []);

  // ESC key listener
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setPreviewUrl(null);
    setQuotePreviewUrl(null);
    setIsCreating(true);
    setEditItem(null);
    setDetail(null);
  };

  const openEdit = (item, e) => {
    e?.stopPropagation();
    const lt = fromDays(item.nvl_leadtime);
    setForm({
      nvl_name: item.nvl_name || '',
      nvl_item_code: item.nvl_item_code || '',
      nvl_price: item.nvl_price ?? '',
      nvl_money_type: item.nvl_money_type || 'VND',
      nvl_unit: item.nvl_unit || '',
      nvl_leadtime_value: lt.value,
      nvl_stock: item.nvl_stock ?? '',
      nvl_min_order: item.nvl_min_order ?? '',
      nvl_alarm: item.nvl_alarm ?? '',
      nvl_description: item.nvl_description || '',
      nvl_category: item.nvl_category || '',
      nvl_exp: item.nvl_exp || '',
      nvl_is_date: !!item.nvl_is_date,
      vendor_id: item.vendor_id ?? '',
      imageFile: null,
      quoteImageFile: null
    });
    setPreviewUrl(item.nvl_image_path || null);
    setQuotePreviewUrl(item.nvl_quote_image_path || null);
    setEditItem(item);
    setIsCreating(false);
    setDetail(null);
  };

  const openDetail = (item) => {
    setDetail(item);
    setEditItem(null);
    setIsCreating(false);
  };

  const closeAll = () => {
    setDetail(null);
    setEditItem(null);
    setIsCreating(false);
    setIsImporting(false);
    setZoomImage(null);
    setRotation(0);
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setIsDragging(false);
    setShowCatDropdown(false);
  };

  const handleDownloadJpg = async (imagePath, fileName) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = imagePath;

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');

      const isVertical = (rotation / 90) % 2 !== 0;
      canvas.width = isVertical ? img.height : img.width;
      canvas.height = isVertical ? img.width : img.height;

      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `${fileName || 'nvl-image'}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Đang tải ảnh xuống (JPG)...');
    } catch (e) {
      console.error(e);
      toast.error('Không thể tải ảnh xuống.');
    }
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setForm(f => ({ ...f, imageFile: file }));
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleQuoteImageChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setForm(f => ({ ...f, quoteImageFile: file }));
    setQuotePreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.nvl_is_date && !form.nvl_exp) {
      toast.error('Vui lòng chọn ngày hết hạn khi có hạn sử dụng.');
      return;
    }

    const formData = new FormData();
    formData.append('nvl_name', form.nvl_name);
    formData.append('nvl_item_code', form.nvl_item_code);
    formData.append('nvl_price', form.nvl_price);
    formData.append('nvl_money_type', form.nvl_money_type);
    formData.append('nvl_unit', form.nvl_unit);
    formData.append('nvl_leadtime', toDays(form.nvl_leadtime_value));
    formData.append('nvl_stock', form.nvl_stock);
    formData.append('nvl_min_order', form.nvl_min_order);
    formData.append('nvl_alarm', form.nvl_alarm);
    formData.append('nvl_description', form.nvl_description);
    formData.append('nvl_category', form.nvl_category);
    formData.append('nvl_exp', form.nvl_is_date ? form.nvl_exp : '');
    formData.append('nvl_is_date', form.nvl_is_date);
    formData.append('vendor_id', form.vendor_id || '');
    if (form.imageFile) formData.append('nvl_image', form.imageFile);
    if (form.quoteImageFile) formData.append('nvl_quote_image', form.quoteImageFile);

    try {
      const res = await fetch(
        isCreating ? API_BASE : `${API_BASE}/${editItem.id}`,
        { method: isCreating ? 'POST' : 'PUT', headers: headers(), body: formData }
      );
      const data = await res.json();
      if (res.ok) {
        toast.success(isCreating ? 'Thêm NVL thành công.' : 'Cập nhật thành công.');
        fetchAll();
        setTimeout(closeAll, 500);
      } else {
        toast.error(data.message || 'Lỗi xử lý yêu cầu.');
      }
    } catch {
      toast.error('Lỗi kết nối server.');
    }
  };

  const handleDelete = async (id, e) => {
    e?.stopPropagation();
    confirm({
      title: 'Xóa Nguyên Vật Liệu',
      message: 'Bạn có chắc chắn muốn xóa mục này? Hành động này không thể hoàn tác.',
      type: 'danger',
      onConfirm: async () => {
        const res = await fetch(`${API_BASE}/${id}`, { method: 'DELETE', headers: headers() });
        if (res.ok) {
          toast.success('Đã xóa NVL.');
          fetchAll();
          closeAll();
        } else {
          const err = await res.json();
          toast.error(err.message || 'Lỗi khi xóa.');
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    confirm({
      title: 'Xóa Hàng Loạt',
      message: `Bạn có chắc chắn muốn xóa ${selected.size} mục đã chọn? Hành động này không thể hoàn tác.`,
      type: 'danger',
      verificationText: 'delete',
      onConfirm: async () => {
        try {
          const res = await fetch(`${API_BASE}/bulk-delete`, {
            method: 'POST',
            headers: { ...headers(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids: [...selected] })
          });
          if (res.ok) {
            toast.success(`Đã xóa ${selected.size} NVL.`);
            setSelected(new Set());
            fetchAll();
          } else {
            const err = await res.json();
            toast.error(err.message || 'Lỗi khi xóa hàng loạt.');
          }
        } catch {
          toast.error('Lỗi kết nối server.');
        }
      }
    });
  };

  const handleBuyNow = async () => {
    if (selected.size === 0) return;
    const nvl_ids = [...selected];
    // Not using setLoading(true) to avoid list jumping
    try {
      const res = await fetch('/api/po/auto-create-multiple', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nvl_ids })
      });
      if (res.ok) {
        toast.success('Đã tạo các đơn PO nháp.');
        setSelected(new Set()); // Uncheck items
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi khi tạo đơn hàng.');
      }
    } catch {
      toast.error('Lỗi kết nối.');
    }
  };

  const handleBulkDeleteClick = (e) => {
    if (selected.size === 0) {
      toast.error('Bạn chưa chọn sản phẩm nào.');
      return;
    }
    handleBulkDelete(e);
  };

  const handleBuyNowClick = (e) => {
    if (selected.size === 0) {
      toast.error('Bạn chưa chọn sản phẩm nào.');
      return;
    }
    handleBuyNow(e);
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

  const formatPrice = (p, type) => {
    if (p === null || p === undefined || p === '') return '—';
    const currency = type || 'VND';
    const formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency === 'YEN' ? 'JPY' : currency,
    });
    return formatter.format(p);
  };

  const handleExportExcel = () => {
    try {
      const exportData = filtered.map((item, idx) => ({
        'STT': idx + 1,
        'Tên NVL': item.nvl_name || '—',
        'Item Code': item.nvl_item_code || '—',
        'Khu Vực': item.nvl_category || '—',
        'Giá tiền': item.nvl_price ?? 0,
        'Đơn vị tiền': item.nvl_money_type || 'VND',
        'Đơn vị': item.nvl_unit || '—',
        'Leadtime giao hàng': item.nvl_leadtime_display || '—',
        'Stock': item.nvl_stock ?? 0,
        'Alarm': item.nvl_alarm ?? 0,
        'Min Order': item.nvl_min_order ?? 0
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);

      // Auto-fit columns
      if (exportData.length > 0) {
        const colKeys = Object.keys(exportData[0]);
        ws['!cols'] = colKeys.map(key => {
          let maxLen = key.length;
          exportData.forEach(row => {
            const val = row[key];
            const len = val ? String(val).length : 0;
            if (len > maxLen) maxLen = len;
          });
          return { wch: maxLen + 4 };
        });
      }

      // Add styles to header row
      const range = XLSX.utils.decode_range(ws['!ref']);
      for (let col = range.s.c; col <= range.e.c; col++) {
        const cellAddr = XLSX.utils.encode_cell({ r: 0, c: col });
        if (ws[cellAddr]) {
          ws[cellAddr].s = {
            fill: {
              patternType: 'solid',
              fgColor: { rgb: 'F54E00' } // Accent orange
            },
            font: {
              name: 'Calibri',
              sz: 11,
              bold: true,
              color: { rgb: 'FFFFFF' }
            },
            alignment: {
              vertical: 'center',
              horizontal: 'center'
            }
          };
        }
      }

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Danh sách NVL");
      XLSX.writeFile(wb, "Danh_sach_NVL.xlsx");
      toast.success("Xuất file Excel thành công!");
    } catch (err) {
      console.error(err);
      toast.error("Không thể xuất file Excel.");
    }
  };

  const formatLeadtime = (days) => {
    if (!days) return '—';
    return `${days / 7} Tuần`;
  };

  const getRowWarningClass = (stock, alarm) => {
    if (!alarm || alarm <= 0) return '';
    if (stock <= alarm) return 'row-warning-red';
    return '';
  };

  const getStockWarningClass = (stock, alarm) => {
    if (!alarm || alarm <= 0) return '';
    if (stock <= alarm) return 'stock-warning-red';
    return '';
  };

  const categories = [...new Set(vendors.map(v => v.nvl_category).filter(Boolean))];

  return (
    <div className="nvl-page">
      {/* HEADER */}
      <div className="nvl-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
            <Package size={24} color="var(--color-accent)" />
          </div>
          <h1 className="home-title" style={{ margin: 0 }}>Nguyên Vật Liệu Chi Tiết</h1>
        </div>
        <div className="nvl-header-actions">
          <div style={{ display: 'flex', gap: '12px' }}>
            {isAdmin && (
              <button 
                className="btn-primary" 
                style={{ 
                  backgroundColor: 'var(--color-error)', 
                  color: '#fff', 
                  border: 'none',
                  opacity: selected.size === 0 ? 0.5 : 1,
                  transition: 'opacity 0.2s'
                }} 
                onClick={handleBulkDeleteClick}
              >
                <Trash2 size={16} style={{ marginRight: '8px' }} /> Xóa {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            )}
            {hasPermission('po.buy') && (
              <button 
                className="btn-primary" 
                style={{ 
                  backgroundColor: 'var(--color-success)', 
                  color: '#fff', 
                  border: 'none',
                  opacity: selected.size === 0 ? 0.5 : 1,
                  transition: 'opacity 0.2s'
                }} 
                onClick={handleBuyNowClick}
              >
                <ShoppingCart size={16} style={{ marginRight: '8px' }} /> Mua Hàng {selected.size > 0 ? `(${selected.size})` : ''}
              </button>
            )}
          </div>
          {hasPermission('nvl.import') && (
            <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={() => setIsImporting(true)}>
              <Upload size={18} /> Nhập Excel
            </button>
          )}
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleExportExcel}>
            <Download size={18} /> Xuất Excel
          </button>
          {hasPermission('nvl.create') && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={18} /> Thêm NVL
            </button>
          )}
        </div>
      </div>

      {/* SEARCH */}
      <div className="nvl-toolbar">
        <div className="search-box">
          <Search size={16} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Tìm kiếm (Tên, Mã, Khu vực, Đơn vị)..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && <X size={16} onClick={() => setSearch('')} style={{ cursor: 'pointer', color: 'var(--text-secondary)' }} />}
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          {Object.keys(filters).length > 0 && (
            <button className="btn-secondary" style={{ padding: '4px 12px', fontSize: '13px' }} onClick={() => setFilters({})}>
              Xóa Filter
            </button>
          )}
          <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>{filtered.length} kết quả</span>
        </div>
      </div>

      {/* TABLE */}
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
                <div className="col-filter-trigger" style={{ cursor: 'default', padding: '12px 10px' }}>STT</div>
                <div className="col-resize-handle" onMouseDown={e => startResize(1, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_name" items={items} filters={filters} setFilters={setFilters}>
                  Tên NVL
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(2, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_item_code" items={items} filters={filters} setFilters={setFilters}>
                  Item Code
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(3, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_category" items={items} filters={filters} setFilters={setFilters}>
                  Khu Vực
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(4, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_price" items={items} filters={filters} setFilters={setFilters}>
                  Giá tiền
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(5, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_unit" items={items} filters={filters} setFilters={setFilters}>
                  Đơn vị
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(6, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_leadtime_display" items={items} filters={filters} setFilters={setFilters}>
                  Leadtime giao hàng
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(7, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_stock" items={items} filters={filters} setFilters={setFilters}>
                  Stock
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(8, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_alarm" items={items} filters={filters} setFilters={setFilters}>
                  Alarm
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(9, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="nvl_min_order" items={items} filters={filters} setFilters={setFilters}>
                  Min Order
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(10, e)} />
              </th>
              <th>
                <div className="col-filter-trigger" style={{ justifyContent: 'center', cursor: 'default' }}>
                  Biểu đồ
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Đang tải...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <Package size={40} style={{ marginBottom: '10px', opacity: 0.3, display: 'block', margin: '0 auto 10px' }} />
                Chưa có dữ liệu
              </td></tr>
            )}
            {filtered.map((item, idx) => (
              <tr key={item.id} onClick={() => openDetail(item)}
                className={`nvl-row ${selected.has(item.id) ? 'selected' : ''} ${getRowWarningClass(item.nvl_stock, item.nvl_alarm)}`}
              >
                <td onClick={e => toggleSelect(item.id, e)}>
                  <input type="checkbox" checked={selected.has(item.id)} onChange={() => { }} />
                </td>
                <td>{idx + 1}</td>
                <td onMouseEnter={e => showTooltip(item.nvl_name, e)} onMouseLeave={hideTooltip}>
                  <div className="nvl-name-cell">
                    {item.nvl_image_path
                      ? <OptimizedImage src={item.nvl_image_path} alt="" className="nvl-thumb" />
                      : <div className="nvl-thumb placeholder"><Package size={16} /></div>
                    }
                    <span className="text-truncate-strict">{item.nvl_name || '—'}</span>
                  </div>
                </td>
                <td onMouseEnter={e => showTooltip(item.nvl_item_code, e)} onMouseLeave={hideTooltip}>{item.nvl_item_code || '—'}</td>
                <td onMouseEnter={e => showTooltip(item.nvl_category, e)} onMouseLeave={hideTooltip}><span className="text-truncate-strict">{item.nvl_category || '—'}</span></td>
                <td>{formatPrice(item.nvl_price, item.nvl_money_type)}</td>
                <td>{item.nvl_unit || '—'}</td>
                <td>{item.nvl_leadtime_display}</td>
                <td>
                  <span className={getStockWarningClass(item.nvl_stock, item.nvl_alarm)}>
                    {item.nvl_stock ?? '—'}
                  </span>
                </td>
                <td>{item.nvl_alarm ?? '—'}</td>
                <td>{item.nvl_min_order ?? '—'}</td>
                <td onClick={e => e.stopPropagation()} style={{ textAlign: 'center' }}>
                  <button className="action-btn" title="Biểu đồ tồn kho" onClick={() => setChartItem(item)}>
                    <TrendingUp size={16} style={{ color: 'var(--accent-orange)' }} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DETAIL POPUP */}
      {detail && (
        <div className="modal-overlay" onClick={closeAll}>
          <div className="modal-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{detail.nvl_name || 'Chi tiết NVL'}</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                {getRowWarningClass(detail.nvl_stock, detail.nvl_alarm) && (
                  <AlertTriangle size={18} className="toast-icon warning" style={{ alignSelf: 'center', marginRight: '8px' }} />
                )}
                {hasPermission('nvl.edit') && (
                  <button className="action-btn edit" title="Sửa" onClick={e => openEdit(detail, e)}><Edit2 size={16} /></button>
                )}
                {hasPermission('nvl.delete') && (
                  <button className="action-btn delete" title="Xóa" onClick={e => handleDelete(detail.id, e)}><Trash2 size={16} /></button>
                )}
                <button className="action-btn" onClick={closeAll}><X size={16} /></button>
              </div>
            </div>

            <div className="modal-content">
              <div className="detail-grid">
                <div className="detail-item"><span>Item Code</span><strong>{detail.nvl_item_code || '—'}</strong></div>
                <div className="detail-item"><span>Khu vực sử dụng</span><strong>{detail.nvl_category || '—'}</strong></div>
                <div className="detail-item"><span>Nhà Cung Cấp</span><strong>{detail.vendor?.vendor_name || '—'}</strong></div>
                <div className="detail-item"><span>Hạn sử dụng</span><strong>{detail.nvl_is_date ? (detail.nvl_exp || 'Chưa đặt') : 'Không có'}</strong></div>
                <div className="detail-item"><span>Giá tiền</span><strong>{formatPrice(detail.nvl_price, detail.nvl_money_type)}</strong></div>
                <div className="detail-item"><span>Đơn vị</span><strong>{detail.nvl_unit || '—'}</strong></div>
                <div className="detail-item"><span>Leadtime giao hàng</span><strong>{formatLeadtime(detail.nvl_leadtime)}</strong></div>
                <div className="detail-item">
                  <span>Stock</span>
                  <strong className={getStockWarningClass(detail.nvl_stock, detail.nvl_alarm)}>{detail.nvl_stock ?? '—'}</strong>
                </div>
                <div className="detail-item"><span>Alarm</span><strong>{detail.nvl_alarm ?? '—'}</strong></div>
                <div className="detail-item"><span>Min Order</span><strong>{detail.nvl_min_order ?? '—'}</strong></div>
              </div>

              {detail.nvl_description && (
                <div className="detail-desc" style={{ marginBottom: '20px' }}>
                  <span>Mô tả</span>
                  <p>{detail.nvl_description}</p>
                </div>
              )}

              {(detail.nvl_image_path || detail.nvl_quote_image_path) && (
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                  {detail.nvl_image_path && (
                    <div className="detail-image-wrap" style={{ flex: '1 1 0', minWidth: '200px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Hình ảnh (Click để phóng to)</div>
                      <div className="detail-image-trigger" onClick={() => setZoomImage(detail.nvl_image_path)}>
                        <OptimizedImage
                          src={detail.nvl_image_path}
                          alt={detail.nvl_name}
                          className="detail-image"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            console.error("Failed to load image at:", detail.nvl_image_path);
                          }}
                        />
                        <div className="image-overlay-icon"><ZoomIn size={32} /></div>
                      </div>
                    </div>
                  )}
                  {detail.nvl_quote_image_path && (
                    <div className="detail-image-wrap" style={{ flex: '1 1 0', minWidth: '200px' }}>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Ảnh Báo Giá (Click để phóng to)</div>
                      <div className="detail-image-trigger" onClick={() => setZoomImage(detail.nvl_quote_image_path)}>
                        <OptimizedImage
                          src={detail.nvl_quote_image_path}
                          alt={`Báo giá - ${detail.nvl_name}`}
                          className="detail-image"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            console.error("Failed to load quote image at:", detail.nvl_quote_image_path);
                          }}
                        />
                        <div className="image-overlay-icon"><ZoomIn size={32} /></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT POPUP */}
      {(isCreating || editItem) && (
        <div className="modal-overlay" onClick={closeAll}>
          <div className="modal-box modal-form-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isCreating ? 'Thêm NVL mới' : 'Chỉnh sửa NVL'}</h2>
              <button className="action-btn" onClick={closeAll}><X size={16} /></button>
            </div>

            <div className="modal-content">
              <form onSubmit={handleSubmit} className="nvl-form">
                {/* Image Upload */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 0', minWidth: '180px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Hình ảnh sản phẩm</div>
                    <div className="image-upload-zone" onClick={() => fileRef.current?.click()}>
                      {previewUrl
                        ? <img src={previewUrl} alt="preview" className="upload-preview" />
                        : <div className="upload-placeholder"><Upload size={28} /><span>Click để chọn ảnh</span></div>
                      }
                    </div>
                    <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageChange} />
                  </div>
                  <div style={{ flex: '1 1 0', minWidth: '180px' }}>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '6px' }}>Ảnh báo giá</div>
                    <div className="image-upload-zone" onClick={() => quoteFileRef.current?.click()}>
                      {quotePreviewUrl
                        ? <img src={quotePreviewUrl} alt="quote preview" className="upload-preview" />
                        : <div className="upload-placeholder"><Upload size={28} /><span>Click để chọn ảnh báo giá</span></div>
                      }
                    </div>
                    <input ref={quoteFileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleQuoteImageChange} />
                  </div>
                </div>

                <div className="nvl-form-grid">
                  <div className="input-group">
                    <label>Tên NVL <span className="required">*</span></label>
                    <input required value={form.nvl_name} onChange={e => setForm(f => ({ ...f, nvl_name: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label>Item Code</label>
                    <input value={form.nvl_item_code} onChange={e => setForm(f => ({ ...f, nvl_item_code: e.target.value }))} />
                  </div>
                  <div className="input-group" style={{ position: 'relative' }} ref={catDropdownRef}>
                    <label>Khu vực sử dụng</label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <input 
                        type="text"
                        className="settings-input"
                        placeholder={form.nvl_category || "Tìm & Chọn Khu Vực..."}
                        value={showCatDropdown ? catSearch : (form.nvl_category || '')}
                        onChange={e => {
                          if (!showCatDropdown) setShowCatDropdown(true);
                          setCatSearch(e.target.value);
                        }}
                        onFocus={() => {
                          setShowCatDropdown(true);
                          setCatSearch('');
                        }}
                        style={{ 
                          width: '100%', 
                          paddingRight: '30px',
                          textOverflow: 'ellipsis',
                          background: 'var(--bg-main)',
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '8px',
                          height: '38px',
                          fontSize: '14px'
                        }}
                      />
                      <ChevronDown 
                        size={16} 
                        style={{ 
                          position: 'absolute', 
                          right: '10px', 
                          color: 'var(--text-secondary)', 
                          pointerEvents: 'none' 
                        }} 
                      />
                    </div>
                    
                    {showCatDropdown && (
                      <div 
                        style={{ 
                          position: 'absolute', 
                          top: '100%', 
                          left: 0, 
                          right: 0, 
                          backgroundColor: 'var(--bg-main)', 
                          border: '1px solid var(--border-color)', 
                          borderRadius: '8px', 
                          marginTop: '4px', 
                          boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
                          zIndex: 10,
                          maxHeight: '200px',
                          overflowY: 'auto',
                          padding: '8px'
                        }}
                      >
                        {categories
                          .filter(cat => cat.toLowerCase().includes(catSearch.toLowerCase()))
                          .map(cat => {
                            const currentCats = form.nvl_category ? form.nvl_category.split(',').map(s => s.trim()).filter(Boolean) : [];
                            const isChecked = currentCats.includes(cat);
                            return (
                              <label 
                                key={cat} 
                                style={{ 
                                  display: 'flex', 
                                  alignItems: 'center', 
                                  gap: '8px', 
                                  padding: '6px 8px', 
                                  cursor: 'pointer',
                                  borderRadius: '4px',
                                  transition: 'background 0.2s',
                                  fontSize: '14px',
                                  color: 'var(--text-primary)'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = 'rgba(245, 78, 0, 0.05)'}
                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                              >
                                <input 
                                  type="checkbox" 
                                  checked={isChecked} 
                                  onChange={() => toggleCategory(cat)}
                                  style={{ cursor: 'pointer' }}
                                />
                                <span>{cat}</span>
                              </label>
                            );
                          })
                        }
                        {categories.filter(cat => cat.toLowerCase().includes(catSearch.toLowerCase())).length === 0 && (
                          <div style={{ padding: '8px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'center' }}>
                            Không tìm thấy khu vực nào
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="input-group">
                    <label>Nhà Cung Cấp</label>
                    <select
                      className="settings-select"
                      style={{ width: '100%' }}
                      value={form.vendor_id}
                      onChange={e => setForm(f => ({ ...f, vendor_id: e.target.value }))}
                      disabled={!form.nvl_category}
                    >
                      <option value="">
                        {form.nvl_category ? '-- Chọn Nhà Cung Cấp --' : '-- Chọn khu vực trước --'}
                      </option>
                      {getCommonVendorsForCats(form.nvl_category ? form.nvl_category.split(',').map(s => s.trim()).filter(Boolean) : [])
                        .map(v => (
                          <option key={v.id} value={v.id}>{v.vendor_name}</option>
                        ))
                      }
                    </select>
                  </div>

                  <div className="input-group" style={{ gridColumn: 'span 2', marginBottom: '-8px' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content' }}>
                      <input
                        type="checkbox"
                        className="custom-checkbox"
                        checked={form.nvl_is_date}
                        onChange={e => setForm(f => ({ ...f, nvl_is_date: e.target.checked }))}
                      />
                      <span style={{ fontSize: '14px', fontWeight: 500 }}>Sản phẩm có hạn sử dụng</span>
                    </label>
                  </div>

                  <div className="input-group">
                    <label style={{ color: form.nvl_is_date ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                      Ngày hết hạn {form.nvl_is_date && <span className="required">*</span>}
                    </label>
                    <input
                      type="date"
                      disabled={!form.nvl_is_date}
                      required={form.nvl_is_date}
                      value={form.nvl_exp}
                      onChange={e => setForm(f => ({ ...f, nvl_exp: e.target.value }))}
                    />
                  </div>

                  <div className="input-group">
                    <label>Giá tiền</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="number" min="0" step="any" style={{ flex: 1 }}
                        value={form.nvl_price}
                        onChange={e => setForm(f => ({ ...f, nvl_price: e.target.value }))}
                      />
                      <select
                        className="settings-select" style={{ width: '90px' }}
                        value={form.nvl_money_type}
                        onChange={e => setForm(f => ({ ...f, nvl_money_type: e.target.value }))}
                      >
                        <option value="VND">VND</option>
                        <option value="USD">USD</option>
                        <option value="YEN">YEN</option>
                      </select>
                    </div>
                  </div>

                  <div className="input-group">
                    <label>Đơn vị</label>
                    <input value={form.nvl_unit} placeholder="kg, cái, m..." onChange={e => setForm(f => ({ ...f, nvl_unit: e.target.value }))} />
                  </div>

                  {/* Leadtime giao hàng fixed to week */}
                  <div className="input-group">
                    <label>Leadtime giao hàng (Tuần)</label>
                    <div className="leadtime-input">
                      <input
                        type="number" min="0" step="any"
                        placeholder="Số tuần"
                        value={form.nvl_leadtime_value}
                        onChange={e => setForm(f => ({ ...f, nvl_leadtime_value: e.target.value }))}
                      />
                    </div>
                    {form.nvl_leadtime_value && (
                      <small style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                        = {toDays(form.nvl_leadtime_value)} ngày
                      </small>
                    )}
                  </div>

                  <div className="input-group">
                    <label>Stock</label>
                    <input type="number" min="0" step="any" value={form.nvl_stock} onChange={e => setForm(f => ({ ...f, nvl_stock: e.target.value }))} />
                  </div>
                  <div className="input-group" style={{ position: 'relative' }}>
                    <label>Alarm (Cảnh báo)</label>
                    <input type="number" min="0" step="any" value={form.nvl_alarm} onChange={e => setForm(f => ({ ...f, nvl_alarm: e.target.value }))} />
                  </div>
                  <div className="input-group">
                    <label>Min Order</label>
                    <input type="number" min="0" step="any" value={form.nvl_min_order} onChange={e => setForm(f => ({ ...f, nvl_min_order: e.target.value }))} />
                  </div>
                </div>

                <div className="input-group" style={{ marginTop: '12px' }}>
                  <label>Mô tả</label>
                  <textarea rows={3} value={form.nvl_description} onChange={e => setForm(f => ({ ...f, nvl_description: e.target.value }))} className="nvl-textarea" />
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" className="btn-secondary" onClick={closeAll}>Hủy</button>
                  <button type="submit" className="btn-primary">{isCreating ? 'Thêm mới' : 'Lưu thay đổi'}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* IMAGE ZOOM VIEWER */}
      {zoomImage && (
        <div
          className="zoom-overlay"
          onClick={() => { setZoomImage(null); setRotation(0); setScale(1); setPosition({ x: 0, y: 0 }); }}
          onMouseMove={(e) => {
            if (!isDragging) return;
            const dx = e.clientX - dragStart.x;
            const dy = e.clientY - dragStart.y;
            setPosition(prev => ({ x: prev.x + dx, y: prev.y + dy }));
            setDragStart({ x: e.clientX, y: e.clientY });
          }}
          onMouseUp={() => setIsDragging(false)}
          onMouseLeave={() => setIsDragging(false)}
        >
          <div className="zoom-toolbar" onClick={e => e.stopPropagation()}>
            <button className="zoom-btn" title="Phóng to" onClick={() => setScale(s => Math.min(s + 0.25, 4))}>
              <ZoomIn size={20} />
            </button>
            <button className="zoom-btn" title="Thu nhỏ" onClick={() => setScale(s => Math.max(s - 0.25, 0.5))}>
              <ZoomOut size={20} />
            </button>
            <button className="zoom-btn" title="Reset vị trí" onClick={() => { setScale(1); setPosition({ x: 0, y: 0 }); }}>
              <Package size={20} />
            </button>
            <div className="zoom-divider" />
            <button className="zoom-btn" title="Xoay ảnh" onClick={() => setRotation(r => (r + 90) % 360)}>
              <RotateCw size={20} />
              <span>Xoay</span>
            </button>
            <button className="zoom-btn" title="Tải xuống JPG" onClick={() => handleDownloadJpg(zoomImage, detail?.nvl_name)}>
              <Download size={20} />
              <span>Tải JPG</span>
            </button>
            <button className="zoom-btn close" onClick={() => { setZoomImage(null); setRotation(0); setScale(1); setPosition({ x: 0, y: 0 }); }}>
              <X size={20} />
            </button>
          </div>
          <div
            className="zoom-content"
            onWheel={(e) => {
              if (e.deltaY < 0) setScale(s => Math.min(s + 0.1, 4));
              else setScale(s => Math.max(s - 0.1, 0.5));
            }}
          >
            <img
              src={zoomImage}
              alt="Zoomed"
              draggable="false"
              style={{
                transform: `translate(${position.x}px, ${position.y}px) rotate(${rotation}deg) scale(${scale})`,
                cursor: isDragging ? 'grabbing' : (scale > 1 ? 'grab' : 'default')
              }}
              className="zoom-large-image"
              onMouseDown={(e) => {
                e.stopPropagation();
                setIsDragging(true);
                setDragStart({ x: e.clientX, y: e.clientY });
              }}
              onClick={e => e.stopPropagation()}
            />
          </div>
        </div>
      )}

      {/* STOCK CHART MODAL */}
      {chartItem && (
        <StockChartModal
          nvl={chartItem}
          onClose={() => setChartItem(null)}
        />
      )}

      {/* EXCEL IMPORT & CONFIG MODAL */}
      {isImporting && (
        <ExcelImportModal
          onClose={closeAll}
          onImportSuccess={fetchAll}
          toast={toast}
          headers={headers}
        />
      )}

      {tooltip.visible && (
        <div style={{
          position: 'fixed',
          top: tooltip.y,
          left: tooltip.x,
          transform: 'translate(-50%, -100%)',
          backgroundColor: 'rgba(38, 37, 30, 0.95)',
          color: '#f2f1ed',
          border: '1px solid rgba(245, 78, 0, 0.3)',
          padding: '6px 12px',
          borderRadius: '6px',
          fontSize: '13px',
          zIndex: 99999,
          pointerEvents: 'none',
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          whiteSpace: 'normal',
          maxWidth: '300px',
          wordBreak: 'break-word',
          fontFamily: 'var(--font-body)'
        }}>
          {tooltip.text}
        </div>
      )}
    </div>
  );
}

function ExcelImportModal({ onClose, onImportSuccess, toast, headers }) {
  const [activeTab, setActiveTab] = useState('import'); // 'import' | 'config'
  const [mapping, setMapping] = useState({
    nvl_name_cell: 'A2',
    nvl_item_code_cell: 'B2',
    nvl_price_cell: 'C2',
    nvl_money_type_cell: 'D2',
    nvl_unit_cell: 'E2',
    nvl_leadtime_cell: 'F2',
    nvl_stock_cell: 'G2',
    nvl_min_order_cell: 'H2',
    nvl_alarm_cell: 'I2',
    nvl_category_cell: 'J2',
    nvl_exp_cell: 'K2',
    vendor_name_cell: 'L2'
  });
  const [loading, setLoading] = useState(false);
  const [file, setFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef();

  useEffect(() => {
    fetchMapping();
  }, []);

  const fetchMapping = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/nvl/excel-mapping', { headers: headers() });
      if (res.ok) {
        const data = await res.json();
        if (data && data.id) {
          setMapping(data);
        }
      }
    } catch (e) {
      toast.error('Lỗi khi tải cấu hình Excel.');
    }
    setLoading(false);
  };

  const handleSaveMapping = async (e) => {
    e.preventDefault();

    // Validate cell coordinate format: e.g. A2, BC15
    const cellRegex = /^[a-zA-Z]{1,3}\d{1,7}$/;
    const keys = Object.keys(mapping).filter(k => k !== 'id' && k !== 'created_time' && k !== 'updated_time');
    for (const key of keys) {
      const val = mapping[key];
      if (val && !cellRegex.test(val.trim())) {
        toast.error(`Tọa độ ô "${val}" không hợp lệ (ví dụ đúng: A2, B3, AB10).`);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await fetch('/api/nvl/excel-mapping', {
        method: 'PUT',
        headers: {
          ...headers(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(mapping)
      });
      if (res.ok) {
        toast.success('Đã lưu cấu hình Excel thành công.');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Lỗi khi lưu cấu hình.');
      }
    } catch (e) {
      toast.error('Lỗi kết nối.');
    }
    setLoading(false);
  };

  const handleImport = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Vui lòng chọn file Excel.');
      return;
    }

    setImporting(true);
    const formData = new FormData();
    formData.append('excel_file', file);

    try {
      const res = await fetch('/api/nvl/import-excel', {
        method: 'POST',
        headers: headers(),
        body: formData
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Nhập Excel thành công!');
        onImportSuccess();
        onClose();
      } else {
        toast.error(data.message || 'Lỗi khi nhập Excel.');
      }
    } catch (e) {
      toast.error('Lỗi kết nối server.');
    }
    setImporting(false);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box excel-modal" style={{ maxWidth: '650px' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ background: 'var(--bg-sidebar)', padding: '6px', borderRadius: '8px', display: 'flex' }}>
              <Upload size={20} color="var(--color-accent)" />
            </div>
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 600 }}>Nhập dữ liệu từ Excel</h2>
          </div>
          <button className="action-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Tab Buttons */}
        <div className="excel-tabs" style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', margin: '0 24px', gap: '20px' }}>
          <button
            type="button"
            className={`excel-tab ${activeTab === 'import' ? 'active' : ''}`}
            onClick={() => setActiveTab('import')}
            style={{
              padding: '12px 4px',
              border: 'none',
              background: 'none',
              color: activeTab === 'import' ? 'var(--color-accent)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'import' ? '2px solid var(--color-accent)' : 'none',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Nhập file
          </button>
          <button
            type="button"
            className={`excel-tab ${activeTab === 'config' ? 'active' : ''}`}
            onClick={() => setActiveTab('config')}
            style={{
              padding: '12px 4px',
              border: 'none',
              background: 'none',
              color: activeTab === 'config' ? 'var(--color-accent)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'config' ? '2px solid var(--color-accent)' : 'none',
              fontWeight: 500,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Cấu hình ô dữ liệu
          </button>
        </div>

        <div className="modal-content" style={{ padding: '24px' }}>
          {activeTab === 'import' ? (
            <form onSubmit={handleImport} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div
                className="excel-drop-zone"
                onClick={() => fileInputRef.current.click()}
                style={{
                  border: '2px dashed var(--border-color)',
                  borderRadius: '12px',
                  padding: '40px 20px',
                  textAlign: 'center',
                  cursor: 'pointer',
                  backgroundColor: 'rgba(38, 37, 30, 0.02)',
                  transition: 'all 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.borderColor = 'var(--color-accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border-color)'}
              >
                <Upload size={36} style={{ color: 'var(--text-secondary)', marginBottom: '12px' }} />
                <p style={{ margin: '0 0 6px', fontWeight: 500 }}>
                  {file ? file.name : 'Click để chọn file Excel'}
                </p>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Hỗ trợ file .xlsx, .xls'}
                </span>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".xlsx, .xls"
                  style={{ display: 'none' }}
                  onChange={e => setFile(e.target.files[0])}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', fontSize: '13px', color: 'var(--text-secondary)', backgroundColor: 'var(--bg-sidebar)', padding: '12px', borderRadius: '8px' }}>
                <AlertTriangle size={18} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <div>
                  <strong>Lưu ý:</strong> Dữ liệu được đọc bắt đầu từ ô cấu hình theo chiều dọc đi xuống.
                  Mỗi dòng là đầy đủ 1 NVL. Trùng <code>Item Code</code> sẽ cập nhật bản ghi cũ.
                  Nhà cung cấp và khu vực phải khớp chính xác với hệ thống để được nhập.
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={onClose} disabled={importing}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={importing || !file}>
                  {importing ? 'Đang nhập...' : 'Bắt đầu nhập'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSaveMapping} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: '12px',
                maxHeight: '42vh',
                overflowY: 'auto',
                paddingRight: '6px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Tên NVL <span className="required">*</span></span>
                  <input
                    required
                    value={mapping.nvl_name_cell || ''}
                    placeholder="A2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_name_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Item Code</span>
                  <input
                    value={mapping.nvl_item_code_cell || ''}
                    placeholder="B2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_item_code_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Giá tiền</span>
                  <input
                    value={mapping.nvl_price_cell || ''}
                    placeholder="C2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_price_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Đơn vị tiền</span>
                  <input
                    value={mapping.nvl_money_type_cell || ''}
                    placeholder="D2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_money_type_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Đơn vị</span>
                  <input
                    value={mapping.nvl_unit_cell || ''}
                    placeholder="E2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_unit_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Leadtime (Tuần)</span>
                  <input
                    value={mapping.nvl_leadtime_cell || ''}
                    placeholder="F2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_leadtime_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Stock</span>
                  <input
                    value={mapping.nvl_stock_cell || ''}
                    placeholder="G2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_stock_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Min Order</span>
                  <input
                    value={mapping.nvl_min_order_cell || ''}
                    placeholder="H2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_min_order_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Alarm</span>
                  <input
                    value={mapping.nvl_alarm_cell || ''}
                    placeholder="I2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_alarm_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Khu vực sử dụng</span>
                  <input
                    value={mapping.nvl_category_cell || ''}
                    placeholder="J2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_category_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Hạn sử dụng (HSD)</span>
                  <input
                    value={mapping.nvl_exp_cell || ''}
                    placeholder="K2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, nvl_exp_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-sidebar)' }}>
                  <span style={{ fontSize: '13px', fontWeight: 500 }}>Nhà Cung Cấp</span>
                  <input
                    value={mapping.vendor_name_cell || ''}
                    placeholder="L2"
                    style={{ width: '64px', textAlign: 'center', textTransform: 'uppercase', padding: '6px 8px', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '13px', fontWeight: 'bold', backgroundColor: 'var(--bg-card)' }}
                    onChange={e => setMapping(m => ({ ...m, vendor_name_cell: e.target.value.toUpperCase() }))}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '10px' }}>
                <button type="button" className="btn-secondary" onClick={onClose} disabled={loading}>Hủy</button>
                <button type="submit" className="btn-primary" disabled={loading}>
                  {loading ? 'Đang lưu...' : 'Lưu cấu hình'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
