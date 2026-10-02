import React, { useState, useEffect, useRef } from 'react';
import { usePermission } from '../context/PermissionContext';
import { useToast } from '../context/ToastContext';
import { io } from 'socket.io-client';
import { DollarSign, X, Check, RotateCcw, Save } from 'lucide-react';

export default function ExchangeRateWidget() {
  const { hasPermission } = usePermission();
  const toast = useToast();

  const canView = hasPermission('rate.view');
  const canEdit = hasPermission('rate.edit');
  const canDelete = hasPermission('rate.delete');

  const [isOpen, setIsOpen] = useState(false);
  const [rates, setRates] = useState({ USD: 0, JPY: 0 });
  const [inputs, setInputs] = useState({ USD: '', JPY: '' });
  const [saving, setSaving] = useState(false);
  const containerRef = useRef(null);

  const fetchRates = async () => {
    const token = sessionStorage.getItem('token');
    if (!token) return;

    try {
      const res = await fetch('/api/exchange-rates', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        if (data.rateMap) {
          setRates(data.rateMap);
          setInputs({
            USD: data.rateMap.USD !== undefined ? String(data.rateMap.USD) : '0',
            JPY: data.rateMap.JPY !== undefined ? String(data.rateMap.JPY) : '0'
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch exchange rates:', err);
    }
  };

  useEffect(() => {
    if (!canView) return;
    fetchRates();

    const socket = io(window.location.protocol + "//" + window.location.hostname + ":1908");
    socket.on('exchange-rate-updated', (data) => {
      if (data?.rateMap) {
        setRates(data.rateMap);
        setInputs(prev => ({
          USD: data.rateMap.USD !== undefined ? String(data.rateMap.USD) : prev.USD,
          JPY: data.rateMap.JPY !== undefined ? String(data.rateMap.JPY) : prev.JPY
        }));
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [canView]);

  // Click outside to close popup
  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e) {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (!canView) return null;

  const handleSaveAll = async () => {
    const numUSD = parseFloat(String(inputs.USD).replace(/,/g, '').trim());
    const numJPY = parseFloat(String(inputs.JPY).replace(/,/g, '').trim());

    if (isNaN(numUSD) || numUSD < 0) {
      toast.error('Tỷ giá USD không hợp lệ.');
      return;
    }
    if (isNaN(numJPY) || numJPY < 0) {
      toast.error('Tỷ giá JPY không hợp lệ.');
      return;
    }

    setSaving(true);
    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch('/api/exchange-rates', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          rates: {
            USD: numUSD,
            JPY: numJPY
          }
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.rateMap) {
          setRates(data.rateMap);
          setInputs({
            USD: String(data.rateMap.USD),
            JPY: String(data.rateMap.JPY)
          });
        }
        toast.success('Đã lưu thành công tỷ giá ngoại tệ!');
        setIsOpen(false);
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi khi lưu tỷ giá.');
      }
    } catch (err) {
      toast.error('Lỗi kết nối máy chủ.');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (currency) => {
    if (!canDelete) return;
    if (!window.confirm(`Bạn có chắc muốn đặt lại tỷ giá ${currency} về 0?`)) return;

    try {
      const token = sessionStorage.getItem('token');
      const res = await fetch(`/api/exchange-rates/${currency}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const data = await res.json();
        if (data.rateMap) {
          setRates(data.rateMap);
          setInputs(prev => ({ ...prev, [currency]: String(data.rateMap[currency] || 0) }));
        }
        toast.success(`Đã đặt lại tỷ giá ${currency} về 0.`);
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi khi đặt lại tỷ giá.');
      }
    } catch (err) {
      toast.error('Lỗi kết nối máy chủ.');
    }
  };

  return (
    <div className="exchange-rate-container" ref={containerRef}>
      {/* Button Tỷ Giá on Topbar */}
      <button
        type="button"
        className={`exchange-rate-btn ${isOpen ? 'active' : ''}`}
        onClick={() => {
          if (!isOpen) {
            // refresh inputs with current rates when opening
            setInputs({
              USD: String(rates.USD || 0),
              JPY: String(rates.JPY || 0)
            });
          }
          setIsOpen(!isOpen);
        }}
        title="Bảng Tỷ Giá Ngoại Tệ"
      >
        <DollarSign size={16} />
        <span>Tỷ Giá</span>
      </button>

      {/* Popup / Dropdown */}
      {isOpen && (
        <div className="exchange-rate-popup">
          <div className="popup-header">
            <div className="popup-title">
              <DollarSign size={16} className="popup-icon" />
              <span>Tỷ Giá Ngoại Tệ</span>
            </div>
            <button
              type="button"
              className="popup-close-btn"
              onClick={() => setIsOpen(false)}
            >
              <X size={16} />
            </button>
          </div>

          <div className="popup-body">
            {/* Mục 1: USD = VND */}
            <div className="popup-rate-card">
              <div className="rate-card-header">
                <span className="rate-badge usd">USD</span>
                <span className="rate-title">Đô la Mỹ (USD)</span>
              </div>
              <div className="rate-card-row">
                <span className="rate-prefix">1 USD =</span>
                {canEdit ? (
                  <div className="rate-input-field">
                    <input
                      type="text"
                      className="popup-input"
                      value={inputs.USD}
                      onChange={(e) => setInputs(prev => ({ ...prev, USD: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveAll();
                      }}
                      placeholder="25,450"
                    />
                    <span className="rate-suffix">VND</span>
                  </div>
                ) : (
                  <div className="rate-readonly-value">
                    <span>{(rates.USD || 0).toLocaleString('vi-VN')}</span>
                    <span className="rate-suffix">VND</span>
                  </div>
                )}
                {canDelete && (rates.USD || 0) > 0 && (
                  <button
                    type="button"
                    className="rate-card-reset"
                    title="Đặt lại tỷ giá USD về 0"
                    onClick={() => handleReset('USD')}
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
            </div>

            {/* Mục 2: JPY = VND */}
            <div className="popup-rate-card">
              <div className="rate-card-header">
                <span className="rate-badge jpy">JPY</span>
                <span className="rate-title">Yên Nhật (JPY)</span>
              </div>
              <div className="rate-card-row">
                <span className="rate-prefix">1 JPY =</span>
                {canEdit ? (
                  <div className="rate-input-field">
                    <input
                      type="text"
                      className="popup-input"
                      value={inputs.JPY}
                      onChange={(e) => setInputs(prev => ({ ...prev, JPY: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveAll();
                      }}
                      placeholder="165"
                    />
                    <span className="rate-suffix">VND</span>
                  </div>
                ) : (
                  <div className="rate-readonly-value">
                    <span>{(rates.JPY || 0).toLocaleString('vi-VN')}</span>
                    <span className="rate-suffix">VND</span>
                  </div>
                )}
                {canDelete && (rates.JPY || 0) > 0 && (
                  <button
                    type="button"
                    className="rate-card-reset"
                    title="Đặt lại tỷ giá JPY về 0"
                    onClick={() => handleReset('JPY')}
                  >
                    <RotateCcw size={13} />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="popup-footer">
            {canEdit ? (
              <button
                type="button"
                className="popup-save-btn"
                onClick={handleSaveAll}
                disabled={saving}
              >
                <Save size={14} />
                <span>{saving ? 'Đang lưu...' : 'Lưu Tỷ Giá'}</span>
              </button>
            ) : (
              <div className="popup-hint">Chế độ xem (chưa được cấp quyền sửa)</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
