import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Save, RefreshCw, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { useConfirm } from '../context/ConfirmContext';
import { usePermission } from '../context/PermissionContext';
import { io } from 'socket.io-client';

const API_BASE = '/api/equipment-expenses';
const headers = () => ({
  'Authorization': `Bearer ${sessionStorage.getItem('token')}`,
  'Content-Type': 'application/json'
});

export default function EquipmentExpensePage() {
  const toast = useToast();
  const { confirm } = useConfirm();
  const { hasPermission } = usePermission();

  const currentYear = new Date().getFullYear();
  const YEARS = [currentYear - 1, currentYear, currentYear + 1];

  const [expenses, setExpenses] = useState([]);
  const [originalExpenses, setOriginalExpenses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedYear, setExpandedYear] = useState(null);

  const canEdit = hasPermission('expense.edit');

  const currentMonthIndex = new Date().getMonth(); // 0-11
  const nextMonthIndex = (currentMonthIndex + 1) % 12;

  // Flatten flat rows from server into grouped React state
  const groupFlatRows = (flatRows) => {
    const groupsMap = {};
    let groupCounter = 1;
    
    flatRows.forEach(row => {
      const key = `${row.name || ''}::${row.type || 'IT'}::${row.unit || 'pcs'}::${row.default_price || 0}`;
      if (!groupsMap[key]) {
        groupsMap[key] = {
          groupId: `group-${groupCounter++}`,
          name: row.name || '',
          type: row.type || 'IT',
          unit: row.unit || 'pcs',
          default_price: row.default_price ?? 0,
          years: {}
        };
        // Initialize all YEARS with default empty templates
        YEARS.forEach(y => {
          groupsMap[key].years[y] = {
            id: null,
            m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0,
            m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0
          };
        });
      }
      
      if (YEARS.includes(row.year)) {
        groupsMap[key].years[row.year] = {
          id: row.id,
          m1: row.m1 ?? 0,
          m2: row.m2 ?? 0,
          m3: row.m3 ?? 0,
          m4: row.m4 ?? 0,
          m5: row.m5 ?? 0,
          m6: row.m6 ?? 0,
          m7: row.m7 ?? 0,
          m8: row.m8 ?? 0,
          m9: row.m9 ?? 0,
          m10: row.m10 ?? 0,
          m11: row.m11 ?? 0,
          m12: row.m12 ?? 0
        };
      }
    });
    
    return Object.values(groupsMap);
  };

  // Convert grouped items back to flat list for backend
  const flattenGroupedItems = (groupedItems) => {
    const flatRows = [];
    groupedItems.forEach(group => {
      YEARS.forEach(y => {
        const yearData = group.years[y];
        
        const hasId = yearData.id !== null && yearData.id !== undefined && !String(yearData.id).startsWith('temp-');
        const hasNonZero = Object.keys(yearData).some(k => {
          if (k.startsWith('m')) {
            const val = parseFloat(yearData[k]);
            return val !== 0 && !isNaN(val);
          }
          return false;
        });
        
        if (hasId || hasNonZero) {
          flatRows.push({
            id: yearData.id,
            name: group.name,
            type: group.type,
            unit: group.unit,
            default_price: group.default_price,
            year: y,
            m1: yearData.m1,
            m2: yearData.m2,
            m3: yearData.m3,
            m4: yearData.m4,
            m5: yearData.m5,
            m6: yearData.m6,
            m7: yearData.m7,
            m8: yearData.m8,
            m9: yearData.m9,
            m10: yearData.m10,
            m11: yearData.m11,
            m12: yearData.m12
          });
        }
      });
    });
    return flatRows;
  };

  const fetchAll = async () => {
    if (!hasPermission('expense.view')) return;
    setLoading(true);
    try {
      const res = await fetch(API_BASE, {
        headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        const grouped = groupFlatRows(data);
        setExpenses(grouped);
        setOriginalExpenses(JSON.parse(JSON.stringify(grouped)));
      } else {
        toast.error('Lỗi khi tải dữ liệu chi phí.');
      }
    } catch (e) {
      toast.error('Lỗi kết nối server.');
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, [hasPermission]);

  // Real-time update listener
  useEffect(() => {
    const socket = io(window.location.protocol + "//" + window.location.hostname + ":1908");
    socket.on('data-update', (data) => {
      if (data.type === 'expense') {
        const currentDataStr = JSON.stringify(expenses);
        const originalDataStr = JSON.stringify(originalExpenses);
        if (currentDataStr === originalDataStr) {
          fetchAll();
        }
      }
    });
    return () => socket.disconnect();
  }, [expenses, originalExpenses]);

  // Check if there are unsaved changes
  const isDirty = JSON.stringify(expenses) !== JSON.stringify(originalExpenses);

  // Cell change handler
  const handleCellChange = (groupId, year, field, value) => {
    setExpenses(prev => prev.map(group => {
      if (group.groupId === groupId) {
        if (year === null) {
          let parsedValue = value;
          if (field === 'default_price') {
            parsedValue = value === '' ? '' : parseFloat(value);
            if (isNaN(parsedValue)) parsedValue = '';
          }
          return { ...group, [field]: parsedValue };
        } else {
          let parsedValue = value;
          parsedValue = value === '' ? '' : parseFloat(value);
          if (isNaN(parsedValue)) parsedValue = '';
          
          const updatedYears = {
            ...group.years,
            [year]: {
              ...group.years[year],
              [field]: parsedValue
            }
          };
          return { ...group, years: updatedYears };
        }
      }
      return group;
    }));
  };

  // Add blank row with empty templates for all years
  const handleAddRow = () => {
    const newGroupId = `temp-group-${Date.now()}`;
    const emptyYears = {};
    YEARS.forEach(y => {
      emptyYears[y] = {
        id: `temp-${y}-${Date.now()}`,
        m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0,
        m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0
      };
    });
    
    const newGroup = {
      groupId: newGroupId,
      name: '',
      type: 'IT',
      unit: 'pcs',
      default_price: 0,
      years: emptyYears
    };
    
    setExpenses(prev => [...prev, newGroup]);
  };

  // Delete equipment group and all corresponding database rows across all years
  const handleDeleteRow = (groupId, name) => {
    const group = expenses.find(g => g.groupId === groupId);
    if (!group) return;
    
    const idsToDelete = YEARS.map(y => group.years[y]?.id).filter(id => id && !String(id).startsWith('temp-'));
    
    if (idsToDelete.length === 0) {
      setExpenses(prev => prev.filter(g => g.groupId !== groupId));
      toast.success('Đã xóa dòng nháp.');
      return;
    }

    confirm({
      title: 'Xóa Dòng Chi Phí',
      message: `Bạn có chắc chắn muốn xóa tất cả dữ liệu các năm của "${name || 'Thiết bị này'}"? Hành động này không thể hoàn tác.`,
      type: 'danger',
      onConfirm: async () => {
        try {
          for (const id of idsToDelete) {
            await fetch(`${API_BASE}/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
            });
          }
          toast.success('Đã xóa thành công.');
          fetchAll();
        } catch {
          toast.error('Lỗi khi kết nối server.');
        }
      }
    });
  };

  // Save bulk changes
  const handleSaveChanges = async (silent = false) => {
    if (!canEdit) return;
    
    const hasEmptyName = expenses.some(g => !g.name?.trim());
    if (hasEmptyName) {
      if (!silent) {
        toast.error('Tên thiết bị không được để trống.');
      }
      return;
    }

    setSaving(true);
    try {
      const flatRows = flattenGroupedItems(expenses);
      const normalizedExpenses = flatRows.map(row => {
        const copy = { ...row };
        if (copy.default_price === '') copy.default_price = 0;
        for (let i = 1; i <= 12; i++) {
          if (copy[`m${i}`] === '') copy[`m${i}`] = 0;
        }
        return copy;
      });

      const res = await fetch(`${API_BASE}/bulk-save`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ expenses: normalizedExpenses })
      });

      if (res.ok) {
        if (!silent) {
          toast.success('Đã lưu mọi thay đổi thành công!');
        }
        const refreshRes = await fetch(API_BASE, {
          headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` }
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          const grouped = groupFlatRows(data);
          setExpenses(grouped);
          setOriginalExpenses(JSON.parse(JSON.stringify(grouped)));
        }
      } else {
        const data = await res.json();
        toast.error(data.message || 'Lỗi khi lưu thay đổi.');
      }
    } catch {
      toast.error('Lỗi kết nối server.');
    }
    setSaving(false);
  };

  // Auto-save on blur
  const handleBlurSave = () => {
    const isDirtyCurrent = JSON.stringify(expenses) !== JSON.stringify(originalExpenses);
    if (isDirtyCurrent && !saving) {
      handleSaveChanges(true);
    }
  };

  // Calculations for dynamic totals
  const getRowQuantityTotal = (group, year) => {
    const yearData = group.years[year];
    if (!yearData) return 0;
    let total = 0;
    for (let i = 1; i <= 12; i++) {
      total += parseFloat(yearData[`m${i}`]) || 0;
    }
    return total;
  };

  const getRowCostTotal = (group, year) => {
    const price = parseFloat(group.default_price) || 0;
    return getRowQuantityTotal(group, year) * price;
  };

  // Column totals
  const getMonthTotalCost = (year, monthIndex) => {
    return expenses.reduce((sum, group) => {
      const price = parseFloat(group.default_price) || 0;
      const yearData = group.years[year];
      const qty = yearData ? (parseFloat(yearData[`m${monthIndex}`]) || 0) : 0;
      return sum + (price * qty);
    }, 0);
  };

  const getGrandTotalCost = (year) => {
    return expenses.reduce((sum, group) => {
      return sum + getRowCostTotal(group, year);
    }, 0);
  };

  const handleReset = () => {
    setExpenses(JSON.parse(JSON.stringify(originalExpenses)));
    toast.success('Đã khôi phục dữ liệu gốc.');
  };

  if (!hasPermission('expense.view')) {
    return (
      <div className="empty-state-container">
        <AlertTriangle size={48} color="var(--color-warning)" />
        <h2>Truy cập bị từ chối</h2>
        <p>Bạn không có quyền xem trang này. Vui lòng liên hệ Admin.</p>
      </div>
    );
  }

  return (
    <div className="nvl-page" style={{ paddingBottom: '20px', height: 'auto' }}>
      <style dangerouslySetInnerHTML={{
        __html: `
        .excel-table-wrap {
          overflow-x: auto;
          border: 1px solid var(--border-color);
          border-radius: 8px;
          background: var(--bg-card);
          box-shadow: rgba(0,0,0,0.02) 0px 4px 12px;
          position: relative;
        }
        .excel-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 13px;
          color: var(--text-primary);
        }
        .excel-table th {
          position: sticky;
          top: -32px; /* Accounting for main-content padding */
          background: var(--bg-sidebar);
          border-bottom: 2px solid var(--border-color);
          border-right: 1px solid var(--border-color);
          padding: 8px 10px;
          font-weight: 600;
          color: var(--text-primary);
          z-index: 2;
          text-align: center;
          font-family: var(--font-display);
        }
        .excel-table td {
          border-bottom: 1px solid var(--border-color);
          border-right: 1px solid var(--border-color);
          padding: 0;
          height: auto;
          background: transparent;
        }
        .excel-table tr:hover td {
          background-color: rgba(245, 78, 0, 0.015);
        }
        .excel-input {
          width: 100%;
          height: 100%;
          border: none;
          background: transparent;
          padding: 6px 8px;
          font-size: 13px;
          color: var(--text-primary);
          outline: none;
          transition: all 0.15s ease;
          font-family: var(--font-body);
        }
        .excel-input.number {
          text-align: center;
          font-family: var(--font-mono);
        }
        .excel-textarea {
          resize: none;
          min-height: 38px;
          height: auto;
          display: block;
          overflow-y: hidden;
          white-space: pre-wrap;
          word-break: break-word;
          padding: 8px 10px;
          line-height: 1.4;
          box-sizing: border-box;
        }
        .excel-input:hover {
          background-color: rgba(38, 37, 30, 0.04);
        }
        .excel-input:focus {
          background-color: #fff;
          box-shadow: inset 0 0 0 2px var(--color-accent);
          z-index: 5;
        }
        .excel-cell-readonly {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 6px 10px;
          font-weight: 600;
          font-family: var(--font-mono);
          height: 100%;
          color: var(--text-secondary);
          background-color: rgba(38, 37, 30, 0.02);
        }
        .excel-cell-readonly.no-highlight {
          background-color: transparent !important;
          color: var(--text-primary) !important;
          font-weight: 500;
        }
        .excel-cell-name {
          display: flex;
          align-items: center;
          width: 100%;
          height: 100%;
          min-height: 38px;
        }
        .excel-cell-text-readonly {
          display: block;
          padding: 8px 10px;
          line-height: 1.4;
          white-space: pre-wrap;
          word-break: break-word;
          min-height: 38px;
          box-sizing: border-box;
          text-align: left;
          width: 100%;
        }
        .excel-total-row td {
          background-color: var(--bg-sidebar) !important;
          border-top: 2px solid var(--border-color);
          border-bottom: 2px solid var(--border-color);
          font-weight: bold;
          font-family: var(--font-mono);
          text-align: center;
          padding: 8px 10px;
        }
        .excel-total-row td.label {
          text-align: left;
          font-family: var(--font-display);
        }
        .excel-total-row td.empty {
          background-color: rgba(38, 37, 30, 0.05) !important;
        }
        .cell-action {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
        }
        .action-delete-btn {
          border: none;
          background: transparent;
          color: rgba(38, 37, 30, 0.4);
          cursor: pointer;
          transition: color 0.15s;
          padding: 6px;
          border-radius: 4px;
        }
        .action-delete-btn:hover {
          color: var(--color-error);
          background-color: rgba(255, 0, 0, 0.08);
        }
        .page-toolbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .unsaved-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          background-color: rgba(245, 78, 0, 0.1);
          color: var(--color-accent);
          padding: 0 16px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 600;
          font-family: var(--font-display);
          animation: pulse 2s infinite;
          height: 38px;
          box-sizing: border-box;
        }
        @keyframes pulse {
          0% { opacity: 0.8; }
          50% { opacity: 1; }
          100% { opacity: 0.8; }
        }
        .excel-table th.current-month-col, 
        .excel-table td.current-month-col {
          background-color: rgba(245, 78, 0, 0.04) !important;
        }
        .excel-table th.next-month-col, 
        .excel-table td.next-month-col {
          background-color: rgba(192, 133, 50, 0.04) !important;
        }
        .excel-input::placeholder {
          color: rgba(38, 37, 30, 0.35);
          font-weight: 500;
        }

        /* DARK MODE OVERRIDES FOR VISUAL WOW */
        [data-theme='dark'] .excel-input:hover {
          background-color: rgba(255, 255, 255, 0.04);
        }
        [data-theme='dark'] .excel-input:focus {
          background-color: #2a2a27;
          color: var(--text-primary);
        }
        [data-theme='dark'] .excel-cell-readonly {
          background-color: rgba(255, 255, 255, 0.02);
        }
        [data-theme='dark'] .excel-total-row td.empty {
          background-color: rgba(255, 255, 255, 0.05) !important;
        }
        [data-theme='dark'] .action-delete-btn {
          color: rgba(255, 255, 255, 0.4);
        }
        [data-theme='dark'] .excel-input option {
          background-color: var(--bg-card);
          color: var(--text-primary);
        }
        [data-theme='dark'] .excel-input::placeholder {
          color: rgba(255, 255, 255, 0.35);
        }
      `}} />

      {/* HEADER */}
      <div className="nvl-header" style={{ marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
            <FileSpreadsheet size={24} color="var(--color-accent)" />
          </div>
          <h1 className="home-title" style={{ margin: 0 }}>Quản lý Equipment Expense</h1>
        </div>

        <div className="nvl-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {saving ? (
            <div className="unsaved-badge" style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', color: 'var(--color-fk)' }}>
              <RefreshCw size={14} className="spin" /> Đang tự động lưu...
            </div>
          ) : isDirty ? (
            <div className="unsaved-badge">
              <AlertTriangle size={14} /> Có thay đổi chưa lưu
            </div>
          ) : (
            <div className="unsaved-badge" style={{ backgroundColor: 'rgba(46, 125, 50, 0.1)', color: 'var(--color-normal)' }}>
              ✓ Đã lưu tất cả
            </div>
          )}

          {canEdit && (
            <>
              {isDirty && (
                <button 
                  className="btn-secondary" 
                  onClick={handleReset} 
                  disabled={saving}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', height: '38px', boxSizing: 'border-box' }}
                >
                  <RefreshCw size={16} /> Hoàn tác
                </button>
              )}
              <button 
                className="btn-primary" 
                onClick={handleAddRow}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', height: '38px', boxSizing: 'border-box' }}
              >
                <Plus size={16} /> Thêm dòng mới
              </button>
            </>
          )}
        </div>
      </div>

      {/* TOOLBAR */}
      <div className="page-toolbar" style={{ marginBottom: '16px' }}>
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500 }}>
          Nhấp vào ô bất kỳ để chỉnh sửa.
        </div>
      </div>

      {/* SPREADSHEET GRID */}
      <div className="excel-table-wrap">
        <table className="excel-table">
          <thead>
            <tr>
              <th rowSpan={expandedYear ? 2 : 1} style={{ width: '45px' }}>STT</th>
              <th rowSpan={expandedYear ? 2 : 1} style={{ minWidth: '220px', textAlign: 'center' }}>Tên Thiết Bị</th>
              <th rowSpan={expandedYear ? 2 : 1} style={{ width: '90px' }}>Loại</th>
              <th rowSpan={expandedYear ? 2 : 1} style={{ width: '90px' }}>Đơn Vị</th>
              <th rowSpan={expandedYear ? 2 : 1} style={{ width: '120px', textAlign: 'center' }}>Giá ($)</th>
              
              {YEARS.map(y => {
                const isExpanded = expandedYear === y;
                if (!isExpanded) {
                  return (
                    <th 
                      key={y}
                      rowSpan={expandedYear ? 2 : 1}
                      style={{ 
                        width: '160px', 
                        textAlign: 'center', 
                        cursor: 'pointer',
                        backgroundColor: 'var(--bg-sidebar)',
                        transition: 'background-color 0.2s',
                        borderLeft: '1px solid var(--border-color)',
                        borderRight: '1px solid var(--border-color)'
                      }}
                      onClick={() => setExpandedYear(y)}
                      className="year-group-header collapsed"
                      title={`Click để mở rộng dữ liệu Năm ${y}`}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px' }}>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-accent)' }}>Năm {y}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>Tổng Cộng ($) ➔</span>
                      </div>
                    </th>
                  );
                } else {
                  return (
                    <th 
                      key={y}
                      colSpan={14}
                      style={{ 
                        textAlign: 'center', 
                        cursor: 'pointer',
                        backgroundColor: 'rgba(245, 78, 0, 0.08)',
                        borderLeft: '2px solid var(--color-accent)',
                        borderRight: '2px solid var(--color-accent)',
                        borderTop: '3px solid var(--color-accent)',
                        padding: '6px'
                      }}
                      onClick={() => setExpandedYear(null)}
                      className="year-group-header expanded"
                      title="Click vào tiêu đề hoặc tháng để thu gọn"
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 800, color: 'var(--color-accent)' }}>NĂM {y}</span>
                        <span style={{ fontSize: '10px', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '1px 6px', borderRadius: '4px', fontWeight: 'bold' }}>◀ Click để Thu Gọn</span>
                      </div>
                    </th>
                  );
                }
              })}
              
              {canEdit && <th rowSpan={expandedYear ? 2 : 1} style={{ width: '50px' }}></th>}
            </tr>

            {expandedYear && (
              <tr>
                {Array.from({ length: 12 }, (_, i) => {
                  const isCurrent = i === currentMonthIndex;
                  const isNext = i === nextMonthIndex;
                  let thClass = '';
                  if (isCurrent) thClass = 'current-month-col';
                  else if (isNext) thClass = 'next-month-col';
                  
                  return (
                    <th 
                      key={i} 
                      className={thClass}
                      style={{ 
                        width: '75px', 
                        textAlign: 'center',
                        fontSize: '11px',
                        backgroundColor: isCurrent ? 'rgba(245, 78, 0, 0.06)' : 'rgba(245, 78, 0, 0.02)',
                        borderRight: '1px solid var(--border-color)',
                        cursor: 'pointer'
                      }}
                      onClick={() => setExpandedYear(null)}
                      title="Thu gọn năm"
                    >
                      Th. {i + 1}
                    </th>
                  );
                })}
                <th style={{ width: '85px', textAlign: 'center', fontSize: '11.5px', backgroundColor: 'rgba(245, 78, 0, 0.04)' }}>Tổng Qty</th>
                <th style={{ width: '110px', textAlign: 'center', fontSize: '11.5px', backgroundColor: 'rgba(245, 78, 0, 0.04)' }}>Thành Tiền ($)</th>
              </tr>
            )}
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={canEdit ? 21 : 20} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                  <RefreshCw size={24} className="spin" style={{ margin: '0 auto 10px', display: 'block' }} />
                  Đang tải dữ liệu bảng tính...
                </td>
              </tr>
            )}
            
            {!loading && expenses.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 21 : 20} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-secondary)' }}>
                  Chưa có thông tin thiết bị nào. Nhấp "Thêm dòng mới" để bắt đầu nhập.
                </td>
              </tr>
            )}

            {!loading && expenses.map((row, index) => {
              return (
                <tr key={row.groupId}>
                  {/* STT */}
                  <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-secondary)', background: 'rgba(38,37,30,0.02)' }}>
                    {index + 1}
                  </td>
                  
                  {/* Tên Thiết Bị */}
                  <td>
                    <div className="excel-cell-name">
                      {canEdit ? (
                        <textarea 
                          className="excel-input excel-textarea"
                          placeholder="Nhập tên thiết bị..."
                          rows={1}
                          value={row.name}
                          onChange={e => handleCellChange(row.groupId, null, 'name', e.target.value)}
                          onBlur={handleBlurSave}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.target.blur();
                            }
                          }}
                          onInput={e => {
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                          }}
                          ref={el => {
                            if (el) {
                              el.style.height = 'auto';
                              el.style.height = el.scrollHeight + 'px';
                            }
                          }}
                        />
                      ) : (
                        <div className="excel-cell-text-readonly">{row.name || '—'}</div>
                      )}
                    </div>
                  </td>

                  {/* Loại */}
                  <td>
                    {canEdit ? (
                      <select 
                        className="excel-input"
                        style={{ textAlign: 'center', cursor: 'pointer' }}
                        value={row.type || 'IT'}
                        onChange={e => {
                          handleCellChange(row.groupId, null, 'type', e.target.value);
                          setTimeout(handleBlurSave, 50);
                        }}
                        onBlur={handleBlurSave}
                      >
                        <option value="IT">IT</option>
                        <option value="Other">Other</option>
                      </select>
                    ) : (
                      <div className="excel-cell-text-readonly" style={{ textAlign: 'center' }}>{row.type || '—'}</div>
                    )}
                  </td>

                  {/* Đơn vị */}
                  <td>
                    {canEdit ? (
                      <select 
                        className="excel-input"
                        style={{ textAlign: 'center', cursor: 'pointer' }}
                        value={row.unit || 'pcs'}
                        onChange={e => {
                          handleCellChange(row.groupId, null, 'unit', e.target.value);
                          setTimeout(handleBlurSave, 50);
                        }}
                        onBlur={handleBlurSave}
                      >
                        <option value="pcs">Pcs</option>
                        <option value="set">Set</option>
                        <option value="roll">Roll</option>
                        <option value="box">Box</option>
                      </select>
                    ) : (
                      <div className="excel-cell-text-readonly" style={{ textAlign: 'center' }}>{row.unit || '—'}</div>
                    )}
                  </td>

                  {/* Giá mặc định */}
                  <td>
                    {canEdit ? (
                      <input 
                        type="text" 
                        className="excel-input number"
                        placeholder="0.00"
                        value={row.default_price}
                        onChange={e => handleCellChange(row.groupId, null, 'default_price', e.target.value)}
                        onBlur={handleBlurSave}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.target.blur();
                          }
                        }}
                      />
                    ) : (
                      <div className="excel-cell-readonly">
                        ${(parseFloat(row.default_price) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    )}
                  </td>

                  {/* Year groups */}
                  {YEARS.map(y => {
                    const isExpanded = expandedYear === y;
                    const yearCostTotal = getRowCostTotal(row, y);
                    const yearQtyTotal = getRowQuantityTotal(row, y);
                    
                    if (!isExpanded) {
                      return (
                        <td key={y} style={{ background: 'rgba(38,37,30,0.015)' }}>
                          <div className="excel-cell-readonly" style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                            ${yearCostTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>
                      );
                    }

                    const yearData = row.years[y] || { m1: 0, m2: 0, m3: 0, m4: 0, m5: 0, m6: 0, m7: 0, m8: 0, m9: 0, m10: 0, m11: 0, m12: 0 };
                    
                    return (
                      <React.Fragment key={y}>
                        {Array.from({ length: 12 }, (_, mIdx) => {
                          const monthField = `m${mIdx + 1}`;
                          const isCurrent = mIdx === currentMonthIndex;
                          const isNext = mIdx === nextMonthIndex;
                          let tdClass = '';
                          if (isCurrent) tdClass = 'current-month-col';
                          else if (isNext) tdClass = 'next-month-col';

                          const rawVal = yearData[monthField];
                          const displayVal = (rawVal === 0 || rawVal === '0' || rawVal === '') ? '' : rawVal;
                          const displayReadonlyValue = (parseFloat(rawVal) || 0) === 0 ? '-' : (parseFloat(rawVal) || 0).toLocaleString('en-US');

                          return (
                            <td key={mIdx} className={tdClass}>
                              {canEdit ? (
                                <input 
                                  type="text" 
                                  className="excel-input number"
                                  placeholder="-"
                                  value={displayVal}
                                  onChange={e => handleCellChange(row.groupId, y, monthField, e.target.value)}
                                  onBlur={handleBlurSave}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      e.target.blur();
                                    }
                                  }}
                                />
                              ) : (
                                <div 
                                  className="excel-cell-readonly" 
                                  style={{ opacity: displayReadonlyValue === '-' ? 0.35 : 1 }}
                                >
                                  {displayReadonlyValue}
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* Total Qty for expanded year */}
                        <td style={{ backgroundColor: 'rgba(245, 78, 0, 0.02)' }}>
                          <div className="excel-cell-readonly no-highlight">
                            {yearQtyTotal.toLocaleString('en-US')}
                          </div>
                        </td>

                        {/* Total Cost for expanded year */}
                        <td style={{ backgroundColor: 'rgba(245, 78, 0, 0.02)' }}>
                          <div className="excel-cell-readonly no-highlight" style={{ fontWeight: 'bold' }}>
                            ${yearCostTotal.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </div>
                        </td>
                      </React.Fragment>
                    );
                  })}

                  {/* Action Delete */}
                  {canEdit && (
                    <td>
                      <div className="cell-action">
                        <button 
                          className="action-delete-btn" 
                          title="Xóa dòng"
                          onClick={() => handleDeleteRow(row.groupId, row.name)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}

            {/* TOTAL BOTTOM ROW */}
            {!loading && expenses.length > 0 && (
              <tr className="excel-total-row">
                <td style={{ background: 'var(--bg-sidebar)', textAlign: 'center', fontWeight: 'bold' }}>Σ</td>
                <td className="label" colSpan={4} style={{ fontWeight: 'bold' }}>TOTAL MONEY / THÀNH TIỀN (USD)</td>
                
                {/* Year totals */}
                {YEARS.map(y => {
                  const isExpanded = expandedYear === y;
                  const yearCostTotal = getGrandTotalCost(y);
                  
                  if (!isExpanded) {
                    return (
                      <td key={y} title={`Tổng tiền Năm ${y}`} style={{ fontWeight: 'bold' }}>
                        ${yearCostTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    );
                  }

                  return (
                    <React.Fragment key={y}>
                      {Array.from({ length: 12 }, (_, mIdx) => {
                        const isCurrent = mIdx === currentMonthIndex;
                        const isNext = mIdx === nextMonthIndex;
                        let tdClass = '';
                        if (isCurrent) tdClass = 'current-month-col';
                        else if (isNext) tdClass = 'next-month-col';

                        const monthCostTotal = getMonthTotalCost(y, mIdx + 1);
                        return (
                          <td key={mIdx} className={tdClass} title={`Tổng tiền Tháng ${mIdx + 1} (${y})`}>
                            ${monthCostTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </td>
                        );
                      })}
                      {/* Empty cell for Qty total in expanded year */}
                      <td className="empty"></td>
                      {/* Grand total for expanded year */}
                      <td style={{ fontWeight: 'bold', backgroundColor: 'rgba(245,78,0,0.06)' }}>
                        ${yearCostTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    </React.Fragment>
                  );
                })}

                {canEdit && <td className="empty"></td>}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
