/**
 * NaderVPN Dashboard JavaScript
 */

// API Base URL
const API_BASE = '/api';

// State
let state = {
  currentPage: 1,
  users: [],
  nodes: [],
  selectedUsers: new Set(),
  settings: {}
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initEventListeners();
  loadDashboard();
});

// Navigation
function initNavigation() {
  const navItems = document.querySelectorAll('.nav-item[data-page]');
  const pages = document.querySelectorAll('.page');
  
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const page = item.dataset.page;
      
      // Update nav active
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');
      
      // Show page
      pages.forEach(p => p.classList.remove('active'));
      document.getElementById(`${page}Page`).classList.add('active');
      
      // Load page data
      switch(page) {
        case 'dashboard': loadDashboard(); break;
        case 'users': loadUsers(); break;
        case 'nodes': loadNodes(); break;
        case 'logs': loadLogs(); break;
        case 'settings': loadSettings(); break;
        case 'backup': loadBackups(); break;
      }
    });
  });
}

// Event Listeners
function initEventListeners() {
  // Menu Toggle
  document.getElementById('menuToggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
  });
  
  // Theme Toggle
  document.getElementById('themeBtn')?.addEventListener('click', toggleTheme);
  
  // Language
  document.querySelectorAll('#langMenu a').forEach(a => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      setLanguage(a.dataset.lang);
    });
  });
  
  // Logout
  document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
  
  // User Management
  document.getElementById('addUserBtn')?.addEventListener('click', () => showUserModal());
  document.getElementById('userForm')?.addEventListener('submit', handleUserSubmit);
  document.getElementById('selectAllUsers')?.addEventListener('change', handleSelectAll);
  document.getElementById('importUsersBtn')?.addEventListener('click', handleImportUsers);
  document.getElementById('exportUsersBtn')?.addEventListener('click', handleExportUsers);
  
  // User Filters
  document.getElementById('userSearch')?.addEventListener('input', debounce(loadUsers, 300));
  document.getElementById('userStatusFilter')?.addEventListener('change', loadUsers);
  document.getElementById('userSort')?.addEventListener('change', loadUsers);
  
  // Bulk Actions
  document.getElementById('bulkRenewBtn')?.addEventListener('click', () => bulkAction('renew'));
  document.getElementById('bulkTrafficBtn')?.addEventListener('click', () => bulkAction('traffic'));
  document.getElementById('bulkEnableBtn')?.addEventListener('click', () => bulkAction('enable'));
  document.getElementById('bulkDisableBtn')?.addEventListener('click', () => bulkAction('disable'));
  document.getElementById('bulkDeleteBtn')?.addEventListener('click', () => bulkAction('delete'));
  
  // Node Management
  document.getElementById('addNodeBtn')?.addEventListener('click', () => showNodeModal());
  document.getElementById('nodeForm')?.addEventListener('submit', handleNodeSubmit);
  document.getElementById('importNodesBtn')?.addEventListener('click', handleImportNodes);
  document.getElementById('exportNodesBtn')?.addEventListener('click', handleExportNodes);
  
  // Settings
  document.getElementById('generalSettingsForm')?.addEventListener('submit', handleGeneralSettings);
  document.getElementById('passwordForm')?.addEventListener('submit', handlePasswordChange);
  document.getElementById('defaultSettingsForm')?.addEventListener('submit', handleDefaultSettings);
  
  // Backup
  document.getElementById('createBackupBtn')?.addEventListener('click', handleCreateBackup);
  document.getElementById('restoreBackupBtn')?.addEventListener('click', handleRestoreBackup);
}

// API Helper
async function api(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    headers: {
      'Content-Type': 'application/json'
    },
    ...options
  };
  
  if (config.body && typeof config.body === 'object') {
    config.body = JSON.stringify(config.body);
  }
  
  try {
    const response = await fetch(url, config);
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    
    return data;
  } catch (error) {
    console.error('API Error:', error);
    showToast(error.message, 'error');
    throw error;
  }
}

// Dashboard
async function loadDashboard() {
  try {
    const [statsRes, chartsRes] = await Promise.all([
      api('/dashboard/stats'),
      api('/dashboard/charts?days=7')
    ]);
    
    updateStats(statsRes.data);
    renderCharts(chartsRes.data);
    renderLatestUsers(statsRes.data.latestUsers);
    renderRecentLogs(statsRes.data.recentLogs);
  } catch (error) {
    console.error('Dashboard error:', error);
  }
}

