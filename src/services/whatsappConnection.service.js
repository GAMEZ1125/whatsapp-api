const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');

const TABLE = 'whatsapp_connections';

const mapRow = (r) => ({
  id: r.id,
  clientId: r.clientId,
  phone: r.phone,
  sessionName: r.session_name,
  status: r.status,
  lastQr: r.last_qr,
  qrExpiresAt: r.qr_expires_at,
  sessionPath: r.wwebjs_session_path,
  concurrentLimit: r.concurrent_limit,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

async function list(clientId = null) {
  const [rows] = clientId
    ? await pool.execute(`SELECT * FROM ${TABLE} WHERE clientId = ? ORDER BY created_at DESC`, [clientId])
    : await pool.execute(`SELECT * FROM ${TABLE} ORDER BY created_at DESC`);
  return rows.map(mapRow);
}

async function getById(id) {
  const [rows] = await pool.execute(`SELECT * FROM ${TABLE} WHERE id = ?`, [id]);
  return rows[0] ? mapRow(rows[0]) : null;
}

async function create(data) {
  const id = uuidv4();
  await pool.execute(
    `INSERT INTO ${TABLE} (id, clientId, phone, session_name, status, concurrent_limit) VALUES (?,?,?,?,?,?)`,
    [
      id,
      data.clientId,
      data.phone,
      data.sessionName || data.phone,
      data.status || 'pending',
      data.concurrentLimit || 5,
    ]
  );
  return getById(id);
}

async function update(id, updates) {
  const fields = [];
  const values = [];
  const map = {
    phone: 'phone',
    sessionName: 'session_name',
    status: 'status',
    lastQr: 'last_qr',
    qrExpiresAt: 'qr_expires_at',
    sessionPath: 'wwebjs_session_path',
    concurrentLimit: 'concurrent_limit',
  };
  Object.entries(map).forEach(([k, col]) => {
    if (updates[k] !== undefined) {
      fields.push(`${col} = ?`);
      values.push(updates[k]);
    }
  });
  if (!fields.length) return getById(id);
  values.push(id);
  await pool.execute(`UPDATE ${TABLE} SET ${fields.join(', ')} WHERE id = ?`, values);
  return getById(id);
}

async function remove(id) {
  const conn = await getById(id);
  if (!conn) return false;
  await pool.execute(`DELETE FROM ${TABLE} WHERE id = ?`, [id]);
  return true;
}

module.exports = {
  list,
  getById,
  create,
  update,
  remove,
};
