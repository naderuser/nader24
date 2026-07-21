/**
 * Authentication Routes
 */

import { createSession, destroySession } from '../middleware/auth.js';
import { getSetting } from '../db/init.js';

export async function handleLogin(request, env) {
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
    .logo { text-align: center; margin-bottom: 40px; }
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

export async function handleLoginSubmit(request, env) {
  try {
    const body = await request.json();
    const { password } = body;
    
    const adminPassword = await getSetting(env, 'admin_password') || 'nader0933';
    
    if (password !== adminPassword) {
      return jsonResponse({ success: false, message: 'رمز عبور اشتباه است' }, 401);
    }
    
    const token = await createSession(env, password);
    
    const response = jsonResponse({ success: true, message: 'ورود موفق' });
    response.headers.set('Set-Cookie', 
      `nadervpn_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=86400`
    );
    
    return response;
  } catch (error) {
    return jsonResponse({ success: false, message: 'خطا در ورود' }, 500);
  }
}

export async function handleLogout(request, env) {
  const cookies = parseCookies(request);
  const token = cookies['nadervpn_session'];
  
  if (token) {
    await destroySession(env, token);
  }
  
  const response = jsonResponse({ success: true });
  response.headers.set('Set-Cookie', 
    `nadervpn_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
  
  return response;
}

function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) cookies[name] = rest.join('=');
  }
  return cookies;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