function updateStats(data) {
  document.getElementById('statTotalUsers').textContent = data.totalUsers || 0;
  document.getElementById('statActiveUsers').textContent = data.activeUsers || 0;
  document.getElementById('statExpiredUsers').textContent = data.expiredUsers || 0;
  document.getElementById('statOnlineUsers').textContent = data.onlineUsers || 0;
}

function renderCharts(data) {
  // Simple chart rendering using Canvas
  // For production, use Chart.js or similar
  const trafficCanvas = document.getElementById('trafficChart');
  const growthCanvas = document.getElementById('userGrowthChart');
  
  if (trafficCanvas) {
    trafficCanvas.height = 200;
    const ctx = trafficCanvas.getContext('2d');
    // Simple bar chart
    const traffic = data.trafficChart || [];
    const maxTraffic = Math.max(...traffic.map(t => t.total), 1);
    const barWidth = trafficCanvas.width / traffic.length - 10;
    
    ctx.fillStyle = '#667eea';
    traffic.forEach((t, i) => {
      const height = (t.total / maxTraffic) * 150;
      ctx.fillRect(i * (barWidth + 10) + 5, 180 - height, barWidth, height);
    });
  }
}

function renderLatestUsers(users) {
  const container = document.getElementById('latestUsers');
  if (!container) return;
  
  if (!users || users.length === 0) {
    container.innerHTML = '<p class="text-muted">کاربری یافت نشد</p>';
    return;
  }
  
  container.innerHTML = users.map(user => `
    <div class="activity-item">
      <div class="activity-avatar">👤</div>
      <div class="activity-content">
        <div class="activity-title">${user.username}</div>
        <div class="activity-time">${formatDate(user.created_at)}</div>
      </div>
      <span class="badge badge-${user.status}">${getStatusText(user.status)}</span>
    </div>
  `).join('');
}

function renderRecentLogs(logs) {
  const container = document.getElementById('recentLogs');
  if (!container) return;
  
  if (!logs || logs.length === 0) {
    container.innerHTML = '<p class="text-muted">لاگی یافت نشد</p>';
    return;
  }
  
  container.innerHTML = logs.map(log => `
    <div class="activity-item">
      <div class="activity-avatar">${getActionIcon(log.action)}</div>
      <div class="activity-content">
        <div class="activity-title">${getActionText(log.action)}</div>
        <div class="activity-time">${log.ip || '-'} - ${formatDate(log.created_at)}</div>
      </div>
    </div>
  `).join('');
}

// Users Management
async function loadUsers() {
  const search = document.getElementById('userSearch')?.value || '';
  const status = document.getElementById('userStatusFilter')?.value || '';
  const sortSelect = document.getElementById('userSort');
  const [sort, order] = sortSelect?.value?.split('-') || ['created_at', 'desc'];
  
  try {
    const params = new URLSearchParams({
      search,
      status,
      sort,
      order,
      page: state.currentPage,
      limit: 20
    });
    
    const res = await api(`/users?${params}`);
    state.users = res.data;
    renderUsersTable(res.data);
    renderPagination(res.pagination);
  } catch (error) {
    console.error('Load users error:', error);
  }
}

