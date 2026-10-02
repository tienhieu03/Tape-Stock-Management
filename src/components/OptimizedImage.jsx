import React, { useState } from 'react';
import { Package } from 'lucide-react';

const OptimizedImage = ({ src, alt, className, style, ...props }) => {
  const [hasError, setHasError] = useState(false);

  if (!src || hasError) {
    return (
      <div 
        className={className} 
        style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'var(--bg-secondary)', 
          color: 'var(--text-secondary)',
          minWidth: '40px',
          minHeight: '40px',
          borderRadius: '6px',
          ...style 
        }}
      >
        <Package size={18} opacity={0.6} />
      </div>
    );
  }

  const isWebP = typeof src === 'string' && src.toLowerCase().endsWith('.webp');
  const thumbSrc = isWebP ? src.replace('.webp', '_thumb.webp') : src;

  return (
    <picture>
      {isWebP && (
        <source 
          srcSet={`${thumbSrc} 400w, ${src} 2048w`}
          sizes="(max-width: 600px) 400px, 2048px"
          type="image/webp"
        />
      )}
      <img 
        src={src} 
        alt={alt || ''} 
        className={className}
        style={style}
        loading="lazy"
        onError={() => setHasError(true)}
        {...props}
      />
    </picture>
  );
};

export default OptimizedImage;
