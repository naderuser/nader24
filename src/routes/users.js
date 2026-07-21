/**
 * Users Routes
 */

import { 
  getAllUsers, 
  getUserByUUID, 
  createUser, 
  updateUser, 
  deleteUser,
  resetUserTraffic,
  resetUserExpiration,
  setUserEnable,
  setUserStatus,
  addLog,
  getSetting
} from '../db/init.js';
import { generateUUID, generateToken } from '../utils/crypto.js';
import { sanitizeInput, validateUsername, validateUUID, validatePort } from '../middleware/security.js';
import { getClientIP } from '../middleware/security.js';

// Get all users with filtering and pagination
export async function handleUsers(request, env, ctx) {
  const url = new URL(request.url);
  const method = request.method;
  
  if (method === 'GET') {
    // List users
    const options = {
      search: url.searchParams.get('search') || '',
      status: url.searchParams.get('status') || '',
      sort: url.searchParams.get('sort') || 'created_at',
      order: url.searchParams.get('order') || 'desc',
      page: parseInt(url.searchParams.get('page')) || 1,
      limit: Math.min(parseInt(url.searchParams.get('limit')) || 50, 100)
    };
    
    try {
      const users = await getAllUsers(env, options);
      const total = await getTotalUsers(env, options);
      
      return jsonResponse({
        success: true,
        data: users.map(formatUser),
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit)
        }
      });
    } catch (error) {
      console.error('Get users error:', error);
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }
  
  if (method === 'POST') {
    // Create new user
    try {
      const body = await request.json();
      const user = await createNewUser(env, body, request);
      
      return jsonResponse({
        success: true,
        message: 'User created successfully',
        data: user
      }, 201);
    } catch (error) {
      console.error('Create user error:', error);
      return jsonResponse({ success: false, error: error.message }, 400);
    }
  }
  
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

