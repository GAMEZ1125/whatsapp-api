const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const logger = require('../config/logger');
const clientService = require('./client.service');

const TABLE = 'api_keys';

const initialize = async () => {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id CHAR(36) PRIMARY KEY,
      clientId CHAR(36) NULL,
      plan VARCHAR(100) NULL,
      keyValue VARCHAR(120) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      description TEXT NULL,
      permissions JSON NULL,
      active TINYINT(1) NOT NULL DEFAULT 1,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);
};

const generateApiKeyValue = () => `wapi_${uuidv4().replace(/-/g, '')}`;

const maskApiKey = (keyValue = '') => {
  const raw = String(keyValue || '');
  if (!raw) return null;
  if (raw.length <= 16) return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
  return `${raw.slice(0, 12)}...${raw.slice(-4)}`;
};

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
  const keyValue = generateApiKeyValue();
  const perms = options.permissions || ['*'];
  const clientId = options.clientId
    ? await clientService.resolveClientId(options.clientId)
    : null;
  await pool.execute(
    `INSERT INTO ${TABLE} (id, clientId, plan, keyValue, name, description, permissions, active)
     VALUES (?,?,?,?,?,?,?,1)`,
    [
      id,
      clientId,
      options.plan || null,
      keyValue,
      options.name || 'API Key',
      options.description || '',
      JSON.stringify(perms),
    ]
  );
  return { success: true, data: { id, key: keyValue } };
}

async function listApiKeys(filters = {}, includeSecret = false) {
  const where = [];
  const values = [];

  if (filters.clientId) {
    const resolvedClientId = await clientService.resolveClientId(filters.clientId);
    where.push('clientId = ?');
    values.push(resolvedClientId);
  }

  const query = `SELECT * FROM ${TABLE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY createdAt DESC`;
  const [rows] = await pool.execute(query, values);
  const keys = rows.map((r) => {
    const mapped = mapRow(r);
    if (!includeSecret) delete mapped.key;
    return mapped;
  });
  return { success: true, data: keys };
}

async function getApiKeyById(id, includeSecret = false, filters = {}) {
  const where = ['id = ?'];
  const values = [id];

  if (filters.clientId) {
    const resolvedClientId = await clientService.resolveClientId(filters.clientId);
    where.push('clientId = ?');
    values.push(resolvedClientId);
  }

  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE ${where.join(' AND ')}`, values);
  if (!rows[0]) return null;
  const mapped = mapRow(rows[0]);
  if (!includeSecret) delete mapped.key;
  return mapped;
}

async function updateApiKey(id, updates = {}) {
  const fields = [];
  const values = [];
  const map = { name: 'name', description: 'description', permissions: 'permissions', plan: 'plan', clientId: 'clientId' };
  for (const [k, col] of Object.entries(map)) {
    if (updates[k] !== undefined) {
      const nextValue = k === 'permissions'
        ? JSON.stringify(updates[k])
        : k === 'clientId' && updates[k]
          ? await clientService.resolveClientId(updates[k])
          : updates[k];
      fields.push(`${col} = ?`);
      values.push(nextValue);
    }
  }
  if (updates.key !== undefined) {
    fields.push('keyValue = ?');
    values.push(updates.key);
  }
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

async function regenerateApiKey(id) {
  const keyValue = generateApiKeyValue();
  await pool.execute(`UPDATE ${TABLE} SET keyValue = ?, active = 1 WHERE id = ?`, [keyValue, id]);
  return { success: true, data: { id, key: keyValue } };
}

async function validateApiKey(keyValue) {
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE keyValue = ? AND active = 1`, [keyValue]);
  if (!rows[0]) return null;
  return mapRow(rows[0]);
}

module.exports = {
  initialize,
  createApiKey,
  listApiKeys,
  getApiKeyById,
  updateApiKey,
  deleteApiKey,
  regenerateApiKey,
  validateApiKey,
  maskApiKey,
};