function renderUsersTable(users) {
  const tbody = document.getElementById('usersTableBody');
  if (!tbody) return;
  
  if (!users || users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">کاربری یافت نشد</td></tr>';
    return;
  }
  
  tbody.innerHTML = users.map(user => `
    <tr data-uuid="${user.uuid}">
      <td><input type="checkbox" class="user-checkbox" ${state.selectedUsers.has(user.uuid) ? 'checked' : ''}></td>
      <td>
        <div class="user-info">
          <strong>${user.username}</strong>
          ${user.remark ? `<small>${user.remark}</small>` : ''}
        </div>
      </td>
      <td><span class="badge">${user.protocol.toUpperCase()}</span></td>
      <td><span class="badge badge-${user.status}">${getStatusText(user.status)}</span></td>
      <td>${user.expire_at > 0 ? formatDate(user.expire_at) : 'نامحدود'}</td>
      <td>${formatTraffic(user.upload + user.download)} / ${formatTraffic(user.traffic_limit)}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="copySubscription('${user.subscription_token}')" title="کپی لینک">📋</button>
          <button class="action-btn" onclick="showUserModal('${user.uuid}')" title="ویرایش">✏️</button>
          <button class="action-btn" onclick="resetUserTraffic('${user.uuid}')" title="بازنشانی ترافیک">🔄</button>
          <button class="action-btn" onclick="toggleUserStatus('${user.uuid}', ${user.enable})" title="${user.enable ? 'غیرفعال' : 'فعال'}">
            ${user.enable ? '🔴' : '🟢'}
          </button>
          <button class="action-btn danger" onclick="deleteUser('${user.uuid}')" title="حذف">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
  
  // Add checkbox listeners
  tbody.querySelectorAll('.user-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const uuid = e.target.closest('tr').dataset.uuid;
      if (e.target.checked) {
        state.selectedUsers.add(uuid);
      } else {
        state.selectedUsers.delete(uuid);
      }
      updateBulkActions();
    });
  });
}

function renderPagination(pagination) {
  const container = document.getElementById('usersPagination');
  if (!container || !pagination) return;
  
  let html = '';
  
  if (pagination.pages > 1) {
    for (let i = 1; i <= pagination.pages; i++) {
      html += `<button class="${i === pagination.page ? 'active' : ''}" onclick="goToPage(${i})">${i}</button>`;
    }
  }
  
  container.innerHTML = html;
}

function goToPage(page) {
  state.currentPage = page;
  loadUsers();
}

function handleSelectAll(e) {
  const checkboxes = document.querySelectorAll('.user-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = e.target.checked;
    const uuid = cb.closest('tr').dataset.uuid;
    if (e.target.checked) {
      state.selectedUsers.add(uuid);
    } else {
      state.selectedUsers.delete(uuid);
    }
  });
  updateBulkActions();
}

function updateBulkActions() {
  const bulkActions = document.getElementById('bulkActions');
  const selectedCount = document.getElementById('selectedCount');
  
  if (state.selectedUsers.size > 0) {
    bulkActions.style.display = 'flex';
    selectedCount.textContent = `${state.selectedUsers.size} مورد انتخاب شده`;
  } else {
    bulkActions.style.display = 'none';
  }
}

async function bulkAction(action) {
  const uuids = Array.from(state.selectedUsers);
  
  if (uuids.length === 0) {
    showToast('کاربری انتخاب نشده', 'error');
    return;
  }
  
  let endpoint, body, successMsg;
  
  switch(action) {
    case 'renew':
      const days = prompt('تعداد روزها برای تمدید:', '30');
      if (days === null) return;
      endpoint = '/users/bulk/renew';
      body = { uuids, days: parseInt(days) };
      successMsg = 'کاربران تمدید شدند';
      break;
    case 'traffic':
      endpoint = '/users/bulk/traffic';
      body = { uuids };
      successMsg = 'ترافیک بازنشانی شد';
      break;
    case 'enable':
      endpoint = '/users/bulk/enable';
      body = { uuids };
      successMsg = 'کاربران فعال شدند';
      break;
    case 'disable':
      endpoint = '/users/bulk/disable';
      body = { uuids };
      successMsg = 'کاربران غیرفعال شدند';
      break;
    case 'delete':
      if (!confirm('آیا از حذف کاربران انتخاب شده مطمئن هستید؟')) return;
      endpoint = '/users/bulk/delete';
      body = { uuids };
      successMsg = 'کاربران حذف شدند';
      break;
  }
  
  try {
    await api(endpoint, { method: 'POST', body });
    showToast(successMsg, 'success');
    state.selectedUsers.clear();
    loadUsers();
  } catch (error) {
    console.error('Bulk action error:', error);
  }
}

function showUserModal(uuid = null) {
  const modal = document.getElementById('userModal');
  const form = document.getElementById('userForm');
  const title = document.getElementById('userModalTitle');
  
  form.reset();
  
  if (uuid) {
    title.textContent = 'ویرایش کاربر';
    const user = state.users.find(u => u.uuid === uuid);
    if (user) {
      document.getElementById('userUuid').value = user.uuid;
      document.getElementById('newUsername').value = user.username;
      document.getElementById('newRemark').value = user.remark || '';
      document.getElementById('newProtocol').value = user.protocol;
      document.getElementById('newEnable').checked = user.enable;
    }
  } else {
    title.textContent = 'کاربر جدید';
    document.getElementById('userUuid').value = '';
  }
  
  modal.classList.add('active');
}

async function handleUserSubmit(e) {
  e.preventDefault();
  
  const uuid = document.getElementById('userUuid').value;
  const body = {
    username: document.getElementById('newUsername').value,
    remark: document.getElementById('newRemark').value,
    protocol: document.getElementById('newProtocol').value,
    expire_days: parseInt(document.getElementById('newExpireDays').value) || 30,
    traffic_gb: parseInt(document.getElementById('newTrafficGb').value) || 100,
    enable: document.getElementById('newEnable').checked
  };
  
  try {
    if (uuid) {
      await api(`/users/${uuid}`, { method: 'PUT', body });
      showToast('کاربر ویرایش شد', 'success');
    } else {
      await api('/users', { method: 'POST', body });
      showToast('کاربر ایجاد شد', 'success');
    }
    
    closeModal('userModal');
    loadUsers();
  } catch (error) {
    console.error('User submit error:', error);
  }
}

async function resetUserTraffic(uuid) {
  try {
    await api(`/users/${uuid}/reset`, { method: 'POST' });
    showToast('ترافیک بازنشانی شد', 'success');
    loadUsers();
  } catch (error) {
    console.error('Reset traffic error:', error);
  }
}

async function toggleUserStatus(uuid, currentEnable) {
  const endpoint = currentEnable ? `/users/${uuid}/disable` : `/users/${uuid}/enable`;
  try {
    await api(endpoint, { method: 'POST' });
    showToast(currentEnable ? 'کاربر غیرفعال شد' : 'کاربر فعال شد', 'success');
    loadUsers();
  } catch (error) {
    console.error('Toggle status error:', error);
  }
}

async function deleteUser(uuid) {
  if (!confirm('آیا از حذف این کاربر مطمئن هستید؟')) return;
  
  try {
    await api(`/users/${uuid}`, { method: 'DELETE' });
    showToast('کاربر حذف شد', 'success');
    loadUsers();
  } catch (error) {
    console.error('Delete user error:', error);
  }
}

function copySubscription(token) {
  const url = `${window.location.origin}/sub/${token}`;
  navigator.clipboard.writeText(url);
  showToast('لینک اشتراک کپی شد', 'success');
}

async function handleImportUsers() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.csv';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const content = await file.text();
    
    try {
      let body;
      if (file.name.endsWith('.json')) {
        body = JSON.parse(content);
        await api('/import/json', { method: 'POST', body });
      } else {
        await api('/import/csv', { method: 'POST', body: { csv: content } });
      }
      showToast('کاربران وارد شدند', 'success');
      loadUsers();
    } catch (error) {
      console.error('Import error:', error);
    }
  };
  
  input.click();
}

async function handleExportUsers() {
  try {
    const res = await fetch(`${API_BASE}/export/json`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export error:', error);
  }
}

// Nodes Management
async function loadNodes() {
  try {
    const res = await api('/nodes');
    state.nodes = res.data;
    renderNodesTable(res.data);
  } catch (error) {
    console.error('Load nodes error:', error);
  }
}

function renderNodesTable(nodes) {
  const tbody = document.getElementById('nodesTableBody');
  if (!tbody) return;
  
  if (!nodes || nodes.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">نودی یافت نشد</td></tr>';
    return;
  }
  
  tbody.innerHTML = nodes.map(node => `
    <tr data-id="${node.id}">
      <td>${node.name}</td>
      <td>${node.address}</td>
      <td>${node.port}</td>
      <td><span class="badge">${node.type.toUpperCase()}</span></td>
      <td><span class="badge badge-${node.enable ? 'active' : 'disabled'}">${node.enable ? 'فعال' : 'غیرفعال'}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="showNodeModal(${node.id})" title="ویرایش">✏️</button>
          <button class="action-btn danger" onclick="deleteNode(${node.id})" title="حذف">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

function showNodeModal(id = null) {
  const modal = document.getElementById('nodeModal');
  const title = document.getElementById('nodeModalTitle');
  
  document.getElementById('nodeForm').reset();
  
  if (id) {
    title.textContent = 'ویرایش نود';
    const node = state.nodes.find(n => n.id === id);
    if (node) {
      document.getElementById('nodeId').value = node.id;
      document.getElementById('nodeName').value = node.name;
      document.getElementById('nodeAddress').value = node.address;
      document.getElementById('nodePort').value = node.port;
      document.getElementById('nodeType').value = node.type;
      document.getElementById('nodeTls').checked = node.tls;
      document.getElementById('nodeRemark').value = node.remark || '';
    }
  } else {
    title.textContent = 'نود جدید';
    document.getElementById('nodeId').value = '';
  }
  
  modal.classList.add('active');
}

async function handleNodeSubmit(e) {
  e.preventDefault();
  
  const id = document.getElementById('nodeId').value;
  const body = {
    name: document.getElementById('nodeName').value,
    address: document.getElementById('nodeAddress').value,
    port: parseInt(document.getElementById('nodePort').value),
    type: document.getElementById('nodeType').value,
    tls: document.getElementById('nodeTls').checked,
    remark: document.getElementById('nodeRemark').value
  };
  
  try {
    if (id) {
      await api(`/nodes/${id}`, { method: 'PUT', body });
      showToast('نود ویرایش شد', 'success');
    } else {
      await api('/nodes', { method: 'POST', body });
      showToast('نود ایجاد شد', 'success');
    }
    
    closeModal('nodeModal');
    loadNodes();
  } catch (error) {
    console.error('Node submit error:', error);
  }
}

async function deleteNode(id) {
  if (!confirm('آیا از حذف این نود مطمئن هستید؟')) return;
  
  try {
    await api(`/nodes/${id}`, { method: 'DELETE' });
    showToast('نود حذف شد', 'success');
    loadNodes();
  } catch (error) {
    console.error('Delete node error:', error);
  }
}

async function handleImportNodes() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,.csv';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const content = await file.text();
    
    try {
      let body;
      if (file.name.endsWith('.json')) {
        body = JSON.parse(content);
      } else {
        showToast('فرمت JSON پشتیبانی می‌شود', 'error');
        return;
      }
      
      await api('/nodes/import', { method: 'POST', body: { nodes: body } });
      showToast('نودها وارد شدند', 'success');
      loadNodes();
    } catch (error) {
      console.error('Import error:', error);
    }
  };
  
  input.click();
}

