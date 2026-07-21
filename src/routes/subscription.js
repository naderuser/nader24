/**
 * Subscription Routes
 * Generates subscription links for various VPN clients
 */

import { getUserByToken, getEnabledNodes, getAllSettings } from '../db/init.js';
import { addLog } from '../db/init.js';
import { generateUUID } from '../utils/crypto.js';

export async function handleSubscription(request, env, ctx) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const token = pathParts[2]; // /sub/:token
  
  if (!token) {
    return new Response('Invalid subscription link', { status: 400 });
  }
  
  try {
    // Get user by subscription token
    const user = await getUserByToken(env, token);
    
    if (!user) {
      return new Response('Subscription not found', { status: 404 });
    }
    
    // Check if user is enabled
    if (!user.enable) {
      return new Response('Subscription disabled', { status: 403 });
    }
    
    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (user.expire_at > 0 && user.expire_at < now) {
      return new Response('Subscription expired', { status: 403 });
    }
    
    // Get enabled nodes
    const nodes = await getEnabledNodes(env);
    
    // Generate subscription content
    const format = url.searchParams.get('format') || '';
    const content = await generateSubscriptionContent(user, nodes, format, env);
    
    // Log subscription access
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    await addLog(env, 'subscription', user.uuid, ip, request.headers.get('User-Agent') || '', 'Subscription accessed');
    
    // Determine content type based on format
    let contentType = 'text/plain; charset=utf-8';
    let filename = 'subscription.txt';
    
    if (format === 'clash-meta' || format === 'clash') {
      contentType = 'text/yaml; charset=utf-8';
      filename = 'clash-meta.yaml';
    } else if (format === 'singbox') {
      contentType = 'application/json; charset=utf-8';
      filename = 'singbox.json';
    } else if (format === 'json') {
      contentType = 'application/json; charset=utf-8';
      filename = 'subscription.json';
    }
    
    return new Response(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Profile-Title': encodeURIComponent(`NaderVPN - ${user.username}`),
        'Profile-Update-Interval': '6',
        'Subscription-Userinfo': encodeURIComponent(
          `upload=${user.upload}; download=${user.download}; total=${user.traffic_limit}; expire=${user.expire_at}`
        )
      }
    });
    
  } catch (error) {
    console.error('Subscription error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}

async function generateSubscriptionContent(user, nodes, format, env) {
  const settings = await getAllSettings(env);
  const appName = settings.app_name || 'NaderVPN';
  
  if (format === 'clash-meta' || format === 'clash') {
    return generateClashMeta(user, nodes, appName);
  } else if (format === 'singbox') {
    return generateSingBox(user, nodes, appName);
  } else if (format === 'json') {
    return generateJSON(user, nodes);
  } else {
    // Default: generate all protocols
    return generateAllProtocols(user, nodes, env);
  }
}

// Generate Clash Meta configuration
function generateClashMeta(user, nodes, appName) {
  const proxies = [];
  const proxyGroups = [];
  
  for (const node of nodes) {
    const proxy = generateClashProxy(user, node);
    if (proxy) {
      proxies.push(proxy);
      proxyGroups.push(node.name);
    }
  }
  
  return `# Clash Meta Configuration
# NaderVPN Subscription
# User: ${user.username}
# Expires: ${user.expire_at > 0 ? new Date(user.expire_at * 1000).toISOString() : 'Never'}

port: 7890
socks-port: 7891
mixed-port: 7892
allow-lan: true
mode: rule
log-level: info
external-controller: 0.0.0.0:9090

dns:
  enable: true
  enhanced-mode: fake-ip
  fake-ip-range: 198.18.0.1/16
  nameserver:
    - 8.8.8.8
    - 1.1.1.1

proxies:
${proxies.map(p => '  - ' + YAML.stringify(p).split('\n').join('\n  ')).join('\n\n')}

proxy-groups:
  - name: "Proxy"
    type: select
    proxies:
${proxyGroups.map(name => `      - ${name}`).join('\n')}

rules:
  - GEOIP,IR,DIRECT
  - MATCH,Proxy
`;
}

// Generate Clash proxy from node
function generateClashProxy(user, node) {
  const baseConfig = {
    name: node.name,
    server: node.address,
    port: node.port,
    type: mapProtocolToClash(node.type)
  };
  
  switch (node.type) {
    case 'vless':
      return {
        ...baseConfig,
        uuid: user.uuid,
        flow: node.tls ? 'xtls-rprx-vision' : undefined,
        network: node.tls ? 'tcp' : 'tcp',
        'client-fingerprint': 'chrome'
      };
      
    case 'vmess':
      return {
        ...baseConfig,
        uuid: user.uuid,
        alterId: 0,
        security: 'auto'
      };
      
    case 'trojan':
      return {
        ...baseConfig,
        password: user.uuid,
        sni: node.remark || node.address,
        skip-cert-verify: false
      };
      
    case 'shadowsocks':
      return {
        ...baseConfig,
        cipher: 'chacha20-ietf-poly1305',
        password: user.uuid
      };
      
    case 'wireguard':
      return {
        ...baseConfig,
        private-key: user.uuid, // Use UUID as private key placeholder
        peers: [{ public-key: 'BM1G1k+HQM8lxbwf8i2APjN7jQJy0o3tB7R4gPqKcHE=', 'endpoint': `${node.address}:${node.port}` }]
      };
      
    default:
      return null;
  }
}

// Map protocol to Clash type
function mapProtocolToClash(protocol) {
  const mapping = {
    'vless': 'vless',
    'vmess': 'vmess',
    'trojan': 'trojan',
    'shadowsocks': 'ss',
    'wireguard': 'wireguard'
  };
  return mapping[protocol] || protocol;
}

// Generate Sing-Box configuration
function generateSingBox(user, nodes, appName) {
  const outbounds = [];
  
  for (const node of nodes) {
    const outbound = generateSingBoxOutbound(user, node);
    if (outbound) {
      outbounds.push(outbound);
    }
  }
  
  return JSON.stringify({
    log: { level: 'info' },
    inbounds: [{
      type: 'mixed',
      listen: '0.0.0.0',
      port: 7890
    }],
    outbounds: [
      ...outbounds,
      { type: 'direct' },
      { type: 'dns' }
    ],
    route: {
      rules: [
        { geoip: 'ir', outbound: 'direct' }
      ]
    }
  }, null, 2);
}

// Generate Sing-Box outbound from node
function generateSingBoxOutbound(user, node) {
  const baseOutbound = {
    tag: node.name
  };
  
  switch (node.type) {
    case 'vless':
      return {
        ...baseOutbound,
        type: 'vless',
        server: node.address,
        server_port: node.port,
        uuid: user.uuid,
        flow: node.tls ? 'xtls-rprx-vision' : undefined,
        tls: node.tls ? { enabled: true, server_name: node.remark || node.address } : undefined
      };
      
    case 'vmess':
      return {
        ...baseOutbound,
        type: 'vmess',
        server: node.address,
        server_port: node.port,
        uuid: user.uuid,
        security: 'auto'
      };
      
    case 'trojan':
      return {
        ...baseOutbound,
        type: 'trojan',
        server: node.address,
        server_port: node.port,
        password: user.uuid,
        tls: { enabled: true, server_name: node.remark || node.address }
      };
      
    default:
      return {
        ...baseOutbound,
        type: 'direct'
      };
  }
}

// Generate JSON format
function generateJSON(user, nodes) {
  const configs = [];
  
  for (const node of nodes) {
    configs.push({
      name: node.name,
      type: node.type,
      address: node.address,
      port: node.port,
      uuid: user.uuid,
      remark: user.remark,
      enable: true
    });
  }
  
  return JSON.stringify({
    version: '2',
    user: {
      username: user.username,
      uuid: user.uuid,
      traffic_limit: user.traffic_limit,
      upload: user.upload,
      download: user.download,
      expire_at: user.expire_at
    },
    nodes: configs,
    generated: new Date().toISOString()
  }, null, 2);
}

// Generate all protocols (plain text format for v2rayN, etc.)
async function generateAllProtocols(user, nodes, env) {
  const lines = [];
  
  for (const node of nodes) {
    // VLESS
    if (node.type === 'vless' || node.type === 'all') {
      const vlessLink = generateVLESSLink(user, node);
      lines.push(vlessLink);
    }
    
    // VMess
    if (node.type === 'vmess' || node.type === 'all') {
      const vmessLink = generateVMessLink(user, node);
      lines.push(vmessLink);
    }
    
    // Trojan
    if (node.type === 'trojan' || node.type === 'all') {
      const trojanLink = generateTrojanLink(user, node);
      lines.push(trojanLink);
    }
    
    // Shadowsocks
    if (node.type === 'shadowsocks' || node.type === 'all') {
      const ssLink = generateShadowsocksLink(user, node);
      lines.push(ssLink);
    }
  }
  
  return lines.join('\n');
}

// Generate VLESS link
function generateVLESSLink(user, node) {
  const remark = encodeURIComponent(node.name);
  const query = new URLSearchParams();
  
  query.set('encryption', 'none');
  query.set('flow', node.tls ? 'xtls-rprx-vision' : '');
  query.set('type', 'tcp');
  query.set('security', node.tls ? 'tls' : 'none');
  
  if (node.tls) {
    query.set('sni', node.remark || node.address);
    query.set('fp', 'chrome');
    query.set('alpn', 'h2,http/1.1');
  }
  
  return `vless://${user.uuid}@${node.address}:${node.port}?${query.toString()}#${remark}`;
}

// Generate VMess link
function generateVMessLink(user, node) {
  const config = {
    v: '2',
    ps: node.name,
    add: node.address,
    port: node.port,
    id: user.uuid,
    net: 'tcp',
    tls: node.tls ? 'tls' : '',
   scy: 'auto',
    protocol: 'vmess'
  };
  
  const json = JSON.stringify(config);
  const base64 = btoa(json).replace(/=/g, '');
  
  return `vmess://${base64}`;
}

// Generate Trojan link
function generateTrojanLink(user, node) {
  const remark = encodeURIComponent(node.name);
  const query = new URLSearchParams();
  
  query.set('peer', node.remark || node.address);
  query.set('sni', node.remark || node.address);
  query.set('alpn', 'h2,http/1.1');
  
  return `trojan://${user.uuid}@${node.address}:${node.port}?${query.toString()}#${remark}`;
}

// Generate Shadowsocks link
function generateShadowsocksLink(user, node) {
  const remark = encodeURIComponent(node.name);
  const userInfo = btoa(`chacha20-ietf-poly1305:${user.uuid}`);
  
  return `ss://${userInfo}@${node.address}:${node.port}#${remark}`;
}

// YAML stringify helper
const YAML = {
  stringify: (obj) => {
    const lines = [];
    
    for (const [key, value] of Object.entries(obj)) {
      if (value === undefined || value === null) continue;
      
      if (typeof value === 'object' && !Array.isArray(value)) {
        lines.push(`${key}:`);
        for (const [k, v] of Object.entries(value)) {
          if (v !== undefined && v !== null) {
            lines.push(`  ${k}: ${v}`);
          }
        }
      } else if (Array.isArray(value)) {
        lines.push(`${key}:`);
        for (const item of value) {
          if (typeof item === 'object') {
            lines.push(`  - ${YAML.stringify(item).trim()}`);
          } else {
            lines.push(`  - ${item}`);
          }
        }
      } else {
        lines.push(`${key}: ${value}`);
      }
    }
    
    return lines.join('\n');
  }
};
