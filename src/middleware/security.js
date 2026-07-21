/**
 * Security Middleware
 * Includes rate limiting, security headers, CSRF protection
 */

import { getSetting } from '../db/init.js';

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION = 900; // 15 minutes
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per minute

// Security headers
export function securityHeaders(request) {
  const response = new Response(null, {
    status: 200,
    headers: {
      'X-Frame-Options': 'SAMEORIGIN',
      'X-Content-Type-Options': 'nosniff',
      'X-XSS-Protection': '1; mode=block',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self' data:",
        "connect-src 'self'",
        "frame-ancestors 'none'"
      ].join('; ')
    }
  });
  return response;
}

// CORS handler
export function cors(request) {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
      'Access-Control-Max-Age': '86400',
      'Access-Control-Allow-Credentials': 'true'
    }
  });
}

// Rate limiter for general requests
export async function rateLimiter(request, env) {
  const ip = getClientIP(request);
  const key = `ratelimit:${ip}:${Math.floor(Date.now() / 1000 / RATE_LIMIT_WINDOW)}`;
  
  try {
    const current = await env.KV.get(key, 'json') || { count: 0 };
    current.count++;
    
    if (current.count > RATE_LIMIT_MAX) {
      return jsonResponse({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: RATE_LIMIT_WINDOW
      }, 429);
    }
    
    await env.KV.put(key, JSON.stringify(current), { expirationTtl: RATE_LIMIT_WINDOW * 2 });
  } catch (error) {
    console.error('Rate limiter error:', error);
  }
  
  return null;
}

// Login rate limiter (stricter)
export async function loginRateLimiter(request, env) {
  const ip = getClientIP(request);
  const key = `login_attempts:${ip}`;
  
  try {
    const attempts = await env.KV.get(key, 'json') || { count: 0, lockedUntil: 0 };
    
    // Check if locked out
    if (attempts.lockedUntil > Date.now()) {
      const remaining = Math.ceil((attempts.lockedUntil - Date.now()) / 1000);
      return {
        blocked: true,
        message: `Account locked. Try again in ${remaining} seconds.`,
        retryAfter: remaining
      };
    }
    
    return { blocked: false };
  } catch (error) {
    console.error('Login rate limiter error:', error);
    return { blocked: false };
  }
}

// Record failed login attempt
export async function recordFailedLogin(request, env) {
  const ip = getClientIP(request);
  const key = `login_attempts:${ip}`;
  
  try {
    const attempts = await env.KV.get(key, 'json') || { count: 0, lockedUntil: 0 };
    attempts.count++;
    
    // Lock out if too many attempts
    if (attempts.count >= MAX_LOGIN_ATTEMPTS) {
      attempts.lockedUntil = Date.now() + (LOCKOUT_DURATION * 1000);
      attempts.count = 0;
    }
    
    await env.KV.put(key, JSON.stringify(attempts), { expirationTtl: LOCKOUT_DURATION * 2 });
    
    return attempts.count >= MAX_LOGIN_ATTEMPTS;
  } catch (error) {
    console.error('Record failed login error:', error);
    return false;
  }
}

// Reset login attempts on successful login
export async function resetLoginAttempts(request, env) {
  const ip = getClientIP(request);
  const key = `login_attempts:${ip}`;
  await env.KV.delete(key);
}

// Get client IP from request
export function getClientIP(request) {
  const forwarded = request.headers.get('CF-Connecting-IP');
  if (forwarded) return forwarded;
  
  const xForwarded = request.headers.get('X-Forwarded-For');
  if (xForwarded) return xForwarded.split(',')[0].trim();
  
  const xReal = request.headers.get('X-Real-IP');
  if (xReal) return xReal;
  
  return 'unknown';
}

// CSRF Token generation and validation
export function generateCSRFToken(secret) {
  const timestamp = Date.now();
  const data = `${timestamp}-${secret}`;
  const encoder = new TextEncoder();
  const hash = crypto.subtle.digestSync('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return `${timestamp}.${hashHex.substring(0, 32)}`;
}

export async function validateCSRFToken(token, secret, maxAge = 3600) {
  if (!token || !secret) return false;
  
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  
  const [timestamp, hash] = parts;
  const timestampNum = parseInt(timestamp);
  
  // Check timestamp
  if (isNaN(timestampNum)) return false;
  if (Date.now() - timestampNum > maxAge * 1000) return false;
  
  // Verify hash
  const data = `${timestamp}-${secret}`;
  const encoder = new TextEncoder();
  const expectedHash = crypto.subtle.digestSync('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(expectedHash));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return hash.substring(0, 32) === hashHex.substring(0, 32);
}

// Input sanitization
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  return input
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim();
}

// SQL injection prevention (already handled by D1 parameterized queries)
// This is for additional validation
export function validateUsername(username) {
  return /^[a-zA-Z0-9_-]{3,32}$/.test(username);
}

export function validateUUID(uuid) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);
}

export function validatePort(port) {
  const num = parseInt(port);
  return !isNaN(num) && num >= 1 && num <= 65535;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
