/**
 * NaderVPN - Cloudflare Workers VPN Management Panel
 * Main Entry Point
 */

import { router } from './router.js';
import { withAuth } from './middleware/auth.js';
import { securityHeaders, cors, rateLimiter } from './middleware/security.js';
import { initDatabase } from './db/init.js';

// Environment Configuration
const CONFIG = {
  ADMIN_USERNAME: 'admin',
  ADMIN_PASSWORD_HASH: '', // Will be generated on first run
  JWT_SECRET: '',
  CSRF_SECRET: '',
  SESSION_DURATION: 86400, // 24 hours
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: 900, // 15 minutes
  FREE_PLAN_LIMITS: {
    maxD1Rows: 10000,
    maxKVKeys: 1000,
    cpuTime: 10, // ms
  }
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS Preflight
    if (method === 'OPTIONS') {
      return cors(request);
    }

    // Security Headers for all responses
    const securityResponse = securityHeaders(request);
    if (securityResponse) return securityResponse;

    // Initialize database on first request
    await initDatabase(env);

    // Rate limiting
    const rateLimitResult = await rateLimiter(request, env);
    if (rateLimitResult) return rateLimitResult;

    try {
      // Route matching
      let handler;

      // Public routes (no auth required)
      const publicRoutes = [
        { pattern: /^\/sub\/([^/]+)\/?$/, handler: handleSubscription, method: 'GET' },
        { pattern: /^\/api\/docs\/?$/, handler: handleAPIDocs, method: 'GET' },
        { pattern: /^\/login\/?$/, handler: handleLoginPage, method: 'GET' },
      ];

      // Admin routes (auth required)
      const adminRoutes = [
        // Dashboard
        { pattern: /^\/api\/dashboard\/stats\/?$/, handler: handleDashboardStats, method: 'GET' },
        { pattern: /^\/api\/dashboard\/charts\/?$/, handler: handleDashboardCharts, method: 'GET' },
        
        // Users CRUD
        { pattern: /^\/api\/users\/?$/, handler: handleUsers, methods: ['GET', 'POST'] },
        { pattern: /^\/api\/users\/bulk\/delete\/?$/, handler: handleBulkDelete, method: 'POST' },
        { pattern: /^\/api\/users\/bulk\/renew\/?$/, handler: handleBulkRenew, method: 'POST' },
        { pattern: /^\/api\/users\/bulk\/traffic\/?$/, handler: handleBulkTrafficReset, method: 'POST' },
        { pattern: /^\/api\/users\/bulk\/enable\/?$/, handler: handleBulkEnable, method: 'POST' },
        { pattern: /^\/api\/users\/bulk\/disable\/?$/, handler: handleBulkDisable, method: 'POST' },
        { pattern: /^\/api\/users\/([^\/]+)\/?$/, handler: handleUserByUUID, methods: ['GET', 'PUT', 'DELETE'] },
        { pattern: /^\/api\/users\/([^\/]+)\/reset\/?$/, handler: handleUserReset, method: 'POST' },
        { pattern: /^\/api\/users\/([^\/]+)\/traffic\/?$/, handler: handleUserTraffic, method: 'PUT' },
        { pattern: /^\/api\/users\/([^\/]+)\/enable\/?$/, handler: handleUserEnable, method: 'POST' },
        { pattern: /^\/api\/users\/([^\/]+)\/disable\/?$/, handler: handleUserDisable, method: 'POST' },
        
        // Nodes CRUD
        { pattern: /^\/api\/nodes\/?$/, handler: handleNodes, methods: ['GET', 'POST'] },
        { pattern: /^\/api\/nodes\/import\/?$/, handler: handleNodesImport, method: 'POST' },
        { pattern: /^\/api\/nodes\/export\/?$/, handler: handleNodesExport, method: 'GET' },
        { pattern: /^\/api\/nodes\/([^\/]+)\/?$/, handler: handleNodeById, methods: ['GET', 'PUT', 'DELETE'] },
        
        // Settings
        { pattern: /^\/api\/settings\/?$/, handler: handleSettings, method: 'GET' },
        { pattern: /^\/api\/settings\/update\/?$/, handler: handleSettingsUpdate, method: 'PUT' },
        { pattern: /^\/api\/settings\/password\/?$/, handler: handlePasswordChange, method: 'POST' },
        
        // Logs
        { pattern: /^\/api\/logs\/?$/, handler: handleLogs, method: 'GET' },
        
        // Backup
        { pattern: /^\/api\/backup\/create\/?$/, handler: handleBackupCreate, method: 'POST' },
        { pattern: /^\/api\/backup\/restore\/?$/, handler: handleBackupRestore, method: 'POST' },
        { pattern: /^\/api\/backup\/list\/?$/, handler: handleBackupList, method: 'GET' },
        { pattern: /^\/api\/backup\/download\/?$/, handler: handleBackupDownload, method: 'GET' },
        
        // Export
        { pattern: /^\/api\/export\/csv\/?$/, handler: handleExportCSV, method: 'GET' },
        { pattern: /^\/api\/export\/json\/?$/, handler: handleExportJSON, method: 'GET' },
        
        // Import
        { pattern: /^\/api\/import\/csv\/?$/, handler: handleImportCSV, method: 'POST' },
        { pattern: /^\/api\/import\/json\/?$/, handler: handleImportJSON, method: 'POST' },
        
        // QR Code
        { pattern: /^\/api\/qr\/([^\/]+)\/?$/, handler: handleQRCode, method: 'GET' },
        
        // System
        { pattern: /^\/api\/system\/info\/?$/, handler: handleSystemInfo, method: 'GET' },
        { pattern: /^\/api\/system\/worker\/?$/, handler: handleWorkerInfo, method: 'GET' },
        
        // API Key
        { pattern: /^\/api\/key\/?$/, handler: handleAPIKey, methods: ['GET', 'POST'] },
      ];

      // Check public routes first
      for (const route of publicRoutes) {
        if (route.pattern.test(path)) {
          if (route.method && route.method !== method) continue;
          return await route.handler(request, env, ctx);
        }
      }

      // Check admin routes
      const authHandler = withAuth(async (request, env, ctx) => {
        for (const route of adminRoutes) {
          if (route.pattern.test(path)) {
            if (route.methods && !route.methods.includes(method)) continue;
            if (route.method && route.method !== method) continue;
            return await route.handler(request, env, ctx);
          }
        }
        return jsonResponse({ error: 'Not Found' }, 404);
      });

      return await authHandler(request, env, ctx);

    } catch (error) {
      console.error('Worker Error:', error);
      return jsonResponse({ 
        error: 'Internal Server Error',
        message: error.message 
      }, 500);
    }
  }
};

