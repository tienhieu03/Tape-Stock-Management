import React, { useState, useMemo, useEffect } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Package, Save, X, RefreshCw, Calendar } from 'lucide-react';
import { useToast } from '../context/ToastContext';
import { usePermission } from '../context/PermissionContext';

const MONTHS = [
  'Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4',
  'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8',
  'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'
];

export default function Home() {
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [animating, setAnimating] = useState(false);

  // Stock Update Feature
  const [showStockModal, setShowStockModal] = useState(false);
  const [activeTab, setActiveTab] = useState('nvl');
  const [nvls, setNvls] = useState([]);
  const [tapes, setTapes] = useState([]);
  const [stockUpdates, setStockUpdates] = useState({});
  const [tapeStockUpdates, setTapeStockUpdates] = useState({});
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  const { hasPermission } = usePermission();

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && showStockModal && !saving) {
        setShowStockModal(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [showStockModal, saving]);

  const handleMonthClick = (index) => {
    setAnimating(true);
    setTimeout(() => {
      setSelectedMonth(index);
      setAnimating(false);
    }, 300);
  };

  const handleBack = () => {
    setAnimating(true);
    setTimeout(() => {
      setSelectedMonth(null);
      setAnimating(false);
    }, 300);
  };

  const handleYearChange = (delta) => {
    setSelectedYear(prev => prev + delta);
  };

  const fetchStocks = async () => {
    const authHeaders = { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` };
    try {
      // Fetch NVL
      const nvlRes = await fetch('/api/nvl', { headers: authHeaders });
      if (nvlRes.ok) {
        const data = await nvlRes.json();
        setNvls(data);
        const updates = {};
        data.forEach(item => { updates[item.id] = item.nvl_stock; });
        setStockUpdates(updates);
      }

      // Fetch Tape
      const tapeRes = await fetch('/api/tape', { headers: authHeaders });
      if (tapeRes.ok) {
        const data = await tapeRes.json();
        setTapes(data);
        const updates = {};
        data.forEach(item => { updates[item.id] = item.stock; });
        setTapeStockUpdates(updates);
      }
    } catch (e) {
      toast.error('Lỗi kết nối khi tải danh sách vật tư.');
    }
  };

  const handleOpenStockUpdate = () => {
    fetchStocks();
    setShowStockModal(true);
  };

  const handleStockChange = (id, value) => {
    if (activeTab === 'nvl') {
      setStockUpdates(prev => ({ ...prev, [id]: value }));
    } else {
      setTapeStockUpdates(prev => ({ ...prev, [id]: value }));
    }
  };

  const handleSaveStock = async () => {
    setSaving(true);
    let successCount = 0;
    let failCount = 0;

    const changedNvls = nvls.filter(item =>
      parseFloat(item.nvl_stock) !== parseFloat(stockUpdates[item.id])
    );

    const changedTapes = tapes.filter(item =>
      parseFloat(item.stock) !== parseFloat(tapeStockUpdates[item.id])
    );

    if (changedNvls.length === 0 && changedTapes.length === 0) {
      toast.info('Không có thay đổi nào để cập nhật.');
      setSaving(false);
      setShowStockModal(false);
      return;
    }

    const authHeaders = {
      'Authorization': `Bearer ${sessionStorage.getItem('token')}`,
      'Content-Type': 'application/json'
    };

    // Update NVL
    for (const item of changedNvls) {
      try {
        const res = await fetch(`/api/nvl/${item.id}/stock`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ nvl_stock: stockUpdates[item.id] })
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch (e) { failCount++; }
    }

    // Update Tape (Current Batch)
    for (const item of changedTapes) {
      try {
        const res = await fetch(`/api/tape/batch/${item.batch_id}/stock`, {
          method: 'PATCH',
          headers: authHeaders,
          body: JSON.stringify({ stock: tapeStockUpdates[item.id] })
        });
        if (res.ok) successCount++;
        else failCount++;
      } catch (e) { failCount++; }
    }

    setSaving(false);
    if (successCount > 0) {
      toast.success(`Đã cập nhật Stock cho ${successCount} mục.`);
      setShowStockModal(false);
    }
    if (failCount > 0) {
      toast.error(`Thất bại ${failCount} mục.`);
    }
  };

  // Logic for the detailed month view
  const { days, padding } = useMemo(() => {
    if (selectedMonth === null) return { days: [], padding: [] };
    const date = new Date(selectedYear, selectedMonth + 1, 0);
    const numDays = date.getDate();
    const firstDay = new Date(selectedYear, selectedMonth, 1).getDay();
    const offset = (firstDay === 0) ? 6 : firstDay - 1;
    return {
      days: Array.from({ length: numDays }, (_, i) => i + 1),
      padding: Array.from({ length: offset }, (_, i) => i)
    };
  }, [selectedMonth, selectedYear]);

  if (selectedMonth !== null) {
    return (
      <div className={`calendar-detail-view ${animating ? 'fade-out' : 'fade-in'}`}>
        <div className="month-header-sticky">
          <button className="back-btn" onClick={handleBack}>
            <ArrowLeft size={18} /> Quay lại
          </button>
          <h2>{MONTHS[selectedMonth]} {selectedYear}</h2>
        </div>

        <div className="month-grid">
          {['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CN'].map(d => (
            <div key={d} className="day-header">{d}</div>
          ))}
          {padding.map(i => (
            <div key={`pad-${i}`} className="day-cell padding"></div>
          ))}
          {days.map(day => (
            <div key={day} className="day-cell">
              <span className="day-number">{day}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className={`calendar-year-view ${animating ? 'zoom-out' : 'zoom-in'}`}>
        <div className="home-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ background: 'var(--bg-sidebar)', padding: '8px', borderRadius: '10px', display: 'flex' }}>
              <Calendar size={24} color="var(--color-accent)" />
            </div>
            <h1 className="home-title" style={{ margin: 0 }}>Lịch Năm</h1>
          </div>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            {hasPermission('nvl.stock') && (
              <button className="btn-primary" onClick={handleOpenStockUpdate}>
                <RefreshCw size={18} /> Cập nhật Stock
              </button>
            )}
            <div className="year-selector">
              <button onClick={() => handleYearChange(-1)}><ChevronLeft size={20} /></button>
              <span>{selectedYear}</span>
              <button onClick={() => handleYearChange(1)}><ChevronRight size={20} /></button>
            </div>
          </div>
        </div>

        <div className="year-grid">
          {MONTHS.map((month, idx) => (
            <div key={idx} className="month-card" onClick={() => handleMonthClick(idx)}>
              <h3>{month}</h3>
            </div>
          ))}
        </div>
      </div>

      {/* STOCK UPDATE MODAL */}
      {showStockModal && (
        <div className="modal-overlay" onClick={() => !saving && setShowStockModal(false)}>
          <div className="modal-box" style={{ maxWidth: '1000px', height: '85vh', display: 'flex', flexDirection: 'column', padding: 0 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ background: 'var(--color-accent)', padding: '6px', borderRadius: '8px', color: 'white', display: 'flex' }}>
                  <Package size={20} />
                </div>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 600 }}>Cập nhật Stock nhanh</h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 400 }}>Điều chỉnh số lượng tồn kho cho các vật tư</p>
                </div>
              </div>
              <button className="action-btn" onClick={() => setShowStockModal(false)}><X size={20} /></button>
            </div>

            <div className="modal-content" style={{ padding: '0', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-tabs" style={{ 
                position: 'relative', 
                display: 'flex', 
                borderBottom: '1px solid var(--border-color)', 
                background: 'var(--bg-sidebar)',
                padding: '0 12px'
              }}>
                <button 
                  className={`modal-tab-btn ${activeTab === 'nvl' ? 'active' : ''}`}
                  onClick={() => setActiveTab('nvl')}
                  style={{ 
                    flex: 1,
                    padding: '16px 24px', 
                    border: 'none', 
                    background: 'none', 
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: activeTab === 'nvl' ? 'var(--color-accent)' : 'var(--text-secondary)',
                    transition: 'color 0.3s',
                    zIndex: 2
                  }}
                >
                  Nguyên Vật Liệu (NVL)
                </button>
                <button 
                  className={`modal-tab-btn ${activeTab === 'tape' ? 'active' : ''}`}
                  onClick={() => setActiveTab('tape')}
                  style={{ 
                    flex: 1,
                    padding: '16px 24px', 
                    border: 'none', 
                    background: 'none', 
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: 600,
                    color: activeTab === 'tape' ? 'var(--color-accent)' : 'var(--text-secondary)',
                    transition: 'color 0.3s',
                    zIndex: 2
                  }}
                >
                  Bonding Tape
                </button>
                {/* Sliding Indicator */}
                <div style={{
                  position: 'absolute',
                  bottom: 0,
                  left: activeTab === 'nvl' ? '12px' : 'calc(50% + 6px)',
                  width: 'calc(50% - 18px)',
                  height: '2px',
                  background: 'var(--color-accent)',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  zIndex: 1
                }} />
              </div>

              <div className="stock-list-container" style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-main)' }}>
                <table className="nvl-table stock-quick-table" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-sidebar)' }}>
                    <tr>
                      <th style={{ paddingLeft: '24px', width: '35%', borderBottom: '1px solid var(--border-color)' }}>Tên vật tư</th>
                      <th style={{ width: '20%', borderBottom: '1px solid var(--border-color)' }}>{activeTab === 'nvl' ? 'Item Code' : 'Vendor'}</th>
                      <th style={{ width: '20%', textAlign: 'left', borderBottom: '1px solid var(--border-color)' }}>Hiện tại</th>
                      <th style={{ width: '25%', paddingRight: '24px', borderBottom: '1px solid var(--border-color)' }}>Số lượng mới</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeTab === 'nvl' ? nvls.map(item => (
                      <tr key={item.id} className="nvl-row">
                        <td style={{ paddingLeft: '24px' }}>
                          <span className="text-truncate-strict" title={item.nvl_name} style={{ fontWeight: 500 }}>
                            {item.nvl_name}
                          </span>
                        </td>
                        <td><code style={{ fontSize: '12px', opacity: 0.8 }}>{item.nvl_item_code || '—'}</code></td>
                        <td style={{ textAlign: 'left' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{item.nvl_stock}</span>
                        </td>
                        <td style={{ paddingRight: '24px' }}>
                          <input
                            type="number"
                            className="settings-input"
                            style={{ 
                              padding: '8px 12px', 
                              fontSize: '14px', 
                              width: '100%', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: '8px', 
                              backgroundColor: 'var(--bg-sidebar)', 
                              color: 'var(--text-primary)', 
                              outline: 'none',
                              textAlign: 'left'
                            }}
                            value={stockUpdates[item.id] ?? ''}
                            onChange={(e) => handleStockChange(item.id, e.target.value)}
                          />
                        </td>
                      </tr>
                    )) : tapes.map(item => (
                      <tr key={item.id} className="nvl-row">
                        <td style={{ paddingLeft: '24px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span className="text-truncate-strict" title={item.name} style={{ fontWeight: 500 }}>{item.name}</span>
                            <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{item.batch_status || 'CURRENT'}</span>
                          </div>
                        </td>
                        <td><span style={{ fontSize: '12px', opacity: 0.8 }}>{item.vendor || '—'}</span></td>
                        <td style={{ textAlign: 'left' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>{item.stock}</span>
                        </td>
                        <td style={{ paddingRight: '24px' }}>
                          <input
                            type="number"
                            className="settings-input"
                            style={{ 
                              padding: '8px 12px', 
                              fontSize: '14px', 
                              width: '100%', 
                              border: '1px solid var(--border-color)', 
                              borderRadius: '8px', 
                              backgroundColor: 'var(--bg-sidebar)', 
                              color: 'var(--text-primary)', 
                              outline: 'none',
                              textAlign: 'left'
                            }}
                            value={tapeStockUpdates[item.id] ?? ''}
                            onChange={(e) => handleStockChange(item.id, e.target.value)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ padding: '20px 24px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '12px', background: 'var(--bg-sidebar)', borderBottomLeftRadius: '12px', borderBottomRightRadius: '12px' }}>
              <button className="btn-secondary" style={{ padding: '8px 20px' }} onClick={() => setShowStockModal(false)} disabled={saving}>Hủy</button>
              <button className="btn-primary" style={{ padding: '8px 24px' }} onClick={handleSaveStock} disabled={saving}>
                {saving ? (
                  <>
                    <RefreshCw size={18} className="spin" style={{ marginRight: '8px' }} />
                    Đang lưu...
                  </>
                ) : (
                  <>
                    <Save size={18} style={{ marginRight: '8px' }} />
                    Lưu tất cả thay đổi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
