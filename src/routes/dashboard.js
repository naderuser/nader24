/**
 * Dashboard Routes
 */

import { getStats, getLogs, getAllNodes } from '../db/init.js';

export async function handleDashboardStats(request, env, ctx) {
  try {
    const stats = await getStats(env);
    const nodes = await getAllNodes(env);
    const recentLogs = await getLogs(env, { limit: 10 });
    
    // Calculate additional stats
    const now = Math.floor(Date.now() / 1000);
    const activeUsers = stats.activeUsers;
    const totalBandwidth = stats.totalBandwidth;
    
    // Get traffic chart data (last 7 days)
    const trafficChart = await getTrafficChart(env);
    
    // Get user growth data
    const userGrowth = await getUserGrowth(env);
    
    // Calculate online users (simplified - based on recent activity)
    const onlineUsers = await calculateOnlineUsers(env);
    
    return jsonResponse({
      success: true,
      data: {
        totalUsers: stats.totalUsers,
        activeUsers: activeUsers,
        expiredUsers: stats.expiredUsers,
        onlineUsers: onlineUsers,
        totalBandwidth: totalBandwidth,
        bandwidthRemaining: await calculateRemainingBandwidth(env),
        nodes: {
          total: nodes.length,
          enabled: nodes.filter(n => n.enable).length,
          disabled: nodes.filter(n => !n.enable).length
        },
        latestUsers: stats.latestUsers.map(u => ({
          uuid: u.uuid,
          username: u.username,
          remark: u.remark,
          created_at: u.created_at,
          status: getUserStatus(u)
        })),
        recentLogs: recentLogs.map(log => ({
          action: log.action,
          target: log.target,
          ip: log.ip,
          created_at: log.created_at
        })),
        trafficChart,
        userGrowth,
        systemInfo: await getSystemInfo(env)
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

export async function handleDashboardCharts(request, env, ctx) {
  try {
    const days = parseInt(new URL(request.url).searchParams.get('days')) || 7;
    
    const trafficChart = await getTrafficChart(env, days);
    const userGrowth = await getUserGrowth(env, days);
    
    return jsonResponse({
      success: true,
      data: {
        trafficChart,
        userGrowth
      }
    });
  } catch (error) {
    console.error('Dashboard charts error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

async function getTrafficChart(env, days = 7) {
  // Get logs for traffic estimation
  const logs = await env.DB.prepare(`
    SELECT * FROM logs 
    WHERE action LIKE '%traffic%' AND created_at > ?
    ORDER BY created_at ASC
  `).bind(Math.floor(Date.now() / 1000) - (days * 86400)).all();
  
  // Generate chart data for each day
  const chartData = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayStart = Math.floor(date.setHours(0, 0, 0, 0) / 1000);
    const dayEnd = Math.floor(date.setHours(23, 59, 59, 999) / 1000);
    
    // Calculate traffic for this day
    const dayLogs = logs.results.filter(log => 
      log.created_at >= dayStart && log.created_at <= dayEnd
    );
    
    const upload = dayLogs.reduce((sum, log) => {
      const details = parseLogDetails(log.details);
      return sum + (details.upload || 0);
    }, 0);
    
    const download = dayLogs.reduce((sum, log) => {
      const details = parseLogDetails(log.details);
      return sum + (details.download || 0);
    }, 0);
    
    chartData.push({
      date: new Date(dayStart * 1000).toISOString().split('T')[0],
      upload: upload,
      download: download,
      total: upload + download
    });
  }
  
  return chartData;
}

async function getUserGrowth(env, days = 7) {
  const growthData = [];
  const now = new Date();
  
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const dayEnd = Math.floor(date.setHours(23, 59, 59, 999) / 1000);
    
    // Count users created up to this day
    const result = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM users WHERE created_at <= ?
    `).bind(dayEnd).first();
    
    growthData.push({
      date: new Date(dayEnd * 1000).toISOString().split('T')[0],
      total: result?.count || 0,
      new: i === 0 ? await getNewUsersToday(env) : 0
    });
  }
  
  return growthData;
}

async function getNewUsersToday(env) {
  const todayStart = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM users WHERE created_at >= ?
  `).bind(todayStart).first();
  return result?.count || 0;
}

async function calculateOnlineUsers(env) {
  // Simple estimation based on recent activity (last 15 minutes)
  const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - 900;
  
  const result = await env.DB.prepare(`
    SELECT COUNT(*) as count FROM logs 
    WHERE action = 'login' AND created_at >= ?
  `).bind(fifteenMinutesAgo).first();
  
  return result?.count || 0;
}

async function calculateRemainingBandwidth(env) {
  const result = await env.DB.prepare(`
    SELECT 
      SUM(traffic_limit) as total_limit,
      SUM(upload + download) as used
    FROM users
  `).first();
  
  const totalLimit = result?.total_limit || 0;
  const used = result?.used || 0;
  
  return Math.max(0, totalLimit - used);
}

async function getSystemInfo(env) {
  // Get system stats from KV cache
  try {
    const cached = await env.KV.get('system_stats', 'json');
    if (cached && cached.expires > Date.now()) {
      return cached.data;
    }
  } catch (e) {}
  
  // Calculate fresh stats
  const totalUsers = await env.DB.prepare('SELECT COUNT(*) as count FROM users').first();
  const totalNodes = await env.DB.prepare('SELECT COUNT(*) as count FROM nodes').first();
  
  const stats = {
    users: totalUsers?.count || 0,
    nodes: totalNodes?.count || 0,
    kvUsage: await getKVUsage(env)
  };
  
  // Cache for 5 minutes
  await env.KV.put('system_stats', JSON.stringify({
    data: stats,
    expires: Date.now() + 300000
  }), { expirationTtl: 300 });
  
  return stats;
}

async function getKVUsage(env) {
  try {
    // List all keys to estimate usage
    const listed = await env.KV.list({ limit: 1000 });
    return {
      keys: listed.keys?.length || 0,
      truncated: listed.truncated || false
    };
  } catch (e) {
    return { keys: 0, truncated: false };
  }
}

function getUserStatus(user) {
  const now = Math.floor(Date.now() / 1000);
  
  if (!user.enable) return 'disabled';
  if (user.expire_at > 0 && user.expire_at < now) return 'expired';
  return 'active';
}

function parseLogDetails(details) {
  try {
    return JSON.parse(details) || {};
  } catch (e) {
    return {};
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
