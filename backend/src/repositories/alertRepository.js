import { pool } from '../config/db.js';

export class AlertRepository {
  /**
   * Tạo bản ghi cảnh báo mới vào bảng alerts
   */
  async create({ readingId, deviceId, parameter, level, value, limitValue }) {
    const [result] = await pool.query(
      `INSERT INTO alerts 
        (reading_id, device_id, parameter, level, value, limit_value, is_read, is_resolved)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      [readingId, deviceId, parameter, level, value, limitValue]
    );
    return result.insertId;
  }

  /**
   * Lấy danh sách cảnh báo theo bộ lọc
   */
  async findAll({ deviceId, unreadOnly = false, ownerId = null, limit = 50 }) {
    let sql = `
      SELECT a.id, a.reading_id, a.device_id, a.parameter, a.level, a.value, a.limit_value,
             a.is_read, a.is_resolved, a.action_taken, a.resolved_at, a.created_at,
             d.name as device_name, d.type as device_type
      FROM alerts a
      JOIN devices d ON a.device_id = d.id
      WHERE 1=1
    `;
    const params = [];

    if (deviceId) {
      sql += ` AND a.device_id = ?`;
      params.push(Number(deviceId));
    }

    if (ownerId) {
      sql += ` AND d.owner_id = ?`;
      params.push(Number(ownerId));
    }

    if (unreadOnly) {
      sql += ` AND a.is_resolved = 0`;
    }

    sql += ` ORDER BY a.created_at DESC, a.id DESC LIMIT ?`;
    params.push(Number(limit));

    const [rows] = await pool.query(sql, params);
    return rows;
  }

  /**
   * Đếm số lượng cảnh báo chưa xử lý (cho chuông thông báo)
   */
  async countUnresolved({ deviceId = null, ownerId = null } = {}) {
    let sql = `
      SELECT COUNT(*) as unread_count 
      FROM alerts a
      JOIN devices d ON a.device_id = d.id
      WHERE a.is_resolved = 0
    `;
    const params = [];

    if (deviceId) {
      sql += ` AND a.device_id = ?`;
      params.push(Number(deviceId));
    }

    if (ownerId) {
      sql += ` AND d.owner_id = ?`;
      params.push(Number(ownerId));
    }

    const [rows] = await pool.query(sql, params);
    return rows[0]?.unread_count || 0;
  }

  /**
   * Tìm cảnh báo theo ID kèm owner_id của trạm đo
   */
  async findById(id) {
    const [rows] = await pool.query(
      `SELECT a.id, a.device_id, a.is_resolved, d.owner_id
       FROM alerts a
       JOIN devices d ON a.device_id = d.id
       WHERE a.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  /**
   * Đánh dấu đã đọc / đã xử lý một cảnh báo cụ thể (UC-13 Step 1, 3)
   */
  async resolve(id, actionTaken = 'Đã kiểm tra và xử lý') {
    const [result] = await pool.query(
      `UPDATE alerts 
       SET is_read = 1, is_resolved = 1, resolved_at = NOW(), action_taken = ?
       WHERE id = ?`,
      [actionTaken, id]
    );
    return result.affectedRows > 0;
  }

  /**
   * Đánh dấu đã đọc toàn bộ cảnh báo (UC-13 Step 1a, 3)
   */
  async resolveAll({ deviceId = null, ownerId = null } = {}) {
    let sql = `
      UPDATE alerts a
      JOIN devices d ON a.device_id = d.id
      SET a.is_read = 1, a.is_resolved = 1, a.resolved_at = NOW(), a.action_taken = 'Xác nhận toàn bộ'
      WHERE a.is_resolved = 0
    `;
    const params = [];

    if (deviceId) {
      sql += ` AND a.device_id = ?`;
      params.push(Number(deviceId));
    }

    if (ownerId) {
      sql += ` AND d.owner_id = ?`;
      params.push(Number(ownerId));
    }

    const [result] = await pool.query(sql, params);
    return result.affectedRows;
  }
}
