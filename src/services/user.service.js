const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');
const { pool } = require('../config/db');
const clientService = require('./client.service');

const USERS_TABLE = 'Users';

const ensureUserTable = async () => {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS ${USERS_TABLE} (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(200) NOT NULL,
      email VARCHAR(255) NOT NULL UNIQUE,
      role VARCHAR(100) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      apiKey VARCHAR(100),
      clientName VARCHAR(200),
      chatsAssigned INT NOT NULL DEFAULT 0,
      lastActivity DATETIME NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `;

  await pool.execute(createTableQuery);
  await pool.execute(`
    ALTER TABLE ${USERS_TABLE}
    ADD COLUMN IF NOT EXISTS clientId CHAR(36) NULL AFTER apiKey
  `);
};

const backfillUserClientIds = async () => {
  const [rows] = await pool.execute(
    `SELECT id, clientId, clientName FROM ${USERS_TABLE} WHERE (clientId IS NULL OR clientId = '') AND clientName IS NOT NULL AND clientName <> ''`
  );

  for (const row of rows) {
    const resolvedClientId = await clientService.resolveClientId(row.clientName);
    if (!resolvedClientId) continue;

    await pool.execute(
      `UPDATE ${USERS_TABLE} SET clientId = ? WHERE id = ?`,
      [resolvedClientId, row.id]
    );
  }
};

const seedDefaultUsers = async () => {
  const [countRows] = await pool.execute(`SELECT COUNT(*) AS total FROM ${USERS_TABLE};`);
  const total = countRows[0]?.total ?? 0;

  if (total > 0) {
    return;
  }

  const defaultUsers = [
    {
      name: 'Laura Méndez',
      email: 'laura@retailplus.com',
      role: 'supervisor',
      status: 'active',
      apiKey: 'rp_user_8f4b2c',
      clientName: 'Retail Plus',
      chatsAssigned: 12,
    },
    {
      name: 'Daniel Vargas',
      email: 'daniel@retailplus.com',
      role: 'agent',
      status: 'active',
      apiKey: 'rp_user_92d4a1',
      clientName: 'Retail Plus',
      chatsAssigned: 8,
    },
    {
      name: 'Rosa Herrera',
      email: 'rosa@retailplus.com',
      role: 'supervisor',
      status: 'pending',
      apiKey: 'rp_user_63c7df',
      clientName: 'Retail Plus',
      chatsAssigned: 0,
    },
    {
      name: 'María García',
      email: 'maria@techcorp.com',
      role: 'admin',
      status: 'active',
      apiKey: 'tc_user_1a2b',
      clientName: 'TechCorp Solutions',
      chatsAssigned: 15,
    },
  ];

  for (const user of defaultUsers) {
    const resolvedClientId = await clientService.resolveClientId(user.clientName || null);
    await pool.execute(
      `
        INSERT INTO ${USERS_TABLE} (id, name, email, role, status, apiKey, clientId, clientName, chatsAssigned, lastActivity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        uuidv4(),
        user.name,
        user.email,
        user.role,
        user.status,
        user.apiKey,
        resolvedClientId,
        user.clientName,
        user.chatsAssigned,
        new Date(),
      ]
    );
  }

  logger.info('Usuarios iniciales insertados en la base de datos');
};

const buildFilters = (filters = {}) => {
  const whereClauses = [];
  const values = [];

  if (filters.search) {
    whereClauses.push('(name LIKE ? OR email LIKE ? OR clientName LIKE ?)');
    const like = `%${filters.search}%`;
    values.push(like, like, like);
  }

  if (filters.role) {
    whereClauses.push('role = ?');
    values.push(filters.role);
  }

  if (filters.status) {
    whereClauses.push('status = ?');
    values.push(filters.status);
  }

  if (filters.clientId) {
    whereClauses.push('clientId = ?');
    values.push(filters.clientId);
  }

  return {
    whereClause: whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '',
    values,
  };
};

const listUsers = async (filters = {}) => {
  const page = Number(filters.page) || 1;
  const limit = Number(filters.limit) || 20;
  const offset = (page - 1) * limit;

  const { whereClause, values } = buildFilters(filters);

  const [rows] = await pool.execute(
    `
      SELECT id, name, email, role, status, apiKey, clientId, clientName, chatsAssigned, lastActivity, createdAt, updatedAt
      FROM ${USERS_TABLE}
      ${whereClause}
      ORDER BY createdAt DESC
      LIMIT ? OFFSET ?
    `,
    [...values, limit, offset]
  );

  const [countRows] = await pool.execute(
    `SELECT COUNT(*) AS total FROM ${USERS_TABLE} ${whereClause}`,
    values
  );
  const total = countRows[0]?.total ?? 0;

  return {
    users: rows,
    total: total ?? 0,
    page,
    limit,
  };
};

