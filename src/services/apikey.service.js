const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const logger = require('../config/logger');

const TABLE = 'api_keys';

const mapRow = (r) => ({
  id: r.id,
  clientId: r.clientId,
  plan: r.plan,
  key: r.keyValue,
  name: r.name,
  description: r.description,
  permissions: r.permissions ? JSON.parse(r.permissions) : ['*'],
  active: !!r.active,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

async function createApiKey(options = {}) {
  const id = uuidv4();
  const keyValue = `wapi_${uuidv4().replace(/-/g, '')}`;
  const perms = options.permissions || ['*'];
  await pool.execute(
    `INSERT INTO ${TABLE} (id, clientId, plan, keyValue, name, description, permissions, active)
     VALUES (?,?,?,?,?,?,?,1)`,
    [
      id,
      options.clientId || null,
      options.plan || null,
      keyValue,
      options.name || 'API Key',
      options.description || '',
      JSON.stringify(perms),
    ]
  );
  return { success: true, data: { id, key: keyValue } };
}

async function listApiKeys(includeSecret = false) {
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} ORDER BY createdAt DESC`);
  const keys = rows.map((r) => {
    const mapped = mapRow(r);
    if (!includeSecret) delete mapped.key;
    return mapped;
  });
  return { success: true, data: keys };
}

async function getApiKeyById(id, includeSecret = false) {
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
  if (!rows[0]) return null;
  const mapped = mapRow(rows[0]);
  if (!includeSecret) delete mapped.key;
  return mapped;
}

async function updateApiKey(id, updates = {}) {
  const fields = [];
  const values = [];
  const map = { name: 'name', description: 'description', permissions: 'permissions', plan: 'plan', clientId: 'clientId' };
  Object.entries(map).forEach(([k, col]) => {
    if (updates[k] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(k === 'permissions' ? JSON.stringify(updates[k]) : updates[k]);
    }
  });
  if (updates.active !== undefined) {
    fields.push(`active = ?`);
    values.push(updates.active ? 1 : 0);
  }
  if (!fields.length) return { success: true };
  values.push(id);
  await pool.execute(`UPDATE ${TABLE} SET ${fields.join(', ')} WHERE id = ?`, values);
  return { success: true };
}

async function deleteApiKey(id) {
  await pool.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  return { success: true };
}

async function validateApiKey(keyValue) {
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE keyValue = ? AND active = 1`, [keyValue]);
  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

module.exports = {
  createApiKey,
  listApiKeys,
  getApiKeyById,
  updateApiKey,
  deleteApiKey,
  validateApiKey,
};
