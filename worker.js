/**
 * Cloudflare Worker - Chat Application with KV Storage
 * 
 * Features:
 * - Create chat rooms with unique UUID
 * - Share link to join chat
 * - Messages stored in Cloudflare KV
 */

const APP_NAME = "چت باکس";

const htmlTemplate = (body) => `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${APP_NAME}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-primary: #0a0a0f;
            --bg-secondary: #12121a;
            --bg-tertiary: #1a1a25;
            --border-color: rgba(255,255,255,0.08);
            --text-primary: #ffffff;
            --text-secondary: rgba(255,255,255,0.7);
            --text-muted: rgba(255,255,255,0.4);
            --accent-blue: #3b82f6;
            --accent-purple: #8b5cf6;
            --accent-gradient: linear-gradient(135deg, var(--accent-blue), var(--accent-purple), #ec4899);
            --radius-lg: 24px;
            --radius-md: 16px;
            --radius-sm: 12px;
        }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: 'Vazirmatn', sans-serif;
            background: var(--bg-primary);
            color: var(--text-primary);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        .bg { position: fixed; inset: 0; z-index: 0; background: radial-gradient(circle at 20% 20%, rgba(139,92,246,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(59,130,246,0.1) 0%, transparent 50%); animation: bgMove 15s ease-in-out infinite; }
        @keyframes bgMove { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); } }
        .container { position: relative; z-index: 10; width: 100%; max-width: 480px; padding: 20px; }
        
        /* Landing */
        .landing { text-align: center; animation: fadeIn 0.8s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; } }
        .logo { width: 100px; height: 100px; margin: 0 auto 30px; background: var(--accent-gradient); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 40px; animation: pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); box-shadow: 0 0 40px rgba(139,92,246,0.3); } }
        .landing h1 { font-size: 28px; margin-bottom: 10px; background: var(--accent-gradient); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }
        .landing p { color: var(--text-secondary); margin-bottom: 30px; font-size: 15px; }
        .btn { display: inline-flex; align-items: center; gap: 10px; padding: 16px 36px; background: var(--accent-gradient); border: none; border-radius: var(--radius-md); color: white; font-family: inherit; font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.3s ease; text-decoration: none; }
        .btn:hover { transform: translateY(-3px); box-shadow: 0 15px 40px rgba(139,92,246,0.4); }
        .btn svg { width: 20px; height: 20px; }
        .join { margin-top: 25px; }
        .join p { margin-bottom: 12px; color: var(--text-muted); font-size: 13px; }
        .input-group { display: flex; gap: 10px; }
        .input-group input { flex: 1; padding: 14px 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); color: var(--text-primary); font-family: inherit; font-size: 14px; outline: none; }
        .input-group input::placeholder { color: var(--text-muted); }
        .input-group input:focus { border-color: var(--accent-purple); }
        .input-group .btn { padding: 14px 20px; font-size: 14px; }
        
        /* Chat */
        .chat-container { width: 100%; max-width: 480px; height: 90vh; max-height: 800px; background: rgba(255,255,255,0.03); backdrop-filter: blur(40px); border: 1px solid var(--border-color); border-radius: var(--radius-lg); display: flex; flex-direction: column; overflow: hidden; animation: slideUp 0.6s ease; }
        @keyframes slideUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; } }
        .chat-header { padding: 18px 20px; background: var(--bg-secondary); border-bottom: 1px solid var(--border-color); display: flex; align-items: center; justify-content: space-between; }
        .room-info h2 { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
        .room-link { font-size: 12px; color: var(--accent-purple); cursor: pointer; transition: color 0.2s; }
        .room-link:hover { color: var(--accent-blue); }
        .icon-btn { width: 40px; height: 40px; border: none; background: var(--bg-tertiary); border-radius: var(--radius-sm); color: var(--text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .icon-btn:hover { background: var(--bg-primary); color: var(--text-primary); }
        .icon-btn svg { width: 18px; height: 18px; }
        
        .messages-area { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
        .messages-area::-webkit-scrollbar { width: 4px; }
        .messages-area::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
        
        .message { display: flex; gap: 10px; max-width: 85%; animation: msgIn 0.3s ease; }
        @keyframes msgIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; } }
        .message.sent { align-self: flex-start; }
        .message.received { align-self: flex-end; flex-direction: row-reverse; }
        .msg-avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent-gradient); display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; flex-shrink: 0; }
        .msg-content { display: flex; flex-direction: column; gap: 2px; }
        .msg-name { font-size: 11px; color: var(--text-muted); font-weight: 500; }
        .message.sent .msg-name { margin-right: 42px; }
        .message.received .msg-name { margin-left: 42px; text-align: left; }
        .msg-bubble { padding: 10px 14px; border-radius: var(--radius-md); font-size: 14px; line-height: 1.5; word-break: break-word; }
        .message.sent .msg-bubble { background: var(--accent-gradient); border-bottom-right-radius: 4px; color: white; }
        .message.received .msg-bubble { background: var(--bg-tertiary); border-bottom-left-radius: 4px; }
        .msg-time { font-size: 10px; color: var(--text-muted); }
        .message.sent .msg-time { margin-right: 42px; }
        .message.received .msg-time { margin-left: 42px; text-align: left; }
        
        .empty-state { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
        .empty-icon { width: 70px; height: 70px; background: var(--bg-tertiary); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
        .empty-icon svg { width: 30px; height: 30px; color: var(--accent-purple); }
        .empty-state h3 { font-size: 15px; margin-bottom: 6px; }
        .empty-state p { color: var(--text-muted); font-size: 13px; }
        
        .input-area { padding: 14px 18px; background: var(--bg-secondary); border-top: 1px solid var(--border-color); }
        .input-wrapper { display: flex; gap: 10px; align-items: flex-end; }
        .input-container { flex: 1; }
        .message-input { width: 100%; padding: 12px 16px; background: var(--bg-tertiary); border: 1px solid var(--border-color); border-radius: var(--radius-md); color: var(--text-primary); font-family: inherit; font-size: 14px; resize: none; min-height: 48px; max-height: 100px; outline: none; transition: border-color 0.2s; }
        .message-input::placeholder { color: var(--text-muted); }
        .message-input:focus { border-color: var(--accent-purple); }
        .send-btn { width: 48px; height: 48px; border: none; background: var(--accent-gradient); border-radius: var(--radius-sm); color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; flex-shrink: 0; }
        .send-btn:hover { transform: scale(1.05); box-shadow: 0 8px 25px rgba(139,92,246,0.4); }
        .send-btn svg { width: 18px; height: 18px; }
        
        @media (max-width: 520px) {
            .chat-container { height: 100vh; max-height: none; border-radius: 0; border: none; }
            .input-group { flex-direction: column; }
            .input-group .btn { width: 100%; justify-content: center; }
        }
    </style>
</head>
<body>
    <div class="bg"></div>
    ${body}
    <script>
        function generateUUID() {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
        }
        
        function getUserId() {
            let id = localStorage.getItem('chat_uid');
            if (!id) { id = generateUUID(); localStorage.setItem('chat_uid', id); }
            return id;
        }
        
        function getUsername() {
            let name = localStorage.getItem('chat_name');
            if (!name) {
                const names = ['کاربر', 'مهمان', 'ناشناس', 'کیوی'];
                name = names[Math.floor(Math.random() * names.length)];
                localStorage.setItem('chat_name', name);
            }
            return name;
        }
        
        function copyLink() {
            navigator.clipboard.writeText(window.location.href).then(() => {
                const el = document.querySelector('.room-link');
                el.textContent = 'کپی شد! ✓';
                setTimeout(() => el.textContent = 'کپی لینک', 2000);
            }).catch(() => prompt('لینک:', window.location.href));
        }
        
        function createRoom() {
            window.location.href = '/chat/' + generateUUID();
        }
        
        function joinRoom() {
            let id = document.getElementById('joinInput').value.trim();
            if (id.includes('/chat/')) id = id.split('/chat/').pop();
            if (id.length >= 8) window.location.href = '/chat/' + id;
            else alert('لینک نامعتبر');
        }
        
        let currentRoom = null;
        
        async function initChat(roomId) {
            currentRoom = roomId;
            const userId = getUserId();
            const username = getUsername();
            document.getElementById('roomName').textContent = 'اتاق: ' + roomId.substring(0, 8);
            
            await loadMessages(userId);
            setInterval(() => loadMessages(userId), 3000);
            
            document.getElementById('messageInput').addEventListener('keydown', e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
            });
        }
        
        async function loadMessages(userId) {
            try {
                const res = await fetch('/api/messages/' + currentRoom);
                const data = await res.json();
                renderMessages(data.messages || [], userId);
            } catch (e) { console.log('Loading...'); }
        }
        
        function renderMessages(messages, userId) {
            const container = document.getElementById('messagesArea');
            const empty = document.getElementById('emptyState');
            
            if (messages.length === 0) { empty.style.display = 'flex'; return; }
            empty.style.display = 'none';
            
            const lastId = container.dataset.lastId;
            const newMsgs = lastId ? messages.filter(m => m.id > lastId) : messages.slice(-50);
            
            newMsgs.forEach(msg => {
                const mine = msg.userId === userId;
                const div = document.createElement('div');
                div.className = 'message ' + (mine ? 'sent' : 'received');
                div.innerHTML = '<div class="msg-avatar">' + (mine ? username.charAt(0) : msg.name.charAt(0)) + '</div>' +
                    '<div class="msg-content"><div class="msg-name">' + (mine ? 'شما' : msg.name) + '</div>' +
                    '<div class="msg-bubble">' + escapeHtml(msg.text) + '</div>' +
                    '<div class="msg-time">' + formatTime(msg.timestamp) + '</div></div>';
                container.insertBefore(div, empty);
            });
            
            if (newMsgs.length) {
                container.dataset.lastId = messages[messages.length - 1].id;
                container.scrollTop = container.scrollHeight;
            }
        }
        
        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const text = input.value.trim();
            if (!text) return;
            
            const userId = getUserId();
            const username = getUsername();
            
            try {
                await fetch('/api/messages/' + currentRoom, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, userId, name: username })
                });
                input.value = '';
                await loadMessages(userId);
            } catch (e) { alert('خطا در ارسال'); }
        }
        
        function escapeHtml(t) { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; }
        function formatTime(ts) { return new Date(ts).toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }); }
    </script>
</body>
</html>`;

