const { pool } = require('../config/db');

const CLIENTS_TABLE = 'clients';

const listClients = async () => {
  const [rows] = await pool.execute(`SELECT * FROM ${CLIENTS_TABLE} ORDER BY createdAt DESC`);
  return rows;
};

const getClientById = async (id) => {
  const [rows] = await pool.execute(`SELECT * FROM ${CLIENTS_TABLE} WHERE id = ? LIMIT 1`, [id]);
  return rows[0] || null;
};

const resolveClientId = async (tenantValue = null) => {
  const raw = String(tenantValue || '').trim();
  if (!raw) {
    const [rows] = await pool.execute(`SELECT id FROM ${CLIENTS_TABLE} WHERE status = 'active' ORDER BY createdAt ASC LIMIT 1`);
    return rows[0]?.id || null;
  }

  const byId = await getClientById(raw);
  if (byId) return byId.id;

  const [rows] = await pool.execute(
    `SELECT id FROM ${CLIENTS_TABLE} WHERE name = ? OR company = ? OR email = ? ORDER BY createdAt ASC LIMIT 1`,
    [raw, raw, raw]
  );

  if (rows[0]?.id) return rows[0].id;

  const [fallbackRows] = await pool.execute(
    `SELECT id FROM ${CLIENTS_TABLE} WHERE status = 'active' ORDER BY createdAt ASC LIMIT 1`
  );
  return fallbackRows[0]?.id || null;
};

module.exports = {
  listClients,
  getClientById,
  resolveClientId,
};
