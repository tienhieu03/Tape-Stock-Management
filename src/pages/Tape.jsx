import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, X, Package, ZoomIn, Download, RotateCw, ZoomOut,
  Plus, Upload, Image as ImageIcon, Trash2, ShoppingCart,
  Edit2, AlertTriangle, ChevronDown, ChevronRight, Check, Layers, MoveRight, History,
  FileText
} from 'lucide-react';
import OptimizedImage from '../components/OptimizedImage';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import ColumnFilter from '../components/ColumnFilter';
import { usePermission } from '../context/PermissionContext';
import { io } from 'socket.io-client';
import { useResizableColumns } from '../hooks/useResizableColumns';
import * as XLSX from 'xlsx-js-style';

const API_BASE = '/api/tape';
const VENDOR_API = '/api/vendors';
const headers = () => ({ 'Authorization': `Bearer ${sessionStorage.getItem('token')}` });

const BATCH_STATUS_LABELS = { 
  'CURRENT': 'Lượng đang sử dụng',
  'NEXT': 'Lượng lưu trữ',
  'HISTORY': 'Đã dùng hết/Hết hạn'
};

const CATEGORIES = ['Keo', 'Flux', 'Solder'];
const CATEGORY_LABELS = {
  'Keo': 'ACF Bonding Tape',
  'Flux': 'Flux',
  'Solder': 'Solder'
};

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

