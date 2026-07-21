/**
 * Simple Router for Cloudflare Workers
 */

export class Router {
  constructor() {
    this.routes = [];
  }

  add(method, pattern, handler) {
    this.routes.push({ method, pattern, handler });
  }

  get(pattern, handler) {
    this.add('GET', pattern, handler);
  }

  post(pattern, handler) {
    this.add('POST', pattern, handler);
  }

  put(pattern, handler) {
    this.add('PUT', pattern, handler);
  }

  delete(pattern, handler) {
    this.add('DELETE', pattern, handler);
  }

  match(method, path) {
    for (const route of this.routes) {
      if (route.method !== method && route.method !== 'ALL') continue;
      
      const match = path.match(route.pattern);
      if (match) {
        return { handler: route.handler, params: match.groups || {} };
      }
    }
    return null;
  }
}

export function router(request, routes) {
  const url = new URL(request.url);
  const method = request.method;
  
  for (const route of routes) {
    if (route.method && route.method !== method) continue;
    
    const pattern = route.pattern.startsWith('^') ? route.pattern : `^${route.pattern}`;
    const regex = new RegExp(pattern);
    const match = url.pathname.match(regex);
    
    if (match) {
      return route.handler(request, match.groups || {});
    }
  }
  
  return null;
}
