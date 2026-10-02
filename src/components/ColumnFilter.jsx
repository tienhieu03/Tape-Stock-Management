import React, { useState, useRef, useEffect } from 'react';
import { Filter, Search, Check } from 'lucide-react';

const ColumnFilter = ({ columnKey, items, filters, setFilters, children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [side, setSide] = useState('left');
  const [search, setSearch] = useState('');
  const wrapperRef = useRef(null);
  const dropdownRef = useRef(null);

  // Extract unique, sorted, non-empty values for this column
  const uniqueValues = React.useMemo(() => {
    let rawValues = [];
    items.forEach(item => {
      const val = item[columnKey];
      if (val !== null && val !== undefined && val !== '') {
        if (columnKey === 'nvl_category') {
          val.split(',').forEach(s => {
            const trimmed = s.trim();
            if (trimmed) rawValues.push(trimmed);
          });
        } else {
          rawValues.push(val);
        }
      }
    });
    return Array.from(new Set(rawValues)).sort();
  }, [items, columnKey]);

  // Current checked state for this column
  const currentFilterSet = filters[columnKey] || new Set();

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && wrapperRef.current) {
      const rect = wrapperRef.current.getBoundingClientRect();
      const dropdownWidth = 220; // Matches CSS width
      const buffer = 20;
      
      if (rect.left + dropdownWidth > window.innerWidth - buffer) {
        setSide('right');
      } else {
        setSide('left');
      }
    }
  }, [isOpen]);

  const toggleOpen = (e) => {
    e.stopPropagation();
    setIsOpen(!isOpen);
    setSearch('');
  };

  const handleToggleItem = (value) => {
    const newFilters = { ...filters };
    if (!newFilters[columnKey]) newFilters[columnKey] = new Set();

    if (newFilters[columnKey].has(value)) {
      newFilters[columnKey].delete(value);
      if (newFilters[columnKey].size === 0) delete newFilters[columnKey];
    } else {
      newFilters[columnKey].add(value);
    }
    setFilters(newFilters);
  };

  const handleSelectAll = () => {
    const newFilters = { ...filters };
    if (newFilters[columnKey] && newFilters[columnKey].size === uniqueValues.length) {
      // Deselect all
      delete newFilters[columnKey];
    } else {
      // Select all
      newFilters[columnKey] = new Set(uniqueValues);
    }
    setFilters(newFilters);
  };

  const filteredValues = uniqueValues.filter(val => 
    String(val).toLowerCase().includes(search.toLowerCase())
  );

  const isActive = currentFilterSet.size > 0;
  const isAllSelected = currentFilterSet.size === uniqueValues.length && uniqueValues.length > 0;

  return (
    <div className="col-filter-wrapper" ref={wrapperRef} onClick={e => e.stopPropagation()}>
      <div 
        className={`col-filter-trigger ${isActive ? 'active' : ''}`}
        onClick={toggleOpen}
        title="Nhấp để lọc"
      >
        {children}
      </div>

      {isOpen && (
        <div className={`col-filter-dropdown side-${side}`} ref={dropdownRef}>
          <div className="col-filter-search">
            <Search size={14} />
            <input 
              type="text" 
              placeholder="Tìm kiếm..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>
          
          <div className="col-filter-list">
            {filteredValues.length > 0 && (
              <label className="col-filter-item select-all">
                <input 
                  type="checkbox" 
                  checked={isAllSelected}
                  onChange={handleSelectAll}
                />
                <span className="checkbox-custom">{isAllSelected && <Check size={12}/>}</span>
                (Chọn tất cả)
              </label>
            )}
            
            {filteredValues.length === 0 ? (
              <div className="col-filter-empty">Không có dữ liệu</div>
            ) : (
              filteredValues.map((val, idx) => {
                const isSelected = currentFilterSet.has(val);
                return (
                  <label key={idx} className="col-filter-item">
                    <input 
                      type="checkbox" 
                      checked={isSelected}
                      onChange={() => handleToggleItem(val)}
                    />
                    <span className="checkbox-custom">{isSelected && <Check size={12}/>}</span>
                    <span className="col-filter-text" title={val}>{val}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ColumnFilter;
