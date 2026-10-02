import { 
  INITIAL_NVL, INITIAL_TAPES, INITIAL_POS, INITIAL_EXPENSES, 
  INITIAL_VENDORS, INITIAL_USERS, INITIAL_RATES, INITIAL_NOTIFICATIONS 
} from '../data/mockData';
import { broadcastSocketEvent } from './mockSocket';

const STORAGE_KEY = 'material_control_demo_db_v1';

// Load or initialize DB from LocalStorage
export function getStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to read from localStorage:', e);
  }
  return resetDemoData();
}

export function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('Failed to save to localStorage:', e);
  }
}

export function resetDemoData() {
  const store = {
    users: JSON.parse(JSON.stringify(INITIAL_USERS)),
    vendors: JSON.parse(JSON.stringify(INITIAL_VENDORS)),
    nvl: JSON.parse(JSON.stringify(INITIAL_NVL)),
    tapes: JSON.parse(JSON.stringify(INITIAL_TAPES)),
    pos: JSON.parse(JSON.stringify(INITIAL_POS)),
    expenses: JSON.parse(JSON.stringify(INITIAL_EXPENSES)),
    rates: JSON.parse(JSON.stringify(INITIAL_RATES)),
    notifications: JSON.parse(JSON.stringify(INITIAL_NOTIFICATIONS)),
    excelMapping: {
      nvl_name_cell: 'A2',
      nvl_item_code_cell: 'B2',
      nvl_price_cell: 'C2',
      nvl_money_type_cell: 'D2',
      nvl_unit_cell: 'E2',
      nvl_leadtime_cell: 'F2',
      nvl_stock_cell: 'G2',
      nvl_min_order_cell: 'H2',
      nvl_alarm_cell: 'I2',
      nvl_category_cell: 'J2',
      nvl_exp_cell: 'K2',
      vendor_name_cell: 'L2'
    }
  };
  saveStore(store);
  broadcastSocketEvent('data-update', { type: 'nvl' });
  broadcastSocketEvent('data-update', { type: 'tape' });
  broadcastSocketEvent('data-update', { type: 'po' });
  broadcastSocketEvent('data-update', { type: 'expense' });
  broadcastSocketEvent('exchange-rate-updated', { rates: store.rates, rateMap: store.rates });
  return store;
}

// Generate realistic stock timeline for the Recharts modal
function generateStockTransactions(nvlId, currentStock) {
  const points = [];
  const now = new Date();
  let stockLevel = Math.max(0, currentStock - 40);

  for (let i = 14; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const fluctuation = Math.floor(Math.random() * 8) - 3;
    stockLevel = Math.max(0, stockLevel + fluctuation);
    if (i === 0) stockLevel = currentStock;

    points.push({
      id: 1000 - i,
      nvl_id: nvlId,
      stock: stockLevel,
      date: d.toISOString()
    });
  }

  return {
    initial_stock: points[0]?.stock || 0,
    data: points
  };
}

