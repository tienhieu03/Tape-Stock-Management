import React, { useState, useEffect } from 'react';
import { AlertCircle, HelpCircle, X } from 'lucide-react';
import { useConfirm } from '../context/ConfirmContext';

const ConfirmModal = () => {
  const { isOpen, title, message, onConfirm, onCancel, type, verificationText, inputType, inputValue: initialInputValue, closeConfirm } = useConfirm();
  const [inputValue, setInputValue] = useState('');

  // Reset input when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setInputValue(initialInputValue || '');
    } else {
      setInputValue('');
    }
  }, [isOpen, initialInputValue]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) {
        handleCancel();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    if (verificationText && inputValue.toLowerCase() !== verificationText.toLowerCase()) {
      return;
    }
    if (onConfirm) onConfirm(inputValue);
    closeConfirm();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    closeConfirm();
  };

  const isConfirmDisabled = verificationText && inputValue.toLowerCase() !== verificationText.toLowerCase();

  return (
    <div className="modal-overlay confirm-overlay" onClick={handleCancel}>
      <div className="modal-box confirm-box" onClick={(e) => e.stopPropagation()}>
        <button className="confirm-close" onClick={handleCancel}>
          <X size={18} />
        </button>
        
        <div className="confirm-content">
          <div className={`confirm-icon-wrap ${type}`}>
            {type === 'danger' ? <AlertCircle size={32} /> : <HelpCircle size={32} />}
          </div>
          
          <div className="confirm-text">
            <h3>{title}</h3>
            <p>{message}</p>
            
            {inputType && (
              <div className="verification-zone" style={{ marginTop: '16px', textAlign: 'center' }}>
                {inputType === 'date' && (
                  <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                    Ngày thực tế nhận:
                  </label>
                )}
                <input 
                  type={inputType}
                  autoFocus
                  className="settings-input"
                  style={{ width: '100%', textAlign: 'center', borderColor: 'var(--color-accent)' }}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                />
              </div>
            )}

            {verificationText && (
              <div className="verification-zone" style={{ marginTop: '16px', textAlign: 'center' }}>
                <label style={{ fontSize: '13px', color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
                  Vui lòng nhập <strong style={{ color: 'var(--color-error)' }}>"{verificationText}"</strong> để xác nhận:
                </label>
                <input 
                  autoFocus
                  className="settings-input"
                  style={{ width: '100%', textAlign: 'center', borderColor: isConfirmDisabled ? 'var(--border-color)' : 'var(--color-success)' }}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  placeholder={`Gõ ${verificationText}...`}
                />
              </div>
            )}
          </div>
        </div>

        <div className="confirm-footer">
          <button className="btn-secondary" style={{ justifyContent: 'center' }} onClick={handleCancel}>Hủy bỏ</button>
          <button 
            className={`btn-primary ${type === 'danger' ? 'btn-danger-solid' : ''}`} 
            style={{ 
              opacity: isConfirmDisabled ? 0.5 : 1, 
              cursor: isConfirmDisabled ? 'not-allowed' : 'pointer',
              justifyContent: 'center'
            }}
            onClick={handleConfirm}
            disabled={isConfirmDisabled}
          >
            Xác nhận
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
