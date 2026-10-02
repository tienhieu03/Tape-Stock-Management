import { useState, useRef, useCallback } from 'react';

/**
 * Hook for making table columns resizable by dragging the divider between headers.
 *
 * @param {number[]} initialWidths - Initial widths (in pixels) for each column.
 * @param {{ minWidth?: number }} options
 * @returns {{ widths, startResize, isResizing }}
 */
export function useResizableColumns(initialWidths, options = {}) {
  const { minWidth = 40 } = options;
  const [widths, setWidths] = useState(initialWidths);
  const isResizing = useRef(false);

  const startResize = useCallback((colIndex, e) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = widths[colIndex];

    isResizing.current = true;

    const onMouseMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX;
      const newWidth = Math.max(minWidth, startWidth + delta);
      setWidths(prev => {
        const next = [...prev];
        next[colIndex] = newWidth;
        return next;
      });
    };

    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [widths, minWidth]);

  return { widths, startResize };
}