// Global Fetch Interceptor
export function initMockServer() {
  const originalFetch = window.fetch;

  window.fetch = async (url, options = {}) => {
    const urlStr = typeof url === 'string' ? url : url.url;

    // Only intercept requests targeting /api/
    if (!urlStr.includes('/api/')) {
      return originalFetch(url, options);
    }

    const method = (options.method || 'GET').toUpperCase();
    const parsedUrl = new URL(urlStr, window.location.origin);
    const path = parsedUrl.pathname;
    const query = parsedUrl.searchParams;

    let body = {};
    if (options.body) {
      if (typeof options.body === 'string') {
        try { body = JSON.parse(options.body); } catch (e) { body = {}; }
      } else if (options.body instanceof FormData) {
        body = {};
        for (const [k, v] of options.body.entries()) {
          body[k] = v;
        }
      }
    }

    // Helper for response format
    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    };

    const store = getStore();

    // -------------------------------------------------------------
    // 1. AUTHENTICATION & PROFILE
    // -------------------------------------------------------------
    if (path === '/api/auth/login' && method === 'POST') {
      const { username, password } = body;
      const user = store.users.find(u => u.username === username);

      // In demo mode, accept any password or matching password
      if (!user) {
        return jsonResponse({ message: 'Tài khoản không tồn tại trong hệ thống demo.' }, 401);
      }

      const token = `mock-jwt-token-for-${user.username}-${Date.now()}`;
      return jsonResponse({
        token,
        user: {
          id: user.id,
          username: user.username,
          full_name: user.full_name,
          role: user.role,
          permissions: user.permissions
        }
      });
    }

    if (path === '/api/auth/profile' && method === 'GET') {
      const activeUser = store.users[0]; // fallback
      return jsonResponse({
        id: activeUser.id,
        username: activeUser.username,
        full_name: activeUser.full_name,
        role: activeUser.role,
        permissions: activeUser.permissions
      });
    }

    if (path === '/api/auth/change-password' && method === 'POST') {
      return jsonResponse({ message: 'Đổi mật khẩu demo thành công!' });
    }

    // -------------------------------------------------------------
    // 2. EXCHANGE RATES
    // -------------------------------------------------------------
    if (path === '/api/exchange-rates') {
      if (method === 'GET') {
        const ratesArray = Object.entries(store.rates).map(([currency, rate]) => ({
          currency,
          rate,
          updater: { username: 'admin', full_name: 'Hệ Thống' }
        }));
        return jsonResponse({ rates: ratesArray, rateMap: store.rates });
      }

      if (method === 'PUT') {
        if (body.rates) {
          store.rates = { ...store.rates, ...body.rates };
        } else if (body.currency && body.rate !== undefined) {
          store.rates[body.currency] = parseFloat(body.rate) || 0;
        }
        saveStore(store);
        broadcastSocketEvent('exchange-rate-updated', { rates: store.rates, rateMap: store.rates });
        return jsonResponse({ message: 'Cập nhật tỷ giá thành công.', rateMap: store.rates });
      }
    }

    if (path.startsWith('/api/exchange-rates/') && method === 'DELETE') {
      const curr = path.split('/').pop().toUpperCase();
      store.rates[curr] = 0;
      saveStore(store);
      broadcastSocketEvent('exchange-rate-updated', { rates: store.rates, rateMap: store.rates });
      return jsonResponse({ message: `Đã đặt lại tỷ giá ${curr} về 0.`, rateMap: store.rates });
    }

    // -------------------------------------------------------------
    // 3. VENDORS
    // -------------------------------------------------------------
    if (path === '/api/vendors') {
      if (method === 'GET') {
        return jsonResponse(store.vendors);
      }
      if (method === 'POST') {
        const names = Array.isArray(body.vendor_name) ? body.vendor_name : [body.vendor_name];
        const created = [];
        names.forEach(name => {
          const newV = {
            id: Date.now() + Math.floor(Math.random() * 1000),
            vendor_name: String(name).trim(),
            nvl_category: body.nvl_category
          };
          store.vendors.push(newV);
          created.push(newV);
        });
        saveStore(store);
        return jsonResponse(created, 201);
      }
    }

    if (path.startsWith('/api/vendors/') && !path.includes('/category')) {
      const id = parseInt(path.split('/').pop());
      if (method === 'PUT') {
        const idx = store.vendors.findIndex(v => v.id === id);
        if (idx !== -1) {
          store.vendors[idx] = { ...store.vendors[idx], ...body };
          saveStore(store);
          return jsonResponse(store.vendors[idx]);
        }
      }
      if (method === 'DELETE') {
        store.vendors = store.vendors.filter(v => v.id !== id);
        saveStore(store);
        return jsonResponse({ message: 'Đã xóa nhà cung cấp.' });
      }
    }

    if (path === '/api/vendors/category/sync' && method === 'PUT') {
      const { old_category, nvl_category, vendor_names } = body;
      store.vendors = store.vendors.filter(v => v.nvl_category !== old_category);
      vendor_names.forEach(name => {
        store.vendors.push({
          id: Date.now() + Math.floor(Math.random() * 1000),
          vendor_name: name.trim(),
          nvl_category
        });
      });
      saveStore(store);
      return jsonResponse({ message: 'Đã cập nhật nhà cung cấp theo khu vực.' });
    }

    if (path.startsWith('/api/vendors/category/') && method === 'DELETE') {
      const cat = decodeURIComponent(path.split('/').pop());
      store.vendors = store.vendors.filter(v => v.nvl_category !== cat);
      saveStore(store);
      return jsonResponse({ message: 'Đã xóa nhà cung cấp.' });
    }

    // -------------------------------------------------------------
    // 4. NVL (NGUYÊN VẬT LIỆU)
    // -------------------------------------------------------------
    if (path === '/api/nvl') {
      if (method === 'GET') {
        const result = store.nvl.map(n => ({
          ...n,
          vendor: store.vendors.find(v => v.id === n.vendor_id) || null
        }));
        return jsonResponse(result);
      }

      if (method === 'POST') {
        const newNvl = {
          id: Date.now(),
          nvl_name: body.nvl_name,
          nvl_item_code: body.nvl_item_code,
          nvl_price: parseFloat(body.nvl_price) || 0,
          nvl_money_type: body.nvl_money_type || 'VND',
          nvl_unit: body.nvl_unit,
          nvl_leadtime: parseFloat(body.nvl_leadtime) || 0,
          nvl_stock: parseFloat(body.nvl_stock) || 0,
          nvl_min_order: parseFloat(body.nvl_min_order) || 0,
          nvl_alarm: parseFloat(body.nvl_alarm) || 0,
          nvl_description: body.nvl_description || '',
          nvl_category: body.nvl_category || '',
          nvl_exp: body.nvl_is_date === 'true' || body.nvl_is_date === true ? body.nvl_exp : null,
          nvl_is_date: body.nvl_is_date === 'true' || body.nvl_is_date === true,
          vendor_id: body.vendor_id ? parseInt(body.vendor_id) : null,
          nvl_image_path: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=60',
          nvl_quote_image_path: null
        };
        store.nvl.unshift(newNvl);
        saveStore(store);
        broadcastSocketEvent('data-update', { type: 'nvl' });
        return jsonResponse(newNvl, 201);
      }
    }

    if (path === '/api/nvl/bulk-delete' && method === 'POST') {
      const { ids } = body;
      store.nvl = store.nvl.filter(n => !ids.includes(n.id));
      saveStore(store);
      broadcastSocketEvent('data-update', { type: 'nvl' });
      return jsonResponse({ message: `Đã xóa ${ids.length} NVL.` });
    }

    if (path === '/api/nvl/excel-mapping') {
      if (method === 'GET') return jsonResponse(store.excelMapping);
      if (method === 'PUT') {
        store.excelMapping = { ...store.excelMapping, ...body };
        saveStore(store);
        return jsonResponse({ message: 'Lưu cấu hình thành công.', mapping: store.excelMapping });
      }
    }

    if (path.startsWith('/api/nvl/') && path.endsWith('/stock') && method === 'PATCH') {
      const id = parseInt(path.split('/')[3]);
      const nvl = store.nvl.find(n => n.id === id);
      if (nvl) {
        nvl.nvl_stock = parseFloat(body.nvl_stock) || 0;
        saveStore(store);
        broadcastSocketEvent('data-update', { type: 'nvl' });
        return jsonResponse({ message: 'Cập nhật Stock thành công.', nvl_stock: nvl.nvl_stock });
      }
    }

    if (path.startsWith('/api/nvl/') && !path.includes('/stock') && !path.includes('/excel-mapping')) {
      const id = parseInt(path.split('/')[3]);
      if (method === 'PUT') {
        const idx = store.nvl.findIndex(n => n.id === id);
        if (idx !== -1) {
          store.nvl[idx] = {
            ...store.nvl[idx],
            nvl_name: body.nvl_name !== undefined ? body.nvl_name : store.nvl[idx].nvl_name,
            nvl_item_code: body.nvl_item_code !== undefined ? body.nvl_item_code : store.nvl[idx].nvl_item_code,
            nvl_price: body.nvl_price !== undefined ? parseFloat(body.nvl_price) : store.nvl[idx].nvl_price,
            nvl_money_type: body.nvl_money_type || store.nvl[idx].nvl_money_type,
            nvl_unit: body.nvl_unit || store.nvl[idx].nvl_unit,
            nvl_leadtime: body.nvl_leadtime !== undefined ? parseFloat(body.nvl_leadtime) : store.nvl[idx].nvl_leadtime,
            nvl_stock: body.nvl_stock !== undefined ? parseFloat(body.nvl_stock) : store.nvl[idx].nvl_stock,
            nvl_min_order: body.nvl_min_order !== undefined ? parseFloat(body.nvl_min_order) : store.nvl[idx].nvl_min_order,
            nvl_alarm: body.nvl_alarm !== undefined ? parseFloat(body.nvl_alarm) : store.nvl[idx].nvl_alarm,
            nvl_description: body.nvl_description !== undefined ? body.nvl_description : store.nvl[idx].nvl_description,
            nvl_category: body.nvl_category !== undefined ? body.nvl_category : store.nvl[idx].nvl_category,
            nvl_is_date: body.nvl_is_date !== undefined ? (body.nvl_is_date === 'true' || body.nvl_is_date === true) : store.nvl[idx].nvl_is_date,
            nvl_exp: body.nvl_exp !== undefined ? body.nvl_exp : store.nvl[idx].nvl_exp,
            vendor_id: body.vendor_id ? parseInt(body.vendor_id) : store.nvl[idx].vendor_id
          };
          saveStore(store);
          broadcastSocketEvent('data-update', { type: 'nvl' });
          return jsonResponse(store.nvl[idx]);
        }
      }
      if (method === 'DELETE') {
        store.nvl = store.nvl.filter(n => n.id !== id);
        saveStore(store);
        broadcastSocketEvent('data-update', { type: 'nvl' });
        return jsonResponse({ message: 'Đã xóa NVL.' });
      }
    }

    // -------------------------------------------------------------
    // 5. TAPE (ACF TAPE - FLUX - SOLDER)
    // -------------------------------------------------------------
    if (path === '/api/tape') {
      if (method === 'GET') {
        return jsonResponse(store.tapes);
      }
      if (method === 'POST') {
        const newMasterId = Date.now();
        const newBatchId = newMasterId + 1;
        const newTape = {
          id: newMasterId,
          master_id: newMasterId,
          itemcode: body.itemcode || '',
          name: body.name || 'Keo mới',
          width: parseFloat(body.width) || null,
          thickness: parseFloat(body.thickness) || null,
          vendor: body.vendor_name || '',
          vendor_id: 2,
          purpose: body.purpose || '',
          comment: body.comment || '',
          alarm: parseFloat(body.alarm) || 0,
          itemname: body.itemname || '',
          master_type: body.master_type || 'Keo',
          leadtime: parseFloat(body.leadtime) || 0,
          price: parseFloat(body.price) || 0,
          money_type: body.money_type || 'VND',
          unit: body.unit || 'Cuộn',
          design: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?w=500&auto=format&fit=crop&q=60',
          quotation_image_path: null,
          tds_file_path: null,
          batch_id: newBatchId,
          mfg_date: body.mfg_date || null,
          date_received: body.date_received || new Date().toISOString().split('T')[0],
          expiry: body.expiry || null,
          type: body.type || 'Hàng Chuẩn',
          stock: parseFloat(body.stock) || 0,
          next_request_date: body.next_request_date || null,
          batch_status: body.batch_status || 'CURRENT',
          batches: [
            {
              id: newBatchId,
              bonding_tape_master_id: newMasterId,
              stock: parseFloat(body.stock) || 0,
              type: body.type || 'Hàng Chuẩn',
              mfg_date: body.mfg_date || null,
              received_date: body.date_received || new Date().toISOString().split('T')[0],
              expiry: body.expiry || null,
              next_request_date: body.next_request_date || null,
              batch_status: body.batch_status || 'CURRENT'
            }
          ]
        };
        store.tapes.unshift(newTape);
        saveStore(store);
        broadcastSocketEvent('data-update', { type: 'tape' });
        return jsonResponse(newTape, 201);
      }
    }

    if (path.startsWith('/api/tape/batch/') && path.endsWith('/stock') && method === 'PATCH') {
      const batchId = parseInt(path.split('/')[4]);
      store.tapes.forEach(t => {
        const b = t.batches.find(batch => batch.id === batchId);
        if (b) {
          b.stock = parseFloat(body.stock) || 0;
          if (t.batch_id === batchId) {
            t.stock = b.stock;
          }
        }
      });
      saveStore(store);
      broadcastSocketEvent('data-update', { type: 'tape' });
      return jsonResponse({ message: 'Cập nhật Stock keo thành công.' });
    }

    if (path.startsWith('/api/tape/batch/') && method === 'PUT') {
      const batchId = parseInt(path.split('/')[4]);
      store.tapes.forEach(t => {
        const b = t.batches.find(batch => batch.id === batchId);
        if (b) {
          Object.assign(b, body);
          if (body.stock !== undefined) b.stock = parseFloat(body.stock);
          if (t.batch_id === batchId) {
            t.stock = b.stock;
            t.expiry = b.expiry;
            t.date_received = b.received_date;
            t.batch_status = b.batch_status;
          }
        }
      });
      saveStore(store);
      broadcastSocketEvent('data-update', { type: 'tape' });
      return jsonResponse({ message: 'Cập nhật lô keo thành công.' });
    }

    if (path === '/api/tape/batch' && method === 'POST') {
      const masterId = parseInt(body.bonding_tape_master_id);
      const tape = store.tapes.find(t => t.id === masterId || t.master_id === masterId);
      if (tape) {
        const newBatch = {
          id: Date.now(),
          bonding_tape_master_id: masterId,
          stock: parseFloat(body.stock) || 0,
          type: body.type || 'Hàng Chuẩn',
          mfg_date: body.mfg_date || null,
          received_date: body.received_date || new Date().toISOString().split('T')[0],
          expiry: body.expiry || null,
          next_request_date: body.next_request_date || null,
          batch_status: body.batch_status || 'NEXT'
        };
        tape.batches.push(newBatch);
        saveStore(store);
        broadcastSocketEvent('data-update', { type: 'tape' });
        return jsonResponse({ message: 'Đã thêm lượng keo mới.', batch_id: newBatch.id }, 201);
      }
    }

    if (path.startsWith('/api/tape/') && !path.includes('/batch')) {
      const id = parseInt(path.split('/')[3]);
      if (method === 'PUT') {
        const idx = store.tapes.findIndex(t => t.id === id);
        if (idx !== -1) {
          store.tapes[idx] = { ...store.tapes[idx], ...body };
          saveStore(store);
          broadcastSocketEvent('data-update', { type: 'tape' });
          return jsonResponse({ message: 'Cập nhật thành công.' });
        }
      }
      if (method === 'DELETE') {
        store.tapes = store.tapes.filter(t => t.id !== id);
        saveStore(store);
        broadcastSocketEvent('data-update', { type: 'tape' });
        return jsonResponse({ message: 'Đã xóa keo.' });
      }
    }

    // -------------------------------------------------------------
    // 6. FOLLOW PO (PURCHASE ORDERS)
    // -------------------------------------------------------------
    if (path === '/api/po/list' && method === 'GET') {
      const isReceived = query.get('received') === 'true';
      const filtered = store.pos.filter(po => isReceived ? po.status === 3 : po.status !== 3);
      return jsonResponse(filtered);
    }

    if (path === '/api/po' && method === 'POST') {
      const { po_number, vendor_id, order_date, cost_type, eta, details } = body;
      const vendor = store.vendors.find(v => v.id === parseInt(vendor_id));
      const newPoId = Date.now();

      const createdRows = [];
      if (details && details.length > 0) {
        details.forEach((d, i) => {
          let item_name = '—';
          let item_unit = '';
          let item_code = '';
          let is_tape = false;

          if (d.nvl_id) {
            const nvl = store.nvl.find(n => n.id === d.nvl_id);
            if (nvl) {
              item_name = nvl.nvl_name;
              item_unit = nvl.nvl_unit;
              item_code = nvl.nvl_item_code;
            }
          } else if (d.bonding_tape_batch_id) {
            const tape = store.tapes.find(t => t.batches.some(b => b.id === d.bonding_tape_batch_id));
            if (tape) {
              item_name = tape.name;
              item_unit = tape.unit;
              item_code = tape.itemcode;
              is_tape = true;
            }
          }

          const poItem = {
            id: newPoId + i,
            po_id: newPoId,
            po_number: po_number || `PO-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`,
            vendor_id: vendor ? vendor.id : null,
            vendor_name: vendor ? vendor.vendor_name : '—',
            order_date: order_date || new Date().toISOString().split('T')[0],
            cost_type: cost_type || 'Direct Sub-Materials expense',
            eta: eta || null,
            received_date: null,
            receiver_name: '—',
            status: 1, // Draft
            nvl_id: d.nvl_id || null,
            bonding_tape_batch_id: d.bonding_tape_batch_id || null,
            nvl_name: item_name,
            nvl_unit: item_unit,
            item_code: item_code,
            price: d.price || 0,
            currency: d.currency || 'VND',
            is_tape: is_tape,
            quantity: parseFloat(d.quantity) || 0,
            total_amount: parseFloat(d.total_amount) || 0,
            expiry: d.expiry || null
          };
          store.pos.unshift(poItem);
          createdRows.push(poItem);
        });
      }

      saveStore(store);
      broadcastSocketEvent('data-update', { type: 'po' });
      return jsonResponse({ message: 'Tạo PO thành công.', data: createdRows }, 201);
    }

    if (path.startsWith('/api/po/') && method === 'PUT') {
      const poId = parseInt(path.split('/').pop());
      const poRows = store.pos.filter(p => p.po_id === poId);

      if (poRows.length > 0) {
        const oldStatus = poRows[0].status;
        const newStatus = body.status !== undefined ? body.status : oldStatus;

        poRows.forEach(row => {
          if (body.po_number !== undefined) row.po_number = body.po_number;
          if (body.vendor_id !== undefined) {
            row.vendor_id = body.vendor_id;
            const v = store.vendors.find(item => item.id === parseInt(body.vendor_id));
            if (v) row.vendor_name = v.vendor_name;
          }
          if (body.order_date !== undefined) row.order_date = body.order_date;
          if (body.cost_type !== undefined) row.cost_type = body.cost_type;
          if (body.eta !== undefined) row.eta = body.eta;
          if (body.received_date !== undefined) row.received_date = body.received_date;
          if (body.receiver_name !== undefined) row.receiver_name = body.receiver_name;
          row.status = newStatus;
        });

        // AUTO-STOCK UPDATE UPON RECEIVING!
        if (newStatus === 3 && oldStatus !== 3) {
          poRows.forEach(row => {
            if (row.quantity > 0) {
              if (row.nvl_id) {
                const nvl = store.nvl.find(n => n.id === row.nvl_id);
                if (nvl) {
                  nvl.nvl_stock += row.quantity;
                }
              } else if (row.bonding_tape_batch_id) {
                store.tapes.forEach(t => {
                  const b = t.batches.find(batch => batch.id === row.bonding_tape_batch_id);
                  if (b) {
                    b.stock += row.quantity;
                    if (t.batch_id === b.id) t.stock = b.stock;
                  }
                });
              }
            }
          });
          broadcastSocketEvent('data-update', { type: 'nvl' });
          broadcastSocketEvent('data-update', { type: 'tape' });
        }

        saveStore(store);
        broadcastSocketEvent('data-update', { type: 'po' });
        return jsonResponse(poRows[0]);
      }
    }

    if (path.startsWith('/api/po/') && method === 'DELETE') {
      const poId = parseInt(path.split('/').pop());
      store.pos = store.pos.filter(p => p.po_id !== poId && p.id !== poId);
      saveStore(store);
      broadcastSocketEvent('data-update', { type: 'po' });
      return jsonResponse({ message: 'Đã xóa PO.' });
    }

    if (path === '/api/po/auto-create-multiple' && method === 'POST') {
      const { nvl_ids } = body;
      const today = new Date().toISOString().split('T')[0];

      (nvl_ids || []).forEach(id => {
        const nvl = store.nvl.find(n => n.id === id);
        if (nvl) {
          const poId = Date.now() + Math.floor(Math.random() * 1000);
          const vendor = store.vendors.find(v => v.id === nvl.vendor_id);
          store.pos.unshift({
            id: poId,
            po_id: poId,
            po_number: `PO-DRAFT-${poId.toString().slice(-4)}`,
            vendor_id: nvl.vendor_id,
            vendor_name: vendor ? vendor.vendor_name : '—',
            order_date: today,
            cost_type: 'Direct Sub-Materials expense',
            eta: null,
            received_date: null,
            receiver_name: '—',
            status: 1, // Draft
            nvl_id: nvl.id,
            bonding_tape_batch_id: null,
            nvl_name: nvl.nvl_name,
            nvl_unit: nvl.nvl_unit,
            item_code: nvl.nvl_item_code,
            price: nvl.nvl_price,
            currency: nvl.nvl_money_type,
            is_tape: false,
            quantity: nvl.nvl_min_order || 1,
            total_amount: (nvl.nvl_price || 0) * (nvl.nvl_min_order || 1),
            expiry: null
          });
        }
      });
      saveStore(store);
      broadcastSocketEvent('data-update', { type: 'po' });
      return jsonResponse({ message: 'Đã tạo PO nháp tự động từ NVL.' }, 201);
    }

    if (path === '/api/po/auto-create-tape' && method === 'POST') {
      const { tape_batch_ids } = body;
      const today = new Date().toISOString().split('T')[0];

      (tape_batch_ids || []).forEach(batchId => {
        const tape = store.tapes.find(t => t.batches.some(b => b.id === batchId));
        if (tape) {
          const poId = Date.now() + Math.floor(Math.random() * 1000);
          store.pos.unshift({
            id: poId,
            po_id: poId,
            po_number: `PO-TAPE-${poId.toString().slice(-4)}`,
            vendor_id: tape.vendor_id,
            vendor_name: tape.vendor,
            order_date: today,
            cost_type: 'Direct Sub-Materials expense',
            eta: null,
            received_date: null,
            receiver_name: '—',
            status: 1,
            nvl_id: null,
            bonding_tape_batch_id: batchId,
            nvl_name: tape.name,
            nvl_unit: tape.unit,
            item_code: tape.itemcode,
            price: tape.price,
            currency: tape.money_type,
            is_tape: true,
            quantity: 5,
            total_amount: (tape.price || 0) * 5,
            expiry: null
          });
        }
      });
      saveStore(store);
      broadcastSocketEvent('data-update', { type: 'po' });
      return jsonResponse({ message: 'Đã tạo PO nháp tự động cho Keo.' }, 201);
    }

    if (path === '/api/po/export-request' && method === 'POST') {
      const XLSX = await import('xlsx-js-style');
      const items = body.items || [];
      const exportData = items.map((item, index) => ({
        'STT': index + 1,
        'Số PO': item.po_number || '—',
        'Tên Vật Tư': item.nvl_name || '—',
        'Mã Code': item.item_code || '—',
        'Nhà Cung Cấp': item.vendor_name || '—',
        'Số Lượng': item.quantity || 0,
        'Đơn Vị': item.nvl_unit || '—',
        'Đơn Giá': item.price || 0,
        'Tiền Tệ': item.currency || 'VND',
        'Thành Tiền': item.total_amount || 0,
        'Ngày Đặt': item.order_date || '—',
        'ETA Dự Kiến': item.eta || '—',
        'Loại Chi Phí': item.cost_type || '—'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Request_Purchasing");
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

      return new Response(wbout, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="Request_Purchasing_${new Date().toISOString().split('T')[0]}.xlsx"`
        }
      });
    }

    // -------------------------------------------------------------
    // 7. EQUIPMENT EXPENSES
    // -------------------------------------------------------------
    if (path === '/api/equipment-expenses') {
      if (method === 'GET') {
        return jsonResponse(store.expenses);
      }
      if (method === 'POST' && path.includes('/bulk-save') || method === 'POST') {
        const { expenses } = body;
        if (Array.isArray(expenses)) {
          expenses.forEach(item => {
            if (!item.id || String(item.id).startsWith('temp-')) {
              store.expenses.push({ ...item, id: Date.now() + Math.floor(Math.random() * 1000) });
            } else {
              const idx = store.expenses.findIndex(e => e.id === item.id);
              if (idx !== -1) {
                store.expenses[idx] = { ...store.expenses[idx], ...item };
              }
            }
          });
          saveStore(store);
          broadcastSocketEvent('data-update', { type: 'expense' });
          return jsonResponse({ message: 'Đã lưu cấu hình chi phí thành công.', data: store.expenses });
        }
      }
    }

    if (path.startsWith('/api/equipment-expenses/') && method === 'DELETE') {
      const id = parseInt(path.split('/').pop());
      store.expenses = store.expenses.filter(e => e.id !== id);
      saveStore(store);
      broadcastSocketEvent('data-update', { type: 'expense' });
      return jsonResponse({ message: 'Đã xóa dòng chi phí thành công.' });
    }

    // -------------------------------------------------------------
    // 8. NOTIFICATIONS
    // -------------------------------------------------------------
    if (path === '/api/notifications') {
      if (method === 'GET') {
        return jsonResponse(store.notifications);
      }
    }

    if (path === '/api/notifications/generate-on-login' && method === 'POST') {
      return jsonResponse({ message: 'Đã cập nhật cảnh báo.', count: store.notifications.length });
    }

    if (path.startsWith('/api/notifications/') && path.endsWith('/read') && method === 'PATCH') {
      const id = parseInt(path.split('/')[3]);
      const noti = store.notifications.find(n => n.id === id);
      if (noti) noti.is_read = true;
      saveStore(store);
      return jsonResponse({ message: 'Đã đánh dấu đã đọc.' });
    }

    if (path === '/api/notifications/read-all' && method === 'PATCH') {
      store.notifications.forEach(n => { n.is_read = true; });
      saveStore(store);
      return jsonResponse({ message: 'Đã đọc tất cả.' });
    }

    // -------------------------------------------------------------
    // 9. USERS & PERMISSIONS
    // -------------------------------------------------------------
    if (path === '/api/users' && method === 'GET') {
      return jsonResponse(store.users.map(u => ({
        id: u.id,
        username: u.username,
        full_name: u.full_name,
        role: u.role,
        primary_role: { role_name: u.role }
      })));
    }

    if (path === '/api/users' && method === 'POST') {
      const { username, password, full_name, role_name } = body;
      const newUser = {
        id: Date.now(),
        username,
        full_name,
        role: role_name || 'user',
        is_active: true,
        permissions: role_name === 'admin' ? [
          'nvl.view', 'nvl.create', 'nvl.edit', 'nvl.delete', 'nvl.stock', 'nvl.import',
          'po.view', 'po.edit', 'po.delete', 'po.receive', 'po.buy', 'po.vendor', 'po.delete_history',
          'tape.view', 'tape.create', 'tape.edit', 'tape.delete', 'tape.history',
          'expense.view', 'expense.edit',
          'rate.view', 'rate.edit', 'rate.delete'
        ] : ['nvl.view', 'po.view', 'tape.view']
      };
      store.users.push(newUser);
      saveStore(store);
      return jsonResponse({ message: 'Tạo tài khoản thành công.' }, 201);
    }

    if (path.startsWith('/api/users/') && path.endsWith('/reset-password') && method === 'POST') {
      return jsonResponse({ message: 'Đã reset mật khẩu về 12345678.' });
    }

    if (path.startsWith('/api/users/') && !path.includes('/permissions') && !path.includes('/reset-password')) {
      const userId = parseInt(path.split('/').pop());
      if (method === 'PUT') {
        const u = store.users.find(item => item.id === userId);
        if (u) {
          if (body.username) u.username = body.username;
          if (body.full_name) u.full_name = body.full_name;
          if (body.role_name) u.role = body.role_name;
          saveStore(store);
          return jsonResponse({ message: 'Cập nhật thông tin thành công.' });
        }
      }
      if (method === 'DELETE') {
        store.users = store.users.filter(item => item.id !== userId);
        saveStore(store);
        return jsonResponse({ message: 'Đã xóa người dùng.' });
      }
    }

    if (path.startsWith('/api/users/') && path.endsWith('/permissions')) {
      const userId = parseInt(path.split('/')[3]);
      const targetUser = store.users.find(u => u.id === userId);

      if (method === 'GET') {
        return jsonResponse({
          user_id: userId,
          permissions: targetUser?.permissions || []
        });
      }

      if (method === 'PUT') {
        if (targetUser) {
          targetUser.permissions = body.permissions || [];
          saveStore(store);
          broadcastSocketEvent('user-update', { userId });
          return jsonResponse({ message: 'Cập nhật quyền hạn thành công.' });
        }
      }
    }

    // -------------------------------------------------------------
    // 10. STOCK TRANSACTIONS (RECHARTS CHART DATA)
    // -------------------------------------------------------------
    if (path.startsWith('/api/stock-transactions/')) {
      const nvlId = parseInt(path.split('/').pop());
      const nvl = store.nvl.find(n => n.id === nvlId);
      const stock = nvl ? nvl.nvl_stock : 100;
      const history = generateStockTransactions(nvlId, stock);
      return jsonResponse(history);
    }

    // Fallback for unhandled /api/ requests
    return jsonResponse({ message: 'Demo API mock handler OK', path, method });
  };
}
