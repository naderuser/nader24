/**
 * QR Code Routes
 */

import { getUserByUUID, getEnabledNodes } from '../db/init.js';

// Generate QR Code
export async function handleQRCode(request, env, ctx) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const uuid = pathParts[3];
  const protocol = url.searchParams.get('protocol') || 'all';
  
  try {
    const user = await getUserByUUID(env, uuid);
    
    if (!user) {
      return jsonResponse({ success: false, error: 'User not found' }, 404);
    }
    
    if (!user.enable) {
      return jsonResponse({ success: false, error: 'User is disabled' }, 403);
    }
    
    const nodes = await getEnabledNodes(env);
    
    // Generate config links for QR code
    const configs = generateConfigs(user, nodes, protocol);
    
    // For QR codes, we need to generate an image
    // Since we can't use external libraries, we'll generate SVG-based QR codes
    const qrData = configs.join('\n');
    
    // Generate QR code as SVG
    const svg = generateQRSvg(qrData);
    
    return new Response(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache'
      }
    });
  } catch (error) {
    console.error('Generate QR error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function generateConfigs(user, nodes, protocol) {
  const configs = [];
  
  for (const node of nodes) {
    if (protocol !== 'all' && node.type !== protocol) continue;
    
    switch (node.type) {
      case 'vless':
        configs.push(generateVLESSLink(user, node));
        break;
      case 'vmess':
        configs.push(generateVMessLink(user, node));
        break;
      case 'trojan':
        configs.push(generateTrojanLink(user, node));
        break;
      case 'shadowsocks':
        configs.push(generateShadowsocksLink(user, node));
        break;
    }
  }
  
  return configs;
}

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
  }
  
  return `vless://${user.uuid}@${node.address}:${node.port}?${query.toString()}#${remark}`;
}

function generateVMessLink(user, node) {
  const config = {
    v: '2',
    ps: node.name,
    add: node.address,
    port: node.port,
    id: user.uuid,
    net: 'tcp',
    tls: node.tls ? 'tls' : '',
    scy: 'auto'
  };
  
  return `vmess://${btoa(JSON.stringify(config)).replace(/=/g, '')}`;
}

function generateTrojanLink(user, node) {
  const remark = encodeURIComponent(node.name);
  const query = new URLSearchParams();
  
  query.set('peer', node.remark || node.address);
  query.set('sni', node.remark || node.address);
  
  return `trojan://${user.uuid}@${node.address}:${node.port}?${query.toString()}#${remark}`;
}

function generateShadowsocksLink(user, node) {
  const remark = encodeURIComponent(node.name);
  const userInfo = btoa(`chacha20-ietf-poly1305:${user.uuid}`);
  
  return `ss://${userInfo}@${node.address}:${node.port}#${remark}`;
}

// Simple QR Code SVG generator
function generateQRSvg(data) {
  // Generate QR matrix (simplified implementation)
  const qr = generateQRMatrix(data);
  
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size * 4} ${qr.size * 4}" width="300" height="300">`;
  svg += `<rect width="100%" height="100%" fill="white"/>`;
  
  for (let y = 0; y < qr.size; y++) {
    for (let x = 0; x < qr.size; x++) {
      if (qr.matrix[y][x]) {
        svg += `<rect x="${x * 4}" y="${y * 4}" width="4" height="4" fill="black"/>`;
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}

// Simplified QR code matrix generator
function generateQRMatrix(data) {
  // This is a simplified QR generator for demo purposes
  // In production, use a proper QR library
  
  const size = 25; // Version 1 QR code
  const matrix = Array(size).fill(null).map(() => Array(size).fill(false));
  
  // Add finder patterns
  addFinderPattern(matrix, 0, 0);
  addFinderPattern(matrix, size - 7, 0);
  addFinderPattern(matrix, 0, size - 7);
  
  // Add timing patterns
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }
  
  // Add alignment pattern (simplified)
  addAlignmentPattern(matrix, size - 9, size - 9);
  
  // Encode data (simplified - just hash the data for demo)
  const hash = simpleHash(data);
  let bitIndex = 0;
  
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--;
    
    for (let row = 0; row < size; row++) {
      for (let c = 0; c < 2; c++) {
        const x = col - c;
        const y = row;
        
        if (!isReserved(matrix, x, y)) {
          matrix[y][x] = (hash[bitIndex % hash.length] >> (bitIndex % 8)) & 1;
          bitIndex++;
        }
      }
    }
  }
  
  return { size, matrix };
}

function addFinderPattern(matrix, startX, startY) {
  // Outer black border
  for (let i = 0; i < 7; i++) {
    matrix[startY][startX + i] = true;
    matrix[startY + 6][startX + i] = true;
    matrix[startY + i][startX] = true;
    matrix[startY + i][startX + 6] = true;
  }
  
  // Inner white border
  for (let i = 1; i < 6; i++) {
    matrix[startY + i][startX + 1] = false;
    matrix[startY + i][startX + 5] = false;
    matrix[startY + 1][startX + i] = false;
    matrix[startY + 5][startX + i] = false;
  }
  
  // Center black square
  for (let i = 2; i < 5; i++) {
    for (let j = 2; j < 5; j++) {
      matrix[startY + i][startX + j] = true;
    }
  }
}

function addAlignmentPattern(matrix, centerX, centerY) {
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const isEdge = Math.abs(dx) === 2 || Math.abs(dy) === 2;
      const isCenter = dx === 0 && dy === 0;
      matrix[centerY + dy][centerX + dx] = isEdge || isCenter;
    }
  }
}

function isReserved(matrix, x, y) {
  const size = matrix.length;
  
  // Finder patterns
  if (x < 9 && y < 9) return true;
  if (x < 9 && y >= size - 8) return true;
  if (x >= size - 8 && y < 9) return true;
  
  // Timing patterns
  if (x === 6 || y === 6) return true;
  
  return false;
}

function simpleHash(str) {
  const result = new Uint8Array(32);
  for (let i = 0; i < str.length; i++) {
    result[i % 32] ^= str.charCodeAt(i);
  }
  return result;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