const landingPage = `<div class="container">
    <div class="landing">
        <div class="logo">💬</div>
        <h1>${APP_NAME}</h1>
        <p>چت گروهی بدون ثبت‌نام</p>
        <button class="btn" onclick="createRoom()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/></svg>
            ایجاد چت جدید
        </button>
        <div class="join">
            <p>یا لینک چت را وارد کنید:</p>
            <div class="input-group">
                <input type="text" id="joinInput" placeholder="لینک یا شناسه چت...">
                <button class="btn" onclick="joinRoom()">ورود</button>
            </div>
        </div>
    </div>
</div>`;

const chatPage = (roomId) => `<div class="container">
    <div class="chat-container">
        <header class="chat-header">
            <div>
                <h2 id="roomName">اتاق چت</h2>
                <div class="room-link" onclick="copyLink()">کپی لینک</div>
            </div>
            <button class="icon-btn" onclick="copyLink()" title="کپی">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </button>
        </header>
        <div class="messages-area" id="messagesArea">
            <div class="empty-state" id="emptyState">
                <div class="empty-icon"><svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/></svg></div>
                <h3>هنوز پیامی نیست</h3>
                <p>اولین پیام را شما بفرستید!</p>
            </div>
        </div>
        <div class="input-area">
            <div class="input-wrapper">
                <div class="input-container">
                    <textarea class="message-input" id="messageInput" placeholder="پیام بنویسید..." rows="1"></textarea>
                </div>
                <button class="send-btn" onclick="sendMessage()">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
                </button>
            </div>
        </div>
    </div>
</div><script>initChat('${roomId}');</script>`;

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        
        // API Routes
        if (path.startsWith('/api/messages/')) {
            const roomId = path.split('/api/messages/')[1];
            return handleMessages(request, env, roomId);
        }
        
        // Chat room page
        if (path.startsWith('/chat/')) {
            const roomId = path.split('/chat/')[1];
            if (roomId && roomId.length >= 8) {
                return new Response(chatPage(roomId), {
                    headers: { 'Content-Type': 'text/html; charset=utf-8' },
                });
            }
        }
        
        // Landing page
        return new Response(htmlTemplate(landingPage), {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
};

async function handleMessages(request, env, roomId) {
    const kv = env.CHAT_KV;
    
    if (request.method === 'GET') {
        const data = await kv.get(roomId, 'json');
        return new Response(JSON.stringify({ messages: data || [] }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    if (request.method === 'POST') {
        const body = await request.json();
        const { text, userId, name } = body;
        
        if (!text || !userId) {
            return new Response(JSON.stringify({ error: 'Invalid' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }
        
        let messages = (await kv.get(roomId, 'json')) || [];
        
        messages.push({
            id: Date.now(),
            text: text.substring(0, 1000),
            userId,
            name: name || 'ناشناس',
            timestamp: new Date().toISOString()
        });
        
        if (messages.length > 200) messages = messages.slice(-200);
        
        await kv.put(roomId, JSON.stringify(messages), { expirationTtl: 86400 * 7 });
        
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
        });
    }
    
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
    });
}
