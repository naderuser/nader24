/**
 * QR Code Routes
 */

import { getSubscriptionByUUID } from '../db/init.js';

export async function handleQRCode(request, env) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/qr\/([a-zA-Z0-9-]+)\/?$/);
  
  if (!match) {
    return jsonResponse({ error: 'Invalid request' }, 400);
  }
  
  const uuid = match[1];
  const subscription = await getSubscriptionByUUID(env, uuid);
  
  if (!subscription) {
    return jsonResponse({ error: 'Subscription not found' }, 404);
  }
  
  // Get first config link for QR
  const links = subscription.config_links.split('\n').filter(l => l.trim());
  const config = links[0] || '';
  
  // Generate simple SVG QR code
  const svg = generateSimpleQR(config);
  
  return new Response(svg, {
    headers: { 'Content-Type': 'image/svg+xml' }
  });
}

function generateSimpleQR(text) {
  // Simple QR-like visualization (not a real QR code, just for display)
  // For real QR codes, you would need a QR library
  const size = 200;
  const pixelSize = 8;
  const gridSize = Math.floor(size / pixelSize);
  
  // Create a pattern based on the text hash
  const hash = simpleHash(text);
  const matrix = [];
  
  for (let y = 0; y < gridSize; y++) {
    const row = [];
    for (let x = 0; x < gridSize; x++) {
      // Finder patterns
      if ((x < 7 && y < 7) || (x >= gridSize - 7 && y < 7) || (x < 7 && y >= gridSize - 7)) {
        row.push(isFinderPattern(x, y, gridSize));
      }
      // Timing patterns
      else if (x === 6 || y === 6) {
        row.push((x + y) % 2 === 0);
      }
      // Data area
      else {
        const idx = (y * gridSize + x) % hash.length;
        row.push(hash[idx] > 127);
      }
    }
    matrix.push(row);
  }
  
  let svg = \`<svg xmlns="http://www.w3.org/2000/svg" width="\${size}" height="\${size}" viewBox="0 0 \${size} \${size}">\`;
  svg += \`<rect width="100%" height="100%" fill="white"/>\`;
  
  for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
      if (matrix[y][x]) {
        svg += \`<rect x="\${x * pixelSize}" y="\${y * pixelSize}" width="\${pixelSize}" height="\${pixelSize}" fill="black"/>\`;
      }
    }
  }
  
  svg += '</svg>';
  return svg;
}

function isFinderPattern(x, y, size) {
  const positions = [
    { sx: 0, sy: 0 },
    { sx: size - 7, sy: 0 },
    { sx: 0, sy: size - 7 }
  ];
  
  for (const pos of positions) {
    const lx = x - pos.sx;
    const ly = y - pos.sy;
    
    if (lx >= 0 && lx < 7 && ly >= 0 && ly < 7) {
      // Outer border
      if (lx === 0 || lx === 6 || ly === 0 || ly === 6) return true;
      // Inner border
      if (lx === 1 || lx === 5 || ly === 1 || ly === 5) return false;
      // Center
      if (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4) return true;
    }
  }
  
  return false;
}

function simpleHash(str) {
  const result = new Uint8Array(32);
  for (let i = 0; i < str.length; i++) {
    result[i % 32] ^= str.charCodeAt(i);
    result[(i + 1) % 32] = (result[(i + 1) % 32] + str.charCodeAt(i)) % 256;
  }
  return result;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
