/**
 * API Routes
 */

import { setSetting, getSetting, addLog } from '../db/init.js';
import { getClientIP } from '../middleware/security.js';
import { generateRandomString } from '../utils/crypto.js';

// API Documentation
export async function handleAPIDocs(request, env, ctx) {
  const docs = {
    title: 'NaderVPN API Documentation',
    version: '1.0.0',
    baseUrl: new URL(request.url).origin,
    authentication: {
      type: 'API Key',
      header: 'Authorization',
      format: 'Bearer <api_key>'
    },
    endpoints: [
      {
        group: 'Authentication',
        methods: [
          {
            method: 'POST',
            path: '/api/auth/login',
            description: 'Login to the admin panel',
            body: {
              username: 'string (required)',
              password: 'string (required)',
              csrf_token: 'string (required)'
            }
          },
          {
            method: 'POST',
            path: '/api/auth/logout',
            description: 'Logout from the admin panel'
          }
        ]
      },
      {
        group: 'Users',
        methods: [
          {
            method: 'GET',
            path: '/api/users',
            description: 'Get all users with pagination',
            query: {
              search: 'string (optional)',
              status: 'active|expired|disabled (optional)',
              sort: 'string (optional)',
              order: 'asc|desc (optional)',
              page: 'number (optional)',
              limit: 'number (optional)'
            }
          },
          {
            method: 'POST',
            path: '/api/users',
            description: 'Create a new user',
            body: {
              username: 'string (required)',
              remark: 'string (optional)',
              protocol: 'string (optional)',
              expire_days: 'number (optional)',
              traffic_gb: 'number (optional)',
              enable: 'boolean (optional)'
            }
          },
          {
            method: 'GET',
            path: '/api/users/:uuid',
            description: 'Get user by UUID'
          },
          {
            method: 'PUT',
            path: '/api/users/:uuid',
            description: 'Update user',
            body: {
              remark: 'string (optional)',
              protocol: 'string (optional)',
              expire_at: 'number (optional)',
              traffic_limit: 'number (optional)'
            }
          },
          {
            method: 'DELETE',
            path: '/api/users/:uuid',
            description: 'Delete user'
          },
          {
            method: 'POST',
            path: '/api/users/:uuid/reset',
            description: 'Reset user traffic'
          },
          {
            method: 'POST',
            path: '/api/users/:uuid/enable',
            description: 'Enable user'
          },
          {
            method: 'POST',
            path: '/api/users/:uuid/disable',
            description: 'Disable user'
          }
        ]
      },
      {
        group: 'Nodes',
        methods: [
          {
            method: 'GET',
            path: '/api/nodes',
            description: 'Get all nodes'
          },
          {
            method: 'POST',
            path: '/api/nodes',
            description: 'Create a new node',
            body: {
              name: 'string (required)',
              address: 'string (required)',
              port: 'number (required)',
              tls: 'boolean (optional)',
              type: 'string (optional)',
              enable: 'boolean (optional)'
            }
          },
          {
            method: 'PUT',
            path: '/api/nodes/:id',
            description: 'Update node'
          },
          {
            method: 'DELETE',
            path: '/api/nodes/:id',
            description: 'Delete node'
          }
        ]
      },
      {
        group: 'Dashboard',
        methods: [
          {
            method: 'GET',
            path: '/api/dashboard/stats',
            description: 'Get dashboard statistics'
          },
          {
            method: 'GET',
            path: '/api/dashboard/charts',
            description: 'Get chart data',
            query: {
              days: 'number (optional, default 7)'
            }
          }
        ]
      },
      {
        group: 'Settings',
        methods: [
          {
            method: 'GET',
            path: '/api/settings',
            description: 'Get all settings'
          },
          {
            method: 'PUT',
            path: '/api/settings/update',
            description: 'Update settings'
          },
          {
            method: 'POST',
            path: '/api/settings/password',
            description: 'Change admin password'
          }
        ]
      },
      {
        group: 'Subscription',
        methods: [
          {
            method: 'GET',
            path: '/sub/:token',
            description: 'Get user subscription (public)',
            query: {
              format: 'clash-meta|clash|singbox|json (optional)'
            }
          }
        ]
      },
      {
        group: 'Export/Import',
        methods: [
          {
            method: 'GET',
            path: '/api/export/csv',
            description: 'Export users to CSV'
          },
          {
            method: 'GET',
            path: '/api/export/json',
            description: 'Export users to JSON'
          },
          {
            method: 'POST',
            path: '/api/import/csv',
            description: 'Import users from CSV',
            body: 'CSV file content'
          },
          {
            method: 'POST',
            path: '/api/import/json',
            description: 'Import users from JSON',
            body: {
              users: 'array of user objects',
              mode: 'create|update|upsert'
            }
          }
        ]
      },
      {
        group: 'Backup',
        methods: [
          {
            method: 'POST',
            path: '/api/backup/create',
            description: 'Create database backup'
          },
          {
            method: 'GET',
            path: '/api/backup/list',
            description: 'List all backups'
          },
          {
            method: 'GET',
            path: '/api/backup/download',
            description: 'Download backup file',
            query: {
              file: 'string (required)'
            }
          },
          {
            method: 'POST',
            path: '/api/backup/restore',
            description: 'Restore from backup',
            body: {
              backup: 'backup object'
            }
          }
        ]
      },
      {
        group: 'System',
        methods: [
          {
            method: 'GET',
            path: '/api/system/info',
            description: 'Get system information'
          },
          {
            method: 'GET',
            path: '/api/system/worker',
            description: 'Get worker information'
          }
        ]
      }
    ],
    responseFormats: {
      success: {
        success: true,
        data: {},
        message: 'string (optional)'
      },
      error: {
        success: false,
        error: 'string',
        message: 'string (optional)'
      },
      paginated: {
        success: true,
        data: [],
        pagination: {
          page: 'number',
          limit: 'number',
          total: 'number',
          pages: 'number'
        }
      }
    }
  };
  
  return jsonResponse(docs);
}

