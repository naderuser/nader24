/**
 * Authentication Middleware
 */

import { hashPassword, verifyPassword, generateJWT, verifyJWT } from '../utils/crypto.js';
import { getSetting, addLog } from '../db/init.js';

const SESSION_COOKIE_NAME = 'nadervpn_session';
const SESSION_DURATION = 86400; // 24 hours

export async function withAuth(handler) {
  return async (request, env, ctx) => {
    // Check for session cookie or Authorization header
    const sessionToken = getSessionToken(request);
    const apiKey = getAPIKey(request);
    
    let user = null;
    
    if (sessionToken) {
      user = await verifySession(env, sessionToken);
    } else if (apiKey) {
      user = await verifyAPIKey(env, apiKey);
    }
    
    if (!user) {
      return jsonResponse({ error: 'Unauthorized', message: 'Please login first' }, 401);
    }
    
    // Add user to request context
    request.user = user;
    
    return handler(request, env, ctx);
  };
}

function getSessionToken(request) {
  const cookies = parseCookies(request);
  return cookies[SESSION_COOKIE_NAME];
}

function getAPIKey(request) {
  const authHeader = request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return null;
}

async function verifySession(env, token) {
  try {
    const sessionData = await env.KV.get(`session:${token}`, 'json');
    if (!sessionData) return null;
    
    // Check expiration
    if (sessionData.expires < Date.now()) {
      await env.KV.delete(`session:${token}`);
      return null;
    }
    
    return sessionData.user;
  } catch (error) {
    console.error('Session verification error:', error);
    return null;
  }
}

async function verifyAPIKey(env, key) {
  try {
    const apiKeyData = await env.KV.get(`apikey:${key}`, 'json');
    if (!apiKeyData) return null;
    return { username: 'api', role: 'api', isAPI: true };
  } catch (error) {
    return null;
  }
}

// Login handler
export async function login(env, username, password, ip, userAgent) {
  const adminUsername = await getSetting(env, 'admin_username') || 'admin';
  const adminPasswordHash = await getSetting(env, 'admin_password_hash');
  
  // Check if first login (no password set)
  if (!adminPasswordHash) {
    // Set default password
    const defaultPassword = 'nader0933';
    const hash = await hashPassword(defaultPassword);
    await setSetting(env, 'admin_username', 'admin');
    await setSetting(env, 'admin_password_hash', hash);
    
    // First login check
    if (username === 'admin' && password === defaultPassword) {
      return await createSession(env, 'admin', ip, userAgent);
    }
    return null;
  }
  
  // Verify credentials
  if (username !== adminUsername) return null;
  
  const isValid = await verifyPassword(password, adminPasswordHash);
  if (!isValid) return null;
  
  // Record successful login
  await addLog(env, 'login', username, ip, userAgent, 'Successful login');
  
  return await createSession(env, username, ip, userAgent);
}

// Create session
async function createSession(env, username, ip, userAgent) {
  const sessionToken = generateSessionToken();
  const expires = Date.now() + (SESSION_DURATION * 1000);
  
  const sessionData = {
    user: { username, role: 'admin' },
    ip,
    userAgent,
    created: Date.now(),
    expires
  };
  
  await env.KV.put(`session:${sessionToken}`, JSON.stringify(sessionData), {
    expirationTtl: SESSION_DURATION
  });
  
  return {
    token: sessionToken,
    expires,
    user: { username, role: 'admin' }
  };
}

// Logout handler
export async function logout(env, sessionToken, ip, userAgent) {
  if (sessionToken) {
    await env.KV.delete(`session:${sessionToken}`);
  }
  return true;
}

// Generate session token
function generateSessionToken() {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

// Parse cookies
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
