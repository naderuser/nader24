/**
 * NaderVPN Subscription Manager
 * Cloudflare Workers
 */

import { handleLogin, handleLoginSubmit, handleLogout } from './routes/auth.js';
import { handleSubscription } from './routes/subscription.js';
import { handleDashboard, handleStats, handleSubscriptions, handleAddSubscription, handleUpdateSubscription, handleDeleteSubscription, handleToggleSubscription } from './routes/dashboard.js';
import { handleQRCode } from './routes/qr.js';
import { getSession, verifySession } from './middleware/auth.js';
import { hashPassword, verifyPassword } from './utils/crypto.js';
import { getSetting, setSetting } from './db/init.js';

// Security headers
const securityHeaders = {
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;"
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    // Apply security headers
    const headers = new Headers();
    Object.entries(securityHeaders).forEach(([k, v]) => headers.set(k, v));

    try {
      // Route matching
      let response;

      // Public routes
      if (path === '/login' && method === 'GET') {
        response = await handleLoginPage(request, env);
      }
      else if (path === '/api/auth/login' && method === 'POST') {
        response = await handleLoginSubmit(request, env);
      }
      else if (path === '/api/auth/logout' && method === 'POST') {
        response = await handleLogout(request, env);
      }
      else if (path.match(/^\/sub\/([a-zA-Z0-9]+)\/?$/) && method === 'GET') {
        response = await handleSubscription(request, env);
      }
      else if (path.match(/^\/api\/qr\/([a-zA-Z0-9]+)\/?$/) && method === 'GET') {
        response = await handleQRCode(request, env);
      }
      // Protected routes
      else {
        const session = await getSession(request, env);
        if (!session) {
          if (path.startsWith('/api/')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
              status: 401,
              headers: { 'Content-Type': 'application/json' }
            });
          }
          return Response.redirect(new URL('/login', request.url), 302);
        }

        // Dashboard routes
        if (path === '/' || path === '/dashboard') {
          response = await handleDashboard(request, env);
        }
        else if (path === '/api/stats' && method === 'GET') {
          response = await handleStats(request, env);
        }
        else if (path === '/api/subscriptions' && method === 'GET') {
          response = await handleSubscriptions(request, env);
        }
        else if (path === '/api/subscriptions' && method === 'POST') {
          response = await handleAddSubscription(request, env);
        }
        else if (path.match(/^\/api\/subscriptions\/([a-zA-Z0-9-]+)\/?$/) && method === 'PUT') {
          response = await handleUpdateSubscription(request, env);
        }
        else if (path.match(/^\/api\/subscriptions\/([a-zA-Z0-9-]+)\/?$/) && method === 'DELETE') {
          response = await handleDeleteSubscription(request, env);
        }
        else if (path.match(/^\/api\/subscriptions\/([a-zA-Z0-9-]+)\/(enable|disable)\/?$/) && method === 'POST') {
          response = await handleToggleSubscription(request, env);
        }
        else if (path === '/api/change-password' && method === 'POST') {
          response = await handleChangePassword(request, env);
        }
        else {
          response = new Response('Not Found', { status: 404 });
        }
      }

      // Apply headers to response
      if (response && response instanceof Response) {
        const newHeaders = new Headers(response.headers);
        Object.entries(securityHeaders).forEach(([k, v]) => newHeaders.set(k, v));
        return new Response(response.body, {
          status: response.status,
          headers: newHeaders
        });
      }
      return response;

    } catch (error) {
      console.error('Worker Error:', error);
      return new Response(JSON.stringify({ error: 'Internal Server Error', message: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }
};

// Password change handler
async function handleChangePassword(request, env) {
  try {
    const body = await request.json();
    const { current_password, new_password } = body;

    const adminPassword = await getSetting(env, 'admin_password') || 'nader0933';

    if (current_password !== adminPassword) {
      return jsonResponse({ success: false, error: 'Current password is incorrect' }, 401);
    }

    await setSetting(env, 'admin_password', new_password);
    return jsonResponse({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Login page HTML
async function handleLoginPage(request, env) {
  const html = `<!DOCTYPE html>
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
    .logo {
      text-align: center;
      margin-bottom: 40px;
    }
    .logo-icon {
      width: 80px;
      height: 80px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 36px;
    }
    .logo h1 { color: #fff; font-size: 28px; font-weight: 700; }
    .logo p { color: rgba(255,255,255,0.6); margin-top: 8px; }
    .form-group { margin-bottom: 24px; }
    .form-label {
      display: block;
      color: rgba(255,255,255,0.8);
      font-size: 14px;
      margin-bottom: 8px;
      font-weight: 500;
    }
    .form-input {
      width: 100%;
      padding: 16px 20px;
      background: rgba(255,255,255,0.05);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 12px;
      color: #fff;
      font-size: 16px;
      font-family: inherit;
      transition: all 0.3s;
    }
    .form-input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 4px rgba(102,126,234,0.1);
    }
    .btn-login {
      width: 100%;
      padding: 16px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border: none;
      border-radius: 12px;
      color: #fff;
      font-size: 16px;
      font-weight: 600;
      font-family: inherit;
      cursor: pointer;
      transition: all 0.3s;
    }
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102,126,234,0.4);
    }
    .error-message {
      background: rgba(239,68,68,0.1);
      border: 1px solid rgba(239,68,68,0.3);
      border-radius: 12px;
      padding: 14px;
      color: #ef4444;
      font-size: 14px;
      margin-bottom: 20px;
      display: none;
    }
    .error-message.show { display: block; }
    @media (max-width: 480px) {
      .login-card { padding: 32px 24px; }
    }
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
    const errorMessage = document.getElementById('errorMessage');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password })
        });
        const data = await res.json();
        if (data.success) {
          window.location.href = '/dashboard';
        } else {
          errorMessage.textContent = data.message || 'خطا در ورود';
          errorMessage.classList.add('show');
        }
      } catch (err) {
        errorMessage.textContent = 'خطا در اتصال';
        errorMessage.classList.add('show');
      }
    });
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
