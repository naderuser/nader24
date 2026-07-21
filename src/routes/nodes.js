/**
 * Nodes Routes
 */

import { 
  getAllNodes, 
  getNodeById, 
  createNode, 
  updateNode, 
  deleteNode,
  addLog
} from '../db/init.js';
import { sanitizeInput, validatePort } from '../middleware/security.js';
import { getClientIP } from '../middleware/security.js';

// Get all nodes
export async function handleNodes(request, env, ctx) {
  const method = request.method;
  
  if (method === 'GET') {
    try {
      const nodes = await getAllNodes(env);
      return jsonResponse({
        success: true,
        data: nodes.map(formatNode)
      });
    } catch (error) {
      console.error('Get nodes error:', error);
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }
  
  if (method === 'POST') {
    try {
      const body = await request.json();
      const node = await createNewNode(env, body, request);
      
      return jsonResponse({
        success: true,
        message: 'Node created successfully',
        data: node
      }, 201);
    } catch (error) {
      console.error('Create node error:', error);
      return jsonResponse({ success: false, error: error.message }, 400);
    }
  }
  
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

// Create new node
async function createNewNode(env, body, request) {
  const {
    name,
    address,
    port,
    tls = false,
    type = 'vless',
    enable = true,
    sort = 0,
    remark = ''
  } = body;
  
  // Validate required fields
  if (!name || !address || !port) {
    throw new Error('Name, address, and port are required');
  }
  
  // Validate port
  if (!validatePort(port)) {
    throw new Error('Invalid port number (1-65535)');
  }
  
  const result = await createNode(env, {
    name: sanitizeInput(name),
    address: sanitizeInput(address),
    port: parseInt(port),
    tls: tls ? 1 : 0,
    type: sanitizeInput(type),
    enable: enable ? 1 : 0,
    sort: parseInt(sort),
    remark: sanitizeInput(remark)
  });
  
  await addLog(env, 'create_node', result.id.toString(), getClientIP(request), 
    request.headers.get('User-Agent') || '', JSON.stringify({ name, address, port }));
  
  return {
    id: result.id,
    name,
    address,
    port,
    tls,
    type,
    enable,
    sort,
    remark
  };
}

// Get node by ID
export async function handleNodeById(request, env, ctx) {
  const url = new URL(request.url);
  const pathParts = url.pathname.split('/');
  const id = parseInt(pathParts[3]);
  const method = request.method;
  
  if (isNaN(id)) {
    return jsonResponse({ success: false, error: 'Invalid node ID' }, 400);
  }
  
  if (method === 'GET') {
    const node = await getNodeById(env, id);
    if (!node) {
      return jsonResponse({ success: false, error: 'Node not found' }, 404);
    }
    
    return jsonResponse({
      success: true,
      data: formatNode(node)
    });
  }
  
  if (method === 'PUT') {
    try {
      const body = await request.json();
      
      // Validate port if provided
      if (body.port && !validatePort(body.port)) {
        return jsonResponse({ success: false, error: 'Invalid port number' }, 400);
      }
      
      const updates = {};
      const allowedFields = ['name', 'address', 'port', 'tls', 'type', 'enable', 'sort', 'remark'];
      
      for (const field of allowedFields) {
        if (body[field] !== undefined) {
          if (field === 'tls' || field === 'enable') {
            updates[field] = body[field] ? 1 : 0;
          } else if (field === 'port' || field === 'sort') {
            updates[field] = parseInt(body[field]);
          } else {
            updates[field] = sanitizeInput(body[field]);
          }
        }
      }
      
      const success = await updateNode(env, id, updates);
      
      if (!success) {
        return jsonResponse({ success: false, error: 'Failed to update node' }, 400);
      }
      
      await addLog(env, 'update_node', id.toString(), getClientIP(request), 
        request.headers.get('User-Agent') || '', JSON.stringify(updates));
      
      return jsonResponse({
        success: true,
        message: 'Node updated successfully'
      });
    } catch (error) {
      console.error('Update node error:', error);
      return jsonResponse({ success: false, error: error.message }, 400);
    }
  }
  
  if (method === 'DELETE') {
    try {
      const success = await deleteNode(env, id);
      
      if (!success) {
        return jsonResponse({ success: false, error: 'Failed to delete node' }, 400);
      }
      
      await addLog(env, 'delete_node', id.toString(), getClientIP(request), 
        request.headers.get('User-Agent') || '');
      
      return jsonResponse({
        success: true,
        message: 'Node deleted successfully'
      });
    } catch (error) {
      console.error('Delete node error:', error);
      return jsonResponse({ success: false, error: error.message }, 500);
    }
  }
  
  return jsonResponse({ error: 'Method not allowed' }, 405);
}

// Import nodes
export async function handleNodesImport(request, env, ctx) {
  try {
    const body = await request.json();
    const { nodes } = body;
    
    if (!Array.isArray(nodes) || nodes.length === 0) {
      return jsonResponse({ success: false, error: 'No nodes to import' }, 400);
    }
    
    let imported = 0;
    let errors = [];
    
    for (const nodeData of nodes) {
      try {
        if (nodeData.name && nodeData.address && nodeData.port) {
          await createNewNode(env, nodeData, request);
          imported++;
        } else {
          errors.push({ data: nodeData, error: 'Missing required fields' });
        }
      } catch (e) {
        errors.push({ data: nodeData, error: e.message });
      }
    }
    
    await addLog(env, 'import_nodes', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Imported ${imported} nodes`);
    
    return jsonResponse({
      success: true,
      message: `${imported} nodes imported successfully`,
      imported,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.error('Import nodes error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

// Export nodes
export async function handleNodesExport(request, env, ctx) {
  try {
    const nodes = await getAllNodes(env);
    
    const format = new URL(request.url).searchParams.get('format') || 'json';
    
    if (format === 'csv') {
      const csv = generateCSV(nodes);
      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="nodes.csv"'
        }
      });
    }
    
    await addLog(env, 'export_nodes', '', getClientIP(request), 
      request.headers.get('User-Agent') || '', `Exported ${nodes.length} nodes`);
    
    return jsonResponse({
      success: true,
      data: nodes.map(formatNode)
    });
  } catch (error) {
    console.error('Export nodes error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
}

function formatNode(node) {
  return {
    id: node.id,
    name: node.name,
    address: node.address,
    port: node.port,
    tls: node.tls === 1,
    type: node.type,
    enable: node.enable === 1,
    sort: node.sort,
    remark: node.remark || '',
    created_at: node.created_at,
    stats: {
      cpu: node.cpu || 0,
      memory: node.memory || 0,
      disk: node.disk || 0,
      online_user: node.online_user || 0
    }
  };
}

function generateCSV(nodes) {
  const headers = ['name', 'address', 'port', 'tls', 'type', 'enable', 'sort', 'remark'];
  const rows = [headers.join(',')];
  
  for (const node of nodes) {
    const row = [
      escapeCSV(node.name),
      escapeCSV(node.address),
      node.port,
      node.tls,
      escapeCSV(node.type),
      node.enable,
      node.sort,
      escapeCSV(node.remark || '')
    ];
    rows.push(row.join(','));
  }
  
  return rows.join('\n');
}

function escapeCSV(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}
