/**
 * Authentication Middleware
 */

export async function getSession(request, env) {
  const cookies = parseCookies(request);
  const token = cookies['nadervpn_session'];
  
  if (!token) return null;
  
  try {
    const session = await env.KV.get(`session:${token}`, 'json');
    if (!session) return null;
    
    if (session.expires < Date.now()) {
      await env.KV.delete(`session:${token}`);
      return null;
    }
    
    return session;
  } catch (e) {
    return null;
  }
}

export async function verifySession(request, env) {
  return await getSession(request, env);
}

export async function createSession(env, password) {
  const token = generateToken(32);
  const expires = Date.now() + (86400 * 1000); // 24 hours
  
  const session = {
    password,
    created: Date.now(),
    expires
  };
  
  await env.KV.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: 86400
  });
  
  return token;
}

export async function destroySession(env, token) {
  await env.KV.delete(`session:${token}`);
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

function generateToken(length = 32) {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}
