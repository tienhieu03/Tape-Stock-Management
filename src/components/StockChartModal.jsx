import React, { useState, useEffect } from 'react';
import { X, Calendar, ChevronLeft, ChevronRight, TrendingUp, TrendingDown } from 'lucide-react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, ReferenceLine 
} from 'recharts';
import { 
  format, addDays, subDays, addMonths, subMonths, 
  addYears, subYears, startOfWeek, endOfWeek, parseISO, isValid 
} from 'date-fns';

const API_BASE = '/api/stock-transactions';
const headers = () => ({ 'Authorization': `Bearer ${sessionStorage.getItem('token')}` });

export default function StockChartModal({ nvl, onClose }) {
  const [type, setType] = useState('month'); // day, week, month, year
  const [date, setDate] = useState(new Date());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({ start: 0, end: 0, diff: 0 });

  // Rigorous date parsing that respects UTC/Local offsets correctly
  const parseSqlDate = (dateInput) => {
    if (!dateInput) return new Date(NaN);
    if (dateInput instanceof Date) return dateInput;
    
    let str = String(dateInput).trim();
    
    // SQLite/Sequelize typically returns "YYYY-MM-DD HH:MM:SS.SSS +00:00"
    // We convert space to 'T' for ISO compatibility
    let isoStr = str.replace(' ', 'T');
    
    // If no timezone is specified in the string, assume it's UTC and append 'Z'
    if (!isoStr.includes('Z') && !/[+-]\d{2}:?\d{2}$/.test(isoStr)) {
      isoStr += 'Z';
    }
    
    const d = parseISO(isoStr);
    if (isValid(d)) return d;
    
    const native = new Date(str);
    return isValid(native) ? native : new Date(NaN);
  };

  const formatLabel = (dateInput, type) => {
    const d = parseSqlDate(dateInput);
    if (!isValid(d)) return '';

    if (type === 'day') return format(d, 'HH:mm');
    if (type === 'year') return format(d, 'MM/yy');
    return format(d, 'dd/MM');
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const dateStr = format(date, 'yyyy-MM-dd');
      const res = await fetch(`${API_BASE}/${nvl.id}?type=${type}&date=${dateStr}`, { headers: headers() });
      const result = await res.json();
      
      if (res.ok) {
        const rawData = result.data || [];
        const initialStock = parseFloat(result.initial_stock) || 0;
        
        let chartData = rawData.map((item, idx) => {
          const d = parseSqlDate(item.date);
          return {
            id: `pt-${d.getTime()}-${idx}`,
            timestamp: d.getTime(),
            name: formatLabel(d, type),
            stock: parseFloat(item.stock),
            fullDate: isValid(d) ? format(d, 'dd/MM/yyyy HH:mm:ss') : '—'
          };
        });

        // Baseline point - Start of period in Local Time
        let startOfPeriod;
        const localDate = new Date(date);
        if (type === 'day') startOfPeriod = new Date(localDate.setHours(0,0,0,0));
        else if (type === 'week') startOfPeriod = startOfWeek(localDate, { weekStartsOn: 1 });
        else if (type === 'month') startOfPeriod = new Date(localDate.getFullYear(), localDate.getMonth(), 1);
        else if (type === 'year') startOfPeriod = new Date(localDate.getFullYear(), 0, 1);

        chartData.unshift({
          id: 'baseline',
          timestamp: startOfPeriod.getTime(),
          name: formatLabel(startOfPeriod, type),
          stock: initialStock,
          fullDate: format(startOfPeriod, 'dd/MM/yyyy HH:mm')
        });

        setData(chartData);
        setStats({ 
          start: initialStock, 
          end: chartData.length > 1 ? chartData[chartData.length - 1].stock : initialStock,
          diff: (chartData.length > 1 ? chartData[chartData.length - 1].stock : initialStock) - initialStock
        });
      }
    } catch (e) {
      console.error("Fetch error:", e);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, [type, date]);

  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const navigate = (direction) => {
    if (direction === 'next') {
      if (type === 'day') setDate(d => addDays(d, 1));
      else if (type === 'week') setDate(d => addDays(d, 7));
      else if (type === 'month') setDate(d => addMonths(d, 1));
      else if (type === 'year') setDate(d => addYears(d, 1));
    } else {
      if (type === 'day') setDate(d => subDays(d, 1));
      else if (type === 'week') setDate(d => subDays(d, 7));
      else if (type === 'month') setDate(d => subMonths(d, 1));
      else if (type === 'year') setDate(d => subYears(d, 1));
    }
  };

  const getPeriodLabel = () => {
    if (type === 'day') return format(date, 'dd/MM/yyyy');
    if (type === 'week') {
      const start = startOfWeek(date, { weekStartsOn: 1 });
      const end = endOfWeek(date, { weekStartsOn: 1 });
      return `${format(start, 'dd/MM')} - ${format(end, 'dd/MM/yyyy')}`;
    }
    if (type === 'month') return format(date, 'MM/yyyy');
    if (type === 'year') return format(date, 'yyyy');
    return '';
  };

  const handleDateChange = (e) => {
    const newDate = new Date(e.target.value);
    if (!isNaN(newDate.getTime())) setDate(newDate);
  };

  const isPositive = stats.diff >= 0;
  const chartColor = isPositive ? '#22c55e' : '#ef4444';

  const renderGradientStops = () => {
    if (data.length <= 1) return <stop offset="0%" stopColor={chartColor} />;
    const stops = [];
    const step = 100 / (data.length - 1);
    data.forEach((entry, i) => {
      if (i === 0) return;
      const prev = data[i - 1];
      const segmentColor = entry.stock >= prev.stock ? '#22c55e' : '#ef4444';
      stops.push(<stop key={`${i}-start`} offset={`${(i - 1) * step}%`} stopColor={segmentColor} />);
      stops.push(<stop key={`${i}-end`} offset={`${i * step}%`} stopColor={segmentColor} />);
    });
    return stops;
  };

  const getInputType = () => {
    if (type === 'month') return 'month';
    if (type === 'year') return 'number';
    return 'date';
  };

  return (
    <div className="modal-overlay chart-modal-overlay" onClick={onClose}>
      <div className="modal-box chart-modal-box" onClick={e => e.stopPropagation()}>
        <style dangerouslySetInnerHTML={{ __html: `
          .chart-modal-overlay { background-color: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px); }
          .chart-modal-box { 
            background-color: var(--bg-main); border: 1px solid var(--border-color); 
            border-radius: 12px; max-width: 850px; width: 95%; 
            box-shadow: rgba(0,0,0,0.14) 0px 28px 70px, rgba(0,0,0,0.1) 0px 14px 32px;
            display: flex; flex-direction: column; 
          }
          .chart-modal-header { 
            padding: 20px 24px; border-bottom: 1px solid var(--border-color); 
            display: flex; justify-content: space-between; align-items: center; 
          }
          .chart-header-title { display: flex; align-items: center; gap: 16px; }
          .chart-status-icon { 
            width: 42px; height: 42px; border-radius: 10px; 
            display: flex; align-items: center; justify-content: center; 
          }
          .display-small { font-family: 'Calibri', system-ui; font-size: 22px; margin: 0; letter-spacing: -0.11px; color: var(--text-primary); }
          .system-micro { 
            font-family: 'system-ui'; font-size: 11px; font-weight: 500; 
            text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-secondary); margin: 2px 0 0 0; 
          }
          .chart-modal-content { padding: 24px; background-color: var(--bg-main); }
          .chart-controls { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; gap: 16px; flex-wrap: wrap; }
          .chart-type-tabs { display: flex; background: var(--bg-sidebar); padding: 3px; border-radius: 9px; border: 1px solid var(--border-color); }
          .chart-tab { 
            padding: 6px 18px; border: none; background: none; cursor: pointer; 
            font-size: 13px; font-weight: 500; font-family: 'Calibri', system-ui; 
            color: var(--text-secondary); border-radius: 7px; transition: all 0.2s; 
          }
          .chart-tab.active { background: var(--bg-main); color: var(--text-primary); box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
          .chart-datepicker-wrap { 
            display: flex; align-items: center; gap: 4px; background: var(--bg-card); 
            padding: 4px; border-radius: 9px; border: 1px solid var(--border-color); 
          }
          .nav-arrow { background: none; border: none; padding: 6px; cursor: pointer; color: var(--text-secondary); display: flex; align-items: center; border-radius: 6px; }
          .nav-arrow:hover { background: rgba(128, 128, 128, 0.1); color: var(--text-primary); }
          .datepicker-trigger { position: relative; padding: 4px 12px; display: flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 600; color: var(--text-primary); cursor: pointer; min-width: 140px; justify-content: center; }
          .hidden-date-input { position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
          .chart-summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 24px; }
          .summary-card { padding: 12px 16px; background: var(--bg-sidebar); border-radius: 8px; display: flex; flex-direction: column; gap: 2px; border: 1px solid var(--border-color); }
          .mono-body { font-family: 'berkeleyMono', monospace; font-size: 16px; color: var(--text-primary); }
          .chart-visual-area { height: 380px; background: var(--bg-card); border-radius: 12px; padding: 24px 16px 12px 16px; border: 1px solid var(--border-color); position: relative; }
          .chart-state-msg { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-secondary); font-size: 14px; }
          .ghost-pill { background: rgba(128, 128, 128, 0.1); border: none; padding: 8px; border-radius: 50%; cursor: pointer; color: var(--text-secondary); transition: all 0.2s; }
          .ghost-pill:hover { background: #ef444415; color: #ef4444; }
        ` }} />

        <div className="modal-header chart-modal-header">
          <div className="chart-header-title">
            <div className="chart-status-icon" style={{ backgroundColor: `${chartColor}15`, color: chartColor }}>
              {isPositive ? <TrendingUp size={18}/> : <TrendingDown size={18}/>}
            </div>
            <div>
              <h2 className="display-small">Biến động tồn kho</h2>
              <p className="system-micro">{nvl.nvl_name} ({nvl.nvl_item_code})</p>
            </div>
          </div>
          <button className="action-btn ghost-pill" onClick={onClose}><X size={18}/></button>
        </div>

        <div className="modal-content chart-modal-content">
          <div className="chart-controls">
            <div className="chart-type-tabs">
              {['day', 'week', 'month', 'year'].map(t => (
                <button key={t} className={`chart-tab ${type === t ? 'active' : ''}`} onClick={() => setType(t)}>
                  {t === 'day' ? 'Ngày' : t === 'week' ? 'Tuần' : t === 'month' ? 'Tháng' : 'Năm'}
                </button>
              ))}
            </div>

            <div className="chart-datepicker-wrap">
              <button className="nav-arrow" onClick={() => navigate('prev')}><ChevronLeft size={16}/></button>
              <div className="datepicker-trigger">
                <Calendar size={14} style={{ color: 'var(--text-secondary)' }} />
                <span>{getPeriodLabel()}</span>
                <input 
                  type={getInputType()} className="hidden-date-input"
                  value={type === 'month' ? format(date, 'yyyy-MM') : (type === 'year' ? format(date, 'yyyy') : format(date, 'yyyy-MM-dd'))}
                  onChange={handleDateChange}
                />
              </div>
              <button className="nav-arrow" onClick={() => navigate('next')}><ChevronRight size={16}/></button>
            </div>
          </div>

          <div className="chart-summary-grid">
            <div className="summary-card"><span className="system-micro">Đầu kỳ</span><span className="mono-body">{stats.start} {nvl.nvl_unit}</span></div>
            <div className="summary-card"><span className="system-micro">Cuối kỳ</span><span className="mono-body">{stats.end} {nvl.nvl_unit}</span></div>
            <div className="summary-card" style={{ borderLeft: `2px solid ${chartColor}30` }}>
              <span className="system-micro">Thay đổi</span>
              <span className="mono-body" style={{ color: chartColor, fontWeight: 600 }}>{isPositive ? '+' : ''}{stats.diff} {nvl.nvl_unit}</span>
            </div>
          </div>

          <div className="chart-visual-area">
            {loading ? (
              <div className="chart-state-msg">Đang truy xuất dữ liệu...</div>
            ) : data.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lineGradient" x1="0" y1="0" x2="1" y2="0">
                      {renderGradientStops()}
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="var(--border-color)" />
                  <XAxis 
                    dataKey="id" 
                    axisLine={false} 
                    tickLine={false}
                    interval="preserveStartEnd"
                    minTickGap={30}
                    tickFormatter={(val) => {
                      const item = data.find(d => d.id === val);
                      return item ? item.name : '';
                    }}
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'berkeleyMono' }} 
                  />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--text-secondary)', fontSize: 11, fontFamily: 'berkeleyMono' }} />
                  <Tooltip 
                    labelFormatter={(label, payload) => {
                      if (payload && payload[0]) return payload[0].payload.fullDate;
                      return label;
                    }}
                    formatter={(value) => [`${value} ${nvl.nvl_unit}`, 'Tồn kho']}
                    contentStyle={{ backgroundColor: 'var(--bg-main)', border: '1px solid var(--border-color)', borderRadius: '8px', boxShadow: '0 14px 32px rgba(0,0,0,0.08)', fontFamily: 'Calibri, system-ui' }}
                    labelStyle={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}
                    itemStyle={{ fontSize: '13px' }}
                  />
                  <Line 
                    type="monotone" dataKey="stock" stroke="url(#lineGradient)" strokeWidth={2.5} 
                    dot={(props) => {
                      const { cx, cy, payload, index } = props;
                      if (index === 0) return <circle key={index} cx={cx} cy={cy} r={3} fill="var(--text-secondary)" opacity={0.3} stroke="var(--bg-main)" strokeWidth={1.5} />;
                      const prev = data[index - 1];
                      const color = payload.stock >= (prev?.stock ?? 0) ? '#22c55e' : '#ef4444';
                      return <circle key={index} cx={cx} cy={cy} r={3} fill={color} stroke="var(--bg-main)" strokeWidth={1.5} />;
                    }}
                    activeDot={{ r: 6, fill: '#f54e00', strokeWidth: 2, stroke: '#fff' }}
                  />
                  <ReferenceLine y={stats.start} stroke="var(--text-secondary)" opacity={0.3} strokeDasharray="3 3" />
                  {nvl.nvl_alarm > 0 && (
                    <ReferenceLine 
                      y={nvl.nvl_alarm} 
                      stroke="#f54e00" 
                      strokeDasharray="5 5" 
                      label={{ position: 'insideBottomRight', value: `Cảnh báo: ${nvl.nvl_alarm}`, fill: '#f54e00', fontSize: 10, fontWeight: 600 }} 
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="chart-state-msg empty">
                <Calendar size={32} style={{ opacity: 0.2, marginBottom: '8px' }}/>
                <p>Không tìm thấy biến động trong kỳ</p>
                <small>Tồn kho chốt: {stats.end} {nvl.nvl_unit}</small>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
