import React, { useEffect, useState, useRef } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { useToast } from '../context/ToastContext';

const ICONS = {
  success: <CheckCircle2 className="toast-icon success" size={20} />,
  error: <AlertCircle className="toast-icon error" size={20} />,
  warning: <AlertTriangle className="toast-icon warning" size={20} />,
  info: <Info className="toast-icon info" size={20} />,
};

const Toast = ({ id, message, type }) => {
  const { removeToast } = useToast();
  const [isFading, setIsFading] = useState(false);
  const timerRef = useRef(null);
  const duration = 2500; // 2.5 seconds (2.0 display + 0.5 fade)

  const handleRemove = () => {
    setIsFading(true);
    setTimeout(() => removeToast(id), 400); // match CSS transition
  };

  useEffect(() => {
    timerRef.current = setTimeout(handleRemove, duration);
    return () => clearTimeout(timerRef.current);
  }, [id]);

  const pauseTimer = () => clearTimeout(timerRef.current);
  const resumeTimer = () => {
    timerRef.current = setTimeout(handleRemove, duration / 2); // resume with half time if paused
  };

  return (
    <div 
      className={`toast-item ${type} ${isFading ? 'fadeOut' : 'fadeIn'}`}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
    >
      <div className="toast-content">
        {ICONS[type]}
        <span className="toast-message">{message}</span>
      </div>
      <button className="toast-close" onClick={handleRemove}>
        <X size={14} />
      </button>
      <div className="toast-progress-bar">
        <div className="toast-progress-fill" style={{ animationDuration: `${duration}ms` }} />
      </div>
    </div>
  );
};

export default Toast;
