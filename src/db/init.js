/**
 * Database Operations
 */

export async function getSetting(env, key) {
  const result = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return result?.value;
}

export async function setSetting(env, key, value) {
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind(key, value).run();
}

export async function getAllSubscriptions(env, options = {}) {
  const { search = '', status = '', page = 1, limit = 50 } = options;
  
  let query = 'SELECT * FROM subscriptions WHERE 1=1';
  const params = [];
  
  if (search) {
    query += ' AND (customer_name LIKE ? OR remark LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  
  if (status === 'active') {
    query += ' AND enable = 1 AND (expire_at = 0 OR expire_at > ?)';
    params.push(Math.floor(Date.now() / 1000));
  } else if (status === 'expired') {
    query += ' AND expire_at > 0 AND expire_at < ?';
    params.push(Math.floor(Date.now() / 1000));
  } else if (status === 'disabled') {
    query += ' AND enable = 0';
  }
  
  query += ' ORDER BY created_at DESC';
  
  const offset = (page - 1) * limit;
  query += ' LIMIT ? OFFSET ?';
  params.push(limit, offset);
  
  const result = await env.DB.prepare(query).bind(...params).all();
  return result.results;
}

export async function getSubscriptionByUUID(env, uuid) {
  return await env.DB.prepare('SELECT * FROM subscriptions WHERE uuid = ?').bind(uuid).first();
}

export async function getSubscriptionByToken(env, token) {
  return await env.DB.prepare('SELECT * FROM subscriptions WHERE subscription_token = ?').bind(token).first();
}

export async function createSubscription(env, data) {
  const {
    customer_name,
    remark = '',
    config_links,
    traffic_limit = 0,
    expire_days = 0
  } = data;
  
  const uuid = crypto.randomUUID();
  const subscription_token = generateToken(16);
  const expire_at = expire_days > 0 ? Math.floor(Date.now() / 1000) + (expire_days * 86400) : 0;
  
  const result = await env.DB.prepare(`
    INSERT INTO subscriptions (uuid, customer_name, remark, config_links, traffic_limit, expire_at, subscription_token)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(uuid, customer_name, remark, config_links, traffic_limit, expire_at, subscription_token).run();
  
  return { id: result.meta.last_row_id, uuid, subscription_token };
}

export async function updateSubscription(env, uuid, data) {
  const fields = [];
  const values = [];
  
  const allowed = ['customer_name', 'remark', 'config_links', 'traffic_limit', 'expire_at', 'enable'];
  
  for (const [key, value] of Object.entries(data)) {
    if (allowed.includes(key)) {
      fields.push(`${key} = ?`);
      values.push(key === 'enable' ? (value ? 1 : 0) : value);
    }
  }
  
  if (fields.length === 0) return false;
  
  fields.push('updated_at = ?');
  values.push(Math.floor(Date.now() / 1000));
  values.push(uuid);
  
  const result = await env.DB.prepare(`
    UPDATE subscriptions SET ${fields.join(', ')} WHERE uuid = ?
  `).bind(...values).run();
  
  return result.success;
}

export async function deleteSubscription(env, uuid) {
  const result = await env.DB.prepare('DELETE FROM subscriptions WHERE uuid = ?').bind(uuid).run();
  return result.success;
}

export async function toggleSubscription(env, uuid, enable) {
  const result = await env.DB.prepare(`
    UPDATE subscriptions SET enable = ?, updated_at = ? WHERE uuid = ?
  `).bind(enable ? 1 : 0, Math.floor(Date.now() / 1000), uuid).run();
  return result.success;
}

export async function getStats(env) {
  const now = Math.floor(Date.now() / 1000);
  
  const total = await env.DB.prepare('SELECT COUNT(*) as c FROM subscriptions').first();
  const active = await env.DB.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE enable = 1 AND (expire_at = 0 OR expire_at > ?)').bind(now).first();
  const expired = await env.DB.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE expire_at > 0 AND expire_at < ?').bind(now).first();
  const disabled = await env.DB.prepare('SELECT COUNT(*) as c FROM subscriptions WHERE enable = 0').first();
  
  const traffic = await env.DB.prepare('SELECT SUM(traffic_limit) as t FROM subscriptions').first();
  
  return {
    total: total?.c || 0,
    active: active?.c || 0,
    expired: expired?.c || 0,
    disabled: disabled?.c || 0,
    totalTraffic: traffic?.t || 0
  };
}

export async function getTotalSubscriptions(env) {
  const result = await env.DB.prepare('SELECT COUNT(*) as c FROM subscriptions').first();
  return result?.c || 0;
}

function generateToken(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (let i = 0; i < length; i++) {
    result += chars[array[i] % chars.length];
  }
  return result;
}