async function handleExportNodes() {
  try {
    const res = await fetch(`${API_BASE}/nodes/export`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nodes-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('Export error:', error);
  }
}

// Logs
async function loadLogs() {
  const action = document.getElementById('logActionFilter')?.value || '';
  
  try {
    const params = new URLSearchParams({ action, limit: 50 });
    const res = await api(`/logs?${params}`);
    renderLogsTable(res.data);
  } catch (error) {
    console.error('Load logs error:', error);
  }
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logsTableBody');
  if (!tbody) return;
  
  if (!logs || logs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">لاگی یافت نشد</td></tr>';
    return;
  }
  
  tbody.innerHTML = logs.map(log => `
    <tr>
      <td>${formatDate(log.created_at)}</td>
      <td><span class="badge">${getActionText(log.action)}</span></td>
      <td>${log.target || '-'}</td>
      <td>${log.ip || '-'}</td>
      <td>${log.details || '-'}</td>
    </tr>
  `).join('');
}

// Settings
async function loadSettings() {
  try {
    const res = await api('/settings');
    state.settings = res.data;
    
    document.getElementById('appName').value = res.data.app_name || '';
    document.getElementById('appUrl').value = res.data.app_url || '';
    document.getElementById('settingsLanguage').value = res.data.language || 'fa';
    document.getElementById('settingsTheme').value = res.data.theme || 'dark';
    document.getElementById('defaultTraffic').value = (parseInt(res.data.default_traffic) / 1073741824) || 100;
    document.getElementById('defaultDays').value = res.data.default_days || 30;
  } catch (error) {
    console.error('Load settings error:', error);
  }
}

async function handleGeneralSettings(e) {
  e.preventDefault();
  
  const body = {
    app_name: document.getElementById('appName').value,
    app_url: document.getElementById('appUrl').value,
    language: document.getElementById('settingsLanguage').value,
    theme: document.getElementById('settingsTheme').value
  };
  
  try {
    await api('/settings/update', { method: 'PUT', body });
    showToast('تنظیمات ذخیره شد', 'success');
  } catch (error) {
    console.error('Settings error:', error);
  }
}

async function handlePasswordChange(e) {
  e.preventDefault();
  
  const form = e.target;
  const body = {
    current_password: form.current_password.value,
    new_password: form.new_password.value,
    confirm_password: form.confirm_password.value
  };
  
  if (body.new_password !== body.confirm_password) {
    showToast('رمزهای جدید مطابقت ندارند', 'error');
    return;
  }
  
  try {
    await api('/settings/password', { method: 'POST', body });
    showToast('رمز با موفقیت تغییر کرد', 'success');
    form.reset();
  } catch (error) {
    console.error('Password change error:', error);
  }
}

async function handleDefaultSettings(e) {
  e.preventDefault();
  
  const body = {
    default_traffic: (parseInt(document.getElementById('defaultTraffic').value) * 1073741824).toString(),
    default_days: document.getElementById('defaultDays').value
  };
  
  try {
    await api('/settings/update', { method: 'PUT', body });
    showToast('تنظیمات ذخیره شد', 'success');
  } catch (error) {
    console.error('Default settings error:', error);
  }
}

// Backup
async function loadBackups() {
  try {
    const res = await api('/backup/list');
    renderBackupsTable(res.data);
  } catch (error) {
    console.error('Load backups error:', error);
  }
}

function renderBackupsTable(backups) {
  const tbody = document.getElementById('backupsTableBody');
  if (!tbody) return;
  
  if (!backups || backups.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="loading">پشتیبانی یافت نشد</td></tr>';
    return;
  }
  
  tbody.innerHTML = backups.map(b => `
    <tr>
      <td>${b.filename}</td>
      <td>${formatDate(new Date(b.created_at).getTime() / 1000)}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="downloadBackup('${b.filename}')" title="دانلود">📥</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function handleCreateBackup() {
  try {
    await api('/backup/create', { method: 'POST' });
    showToast('پشتیبان ایجاد شد', 'success');
    loadBackups();
  } catch (error) {
    console.error('Create backup error:', error);
  }
}

async function handleRestoreBackup() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    if (!confirm('آیا از بازگردانی پشتیبان مطمئن هستید؟ داده‌های فعلی جایگزین خواهند شد.')) return;
    
    try {
      const content = await file.text();
      const backup = JSON.parse(content);
      
      await api('/backup/restore', { method: 'POST', body: { backup } });
      showToast('پشتیبان بازگردانی شد', 'success');
      loadDashboard();
    } catch (error) {
      console.error('Restore error:', error);
    }
  };
  
  input.click();
}

function downloadBackup(filename) {
  window.open(`${API_BASE}/backup/download?file=${filename}`, '_blank');
}

// Auth
async function handleLogout() {
  try {
    await api('/auth/logout', { method: 'POST' });
    window.location.href = '/login';
  } catch (error) {
    console.error('Logout error:', error);
    window.location.href = '/login';
  }
}

// Theme
function toggleTheme() {
  document.body.classList.toggle('light-theme');
  const isLight = document.body.classList.contains('light-theme');
  document.getElementById('themeBtn').textContent = isLight ? '☀️' : '🌙';
  localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

// Language
function setLanguage(lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  localStorage.setItem('language', lang);
}

// Modal
function closeModal(modalId) {
  document.getElementById(modalId)?.classList.remove('active');
}

// Toast
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// Utility Functions
function formatDate(timestamp) {
  if (!timestamp) return '-';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('fa-IR', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatTraffic(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  while (bytes >= 1024 && i < units.length - 1) {
    bytes /= 1024;
    i++;
  }
  return `${bytes.toFixed(1)} ${units[i]}`;
}

function getStatusText(status) {
  const texts = {
    active: 'فعال',
    expired: 'منقضی',
    disabled: 'غیرفعال'
  };
  return texts[status] || status;
}

function getActionText(action) {
  const texts = {
    login: 'ورود',
    logout: 'خروج',
    create_user: 'ایجاد کاربر',
    update_user: 'ویرایش کاربر',
    delete_user: 'حذف کاربر',
    subscription: 'اشتراک',
    create_node: 'ایجاد نود',
    update_node: 'ویرایش نود',
    delete_node: 'حذف نود',
    update_settings: 'تغییر تنظیمات'
  };
  return texts[action] || action;
}

function getActionIcon(action) {
  const icons = {
    login: '🔐',
    logout: '🚪',
    create_user: '👤',
    update_user: '✏️',
    delete_user: '🗑️',
    subscription: '📋',
    create_node: '🖥️',
    update_node: '✏️',
    delete_node: '🗑️'
  };
  return icons[action] || '📝';
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Make functions globally available
window.goToPage = goToPage;
window.copySubscription = copySubscription;
window.showUserModal = showUserModal;
window.resetUserTraffic = resetUserTraffic;
window.toggleUserStatus = toggleUserStatus;
window.deleteUser = deleteUser;
window.showNodeModal = showNodeModal;
window.deleteNode = deleteNode;
window.downloadBackup = downloadBackup;
window.closeModal = closeModal;
