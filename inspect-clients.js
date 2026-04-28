const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'gamez-solutions.ddns.net',
    user: 'sa',
    password: 'A1qazL',
    port: 3306
  });

  await conn.query(
    `UPDATE crm_gamez.WhatsappConfig SET clientId = ? WHERE tenantId = ?`,
    ['7ef2ad39-90a1-4e2b-a7cb-ab2859f02bcf', 'tenant-003']
  );
  console.log('CRM WhatsappConfig actualizado para tenant-003.');
}

main().catch(console.error).finally(() => process.exit(0));
