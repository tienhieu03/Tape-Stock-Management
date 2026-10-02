import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save } from 'lucide-react';
import { io } from 'socket.io-client';
import { useToast } from '../context/ToastContext';
import { usePermission } from '../context/PermissionContext';

const API_PO = '/api/po';
const API_VENDORS = '/api/vendors';
const API_NVL = '/api/nvl';

const headers = () => ({
  'Authorization': `Bearer ${sessionStorage.getItem('token')}`,
  'Content-Type': 'application/json'
});

const COST_TYPES = [
  "Direct Sub-Materials expense",
  "Equipment Expense"
];

export default function POFormModal({ po, initialDetails, onClose, onRefresh }) {
  const isEditing = !!po;
  const toast = useToast();
  const { hasPermission } = usePermission();
  
  const [vendors, setVendors] = useState([]);
  const [nvls, setNvls] = useState([]);
  const [rates, setRates] = useState({ USD: 25450, JPY: 165 });
  
  const [form, setForm] = useState({
    po_number: '',
    vendor_id: '',
    order_date: new Date().toISOString().split('T')[0],
    cost_type: COST_TYPES[0],
    eta: '',
    received_date: '',
    receiver_name: '',
    details: []
  });

  useEffect(() => {
    fetchInitialData();

    // Listen for real-time exchange rate updates
    const socket = io(window.location.protocol + "//" + window.location.hostname + ":1908");
    socket.on('exchange-rate-updated', (data) => {
      if (data?.rateMap) {
        setRates(data.rateMap);
      }
    });
    return () => socket.disconnect();
  }, []);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    if (isEditing) {
      loadPoData();
    } else if (initialDetails) {
      // Map selected NVLs from state to PO details structure
      setForm(f => ({
        ...f,
        details: initialDetails.map(n => ({
          nvl_id: n.id,
          quantity: '',
          total_amount: '',
          price: n.nvl_price,
          currency: n.nvl_money_type
        }))
      }));
    }
  }, [po, initialDetails]);

  const fetchInitialData = async () => {
    try {
      const [resV, resN, resR] = await Promise.all([
        fetch(API_VENDORS, { headers: headers() }),
        fetch(API_NVL, { headers: headers() }),
        fetch('/api/exchange-rates', { headers: headers() })
      ]);
      if (resV.ok) setVendors(await resV.json());
      if (resN.ok) setNvls(await resN.json());
      if (resR.ok) {
        const dataR = await resR.json();
        if (dataR.rateMap) setRates(dataR.rateMap);
      }
    } catch (e) {
      toast.error('Lỗi tải dữ liệu khởi tạo.');
    }
  };

  // Convert unit price in any currency to USD using current exchange rates
  const getUnitPriceInUSD = (priceVal, currencyVal) => {
    const price = parseFloat(priceVal);
    if (isNaN(price) || price <= 0) return 0;
    const rateUSD = parseFloat(rates?.USD) || 25450;
    const rateJPY = parseFloat(rates?.JPY) || 165;
    const curr = String(currencyVal || 'VND').trim().toUpperCase();

    if (curr === 'USD') return price;
    if (curr === 'JPY' || curr === 'YEN') return (price * rateJPY) / rateUSD;
    return price / rateUSD; // Default VND
  };

  // Calculate Amount in USD = Quantity * UnitPriceUSD
  const calculateAmount = (qtyVal, priceVal, currencyVal) => {
    const qty = parseFloat(qtyVal);
    if (isNaN(qty) || qty <= 0) return '';
    const unitPriceUSD = getUnitPriceInUSD(priceVal, currencyVal);
    if (unitPriceUSD <= 0) return '';
    const total = unitPriceUSD * qty;
    return Number(total.toFixed(2));
  };

  const loadPoData = async () => {
    if (!po) return;
    let computedEta = po.eta || '';
    if (!computedEta && po.order_date && po.leadtime && parseFloat(po.leadtime) > 0) {
      const d = new Date(po.order_date);
      d.setDate(d.getDate() + Math.round(parseFloat(po.leadtime)));
      computedEta = d.toISOString().split('T')[0];
    }

    let initialAmount = po.total_amount;
    if ((!initialAmount || parseFloat(initialAmount) === 0) && po.quantity && po.price) {
      const computed = calculateAmount(po.quantity, po.price, po.currency);
      if (computed !== '') initialAmount = computed;
    }

    setForm({
      po_number: po.po_number || '',
      vendor_id: po.vendor_id || '',
      order_date: po.order_date || '',
      cost_type: po.cost_type || COST_TYPES[0],
      eta: computedEta,
      received_date: po.received_date || '',
      receiver_name: po.receiver_name || '',
      details: (po.nvl_id || po.bonding_tape_batch_id) ? [{ 
        nvl_id: po.nvl_id || null, 
        bonding_tape_batch_id: po.bonding_tape_batch_id || null,
        nvl_name: po.nvl_name || '', // Store name for display if not in select
        quantity: po.quantity, 
        total_amount: initialAmount,
        expiry: po.expiry || '',
        price: po.price,
        currency: po.currency
      }] : []
    });
  };

  const handleOrderDateChange = (newDate) => {
    setForm(f => {
      let updatedEta = f.eta;
      const leadtime = po?.leadtime;
      if (leadtime && parseFloat(leadtime) > 0 && newDate) {
        const d = new Date(newDate);
        d.setDate(d.getDate() + Math.round(parseFloat(leadtime)));
        updatedEta = d.toISOString().split('T')[0];
      }
      return { ...f, order_date: newDate, eta: updatedEta };
    });
  };

  const handleAddDetail = () => {
    setForm(f => ({
      ...f,
      details: [...f.details, { nvl_id: '', quantity: '', total_amount: '', expiry: '', price: 0, currency: 'VND' }]
    }));
  };

  const handleRemoveDetail = (index) => {
    const newDetails = [...form.details];
    newDetails.splice(index, 1);
    setForm(f => ({ ...f, details: newDetails }));
  };

  const handleDetailChange = (index, field, value) => {
    const newDetails = [...form.details];
    newDetails[index][field] = value;

    // Auto calculate when selecting NVL
    if (field === 'nvl_id') {
      const selectedNvl = nvls.find(n => n.id === parseInt(value));
      if (selectedNvl) {
        newDetails[index].price = selectedNvl.nvl_price;
        newDetails[index].currency = selectedNvl.nvl_money_type;
        if (newDetails[index].quantity) {
          const autoAmount = calculateAmount(newDetails[index].quantity, selectedNvl.nvl_price, selectedNvl.nvl_money_type);
          if (autoAmount !== '') {
            newDetails[index].total_amount = autoAmount;
          }
        }
      }
    }

    // Auto calculate Amount when user types Quantity
    if (field === 'quantity') {
      let price = newDetails[index].price;
      let currency = newDetails[index].currency;

      if (newDetails[index].nvl_id) {
        const selectedNvl = nvls.find(n => n.id === parseInt(newDetails[index].nvl_id));
        if (selectedNvl) {
          price = selectedNvl.nvl_price;
          currency = selectedNvl.nvl_money_type;
        }
      } else if (newDetails[index].bonding_tape_batch_id) {
        price = po?.price;
        currency = po?.currency || 'USD';
      }

      const autoAmount = calculateAmount(value, price, currency);
      if (autoAmount !== '') {
        newDetails[index].total_amount = autoAmount;
      }
    }

    setForm(f => {
      let updatedEta = f.eta;
      if (field === 'nvl_id' && value && (!f.eta || f.eta === '')) {
        const selectedNvl = nvls.find(n => n.id === parseInt(value));
        if (selectedNvl && selectedNvl.nvl_leadtime && parseFloat(selectedNvl.nvl_leadtime) > 0 && f.order_date) {
          const d = new Date(f.order_date);
          d.setDate(d.getDate() + Math.round(parseFloat(selectedNvl.nvl_leadtime)));
          updatedEta = d.toISOString().split('T')[0];
        }
      }
      return { ...f, details: newDetails, eta: updatedEta };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // If a DRAFT prefix is present, demand valid PO number before finalizing
    if (form.po_number && form.po_number.startsWith('DRAFT-')) {
        toast.error('Vui lòng nhập Mã PO hợp lệ (thay thế mã DRAFT).');
        return;
    }

    if (!form.vendor_id) {
      toast.error('Vui lòng chọn Nhà cung cấp.');
      return;
    }

    if (!form.order_date || !form.eta) {
        toast.error('Vui lòng nhập Ngày đặt hàng và Ngày hàng đến dự kiến.');
        return;
    }

    if (!form.receiver_name) {
      toast.error('Vui lòng nhập Tên người nhận hàng.');
      return;
    }

    if (form.details.length === 0) {
      toast.error('Vui lòng thêm ít nhất một mặt hàng.');
      return;
    }

    // Check if any detail has 0 quantity or price
    const invalidDetails = form.details.some(d => !d.quantity || d.quantity <= 0);
    if (invalidDetails) {
        toast.error('Vui lòng nhập số lượng hợp lệ cho tất cả mặt hàng.');
        return;
    }

    try {
      const url = isEditing ? `${API_PO}/${po.po_id}` : API_PO;
      const method = isEditing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: headers(),
        body: JSON.stringify(form)
      });

      if (res.ok) {
        toast.success(isEditing ? 'Đã cập nhật PO.' : 'Đã tạo PO thành công.');
        onRefresh();
        onClose();
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi xử lý PO.');
      }
    } catch (e) {
      toast.error('Lỗi kết nối.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: '900px', width: '95%' }} onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{isEditing ? `Sửa PO: ${po.po_number || 'Bản nháp'}` : 'Thêm Purchase Order mới'}</h2>
          <button className="action-btn" onClick={onClose}><X size={18}/></button>
        </div>

        <div className="modal-content">
          <form onSubmit={handleSubmit} className="nvl-form">
            <div className="nvl-form-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="input-group">
                <label>Mã PO</label>
                <input value={form.po_number} onChange={e => setForm(f => ({...f, po_number: e.target.value}))}/>
              </div>
              <div className="input-group">
                <label>Nhà cung cấp <span className="required">*</span></label>
                <select required className="settings-select" value={form.vendor_id} onChange={e => setForm(f => ({...f, vendor_id: e.target.value}))}>
                  <option value="">-- Chọn --</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.vendor_name}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>Ngày đặt hàng</label>
                <input type="date" value={form.order_date} onChange={e => handleOrderDateChange(e.target.value)}/>
              </div>
              <div className="input-group">
                <label>Loại chi phí</label>
                <select className="settings-select" value={form.cost_type} onChange={e => setForm(f => ({...f, cost_type: e.target.value}))}>
                  {COST_TYPES.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                </select>
              </div>
              <div className="input-group">
                <label>
                  Ngày hàng đến dự kiến (ETA)
                  {po?.leadtime ? (
                    <span style={{ fontSize: '11px', color: 'var(--color-accent)', fontWeight: 'normal', marginLeft: '6px' }}>
                      ({po.leadtime} ngày leadtime)
                    </span>
                  ) : null}
                </label>
                <input type="date" value={form.eta} onChange={e => setForm(f => ({...f, eta: e.target.value}))}/>
              </div>
              <div className="input-group">
                <label>Ngày thực tế nhận</label>
                <input type="date" value={form.received_date} onChange={e => setForm(f => ({...f, received_date: e.target.value}))}/>
              </div>
              <div className="input-group">
                <label>Người nhận hàng</label>
                <input 
                  placeholder="Họ tên người nhận..."
                  value={form.receiver_name} 
                  onChange={e => setForm(f => ({...f, receiver_name: e.target.value}))}
                />
              </div>
            </div>

            <div style={{ marginTop: '24px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <h3 style={{ fontSize: '14px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>Chi tiết mặt hàng</h3>
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                    Tỷ giá: 1 USD = {Number(rates.USD || 25450).toLocaleString()} VND | 1 JPY = {Number(rates.JPY || 165).toLocaleString()} VND
                  </span>
                </div>
              </div>

              <div className="po-details-table-wrap" style={{ border: '1px solid var(--border-color)', borderRadius: '8px', overflow: 'hidden' }}>
                <table className="nvl-table" style={{ margin: 0 }}>
                  <thead style={{ background: 'var(--bg-sidebar)' }}>
                    <tr>
                      <th style={{ width: form.details.some(d => d.bonding_tape_batch_id) ? '40%' : '50%' }}>Nguyên vật liệu</th>
                      <th style={{ width: form.details.some(d => d.bonding_tape_batch_id) ? '20%' : '25%' }}>Số lượng</th>
                      <th style={{ width: form.details.some(d => d.bonding_tape_batch_id) ? '25%' : '25%' }}>
                        Thành tiền (USD)
                        <span style={{ display: 'block', fontSize: '11px', color: 'var(--color-accent)', fontWeight: 'normal', textTransform: 'none' }}>
                          (Tự động quy đổi)
                        </span>
                      </th>
                      {form.details.some(d => d.bonding_tape_batch_id) && (
                        <th style={{ width: '15%' }}>Hạn sử dụng</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {form.details.map((detail, idx) => (
                      <tr key={idx}>
                        <td>
                          {detail.bonding_tape_batch_id ? (
                            <div className="settings-input" style={{ width: '100%', border: 'none', background: 'transparent', padding: '8px 12px', fontWeight: 500 }}>
                              {detail.nvl_name || 'Keo (Tape)'}
                            </div>
                          ) : (
                            <select 
                              className="settings-select" 
                              style={{ width: '100%', border: 'none', background: 'transparent' }}
                              value={detail.nvl_id || ''} 
                              onChange={e => handleDetailChange(idx, 'nvl_id', e.target.value)}
                            >
                              <option value="">-- Chọn NVL --</option>
                              {nvls.map(n => <option key={n.id} value={n.id}>{n.nvl_name}</option>)}
                            </select>
                          )}
                        </td>
                        <td>
                          <input 
                            type="number" step="any"
                            className="settings-input" 
                            style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'berkeleyMono' }}
                            placeholder="0.00"
                            value={detail.quantity} 
                            onChange={e => handleDetailChange(idx, 'quantity', e.target.value)}
                          />
                        </td>
                        <td>
                          <input 
                            type="number" step="any"
                            className="settings-input" 
                            style={{ width: '100%', border: 'none', background: 'transparent', fontFamily: 'berkeleyMono' }}
                            placeholder="0.00"
                            value={detail.total_amount} 
                            onChange={e => handleDetailChange(idx, 'total_amount', e.target.value)}
                          />
                          {(() => {
                            let p = detail.price;
                            let c = detail.currency;
                            if (detail.nvl_id) {
                              const n = nvls.find(item => item.id === parseInt(detail.nvl_id));
                              if (n) { p = n.nvl_price; c = n.nvl_money_type; }
                            } else if (detail.bonding_tape_batch_id) {
                              p = po?.price; c = po?.currency || 'USD';
                            }
                            if (p && parseFloat(p) > 0) {
                              const usdRate = getUnitPriceInUSD(p, c);
                              return (
                                <div style={{ fontSize: '11px', color: 'var(--text-secondary)', padding: '2px 4px 0 4px', whiteSpace: 'nowrap' }}>
                                  Đơn giá: {Number(p).toLocaleString()} {c || 'VND'} {String(c || 'VND').toUpperCase() !== 'USD' ? `(~${usdRate < 0.01 ? usdRate.toFixed(4) : usdRate.toFixed(2)} USD)` : ''}
                                </div>
                              );
                            }
                            return null;
                          })()}
                        </td>
                        {form.details.some(d => d.bonding_tape_batch_id) && (
                          <td>
                            {detail.bonding_tape_batch_id ? (
                              <input 
                                type="date"
                                className="settings-input" 
                                style={{ width: '100%', border: 'none', background: 'transparent' }}
                                value={detail.expiry || ''} 
                                onChange={e => handleDetailChange(idx, 'expiry', e.target.value)}
                              />
                            ) : null}
                          </td>
                        )}
                      </tr>
                    ))}
                    {form.details.length === 0 && (
                      <tr>
                        <td colSpan={form.details.some(d => d.bonding_tape_batch_id) ? 4 : 3} style={{ textAlign: 'center', padding: '20px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                          Chưa có mặt hàng nào.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '30px' }}>
              <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
              <button type="submit" className="btn-primary">
                <Save size={18} style={{ marginRight: '8px' }}/> {isEditing ? 'Lưu thay đổi' : 'Tạo PO'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