// Helper functions
function jsonResponse(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Content-Type-Options': 'nosniff',
      ...headers
    }
  });
}

function htmlResponse(html, status = 200) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}

// Route handlers - Import from separate files
import { handleSubscription } from './routes/subscription.js';
import { handleLoginPage, handleLogin } from './routes/auth.js';
import { handleDashboardStats, handleDashboardCharts } from './routes/dashboard.js';
import { 
  handleUsers, 
  handleUserByUUID, 
  handleUserReset, 
  handleUserTraffic,
  handleUserEnable,
  handleUserDisable,
  handleBulkDelete,
  handleBulkRenew,
  handleBulkTrafficReset,
  handleBulkEnable,
  handleBulkDisable
} from './routes/users.js';
import { 
  handleNodes, 
  handleNodeById, 
  handleNodesImport, 
  handleNodesExport 
} from './routes/nodes.js';
import { handleSettings, handleSettingsUpdate, handlePasswordChange } from './routes/settings.js';
import { handleLogs } from './routes/logs.js';
import { 
  handleBackupCreate, 
  handleBackupRestore, 
  handleBackupList, 
  handleBackupDownload 
} from './routes/backup.js';
import { handleExportCSV, handleExportJSON } from './routes/export.js';
import { handleImportCSV, handleImportJSON } from './routes/import.js';
import { handleQRCode } from './routes/qr.js';
import { handleSystemInfo, handleWorkerInfo } from './routes/system.js';
import { handleAPIKey, handleAPIDocs } from './routes/api.js';
import { router } from './router.js';
