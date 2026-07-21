/**
 * Database Initialization and Connection
 */

let dbInitialized = false;

export async function initDatabase(env) {
  if (dbInitialized) return;
  
  try {
    // Test database connection
    await env.DB.prepare('SELECT 1').first();
    dbInitialized = true;
    console.log('Database connected successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    throw error;
  }
}

export async function getDB(env) {
  return env.DB;
}

// User operations
export async function getAllUsers(env, options = {}) {
  const { search = '', status = '', sort = 'created_at', order = 'desc', page = 1, limit = 50 } = options;
  
  let query = 'SELECT * FROM users WHERE 1=1';
  const params = [];
  
  if (search) {
    query += ' AND (username LIKE ? OR remark LIKE ? OR uuid LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  
  if (status) {
    query += ' AND status = ?';
    params.push(status);
  }
  
  query += ` ORDER BY ${sort} ${order}`;
  
  // Pagination
  const offset = (page - 1) * limit;
  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const users = await env.DB.prepare(query).bind(...params).all();
  return users.results;
}

export async function getUserByUUID(env, uuid) {
  return await env.DB.prepare('SELECT * FROM users WHERE uuid = ?').bind(uuid).first();
}

export async function getUserByUsername(env, username) {
  return await env.DB.prepare('SELECT * FROM users WHERE username = ?').bind(username).first();
}

export async function getUserByToken(env, token) {
  return await env.DB.prepare('SELECT * FROM users WHERE subscription_token = ?').bind(token).first();
}

export async function createUser(env, userData) {
  const {
    uuid,
    username,
    remark = '',
    protocol = 'vless',
    expire_at = 0,
    traffic_limit = 107374182400,
    enable = 1,
    created_by = 'admin'
  } = userData;
  
  const subscription_token = generateToken(16);
  
  const result = await env.DB.prepare(`
    INSERT INTO users (uuid, username, remark, protocol, expire_at, traffic_limit, subscription_token, enable, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(uuid, username, remark, protocol, expire_at, traffic_limit, subscription_token, enable, created_by).run();
  
  return { id: result.meta.last_row_id, subscription_token };
}

export async function updateUser(env, uuid, updates) {
  const allowedFields = [
    'username', 'remark', 'protocol', 'expire_at', 'traffic_limit', 
    'status', 'enable', 'upload', 'download', 'flow', 'network',
    'security', 'transport', 'sni', 'host', 'alpn', 'allowinsecure',
    'fingerprint', 'header_type', 'seeding', 'peer', 'mtu', 'reserved',
    'protocol_param', 'stream_param', 'notes'
  ];
  
  const fields = Object.keys(updates).filter(k => allowedFields.includes(k));
  if (fields.length === 0) return false;
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);
  
  const result = await env.DB.prepare(`
    UPDATE users SET ${setClause} WHERE uuid = ?
  `).bind(...values, uuid).run();
  
  return result.success;
}

export async function deleteUser(env, uuid) {
  const result = await env.DB.prepare('DELETE FROM users WHERE uuid = ?').bind(uuid).run();
  return result.success;
}

export async function resetUserTraffic(env, uuid) {
  const result = await env.DB.prepare(`
    UPDATE users SET upload = 0, download = 0 WHERE uuid = ?
  `).bind(uuid).run();
  return result.success;
}

export async function resetUserExpiration(env, uuid, days) {
  const expire_at = days === 0 ? 0 : Math.floor(Date.now() / 1000) + (days * 86400);
  const result = await env.DB.prepare(`
    UPDATE users SET expire_at = ? WHERE uuid = ?
  `).bind(expire_at, uuid).run();
  return result.success;
}

export async function setUserStatus(env, uuid, status) {
  const result = await env.DB.prepare(`
    UPDATE users SET status = ? WHERE uuid = ?
  `).bind(status, uuid).run();
  return result.success;
}

export async function setUserEnable(env, uuid, enable) {
  const result = await env.DB.prepare(`
    UPDATE users SET enable = ? WHERE uuid = ?
  `).bind(enable ? 1 : 0, uuid).run();
  return result.success;
}

// Node operations
export async function getAllNodes(env) {
  const nodes = await env.DB.prepare('SELECT * FROM nodes ORDER BY sort ASC, id ASC').all();
  return nodes.results;
}

export async function getEnabledNodes(env) {
  const nodes = await env.DB.prepare('SELECT * FROM nodes WHERE enable = 1 ORDER BY sort ASC').all();
  return nodes.results;
}

export async function getNodeById(env, id) {
  return await env.DB.prepare('SELECT * FROM nodes WHERE id = ?').bind(id).first();
}

export async function createNode(env, nodeData) {
  const { name, address, port, tls = 0, type = 'vless', enable = 1, sort = 0, remark = '' } = nodeData;
  
  const result = await env.DB.prepare(`
    INSERT INTO nodes (name, address, port, tls, type, enable, sort, remark)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(name, address, port, tls, type, enable, sort, remark).run();
  
  return { id: result.meta.last_row_id };
}

export async function updateNode(env, id, updates) {
  const allowedFields = ['name', 'address', 'port', 'tls', 'type', 'enable', 'sort', 'remark'];
  const fields = Object.keys(updates).filter(k => allowedFields.includes(k));
  if (fields.length === 0) return false;
  
  const setClause = fields.map(f => `${f} = ?`).join(', ');
  const values = fields.map(f => updates[f]);
  
  const result = await env.DB.prepare(`
    UPDATE nodes SET ${setClause} WHERE id = ?
  `).bind(...values, id).run();
  
  return result.success;
}

export async function deleteNode(env, id) {
  const result = await env.DB.prepare('DELETE FROM nodes WHERE id = ?').bind(id).run();
  return result.success;
}

// Settings operations
export async function getSetting(env, key) {
  const result = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return result?.value;
}

export async function getAllSettings(env) {
  const settings = await env.DB.prepare('SELECT * FROM settings').all();
  const result = {};
  for (const s of settings.results) {
    result[s.key] = s.value;
  }
  return result;
}

export async function setSetting(env, key, value) {
  const result = await env.DB.prepare(`
    INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
  `).bind(key, value).run();
  return result.success;
}

export async function updateSettings(env, settings) {
  for (const [key, value] of Object.entries(settings)) {
    await setSetting(env, key, value);
  }
  return true;
}

// Logs operations
export async function addLog(env, action, target = '', ip = '', userAgent = '', details = '') {
  const result = await env.DB.prepare(`
    INSERT INTO logs (action, target, ip, user_agent, details)
    VALUES (?, ?, ?, ?, ?)
  `).bind(action, target, ip, userAgent, details).run();
  return result.success;
}

export async function getLogs(env, options = {}) {
  const { action = '', limit = 100, page = 1 } = options;
  
  let query = 'SELECT * FROM logs WHERE 1=1';
  const params = [];
  
  if (action) {
    query += ' AND action = ?';
    params.push(action);
  }
  
  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(limit, (page - 1) * limit);
  
  const logs = await env.DB.prepare(query).bind(...params).all();
  return logs.results;
}

// Statistics
export async function getStats(env) {
  const now = Math.floor(Date.now() / 1000);
  
  // Total users
  const totalResult = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
  
  // Active users (not expired, enabled)
  const activeResult = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM users 
    WHERE (expire_at = 0 OR expire_at > ?) AND enable = 1
  `).bind(now).first();
  
  // Expired users
  const expiredResult = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM users 
    WHERE expire_at > 0 AND expire_at < ?
  `).bind(now).first();
  
  // Total bandwidth
  const bandwidthResult = await env.DB.prepare(`
    SELECT SUM(upload + download) as total FROM users
  `).first();
  
  // Latest users
  const latestUsers = await env.DB.prepare(`
    SELECT * FROM users ORDER BY created_at DESC LIMIT 10
  `).all();
  
  return {
    totalUsers: totalResult?.count || 0,
    activeUsers: activeResult?.count || 0,
    expiredUsers: expiredResult?.count || 0,
    totalBandwidth: bandwidthResult?.total || 0,
    latestUsers: latestUsers.results
  };
}

// Utility functions
function generateToken(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export { generateToken };
