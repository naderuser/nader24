/**
 * Import Routes
 */

import { createUser, addLog } from '../db/init.js';
import { generateUUID } from '../utils/crypto.js';
import { getClientIP } from '../middleware/security.js';

// Import CSV
export async function handleImportCSV(request, env, ctx) {
  try {
    const content = await request.text();
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return jsonResponse({ success: false, error: 'CSV file is empty or invalid' }, 400);
    }
    
    // Parse header
    const header = parseCSVLine(lines[0]);
    const headerMap = {};
    header.forEach((col, index) => {
      headerMap[col.toLowerCase().trim()] = index;
    });
    
    // Validate required columns
    const requiredColumns = ['username'];
    for (const col of requiredColumns) {
      if (headerMap[col] === undefined) {
        return jsonResponse({ 
          success: false, 
          error: `Missing required column: ${col}` 
        }, 400);
      }
    }
    
    let imported = 0;
    let errors = [];
    
    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      try {
        const values = parseCSVLine(lines[i]);
        const row = {};
        header.forEach((col, index) => {
          row[col.toLowerCase().trim()] = values[index] || '';
        });
        
        // Validate username
        if (!row.username || row.username.trim().length < 3) {
          errors.push({ row: i + 1, error: 'Invalid username' });
          continue;
        }
        
        // Check if user exists
        const existing = await env.DB.prepare('SELECT id FROM users WHERE username = ?')
          .bind(row.username.trim()).first();
        
        if (existing) {
          errors.push({ row: i + 1, error: `User ${row.username} already exists`, username: row.username });
          continue;
        }
        
        // Parse dates
        let expireAt = 0;
        if (row['expire_at']) {
          const date = new Date(row['expire_at']);
          if (!isNaN(date.getTime())) {
            expireAt = Math.floor(date.getTime() / 1000);
          }
        }
        
        // Parse traffic (GB to bytes)
        let trafficLimit = 107374182400; // 100GB default
        if (row['traffic_limit']) {
          trafficLimit = parseFloat(row['traffic_limit']) * 1073741824;
        }
        
        // Create user
        const uuid = generateUUID();
        const protocol = row.protocol || 'vless';
        const remark = row.remark || '';
        const enable = row.enable?.toLowerCase() === 'yes' || row.enable?.toLowerCase() === 'true' || row.enable === '1' ? 1 : 0;
        
        await env.DB.prepare(`
          INSERT INTO users (uuid, username, remark, protocol, expire_at, traffic_limit, enable, created_by)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(uuid, row.username.trim(), remark, protocol, expireAt, trafficLimit, enable, 'import').run();
        
        imported++;
      } catch (e) {
        errors.push({ row: i + 1, error: e.message });
      }
    }
    
    await addLog(env, 'import_csv', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Imported ${imported} users from CSV`);
    
    return jsonResponse({
      success: true,
      message: `${imported} users imported successfully`,
      imported,
      total: lines.length - 1,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Import CSV error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Parse CSV line handling quoted values
function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  
  values.push(current.trim());
  return values;
}

// Import JSON
export async function handleImportJSON(request, env, ctx) {
  try {
    const body = await request.json();
    const { users, mode = 'create' } = body; // mode: 'create' | 'update' | 'upsert'
    
    if (!Array.isArray(users) || users.length === 0) {
      return jsonResponse({ success: false, error: 'No users to import' }, 400);
    }
    
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = [];
    
    for (const userData of users) {
      try {
        // Validate required fields
        if (!userData.username) {
          errors.push({ username: userData.username || 'unknown', error: 'Username is required' });
          continue;
        }
        
        // Check if user exists
        const existing = await env.DB.prepare('SELECT id, uuid FROM users WHERE username = ?')
          .bind(userData.username).first();
        
        if (existing) {
          if (mode === 'create') {
            skipped++;
            continue;
          }
          
          // Update existing user
          const updates = {};
          const allowedFields = ['remark', 'protocol', 'expire_at', 'traffic_limit', 'enable', 'notes'];
          
          for (const field of allowedFields) {
            if (userData[field] !== undefined) {
              updates[field] = userData[field];
            }
          }
          
          if (Object.keys(updates).length > 0) {
            const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
            const values = Object.values(updates);
            
            await env.DB.prepare(`UPDATE users SET ${setClause} WHERE username = ?`)
              .bind(...values, userData.username).run();
            updated++;
          }
        } else {
          // Create new user
          const uuid = userData.uuid || generateUUID();
          const protocol = userData.protocol || 'vless';
          const remark = userData.remark || '';
          const expireAt = userData.expire_at || 0;
          const trafficLimit = userData.traffic_limit || 107374182400;
          const enable = userData.enable !== false ? 1 : 0;
          
          await env.DB.prepare(`
            INSERT INTO users (uuid, username, remark, protocol, expire_at, traffic_limit, enable, created_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(uuid, userData.username, remark, protocol, expireAt, trafficLimit, enable, 'import').run();
          
          imported++;
        }
      } catch (e) {
        errors.push({ username: userData.username || 'unknown', error: e.message });
      }
    }
    
    await addLog(env, 'import_json', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Imported ${imported}, updated ${updated}, skipped ${skipped}`);
    
    return jsonResponse({
      success: true,
      message: `Import complete: ${imported} created, ${updated} updated, ${skipped} skipped`,
      imported,
      updated,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Import JSON error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
