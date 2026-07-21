/**
 * System Routes
 */

import { getAllSettings } from '../db/init.js';

// Get system info
export async function handleSystemInfo(request, env, ctx) {
  try {
    const info = {
      platform: 'Cloudflare Workers',
      runtime: 'V8',
      worker: {
        id: env.NADERVPN?.id || 'unknown',
        name: env.NADERVPN?.name || 'NaderVPN',
       colo: request.headers.get('CF-Ray')?.split('-')[1] || 'unknown'
      },
      datetime: new Date().toISOString(),
      timezone: 'UTC',
      uptime: process.uptime ? process.uptime() : 0,
      database: await getDatabaseStats(env),
      storage: await getStorageStats(env),
      settings: await getPublicSettings(env)
    };
    
    return jsonResponse({
      success: true,
      data: info
    });
  } catch (error) {
    console.error('System info error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Get worker info
export async function handleWorkerInfo(request, env, ctx) {
  try {
    const info = {
      version: '1.0.0',
      build: new Date().toISOString(),
      deployment: {
        id: env.NADERVPN?.id || 'local',
        date: new Date().toISOString()
      },
      limits: {
        cpuTime: '10ms per request',
        memory: '128MB',
        requestSize: '100MB',
        responseSize: '100MB'
      },
      features: {
        d1: true,
        kv: true,
        Workers Sites: true,
        DurableObjects: false,
        Queues: false
      },
      headers: {
        cfRay: request.headers.get('CF-Ray') || '',
        cfConnectingIP: request.headers.get('CF-Connecting-IP') || '',
        cfCountry: request.headers.get('CF-IPCountry') || '',
        cfCity: request.headers.get('CF-City') || '',
        cfRegion: request.headers.get('CF-Region') || '',
        cfRegionCode: request.headers.get('CF-Region-Code') || '',
        cfLatitude: request.headers.get('CF-IPLatitude') || '',
        cfLongitude: request.headers.get('CF-IPLongitude') || ''
      }
    };
    
    return jsonResponse({
      success: true,
      data: info
    });
  } catch (error) {
    console.error('Worker info error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

async function getDatabaseStats(env) {
  try {
    // Get table counts
    const users = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
    const nodes = await env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first();
    const logs = await env.DB.prepare('SELECT COUNT(*) as count FROM logs').first();
    const settings = await env.DB.prepare('SELECT COUNT(*) as count FROM settings').first();
    
    return {
      type: 'D1 SQLite',
      tables: {
        users: users?.count || 0,
        nodes: nodes?.count || 0,
        logs: logs?.count || 0,
        settings: settings?.count || 0
      },
      status: 'connected'
    };
  } catch (error) {
    return {
      type: 'D1 SQLite',
      status: 'error',
      error: error.message
    };
  }
}

async function getStorageStats(env) {
  try {
    const list = await env.KV.list({ limit: 1000 });
    
    const stats = {
      type: 'KV',
      keys: list.keys?.length || 0,
      status: 'connected'
    };
    
    // Count by prefix
    const prefixes = ['session:', 'backup:', 'cache:', 'stats:'];
    for (const prefix of prefixes) {
      const filtered = list.keys?.filter(k => k.name.startsWith(prefix)) || [];
      stats[prefix.replace(':', '')] = filtered.length;
    }
    
    return stats;
  } catch (error) {
    return {
      type: 'KV',
      status: 'error',
      error: error.message
    };
  }
}

async function getPublicSettings(env) {
  const settings = await getAllSettings(env);
  
  return {
    app_name: settings.app_name || 'NaderVPN',
    language: settings.language || 'fa',
    theme: settings.theme || 'dark',
    maintenance_mode: settings.maintenance_mode === 'true'
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
