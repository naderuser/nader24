/**
 * Backup Routes
 */

import { getAllSettings, addLog } from '../db/init.js';
import { getClientIP } from '../middleware/security.js';

// Create backup
export async function handleBackupCreate(request, env, ctx) {
  try {
    // Export all data to JSON
    const backup = await createBackup(env);
    
    // Store backup in KV
    const timestamp = Date.now();
    const filename = `backup-${timestamp}.json`;
    
    await env.KV.put(`backup:${filename}`, JSON.stringify(backup), {
      expirationTtl: 7 * 86400 // 7 days
    });
    
    // Log the backup
    await addLog(env, 'create_backup', filename, getClientIP(request), 
      request.headers.get('User-Agent') || '', `Backup created: ${JSON.stringify(backup.stats)}`);
    
    return jsonResponse({
      success: true,
      message: 'Backup created successfully',
      data: {
        filename,
        created_at: new Date(timestamp).toISOString(),
        stats: backup.stats
      }
    }, 201);
  } catch (error) {
    console.error('Create backup error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

async function createBackup(env) {
  // Get all tables data
  const users = await env.DB.prepare('SELECT * FROM users').all();
  const nodes = await env.DB.prepare('SELECT * FROM nodes').all();
  const settings = await env.DB.prepare('SELECT * FROM settings').all();
  const logs = await env.DB.prepare('SELECT * FROM logs').all();
  
  return {
    version: '1.0',
    created_at: new Date().toISOString(),
    users: users.results,
    nodes: nodes.results,
    settings: settings.results,
    logs: logs.results,
    stats: {
      users: users.results.length,
      nodes: nodes.results.length,
      settings: settings.results.length,
      logs: logs.results.length
    }
  };
}

// Restore from backup
export async function handleBackupRestore(request, env, ctx) {
  try {
    const body = await request.json();
    const { backup } = body;
    
    if (!backup) {
      return jsonResponse({ success: false, error: 'No backup data provided' }, 400);
    }
    
    // Validate backup structure
    if (!backup.version || !backup.users) {
      return jsonResponse({ success: false, error: 'Invalid backup format' }, 400);
    }
    
    // Start transaction by restoring data
    let restored = { users: 0, nodes: 0, settings: 0 };
    
    // Restore users
    if (Array.isArray(backup.users)) {
      for (const user of backup.users) {
        try {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO users 
            (id, uuid, username, remark, protocol, created_at, expire_at, traffic_limit, 
             upload, download, status, subscription_token, enable, flow, network, security,
             transport, sni, host, alpn, allowinsecure, fingerprint, header_type,
             seeding, peer, mtu, reserved, protocol_param, stream_param, created_by, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            user.id, user.uuid, user.username, user.remark || '', user.protocol,
            user.created_at, user.expire_at, user.traffic_limit,
            user.upload, user.download, user.status, user.subscription_token,
            user.enable, user.flow || '', user.network || 'tcp', user.security || 'tls',
            user.transport || 'none', user.sni || '', user.host || '',
            user.alpn || '', user.allowinsecure || 0, user.fingerprint || '',
            user.header_type || 'none', user.seeding || 0, user.peer || '',
            user.mtu || 1280, user.reserved || '', user.protocol_param || '',
            user.stream_param || '', user.created_by || 'backup', user.notes || ''
          ).run();
          restored.users++;
        } catch (e) {
          console.error('Restore user error:', e);
        }
      }
    }
    
    // Restore nodes
    if (Array.isArray(backup.nodes)) {
      for (const node of backup.nodes) {
        try {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO nodes 
            (id, name, address, port, tls, type, enable, sort, parent_id, remark, 
             cpu, memory, disk, upload_speed, download_speed, online_user, last_check, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            node.id, node.name, node.address, node.port, node.tls, node.type,
            node.enable, node.sort || 0, node.parent_id, node.remark || '',
            node.cpu || 0, node.memory || 0, node.disk || 0,
            node.upload_speed || 0, node.download_speed || 0, node.online_user || 0,
            node.last_check, node.created_at
          ).run();
          restored.nodes++;
        } catch (e) {
          console.error('Restore node error:', e);
        }
      }
    }
    
    // Restore settings
    if (Array.isArray(backup.settings)) {
      for (const setting of backup.settings) {
        try {
          await env.DB.prepare(`
            INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)
          `).bind(setting.key, setting.value).run();
          restored.settings++;
        } catch (e) {
          console.error('Restore setting error:', e);
        }
      }
    }
    
    await addLog(env, 'restore_backup', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Restored: ${JSON.stringify(restored)}`);
    
    return jsonResponse({
      success: true,
      message: 'Backup restored successfully',
      data: restored
    });
  } catch (error) {
    console.error('Restore backup error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// List backups
export async function handleBackupList(request, env, ctx) {
  try {
    const list = await env.KV.list({ prefix: 'backup:' });
    const backups = [];
    
    for (const key of list.keys) {
      const data = await env.KV.get(key.name, 'json');
      if (data && key.name.startsWith('backup:')) {
        backups.push({
          filename: key.name.replace('backup:', ''),
          size: key.metadata?.size || 0,
          created_at: key.expiration ? new Date(key.expiration * 1000).toISOString() : null
        });
      }
    }
    
    return jsonResponse({
      success: true,
      data: backups
    });
  } catch (error) {
    console.error('List backups error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Download backup
export async function handleBackupDownload(request, env, ctx) {
  const url = new URL(request.url);
  const filename = url.searchParams.get('file');
  
  if (!filename) {
    return jsonResponse({ success: false, error: 'No filename specified' }, 400);
  }
  
  try {
    const backup = await env.KV.get(`backup:${filename}`, 'json');
    
    if (!backup) {
      return jsonResponse({ success: false, error: 'Backup not found' }, 404);
    }
    
    return new Response(JSON.stringify(backup, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    console.error('Download backup error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
