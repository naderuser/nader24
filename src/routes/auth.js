/**
 * Authentication Routes
 */

import { login as doLogin, logout as doLogout } from '../middleware/auth.js';
import { 
  loginRateLimiter, 
  recordFailedLogin, 
  resetLoginAttempts,
  getClientIP,
  validateCSRFToken,
  generateCSRFToken,
  sanitizeInput
} from '../middleware/security.js';
import { getSetting } from '../db/init.js';

const SESSION_COOKIE_NAME = 'nadervpn_session';

export async function handleLoginPage(request, env, ctx) {
  // Check if already logged in
  const cookies = parseCookies(request);
  if (cookies[SESSION_COOKIE_NAME]) {
    const session = await env.KV.get(`session:${cookies[SESSION_COOKIE_NAME]}`, 'json');
    if (session) {
      return Response.redirect(new URL('/dashboard', request.url), 302);
    }
  }
  
  // Serve login page
  const html = await getLoginPage(request, env);
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' }
  });
}

export async function handleLogin(request, env, ctx) {
  // Check rate limit
  const rateLimit = await loginRateLimiter(request, env);
  if (rateLimit.blocked) {
    return jsonResponse({
      success: false,
      message: rateLimit.message,
      retryAfter: rateLimit.retryAfter
    }, 429);
  }
  
  try {
    const body = await request.json();
    const { username, password, csrf_token } = body;
    
    // CSRF validation
    const csrfSecret = await getSetting(env, 'csrf_secret') || 'default-secret';
    if (!validateCSRFToken(csrf_token, csrfSecret)) {
      return jsonResponse({
        success: false,
        message: 'Invalid CSRF token'
      }, 400);
    }
    
    // Sanitize inputs
    const sanitizedUsername = sanitizeInput(username);
    const ip = getClientIP(request);
    const userAgent = request.headers.get('User-Agent') || '';
    
    // Attempt login
    const result = await doLogin(env, sanitizedUsername, password, ip, userAgent);
    
    if (!result) {
      // Record failed attempt
      await recordFailedLogin(request, env);
      return jsonResponse({
        success: false,
        message: 'Invalid username or password'
      }, 401);
    }
    
    // Reset rate limit on success
    await resetLoginAttempts(request, env);
    
    // Set session cookie
    const response = jsonResponse({
      success: true,
      message: 'Login successful',
      redirect: '/dashboard'
    });
    
    setSessionCookie(response, result.token, result.expires);
    
    return response;
  } catch (error) {
    console.error('Login error:', error);
    return jsonResponse({
      success: false,
      message: 'Login failed'
    }, 500);
  }
}

export async function handleLogout(request, env, ctx) {
  const cookies = parseCookies(request);
  const sessionToken = cookies[SESSION_COOKIE_NAME];
  
  if (sessionToken) {
    await doLogout(env, sessionToken, getClientIP(request), request.headers.get('User-Agent') || '');
  }
  
  const response = jsonResponse({
    success: true,
    message: 'Logged out successfully',
    redirect: '/login'
  });
  
  clearSessionCookie(response);
  return response;
}

export async function handleCSRFToken(request, env, ctx) {
  const csrfSecret = await getSetting(env, 'csrf_secret') || crypto.randomUUID();
  if (!await getSetting(env, 'csrf_secret')) {
    await getSetting(env, 'csrf_secret');
  }
  
  // Store the secret for later validation
  await env.KV.put('csrf_secret', csrfSecret, { expirationTtl: 86400 });
  
  const token = generateCSRFToken(csrfSecret);
  
  return jsonResponse({ token });
}

