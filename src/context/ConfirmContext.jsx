import React, { createContext, useContext, useState, useCallback } from 'react';

const ConfirmContext = createContext();

export const useConfirm = () => {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error('useConfirm must be used within a ConfirmProvider');
  return context;
};

export const ConfirmProvider = ({ children }) => {
  const [state, setState] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null,
    type: 'danger', // danger, info, warning
    verificationText: null,
    inputType: null, // 'text', 'date', etc.
    inputValue: ''
  });

  const confirm = useCallback((options) => {
    setState({
      isOpen: true,
      title: options.title || 'Xác nhận',
      message: options.message || 'Bạn có chắc chắn muốn thực hiện hành động này?',
      onConfirm: options.onConfirm || null,
      onCancel: options.onCancel || null,
      type: options.type || 'danger',
      verificationText: options.verificationText || null,
      inputType: options.inputType || null,
      inputValue: options.inputValue || ''
    });
  }, []);

  const closeConfirm = useCallback(() => {
    setState((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return (
    <ConfirmContext.Provider value={{ confirm, closeConfirm, ...state }}>
      {children}
    </ConfirmContext.Provider>
  );
};
