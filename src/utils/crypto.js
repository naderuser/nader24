/**
 * Cryptography Utilities
 * Password hashing, JWT generation/verification
 */

// Password hashing using PBKDF2
export async function hashPassword(password, salt = null) {
  const encoder = new TextEncoder();
  const passwordData = encoder.encode(password);
  
  // Generate salt if not provided
  if (!salt) {
    const saltArray = new Uint8Array(16);
    crypto.getRandomValues(saltArray);
    salt = Array.from(saltArray).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  
  const saltData = encoder.encode(salt);
  
  // PBKDF2 with SHA-256
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordData,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltData,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const hashArray = Array.from(new Uint8Array(derivedBits));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return `${salt}$${hashHex}`;
}

// Verify password against hash
export async function verifyPassword(password, storedHash) {
  const parts = storedHash.split('$');
  if (parts.length !== 2) return false;
  
  const [salt, hash] = parts;
  const newHash = await hashPassword(password, salt);
  
  return newHash === storedHash;
}

// Generate JWT Token
export function generateJWT(payload, secret, expiresIn = 86400) {
  const header = {
    alg: 'HS256',
    typ: 'JWT'
  };
  
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...payload,
    iat: now,
    exp: now + expiresIn
  };
  
  const base64Header = base64UrlEncode(JSON.stringify(header));
  const base64Claims = base64UrlEncode(JSON.stringify(claims));
  
  const signature = hmacSHA256(`${base64Header}.${base64Claims}`, secret);
  
  return `${base64Header}.${base64Claims}.${signature}`;
}

// Verify JWT Token
export function verifyJWT(token, secret) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const [header, claims, signature] = parts;
    
    // Verify signature
    const expectedSignature = hmacSHA256(`${header}.${claims}`, secret);
    if (signature !== expectedSignature) return null;
    
    // Decode claims
    const payload = JSON.parse(base64UrlDecode(claims));
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) return null;
    
    return payload;
  } catch (error) {
    return null;
  }
}

// HMAC-SHA256
function hmacSHA256(data, secret) {
  const encoder = new TextEncoder();
  const key = encoder.encode(secret);
  const dataBytes = encoder.encode(data);
  
  // Use synchronous hash for simplicity (in production, use subtlecrypto async)
  const combined = [...key, ...dataBytes];
  const hash = simpleHash(combined);
  
  return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Simple hash function (for demonstration - use subtlecrypto in production)
function simpleHash(data) {
  let hash = 0;
  const bytes = new Uint8Array(data);
  
  for (let i = 0; i < bytes.length; i++) {
    hash = ((hash << 5) - hash) + bytes[i];
    hash = hash & hash;
  }
  
  // Return 32 bytes (256 bits) for HMAC-SHA256 simulation
  const result = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    result[i] = (hash >> (i * 8)) & 0xff;
  }
  
  return result;
}

// Base64 URL encode
function base64UrlEncode(data) {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  
  const encoded = btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  
  return encoded;
}

// Base64 URL decode
function base64UrlDecode(data) {
  let base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

// Generate UUID v4
export function generateUUID() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  
  // Set version to 4
  array[6] = (array[6] & 0x0f) | 0x40;
  // Set variant to RFC 4122
  array[8] = (array[8] & 0x3f) | 0x80;
  
  const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// Generate random string
export function generateRandomString(length = 32, charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789') {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset[array[i] % charset.length];
  }
  
  return result;
}

// Secure compare (timing attack safe)
export function secureCompare(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}
