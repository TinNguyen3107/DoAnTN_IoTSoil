import { pool } from '../config/db.js';

export class SystemConfigRepository {
  /**
   * Lấy tất cả cấu hình tham số hệ thống
   */
  async findAll() {
    const [rows] = await pool.query(
      `SELECT id, cfg_key, cfg_value, description FROM system_configs ORDER BY id ASC`
    );
    return rows;
  }

  /**
   * Cập nhật một cấu hình theo key
   */
  async upsert(key, value) {
    const [result] = await pool.query(
      `UPDATE system_configs SET cfg_value = ? WHERE cfg_key = ?`,
      [String(value), key]
    );
    return result.affectedRows > 0;
  }
}
