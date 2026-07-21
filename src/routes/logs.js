/**
 * Logs Routes
 */

import { getLogs, addLog } from '../db/init.js';

// Get logs
export async function handleLogs(request, env, ctx) {
  const url = new URL(request.url);
  
  const options = {
    action: url.searchParams.get('action') || '',
    limit: Math.min(parseInt(url.searchParams.get('limit')) || 100, 500),
    page: parseInt(url.searchParams.get('page')) || 1
  };
  
  try {
    const logs = await getLogs(env, options);
    const total = await getTotalLogs(env, options.action);
    
    return jsonResponse({
      success: true,
      data: logs.map(formatLog),
      pagination: {
        page: options.page,
        limit: options.limit,
        total,
        pages: Math.ceil(total / options.limit)
      }
    });
  } catch (error) {
    console.error('Get logs error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

async function getTotalLogs(env, action = '') {
  let query = 'SELECT COUNT(*) as count FROM logs';
  const params = [];
  
  if (action) {
    query += ' WHERE action = ?';
    params.push(action);
  }
  
  const result = await env.DB.prepare(query).bind(...params).first();
  return result?.count || 0;
}

function formatLog(log) {
  return {
    id: log.id,
    action: log.action,
    target: log.target || '',
    ip: log.ip || '',
    user_agent: log.user_agent || '',
    details: log.details || '',
    created_at: log.created_at,
    created_date: new Date(log.created_at * 1000).toISOString()
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
