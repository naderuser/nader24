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
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; font-family: 'Segoe UI', Tahoma, sans-serif; }
    
    body {
      background: #0b141a;
      min-height: 100vh;
      min-height: 100dvh;
      display: flex;
      justify-content: center;
      align-items: flex-start;
      padding: 10px;
    }

    .phone {
      max-width: 430px;
      width: 100%;
      height: calc(100vh - 20px);
      height: calc(100dvh - 20px);
      background: #111b21;
      border-radius: 30px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.8);
      overflow: hidden;
      display: flex;
      flex-direction: column;
      border: 2px solid #2a3942;
    }

    .header {
      background: #1f2c33;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      border-bottom: 1px solid #2a3942;
      flex-shrink: 0;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #2a6f8f;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: bold;
      font-size: 18px;
    }
    .contact-info { flex: 1; color: #d1d7db; }
    .contact-name { font-weight: 600; font-size: 15px; }
    .contact-status { font-size: 12px; color: #8696a0; }
    .header-actions { display: flex; gap: 14px; color: #aebac1; font-size: 18px; }
    .header-btn { background: none; border: none; color: #aebac1; font-size: 18px; cursor: pointer; padding: 4px; }
    .header-btn:active { opacity: 0.7; }

    .chat-body {
      flex: 1;
      padding: 10px 12px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
      background-image: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="%23111b21"/><path d="M10 10 L90 10 L90 90 L10 90 Z" fill="none" stroke="%232a3942" stroke-width="0.5"/></svg>');
      background-size: 28px 28px;
    }
    .chat-body::-webkit-scrollbar { width: 4px; }
    .chat-body::-webkit-scrollbar-track { background: transparent; }
    .chat-body::-webkit-scrollbar-thumb { background: #3b4a54; border-radius: 10px; }

    .date-divider {
      text-align: center;
      font-size: 12px;
      color: #8696a0;
      background: #1f2c33;
      padding: 4px 12px;
      border-radius: 8px;
      align-self: center;
      margin: 8px 0;
    }

    .message {
      max-width: 85%;
      padding: 6px 10px 4px;
      border-radius: 10px;
      font-size: 14px;
      line-height: 1.45;
      word-wrap: break-word;
      animation: fade 0.25s ease;
    }
    @keyframes fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
    
    .message.incoming {
      background: #202c33;
      color: #e9edef;
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .message.outgoing {
      background: #005c4b;
      color: #e9edef;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
    }
    .message .time { font-size: 11px; color: #8696a0; display: block; text-align: left; margin-top: 2px; }
    .message.outgoing .time { color: #7a9c8a; }
    .message .status { font-size: 14px; margin-right: 2px; }
    .message a { color: #53bdeb; text-decoration: none; }
    .message img { max-width: 100%; border-radius: 6px; cursor: pointer; display: block; margin-top: 4px; }

    .file-box {
      display: flex;
      align-items: center;
      gap: 10px;
      background: rgba(255,255,255,0.05);
      padding: 8px 12px;
      border-radius: 8px;
      margin-top: 4px;
    }
    .file-icon { font-size: 28px; }
    .file-info { display: flex; flex-direction: column; }
    .file-name { font-size: 13px; font-weight: 500; }
    .download-btn {
      display: inline-block;
      padding: 4px 10px;
      background: rgba(255,255,255,0.15);
      color: #e9edef;
      text-decoration: none;
      border-radius: 6px;
      font-size: 11px;
      cursor: pointer;
      margin-top: 3px;
    }

    .footer {
      background: #1f2c33;
      padding: 8px 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-top: 1px solid #2a3942;
      flex-shrink: 0;
    }
    .footer-btn { color: #aebac1; font-size: 22px; background: none; border: none; cursor: pointer; padding: 4px 6px; flex-shrink: 0; }
    .footer-btn:active { opacity: 0.7; }
    .input-area { flex: 1; background: #2a3942; border-radius: 22px; padding: 4px 12px; display: flex; align-items: center; min-width: 0; }
    .input-area input { width: 100%; background: transparent; border: none; outline: none; color: #d1d7db; font-size: 14px; padding: 6px 0; }
    .input-area input::placeholder { color: #8696a0; }

    .snackbar {
      position: fixed;
      bottom: 100px;
      left: 50%;
      transform: translateX(-50%);
      background: #1f2c33;
      color: #d1d7db;
      padding: 10px 20px;
      border-radius: 8px;
      font-size: 13px;
      z-index: 1000;
      border: 1px solid #2a3942;
    }

    @media (max-width: 430px) {
      body { padding: 0; }
      .phone { height: 100vh; height: 100dvh; border-radius: 0; border: none; }
      .header { padding: 10px 14px; }
      .contact-name { font-size: 14px; }
      .message { max-width: 88%; }
    }
    @media (min-width: 431px) and (max-width: 768px) {
      .phone { height: calc(100dvh - 20px); border-radius: 24px; }
    }
    @media (min-width: 769px) {
      body { align-items: center; padding: 20px; }
      .phone { max-height: 85vh; border-radius: 24px; }
    }
  </style>
</head>
<body>
  <div class="phone">
    <div class="header">
      <div class="avatar">📚</div>
      <div class="contact-info">
        <div class="contact-name"><span id="className"></span></div>
        <div class="contact-status"><span id="myRole"></span> • آنلاین</div>
      </div>
      <div class="header-actions">
        <button class="header-btn" onclick="logout()" title="خروج">🚪</button>
        <button id="clearBtn" class="header-btn" style="display:none;" onclick="clearClass()" title="پاک کردن">🗑️</button>
      </div>
    </div>

    <div class="chat-body" id="chatBox"></div>

    <div class="footer">
      <button class="footer-btn" onclick="document.getElementById('fileInput').click()">📎</button>
      <input type="file" id="fileInput" style="display:none" accept="image/*,.pdf,.doc,.docx,.zip,.rar" onchange="handleFileUpload()">
      <div class="input-area">
        <input type="text" id="msgInput" placeholder="پیام" onkeypress="if(event.key==='Enter') sendMessage()">
      </div>
      <button class="footer-btn" onclick="sendMessage()">➤</button>
    </div>
  </div>

  <script>
    const username = localStorage.getItem('user');
    const classId = localStorage.getItem('classId');
    const role = localStorage.getItem('role');
    let lastMessageId = 0;

    if (!username || !classId) window.location.href = '/login';

    document.getElementById('className').innerText = classId;
    document.getElementById('myRole').innerText = role === 'teacher' ? 'معلم 👨‍🏫' : 'دانش‌آموز 📚';
    if (role === 'teacher') document.getElementById('clearBtn').style.display = 'block';

    function showSnackbar(msg) {
      const s = document.createElement('div');
      s.className = 'snackbar';
      s.textContent = msg;
      document.body.appendChild(s);
      setTimeout(() => s.remove(), 2500);
    }

    async function logout() {
      await fetch('/api/logout', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({username, classId}) });
      localStorage.clear();
      window.location.href = '/login';
    }

    async function clearClass() {
      if (!confirm('⚠️ پاک شود؟')) return;
      await fetch('/api/clear-class', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({classId, role}) });
      lastMessageId = 0;
      document.getElementById('chatBox').innerHTML = '';
      showSnackbar('✅ پاک شد');
    }

    async function handleFileUpload() {
      const f = document.getElementById('fileInput');
      if (!f.files?.length) return;
      const file = f.files[0];
      try {
        if (file.type.startsWith('image/')) {
          const img = await loadImage(file);
          const c = document.createElement('canvas');
          let w = img.width, h = img.height;
          if (w > 800) { h = h * (800/w); w = 800; }
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0, w, h);
          const b64 = c.toDataURL('image/jpeg', 0.7);
          await sendMsg('<img src="'+b64+'" onclick="window.open(this.src)">', true);
        } else {
          const fd = new FormData();
          fd.append('file', file);
          fd.append('classId', classId);
          const r = await fetch('/api/upload-file', { method: 'POST', body: fd });
          const d = await r.json();
          if (d.success) {
            const ic = d.type.includes('pdf') ? '📕' : d.type.includes('zip') ? '🗜️' : '📄';
            await sendMsg('<div class="file-box"><div class="file-icon">'+ic+'</div><div class="file-info"><span class="file-name">'+d.name+'</span><a href="'+d.url+'" class="download-btn" target="_blank">⬇️ دانلود</a></div></div>', true);
          }
        }
      } catch(e) { showSnackbar('❌ خطا'); }
      f.value = '';
    }

    function loadImage(file) {
      return new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = e => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = e.target.result; };
        r.onerror = rej;
        r.readAsDataURL(file);
      });
    }

    async function sendMsg(text, isMedia = false) {
      await fetch('/api/send-message', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({classId, username, text, isMedia}) });
    }

    async function fetchMessages() {
      try {
        const r = await fetch('/api/get-messages?classId=' + classId + '&afterId=' + lastMessageId);
        const data = await r.json();
        data.forEach(m => { addMsg(m); lastMessageId = Math.max(lastMessageId, m.id); });
      } catch(e) {}
    }

    function addMsg(m) {
      const cb = document.getElementById('chatBox');
      const div = document.createElement('div');
      const isSelf = m.user === username;
      div.className = 'message ' + (isSelf ? 'outgoing' : 'incoming');
      
      let txt = m.text;
      txt = txt.replace(/(https?:\/\/[^\s]+)/g, u => '<a href="'+u+'" target="_blank">'+u+'</a>');
      
      div.innerHTML = txt + '<span class="time">' + m.time + (isSelf ? ' <span class="status">✓</span>' : '') + '</span>';
      cb.appendChild(div);
      cb.scrollTop = cb.scrollHeight;
    }

    async function sendMessage() {
      const i = document.getElementById('msgInput');
      const t = i.value.trim();
      if (!t) return;
      await sendMsg(t);
      i.value = '';
      fetchMessages();
    }

    setInterval(fetchMessages, 2000);
    fetchMessages();
  </script>
</body>
</html>`;
}