// Create new user
async function createNewUser(env, body, request) {
  const {
    username,
    remark = '',
    protocol = 'vless',
    expire_days = 0,
    traffic_gb = 0,
    enable = true
  } = body;
  
  // Validate username
  const sanitizedUsername = sanitizeInput(username);
  if (!validateUsername(sanitizedUsername)) {
    throw new Error('Invalid username format');
  }
  
  // Check if username exists
  const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
    .bind(sanitizedUsername).first();
  if (existing) {
    throw new Error('Username already exists');
  }
  
  // Generate UUID and token
  const uuid = generateUUID();
  const subscription_token = generateToken(16);
  
  // Calculate expiration
  const expire_at = expire_days > 0 
    ? Math.floor(Date.now() / 1000) + (expire_days * 86400)
    : 0;
  
  // Calculate traffic limit (GB to bytes)
  const traffic_limit = traffic_gb > 0 ? traffic_gb * 1073741824 : 0;
  
  // Get default settings
  const defaultDays = await getSetting(env, 'default_days') || '30';
  const defaultTraffic = await getSetting(env, 'default_traffic') || '107374182400';
  
  const finalExpireAt = expire_days > 0 ? expire_at : (parseInt(defaultDays) > 0 
    ? Math.floor(Date.now() / 1000) + (parseInt(defaultDays) * 86400) 
    : 0);
  const finalTrafficLimit = traffic_limit > 0 ? traffic_limit : parseInt(defaultTraffic);
  
  // Insert into database
  const result = await env.DB.prepare(`
    INSERT INTO users (uuid, username, remark, protocol, expire_at, traffic_limit, subscription_token, enable, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    uuid,
    sanitizedUsername,
    sanitizeInput(remark),
    sanitizeInput(protocol),
    finalExpireAt,
    finalTrafficLimit,
    subscription_token,
    enable ? 1 : 0,
    request.user?.username || 'system'
  ).run();
  
  // Log action
  const ip = getClientIP(request);
  await addLog(env, 'create_user', uuid, ip, request.headers.get('User-Agent') || '', 
    JSON.stringify({ username: sanitizedUsername, protocol }));
  
  return {
    id: result.meta.last_row_id,
    uuid,
    username: sanitizedUsername,
    remark,
    protocol,
    expire_at: finalExpireAt,
    traffic_limit: finalTrafficLimit,
    subscription_token,
    subscription_url: `${new URL(request.url).origin}/sub/${subscription_token}`,
    enable: enable ? 1 : 0
  };
}

// Get user by UUID
export async function handleUserByUUID(request, env, ctx) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const uuid = pathParts[3];
  const method = request.method;
  
  if (!validateUUID(uuid)) {
    return jsonResponse({ success: false, error: 'Invalid UUID' }, 400);
  }
  
  if (method === 'GET') {
    const user = await getUserByUUID(env, uuid);
    if (!user) {
      return jsonResponse({ success: false, error: 'User not found' }, 404);
    }
    
    return jsonResponse({
      success: true,
      data: formatUser(user)
    });
  }
  
  if (method === 'PUT') {
    try {
      const body = await request.json();
      const success = await updateUser(env, uuid, body);
      
      if (!success) {
        return jsonResponse({ success: false, error: 'Failed to update user' }, 400);
      }
      
      // Log action
      await addLog(env, 'update_user', uuid, getClientIP(request), 
        request.headers.get('User-Agent') || '', JSON.stringify(body));
      
      return jsonResponse({
        success: true,
        message: 'User updated successfully'
      });
    } catch (error) {
      console.error('Update user error:', error);
      return jsonResponse({ success: false, error: error.message }, 400);
    }
  }
  
  if (method === 'DELETE') {
    try {
      const success = await deleteUser(env, uuid);
      
      if (!success) {
        return jsonResponse({ success: false, error: 'Failed to delete user' }, 400);
      }
      
      // Log action
      await addLog(env, 'delete_user', uuid, getClientIP(request), 
        request.headers.get('User-Agent') || '');
      
      return jsonResponse({
        success: true,
        message: 'User deleted successfully'
      });
    } catch (error) {
      console.error('Delete user error:', error);
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }
  
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

// Reset user traffic
export async function handleUserReset(request, env, ctx) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const uuid = pathParts[3];
  
  if (!validateUUID(uuid)) {
    return jsonResponse({ success: false, error: 'Invalid UUID' }, 400);
  }
  
  try {
    const success = await resetUserTraffic(env, uuid);
    
    if (!success) {
      return jsonResponse({ success: false, error: 'Failed to reset traffic' }, 400);
    }
    
    await addLog(env, 'reset_traffic', uuid, getClientIP(request), 
      request.headers.get('User-Agent') || '');
    
    return jsonResponse({
      success: true,
      message: 'Traffic reset successfully'
    });
  } catch (error) {
    console.error('Reset traffic error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Update user traffic
export async function handleUserTraffic(request, env, ctx) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const uuid = pathParts[3];
  
  if (!validateUUID(uuid)) {
    return jsonResponse({ success: false, error: 'Invalid UUID' }, 400);
  }
  
  try {
    const body = await request.json();
    const { upload, download } = body;
    
    await env.DB.prepare(`
      UPDATE users SET upload = ?, download = ? WHERE uuid = ?
    `).bind(upload || 0, download || 0, uuid).run();
    
    await addLog(env, 'update_traffic', uuid, getClientIP(request), 
      request.headers.get('User-Agent') || '', JSON.stringify({ upload, download }));
    
    return jsonResponse({
      success: true,
      message: 'Traffic updated successfully'
    });
  } catch (error) {
    console.error('Update traffic error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Enable user
export async function handleUserEnable(request, env, ctx) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const uuid = pathParts[3];
  
  if (!validateUUID(uuid)) {
    return jsonResponse({ success: false, error: 'Invalid UUID' }, 400);
  }
  
  try {
    await setUserEnable(env, uuid, true);
    
    await addLog(env, 'enable_user', uuid, getClientIP(request), 
      request.headers.get('User-Agent') || '');
    
    return jsonResponse({
      success: true,
      message: 'User enabled successfully'
    });
  } catch (error) {
    console.error('Enable user error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Disable user
export async function handleUserDisable(request, env, ctx) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const uuid = pathParts[3];
  
  if (!validateUUID(uuid)) {
    return jsonResponse({ success: false, error: 'Invalid UUID' }, 400);
  }
  
  try {
    await setUserEnable(env, uuid, false);
    
    await addLog(env, 'disable_user', uuid, getClientIP(request), 
      request.headers.get('User-Agent') || '');
    
    return jsonResponse({
      success: true,
      message: 'User disabled successfully'
    });
  } catch (error) {
    console.error('Disable user error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Bulk delete users
export async function handleBulkDelete(request, env, ctx) {
  try {
    const body = await request.json();
    const { uuids } = body;
    
    if (!Array.isArray(uuids) || uuids.length === 0) {
      return jsonResponse({ success: false, error: 'No users specified' }, 400);
    }
    
    const placeholders = uuids.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      DELETE FROM users WHERE uuid IN (${placeholders})
    `).bind(...uuids).run();
    
    await addLog(env, 'bulk_delete', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Deleted ${result.meta.changes} users`);
    
    return jsonResponse({
      success: true,
      message: `${result.meta.changes} users deleted`,
      count: result.meta.changes
    });
  } catch (error) {
    console.error('Bulk delete error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Bulk renew users
export async function handleBulkRenew(request, env, ctx) {
  try {
    const body = await request.json();
    const { uuids, days } = body;
    
    if (!Array.isArray(uuids) || uuids.length === 0) {
      return jsonResponse({ success: false, error: 'No users specified' }, 400);
    }
    
    const expire_at = days === 0 ? 0 : Math.floor(Date.now() / 1000) + (days * 86400);
    const placeholders = uuids.map(() => '?').join(',');
    
    const result = await env.DB.prepare(`
      UPDATE users SET expire_at = ? WHERE uuid IN (${placeholders})
    `).bind(expire_at, ...uuids).run();
    
    await addLog(env, 'bulk_renew', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Renewed ${result.meta.changes} users for ${days} days`);
    
    return jsonResponse({
      success: true,
      message: `${result.meta.changes} users renewed`,
      count: result.meta.changes
    });
  } catch (error) {
    console.error('Bulk renew error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Bulk traffic reset
export async function handleBulkTrafficReset(request, env, ctx) {
  try {
    const body = await request.json();
    const { uuids } = body;
    
    if (!Array.isArray(uuids) || uuids.length === 0) {
      return jsonResponse({ success: false, error: 'No users specified' }, 400);
    }
    
    const placeholders = uuids.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      UPDATE users SET upload = 0, download = 0 WHERE uuid IN (${placeholders})
    `).bind(...uuids).run();
    
    await addLog(env, 'bulk_reset_traffic', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Reset traffic for ${result.meta.changes} users`);
    
    return jsonResponse({
      success: true,
      message: `Traffic reset for ${result.meta.changes} users`,
      count: result.meta.changes
    });
  } catch (error) {
    console.error('Bulk traffic reset error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Bulk enable users
export async function handleBulkEnable(request, env, ctx) {
  try {
    const body = await request.json();
    const { uuids } = body;
    
    if (!Array.isArray(uuids) || uuids.length === 0) {
      return jsonResponse({ success: false, error: 'No users specified' }, 400);
    }
    
    const placeholders = uuids.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      UPDATE users SET enable = 1 WHERE uuid IN (${placeholders})
    `).bind(...uuids).run();
    
    await addLog(env, 'bulk_enable', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Enabled ${result.meta.changes} users`);
    
    return jsonResponse({
      success: true,
      message: `${result.meta.changes} users enabled`,
      count: result.meta.changes
    });
  } catch (error) {
    console.error('Bulk enable error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Bulk disable users
export async function handleBulkDisable(request, env, ctx) {
  try {
    const body = await request.json();
    const { uuids } = body;
    
    if (!Array.isArray(uuids) || uuids.length === 0) {
      return jsonResponse({ success: false, error: 'No users specified' }, 400);
    }
    
    const placeholders = uuids.map(() => '?').join(',');
    const result = await env.DB.prepare(`
      UPDATE users SET enable = 0 WHERE uuid IN (${placeholders})
    `).bind(...uuids).run();
    
    await addLog(env, 'bulk_disable', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Disabled ${result.meta.changes} users`);
    
    return jsonResponse({
      success: true,
      message: `${result.meta.changes} users disabled`,
      count: result.meta.changes
    });
  } catch (error) {
    console.error('Bulk disable error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Helper function to format user data
function formatUser(user) {
  const now = Math.floor(Date.now() / 1000);
  
  let status = 'disabled';
  if (user.enable) {
    if (user.expire_at === 0 || user.expire_at > now) {
      status = 'active';
    } else {
      status = 'expired';
    }
  }
  
  return {
    id: user.id,
    uuid: user.uuid,
    username: user.username,
    remark: user.remark || '',
    protocol: user.protocol,
    created_at: user.created_at,
    expire_at: user.expire_at,
    expire_date: user.expire_at > 0 ? new Date(user.expire_at * 1000).toISOString() : null,
    traffic_limit: user.traffic_limit,
    upload: user.upload,
    download: user.download,
    total_usage: user.upload + user.download,
    status,
    enable: user.enable,
    subscription_token: user.subscription_token,
    notes: user.notes || ''
  };
}

// Get total users count
async function getTotalUsers(env, options) {
  let query = 'SELECT COUNT(*) as count FROM users WHERE 1=1';
  const params = [];
  
  if (options.search) {
    query += ' AND (username LIKE ? OR remark LIKE ? OR uuid LIKE ?)';
    params.push(`%${options.search}%`, `%${options.search}%`, `%${options.search}%`);
  }
  
  if (options.status) {
    if (options.status === 'active') {
      query += ' AND enable = 1 AND (expire_at = 0 OR expire_at > ?)';
      params.push(Math.floor(Date.now() / 1000));
    } else if (options.status === 'expired') {
      query += ' AND expire_at > 0 AND expire_at < ?';
      params.push(Math.floor(Date.now() / 1000));
    } else if (options.status === 'disabled') {
      query += ' AND enable = 0';
    }
  }
  
  const result = await env.DB.prepare(query).bind(...params).first();
  return result?.count || 0;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