const formatLeadtime = (days) => {
  if (!days) return '—';
  return `${days / 7} Tuần`;
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

const EMPTY_FORM = {
  itemcode: '', name: '', width: '', thickness: '', vendor_name: '',
  date_received: '', expiry: '', type: 'Hàng Mẫu', next_request_date: '',
  comment: '', purpose: '', batch_status: 'CURRENT', stock: '', alarm: 0, designFile: null, quotationFile: null, tdsFile: null,
  itemname: '', master_type: 'Keo',
  leadtime_value: '', mfg_date: '',
  price: '', money_type: 'VND',
  unit: 'Cuộn'
};

const isPdfFile = (src, fileObj) => {
  if (fileObj && fileObj.type === 'application/pdf') return true;
  if (typeof src === 'string' && src.toLowerCase().endsWith('.pdf')) return true;
  return false;
};

const isExpiryAlarm = (expiry) => {
  if (!expiry) return false;
  const expDate = new Date(expiry);
  const now = new Date();
  return expDate.getTime() - now.getTime() <= 60 * 24 * 60 * 60 * 1000;
};

export default function TapePage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const navigate = useNavigate();
  const { hasPermission, isAdmin } = usePermission();

  const [items, setItems] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [filters, setFilters] = useState({});
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(false);

  const [detail, setDetail] = useState(null);
  const [editItem, setEditItem] = useState(null);
  const [editBatch, setEditBatch] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [addingBatchMasterId, setAddingBatchMasterId] = useState(null);
  const [collapsedCategories, setCollapsedCategories] = useState({
    'Keo': false,
    'Flux': false,
    'Solder': false
  });

  const toggleCategoryCollapse = (category, e) => {
    e.stopPropagation();
    setCollapsedCategories(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const [form, setForm] = useState(EMPTY_FORM);
  const [previews, setPreviews] = useState({ design: null, quotation: null, tds: null });
  const [newItemname, setNewItemname] = useState('');
  const [designSlots, setDesignSlots] = useState([{ id: 'slot-0', file: null, preview: null, existingPath: null }]);

  const handleAddDesignSlot = () => {
    const newId = `slot-${Date.now()}-${Math.round(Math.random() * 1E6)}`;
    setDesignSlots(prev => [...prev, { id: newId, file: null, preview: null, existingPath: null }]);
  };

  const handleRemoveDesignSlot = (id) => {
    setDesignSlots(prev => {
      if (prev.length === 1) {
        return [{ id: 'slot-0', file: null, preview: null, existingPath: null }];
      }
      return prev.filter(s => s.id !== id);
    });
  };

  const handleSlotFileChange = (id, e) => {
    const file = e.target.files[0];
    if (!file) return;
    setDesignSlots(prev => prev.map(s => s.id === id ? { ...s, file, preview: URL.createObjectURL(file), existingPath: null } : s));
  };

  const [zoomImage, setZoomImage] = useState(null);
  const [rotation, setRotation] = useState(0);
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const designFileRef = useRef();
  const quotationFileRef = useRef();
  const tdsFileRef = useRef();

  // Resizable columns: [checkbox, stt, itemname, itemcode, name, price, unit, batchStatus, stock, alarm, leadtime, width, thickness, vendor, design, mfgDate, dateReceived, expiry, type, nextRequest, quotation, tds]
  const { widths: colWidths, startResize } = useResizableColumns([36, 50, 130, 160, 170, 120, 80, 130, 80, 80, 100, 90, 110, 120, 100, 120, 140, 120, 110, 150, 100, 100]);

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

  const fetchAll = async () => {
    if (!hasPermission('tape.view')) return;
    setLoading(true);
    try {
      const res = await fetch(API_BASE, { headers: headers() });
      if (res.status === 403) {
        toast.error('Bạn không có quyền xem danh sách keo.');
        setItems([]);
        return;
      }
      const data = await res.json();
      const getSeverity = (item) => {
        if (item.alarm && item.alarm > 0 && item.stock <= item.alarm) return 3;
        if (isExpiryAlarm(item.expiry)) return 3;
        return 0;
      };
      const sortedData = (Array.isArray(data) ? data : []).sort((a, b) => {
        const sevA = getSeverity(a);
        const sevB = getSeverity(b);
        if (sevB !== sevA) return sevB - sevA;
        return (a.name || '').localeCompare(b.name || '');
      });
      const itemsWithDisplay = sortedData.map(item => ({
        ...item,
        leadtime_display: formatLeadtime(item.leadtime)
      }));
      setItems(itemsWithDisplay);
    } catch (e) {
      toast.error('Lỗi kết nối backend.');
    }
    setLoading(false);
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch(VENDOR_API, { headers: headers() });
      const data = await res.json();
      setVendors(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Failed to fetch vendors');
    }
  };

  useEffect(() => {
    fetchAll();
    fetchVendors();
  }, [hasPermission]);

  // Real-time update listener
  useEffect(() => {
    const socket = io(window.location.protocol + "//" + window.location.hostname + ":1908");
    socket.on('data-update', (data) => {
      if (data.type === 'tape') {
        fetchAll();
      }
    });
    return () => socket.disconnect();
  }, []);

  // Sync open detail modal with updated list items
  useEffect(() => {
    if (detail) {
      const latest = items.find(i => i.id === detail.id);
      if (latest) {
        setDetail(latest);
      }
    }
  }, [items, detail?.id]);

  // ESC key listener
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') closeAll();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    let result = items;

    if (search) {
      const s = search.toLowerCase();
      result = result.filter(i =>
        (i.itemcode || '').toLowerCase().includes(s) ||
        (i.name || '').toLowerCase().includes(s) ||
        (i.vendor || '').toLowerCase().includes(s) ||
        (i.type || '').toLowerCase().includes(s) ||
        (i.itemname || '').toLowerCase().includes(s) ||
        (i.leadtime_display || '').toLowerCase().includes(s) ||
        (i.unit || '').toLowerCase().includes(s) ||
        (i.mfg_date || '').toLowerCase().includes(s)
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

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setPreviews({ design: null, quotation: null, tds: null });
    setDesignSlots([{ id: 'slot-0', file: null, preview: null, existingPath: null }]);
    setIsCreating(true);
    setEditItem(null);
    setDetail(null);
    fetchVendors();
  };

  const openEdit = (item, e) => {
    e?.stopPropagation();
    const lt = fromDays(item.leadtime);
    setForm({
      itemcode: item.itemcode || '',
      name: item.name || '',
      width: item.width || '',
      thickness: item.thickness || '',
      vendor_name: item.vendor || '',
      comment: item.comment || '',
      purpose: item.purpose || '',
      alarm: item.alarm ?? 0,
      itemname: item.itemname || '',
      master_type: item.master_type || 'Keo',
      leadtime_value: lt.value,
      price: item.price ?? '',
      money_type: item.money_type || 'VND',
      unit: item.unit || 'Cuộn',
      mfg_date: item.mfg_date || '',
      date_received: item.date_received || '',
      expiry: item.expiry || '',
      type: item.type || 'Hàng Mẫu',
      next_request_date: item.next_request_date || '',
      batch_status: item.batch_status || 'CURRENT',
      stock: item.stock ?? '',
      designFile: null,
      quotationFile: null,
      tdsFile: null
    });
    if (item.design) {
      const paths = item.design.split(',').map(s => s.trim()).filter(Boolean);
      setDesignSlots(paths.map((p, idx) => ({
        id: `slot-existing-${idx}`,
        file: null,
        preview: p,
        existingPath: p
      })));
    } else {
      setDesignSlots([{ id: 'slot-0', file: null, preview: null, existingPath: null }]);
    }
    setPreviews({ design: item.design, quotation: item.quotation_image_path, tds: item.tds_file_path });
    setEditItem(item);
    setIsCreating(false);
    fetchVendors();
  };

  const openEditBatch = (batch, e) => {
    e?.stopPropagation();
    setForm({
      mfg_date: batch.mfg_date || '',
      date_received: batch.received_date || '',
      expiry: batch.expiry || '',
      type: batch.type || 'Hàng Mẫu',
      next_request_date: batch.next_request_date || '',
      batch_status: batch.batch_status || 'CURRENT',
      stock: batch.stock ?? '',
    });
    setEditBatch(batch);
    setEditItem(null);
    setIsCreating(false);
  };

  const openAddBatch = (masterItem) => {
    setForm({
      mfg_date: '',
      date_received: '',
      expiry: '',
      type: 'Hàng Mẫu',
      next_request_date: '',
      batch_status: 'NEXT',
      stock: '',
    });
    setAddingBatchMasterId(masterItem.id);
    setEditItem(null);
    setEditBatch(null);
    setIsCreating(false);
  };

  const openDetail = (item) => {
    setDetail(item);
  };

  const closeForm = () => {
    setIsCreating(false);
    setEditItem(null);
    setEditBatch(null);
    setAddingBatchMasterId(null);
    setPreviews({ design: null, quotation: null, tds: null });
    setDesignSlots([{ id: 'slot-0', file: null, preview: null, existingPath: null }]);
  };

  const closeAll = () => {
    setIsCreating(false);
    setEditItem(null);
    setEditBatch(null);
    setAddingBatchMasterId(null);
    setDetail(null);
    setIsHistoryOpen(false);
    setZoomImage(null);
    setRotation(0);
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleFileChange = (e, type) => {
    const file = e.target.files[0];
    if (!file) return;

    if (type === 'quotation') {
      setForm(f => ({ ...f, quotationFile: file }));
      setPreviews(p => ({ ...p, quotation: URL.createObjectURL(file) }));
    } else if (type === 'tds') {
      setForm(f => ({ ...f, tdsFile: file }));
      setPreviews(p => ({ ...p, tds: URL.createObjectURL(file) }));
    }
  };

  const itemnames = form.itemname ? form.itemname.split(',').map(s => s.trim()).filter(Boolean) : [];

  const handleNewItemnameChange = (e) => {
    const val = e.target.value;
    const separators = /[,.\s]+/;
    if (separators.test(val)) {
      const parts = val.split(separators).map(p => p.trim()).filter(Boolean);
      if (parts.length > 0) {
        const updated = [...itemnames, ...parts];
        setForm(f => ({ ...f, itemname: updated.join(', ') }));
      }
      setNewItemname('');
    } else {
      setNewItemname(val);
    }
  };

  const handleNewItemnameKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (newItemname.trim()) {
        const parts = newItemname.split(/[,.\s]+/).map(p => p.trim()).filter(Boolean);
        const updated = [...itemnames, ...parts];
        setForm(f => ({ ...f, itemname: updated.join(', ') }));
      }
      setNewItemname('');
    } else if (e.key === 'Backspace' && !newItemname && itemnames.length > 0) {
      const updated = itemnames.slice(0, -1);
      setForm(f => ({ ...f, itemname: updated.join(', ') }));
    }
  };

  const handleBlurNewItemname = () => {
    if (newItemname.trim()) {
      const parts = newItemname.split(/[,.\s]+/).map(p => p.trim()).filter(Boolean);
      const updated = [...itemnames, ...parts];
      setForm(f => ({ ...f, itemname: updated.join(', ') }));
      setNewItemname('');
    }
  };

  const handleRemoveItemname = (indexToRemove) => {
    const updated = itemnames.filter((_, idx) => idx !== indexToRemove);
    setForm(f => ({ ...f, itemname: updated.join(', ') }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    let url = isCreating ? API_BASE : `${API_BASE}/${editItem?.id}`;
    let method = isCreating ? 'POST' : 'PUT';
    let body;
    let headersConfig = { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` };

    if (editBatch) {
      url = `${API_BASE}/batch/${editBatch.id}`;
      method = 'PUT';
      body = JSON.stringify({
        mfg_date: form.mfg_date,
        received_date: form.date_received,
        expiry: form.expiry,
        type: form.type,
        next_request_date: form.next_request_date,
        batch_status: form.batch_status,
        stock: form.stock
      });
      headersConfig['Content-Type'] = 'application/json';
    } else if (addingBatchMasterId) {
      url = `${API_BASE}/batch`;
      method = 'POST';
      body = JSON.stringify({
        bonding_tape_master_id: addingBatchMasterId,
        mfg_date: form.mfg_date,
        received_date: form.date_received,
        expiry: form.expiry,
        type: form.type,
        next_request_date: form.next_request_date,
        batch_status: form.batch_status,
        stock: form.stock
      });
      headersConfig['Content-Type'] = 'application/json';
    } else {
      const formData = new FormData();
      Object.keys(form).forEach(key => {
        if (key === 'designFile') {
          // Skip
        } else if (key === 'quotationFile') {
          if (form.quotationFile) formData.append('quotation', form.quotationFile);
        } else if (key === 'tdsFile') {
          if (form.tdsFile) formData.append('tds', form.tdsFile);
        } else if (key === 'leadtime_value') {
          formData.append('leadtime', toDays(form.leadtime_value));
        } else {
          formData.append(key, form[key]);
        }
      });
      designSlots.forEach(slot => {
        if (slot.file) {
          formData.append('design', slot.file);
        }
      });
      const keptExisting = designSlots.map(s => s.existingPath).filter(Boolean);
      formData.append('existingDesigns', keptExisting.join(','));
      body = formData;
    }

    try {
      const res = await fetch(url, {
        method: method,
        headers: headersConfig,
        body: body
      });
      if (res.ok) {
        toast.success(isCreating ? 'Thêm keo mới thành công.' : (addingBatchMasterId ? 'Thêm lượng keo mới thành công.' : 'Cập nhật thành công.'));
        fetchAll();
        closeForm();
        if (detail) {
          const updated = items.find(i => i.id === detail.id);
          if (updated) setDetail(updated);
        }
      } else {
        const data = await res.json();
        toast.error(data.message || 'Lỗi khi lưu.');
      }
    } catch {
      toast.error('Lỗi kết nối server.');
    }
  };

  const handleBatchDelete = async (batchId, e) => {
    e?.stopPropagation();
    confirm({
      title: 'Xóa Lô Keo',
      message: 'Bạn có chắc chắn muốn xóa lô này? Hành động này không thể hoàn tác.',
      type: 'danger',
      onConfirm: async () => {
        const res = await fetch(`${API_BASE}/batch/${batchId}`, { method: 'DELETE', headers: headers() });
        if (res.ok) {
          toast.success('Đã xóa lô thành công.');
          fetchAll();
          // If master has only one batch left after refresh, or we just want to close detail
          setDetail(null);
        } else {
          const err = await res.json();
          toast.error(err.message || 'Lỗi khi xóa lô.');
        }
      }
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    confirm({
      title: 'Xóa Hàng Loạt',
      message: `Bạn có chắc chắn muốn xóa ${selected.size} mục đã chọn?`,
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
            toast.success(`Đã xóa ${selected.size} mục.`);
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

    // selected contains master_ids, but backend expects tape_batch_ids
    const batch_ids = [];
    selected.forEach(masterId => {
      const item = items.find(i => i.id === masterId);
      if (item && item.batch_id) {
        batch_ids.push(item.batch_id);
      }
    });

    if (batch_ids.length === 0) {
      toast.error('Không tìm thấy lô keo tương ứng.');
      return;
    }

    // Not using setLoading(true) to avoid list jumping
    try {
      const res = await fetch('/api/po/auto-create-tape', {
        method: 'POST',
        headers: { ...headers(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tape_batch_ids: batch_ids })
      });

      if (res.ok) {
        toast.success('Đã tạo các đơn PO nháp cho Keo.');
        setSelected(new Set()); // Uncheck items
        // No redirection as per user request
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
    if (selected.size === filtered.length && filtered.length > 0) setSelected(new Set());
    else setSelected(new Set(filtered.map(i => i.id)));
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
      link.download = `${fileName || 'image'}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Đang tải ảnh xuống (JPG)...');
    } catch (e) {
      console.error(e);
      toast.error('Không thể tải ảnh xuống.');
    }
  };

  const handleQuotationClick = (path) => {
    if (!path) return;
    if (path.toLowerCase().endsWith('.pdf')) {
      const fileUrl = window.location.origin + path;

      // Download file to machine
      const link = document.createElement('a');
      link.href = fileUrl;
      link.download = path.split('/').pop();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      setZoomImage(path);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'CURRENT': return 'var(--color-success)';
      case 'NEXT': return 'var(--color-warning)';
      case 'HISTORY': return 'var(--text-secondary)';
      default: return 'inherit';
    }
  };

  const getRowWarningClass = (item) => {
    if (item.alarm && item.alarm > 0 && item.stock <= item.alarm) return 'row-warning-red';
    if (isExpiryAlarm(item.expiry)) return 'row-warning-yellow';
    return '';
  };

  const handleExportExcel = () => {
    try {
      const sortedForExport = [...filtered].sort((a, b) => {
        const order = { 'Keo': 1, 'Flux': 2, 'Solder': 3 };
        const orderA = order[a.master_type] || 99;
        const orderB = order[b.master_type] || 99;
        return orderA - orderB;
      });

      const exportData = sortedForExport.map((item, idx) => ({
        'STT': idx + 1,
        'Phân loại': CATEGORY_LABELS[item.master_type] || item.master_type || 'ACF Bonding Tape',
        'Tên mặt hàng (Itemname)': item.itemname || '—',
        'Mã hàng (Itemcode)': item.itemcode || '—',
        'Tên keo': item.name || '—',
        'Giá tiền': item.price ?? 0,
        'Đơn vị tiền': item.money_type || 'VND',
        'Đơn vị': item.unit || 'Cuộn',
        'Trạng thái lô': BATCH_STATUS_LABELS[item.batch_status] || item.batch_status || '—',
        'Stock': item.stock ?? 0,
        'Alarm': item.alarm ?? 0,
        'Leadtime giao hàng': formatLeadtime(item.leadtime),
        'Width (mm)': item.width || '—',
        'Thickness (um)': item.thickness || '—',
        'Vendor': item.vendor || '—',
        'Ngày sản xuất': item.mfg_date || '—',
        'Ngày nhận sản phẩm': item.date_received || '—',
        'Ngày hết hạn': item.expiry || '—',
        'Loại': item.type || '—',
        'Ngày request tiếp theo': item.next_request_date || '—'
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
      XLSX.utils.book_append_sheet(wb, ws, "ACF Tape - Flux - Solder");
      XLSX.writeFile(wb, "Danh_sach_Keo_Flux_Solder.xlsx");
      toast.success("Xuất file Excel thành công!");
    } catch (err) {
      console.error(err);
      toast.error("Không thể xuất file Excel.");
    }
  };

  if (!hasPermission('tape.view')) {
    return (
      <div className="empty-state-container">
        <AlertTriangle size={48} color="var(--color-warning)" />
        <h2>Truy cập bị từ chối</h2>
        <p>Bạn không có quyền xem trang này. Vui lòng liên hệ Admin.</p>
      </div>
    );
  }

  return (
    <div className="nvl-page">
      <div className="nvl-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
            <Layers size={24} color="var(--color-accent)" />
          </div>
          <h1 className="home-title" style={{ margin: 0 }}>Quản lý Bonding ACF Tape - Flux - Solder</h1>
        </div>
        <div className="nvl-header-actions">
          <div style={{ display: 'flex', gap: '12px' }}>
            {hasPermission('tape.delete') && (
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
          {hasPermission('tape.history') && (
            <button className="btn-secondary" onClick={() => setIsHistoryOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <History size={18} /> Lịch sử / Đã hết
            </button>
          )}
          <button className="btn-secondary" style={{ display: 'flex', alignItems: 'center', gap: '8px' }} onClick={handleExportExcel}>
            <Download size={18} /> Xuất Excel
          </button>
          {hasPermission('tape.create') && (
            <button className="btn-primary" onClick={openCreate}>
              <Plus size={18} /> Thêm keo
            </button>
          )}
        </div>
      </div>

      <div className="nvl-toolbar">
        <div className="search-box">
          <Search size={16} style={{ color: 'var(--text-secondary)' }} />
          <input
            type="text"
            placeholder="Tìm kiếm theo mã hàng, tên, vendor, loại..."
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
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginLeft: '4px', borderLeft: '1px solid var(--border-color)', paddingLeft: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                backgroundColor: 'var(--bg-warning-red)',
                border: '1px solid var(--border-color)',
                borderRadius: '3px'
              }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Stock thấp</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{
                display: 'inline-block',
                width: '12px',
                height: '12px',
                backgroundColor: 'var(--bg-warning-yellow)',
                border: '1px solid var(--border-color)',
                borderRadius: '3px'
              }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Sắp hết HSD</span>
            </div>
          </div>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        .tape-detail-container {
          display: flex;
          align-items: stretch;
          gap: 20px;
          margin-top: 20px;
          position: relative;
        }
        .tape-detail-panel {
          flex: 1;
          background: var(--bg-sidebar);
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.05);
        }
        .tape-detail-arrow {
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--color-accent);
          background: var(--bg-main);
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 1px solid var(--border-color);
          align-self: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          z-index: 2;
        }
        .batch-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .batch-title {
          font-size: 14px;
          font-weight: 600;
          margin-bottom: 4px;
          color: var(--text-primary);
        }
      `}} />

      <div className="nvl-table-wrap">
        <table className="nvl-table">
          <colgroup>
            {colWidths.map((w, i) => <col key={i} style={{ width: w }} />)}
          </colgroup>
          <thead>
            <tr>
              <th>
                <div className="col-filter-trigger" style={{ justifyContent: 'center', cursor: 'default', padding: '12px 8px' }}>
                  <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
                </div>
                <div className="col-resize-handle" onMouseDown={e => startResize(0, e)} />
              </th>
              <th>
                <div className="col-filter-trigger" style={{ cursor: 'default', padding: '12px 10px' }}>STT</div>
                <div className="col-resize-handle" onMouseDown={e => startResize(1, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="itemname" items={items} filters={filters} setFilters={setFilters}>
                  Tên mặt hàng (Itemname)
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(2, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="itemcode" items={items} filters={filters} setFilters={setFilters}>
                  Mã hàng (Itemcode)
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(3, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="name" items={items} filters={filters} setFilters={setFilters}>
                  Tên keo
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(4, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="price" items={items} filters={filters} setFilters={setFilters}>
                  Giá tiền
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(5, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="unit" items={items} filters={filters} setFilters={setFilters}>
                  Đơn vị
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(6, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="batch_status" items={items} filters={filters} setFilters={setFilters}>
                  Trạng thái lô
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(7, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="stock" items={items} filters={filters} setFilters={setFilters}>
                  Stock
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(8, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="alarm" items={items} filters={filters} setFilters={setFilters}>
                  Alarm
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(9, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="leadtime_display" items={items} filters={filters} setFilters={setFilters}>
                  Leadtime giao hàng
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(10, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="width" items={items} filters={filters} setFilters={setFilters}>
                  Width (mm)
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(11, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="thickness" items={items} filters={filters} setFilters={setFilters}>
                  Thickness (um)
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(12, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="vendor" items={items} filters={filters} setFilters={setFilters}>
                  Vendor
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(13, e)} />
              </th>
              <th>
                <div className="col-filter-trigger" style={{ cursor: 'default' }}>Bản vẽ/Hình ảnh keo</div>
                <div className="col-resize-handle" onMouseDown={e => startResize(14, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="mfg_date" items={items} filters={filters} setFilters={setFilters}>
                  Ngày sản xuất
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(15, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="date_received" items={items} filters={filters} setFilters={setFilters}>
                  Ngày nhận sản phẩm
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(16, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="expiry" items={items} filters={filters} setFilters={setFilters}>
                  Ngày hết hạn
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(17, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="type" items={items} filters={filters} setFilters={setFilters}>
                  Loại
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(18, e)} />
              </th>
              <th>
                <ColumnFilter columnKey="next_request_date" items={items} filters={filters} setFilters={setFilters}>
                  Ngày request tiếp theo
                </ColumnFilter>
                <div className="col-resize-handle" onMouseDown={e => startResize(19, e)} />
              </th>
              <th>
                <div className="col-filter-trigger" style={{ cursor: 'default' }}>Báo giá</div>
                <div className="col-resize-handle" onMouseDown={e => startResize(20, e)} />
              </th>
              <th>
                <div className="col-filter-trigger" style={{ cursor: 'default' }}>TDS</div>
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={22} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Đang tải...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={22} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                <Package size={40} style={{ marginBottom: '10px', opacity: 0.3, display: 'block', margin: '0 auto 10px' }} />
                Chưa có dữ liệu
              </td></tr>
            )}
            {!loading && filtered.length > 0 && CATEGORIES.map(cat => {
              const catItems = filtered.filter(i => (i.master_type || 'Keo') === cat);
              const isCollapsed = collapsedCategories[cat];

              return (
                <React.Fragment key={cat}>
                  <tr
                    className="category-header-row"
                    onClick={(e) => toggleCategoryCollapse(cat, e)}
                    style={{
                      backgroundColor: 'var(--bg-sidebar)',
                      cursor: 'pointer',
                      userSelect: 'none',
                      borderBottom: '1px solid var(--border-color)',
                      borderTop: '1px solid var(--border-color)'
                    }}
                  >
                    <td colSpan={22} style={{ padding: '10px 16px', fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                        <span>{CATEGORY_LABELS[cat] || cat}</span>
                        <span className="role-badge user" style={{ fontSize: '11px', textTransform: 'none', padding: '1px 6px', fontWeight: 'normal' }}>
                          {catItems.length} mục
                        </span>
                      </div>
                    </td>
                  </tr>

                  {!isCollapsed && catItems.map((item, idx) => (
                    <tr key={item.id} className={`nvl-row ${selected.has(item.id) ? 'selected' : ''} ${getRowWarningClass(item)}`} onClick={() => openDetail(item)}>
                      <td onClick={e => toggleSelect(item.id, e)}>
                        <input type="checkbox" checked={selected.has(item.id)} onChange={() => { }} />
                      </td>
                      <td>{idx + 1}</td>
                      <td onMouseEnter={e => showTooltip(item.itemname, e)} onMouseLeave={hideTooltip}>
                        {item.itemname ? (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {item.itemname.split(',').map((name, idx) => (
                              <span key={idx} className="role-badge user" style={{ textTransform: 'none', fontSize: '11px', padding: '1px 6px' }}>
                                {name.trim()}
                              </span>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                      <td onMouseEnter={e => showTooltip(item.itemcode, e)} onMouseLeave={hideTooltip}><strong>{item.itemcode || '—'}</strong></td>
                      <td onMouseEnter={e => showTooltip(item.name, e)} onMouseLeave={hideTooltip}>{item.name || '—'}</td>
                      <td>{formatPrice(item.price, item.money_type)}</td>
                      <td>{item.unit || 'Cuộn'}</td>
                      <td onMouseEnter={e => showTooltip(BATCH_STATUS_LABELS[item.batch_status] || item.batch_status, e)} onMouseLeave={hideTooltip}>
                        <span style={{ fontWeight: 500, color: getStatusColor(item.batch_status) }}>
                          {BATCH_STATUS_LABELS[item.batch_status] || item.batch_status}
                        </span>
                      </td>
                      <td>
                        <strong style={{ color: (item.stock <= item.alarm) ? 'var(--color-error)' : 'inherit' }}>
                          {item.stock ?? 0}
                        </strong>
                      </td>
                      <td>{item.alarm ?? 0}</td>
                      <td onMouseEnter={e => showTooltip(item.leadtime ? `${item.leadtime_display || formatLeadtime(item.leadtime)} (= ${item.leadtime} ngày)` : '', e)} onMouseLeave={hideTooltip}>
                        {item.leadtime_display || formatLeadtime(item.leadtime)}
                      </td>
                      <td>{item.width || '—'}</td>
                      <td>{item.thickness || '—'}</td>
                      <td onMouseEnter={e => showTooltip(item.vendor, e)} onMouseLeave={hideTooltip}>{item.vendor || '—'}</td>
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {item.design ? (
                          <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', flexWrap: 'wrap' }}>
                            {item.design.split(',').map((imgUrl, i) => (
                              <button key={i} className="action-btn" onClick={() => setZoomImage(imgUrl.trim())}>
                                <OptimizedImage src={imgUrl.trim()} alt={`Design ${i + 1}`} className="nvl-thumb" />
                              </button>
                            ))}
                          </div>
                        ) : '—'}
                      </td>
                      <td onMouseEnter={e => showTooltip(item.mfg_date, e)} onMouseLeave={hideTooltip}>{item.mfg_date || '—'}</td>
                      <td onMouseEnter={e => showTooltip(item.date_received, e)} onMouseLeave={hideTooltip}>{item.date_received || '—'}</td>
                      <td onMouseEnter={e => showTooltip(item.expiry, e)} onMouseLeave={hideTooltip}>
                        <span style={{ color: isExpiryAlarm(item.expiry) ? 'var(--color-warning)' : 'inherit', fontWeight: isExpiryAlarm(item.expiry) ? 600 : 'normal' }}>
                          {item.expiry || '—'}
                        </span>
                      </td>
                      <td onMouseEnter={e => showTooltip(item.type, e)} onMouseLeave={hideTooltip}>{item.type || '—'}</td>
                      <td onMouseEnter={e => showTooltip(item.next_request_date, e)} onMouseLeave={hideTooltip}>{item.next_request_date || '—'}</td>
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {item.quotation_image_path ? (
                          item.quotation_image_path.toLowerCase().endsWith('.pdf') ? (
                            <button className="action-btn pdf-btn" onClick={() => handleQuotationClick(item.quotation_image_path)} title="Tải xuống và mở PDF Báo giá">
                              <div className="pdf-thumb-fallback" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', background: 'rgba(245, 78, 0, 0.05)', border: '1px solid rgba(245, 78, 0, 0.2)', borderRadius: '6px' }}>
                                <FileText size={20} color="var(--color-error)" />
                                <span style={{ fontSize: '8px', fontWeight: 600, color: 'var(--color-error)' }}>PDF</span>
                              </div>
                            </button>
                          ) : (
                            <button className="action-btn" onClick={() => handleQuotationClick(item.quotation_image_path)}>
                              <OptimizedImage src={item.quotation_image_path} alt="Quotation" className="nvl-thumb" />
                            </button>
                          )
                        ) : '—'}
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        {item.tds_file_path ? (
                          item.tds_file_path.toLowerCase().endsWith('.pdf') ? (
                            <button className="action-btn pdf-btn" onClick={() => handleQuotationClick(item.tds_file_path)} title="Tải xuống và mở PDF TDS">
                              <div className="pdf-thumb-fallback" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '40px', height: '40px', background: 'rgba(245, 78, 0, 0.05)', border: '1px solid rgba(245, 78, 0, 0.2)', borderRadius: '6px' }}>
                                <FileText size={20} color="var(--color-error)" />
                                <span style={{ fontSize: '8px', fontWeight: 600, color: 'var(--color-error)' }}>TDS</span>
                              </div>
                            </button>
                          ) : (
                            <button className="action-btn" onClick={() => handleQuotationClick(item.tds_file_path)}>
                              <OptimizedImage src={item.tds_file_path} alt="TDS" className="nvl-thumb" />
                            </button>
                          )
                        ) : '—'}
                      </td>
                    </tr>
                  ))}

                  {!isCollapsed && catItems.length === 0 && (
                    <tr>
                      <td colSpan={22} style={{ textAlign: 'center', padding: '16px', color: 'var(--text-secondary)', fontSize: '13px', background: 'rgba(38, 37, 30, 0.02)' }}>
                        Không có dữ liệu cho hạng mục {CATEGORY_LABELS[cat] || cat}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* DETAIL POPUP */}
      {detail && (
        <div className="modal-overlay" onClick={closeAll}>
          <div className="modal-box" style={{ maxWidth: detail.batches?.length > 1 ? '1000px' : '600px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px' }}>
                  <Layers size={20} color="var(--color-accent)" />
                </div>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <div>
                    <h2 style={{ margin: 0 }}>{detail.name}</h2>
                    <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>{detail.vendor || 'Không rõ Vendor'}</p>
                  </div>
                  {getRowWarningClass(detail) && (
                    <AlertTriangle size={18} className="toast-icon warning" style={{ marginLeft: '12px' }} />
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {hasPermission('tape.edit') && (
                  <button className="action-btn edit" title="Sửa thông tin chung" onClick={e => openEdit(detail, e)}><Edit2 size={16} /></button>
                )}
                {hasPermission('tape.delete') && (
                  <button className="action-btn delete" title="Xóa toàn bộ" onClick={e => handleDelete(detail.id, e)}><Trash2 size={16} /></button>
                )}
                <button className="action-btn" onClick={closeAll}><X size={16} /></button>
              </div>
            </div>

            <div className="modal-content" style={{ padding: '24px' }}>
              {/* MASTER INFO (COMMON) */}
              <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <div style={{ flex: 1 }}>
                    <div className="detail-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                      <div className="detail-item"><span>Mã hàng</span><strong style={{ wordBreak: 'break-all', whiteSpace: 'normal' }}>{detail.itemcode || '—'}</strong></div>
                      <div className="detail-item" style={{ gridColumn: 'span 2' }}>
                        <span>Tên mặt hàng (Itemname)</span>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                          {detail.itemname ? detail.itemname.split(',').map((name, idx) => (
                            <span key={idx} className="role-badge user" style={{ textTransform: 'none', fontSize: '11px', padding: '2px 8px' }}>
                              {name.trim()}
                            </span>
                          )) : '—'}
                        </div>
                      </div>
                      <div className="detail-item"><span>Tên keo</span><strong>{detail.name || '—'}</strong></div>
                      <div className="detail-item"><span>Phân loại</span><strong>{CATEGORY_LABELS[detail.master_type] || detail.master_type || 'ACF Bonding Tape'}</strong></div>
                      <div className="detail-item"><span>Giá tiền</span><strong>{formatPrice(detail.price, detail.money_type)}</strong></div>
                      <div className="detail-item"><span>Đơn vị</span><strong>{detail.unit || 'Cuộn'}</strong></div>
                      <div className="detail-item"><span>Width</span><strong>{detail.width ? `${detail.width} mm` : '—'}</strong></div>
                      <div className="detail-item"><span>Thickness</span><strong>{detail.thickness ? `${detail.thickness} um` : '—'}</strong></div>
                      <div className="detail-item"><span>Vendor</span><strong>{detail.vendor || '—'}</strong></div>
                      <div className="detail-item"><span>Alarm</span><strong>{detail.alarm ?? 0}</strong></div>
                      <div className="detail-item">
                        <span>Leadtime giao hàng</span>
                        <strong>{formatLeadtime(detail.leadtime)} {detail.leadtime ? `(= ${detail.leadtime} ngày)` : ''}</strong>
                      </div>
                    </div>
                    {(detail.comment || detail.purpose) && (
                      <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        {detail.purpose && <div><span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Mục đích:</span> <p style={{ margin: '4px 0 0 0', fontSize: '14px', lineHeight: 1.5 }}>{detail.purpose}</p></div>}
                        {detail.comment && <div><span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>Ghi chú:</span> <p style={{ margin: '4px 0 0 0', fontSize: '14px', lineHeight: 1.5 }}>{detail.comment}</p></div>}
                      </div>
                    )}
                  </div>

                  {/* COMMON IMAGES */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', width: detail.batches?.length > 1 ? '300px' : '200px', flexShrink: 0 }}>
                    {detail.design && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>Bản vẽ</div>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {detail.design.split(',').map((imgUrl, i) => {
                            const trimmedUrl = imgUrl.trim();
                            return (
                              <div key={i} className="detail-image-trigger" onClick={() => setZoomImage(trimmedUrl)} style={{ width: '80px', height: '80px', background: 'var(--bg-sidebar)' }}>
                                <OptimizedImage src={trimmedUrl} className="detail-image" style={{ height: '100%', objectFit: 'contain' }} />
                                <div className="image-overlay-icon"><ZoomIn size={16} /></div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {detail.quotation_image_path && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>Báo giá</div>
                        {detail.quotation_image_path.toLowerCase().endsWith('.pdf') ? (
                          <div className="detail-image-trigger" onClick={() => handleQuotationClick(detail.quotation_image_path)} style={{ height: '140px', background: 'var(--bg-sidebar)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                            <FileText size={48} color="var(--color-error)" />
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Tải & Mở PDF</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all', padding: '0 8px', textAlign: 'center' }}>
                              {detail.quotation_image_path.split('/').pop()}
                            </span>
                          </div>
                        ) : (
                          <div className="detail-image-trigger" onClick={() => handleQuotationClick(detail.quotation_image_path)} style={{ height: '140px', background: 'var(--bg-sidebar)' }}>
                            <OptimizedImage src={detail.quotation_image_path} className="detail-image" style={{ height: '100%', objectFit: 'contain' }} />
                            <div className="image-overlay-icon"><ZoomIn size={20} /></div>
                          </div>
                        )}
                      </div>
                    )}
                    {detail.tds_file_path && (
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase' }}>TDS</div>
                        {detail.tds_file_path.toLowerCase().endsWith('.pdf') ? (
                          <div className="detail-image-trigger" onClick={() => handleQuotationClick(detail.tds_file_path)} style={{ height: '140px', background: 'var(--bg-sidebar)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer' }}>
                            <FileText size={48} color="var(--color-error)" />
                            <span style={{ fontSize: '13px', fontWeight: 600 }}>Tải & Mở TDS PDF</span>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all', padding: '0 8px', textAlign: 'center' }}>
                              {detail.tds_file_path.split('/').pop()}
                            </span>
                          </div>
                        ) : (
                          <div className="detail-image-trigger" onClick={() => handleQuotationClick(detail.tds_file_path)} style={{ height: '140px', background: 'var(--bg-sidebar)' }}>
                            <OptimizedImage src={detail.tds_file_path} className="detail-image" style={{ height: '100%', objectFit: 'contain' }} />
                            <div className="image-overlay-icon"><ZoomIn size={20} /></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* BATCH INFO (SPECIFIC) */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '24px', borderTop: '1px solid var(--border-color)', paddingTop: '16px', marginBottom: '12px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>Các lô keo hoạt động</h3>
                {hasPermission('tape.create') && (
                  <button
                    className="btn-primary"
                    style={{ padding: '6px 12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', height: 'auto', backgroundColor: 'var(--color-accent)', border: 'none', color: '#fff', borderRadius: '8px', cursor: 'pointer' }}
                    onClick={() => openAddBatch(detail)}
                  >
                    <Plus size={14} /> Thêm lượng keo mới
                  </button>
                )}
              </div>
              <div className="tape-detail-container">
                {detail.batches?.filter(b => b.batch_status !== 'HISTORY').map((batch, index, arr) => {
                  const isLast = index === arr.length - 1;
                  return (
                    <React.Fragment key={batch.id}>
                      <div className="tape-detail-panel">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <div className="batch-badge" style={{ backgroundColor: `${getStatusColor(batch.batch_status)}20`, color: getStatusColor(batch.batch_status) }}>
                            {BATCH_STATUS_LABELS[batch.batch_status]}
                          </div>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            {hasPermission('tape.edit') && (
                              <button className="action-btn" title="Sửa lô này" onClick={e => openEditBatch(batch, e)} style={{ padding: '4px' }}><Edit2 size={12} /></button>
                            )}
                            {hasPermission('tape.delete') && (
                              <button className="action-btn" title="Xóa lô này" onClick={e => handleBatchDelete(batch.id, e)} style={{ padding: '4px' }}><Trash2 size={12} /></button>
                            )}
                          </div>
                        </div>
                        <div className="detail-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                          <div className="detail-item"><span>Stock</span><strong>{batch.stock ?? 0} {detail.unit || 'Cuộn'}</strong></div>
                          <div className="detail-item"><span>Ngày sản xuất</span><strong>{batch.mfg_date || '—'}</strong></div>
                          <div className="detail-item"><span>Ngày nhận</span><strong>{batch.received_date || '—'}</strong></div>
                          <div className="detail-item"><span>Hạn dùng</span><strong style={{ color: isExpiryAlarm(batch.expiry) ? 'var(--color-warning)' : 'inherit' }}>{batch.expiry || '—'}</strong></div>
                          <div className="detail-item"><span>Ngày cần request</span><strong>{batch.next_request_date || '—'}</strong></div>
                          <div className="detail-item"><span>Loại</span><strong>{batch.type || '—'}</strong></div>
                        </div>
                      </div>
                      {!isLast && (
                        <div className="tape-detail-arrow">
                          <MoveRight size={20} />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {isHistoryOpen && (
        <div className="modal-overlay" onClick={() => setIsHistoryOpen(false)}>
          <div className="modal-box" style={{ maxWidth: '1000px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px' }}>
                  <History size={20} color="var(--text-secondary)" />
                </div>
                <div>
                  <h2 style={{ margin: 0 }}>Lịch sử & Keo đã hết</h2>
                  <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-secondary)' }}>Danh sách các lô keo đã sử dụng hết hoặc chuyển vào Hết hạn</p>
                </div>
              </div>
              <button className="action-btn" onClick={() => setIsHistoryOpen(false)}><X size={16} /></button>
            </div>

            <div className="modal-content" style={{ padding: '20px' }}>
              <div className="nvl-table-wrap" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <table className="nvl-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>STT</th>
                      <th>Itemcode</th>
                      <th>Tên keo</th>
                      <th>Vendor</th>
                      <th>Trạng thái</th>
                      <th>Stock</th>
                      <th>Ngày SX</th>
                      <th>Ngày nhận</th>
                      <th>Hạn dùng</th>
                      <th>Loại</th>
                      <th style={{ width: '80px' }}>Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const historyBatches = items.flatMap(master =>
                        (master.batches || [])
                          .filter(b => b.batch_status === 'HISTORY' || b.stock <= 0)
                          .map(b => ({ ...b, master_name: master.name, vendor_name: master.vendor, master_item: master }))
                      ).sort((a, b) => new Date(b.received_date || 0) - new Date(a.received_date || 0));

                      if (historyBatches.length === 0) {
                        return (
                          <tr>
                            <td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                              Không có dữ liệu lịch sử
                            </td>
                          </tr>
                        );
                      }

                      return historyBatches.map((batch, idx) => (
                        <tr key={`${batch.master_name}-${batch.id}`}>
                          <td>{idx + 1}</td>
                          <td style={{ wordBreak: 'break-all', whiteSpace: 'normal', minWidth: '120px' }}>{batch.master_item?.itemcode || '—'}</td>
                          <td style={{ wordBreak: 'break-word', whiteSpace: 'normal', minWidth: '150px' }}><strong>{batch.master_name}</strong></td>
                          <td>{batch.vendor_name || '—'}</td>
                          <td>
                            <span className="batch-badge" style={{
                              backgroundColor: batch.batch_status === 'HISTORY' ? 'rgba(38, 37, 30, 0.1)' : 'rgba(245, 78, 0, 0.1)',
                              color: batch.batch_status === 'HISTORY' ? 'var(--text-secondary)' : 'var(--color-accent)',
                              margin: 0,
                              fontSize: '10px',
                              whiteSpace: 'normal',
                              wordBreak: 'break-word'
                            }}>
                              {BATCH_STATUS_LABELS[batch.batch_status] || batch.batch_status}
                            </span>
                          </td>
                          <td><span style={{ color: batch.stock <= 0 ? 'var(--color-error)' : 'inherit', fontWeight: 600 }}>{batch.stock}</span></td>
                          <td>{batch.mfg_date || '—'}</td>
                          <td>{batch.received_date || '—'}</td>
                          <td>{batch.expiry || '—'}</td>
                          <td>{batch.type || '—'}</td>
                          <td>
                            <div style={{ display: 'flex', gap: '4px' }}>
                              {hasPermission('tape.delete') && (
                                <button className="action-btn delete" title="Xóa lô này" onClick={(e) => handleBatchDelete(batch.id, e)}>
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="modal-footer" style={{ padding: '16px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn-secondary" onClick={() => setIsHistoryOpen(false)}>Đóng</button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE / EDIT / BATCH MODAL */}
      {(isCreating || editItem || editBatch || addingBatchMasterId) && (
        <div className="modal-overlay" style={{ zIndex: 1100 }} onClick={closeForm}>
          <div className="modal-box modal-form-box" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{isCreating ? 'Thêm keo mới' : (editBatch ? `Sửa lô: ${BATCH_STATUS_LABELS[editBatch.batch_status]}` : (addingBatchMasterId ? 'Thêm lượng keo mới' : 'Chỉnh sửa Keo'))}</h2>
              <button className="action-btn" onClick={closeForm}><X size={16} /></button>
            </div>

            <div className="modal-content">
              <form onSubmit={handleSubmit} className="nvl-form">
                {!editBatch && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '20px' }}>
                    {/* Design Images Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Bản vẽ / Hình ảnh keo</span>
                      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                        {designSlots.map((slot, index) => (
                          <div key={slot.id} className="image-upload-zone" style={{ height: '120px', position: 'relative', flex: 1, minWidth: '80px', marginBottom: 0 }} onClick={() => {
                            if (!slot.preview) {
                              document.getElementById(`input-${slot.id}`).click();
                            }
                          }}>
                            {slot.preview ? (
                              <>
                                <img src={slot.preview} alt="design" className="upload-preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                <button
                                  type="button"
                                  className="chip-delete-btn"
                                  style={{ position: 'absolute', top: '4px', right: '4px', background: 'var(--color-error)', color: '#fff', border: 'none', borderRadius: '50%', width: '18px', height: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleRemoveDesignSlot(slot.id);
                                  }}
                                >
                                  ×
                                </button>
                              </>
                            ) : (
                              <div className="upload-placeholder">
                                <ImageIcon size={20} />
                                <span style={{ fontSize: '11px' }}>Bản vẽ {index + 1}</span>
                              </div>
                            )}
                            <input id={`input-${slot.id}`} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleSlotFileChange(slot.id, e)} />
                          </div>
                        ))}

                        <button
                          type="button"
                          className="image-upload-zone"
                          style={{ height: '120px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '1px dashed var(--border-color)', background: 'var(--bg-main)', cursor: 'pointer', borderRadius: '8px', flex: 1, minWidth: '80px', marginBottom: 0 }}
                          onClick={handleAddDesignSlot}
                        >
                          <Plus size={20} color="var(--text-secondary)" />
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '4px' }}>Thêm ảnh</span>
                        </button>
                      </div>
                    </div>

                    {/* Quotation Image Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>Báo giá</span>
                      <div className="image-upload-zone" style={{ height: '120px', width: '100%', marginBottom: 0 }} onClick={() => quotationFileRef.current?.click()}>
                        {previews.quotation ? (
                          isPdfFile(previews.quotation, form.quotationFile) ? (
                            <div className="pdf-preview-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px', width: '100%' }}>
                              <FileText size={40} color="var(--color-error)" />
                              <span style={{ fontSize: '12px', color: 'var(--text-primary)', textAlign: 'center', wordBreak: 'break-all', padding: '0 8px' }}>
                                {form.quotationFile ? form.quotationFile.name : previews.quotation.split('/').pop()}
                              </span>
                            </div>
                          ) : (
                            <img src={previews.quotation} alt="quotation" className="upload-preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          )
                        ) : (
                          <div className="upload-placeholder"><ImageIcon size={20} /><span style={{ fontSize: '11px' }}>Báo giá (Ảnh/PDF)</span></div>
                        )}
                        <input ref={quotationFileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleFileChange(e, 'quotation')} />
                      </div>
                    </div>

                    {/* TDS File Section */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>TDS</span>
                      <div className="image-upload-zone" style={{ height: '120px', width: '100%', marginBottom: 0 }} onClick={() => tdsFileRef.current?.click()}>
                        {previews.tds ? (
                          isPdfFile(previews.tds, form.tdsFile) ? (
                            <div className="pdf-preview-container" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '8px', width: '100%' }}>
                              <FileText size={40} color="var(--color-error)" />
                              <span style={{ fontSize: '12px', color: 'var(--text-primary)', textAlign: 'center', wordBreak: 'break-all', padding: '0 8px' }}>
                                {form.tdsFile ? form.tdsFile.name : previews.tds.split('/').pop()}
                              </span>
                            </div>
                          ) : (
                            <img src={previews.tds} alt="tds" className="upload-preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                          )
                        ) : (
                          <div className="upload-placeholder"><ImageIcon size={20} /><span style={{ fontSize: '11px' }}>TDS (Ảnh/PDF)</span></div>
                        )}
                        <input ref={tdsFileRef} type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => handleFileChange(e, 'tds')} />
                      </div>
                    </div>
                  </div>
                )}

                <div className="nvl-form-grid">
                  {(isCreating || editItem) && (
                    <>
                      <div className="input-group">
                        <label>Mã hàng (Itemcode)</label>
                        <input value={form.itemcode} onChange={e => setForm(f => ({ ...f, itemcode: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Tên keo <span className="required">*</span></label>
                        <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Phân loại</label>
                        <select
                          className="settings-select"
                          value={form.master_type}
                          onChange={e => setForm(f => ({ ...f, master_type: e.target.value }))}
                        >
                          <option value="Keo">ACF Bonding Tape</option>
                          <option value="Flux">Flux</option>
                          <option value="Solder">Solder</option>
                        </select>
                      </div>
                      <div className="input-group" style={{ gridColumn: 'span 2' }}>
                        <label>Tên mặt hàng (Itemname)</label>
                        <div className="chip-input-container">
                          {itemnames.map((name, idx) => (
                            <span key={idx} className="chip-item">
                              {name}
                              <button type="button" className="chip-delete-btn" onClick={() => handleRemoveItemname(idx)}>×</button>
                            </span>
                          ))}
                          <input
                            type="text"
                            className="chip-input-field"
                            placeholder={itemnames.length === 0 ? "Nhập các itemname (phân tách bằng dấu phẩy, dấu chấm hoặc khoảng trắng)..." : "Thêm..."}
                            value={newItemname}
                            onChange={handleNewItemnameChange}
                            onKeyDown={handleNewItemnameKeyDown}
                            onBlur={handleBlurNewItemname}
                          />
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Vendor</label>
                        <select
                          className="settings-select"
                          value={form.vendor_name}
                          onChange={e => setForm(f => ({ ...f, vendor_name: e.target.value }))}
                        >
                          <option value="">-- Chọn Vendor --</option>
                          {vendors.map(v => (
                            <option key={v.id} value={v.vendor_name}>{v.vendor_name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Giá tiền</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            placeholder="Nhập giá tiền"
                            style={{ flex: 1 }}
                            value={form.price}
                            onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                          />
                          <select
                            className="settings-select"
                            style={{ width: '90px' }}
                            value={form.money_type}
                            onChange={e => setForm(f => ({ ...f, money_type: e.target.value }))}
                          >
                            <option value="VND">VND</option>
                            <option value="USD">USD</option>
                            <option value="JPY">JPY</option>
                          </select>
                        </div>
                      </div>
                      <div className="input-group">
                        <label>Đơn vị</label>
                        <input
                          list="tape-unit-suggestions"
                          placeholder="Cuộn, Chai, Can, Lọ, Kg..."
                          value={form.unit}
                          onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                        />
                        <datalist id="tape-unit-suggestions">
                          <option value="Cuộn" />
                          <option value="Chai" />
                          <option value="Can" />
                          <option value="Lọ" />
                          <option value="Kg" />
                          <option value="Hộp" />
                          <option value="Cái" />
                          <option value="Ống" />
                        </datalist>
                      </div>
                      <div className="input-group">
                        <label>Width (mm)</label>
                        <input type="number" step="any" value={form.width} onChange={e => setForm(f => ({ ...f, width: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Thickness (um)</label>
                        <input type="number" step="any" value={form.thickness} onChange={e => setForm(f => ({ ...f, thickness: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Mục đích</label>
                        <input value={form.purpose} onChange={e => setForm(f => ({ ...f, purpose: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Alarm (Cảnh báo)</label>
                        <input type="number" step="any" value={form.alarm} onChange={e => setForm(f => ({ ...f, alarm: e.target.value }))} />
                      </div>
                      {/* Leadtime giao hàng fixed to week */}
                      <div className="input-group">
                        <label>Leadtime giao hàng (Tuần)</label>
                        <div className="leadtime-input">
                          <input 
                            type="number" 
                            min="0" 
                            step="any"
                            placeholder="Số tuần" 
                            value={form.leadtime_value} 
                            onChange={e => setForm(f => ({ ...f, leadtime_value: e.target.value }))} 
                          />
                        </div>
                        {form.leadtime_value && (
                          <small style={{ color: 'var(--text-secondary)', marginTop: '4px' }}>
                            = {toDays(form.leadtime_value)} ngày
                          </small>
                        )}
                      </div>
                      <div className="input-group" style={{ gridColumn: 'span 2' }}>
                        <label>Ghi chú</label>
                        <textarea
                          rows={2}
                          style={{ width: '100%', borderRadius: '8px', border: '1px solid var(--border-color)', padding: '8px', background: 'var(--bg-main)', color: 'var(--text-primary)', fontFamily: 'inherit' }}
                          value={form.comment}
                          onChange={e => setForm(f => ({ ...f, comment: e.target.value }))}
                        />
                      </div>
                    </>
                  )}

                  {(isCreating || editBatch || addingBatchMasterId) && (
                    <>
                      <div className="input-group">
                        <label>Stock</label>
                        <input type="number" step="any" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Ngày sản xuất</label>
                        <input type="date" value={form.mfg_date} onChange={e => setForm(f => ({ ...f, mfg_date: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Ngày nhận</label>
                        <input type="date" value={form.date_received} onChange={e => setForm(f => ({ ...f, date_received: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Hạn sử dụng</label>
                        <input type="date" value={form.expiry} onChange={e => setForm(f => ({ ...f, expiry: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Loại</label>
                        <select
                          className="settings-select"
                          value={form.type}
                          onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                        >
                          <option value="Hàng Mẫu">Hàng Mẫu</option>
                          <option value="Hàng Test">Hàng Test</option>
                        </select>
                      </div>
                      <div className="input-group">
                        <label>Ngày cần request</label>
                        <input type="date" value={form.next_request_date} onChange={e => setForm(f => ({ ...f, next_request_date: e.target.value }))} />
                      </div>
                      <div className="input-group">
                        <label>Trạng thái lô</label>
                        <select
                          className="settings-select"
                          value={form.batch_status}
                          onChange={e => setForm(f => ({ ...f, batch_status: e.target.value }))}
                        >
                          {Object.keys(BATCH_STATUS_LABELS).map(status => (
                            <option key={status} value={status}>{BATCH_STATUS_LABELS[status]}</option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '20px' }}>
                  <button type="button" className="btn-secondary" onClick={closeForm}>Hủy</button>
                  <button type="submit" className="btn-primary">{(isCreating || addingBatchMasterId) ? 'Thêm mới' : 'Lưu thay đổi'}</button>
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
            <button className="zoom-btn" title="Tải xuống JPG" onClick={() => handleDownloadJpg(zoomImage, 'image')}>
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