// Login page HTML template
async function getLoginPage(request, env) {
  const csrfSecret = await getSetting(env, 'csrf_secret') || crypto.randomUUID();
  await env.KV.put('csrf_secret', csrfSecret, { expirationTtl: 86400 });
  const csrfToken = generateCSRFToken(csrfSecret);
  
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ورود | NaderVPN</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Vazirmatn', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #0f0f23 0%, #1a1a2e 50%, #16213e 100%);
      padding: 20px;
    }
    
    .login-container {
      width: 100%;
      max-width: 420px;
    }
    
    .login-card {
      background: rgba(255, 255, 255, 0.05);
      backdrop-filter: blur(20px);
      border-radius: 24px;
      padding: 48px 40px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
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
    
    .logo h1 {
      color: #fff;
      font-size: 28px;
      font-weight: 700;
    }
    
    .logo p {
      color: rgba(255, 255, 255, 0.6);
      font-size: 14px;
      margin-top: 8px;
    }
    
    .form-group {
      margin-bottom: 24px;
    }
    
    .form-label {
      display: block;
      color: rgba(255, 255, 255, 0.8);
      font-size: 14px;
      margin-bottom: 8px;
      font-weight: 500;
    }
    
    .form-input {
      width: 100%;
      padding: 16px 20px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      color: #fff;
      font-size: 16px;
      font-family: inherit;
      transition: all 0.3s ease;
    }
    
    .form-input:focus {
      outline: none;
      border-color: #667eea;
      background: rgba(255, 255, 255, 0.08);
      box-shadow: 0 0 0 4px rgba(102, 126, 234, 0.1);
    }
    
    .form-input::placeholder {
      color: rgba(255, 255, 255, 0.4);
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
      transition: all 0.3s ease;
      margin-top: 8px;
    }
    
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
    }
    
    .btn-login:active {
      transform: translateY(0);
    }
    
    .btn-login:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .error-message {
      background: rgba(239, 68, 68, 0.1);
      border: 1px solid rgba(239, 68, 68, 0.3);
      border-radius: 12px;
      padding: 14px;
      color: #ef4444;
      font-size: 14px;
      margin-bottom: 20px;
      display: none;
    }
    
    .error-message.show {
      display: block;
    }
    
    .footer {
      text-align: center;
      margin-top: 32px;
      color: rgba(255, 255, 255, 0.4);
      font-size: 12px;
    }
    
    .loading {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      border-radius: 50%;
      border-top-color: #fff;
      animation: spin 0.8s linear infinite;
      margin-right: 8px;
      vertical-align: middle;
    }
    
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    
    @media (max-width: 480px) {
      .login-card {
        padding: 32px 24px;
      }
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-card">
      <div class="logo">
        <div class="logo-icon">🔐</div>
        <h1>NaderVPN</h1>
        <p>پنل مدیریت</p>
      </div>
      
      <div class="error-message" id="errorMessage"></div>
      
      <form id="loginForm">
        <input type="hidden" id="csrfToken" value="${csrfToken}">
        
        <div class="form-group">
          <label class="form-label" for="username">نام کاربری</label>
          <input 
            type="text" 
            id="username" 
            name="username" 
            class="form-input" 
            placeholder="نام کاربری خود را وارد کنید"
            required
            autocomplete="username"
          >
        </div>
        
        <div class="form-group">
          <label class="form-label" for="password">رمز عبور</label>
          <input 
            type="password" 
            id="password" 
            name="password" 
            class="form-input" 
            placeholder="رمز عبور خود را وارد کنید"
            required
            autocomplete="current-password"
          >
        </div>
        
        <button type="submit" class="btn-login" id="loginBtn">
          ورود به پنل
        </button>
      </form>
      
      <div class="footer">
        <p>© 2024 NaderVPN - تمامی حقوق محفوظ است</p>
      </div>
    </div>
  </div>

  <script>
    const form = document.getElementById('loginForm');
    const errorMessage = document.getElementById('errorMessage');
    const loginBtn = document.getElementById('loginBtn');
    
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      const csrfToken = document.getElementById('csrfToken').value;
      
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<span class="loading"></span> در حال ورود...';
      errorMessage.classList.remove('show');
      
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ username, password, csrf_token: csrfToken })
        });
        
        const data = await response.json();
        
        if (data.success) {
          window.location.href = data.redirect || '/dashboard';
        } else {
          errorMessage.textContent = data.message || 'خطا در ورود';
          errorMessage.classList.add('show');
          loginBtn.disabled = false;
          loginBtn.textContent = 'ورود به پنل';
          
          // Refresh CSRF token on error
          refreshCSRFToken();
        }
      } catch (error) {
        errorMessage.textContent = 'خطا در اتصال به سرور';
        errorMessage.classList.add('show');
        loginBtn.disabled = false;
        loginBtn.textContent = 'ورود به پنل';
      }
    });
    
    async function refreshCSRFToken() {
      try {
        const response = await fetch('/api/auth/csrf');
        const data = await response.json();
        document.getElementById('csrfToken').value = data.token;
      } catch (error) {
        console.error('Failed to refresh CSRF token');
      }
    }
  </script>
</body>
</html>`;
}

function setSessionCookie(response, token, expires) {
  response.headers.set('Set-Cookie', 
    `${SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${new Date(expires).toUTCString()}`
  );
}

function clearSessionCookie(response) {
  response.headers.set('Set-Cookie', 
    `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`
  );
}

function parseCookies(request) {
  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = {};
  for (const cookie of cookieHeader.split(';')) {
    const [name, ...rest] = cookie.trim().split('=');
    if (name) {
      cookies[name] = rest.join('=');
    }
  }
  return cookies;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