// API Key Management
export async function handleAPIKey(request, env, ctx) {
  const method = request.method;
  
  if (method === 'GET') {
    // Get current API key status
    const apiKey = await getSetting(env, 'api_key');
    const apiKeyEnabled = await getSetting(env, 'api_key_enabled');
    
    return jsonResponse({
      success: true,
      data: {
        enabled: apiKeyEnabled === 'true',
        hasKey: !!apiKey
      }
    });
  }
  
  if (method === 'POST') {
    try {
      const body = await request.json();
      const { action } = body;
      
      if (action === 'generate') {
        // Generate new API key
        const newKey = `nvpn_${generateRandomString(32)}`;
        await setSetting(env, 'api_key', newKey);
        await setSetting(env, 'api_key_enabled', 'true');
        
        await addLog(env, 'generate_api_key', '', getClientIP(request), 
          request.headers.get('User-Agent') || '', 'New API key generated');
        
        return jsonResponse({
          success: true,
          message: 'API key generated successfully',
          data: {
            api_key: newKey
          }
        });
      }
      
      if (action === 'disable') {
        await setSetting(env, 'api_key_enabled', 'false');
        
        await addLog(env, 'disable_api_key', '', getClientIP(request), 
          request.headers.get('User-Agent') || '');
        
        return jsonResponse({
          success: true,
          message: 'API key disabled'
        });
      }
      
      if (action === 'enable') {
        const hasKey = await getSetting(env, 'api_key');
        if (!hasKey) {
          return jsonResponse({
            success: false,
            error: 'No API key found. Generate one first.'
          }, 400);
        }
        
        await setSetting(env, 'api_key_enabled', 'true');
        
        await addLog(env, 'enable_api_key', '', getClientIP(request), 
          request.headers.get('User-Agent') || '');
        
        return jsonResponse({
          success: true,
          message: 'API key enabled'
        });
      }
      
      return jsonResponse({
        success: false,
        error: 'Invalid action. Use: generate, enable, or disable'
      }, 400);
      
    } catch (error) {
      console.error('API key error:', error);
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }
  
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
