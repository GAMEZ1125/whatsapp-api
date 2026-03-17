const mysql = require('mysql2/promise');
const logger = require('./logger');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'api_whatsapp',
  port: parseInt(process.env.DB_PORT, 10) || 3306,
  waitForConnections: true,
  connectionLimit: parseInt(process.env.DB_POOL_LIMIT, 10) || 10,
  queueLimit: 0,
  charset: 'utf8mb4_general_ci',
});

const connect = async () => {
  try {
    await pool.query('SELECT 1');
    logger.info('Conexión a MySQL establecida');
  } catch (error) {
    logger.error('Error conectando a MySQL:', error);
    throw error;
  }
};

module.exports = {
  pool,
  connect,
};
