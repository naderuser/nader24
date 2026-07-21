/**
 * Settings Routes
 */

import { getAllSettings, updateSettings, addLog } from '../db/init.js';
import { hashPassword } from '../utils/crypto.js';
import { getClientIP } from '../middleware/security.js';
import { getSetting, setSetting } from '../db/init.js';

// Get all settings
export async function handleSettings(request, env, ctx) {
  try {
    const settings = await getAllSettings(env);
    
    // Don't expose sensitive settings
    const safeSettings = {
      app_name: settings.app_name || 'NaderVPN',
      app_logo: settings.app_logo || '',
      app_url: settings.app_url || '',
      language: settings.language || 'fa',
      theme: settings.theme || 'dark',
      max_users: settings.max_users || '0',
      default_traffic: settings.default_traffic || '107374182400',
      default_days: settings.default_days || '30',
      registration_enabled: settings.registration_enabled === 'true',
      maintenance_mode: settings.maintenance_mode === 'true',
      backup_enabled: settings.backup_enabled === 'true',
      backup_interval: settings.backup_interval || 'daily'
    };
    
    return jsonResponse({
      success: true,
      data: safeSettings
    });
  } catch (error) {
    console.error('Get settings error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Update settings
export async function handleSettingsUpdate(request, env, ctx) {
  try {
    const body = await request.json();
    
    const allowedSettings = [
      'app_name', 'app_logo', 'app_url', 'language', 'theme',
      'max_users', 'default_traffic', 'default_days',
      'registration_enabled', 'maintenance_mode',
      'backup_enabled', 'backup_interval'
    ];
    
    const updates = {};
    for (const key of allowedSettings) {
      if (body[key] !== undefined) {
        updates[key] = String(body[key]);
      }
    }
    
    await updateSettings(env, updates);
    
    await addLog(env, 'update_settings', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', 'Settings updated');
    
    return jsonResponse({
      success: true,
      message: 'Settings updated successfully'
    });
  } catch (error) {
    console.error('Update settings error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Change password
export async function handlePasswordChange(request, env, ctx) {
  try {
    const body = await request.json();
    const { current_password, new_password, confirm_password } = body;
    
    // Validate inputs
    if (!current_password || !new_password || !confirm_password) {
      return jsonResponse({ 
        success: false, 
        error: 'All password fields are required' 
      }, 400);
    }
    
    if (new_password !== confirm_password) {
      return jsonResponse({ 
        success: false, 
        error: 'New passwords do not match' 
      }, 400);
    }
    
    if (new_password.length < 6) {
      return jsonResponse({ 
        success: false, 
        error: 'Password must be at least 6 characters' 
      }, 400);
    }
    
    // Verify current password
    const storedHash = await getSetting(env, 'admin_password_hash');
    const { verifyPassword } = await import('../utils/crypto.js');
    
    if (storedHash) {
      const isValid = await verifyPassword(current_password, storedHash);
      if (!isValid) {
        return jsonResponse({ 
          success: false, 
          error: 'Current password is incorrect' 
        }, 401);
      }
    }
    
    // Hash and save new password
    const newHash = await hashPassword(new_password);
    await setSetting(env, 'admin_password_hash', newHash);
    
    await addLog(env, 'change_password', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', 'Password changed');
    
    return jsonResponse({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
