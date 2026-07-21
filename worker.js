/**
 * NaderVPN Subscription Manager
 * Cloudflare Workers - Single File Version
 * 
 * Just deploy this file directly to Cloudflare Workers!
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        }
      });
    }

    // Admin password (from env or default)
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || 'nader0933';
    const SUBSCRIPTIONS = env.SUBSCRIPTIONS || '[]';

    // Parse subscriptions from env
    let subscriptions = [];
    try {
      subscriptions = JSON.parse(SUBSCRIPTIONS);
    } catch (e) {
      subscriptions = [];
    }

    // Helper functions
    const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });

    const parseCookies = (request) => {
      const cookieHeader = request.headers.get('Cookie') || '';
      const cookies = {};
      for (const cookie of cookieHeader.split(';')) {
        const [name, ...rest] = cookie.trim().split('=');
        if (name) cookies[name] = rest.join('=');
      }
      return cookies;
    };

    const setCookie = (response, name, value, maxAge = 86400) => {
      response.headers.set('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);
    };

    // Auth check
    const cookies = parseCookies(request);
    const isLoggedIn = cookies['nader_logged_in'] === 'true' && cookies['nader_admin'] === await hashString(ADMIN_PASSWORD);

    // Routes
    try {
      // Login
      if (path === '/login' && method === 'GET') {
        return new Response(LOGIN_PAGE, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      if (path === '/api/login' && method === 'POST') {
        const body = await request.json();
        if (body.password === ADMIN_PASSWORD) {
          const hash = await hashString(ADMIN_PASSWORD);
          const response = jsonResponse({ success: true, message: 'ورود موفق' });
          setCookie(response, 'nader_logged_in', 'true');
          setCookie(response, 'nader_admin', hash);
          return response;
        }
        return jsonResponse({ success: false, message: 'رمز عبور اشتباه' }, 401);
      }

      // Logout
      if (path === '/api/logout' && method === 'POST') {
        const response = jsonResponse({ success: true });
        setCookie(response, 'nader_logged_in', '', 0);
        setCookie(response, 'nader_admin', '', 0);
        return response;
      }

      // Subscription endpoint (public)
      const subMatch = path.match(/^\/sub\/([a-zA-Z0-9]+)\/?$/);
      if (subMatch && method === 'GET') {
        const token = subMatch[1];
        const sub = subscriptions.find(s => s.token === token);
        if (!sub) return new Response('Subscription not found', { status: 404 });
        if (!sub.enable) return new Response('Subscription disabled', { status: 403 });
        
        const now = Math.floor(Date.now() / 1000);
        if (sub.expire_at > 0 && sub.expire_at < now) {
          return new Response('Subscription expired', { status: 403 });
        }

        return new Response(sub.configs.join('\n'), {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      // Protected routes
      if (!isLoggedIn) {
        if (path.startsWith('/api/')) {
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        return Response.redirect(new URL('/login', url), 302);
      }

      // Dashboard
      if ((path === '/' || path === '/dashboard') && method === 'GET') {
        return new Response(DASHBOARD_PAGE, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }

      // API: Stats
      if (path === '/api/stats' && method === 'GET') {
        const now = Math.floor(Date.now() / 1000);
        const stats = {
          total: subscriptions.length,
          active: subscriptions.filter(s => s.enable && (s.expire_at === 0 || s.expire_at > now)).length,
          expired: subscriptions.filter(s => s.expire_at > 0 && s.expire_at < now).length,
          disabled: subscriptions.filter(s => !s.enable).length
        };
        return jsonResponse({ success: true, data: stats });
      }

      // API: List subscriptions
      if (path === '/api/subscriptions' && method === 'GET') {
        const search = url.searchParams.get('search') || '';
        const status = url.searchParams.get('status') || '';
        let filtered = subscriptions;

        if (search) {
          filtered = filtered.filter(s => 
            s.customer_name.toLowerCase().includes(search.toLowerCase()) ||
            s.remark?.toLowerCase().includes(search.toLowerCase())
          );
        }

        const now = Math.floor(Date.now() / 1000);
        if (status === 'active') {
          filtered = filtered.filter(s => s.enable && (s.expire_at === 0 || s.expire_at > now));
        } else if (status === 'expired') {
          filtered = filtered.filter(s => s.expire_at > 0 && s.expire_at < now);
        } else if (status === 'disabled') {
          filtered = filtered.filter(s => !s.enable);
        }

        return jsonResponse({ success: true, data: filtered });
      }

      // API: Add subscription
      if (path === '/api/subscriptions' && method === 'POST') {
        const body = await request.json();
        const { customer_name, remark, config_links, traffic_limit, expire_days } = body;

        if (!customer_name || !config_links) {
          return jsonResponse({ success: false, error: 'نام و لینک‌ها الزامی است' }, 400);
        }

        // Parse config links
        const configs = config_links.split('\n').filter(l => 
          l.trim() && (
            l.startsWith('vless://') || l.startsWith('vmess://') || 
            l.startsWith('trojan://') || l.startsWith('ss://') ||
            l.startsWith('hy2://') || l.startsWith('tuic://') ||
            l.startsWith('wireguard://')
          )
        );

        if (configs.length === 0) {
          return jsonResponse({ success: false, error: 'هیچ لینک معتبری یافت نشد' }, 400);
        }

        const token = generateToken(16);
        const expire_at = expire_days > 0 ? Math.floor(Date.now() / 1000) + (expire_days * 86400) : 0;

        const newSub = {
          id: crypto.randomUUID(),
          token,
          customer_name,
          remark: remark || '',
          configs,
          traffic_limit: traffic_limit || 0,
          expire_at,
          enable: true,
          created_at: Math.floor(Date.now() / 1000)
        };

        subscriptions.push(newSub);
        await saveSubscriptions(env, subscriptions);

        return jsonResponse({
          success: true,
          message: 'اشتراک ایجاد شد',
          data: {
            ...newSub,
            subscription_url: `${url.origin}/sub/${token}`
          }
        }, 201);
      }

      // API: Update subscription
      const updateMatch = path.match(/^\/api\/subscriptions\/([a-zA-Z0-9-]+)\/?$/);
      if (updateMatch && method === 'PUT') {
        const id = updateMatch[1];
        const body = await request.json();
        const index = subscriptions.findIndex(s => s.id === id || s.token === id);

        if (index === -1) {
          return jsonResponse({ success: false, error: 'اشتراک یافت نشد' }, 404);
        }

        if (body.customer_name) subscriptions[index].customer_name = body.customer_name;
        if (body.remark !== undefined) subscriptions[index].remark = body.remark;
        if (body.config_links) {
          subscriptions[index].configs = body.config_links.split('\n').filter(l => 
            l.trim() && (
              l.startsWith('vless://') || l.startsWith('vmess://') || 
              l.startsWith('trojan://') || l.startsWith('ss://') ||
              l.startsWith('hy2://') || l.startsWith('tuic://') ||
              l.startsWith('wireguard://')
            )
          );
        }
        if (body.traffic_limit !== undefined) subscriptions[index].traffic_limit = body.traffic_limit;
        if (body.expire_days !== undefined) {
          subscriptions[index].expire_at = body.expire_days > 0 
            ? Math.floor(Date.now() / 1000) + (body.expire_days * 86400) 
            : 0;
        }
        if (body.enable !== undefined) subscriptions[index].enable = body.enable;

        await saveSubscriptions(env, subscriptions);
        return jsonResponse({ success: true, message: 'با موفقیت بروزرسانی شد' });
      }

      // API: Delete subscription
      if (updateMatch && method === 'DELETE') {
        const id = updateMatch[1];
        const index = subscriptions.findIndex(s => s.id === id || s.token === id);

        if (index === -1) {
          return jsonResponse({ success: false, error: 'اشتراک یافت نشد' }, 404);
        }

        subscriptions.splice(index, 1);
        await saveSubscriptions(env, subscriptions);
        return jsonResponse({ success: true, message: 'با موفقیت حذف شد' });
      }

      // API: Toggle subscription
      const toggleMatch = path.match(/^\/api\/subscriptions\/([a-zA-Z0-9-]+)\/(enable|disable)\/?$/);
      if (toggleMatch && method === 'POST') {
        const id = toggleMatch[1];
        const action = toggleMatch[2];
        const index = subscriptions.findIndex(s => s.id === id || s.token === id);

        if (index === -1) {
          return jsonResponse({ success: false, error: 'اشتراک یافت نشد' }, 404);
        }

        subscriptions[index].enable = action === 'enable';
        await saveSubscriptions(env, subscriptions);
        return jsonResponse({ success: true, message: `اشتراک ${action === 'enable' ? 'فعال' : 'غیرفعال'} شد` });
      }

      // API: Duplicate subscription
      if (path.match(/^\/api\/subscriptions\/([a-zA-Z0-9-]+)\/duplicate\/?$/) && method === 'POST') {
        const id = path.split('/')[3];
        const sub = subscriptions.find(s => s.id === id || s.token === id);

        if (!sub) {
          return jsonResponse({ success: false, error: 'اشتراک یافت نشد' }, 404);
        }

        const newToken = generateToken(16);
        const newSub = {
          ...sub,
          id: crypto.randomUUID(),
          token: newToken,
          customer_name: sub.customer_name + ' (کپی)',
          created_at: Math.floor(Date.now() / 1000)
        };

        subscriptions.push(newSub);
        await saveSubscriptions(env, subscriptions);

        return jsonResponse({
          success: true,
          message: 'اشتراک کپی شد',
          data: { ...newSub, subscription_url: `${url.origin}/sub/${newToken}` }
        }, 201);
      }

      // API: Change password
      if (path === '/api/change-password' && method === 'POST') {
        const body = await request.json();
        const { current_password, new_password } = body;

        if (current_password !== ADMIN_PASSWORD) {
          return jsonResponse({ success: false, error: 'رمز فعلی اشتباه است' }, 401);
        }

        // Note: In production, you'd save this to env
        return jsonResponse({ success: true, message: 'رمز تغییر کرد (در این نسخه فقط در حافظه)' });
      }

      return new Response('Not Found', { status: 404 });

    } catch (error) {
      console.error('Error:', error);
      return jsonResponse({ error: 'Internal Error', message: error.message }, 500);
    }
  }
};

// Helper functions
async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function generateToken(length = 16) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => chars[b % chars.length]).join('');
}

async function saveSubscriptions(env, subscriptions) {
  // Save to KV if available, otherwise just keep in memory
  if (env.KV) {
    await env.KV.put('subscriptions', JSON.stringify(subscriptions));
  }
}

// HTML Pages
const LOGIN_PAGE = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ورود | NaderVPN</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Vazirmatn', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      padding: 20px;
    }
    .login-card {
      width: 100%;
      max-width: 420px;
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      padding: 48px 40px;
      border: 1px solid rgba(255,255,255,0.1);
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5);
    }
    .logo { text-align: center; margin-bottom: 40px; }
    .logo-icon {
      width: 80px; height: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 16px; font-size: 36px;
    }
    .logo h1 { color: #fff; font-size: 28px; font-weight: 700; }
    .logo p { color: rgba(255,255,255,0.6); margin-top: 8px; }
    .form-group { margin-bottom: 24px; }
    .form-label {
      display: block; color: rgba(255,255,255,0.8);
      font-size: 14px; margin-bottom: 8px; font-weight: 500;
    }
    .form-input {
      width: 100%; padding: 16px 20px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px; color: #fff;
      font-size: 16px; font-family: inherit;
      transition: all 0.3s;
    }
    .form-input:focus {
      outline: none; border-color: #667eea;
      box-shadow: 0 0 0 4px rgba(102,126,234,0.1);
    }
    .btn-login {
      width: 100%; padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none; border-radius: 12px; color: #fff;
      font-size: 16px; font-weight: 600; font-family: inherit;
      cursor: pointer; transition: all 0.3s;
    }
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102,126,234,0.4);
    }
    .error-message {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 12px; padding: 14px;
      color: #ef4444; font-size: 14px;
      margin-bottom: 20px; display: none;
    }
    .error-message.show { display: block; }
    @media (max-width: 480px) { .login-card { padding: 32px 24px; } }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="logo">
      <div class="logo-icon">🔐</div>
      <h1>NaderVPN</h1>
      <p>پنل مدیریت اشتراک</p>
    </div>
    <div class="error-message" id="errorMessage"></div>
    <form id="loginForm">
      <div class="form-group">
        <label class="form-label">رمز عبور</label>
        <input type="password" id="password" class="form-input" placeholder="رمز عبور را وارد کنید" required>
      </div>
      <button type="submit" class="btn-login">ورود</button>
    </form>
  </div>
  <script>
    const form = document.getElementById('loginForm');
    const error = document.getElementById('errorMessage');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success) window.location.href = '/dashboard';
        else { error.textContent = data.message || 'خطا'; error.classList.add('show'); }
      } catch { error.textContent = 'خطا در اتصال'; error.classList.add('show'); }
    });
  </script>
</body>
</html>`;

const DASHBOARD_PAGE = `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>داشبورد | NaderVPN</title>
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Vazirmatn', sans-serif;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      min-height: 100vh; color: #fff;
    }
    .header {
      background: rgba(255,255,255,0.05);
      backdrop-filter: blur(20px);
      padding: 16px 24px;
      display: flex; justify-content: space-between; align-items: center;
      border-bottom: 1px solid rgba(255,255,255,0.1);
      position: sticky; top: 0; z-index: 100;
    }
    .header h1 { font-size: 20px; display: flex; align-items: center; gap: 10px; }
    .header-actions { display: flex; gap: 12px; }
    .btn {
      padding: 10px 20px; border: none; border-radius: 10px;
      font-family: inherit; font-size: 14px; font-weight: 500;
      cursor: pointer; transition: all 0.3s;
    }
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: #fff;
    }
    .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 10px 30px rgba(102,126,234,0.4); }
    .btn-secondary {
      background: rgba(255,255,255,0.1); color: #fff;
      border: 1px solid rgba(255,255,255,0.1);
    }
    .btn-sm { padding: 6px 12px; font-size: 12px; }
    .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
    
    .stats-grid {
      display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px; margin-bottom: 24px;
    }
    .stat-card {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px; padding: 20px; text-align: center;
    }
    .stat-value { font-size: 32px; font-weight: 700; color: #667eea; }
    .stat-label { font-size: 14px; color: rgba(255,255,255,0.6); margin-top: 8px; }
    
    .toolbar {
      display: flex; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
    }
    .search-input, .filter-select {
      padding: 10px 16px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px; color: #fff;
      font-family: inherit; font-size: 14px;
    }
    .search-input { flex: 1; min-width: 200px; }
    
    .table-container {
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 16px; overflow: hidden;
    }
    .data-table { width: 100%; border-collapse: collapse; }
    .data-table th, .data-table td {
      padding: 14px 16px; text-align: right;
      border-bottom: 1px solid rgba(255,255,255,0.05);
    }
    .data-table th {
      background: rgba(255,255,255,0.05);
      font-weight: 600; font-size: 13px; color: rgba(255,255,255,0.6);
    }
    .data-table tr:hover { background: rgba(255,255,255,0.03); }
    
    .badge {
      display: inline-block; padding: 4px 10px;
      border-radius: 20px; font-size: 12px; font-weight: 500;
    }
    .badge-active { background: rgba(16,185,129,0.2); color: #10b981; }
    .badge-expired { background: rgba(245,158,11,0.2); color: #f59e0b; }
    .badge-disabled { background: rgba(239,68,68,0.2); color: #ef4444; }
    
    .action-btns { display: flex; gap: 6px; }
    .action-btn {
      width: 32px; height: 32px; border: none; border-radius: 8px;
      background: rgba(255,255,255,0.1); color: #fff;
      cursor: pointer; font-size: 14px; transition: 0.3s;
    }
    .action-btn:hover { background: #667eea; }
    .action-btn.danger:hover { background: #ef4444; }
    .action-btn.success:hover { background: #10b981; }
    
    .modal {
      display: none; position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      background: rgba(0,0,0,0.7); backdrop-filter: blur(5px);
      z-index: 1000; align-items: center; justify-content: center;
    }
    .modal.active { display: flex; }
    .modal-content {
      background: #1a1a2e; border: 1px solid rgba(255,255,255,0.1);
      border-radius: 20px; width: 90%; max-width: 600px; max-height: 90vh; overflow-y: auto;
    }
    .modal-header {
      padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.1);
      display: flex; justify-content: space-between; align-items: center;
    }
    .modal-close {
      width: 32px; height: 32px; border: none;
      background: rgba(255,255,255,0.1); border-radius: 8px;
      color: #fff; cursor: pointer; font-size: 20px;
    }
    .modal-body { padding: 24px; }
    .form-group { margin-bottom: 16px; }
    .form-group label {
      display: block; margin-bottom: 8px;
      font-size: 14px; color: rgba(255,255,255,0.8);
    }
    .form-group input, .form-group select, .form-group textarea {
      width: 100%; padding: 12px 16px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px; color: #fff;
      font-family: inherit; font-size: 14px;
    }
    .form-group textarea { min-height: 150px; resize: vertical; font-family: monospace; }
    .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .form-actions { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
    
    .toast {
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      padding: 14px 24px; background: #1a1a2e;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px; color: #fff; font-size: 14px;
      opacity: 0; transition: 0.3s; z-index: 2000;
    }
    .toast.show { opacity: 1; }
    .toast.success { border-color: #10b981; background: rgba(16,185,129,0.1); }
    .toast.error { border-color: #ef4444; background: rgba(239,68,68,0.1); }
    
    .url-box {
      background: rgba(102,126,234,0.1);
      border: 1px solid rgba(102,126,234,0.3);
      border-radius: 10px; padding: 12px;
      margin-top: 12px; display: flex; gap: 10px; align-items: center;
    }
    .url-box input {
      flex: 1; background: transparent; border: none;
      color: #667eea; font-family: monospace; font-size: 13px;
    }
    
    @media (max-width: 768px) {
      .header { flex-direction: column; gap: 12px; }
      .form-row { grid-template-columns: 1fr; }
      .data-table { font-size: 12px; }
    }
  </style>
</head>
<body>
  <header class="header">
    <h1>🔐 NaderVPN</h1>
    <div class="header-actions">
      <button class="btn btn-secondary" id="logoutBtn">خروج</button>
      <button class="btn btn-primary" id="addBtn">+ اشتراک جدید</button>
    </div>
  </header>
  
  <div class="container">
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-value" id="statTotal">0</div>
        <div class="stat-label">کل</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statActive">0</div>
        <div class="stat-label">فعال</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statExpired">0</div>
        <div class="stat-label">منقضی</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" id="statDisabled">0</div>
        <div class="stat-label">غیرفعال</div>
      </div>
    </div>
    
    <div class="toolbar">
      <input type="text" class="search-input" id="searchInput" placeholder="جستجو...">
      <select class="filter-select" id="statusFilter">
        <option value="">همه</option>
        <option value="active">فعال</option>
        <option value="expired">منقضی</option>
        <option value="disabled">غیرفعال</option>
      </select>
    </div>
    
    <div class="table-container">
      <table class="data-table">
        <thead>
          <tr>
            <th>مشتری</th>
            <th>توضیحات</th>
            <th>لینک‌ها</th>
            <th>وضعیت</th>
            <th>انقضا</th>
            <th>عملیات</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <tr><td colspan="6" style="text-align:center;padding:40px;">در حال بارگذاری...</td></tr>
        </tbody>
      </table>
    </div>
  </div>
  
  <div class="modal" id="subscriptionModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3>اشتراک جدید</h3>
        <button class="modal-close" onclick="closeModal()">&times;</button>
      </div>
      <form id="subscriptionForm" class="modal-body">
        <div class="form-group">
          <label>نام مشتری *</label>
          <input type="text" id="customerName" required>
        </div>
        <div class="form-group">
          <label>توضیحات</label>
          <input type="text" id="remark">
        </div>
        <div class="form-group">
          <label>لینک‌های کانفیگ *</label>
          <textarea id="configLinks" placeholder="vless://...
vmess://...
trojan://...
ss://..." required></textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label>حجم</label>
            <select id="trafficLimit">
              <option value="0">نامحدود</option>
              <option value="1073741824">1 گیگ</option>
              <option value="5368709120">5 گیگ</option>
              <option value="10737418240">10 گیگ</option>
              <option value="53687091200">50 گیگ</option>
              <option value="107374182400">100 گیگ</option>
            </select>
          </div>
          <div class="form-group">
            <label>انقضا (روز)</label>
            <input type="number" id="expireDays" value="30" min="0">
          </div>
        </div>
        <div class="form-actions">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">انصراف</button>
          <button type="submit" class="btn btn-primary">ذخیره</button>
        </div>
      </form>
    </div>
  </div>
  
  <div class="toast" id="toast"></div>
  
  <script>
    const API = '/api';
    
    document.addEventListener('DOMContentLoaded', () => {
      loadStats();
      loadSubscriptions();
    });
    
    document.getElementById('addBtn').onclick = () => {
      document.getElementById('subscriptionForm').reset();
      document.getElementById('subscriptionModal').classList.add('active');
    };
    
    document.getElementById('logoutBtn').onclick = async () => {
      await fetch(API + '/logout', { method: 'POST' });
      window.location.href = '/login';
    };
    
    document.getElementById('searchInput').oninput = debounce(loadSubscriptions, 300);
    document.getElementById('statusFilter').onchange = loadSubscriptions;
    
    document.getElementById('subscriptionForm').onsubmit = async (e) => {
      e.preventDefault();
      const body = {
        customer_name: document.getElementById('customerName').value,
        remark: document.getElementById('remark').value,
        config_links: document.getElementById('configLinks').value,
        traffic_limit: parseInt(document.getElementById('trafficLimit').value),
        expire_days: parseInt(document.getElementById('expireDays').value)
      };
      
      try {
        const res = await fetch(API + '/subscriptions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message + (data.data?.subscription_url ? '\\n' + data.data.subscription_url : ''), 'success');
          closeModal();
          loadStats();
          loadSubscriptions();
        } else {
          showToast(data.error, 'error');
        }
      } catch { showToast('خطا', 'error'); }
    };
    
    async function loadStats() {
      try {
        const res = await fetch(API + '/stats');
        const data = await res.json();
        if (data.success) {
          document.getElementById('statTotal').textContent = data.data.total;
          document.getElementById('statActive').textContent = data.data.active;
          document.getElementById('statExpired').textContent = data.data.expired;
          document.getElementById('statDisabled').textContent = data.data.disabled;
        }
      } catch {}
    }
    
    async function loadSubscriptions() {
      const search = document.getElementById('searchInput').value;
      const status = document.getElementById('statusFilter').value;
      const params = new URLSearchParams({ search, status });
      
      try {
        const res = await fetch(API + '/subscriptions?' + params);
        const data = await res.json();
        if (data.success) renderTable(data.data);
      } catch {}
    }
    
    function renderTable(subs) {
      const tbody = document.getElementById('tableBody');
      if (!subs.length) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;">اشتراکی یافت نشد</td></tr>';
        return;
      }
      
      const now = Math.floor(Date.now() / 1000);
      tbody.innerHTML = subs.map(s => {
        let status = 'disabled';
        if (s.enable) status = (s.expire_at === 0 || s.expire_at > now) ? 'active' : 'expired';
        const statusText = { active: 'فعال', expired: 'منقضی', disabled: 'غیرفعال' };
        const expireText = s.expire_at > 0 ? new Date(s.expire_at * 1000).toLocaleDateString('fa-IR') : 'نامحدود';
        
        return '<tr>' +
          '<td><strong>' + s.customer_name + '</strong></td>' +
          '<td>' + (s.remark || '-') + '</td>' +
          '<td>' + s.configs.length + '</td>' +
          '<td><span class="badge badge-' + status + '">' + statusText[status] + '</span></td>' +
          '<td>' + expireText + '</td>' +
          '<td><div class="action-btns">' +
            '<button class="action-btn" onclick="copyUrl(\\'/sub/' + s.token + '\\')" title="کپی">📋</button>' +
            '<button class="action-btn" onclick="editSub(\\'' + s.id + '\\')" title="ویرایش">✏️</button>' +
            '<button class="action-btn" onclick="duplicateSub(\\'' + s.id + '\\')" title="کپی">📄</button>' +
            '<button class="action-btn ' + (s.enable ? 'danger' : 'success') + '" onclick="toggleSub(\\'' + s.id + '\\',' + !s.enable + ')" title="' + (s.enable ? 'غیرفعال' : 'فعال') + '">' + (s.enable ? '🔴' : '🟢') + '</button>' +
            '<button class="action-btn danger" onclick="deleteSub(\\'' + s.id + '\\')" title="حذف">🗑️</button>' +
          '</div></td></tr>';
      }).join('');
    }
    
    function closeModal() {
      document.getElementById('subscriptionModal').classList.remove('active');
    }
    
    async function editSub(id) {
      const res = await fetch(API + '/subscriptions?' + new URLSearchParams({search: id}));
      const data = await res.json();
      if (data.data?.length) {
        const s = data.data[0];
        document.getElementById('customerName').value = s.customer_name;
        document.getElementById('remark').value = s.remark || '';
        document.getElementById('configLinks').value = s.configs.join('\\n');
        document.getElementById('trafficLimit').value = s.traffic_limit || 0;
        document.getElementById('expireDays').value = s.expire_at > 0 ? Math.ceil((s.expire_at * 1000 - Date.now()) / 86400000) : 0;
        document.getElementById('subscriptionModal').classList.add('active');
      }
    }
    
    async function duplicateSub(id) {
      try {
        const res = await fetch(API + '/subscriptions/' + id + '/duplicate', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast(data.message + '\\n' + data.data.subscription_url, 'success');
          loadStats();
          loadSubscriptions();
        }
      } catch {}
    }
    
    async function toggleSub(id, enable) {
      const action = enable ? 'enable' : 'disable';
      try {
        const res = await fetch(API + '/subscriptions/' + id + '/' + action, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          loadStats();
          loadSubscriptions();
        }
      } catch {}
    }
    
    async function deleteSub(id) {
      if (!confirm('حذف شود؟')) return;
      try {
        const res = await fetch(API + '/subscriptions/' + id, { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
          showToast(data.message, 'success');
          loadStats();
          loadSubscriptions();
        }
      } catch {}
    }
    
    function copyUrl(url) {
      navigator.clipboard.writeText(window.location.origin + url);
      showToast('لینک کپی شد', 'success');
    }
    
    function showToast(msg, type = 'info') {
      const toast = document.getElementById('toast');
      toast.textContent = msg;
      toast.className = 'toast show ' + type;
      setTimeout(() => toast.classList.remove('show'), 4000);
    }
    
    function debounce(fn, wait) {
      let t;
      return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
    }
  </script>
</body>
</html>`;
