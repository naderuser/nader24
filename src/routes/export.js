/**
 * Export Routes
 */

import { getAllUsers, addLog } from '../db/init.js';
import { getClientIP } from '../middleware/security.js';

// Export CSV
export async function handleExportCSV(request, env, ctx) {
  try {
    const users = await getAllUsers(env);
    
    const headers = [
      'UUID', 'Username', 'Remark', 'Protocol', 'Created At', 
      'Expire At', 'Traffic Limit (GB)', 'Upload (GB)', 'Download (GB)',
      'Status', 'Enable', 'Subscription Token', 'Notes'
    ];
    
    const rows = [headers.join(',')];
    
    for (const user of users) {
      const row = [
        user.uuid,
        escapeCSV(user.username),
        escapeCSV(user.remark || ''),
        user.protocol,
        new Date(user.created_at * 1000).toISOString(),
        user.expire_at > 0 ? new Date(user.expire_at * 1000).toISOString() : 'Never',
        (user.traffic_limit / 1073741824).toFixed(2),
        (user.upload / 1073741824).toFixed(2),
        (user.download / 1073741824).toFixed(2),
        user.status,
        user.enable ? 'Yes' : 'No',
        user.subscription_token,
        escapeCSV(user.notes || '')
      ];
      rows.push(row.join(','));
    }
    
    const csv = rows.join('\n');
    const timestamp = new Date().toISOString().split('T')[0];
    
    await addLog(env, 'export_csv', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Exported ${users.length} users to CSV`);
    
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="users-${timestamp}.csv"`
      }
    });
  } catch (error) {
    console.error('Export CSV error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Export JSON
export async function handleExportJSON(request, env, ctx) {
  try {
    const url = new URL(request.url);
    const includeDetails = url.searchParams.get('details') !== 'false';
    
    const users = await getAllUsers(env);
    
    const exportData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      total_users: users.length,
      users: users.map(user => ({
        uuid: user.uuid,
        username: user.username,
        remark: user.remark,
        protocol: user.protocol,
        created_at: user.created_at,
        expire_at: user.expire_at,
        traffic_limit: user.traffic_limit,
        upload: user.upload,
        download: user.download,
        status: user.status,
        enable: user.enable === 1,
        subscription_token: user.subscription_token,
        notes: user.notes
      }))
    };
    
    const timestamp = new Date().toISOString().split('T')[0];
    
    await addLog(env, 'export_json', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Exported ${users.length} users to JSON`);
    
    return new Response(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="users-${timestamp}.json"`
      }
    });
  } catch (error) {
    console.error('Export JSON error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
