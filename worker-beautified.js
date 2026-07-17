/**
 * کلاس مجازی - Cloudflare Worker
 * سیستم چت، تخته سفید، آپلود فایل و مدیریت کلاس آنلاین
 */

// ============================================
// ثوابت
// ============================================
const CONFIG = {
  APP_NAME: 'کلاس مجازی',
  THEME_COLOR: '#1e293b',
  MAX_FILE_SIZE: 5 * 1024 * 1024, // 5MB
  MAX_IMAGE_WIDTH: 800,
  IMAGE_QUALITY: 0.7,
  HEARTBEAT_INTERVAL: 5000, // 5 ثانیه
  POLL_INTERVALS: {
    messages: 2000,
    heartbeat: 2000,
    whiteboard: 3000
  }
};

const MIME_TYPES = {
  pdf: '📕',
  zip: '🗜️',
  rar: '🗜️',
  default: '📄'
};

// ============================================
// تابع اصلی Fetch
// ============================================
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // فایل‌های PWA
    if (path === '/manifest.json') {
      return this.handleManifest();
    }
    if (path === '/sw.js') {
      return this.handleServiceWorker();
    }

    // دانلود فایل‌ها از KV
    if (path.startsWith('/files/')) {
      return this.handleFileDownload(path, env);
    }

    // API Routes
    if (path.startsWith('/api/')) {
      return handleApi(request, env, url);
    }

    // صفحات HTML
    if (path === '/' || path === '/login') {
      return new Response(getLoginHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    if (path === '/class') {
      return new Response(getClassHTML(), {
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    return jsonResponse({ error: 'Not Found' }, 404);
  },

  // ----------------------------------------
  // فایل manifest.json
  // ----------------------------------------
  handleManifest() {
    return new Response(JSON.stringify({
      name: CONFIG.APP_NAME,
      short_name: 'کلاس',
      start_url: '/login',
      display: 'standalone',
      background_color: CONFIG.THEME_COLOR,
      theme_color: CONFIG.THEME_COLOR,
      icons: [{
        src: 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f396.png',
        sizes: '72x72',
        type: 'image/png'
      }]
    }), { headers: { 'Content-Type': 'application/json' } });
  },

  // ----------------------------------------
  // Service Worker
  // ----------------------------------------
  handleServiceWorker() {
    const swCode = `
      self.addEventListener('install', e => self.skipWaiting());
      self.addEventListener('activate', e => e.waitUntil(clients.claim()));
      self.addEventListener('fetch', e => {
        e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
      });
    `;
    return new Response(swCode, { headers: { 'Content-Type': 'application/javascript' } });
  },

  // ----------------------------------------
  // دانلود فایل از KV
  // ----------------------------------------
  async handleFileDownload(path, env) {
    const key = path.substring(7);
    const { value, metadata } = await env.FILES_KV.getWithMetadata(key, { type: 'arrayBuffer' });

    if (!value) {
      return jsonResponse({ error: 'فایل یافت نشد' }, 404);
    }

    const headers = new Headers();
    headers.set('Content-Type', metadata?.type || 'application/octet-stream');

    // فقط فایل‌های غیر از عکس دانلود شوند
    if (!metadata?.type?.startsWith('image/')) {
      headers.set('Content-Disposition', `attachment; filename="${metadata?.name || 'file'}"`);
    }

    return new Response(value, { headers });
  }
};

// ============================================
// توابع کمکی
// ============================================
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function getFileIcon(mimeType) {
  for (const [type, icon] of Object.entries(MIME_TYPES)) {
    if (mimeType.includes(type)) return icon;
  }
  return MIME_TYPES.default;
}

// ============================================
// API Handler
// ============================================
async function handleApi(request, env, url) {
  const path = url.pathname;
  const method = request.method;

  // ----------------------------------------
  // ثبت‌نام / ورود
  // ----------------------------------------
  if (path === '/api/login' && method === 'POST') {
    return handleLogin(request, env);
  }

  // ----------------------------------------
  // خروج کاربر
  // ----------------------------------------
  if (path === '/api/logout' && method === 'POST') {
    return handleLogout(request, env);
  }

  // ----------------------------------------
  // پاک کردن کلاس
  // ----------------------------------------
  if (path === '/api/clear-class' && method === 'POST') {
    return handleClearClass(request, env);
  }

  // ----------------------------------------
  // حذف پیام
  // ----------------------------------------
  if (path === '/api/delete-message' && method === 'POST') {
    return handleDeleteMessage(request, env);
  }

  // ----------------------------------------
  // آپلود فایل
  // ----------------------------------------
  if (path === '/api/upload-file' && method === 'POST') {
    return handleFileUpload(request, env);
  }

  // ----------------------------------------
  // لینک جلسه
  // ----------------------------------------
  if (path === '/api/set-meeting-link' && method === 'POST') {
    return handleSetMeetingLink(request, env);
  }
  if (path === '/api/get-meeting-link' && method === 'GET') {
    return handleGetMeetingLink(url, env);
  }

  // ----------------------------------------
  // حضور آنلاین (Heartbeat)
  // ----------------------------------------
  if (path === '/api/heartbeat' && method === 'POST') {
    return handleHeartbeat(request, env);
  }

  // ----------------------------------------
  // پیام‌ها
  // ----------------------------------------
  if (path === '/api/get-messages' && method === 'GET') {
    return handleGetMessages(url, env);
  }
  if (path === '/api/send-message' && method === 'POST') {
    return handleSendMessage(request, env);
  }

  // ----------------------------------------
  // تخته سفید
  // ----------------------------------------
  if (path === '/api/get-whiteboard' && method === 'GET') {
    return handleGetWhiteboard(url, env);
  }
  if (path === '/api/update-whiteboard' && method === 'POST') {
    return handleUpdateWhiteboard(request, env);
  }

  return jsonResponse({ error: 'API Not Found' }, 404);
}

// ----------------------------------------
// Login Handler
// ----------------------------------------
async function handleLogin(request, env) {
  const { username, classId, password } = await request.json();

  if (!username || !classId) {
    return jsonResponse({ error: 'فیلدها الزامی است' }, 400);
  }

  let role = 'student';
  const cls = await env.DB
    .prepare('SELECT * FROM classes WHERE classId = ?')
    .bind(classId)
    .first();

  if (cls) {
    // کلاس وجود دارد
    if (cls.password === password) {
      role = 'teacher';
    }
  } else {
    // کلاس جدید - اولین نفر باید رمز بگذارد
    if (!password) {
      return jsonResponse({
        error: 'شما اولین نفر هستید، باید برای کلاس رمز عبور تعیین کنید'
      }, 400);
    }
    await env.DB
      .prepare('INSERT INTO classes (classId, password, teacher) VALUES (?, ?, ?)')
      .bind(classId, password, username)
      .run();
    role = 'teacher';
  }

  return jsonResponse({ success: true, username, classId, role });
}

// ----------------------------------------
// Logout Handler
// ----------------------------------------
async function handleLogout(request, env) {
  const { username, classId } = await request.json();
  await env.DB
    .prepare('DELETE FROM online_users WHERE username = ? AND classId = ?')
    .bind(username, classId)
    .run();

  return jsonResponse({ success: true });
}

// ----------------------------------------
// Clear Class Handler
// ----------------------------------------
async function handleClearClass(request, env) {
  const { classId, role } = await request.json();

  if (role !== 'teacher') {
    return jsonResponse({ error: 'فقط معلم اجازه پاک کردن دارد' }, 403);
  }

  // حذف پیام‌ها
  await env.DB
    .prepare('DELETE FROM messages WHERE classId = ?')
    .bind(classId)
    .run();

  // حذف تخته سفید
  await env.DB
    .prepare('DELETE FROM whiteboard WHERE classId = ?')
    .bind(classId)
    .run();

  // حذف فایل‌ها از KV
  const list = await env.FILES_KV.list({ prefix: `class_${classId}_` });
  for (const key of list.keys) {
    await env.FILES_KV.delete(key.name);
  }

  return jsonResponse({ success: true });
}

// ----------------------------------------
// Delete Message Handler
// ----------------------------------------
async function handleDeleteMessage(request, env) {
  const { id, role } = await request.json();

  if (role !== 'teacher') {
    return jsonResponse({ error: 'فقط معلم مجاز است' }, 403);
  }

  await env.DB
    .prepare('DELETE FROM messages WHERE id = ?')
    .bind(id)
    .run();

  return jsonResponse({ success: true });
}

// ----------------------------------------
// File Upload Handler
// ----------------------------------------
async function handleFileUpload(request, env) {
  const formData = await request.formData();
  const file = formData.get('file');
  const classId = formData.get('classId');

  if (!file || !classId) {
    return jsonResponse({ error: 'فایل یافت نشد' }, 400);
  }

  if (file.size > CONFIG.MAX_FILE_SIZE) {
    return jsonResponse({ error: 'حداکثر حجم مجاز فایل ۵ مگابایت است!' }, 400);
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, '_');
  const key = `class_${classId}_${Date.now()}_${safeName}`;

  await env.FILES_KV.put(key, file.stream(), {
    metadata: { name: file.name, type: file.type }
  });

  return jsonResponse({
    success: true,
    url: `/files/${key}`,
    type: file.type,
    name: file.name
  });
}

// ----------------------------------------
// Meeting Link Handlers
// ----------------------------------------
async function handleSetMeetingLink(request, env) {
  const { classId, link } = await request.json();
  await env.FILES_KV.put(`meeting_${classId}`, link);
  return jsonResponse({ success: true });
}

async function handleGetMeetingLink(url, env) {
  const classId = url.searchParams.get('classId');
  const link = await env.FILES_KV.get(`meeting_${classId}`);
  return jsonResponse({ link: link || '' });
}

// ----------------------------------------
// Heartbeat Handler
// ----------------------------------------
async function handleHeartbeat(request, env) {
  const { username, classId, role } = await request.json();
  const now = Date.now();

  // پاک کردن کاربران آفلاین
  await env.DB
    .prepare('DELETE FROM online_users WHERE lastSeen < ?')
    .bind(now - CONFIG.HEARTBEAT_INTERVAL)
    .run();

  // ثبت/به‌روزرسانی کاربر فعلی
  await env.DB
    .prepare('INSERT OR REPLACE INTO online_users (username, classId, lastSeen, role) VALUES (?, ?, ?, ?)')
    .bind(username, classId, now, role)
    .run();

  // دریافت لیست افراد آنلاین
  const users = await env.DB
    .prepare('SELECT username, role FROM online_users WHERE classId = ?')
    .bind(classId)
    .all();

  return jsonResponse({ onlineUsers: users.results });
}

// ----------------------------------------
// Messages Handlers
// ----------------------------------------
async function handleGetMessages(url, env) {
  const classId = url.searchParams.get('classId');
  const afterId = parseInt(url.searchParams.get('afterId') || '0', 10);

  const msgs = await env.DB
    .prepare('SELECT * FROM messages WHERE classId = ? AND id > ? ORDER BY id ASC')
    .bind(classId, afterId)
    .all();

  return jsonResponse(msgs.results);
}

async function handleSendMessage(request, env) {
  const { classId, username, text, isMedia } = await request.json();
  const time = new Date().toLocaleTimeString('fa-IR');

  // Sanitization پایه
  let safeText = escapeHtml(text);

  // برای media، تگ‌های مجاز را برگردانیم
  if (isMedia) {
    safeText = unescapeMediaTags(safeText);
  }

  await env.DB
    .prepare('INSERT INTO messages (classId, user, text, time) VALUES (?, ?, ?, ?)')
    .bind(classId, username, safeText, time)
    .run();

  return jsonResponse({ success: true });
}

// ----------------------------------------
// Whiteboard Handlers
// ----------------------------------------
async function handleGetWhiteboard(url, env) {
  const classId = url.searchParams.get('classId');
  const wb = await env.DB
    .prepare('SELECT data FROM whiteboard WHERE classId = ?')
    .bind(classId)
    .first();

  return jsonResponse({ data: wb?.data || '' });
}

async function handleUpdateWhiteboard(request, env) {
  const { classId, data } = await request.json();
  await env.DB
    .prepare('INSERT OR REPLACE INTO whiteboard (classId, data) VALUES (?, ?)')
    .bind(classId, data)
    .run();

  return jsonResponse({ success: true });
}

// ----------------------------------------
// توابع کمکی امنیتی
// ----------------------------------------
function escapeHtml(text) {
  return text
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

const ALLOWED_TAGS = [
  'img', 'div', 'span', 'a', 'strong', 'br'
];

function unescapeMediaTags(safeText) {
  let result = safeText;
  for (const tag of ALLOWED_TAGS) {
    const openTag = `&lt;${tag} `;
    const closeTag = `&lt;/${tag}&gt;`;
    result = result.replace(new RegExp(openTag, 'g'), `<${tag} `);
    result = result.replace(new RegExp(closeTag, 'g'), `</${tag}>`);
  }
  // Handle self-closing tags
  result = result.replace(/&lt;br&gt;/g, '<br>');
  return result;
}

// ============================================
// صفحه ورود
// ============================================
function getLoginHTML() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>ورود به کلاس مجازی</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="${CONFIG.THEME_COLOR}">
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: Tahoma, sans-serif;
      background: ${CONFIG.THEME_COLOR};
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
      margin: 0;
      color: white;
    }
    .box {
      background: #334155;
      padding: 30px;
      border-radius: 10px;
      width: 350px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }
    h2 { text-align: center; margin-top: 0; }
    input {
      width: 100%;
      padding: 12px;
      margin: 10px 0;
      border: none;
      border-radius: 8px;
      box-sizing: border-box;
      background: #475569;
      color: white;
      font-size: 14px;
    }
    input::placeholder { color: #94a3b8; }
    input:read-only {
      background: #374151;
      color: #94a3b8;
      cursor: not-allowed;
    }
    button {
      width: 100%;
      padding: 14px;
      background: #3b82f6;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: bold;
      font-size: 16px;
      margin-top: 10px;
      transition: background 0.2s;
    }
    button:hover { background: #2563eb; }
    .hint {
      font-size: 12px;
      color: #94a3b8;
      text-align: center;
      margin-top: 20px;
    }
    .error { color: #f87171; font-size: 13px; margin-top: 10px; text-align: center; }
  </style>
</head>
<body>
  <div class="box">
    <h2>🎓 ورود به کلاس</h2>
    <input type="text" id="username" placeholder="نام و نام‌خانوادگی">
    <input type="text" id="classId" placeholder="شناسه کلاس (مثلاً: math-101)">
    <input type="password" id="password" placeholder="رمز عبور کلاس (فقط برای معلم)">
    <button onclick="login()">ورود به کلاس</button>
    <div id="error" class="error" style="display:none;"></div>
    <div class="hint">اگر با لینک دعوت وارد شده‌اید، فقط نام خود را بنویسید.</div>
  </div>

  <script>
    // ثبت Service Worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }

    // پر کردن شناسه کلاس از URL
    window.onload = function() {
      const urlParams = new URLSearchParams(window.location.search);
      const classIdFromUrl = urlParams.get('classId');

      if (classIdFromUrl) {
        const classIdInput = document.getElementById('classId');
        classIdInput.value = classIdFromUrl;
        classIdInput.readOnly = true;
        document.getElementById('password').style.display = 'none';
      }
    };

    async function login() {
      const username = document.getElementById('username').value.trim();
      const classId = document.getElementById('classId').value.trim();
      const password = document.getElementById('password').value;
      const errorDiv = document.getElementById('error');

      errorDiv.style.display = 'none';

      if (!username || !classId) {
        errorDiv.textContent = 'لطفاً نام و شناسه کلاس را وارد کنید';
        errorDiv.style.display = 'block';
        return;
      }

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, classId, password })
        });

        const data = await response.json();

        if (data.error) {
          errorDiv.textContent = data.error;
          errorDiv.style.display = 'block';
          return;
        }

        // ذخیره در localStorage
        localStorage.setItem('user', data.username);
        localStorage.setItem('classId', data.classId);
        localStorage.setItem('role', data.role);

        window.location.href = '/class';
      } catch (err) {
        errorDiv.textContent = 'خطا در اتصال به سرور';
        errorDiv.style.display = 'block';
      }
    }
  </script>
</body>
</html>`;
}

// ============================================
// صفحه کلاس
// ============================================
function getClassHTML() {
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <title>کلاس مجازی</title>
  <link rel="manifest" href="/manifest.json">
  <meta name="theme-color" content="${CONFIG.THEME_COLOR}">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
    html, body {
      height: 100%;
      height: 100dvh; /* Dynamic viewport height for mobile */
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Tahoma, sans-serif;
      background: #efe6dc;
    }

    /* Safe area برای موبایل */
    body {
      padding-top: env(safe-area-inset-top);
      padding-bottom: env(safe-area-inset-bottom);
      padding-left: env(safe-area-inset-left);
      padding-right: env(safe-area-inset-right);
    }

    /* هدر - استایل واتساپ */
    .header {
      background: ${CONFIG.THEME_COLOR};
      color: white;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      position: sticky;
      top: 0;
      z-index: 100;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .header-info { display: flex; align-items: center; gap: 12px; }
    .header-info > div:first-child { font-weight: 600; font-size: 16px; }
    .header .role {
      font-size: 11px;
      background: rgba(255,255,255,0.2);
      padding: 3px 8px;
      border-radius: 12px;
    }
    .header-actions { display: flex; gap: 8px; }
    .btn-header {
      border: none;
      padding: 8px 14px;
      border-radius: 20px;
      cursor: pointer;
      font-weight: 500;
      font-size: 13px;
      transition: all 0.2s;
    }
    .btn-logout { background: rgba(255,255,255,0.15); color: white; }
    .btn-clear { background: #f59e0b; color: white; }
    .btn-meeting {
      background: #8b5cf6;
      color: white;
      text-decoration: none;
      display: none;
      border-radius: 20px;
      padding: 8px 14px;
      font-size: 13px;
    }
    .btn-header:active { transform: scale(0.95); }

    /* باکس دعوت - واتساپ استایل */
    .invite-box {
      background: #00a884;
      color: white;
      padding: 12px 16px;
      display: none;
      align-items: center;
      gap: 10px;
      font-size: 13px;
    }
    .invite-box input {
      flex: 1;
      min-width: 0;
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      font-size: 13px;
      direction: ltr;
    }
    .invite-box button {
      background: rgba(255,255,255,0.2);
      color: white;
      border: none;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 12px;
      white-space: nowrap;
    }

    /* کانتینر اصلی */
    .main-container { 
      display: flex; 
      flex: 1;
      height: calc(100% - 56px);
      min-height: 0; /* برای flexbox */
    }

    /* سایدبار - مخفی در موبایل */
    .sidebar {
      width: 280px;
      background: white;
      border-left: 1px solid #e0e0e0;
      display: flex;
      flex-direction: column;
    }
    .sidebar-header {
      padding: 16px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      font-weight: 600;
      color: ${CONFIG.THEME_COLOR};
    }
    .sidebar-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }
    .user-item {
      padding: 12px;
      background: #f8f8f8;
      margin-bottom: 6px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      font-size: 14px;
      transition: background 0.2s;
    }
    .user-item:active { background: #e8e8e8; }
    .user-item .dot {
      width: 10px;
      height: 10px;
      background: #00a884;
      border-radius: 50%;
      margin-left: 12px;
      animation: pulse 2s infinite;
    }
    .user-item.teacher {
      background: #e8f5e9;
      font-weight: 500;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    /* چت - واتساپ استایل */
    .chat-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #efe6dc;
    }
    .chat-box {
      flex: 1;
      padding: 10px 8px;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    
    /* پیام‌ها - واتساپ */
    .message {
      background: white;
      padding: 8px 10px;
      border-radius: 8px;
      max-width: 85%;
      align-self: flex-start;
      box-shadow: 0 1px 1px rgba(0,0,0,0.1);
      position: relative;
    }
    .message.self {
      align-self: flex-end;
      background: #dcf8c6;
    }
    .message.other {
      align-self: flex-start;
      border-top-left-radius: 0;
    }
    
    /* نام فرستنده */
    .msg-sender {
      font-weight: 600;
      font-size: 13px;
      color: #00a884;
      margin-bottom: 4px;
    }
    .message.self .msg-sender { display: none; }
    
    .msg-content {
      font-size: 14px;
      line-height: 1.5;
      color: #111;
      word-wrap: break-word;
    }
    
    .msg-footer {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-top: 4px;
      gap: 6px;
    }
    .message .time {
      font-size: 11px;
      color: #999;
    }
    .del-btn {
      background: none;
      border: none;
      color: #999;
      cursor: pointer;
      font-size: 14px;
      padding: 0;
      display: none;
      line-height: 1;
    }
    .message:hover .del-btn { display: inline; }
    .del-btn:active { color: #ef4444; }
    
    .message a { color: #0088cc; text-decoration: none; word-break: break-all; }
    .message img {
      max-width: 100%;
      border-radius: 6px;
      cursor: pointer;
      display: block;
      margin-top: 6px;
    }

    /* باکس فایل */
    .file-box {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #f5f5f5;
      padding: 10px 12px;
      border-radius: 8px;
      margin-top: 6px;
    }
    .file-icon { font-size: 32px; }
    .file-info { display: flex; flex-direction: column; }
    .file-name { font-size: 13px; font-weight: 500; color: #111; }
    .download-btn {
      display: inline-block;
      padding: 6px 12px;
      background: #00a884;
      color: white;
      text-decoration: none;
      border-radius: 6px;
      font-size: 12px;
      cursor: pointer;
      margin-top: 4px;
    }
    .download-btn:active { background: #008f6f; }

    /* بخش ورودی - واتساپ استایل */
    .input-area {
      display: flex;
      padding: 10px 8px;
      background: #f0f0f0;
      align-items: center;
      gap: 8px;
    }
    .upload-btn {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #00a884;
      color: white;
      border: none;
      font-size: 22px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.2s;
    }
    .upload-btn:active { transform: scale(0.9); }
    .upload-spinner {
      display: none;
      font-size: 18px;
    }
    .input-area input[type="text"] {
      flex: 1;
      padding: 12px 16px;
      border: none;
      border-radius: 24px;
      font-size: 15px;
      background: white;
      outline: none;
    }
    .send-btn {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #00a884;
      color: white;
      border: none;
      font-size: 20px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: transform 0.2s;
    }
    .send-btn:active { transform: scale(0.9); }

    /* تخته سفید */
    .whiteboard-container {
      width: 320px;
      background: white;
      display: flex;
      flex-direction: column;
      border-right: 1px solid #e0e0e0;
    }
    .whiteboard-header {
      padding: 14px;
      background: #f5f5f5;
      border-bottom: 1px solid #e0e0e0;
      text-align: center;
      font-weight: 600;
      font-size: 14px;
      color: ${CONFIG.THEME_COLOR};
    }
    canvas { flex: 1; cursor: crosshair; }

    /* ============================================
       ریسپانسیو - موبایل (کمتر از 768px)
       ============================================ */
    @media (max-width: 768px) {
      /* هدر فشرده */
      .header {
        padding: 10px 12px;
      }
      .header-info {
        gap: 8px;
      }
      .header-info > div:first-child {
        font-size: 14px;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .header .role {
        font-size: 10px;
        padding: 2px 6px;
      }
      .header-actions {
        gap: 4px;
      }
      .btn-header {
        padding: 6px 8px;
        font-size: 11px;
        border-radius: 16px;
      }
      .btn-meeting { display: none !important; } /* مخفی کردن دکمه جلسه در موبایل */

      /* باکس دعوت */
      .invite-box {
        padding: 10px 12px;
        font-size: 12px;
      }
      .invite-box input {
        padding: 6px 10px;
        font-size: 11px;
      }
      .invite-box button {
        padding: 6px 10px;
        font-size: 11px;
      }

      /* مخفی کردن سایدبار و تخته سفید */
      .sidebar, .whiteboard-container {
        display: none !important;
      }

      /* چت تمام صفحه */
      .chat-area {
        width: 100%;
      }
      
      .chat-box {
        padding: 8px;
        gap: 6px;
        background: #ece5dd; /* پس‌زمینه واتساپ */
      }

      /* پیام‌ها */
      .message {
        max-width: 88%;
        padding: 8px 10px;
        border-radius: 8px;
        font-size: 14px;
        box-shadow: 0 1px 0.5px rgba(11,20,26,0.13);
      }
      .message.self {
        background: #dcf8c6;
        border-top-right-radius: 0;
      }
      .message.other {
        background: #ffffff;
        border-top-left-radius: 0;
      }

      .msg-sender {
        font-size: 11px;
        margin-bottom: 2px;
      }
      .msg-content {
        font-size: 14px;
        line-height: 1.4;
      }
      .msg-footer {
        margin-top: 2px;
      }
      .message .time {
        font-size: 10px;
        color: #999;
      }

      /* فایل‌ها */
      .file-box {
        padding: 8px;
        gap: 8px;
      }
      .file-icon { font-size: 28px; }
      .file-name { font-size: 12px; }
      .download-btn {
        padding: 4px 8px;
        font-size: 11px;
      }

      /* بخش ورودی */
      .input-area {
        padding: 8px;
        background: #f0f0f0;
        gap: 6px;
      }
      .upload-btn, .send-btn {
        width: 44px;
        height: 44px;
        min-width: 44px;
      }
      .upload-btn {
        font-size: 20px;
      }
      .send-btn {
        font-size: 18px;
      }
      .input-area input[type="text"] {
        padding: 10px 14px;
        font-size: 15px;
        border-radius: 22px;
      }

      /* Snackbar */
      .snackbar {
        bottom: 70px;
        padding: 10px 20px;
        font-size: 13px;
      }
    }

    /* ============================================
       تبلت (769px تا 1024px)
       ============================================ */
    @media (min-width: 769px) and (max-width: 1024px) {
      .sidebar { width: 220px; }
      .whiteboard-container { width: 280px; }
      .message { max-width: 75%; }
    }

    /* ============================================
       دسکتاپ (بیشتر از 1024px)
       ============================================ */
    @media (min-width: 1025px) {
      .main-container {
        max-width: 1400px;
        margin: 0 auto;
      }
      .message { max-width: 65%; }
    }

    /* Snackbar */
    .snackbar {
      position: fixed;
      bottom: 80px;
      left: 50%;
      transform: translateX(-50%);
      background: #323232;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      font-size: 14px;
      z-index: 1000;
      animation: slideUp 0.3s ease;
    }
    @keyframes slideUp {
      from { bottom: -50px; opacity: 0; }
      to { bottom: 80px; opacity: 1; }
    }
  </style>
</head>
<body>
  <!-- هدر - واتساپ استایل -->
  <div class="header">
    <div class="header-info">
      <div><span id="className"></span></div>
      <div id="myRole" class="role"></div>
    </div>
    <div class="header-actions">
      <a id="meetingBtn" class="btn-meeting" href="#" target="_blank">🎙️</a>
      <button id="clearBtn" class="btn-header btn-clear" style="display:none;" onclick="clearClass()">🗑️</button>
      <button class="btn-header btn-logout" onclick="logout()">🚪</button>
    </div>
  </div>

  <!-- باکس دعوت -->
  <div class="invite-box" id="inviteBox">
    <input type="text" id="inviteLink" readonly placeholder="لینک کلاس">
    <button onclick="copyLink()">📋</button>
    <input type="text" id="meetingLinkInput" placeholder="لینک جلسه">
    <button onclick="saveMeetingLink()">✓</button>
  </div>

  <!-- محتوای اصلی -->
  <div class="main-container">
    <!-- سایدبار -->
    <div class="sidebar">
      <div class="sidebar-header">👥 آنلاین</div>
      <div class="sidebar-content" id="onlineList"></div>
    </div>

    <!-- چت -->
    <div class="chat-area">
      <div class="chat-box" id="chatBox"></div>
      <div class="input-area">
        <input type="file" id="fileInput" style="display:none" accept="image/*,.pdf,.doc,.docx,.zip,.rar" onchange="handleFileUpload()">
        <button class="upload-btn" onclick="document.getElementById('fileInput').click()">
          📎
          <div id="uploadSpinner" class="upload-spinner">⏳</div>
        </button>
        <input type="text" id="msgInput" placeholder="پیام..." onkeypress="if(event.key==='Enter') sendMessage()">
        <button class="send-btn" onclick="sendMessage()">➤</button>
      </div>
    </div>

    <!-- تخته سفید -->
    <div class="whiteboard-container">
      <div class="whiteboard-header">✏️ تخته سفید</div>
      <canvas id="whiteboard"></canvas>
    </div>
  </div>

  <script>
    // متغیرهای سراسری
    const username = localStorage.getItem('user');
    const classId = localStorage.getItem('classId');
    const role = localStorage.getItem('role');
    let lastMessageId = 0;

    // ریدایرکت اگر لاگین نکرده
    if (!username || !classId) {
      window.location.href = '/login';
    }

    // تنظیمات اولیه UI
    document.getElementById('className').innerText = classId;
    document.getElementById('myRole').innerText = role === 'teacher' ? 'معلم 👨‍🏫' : 'دانش‌آموز 📚';

    // تنظیمات مخصوص معلم
    if (role === 'teacher') {
      document.getElementById('inviteBox').style.display = 'flex';
      document.getElementById('clearBtn').style.display = 'inline-block';

      const baseUrl = window.location.origin + '/login';
      document.getElementById('inviteLink').value = baseUrl + '?classId=' + encodeURIComponent(classId);
    }

    // بررسی لینک جلسه
    checkMeetingLink();

    async function checkMeetingLink() {
      try {
        const res = await fetch('/api/get-meeting-link?classId=' + classId);
        const data = await res.json();
        const btn = document.getElementById('meetingBtn');

        if (data.link) {
          btn.href = data.link;
          btn.style.display = 'inline-block';
          if (role === 'teacher') {
            document.getElementById('meetingLinkInput').value = data.link;
          }
        }
      } catch (e) {
        console.error('خطا در بررسی لینک جلسه:', e);
      }
    }

    async function saveMeetingLink() {
      const link = document.getElementById('meetingLinkInput').value.trim();
      if (!link) {
        showSnackbar('لطفاً لینک جلسه را وارد کنید');
        return;
      }
      await fetch('/api/set-meeting-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, link })
      });
      showSnackbar('✅ لینک ذخیره شد');
      checkMeetingLink();
    }

    function copyLink() {
      const copyText = document.getElementById('inviteLink');
      copyText.select();
      document.execCommand('copy');
      showSnackbar('📋 لینک کپی شد');
    }

    async function logout() {
      await fetch('/api/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, classId })
      });
      localStorage.clear();
      window.location.href = '/login';
    }

    async function clearClass() {
      if (!confirm('⚠️ آیا مطمئن هستید؟')) return;
      await fetch('/api/clear-class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, role })
      });
      lastMessageId = 0;
      document.getElementById('chatBox').innerHTML = '';
      fetchWhiteboard();
      showSnackbar('✅ کلاس پاک شد');
    }

    async function deleteMessage(id) {
      await fetch('/api/delete-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, role })
      });
      document.getElementById('msg-' + id)?.remove();
    }

    function showSnackbar(message) {
      const existing = document.querySelector('.snackbar');
      if (existing) existing.remove();
      const snack = document.createElement('div');
      snack.className = 'snackbar';
      snack.textContent = message;
      document.body.appendChild(snack);
      setTimeout(() => snack.remove(), 2500);
    }

    // ----------------------------------------
    // آپلود فایل
    // ----------------------------------------
    async function handleFileUpload() {
      const fileInput = document.getElementById('fileInput');
      if (!fileInput.files?.length) return;

      const file = fileInput.files[0];
      const spinner = document.getElementById('uploadSpinner');
      spinner.style.display = 'flex';

      try {
        if (file.type.startsWith('image/')) {
          await uploadImage(file);
        } else {
          await uploadFile(file);
        }
      } catch (e) {
        showSnackbar('❌ خطا در ارسال');
      } finally {
        spinner.style.display = 'none';
        fileInput.value = '';
      }
    }

    async function uploadImage(file) {
      const img = await loadImage(file);
      const canvas = document.createElement('canvas');

      let { width, height } = img;
      if (width > ${CONFIG.MAX_IMAGE_WIDTH}) {
        height = height * (${CONFIG.MAX_IMAGE_WIDTH} / width);
        width = ${CONFIG.MAX_IMAGE_WIDTH};
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      const base64String = canvas.toDataURL('image/jpeg', ${CONFIG.IMAGE_QUALITY});

      const chatContent = '<img src="' + base64String + '" onclick="window.open(this.src)">';
      await sendChatMessage(chatContent, true);
    }

    async function uploadFile(file) {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('classId', classId);

      const res = await fetch('/api/upload-file', { method: 'POST', body: formData });
      const data = await res.json();

      if (!data.success) {
        showSnackbar(data.error || '❌ خطا در آپلود');
        return;
      }

      const icon = getFileIcon(data.type);
      const chatContent = '<div class="file-box"><div class="file-icon">' + icon + '</div><div class="file-info"><span class="file-name">' + data.name + '</span><a href="' + data.url + '" class="download-btn" target="_blank">⬇️ دانلود</a></div></div>';
      await sendChatMessage(chatContent, true);
    }

    function loadImage(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = e.target.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
    }

    function getFileIcon(mimeType) {
      if (mimeType.includes('pdf')) return '📕';
      if (mimeType.includes('zip') || mimeType.includes('rar')) return '🗜️';
      return '📄';
    }

    async function sendChatMessage(text, isMedia = false) {
      await fetch('/api/send-message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, username, text, isMedia })
      });
    }

    // ----------------------------------------
    // پیام‌ها
    // ----------------------------------------
    async function fetchMessages() {
      try {
        const res = await fetch('/api/get-messages?classId=' + classId + '&afterId=' + lastMessageId);
        const data = await res.json();
        data.forEach(msg => {
          addMessageToUI(msg);
          lastMessageId = Math.max(lastMessageId, msg.id);
        });
      } catch (e) {
        console.error('خطا در دریافت پیام‌ها:', e);
      }
    }

    function addMessageToUI(msg) {
      const chatBox = document.getElementById('chatBox');
      const div = document.createElement('div');
      const isSelf = msg.user === username;
      div.className = 'message ' + (isSelf ? 'self' : 'other');
      div.id = 'msg-' + msg.id;

      // پردازش لینک‌ها
      let processedText = msg.text;
      const urlRegex = /(https?:\\/\\/[^\\s]+)/g;
      processedText = processedText.replace(urlRegex, (url) => {
        if (url.match(/\\.(jpeg|jpg|gif|png|webp|svg)$/i)) {
          return '📸 <a href="' + url + '" target="_blank">مشاهده عکس</a>';
        }
        return '<a href="' + url + '" target="_blank">' + url + '</a>';
      });

      // HTML واتساپ استایل
      div.innerHTML = 
        '<div class="msg-sender">' + msg.user + '</div>' +
        '<div class="msg-content">' + processedText + '</div>' +
        '<div class="msg-footer">' +
          '<span class="time">' + msg.time + '</span>' +
          '<button class="del-btn" onclick="deleteMessage(' + msg.id + ')">🗑️</button>' +
        '</div>';
      
      chatBox.appendChild(div);
      chatBox.scrollTop = chatBox.scrollHeight;
    }

    async function sendMessage() {
      const input = document.getElementById('msgInput');
      const text = input.value.trim();
      if (!text) return;

      await sendChatMessage(text);
      input.value = '';
      fetchMessages();
    }

    // ----------------------------------------
    // حضور آنلاین
    // ----------------------------------------
    async function heartbeat() {
      try {
        const res = await fetch('/api/heartbeat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, classId, role })
        });
        const data = await res.json();
        renderOnlineUsers(data.onlineUsers || []);
      } catch (e) {
        console.error('خطا در heartbeat:', e);
      }
    }

    function renderOnlineUsers(users) {
      const list = document.getElementById('onlineList');
      list.innerHTML = '';
      users.forEach(u => {
        const div = document.createElement('div');
        div.className = 'user-item' + (u.role === 'teacher' ? ' teacher' : '');
        div.innerHTML = '<div class="dot"></div>' + u.username + (u.role === 'teacher' ? ' 👨‍🏫' : '');
        list.appendChild(div);
      });
    }

    // ----------------------------------------
    // تخته سفید
    // ----------------------------------------
    const canvas = document.getElementById('whiteboard');
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let saveTimeout = null;

    // تنظیم اندازه canvas
    function resizeCanvas() {
      const container = canvas.parentElement;
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '${CONFIG.THEME_COLOR}';

    if (role === 'teacher') {
      // Mouse events
      canvas.addEventListener('mousedown', startDraw);
      canvas.addEventListener('mousemove', draw);
      canvas.addEventListener('mouseup', endDraw);
      canvas.addEventListener('mouseleave', endDraw);

      // Touch events
      canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        startDraw({ offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top });
      });
      canvas.addEventListener('touchmove', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        draw({ offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top });
      });
      canvas.addEventListener('touchend', endDraw);
    }

    function startDraw(e) {
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    }

    function draw(e) {
      if (!drawing) return;
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
    }

    function endDraw() {
      if (!drawing) return;
      drawing = false;
      debounceSaveWhiteboard();
    }

    function debounceSaveWhiteboard() {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveWhiteboard, 500);
    }

    function saveWhiteboard() {
      const data = canvas.toDataURL();
      fetch('/api/update-whiteboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ classId, data })
      });
    }

    async function fetchWhiteboard() {
      try {
        const res = await fetch('/api/get-whiteboard?classId=' + classId);
        const data = await res.json();
        if (data.data) {
          const img = new Image();
          img.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          };
          img.src = data.data;
        }
      } catch (e) {
        console.error('خطا در دریافت تخته سفید:', e);
      }
    }

    // ----------------------------------------
    // شروع Polling
    // ----------------------------------------
    setInterval(fetchMessages, ${CONFIG.POLL_INTERVALS.messages});
    setInterval(heartbeat, ${CONFIG.POLL_INTERVALS.heartbeat});
    setInterval(fetchWhiteboard, ${CONFIG.POLL_INTERVALS.whiteboard});

    // فراخوانی اولیه
    fetchMessages();
    heartbeat();
    fetchWhiteboard();
  </script>
</body>
</html>`;
}
