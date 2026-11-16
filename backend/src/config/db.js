import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '1234',
  database: process.env.DB_NAME || 'soil_iot_db',
  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  charset: 'utf8mb4'
});

export const ensureDeviceProvisioningSchema = async () => {
  const dbName = process.env.DB_NAME || 'soil_iot_db';
  const [cols] = await pool.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'devices'`,
    [dbName]
  );
  const existingCols = new Set(cols.map(c => c.COLUMN_NAME));

  if (!existingCols.has('device_code')) {
    await pool.query(
      `ALTER TABLE devices ADD COLUMN device_code VARCHAR(32) NULL UNIQUE AFTER type`
    );
  }
  if (!existingCols.has('hardware_mac')) {
    await pool.query(
      `ALTER TABLE devices ADD COLUMN hardware_mac VARCHAR(32) NULL UNIQUE AFTER device_code`
    );
  }
  if (!existingCols.has('claim_pin')) {
    await pool.query(
      `ALTER TABLE devices ADD COLUMN claim_pin VARCHAR(12) NULL AFTER owner_id`
    );
  }
  if (!existingCols.has('provisioning_status')) {
    await pool.query(
      `ALTER TABLE devices ADD COLUMN provisioning_status ENUM('pending_approval', 'awaiting_activation', 'pairing_open', 'active', 'rejected', 'unclaimed') NOT NULL DEFAULT 'active' AFTER claim_pin`
    );
  }
  if (!existingCols.has('activation_code')) {
    await pool.query(
      `ALTER TABLE devices ADD COLUMN activation_code VARCHAR(12) NULL AFTER provisioning_status`
    );
  }
  if (!existingCols.has('pairing_expires_at')) {
    await pool.query(
      `ALTER TABLE devices ADD COLUMN pairing_expires_at DATETIME NULL AFTER activation_code`
    );
  }
  if (!existingCols.has('claimed_at')) {
    await pool.query(
      `ALTER TABLE devices ADD COLUMN claimed_at DATETIME NULL AFTER last_online`
    );
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS device_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      device_id INT NULL,
      user_id INT NOT NULL,
      request_type ENUM('new_device', 'rekey') NOT NULL,
      hardware_mac VARCHAR(32) NOT NULL,
      requested_name VARCHAR(100) NOT NULL,
      device_type ENUM('fixed', 'handheld') NOT NULL,
      reason VARCHAR(255) NULL,
      status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
      activation_code VARCHAR(12) NULL,
      admin_note VARCHAR(255) NULL,
      resolved_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT fk_dev_req_device FOREIGN KEY (device_id)
        REFERENCES devices (id) ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT fk_dev_req_user FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE ON UPDATE CASCADE,
      INDEX idx_dev_req_status (status),
      INDEX idx_dev_req_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [missingCodeRows] = await pool.query(
    `SELECT id, type FROM devices WHERE device_code IS NULL OR device_code = ''`
  );
  for (const row of missingCodeRows) {
    const prefix = row.type === 'fixed' ? 'F' : 'H';
    const fallbackCode = `AGRO-${prefix}-${String(row.id).padStart(4, '0')}`;
    await pool.query(`UPDATE devices SET device_code = ? WHERE id = ?`, [fallbackCode, row.id]);
  }
};

export const testDbConnection = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('✅ Kết nối MySQL Server thành công (soil_iot_db)');
    connection.release();
    await ensureDeviceProvisioningSchema();
    return true;
  } catch (error) {
    console.error('❌ Lỗi kết nối MySQL Server:', error.message);
    throw error;
  }
};
