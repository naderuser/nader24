/**
 * Dashboard Routes
 */

import { 
  getAllSubscriptions, 
  getSubscriptionByUUID, 
  createSubscription, 
  updateSubscription,
  deleteSubscription,
  toggleSubscription,
  getStats,
  getTotalSubscriptions
} from '../db/init.js';

// Dashboard HTML
export async function handleDashboard(request, env) {
  const html = await getDashboardHTML();
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

export async function handleStats(request, env) {
  try {
    const stats = await getStats(env);
    return jsonResponse({ success: true, data: stats });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function handleSubscriptions(request, env) {
  const url = new URL(request.url);
  const search = url.searchParams.get('search') || '';
  const status = url.searchParams.get('status') || '';
  const page = parseInt(url.searchParams.get('page')) || 1;
  
  try {
    const subs = await getAllSubscriptions(env, { search, status, page, limit: 20 });
    const total = await getTotalSubscriptions(env);
    
    const formatted = subs.map(s => formatSubscription(s, request.url));
    
    return jsonResponse({
      success: true,
      data: formatted,
      pagination: {
        page,
        limit: 20,
        total,
        pages: Math.ceil(total / 20)
      }
    });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function handleAddSubscription(request, env) {
  try {
    const body = await request.json();
    const { customer_name, remark, config_links, traffic_limit, expire_type, expire_days, expire_date } = body;
    
    if (!customer_name || !config_links) {
      return jsonResponse({ success: false, error: 'نام مشتری و لینک‌های کانفیگ الزامی است' }, 400);
    }
    
    // Parse traffic limit
    let traffic = 0;
    if (traffic_limit && traffic_limit !== 'unlimited') {
      const num = parseInt(traffic_limit);
      if (!isNaN(num)) {
        traffic = num * 1073741824; // GB to bytes
      }
    }
    
    // Parse expiration
    let expireDays = 0;
    if (expire_type === 'days' && expire_days) {
      expireDays = parseInt(expire_days);
    } else if (expire_type === 'date' && expire_date) {
      const date = new Date(expire_date);
      if (!isNaN(date.getTime())) {
        expireDays = Math.ceil((date.getTime() - Date.now()) / (86400 * 1000));
      }
    }
    
    // Parse config links
    const links = config_links
      .split('\n')
      .map(l => l.trim())
      .filter(l => l && (l.startsWith('vless://') || l.startsWith('vmess://') || 
        l.startsWith('trojan://') || l.startsWith('ss://') || l.startsWith('hy2://') ||
        l.startsWith('tuic://') || l.startsWith('wireguard://')));
    
    if (links.length === 0) {
      return jsonResponse({ success: false, error: 'هیچ لینک معتبری یافت نشد' }, 400);
    }
    
    const result = await createSubscription(env, {
      customer_name,
      remark: remark || '',
      config_links: links.join('\n'),
      traffic_limit: traffic,
      expire_days: expireDays
    });
    
    return jsonResponse({
      success: true,
      message: 'اشتراک با موفقیت ایجاد شد',
      data: { ...result, subscription_url: `${new URL(request.url).origin}/sub/${result.subscription_token}` }
    }, 201);
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function handleUpdateSubscription(request, env) {
  const url = new URL(request.url);
  const uuid = url.pathname.split('/')[3];
  
  try {
    const body = await request.json();
    const { customer_name, remark, config_links, traffic_limit, expire_type, expire_days, expire_date, enable } = body;
    
    const updates = {};
    
    if (customer_name) updates.customer_name = customer_name;
    if (remark !== undefined) updates.remark = remark;
    if (config_links) {
      const links = config_links
        .split('\n')
        .map(l => l.trim())
        .filter(l => l && (l.startsWith('vless://') || l.startsWith('vmess://') || 
          l.startsWith('trojan://') || l.startsWith('ss://') || l.startsWith('hy2://') ||
          l.startsWith('tuic://') || l.startsWith('wireguard://')));
      updates.config_links = links.join('\n');
    }
    if (traffic_limit !== undefined) {
      if (traffic_limit === 'unlimited') {
        updates.traffic_limit = 0;
      } else {
        const num = parseInt(traffic_limit);
        updates.traffic_limit = isNaN(num) ? 0 : num * 1073741824;
      }
    }
    if (expire_type) {
      if (expire_type === 'unlimited') {
        updates.expire_at = 0;
      } else if (expire_type === 'days' && expire_days) {
        updates.expire_at = Math.floor(Date.now() / 1000) + (parseInt(expire_days) * 86400);
      } else if (expire_type === 'date' && expire_date) {
        const date = new Date(expire_date);
        if (!isNaN(date.getTime())) {
          updates.expire_at = Math.floor(date.getTime() / 1000);
        }
      }
    }
    if (enable !== undefined) updates.enable = enable;
    
    await updateSubscription(env, uuid, updates);
    
    return jsonResponse({ success: true, message: 'اشتراک با موفقیت بروزرسانی شد' });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function handleDeleteSubscription(request, env) {
  const url = new URL(request.url);
  const uuid = url.pathname.split('/')[3];
  
  try {
    await deleteSubscription(env, uuid);
    return jsonResponse({ success: true, message: 'اشتراک با موفقیت حذف شد' });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function handleToggleSubscription(request, env) {
  const url = new URL(request.url);
  const parts = url.pathname.split('/');
  const uuid = parts[3];
  const action = parts[4];
  
  try {
    await toggleSubscription(env, uuid, action === 'enable');
    return jsonResponse({ success: true, message: `اشتراک ${action === 'enable' ? 'فعال' : 'غیرفعال'} شد` });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function formatSubscription(sub, baseUrl) {
  const now = Math.floor(Date.now() / 1000);
  let status = 'disabled';
  if (sub.enable) {
    if (sub.expire_at === 0 || sub.expire_at > now) {
      status = 'active';
    } else {
      status = 'expired';
    }
  }
  
  return {
    uuid: sub.uuid,
    customer_name: sub.customer_name,
    remark: sub.remark,
    config_links: sub.config_links,
    link_count: sub.config_links.split('\n').filter(l => l.trim()).length,
    traffic_limit: sub.traffic_limit,
    traffic_used: sub.traffic_used,
    expire_at: sub.expire_at,
    expire_date: sub.expire_at > 0 ? new Date(sub.expire_at * 1000).toLocaleDateString('fa-IR') : 'نامحدود',
    status,
    enable: sub.enable,
    subscription_token: sub.subscription_token,
    subscription_url: `${new URL(baseUrl).origin}/sub/${sub.subscription_token}`,
    created_at: sub.created_at
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function getDashboardHTML() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>داشبورد | NaderVPN</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Vazirmatn', sans-serif;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      min-height: 100vh;
      color: #fff;
    }
    .header {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      position: sticky;
      top: 0;
      z-index: 100;
    }
    .header h1 { font-size: 20px; display: flex; align-items: center; gap: 10px; }
    .header-actions { display: flex; gap: 12px; align-items: center; }
    .btn {
      padding: 10px 20px;
      border: none;
      border-radius: 10px;
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(102,126,234,0.4); }
    .btn-secondary {
      background: rgba(255,255,255,0.1);
      color: #fff;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .btn-danger { background: rgba(239,68,68,0.2); color: #ef4444; }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
    
    /* Stats */
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      padding: 20px;
      text-align: center;
    }
    .stat-value { font-size: 32px; font-weight: 700; color: #667eea; }
    .stat-label { font-size: 14px; color: rgba(255,255,255,0.6); margin-top: 8px; }
    
    /* Toolbar */
    .toolbar {
      display: flex;
      gap: 12px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .search-input, .filter-select {
      padding: 10px 16px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      color: #fff;
      font-family: inherit;
      font-size: 14px;
    }
    .search-input { flex: 1; min-width: 200px; }
    
    /* Table */
    .table-container {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px;
      overflow: hidden;
    }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td {
      padding: 14px 16px;
      text-align: right;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .data-table th {
      background: rgba(255,255,255,0.05);
      font-weight: 600;
      font-size: 13px;
      color: rgba(255,255,255,0.6);
    }
    .data-table tr:hover { background: rgba(255,255,255,0.03); }
    
    .badge {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 500;
    }
    .badge-active { background: rgba(16,185,129,0.2); color: #10b981; }
    .badge-expired { background: rgba(245,158,11,0.2); color: #f59e0b; }
    .badge-disabled { background: rgba(239,68,68,0.2); color: #ef4444; }
    
    .action-btns { display: flex; gap: 6px; }
    .action-btn {
      width: 32px;
      height: 32px;
      border: none;
      border-radius: 8px;
      background: rgba(255,255,255,0.1);
      color: #fff;
      cursor: pointer;
      font-size: 14px;
      transition: 0.3s;
    }
    .action-btn:hover { background: #667eea; }
    .action-btn.danger:hover { background: #ef4444; }
    .action-btn.success:hover { background: #10b981; }
    
    /* Modal */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(5px);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    .modal.active { display: flex; }
    .modal-content {
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px;
      width: 90%;
      max-width: 600px;
      max-height: 90vh;
      overflow-y: auto;
    }
    .modal-header {
      padding: 20px 24px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .modal-header h3 { font-size: 18px; }
    .modal-close {
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(255,255,255,0.1);
      border-radius: 8px;
      color: #fff;
      cursor: pointer;
      font-size: 20px;
    }
    .modal-body { padding: 24px; }
    .form-group { margin-bottom: 16px; }
    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      color: rgba(255,255,255,0.8);
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%;
      padding: 12px 16px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      color: #fff;
      font-family: inherit;
      font-size: 14px;
    }
    .form-group textarea { min-height: 150px; resize: vertical; font-family: monospace; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
    
    /* Toast */
    .toast {
      position: fixed;
      bottom: 24px;
      left: 50%;
      transform: translateX(-50%);
      padding: 14px 24px;
      background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      color: #fff;
      font-size: 14px;
      opacity: 0;
      transition: 0.3s;
      z-index: 2000;
    }
    .toast.show { opacity: 1; }
    .toast.success { border-color: #10b981; background: rgba(16,185,129,0.1); }
    .toast.error { border-color: #ef4444; background: rgba(239,68,68,0.1); }
    
    /* URL Box */
    .url-box {
      background: rgba(102,126,234,0.1);
      border: 1px solid rgba(102,126,234,0.3);
      border-radius: 10px;
      padding: 12px;
      margin-top: 12px;
      display: flex;
      gap: 10px;
      align-items: center;
    }
    .url-box input {
      flex: 1;
      background: transparent;
      border: none;
      color: #667eea;
      font-family: monospace;
      font-size: 13px;
    }
    
    @media (max-width: 768px) {
      .header { flex-direction: column; gap: 12px; }
      .form-row { grid-template-columns: 1fr; }
      .data-table { font-size: 12px; }
      .data-table th, .data-table td { padding: 10px 8px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>🔐 NaderVPN</h1>
    <div class="header-actions">
      <button class="btn btn-secondary" id="changePasswordBtn">تغییر رمز</button>
      <button class="btn btn-secondary" id="logoutBtn">خروج</button>
      <button class="btn btn-primary" id="addBtn">+ اشتراک جدید</button>
    </div>
  </header>
  
  <div class="container">
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card">
        <div class="stat-value" id="statTotal">0</div>
        <div class="stat-label">کل اشتراک‌ها</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statActive">0</div>
        <div class="stat-label">فعال</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statExpired">0</div>
        <div class="stat-label">منقضی</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statDisabled">0</div>
        <div class="stat-label">غیرفعال</div>
      </div>
    </div>
    
    <div class="toolbar">
      <input type="text" class="search-input" id="searchInput" placeholder="جستجو...">
      <select class="filter-select" id="statusFilter">
        <option value="">همه وضعیت‌ها</option>
        <option value="active">فعال</option>
        <option value="expired">منقضی</option>
        <option value="disabled">غیرفعال</option>
      </select>
    </div>
    
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>مشتری</th>
            <th>توضیحات</th>
            <th>لینک‌ها</th>
            <th>وضعیت</th>
            <th>انقضا</th>
            <th>عملیات</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <tr><td colspan="6" style="text-align:center;padding:40px;color:rgba(255,255,255,0.5);">در حال بارگذاری...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  
  <!-- Add/Edit Modal -->
  <div class="modal" id="subscriptionModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitle">اشتراک جدید</h3>
        <button class="modal-close" onclick="closeModal('subscriptionModal')">&times;</button>
      </div>
      <form id="subscriptionForm" class="modal-body">
        <input type="hidden" id="editUuid">
        <div class="form-group">
          <label>نام مشتری *</label>
          <input type="text" id="customerName" required>
        </div>
        <div class="form-group">
          <label>توضیحات</label>
          <input type="text" id="remark">
        </div>
        <div class="form-group">
          <label>لینک‌های کانفیگ *</label>
          <textarea id="configLinks" placeholder="vless://...
vmess://...
trojan://...
ss://...
hy2://..." required></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>حجم</label>
            <select id="trafficLimit">
              <option value="unlimited">نامحدود</option>
              <option value="1">1 گیگ</option>
              <option value="5">5 گیگ</option>
              <option value="10">10 گیگ</option>
              <option value="20">20 گیگ</option>
              <option value="50">50 گیگ</option>
              <option value="100">100 گیگ</option>
            </select>
          </div>
          <div class="form-group">
            <label>انقضا</label>
            <select id="expireType">
              <option value="unlimited">نامحدود</option>
              <option value="days">تعداد روز</option>
              <option value="date">تاریخ</option>
            </select>
          </div>
        </div>
        <div class="form-row" id="expireDaysRow" style="display:none;">
          <div class="form-group">
            <label>تعداد روز</label>
            <input type="number" id="expireDays" value="30">
          </div>
        </div>
        <div class="form-row" id="expireDateRow" style="display:none;">
          <div class="form-group">
            <label>تاریخ انقضا</label>
            <input type="date" id="expireDate">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal('subscriptionModal')">انصراف</button>
          <button type="submit" class="btn btn-primary">ذخیره</button>
        </div>
      </form>
    </div>
  </div>
  
  <!-- Password Modal -->
  <div class="modal" id="passwordModal">
    <div class="modal-content" style="max-width:400px;">
      <div class="modal-header">
        <h3>تغییر رمز عبور</h3>
        <button class="modal-close" onclick="closeModal('passwordModal')">&times;</button>
      </div>
      <form id="passwordForm" class="modal-body">
        <div class="form-group">
          <label>رمز فعلی</label>
          <input type="password" id="currentPassword" required>
        </div>
        <div class="form-group">
          <label>رمز جدید</label>
          <input type="password" id="newPassword" required>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal('passwordModal')">انصراف</button>
          <button type="submit" class="btn btn-primary">تغییر</button>
        </div>
      </form>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <script>
    const API = '/api';
    let currentPage = 1;
    
    // Init
    document.addEventListener('DOMContentLoaded', () => {
      loadStats();
      loadSubscriptions();
      initEventListeners();
    });
    
    function initEventListeners() {
      document.getElementById('addBtn').onclick = () => showModal();
      document.getElementById('logoutBtn').onclick = handleLogout;
      document.getElementById('changePasswordBtn').onclick = () => showModal('passwordModal');
      document.getElementById('searchInput').oninput = debounce(loadSubscriptions, 300);
      document.getElementById('statusFilter').onchange = loadSubscriptions;
      document.getElementById('subscriptionForm').onsubmit = handleSubmit;
      document.getElementById('passwordForm').onsubmit = handlePasswordSubmit;
      document.getElementById('expireType').onchange = toggleExpireFields;
    }
    
    async function loadStats() {
      try {
        const res = await fetch(API + '/stats');
        const data = await res.json();
        if (data.success) {
          document.getElementById('statTotal').textContent = data.data.total;
          document.getElementById('statActive').textContent = data.data.active;
          document.getElementById('statExpired').textContent = data.data.expired;
          document.getElementById('statDisabled').textContent = data.data.disabled;
        }
      } catch (e) { console.error(e); }
    }
    
    async function loadSubscriptions() {
      const search = document.getElementById('searchInput').value;
      const status = document.getElementById('statusFilter').value;
      const params = new URLSearchParams({ search, status, page: currentPage });
      
      try {
        const res = await fetch(API + '/subscriptions?' + params);
        const data = await res.json();
        if (data.success) {
          renderTable(data.data);
        }
      } catch (e) { console.error(e); }
    }
    
    function renderTable(subs) {
      const tbody = document.getElementById('tableBody');
      if (!subs.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:rgba(255,255,255,0.5);">اشتراکی یافت نشد</td></tr>';
        return;
      }
      
      tbody.innerHTML = subs.map(s => \`
        <tr>
          <td><strong>\${s.customer_name}</strong></td>
          <td>\${s.remark || '-'}</td>
          <td>\${s.link_count}</td>
          <td><span class="badge badge-\${s.status}">\${getStatusText(s.status)}</span></td>
          <td>\${s.expire_date}</td>
          <td>
            <div class="action-btns">
              <button class="action-btn" onclick="copyUrl('\${s.subscription_url}')" title="کپی">📋</button>
              <button class="action-btn" onclick="showQR('\${s.uuid}')" title="QR">📱</button>
              <button class="action-btn" onclick="editSub('\${s.uuid}')" title="ویرایش">✏️</button>
              <button class="action-btn \${s.enable ? 'danger' : 'success'}" onclick="toggleSub('\${s.uuid}', \${!s.enable})" title="\${s.enable ? 'غیرفعال' : 'فعال'}">\${s.enable ? '🔴' : '🟢'}</button>
              <button class="action-btn danger" onclick="deleteSub('\${s.uuid}')" title="حذف">🗑️</button>
            </div>
          </td>
        </tr>
      \`).join('');
    }
    
    function showModal(mode = 'subscriptionModal', sub = null) {
      document.getElementById(mode).classList.add('active');
      if (mode === 'subscriptionModal') {
        document.getElementById('modalTitle').textContent = sub ? 'ویرایش اشتراک' : 'اشتراک جدید';
        document.getElementById('editUuid').value = sub?.uuid || '';
        document.getElementById('customerName').value = sub?.customer_name || '';
        document.getElementById('remark').value = sub?.remark || '';
        document.getElementById('configLinks').value = sub?.config_links || '';
      }
    }
    
    function closeModal(mode) {
      document.getElementById(mode).classList.remove('active');
    }
    
    function toggleExpireFields() {
      const type = document.getElementById('expireType').value;
      document.getElementById('expireDaysRow').style.display = type === 'days' ? 'block' : 'none';
      document.getElementById('expireDateRow').style.display = type === 'date' ? 'block' : 'none';
    }
    
    async function handleSubmit(e) {
      e.preventDefault();
      const uuid = document.getElementById('editUuid').value;
      const body = {
        customer_name: document.getElementById('customerName').value,
        remark: document.getElementById('remark').value,
        config_links: document.getElementById('configLinks').value,
        traffic_limit: document.getElementById('trafficLimit').value,
        expire_type: document.getElementById('expireType').value,
        expire_days: document.getElementById('expireDays').value,
        expire_date: document.getElementById('expireDate').value
      };
      
      try {
        const res = await fetch(API + '/subscriptions' + (uuid ? '/' + uuid : ''), {
          method: uuid ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          closeModal('subscriptionModal');
          loadStats();
          loadSubscriptions();
        } else {
          showToast(data.error, 'error');
        }
      } catch (e) { showToast('خطا', 'error'); }
    }
    
    async function handlePasswordSubmit(e) {
      e.preventDefault();
      const body = {
        current_password: document.getElementById('currentPassword').value,
        new_password: document.getElementById('newPassword').value
      };
      
      try {
        const res = await fetch(API + '/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          showToast('رمز با موفقیت تغییر کرد', 'success');
          closeModal('passwordModal');
        } else {
          showToast(data.error, 'error');
        }
      } catch (e) { showToast('خطا', 'error'); }
    }
    
    async function editSub(uuid) {
      try {
        const res = await fetch(API + '/subscriptions?search=' + uuid);
        const data = await res.json();
        if (data.success && data.data.length) {
          showModal('subscriptionModal', data.data[0]);
        }
      } catch (e) {}
    }
    
    async function toggleSub(uuid, enable) {
      try {
        const res = await fetch(API + '/subscriptions/' + uuid + '/' + (enable ? 'enable' : 'disable'), { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          loadStats();
          loadSubscriptions();
        }
      } catch (e) {}
    }
    
    async function deleteSub(uuid) {
      if (!confirm('آیا از حذف این اشتراک مطمئن هستید؟')) return;
      try {
        const res = await fetch(API + '/subscriptions/' + uuid, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          loadStats();
          loadSubscriptions();
        }
      } catch (e) {}
    }
    
    function copyUrl(url) {
      navigator.clipboard.writeText(url);
      showToast('لینک کپی شد', 'success');
    }
    
    function showQR(uuid) {
      window.open('/api/qr/' + uuid, '_blank');
    }
    
    async function handleLogout() {
      await fetch(API + '/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    }
    
    function getStatusText(status) {
      const texts = { active: 'فعال', expired: 'منقضی', disabled: 'غیرفعال' };
      return texts[status] || status;
    }
    
    function showToast(msg, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.className = 'toast show ' + type;
      setTimeout(() => toast.classList.remove('show'), 3000);
    }
    
    function debounce(fn, wait) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    }
  </script>
</body>
</html>`;
}