const getUserById = async (id, filters = {}) => {
  const whereClauses = ['id = ?'];
  const values = [id];

  if (filters.clientId) {
    whereClauses.push('clientId = ?');
    values.push(filters.clientId);
  }

  const [rows] = await pool.execute(`SELECT * FROM ${USERS_TABLE} WHERE ${whereClauses.join(' AND ')}`, values);
  return rows[0] || null;
};

const getUserByEmail = async (email) => {
  const [rows] = await pool.execute(`SELECT * FROM ${USERS_TABLE} WHERE email = ?`, [email]);
  return rows[0] || null;
};

const getUserByApiKey = async (apiKey) => {
  const [rows] = await pool.execute(`SELECT * FROM ${USERS_TABLE} WHERE apiKey = ?`, [apiKey]);
  return rows[0] || null;
};

const createUser = async (payload) => {
  const id = uuidv4();
  const resolvedClientId = await clientService.resolveClientId(payload.clientId || payload.clientName || null);

  // evita duplicados por email
  const existing = await getUserByEmail(payload.email);
  if (existing) {
    const error = new Error('El correo ya está registrado');
    error.code = 'DUP_EMAIL';
    throw error;
  }

  try {
    await pool.execute(
      `
        INSERT INTO ${USERS_TABLE} (id, name, email, role, status, apiKey, clientId, clientName, chatsAssigned, lastActivity)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        id,
        payload.name,
        payload.email,
        payload.role,
        payload.status || 'active',
        payload.apiKey || null,
        resolvedClientId,
        payload.clientName || null,
        payload.chatsAssigned || 0,
        payload.lastActivity || null,
      ]
    );
  } catch (err) {
    if (err && err.code === 'ER_DUP_ENTRY') {
      const dup = new Error('El correo ya está registrado');
      dup.code = 'DUP_EMAIL';
      throw dup;
    }
    throw err;
  }

  return getUserById(id);
};

const updateUser = async (id, updates, filters = {}) => {
  const existingUser = await getUserById(id, filters);
  if (!existingUser) {
    const error = new Error('Usuario no encontrado');
    error.code = 'USER_NOT_FOUND';
    throw error;
  }

  const fields = [];
  const values = [];
  let nextClientName = updates.clientName;
  let nextClientId = updates.clientId;

  if (updates.name) {
    fields.push('name = ?');
    values.push(updates.name);
  }

  if (updates.email) {
    fields.push('email = ?');
    values.push(updates.email);
  }

  if (updates.role) {
    fields.push('role = ?');
    values.push(updates.role);
  }

  if (updates.status) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (updates.apiKey !== undefined) {
    fields.push('apiKey = ?');
    values.push(updates.apiKey);
  }

  if (updates.clientName !== undefined) {
    fields.push('clientName = ?');
    values.push(updates.clientName);
  }

  if (updates.clientId !== undefined) {
    fields.push('clientId = ?');
    values.push(updates.clientId);
  }

  if (updates.chatsAssigned !== undefined) {
    fields.push('chatsAssigned = ?');
    values.push(updates.chatsAssigned);
  }

  if (updates.lastActivity) {
    fields.push('lastActivity = ?');
    values.push(updates.lastActivity);
  }

  if (!fields.length) {
    throw new Error('No hay campos para actualizar');
  }

  if (updates.clientName !== undefined || updates.clientId !== undefined) {
    nextClientName = nextClientName !== undefined ? nextClientName : existingUser?.clientName;
    nextClientId = await clientService.resolveClientId(nextClientId || nextClientName || existingUser?.clientId || null);

    if (fields.includes('clientId = ?')) {
      const clientIdIndex = fields.indexOf('clientId = ?');
      values[clientIdIndex] = nextClientId;
    } else {
      fields.push('clientId = ?');
      values.push(nextClientId);
    }
  }

  values.push(id);

  await pool.execute(
    `
      UPDATE ${USERS_TABLE}
      SET ${fields.join(', ')}, updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    values
  );

  return getUserById(id, filters);
};

const deleteUser = async (id, filters = {}) => {
  const whereClauses = ['id = ?'];
  const values = [id];

  if (filters.clientId) {
    whereClauses.push('clientId = ?');
    values.push(filters.clientId);
  }

  const [result] = await pool.execute(`DELETE FROM ${USERS_TABLE} WHERE ${whereClauses.join(' AND ')}`, values);
  return result.affectedRows > 0;
};

const initialize = async () => {
  await ensureUserTable();
  await seedDefaultUsers();
  await backfillUserClientIds();
};

module.exports = {
  initialize,
  listUsers,
  getUserById,
  getUserByEmail,
  getUserByApiKey,
  createUser,
  updateUser,
  deleteUser,
};
